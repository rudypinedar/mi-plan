/**
 * Mi plan — puente entre la app y el Google Sheet privado.
 *
 * Se instala como script del propio Sheet (Extensiones → Apps Script) y se
 * publica como aplicación web. Este archivo NO tiene claves: viven en
 * Configuración del proyecto → Propiedades del script:
 *   CLAVE_APP      leer y guardar todo (la usa la app en el teléfono)
 *   CLAVE_INGRESO  solo agrega movimientos "por clasificar" (Atajos, Gmail)
 *
 * Todas las peticiones son POST con un JSON en el cuerpo:
 *   { accion: "leer",     clave }
 *   { accion: "guardar",  clave, version, plan, clasificados? }
 *   { accion: "ingresar", clave, texto, origen? }
 *   { accion: "revisarCorreo", clave }   revisa Gmail ahora
 *   { accion: "activarCorreo", clave }   revisa Gmail cada 15 minutos
 *   { accion: "calendario", clave }      actualiza el calendario "Mi plan · pagos"
 *   { accion: "estadosAnteriores", clave, dias }   guarda los estados de cuenta viejos y sus PDF
 *   { accion: "cambiarClaveIngreso", clave, nueva }   (solo con CLAVE_APP)
 *   { accion: "instalar", token, claveApp, claveIngreso }
 *       solo funciona si Rudy puso a mano TOKEN_INSTALACION en Propiedades del
 *       script y todavía no hay claves; el token se borra al usarlo.
 * y la respuesta siempre es JSON: { ok: true, ... } o { ok: false, error }.
 *
 * Ver docs/SHEET.md para la estructura de cada pestaña.
 */

var MAX_PETICION = 8000000;    // caracteres: un plan normal pesa mucho menos
var MAX_PATRON = 60;          // largo máximo de los patrones de "diasPago"
var TAM_CELDA = 45000;         // Sheets acepta 50,000 caracteres por celda

var PESTANAS = {
  config:         ['clave', 'valor'],
  deudas:         ['id', 'nombre', 'tipo', 'saldo', 'tasa', 'cuota', 'paga_con', 'dia_pago', 'ultimos4', 'cerrada', 'datos'],
  fondos:         ['id', 'nombre', 'saldo', 'meta', 'datos'],
  recurrentes:    ['id', 'nombre', 'categoria', 'paga_con', 'sobre', 'datos'],
  puntuales:      ['id', 'mes', 'nombre', 'tipo', 'monto', 'datos'],
  fechas:         ['id', 'mes', 'dia', 'nombre', 'monto', 'datos'],
  meses:          ['mes', 'cerrado', 'deuda_inicio', 'deuda_cierre', 'datos'],
  movimientos:    ['mes', 'nombre', 'categoria', 'tipo', 'paga_con', 'monto', 'pagado', 'monto_pagado', 'deuda', 'fondo'],
  por_clasificar: ['id', 'recibido', 'origen', 'fecha', 'monto', 'comercio', 'tarjeta', 'estado', 'asignado_a', 'nota', 'huella'],
  estados_cuenta: ['recibido', 'banco', 'tarjeta', 'fecha_corte', 'fecha_pago', 'pago_minimo', 'pago_contado', 'huella', 'archivo'],
  bitacora:       ['fecha', 'origen', 'accion', 'detalle']
};

// Listas del plan que van cada una en su pestaña (el resto va a config)
var LISTAS = { debts: 'deudas', funds: 'fondos', recurring: 'recurrentes', oneoffs: 'puntuales', fechas: 'fechas' };

// ---------------------------------------------------------------- entrada

function doGet() {
  return json_({ ok: true });
}

function doPost(e) {
  var cuerpo = (e && e.postData && e.postData.contents) || '{}';
  if (cuerpo.length > MAX_PETICION) return json_({ ok: false, error: 'La petición es demasiado grande' });
  var p;
  // Las apps de Android (MacroDroid, Tasker) y los Atajos de iPhone pueden mandar
  // un formulario simple (accion=…&clave=…&texto=…): así el texto del SMS no rompe el JSON.
  var tipo = String((e && e.postData && e.postData.type) || '');
  var qp = (e && e.parameter) || {};
  if (/x-www-form-urlencoded/i.test(tipo) && e.parameter) p = { accion: e.parameter.accion, clave: e.parameter.clave, texto: e.parameter.texto, origen: e.parameter.origen };
  // También: ?accion=ingresar&clave=…&origen=sms en la dirección y el SMS tal cual en el cuerpo
  // (texto plano). Así ningún símbolo del mensaje (& = + %) lo puede romper.
  else if (qp.accion === 'ingresar' && qp.clave) p = { accion: 'ingresar', clave: qp.clave, origen: qp.origen || 'sms', texto: cuerpo };
  else { try { p = JSON.parse(cuerpo); } catch (err) { return json_({ ok: false, error: 'La petición no es un JSON válido' }); } }
  if (!p || typeof p !== 'object' || Array.isArray(p)) return json_({ ok: false, error: 'La petición no es válida' });

  if (p.accion === 'instalar') return json_(conCandado_(function () { return instalar_(p); }));

  var acceso = revisarClave_(p.clave, p.accion);
  if (!acceso.ok) return json_(acceso);

  try {
    if (p.accion === 'leer') return json_(leer_());
    if (p.accion === 'guardar') return json_(conCandado_(function () { return guardar_(p); }));
    if (p.accion === 'ingresar') return json_(conCandado_(function () { return ingresar_(p); }));
    if (p.accion === 'revisarCorreo') return json_(revisarCorreo());
    if (p.accion === 'correosSinReconocer') return json_(correosSinReconocer(Number(p.dias) || 3));
    if (p.accion === 'activarCorreo') return json_(activarCorreo());
    if (p.accion === 'calendario') return json_(sincronizarCalendario());
    if (p.accion === 'respaldo') return json_(respaldoDiario());
    if (p.accion === 'cambiarClaveIngreso') return json_(cambiarClaveIngreso_(p));
    if (p.accion === 'estadosAnteriores') return json_(estadosAnteriores(Number(p.dias) || 90));
    if (p.accion === 'bitacora') return json_({ ok: true, filas: leerTabla_('bitacora').slice(-Math.min(Number(p.n) || 20, 100)) });
    return json_({ ok: false, error: 'Acción desconocida' });
  } catch (err) {
    anotar_('app', 'error', String(err && err.message || err));
    return json_({ ok: false, error: 'Algo falló en el servidor: ' + (err && err.message || err) });
  }
}

// ---------------------------------------------------------------- instalación remota

// Solo funciona si Rudy puso a mano TOKEN_INSTALACION en Propiedades del script
// y todavía no hay claves. El token se borra al usarlo (sirve una sola vez).
function instalar_(p) {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('TOKEN_INSTALACION');
  if (!token || props.getProperty('CLAVE_APP') || !iguales_(p.token, token)) return { ok: false, error: 'Clave incorrecta' };
  var app = String(p.claveApp || ''), ing = String(p.claveIngreso || '');
  if (app.length < 24 || ing.length < 24 || app === ing) return { ok: false, error: 'Las claves deben ser distintas y de al menos 24 caracteres' };
  props.setProperties({ CLAVE_APP: app, CLAVE_INGRESO: ing });
  props.deleteProperty('TOKEN_INSTALACION');
  configurar();
  anotar_('instalacion', 'instalar', 'Claves guardadas y pestañas creadas');
  return { ok: true };
}

// ---------------------------------------------------------------- acceso

// Una clave correcta SIEMPRE entra: no hay bloqueo por intentos (con claves
// aleatorias de 32 caracteres no aporta nada y permitiría dejar fuera a Rudy).
// Las incorrectas solo se anotan en la bitácora, máximo una fila cada 10 minutos.
function revisarClave_(clave, accion) {
  var props = PropertiesService.getScriptProperties();
  var app = props.getProperty('CLAVE_APP'), ing = props.getProperty('CLAVE_INGRESO');
  var esApp = !!app && iguales_(clave, app);
  var esIngreso = !!ing && iguales_(clave, ing);
  if (esApp || (esIngreso && accion === 'ingresar')) return { ok: true };
  try {
    var cache = CacheService.getScriptCache();
    if (!cache.get('FALLO_ANOTADO')) { cache.put('FALLO_ANOTADO', '1', 600); anotar_('seguridad', 'clave incorrecta', 'Petición rechazada (acción: ' + String(accion || '').slice(0, 20).replace(/[^\w]/g, '') + ')'); }
  } catch (_) {}
  return { ok: false, error: 'Clave incorrecta' };
}

// Cambia la clave de ingreso (la de Atajos y MacroDroid). Solo con CLAVE_APP:
// la de ingreso no puede cambiarse a sí misma (revisarClave_ no la deja pasar aquí).
function cambiarClaveIngreso_(p) {
  var props = PropertiesService.getScriptProperties();
  var nueva = String(p.nueva || '');
  if (nueva.length < 24 || !/^[A-Za-z0-9_-]+$/.test(nueva) || iguales_(nueva, props.getProperty('CLAVE_APP'))) return { ok: false, error: 'La clave nueva debe tener al menos 24 letras, números, _ o -, y ser distinta a la de la app' };
  props.setProperty('CLAVE_INGRESO', nueva);
  anotar_('seguridad', 'clave de ingreso', 'Se cambió la clave de ingreso');
  return { ok: true };
}

// Compara sin cortar en la primera diferencia
function iguales_(a, b) {
  a = String(a || ''); b = String(b || '');
  var d = a.length ^ b.length;
  for (var i = 0; i < Math.max(a.length, b.length); i++) d |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return d === 0 && a.length > 0;
}

function conCandado_(fn) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) return { ok: false, error: 'El Sheet está ocupado. Intenta de nuevo.' };
  try { return fn(); } finally { lock.releaseLock(); }
}

// ---------------------------------------------------------------- leer

function leer_() {
  var tablas = {};
  for (var nombre in PESTANAS) tablas[nombre] = leerTabla_(nombre);
  var r = filasAPlan(tablas);
  return {
    ok: true, version: r.version, actualizado: r.actualizado, plan: r.plan,
    porClasificar: tablas.por_clasificar.filter(function (f) { return f.estado === 'pendiente'; }),
    estadosCuenta: tablas.estados_cuenta.slice(-24)
  };
}

// ---------------------------------------------------------------- guardar

var ESTADOS_CLASIFICADO = { asignado: true, descartado: true };

// Revisa que el plan tenga la forma esperada antes de tocar el Sheet
function planValido_(plan) {
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) return 'Falta el plan';
  if (!plan.months || typeof plan.months !== 'object' || Array.isArray(plan.months)) return 'El plan no tiene meses';
  var listas = ['debts', 'funds', 'recurring', 'oneoffs'];
  for (var i = 0; i < listas.length; i++) if (!Array.isArray(plan[listas[i]])) return 'El plan no es válido (' + listas[i] + ')';
  if (plan.fechas != null && !Array.isArray(plan.fechas)) return 'El plan no es válido (fechas)';
  for (var k in plan.months) if (!/^\d{4}-\d{2}$/.test(k) || !plan.months[k] || !Array.isArray(plan.months[k].items)) return 'El plan no es válido (mes ' + String(k).slice(0, 10) + ')';
  return '';
}

function guardar_(p) {
  var malo = planValido_(p.plan);
  if (malo) return { ok: false, error: malo };
  if (p.clasificados != null && !Array.isArray(p.clasificados)) return { ok: false, error: 'clasificados no es una lista' };
  var cfg = leerTabla_('config');
  var actual = Number(valorConfig_(cfg, '_version') || 0);
  if (!p.forzar && Number(p.version || 0) !== actual) {
    // Alguien guardó antes (otro teléfono): la app debe leer, mezclar y volver a guardar
    return { ok: false, conflicto: true, version: actual, error: 'Hay una versión más nueva en el Sheet' };
  }
  var nueva = actual + 1, ahora = new Date().toISOString();
  var t = planAFilas(p.plan);
  ['deudas', 'fondos', 'recurrentes', 'puntuales', 'fechas', 'meses', 'movimientos'].forEach(function (n) { escribirTabla_(n, t[n]); });
  t.config.push({ clave: '_version', valor: nueva }, { clave: '_actualizado', valor: ahora });
  escribirTabla_('config', t.config); // config al final: si algo falla antes, la versión no cambia

  if (p.clasificados && p.clasificados.length) marcarClasificados_(p.clasificados);
  PropertiesService.getScriptProperties().setProperty('CALENDARIO_PENDIENTE', '1');
  anotar_('app', 'guardar', 'Versión ' + nueva);
  return { ok: true, version: nueva, actualizado: ahora };
}

function marcarClasificados_(lista) {
  var hoja = hoja_('por_clasificar');
  var datos = hoja.getDataRange().getValues();
  var col = PESTANAS.por_clasificar;
  var iId = col.indexOf('id'), iEst = col.indexOf('estado'), iA = col.indexOf('asignado_a');
  var porId = {};
  lista.slice(0, 500).forEach(function (x) {
    if (!x || typeof x.id !== 'string' || !ESTADOS_CLASIFICADO[x.estado]) return;
    porId[x.id] = { estado: x.estado, asignado_a: String(x.asignado_a || '').slice(0, 80) };
  });
  for (var r = 1; r < datos.length; r++) {
    var x = Object.prototype.hasOwnProperty.call(porId, datos[r][iId]) ? porId[datos[r][iId]] : null; if (!x) continue;
    hoja.getRange(r + 1, iEst + 1).setNumberFormat('@').setValue(celda_(x.estado));
    hoja.getRange(r + 1, iA + 1).setNumberFormat('@').setValue(celda_(x.asignado_a));
  }
}

// ---------------------------------------------------------------- ingresar

function ingresar_(p) {
  var texto = String(p.texto || '').slice(0, 3000);
  if (!texto.trim()) return { ok: false, error: 'Falta el texto del mensaje' };
  return agregarMovimiento_(texto, String(p.origen || 'sms').slice(0, 20));
}

// Interpreta un aviso (SMS o correo) y lo deja en por_clasificar sin duplicar.
// Una misma compra puede llegar por dos avisos distintos (por ejemplo, los dos
// correos de BAC): si coincide tarjeta, monto y día pero el formato es otro, es
// la misma compra. Si el formato es el mismo y la hora cambia, es otra compra.
function agregarMovimiento_(texto, origen) {
  var m = interpretar(texto);
  if (m.ok && m.ignorar) { anotar_(origen, 'ignorado', m.motivo + ' · ' + limpiarTexto(texto)); return { ok: true, ignorado: m.motivo }; }
  // Lo no interpretado (por ejemplo un código reenviado por error) no se guarda: solo una huella cifrada
  var huella = m.ok ? [m.tarjeta, m.monto, m.fecha, m.formato].join('|') : 'txt|' + resumen_(texto.replace(/\s+/g, ' ').trim());
  var dia = m.ok ? String(m.fecha).slice(0, 10) : '';
  var dup = leerTabla_('por_clasificar').some(function (f) {
    if (f.huella === huella) return true;
    if (!m.ok) return false;
    var h = String(f.huella).split('|');
    return h.length === 4 && h[0] === m.tarjeta && Number(h[1]) === m.monto && h[2].slice(0, 10) === dia && h[3] !== m.formato;
  });
  if (dup) return { ok: true, duplicado: true };

  var fila = {
    id: Utilities.getUuid().slice(0, 8), recibido: new Date().toISOString(), origen: origen,
    fecha: m.fecha || '', monto: m.monto || '', comercio: m.comercio || '', tarjeta: m.tarjeta || '',
    estado: 'pendiente', asignado_a: '', nota: m.ok ? '' : 'sin interpretar', huella: huella
  };
  agregarFila_('por_clasificar', fila);
  anotar_(origen, 'ingresar', m.ok ? limpiarTexto(texto) : 'Aviso sin interpretar (texto no guardado)');
  return { ok: true, id: fila.id, interpretado: m.ok };
}

// ---------------------------------------------------------------- correo (Gmail)
// Se usa la API de Gmail con permiso de SOLO LECTURA: el script no puede enviar,
// borrar ni modificar correos. Para no repetir, recuerda los ids ya vistos.

// Solo se leen correos de estos remitentes. Se puede cambiar sin tocar el
// código con la propiedad BUSQUEDA_CORREO en Propiedades del script.
// Únicos remitentes aceptados (el dominio exacto o un subdominio). La lista es fija:
// no se puede ampliar desde Propiedades del script.
var BANCOS = ['baccredomatic.com', 'baccredomatic.sv', 'bancocuscatlan.com', 'sistemafedecredito.com', 'simaninternet.net'];
var BUSQUEDA_CORREO = 'from:(' + BANCOS.join(' OR ') + ') newer_than:3d';
var MAX_VISTOS = 300;

// Busca avisos de compra y estados de cuenta en Gmail. Las compras van a
// por_clasificar; los estados de cuenta, a estados_cuenta. Lo demás (transferencias,
// promociones, códigos) se ignora.
function revisarCorreo() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) return { ok: false, error: 'Ocupado' };
  try {
    var props = PropertiesService.getScriptProperties();
    var q = props.getProperty('BUSQUEDA_CORREO') || BUSQUEDA_CORREO;
    // Primera vez: solo se toma nota de lo que ya está en el correo (esas compras
    // ya se anotaron a mano). Desde ahí entran solo las nuevas.
    var inicial = props.getProperty('CORREOS_VISTOS') == null;
    var vistos = JSON.parse(props.getProperty('CORREOS_VISTOS') || '[]');
    var yaVisto = {}; vistos.forEach(function (id) { yaVisto[id] = true; });
    var r = { ok: true, inicial: inicial, revisados: 0, compras: 0, duplicados: 0, estados: 0, ignorados: 0, anteriores: 0, sinVerificar: 0 };
    var lista = Gmail.Users.Messages.list('me', { q: q, maxResults: 50 }).messages || [];
    lista.reverse().forEach(function (ref) {
      if (yaVisto[ref.id]) return;
      yaVisto[ref.id] = true; vistos.push(ref.id); r.revisados++;
      var c = correo_(ref.id);
      if (!c.verificado) { r.sinVerificar++; anotar_('correo', 'sin verificar', 'Remitente que no pasa la verificación del banco: ' + c.dominio); return; }
      if (interpretar(c.texto).ok) {
        if (inicial) { r.anteriores++; return; }
        var x = agregarMovimiento_(c.texto, 'correo');
        if (x.duplicado) r.duplicados++; else if (x.ignorado) r.ignorados++; else r.compras++;
        return;
      }
      if (procesarEstado_(c)) { r.estados++; return; }
      r.ignorados++;
      // Se anota para poder reconocer formatos nuevos (por ejemplo, avisos de débito).
      // Solo si menciona un monto y no es publicidad, para no llenar la bitácora.
      if (/(USD|\$)\s?\d/.test(c.texto) && !/no visualiza bien|promoci|OFF\b/i.test(c.texto))
        anotar_('correo', 'sin reconocer', c.dominio + ' · ' + limpiarTexto(c.texto, 300));
    });
    props.setProperty('CORREOS_VISTOS', JSON.stringify(vistos.slice(-MAX_VISTOS)));
    props.setProperty('CORREO_ULTIMA', new Date().toISOString());
    if (r.compras || r.estados) anotar_('correo', 'revisar', JSON.stringify(r));
    if (r.estados) props.setProperty('CALENDARIO_PENDIENTE', '1');
    // El calendario se actualiza si hubo cambios o una vez al día
    var hoy = Utilities.formatDate(new Date(), 'America/El_Salvador', 'yyyy-MM-dd');
    if (props.getProperty('RESPALDO_DIA') !== hoy) {
      try { r.respaldo = respaldoDiario(); } catch (err) { anotar_('respaldo', 'error', String(err && err.message || err)); }
    }
    if (props.getProperty('CALENDARIO_PENDIENTE') === '1' || props.getProperty('CALENDARIO_DIA') !== hoy) {
      try { r.calendario = sincronizarCalendario(); } catch (err) { anotar_('calendario', 'error', String(err && err.message || err)); }
    }
    return r;
  } finally { lock.releaseLock(); }
}

// Solo lectura: correos de los bancos de los últimos días que no se reconocieron
// como compra ni como estado de cuenta. Sirve para agregar formatos nuevos.
function correosSinReconocer(dias) {
  var props = PropertiesService.getScriptProperties();
  var q = String(props.getProperty('BUSQUEDA_CORREO') || BUSQUEDA_CORREO).replace(/\s*newer_than:\S+/, '') + ' newer_than:' + Math.min(Math.max(dias || 3, 1), 30) + 'd';
  var lista = Gmail.Users.Messages.list('me', { q: q, maxResults: 50 }).messages || [];
  var out = [];
  lista.forEach(function (ref) {
    var c = correo_(ref.id);
    if (interpretar(c.texto).ok || interpretarEstado(c.texto).ok) return;
    out.push({ fecha: c.fecha.toISOString(), dominio: c.dominio, verificado: c.verificado, texto: limpiarTexto(c.texto, 600) });
  });
  return { ok: true, correos: out };
}

// Verifica el remitente con los encabezados del correo (función pura, se prueba en Node):
// - la dirección real es la de dentro de <...> (no el nombre visible);
// - su dominio tiene que ser uno de BANCOS o un subdominio;
// - el primer Authentication-Results que escribe Gmail ("mx.google.com;") tiene que
//   decir dmarc=pass con header.from igual a ese dominio. Los de abajo los puede
//   escribir quien manda el correo, así que no se miran.
function verificarRemitente_(encabezados, bancos) {
  var de = '', auth = null;
  (encabezados || []).forEach(function (x) {
    var n = String(x && x.name || '').toLowerCase(), v = String(x && x.value || '');
    if (n === 'from' && !de) de = v;
    if (n === 'authentication-results' && auth === null && /^\s*mx\.google\.com;/i.test(v)) auth = v.toLowerCase();
  });
  var angulos = de.match(/<([^<>]*)>\s*$/);
  var direccion = (angulos ? angulos[1] : de).trim().toLowerCase();
  var partes = direccion.match(/^[^@\s<>"]+@([a-z0-9-]+(?:\.[a-z0-9-]+)+)$/);
  var dominio = partes ? partes[1] : '';
  var banco = dominio && (bancos || []).filter(function (b) { return dominio === b || dominio.slice(-(b.length + 1)) === '.' + b; })[0];
  var dmarc = auth && auth.match(/\bdmarc=pass\b[^;]*?\bheader\.from=([a-z0-9.-]+)/);
  return { de: de, dominio: dominio, verificado: !!(banco && dmarc && dmarc[1] === dominio) };
}

// Lee un correo con la API de Gmail: asunto + texto plano, remitente, adjuntos
// y si pasó la verificación de remitente (ver verificarRemitente_).
function correo_(id) {
  var m = Gmail.Users.Messages.get('me', id, { format: 'full' });
  var encabezados = (m.payload && m.payload.headers) || [];
  var h = {}; encabezados.forEach(function (x) { var n = String(x.name).toLowerCase(); if (!(n in h)) h[n] = String(x.value); });
  var rem = verificarRemitente_(encabezados, BANCOS);
  var de = rem.de, dominio = rem.dominio, verificado = rem.verificado;
  var planos = [], html = [], adjuntos = [];
  (function recorrer(parte) {
    if (!parte) return;
    if (parte.filename && parte.body && parte.body.attachmentId) adjuntos.push({ nombre: parte.filename, tipo: parte.mimeType, id: parte.body.attachmentId });
    else if (parte.body && parte.body.data) (parte.mimeType === 'text/html' ? html : planos).push(decodificar_(parte.body.data));
    (parte.parts || []).forEach(recorrer);
  })(m.payload);
  var cuerpo = planos.join(' ');
  if (cuerpo.length < 20) cuerpo = html.join(' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
  return { id: id, de: de, dominio: dominio, asunto: h['subject'] || '', fecha: new Date(Number(m.internalDate) || Date.now()), verificado: !!verificado,
    adjuntos: adjuntos, texto: (h['subject'] || '') + ' · ' + cuerpo.replace(/\s+/g, ' ').trim() }; // Credisiman pone la fecha en el asunto
}

function decodificar_(datos) {
  return Utilities.newBlob(bytes64_(datos)).getDataAsString('UTF-8');
}

// El servicio de Gmail de Apps Script puede entregar los datos ya decodificados
// (lista de bytes) o como base64 "web safe" sin el relleno final (=), que
// base64DecodeWebSafe exige. Acepta las dos formas.
function bytes64_(datos) {
  if (datos && typeof datos !== 'string') return datos;
  var t = String(datos || '').replace(/[^A-Za-z0-9_-]/g, '');
  while (t.length % 4) t += '=';
  return Utilities.base64DecodeWebSafe(t);
}

// Estado de cuenta: guarda sus datos (si vienen en el cuerpo) y el PDF en Drive.
// Devuelve true si el correo era un estado de cuenta.
function procesarEstado_(c) {
  var e = interpretarEstado(c.texto);
  var esEstado = e.ok || /estado de cuenta/i.test(c.texto.slice(0, 500));
  if (!esEstado) return false;
  var banco = /cuscatlan/i.test(c.de) ? 'Cuscatlán' : /fedecredito/i.test(c.de) ? 'Fedecrédito' : /siman/i.test(c.de) ? 'Credisiman' : /bac/i.test(c.de) ? 'BAC' : '';
  var huella = e.ok ? [e.tarjeta, e.fecha_corte].join('|') : 'correo|' + c.id;
  var previo = null;
  leerTabla_('estados_cuenta').forEach(function (f) { if (f.huella === huella) previo = f; });
  if (previo && previo.archivo) return true;
  var archivo = '';
  try { archivo = guardarPdf_(c, banco, e); } catch (err) { anotar_('drive', 'error', String(err && err.message || err)); }
  if (previo) { if (archivo) completarArchivo_(huella, archivo); return true; }
  agregarFila_('estados_cuenta', { recibido: new Date().toISOString(), banco: banco, tarjeta: e.tarjeta || '', fecha_corte: e.fecha_corte || '',
    fecha_pago: e.fecha_pago || '', pago_minimo: e.pago_minimo == null ? '' : e.pago_minimo, pago_contado: e.pago_contado == null ? '' : e.pago_contado, huella: huella, archivo: archivo });
  return true;
}

function completarArchivo_(huella, archivo) {
  var hoja = hoja_('estados_cuenta'), v = hoja.getDataRange().getValues(), col = PESTANAS.estados_cuenta;
  for (var r = 1; r < v.length; r++) if (v[r][col.indexOf('huella')] === huella) { hoja.getRange(r + 1, col.indexOf('archivo') + 1).setNumberFormat('@').setValue(celda_(archivo)); return; }
}

// Guarda los PDF adjuntos en "Mi plan · Estados de cuenta / AAAA-MM" con la API de
// Drive y permiso drive.file (el script solo ve los archivos que él mismo crea).
// Devuelve el enlace del primero.
function guardarPdf_(c, banco, e) {
  var pdfs = c.adjuntos.filter(function (a) { return /pdf/i.test(a.tipo) || /\.pdf$/i.test(a.nombre); });
  if (!pdfs.length) return '';
  var mes = (e.fecha_corte || Utilities.formatDate(c.fecha, 'America/El_Salvador', 'yyyy-MM-dd')).slice(0, 7);
  var carpeta = subcarpeta_(carpetaEstados_(), mes);
  var enlace = '';
  pdfs.forEach(function (a, i) {
    var nombre = [e.fecha_corte || mes, banco, e.tarjeta ? '····' + e.tarjeta : ''].filter(String).join(' ') + (i ? ' (' + (i + 1) + ')' : '') + '.pdf';
    var ya = buscarEnDrive_(nombre, carpeta, false);
    if (ya) { if (!enlace) enlace = ya.webViewLink || ''; return; }
    var datos = Gmail.Users.Messages.Attachments.get('me', c.id, a.id).data;
    var blob = Utilities.newBlob(bytes64_(datos), 'application/pdf', nombre);
    var f = Drive.Files.create({ name: nombre, parents: [carpeta], mimeType: 'application/pdf' }, blob, { fields: 'id,webViewLink' });
    if (!enlace) enlace = f.webViewLink || '';
  });
  return enlace;
}

var CARPETA = 'application/vnd.google-apps.folder';
function buscarEnDrive_(nombre, padre, esCarpeta) {
  var q = "name = '" + nombre.replace(/'/g, "\\'") + "' and trashed = false" + (padre ? " and '" + padre + "' in parents" : '') + (esCarpeta ? " and mimeType = '" + CARPETA + "'" : '');
  var r = Drive.Files.list({ q: q, fields: 'files(id,webViewLink)', pageSize: 1 });
  return (r.files && r.files[0]) || null;
}
function carpetaEstados_() { return carpetaPropia_('CARPETA_ESTADOS_ID', 'Mi plan · Estados de cuenta'); }
function carpetaPropia_(propiedad, nombre) {
  var props = PropertiesService.getScriptProperties(), id = props.getProperty(propiedad);
  if (id) { try { var f = Drive.Files.get(id, { fields: 'id,trashed' }); if (f && !f.trashed) return id; } catch (_) {} }
  var c = Drive.Files.create({ name: nombre, mimeType: CARPETA }, null, { fields: 'id' });
  props.setProperty(propiedad, c.id);
  return c.id;
}
function subcarpeta_(padre, nombre) {
  var ya = buscarEnDrive_(nombre, padre, true);
  return ya ? ya.id : Drive.Files.create({ name: nombre, parents: [padre], mimeType: CARPETA }, null, { fields: 'id' }).id;
}

// Busca estados de cuenta de los últimos días y los guarda (sin duplicar).
// También completa el PDF de los que se guardaron sin él.
function estadosAnteriores(dias) {
  var q = 'from:(' + BANCOS.join(' OR ') + ') "estado de cuenta" has:attachment newer_than:' + Math.min(dias || 90, 365) + 'd';
  var n = 0;
  (Gmail.Users.Messages.list('me', { q: q, maxResults: 50 }).messages || []).forEach(function (ref) {
    var c = correo_(ref.id);
    if (c.verificado && procesarEstado_(c)) n++;
  });
  PropertiesService.getScriptProperties().setProperty('CALENDARIO_PENDIENTE', '1');
  return { ok: true, estados: n };
}

// Crea (una sola vez) el disparador que revisa el correo cada 15 minutos
function activarCorreo() {
  var ya = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'revisarCorreo'; });
  if (!ya) ScriptApp.newTrigger('revisarCorreo').timeBased().everyMinutes(15).create();
  var r = revisarCorreo();
  r.activado = true; r.yaEstaba = ya;
  return r;
}

// ---------------------------------------------------------------- respaldo diario

var MAX_RESPALDOS = 30;

// Una vez al día guarda el plan completo (JSON) en "Mi plan · Respaldos" y deja
// solo los últimos 30. Sirve para volver atrás si algo se daña.
function respaldoDiario() {
  var props = PropertiesService.getScriptProperties();
  var hoy = Utilities.formatDate(new Date(), 'America/El_Salvador', 'yyyy-MM-dd');
  var datos = leer_();
  var nombre = 'mi-plan-' + hoy + '.json';
  var carpeta = carpetaPropia_('CARPETA_RESPALDOS_ID', 'Mi plan · Respaldos');
  if (!buscarEnDrive_(nombre, carpeta, false)) {
    var blob = Utilities.newBlob(JSON.stringify({ version: datos.version, actualizado: datos.actualizado, plan: datos.plan }), 'application/json', nombre);
    Drive.Files.create({ name: nombre, parents: [carpeta], mimeType: 'application/json' }, blob, { fields: 'id' });
  }
  var viejos = (Drive.Files.list({ q: "'" + carpeta + "' in parents and trashed = false and name contains 'mi-plan-'", orderBy: 'name desc', fields: 'files(id,name)', pageSize: 100 }).files || []).slice(MAX_RESPALDOS);
  viejos.forEach(function (f) { Drive.Files.update({ trashed: true }, f.id); });
  props.setProperty('RESPALDO_DIA', hoy);
  return { ok: true, archivo: nombre, borrados: viejos.length };
}

// ---------------------------------------------------------------- calendario

var CALENDARIO = 'Mi plan · pagos';
var DIAS_CALENDARIO = 50;

// Borra y vuelve a crear los eventos de los próximos días en el calendario
// "Mi plan · pagos" (solo ese calendario; el personal no se toca).
function sincronizarCalendario() {
  var tablas = {}; ['config', 'deudas', 'fondos', 'recurrentes', 'puntuales', 'fechas', 'meses'].forEach(function (n) { tablas[n] = leerTabla_(n); });
  var plan = filasAPlan(tablas).plan;
  var hoy = Utilities.formatDate(new Date(), 'America/El_Salvador', 'yyyy-MM-dd');
  var eventos = eventosDelPlan(plan, leerTabla_('estados_cuenta'), hoy, DIAS_CALENDARIO);
  var cal = calendario_();
  var desde = new Date(hoy + 'T00:00:00'), hasta = new Date(desde.getTime() + (DIAS_CALENDARIO + 1) * 86400000);
  cal.getEvents(desde, hasta).forEach(function (ev) { ev.deleteEvent(); });
  eventos.forEach(function (e) {
    var f = e.fecha.split('-').map(Number);
    var ev = cal.createAllDayEvent(e.titulo, new Date(f[0], f[1] - 1, f[2]), { description: e.detalle });
    ev.removeAllReminders();
    (e.avisos || []).forEach(function (min) { ev.addPopupReminder(min); });
  });
  var props = PropertiesService.getScriptProperties();
  props.setProperties({ CALENDARIO_PENDIENTE: '0', CALENDARIO_DIA: hoy });
  return { ok: true, eventos: eventos.length };
}

function calendario_() {
  var props = PropertiesService.getScriptProperties(), id = props.getProperty('CALENDARIO_ID');
  var cal = id ? CalendarApp.getCalendarById(id) : null;
  if (!cal) {
    cal = CalendarApp.createCalendar(CALENDARIO, { color: CalendarApp.Color.GREEN, summary: 'Pagos y cortes de tarjeta de Mi plan. Se actualiza solo.' });
    props.setProperty('CALENDARIO_ID', cal.getId());
  }
  return cal;
}

// Función pura (se prueba en Node): qué eventos debe tener el calendario.
// - Un evento por cada forma de pago y fecha con pagos pendientes. Avisos 2 días y 1 día antes (9 a. m.).
// - Un evento en cada fecha de corte de las tarjetas con saldo: "compras grandes, mejor desde mañana".
function eventosDelPlan(plan, estados, hoy, dias) {
  var fin = sumarDias_(hoy, dias), out = [];
  var r2 = function (x) { return Math.round((x + 1e-9) * 100) / 100; };
  var usd = function (n) { return '$' + r2(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ','); };
  var etq = function (k) { var e = plan.etiquetas && plan.etiquetas.pagos && plan.etiquetas.pagos[k]; return (e && e.nombre) || k; };
  var meses = Object.keys(plan.months || {}).sort().filter(function (k) { return k >= (plan.current || ''); });
  var grupos = {};
  meses.forEach(function (k) {
    (plan.months[k].items || []).forEach(function (it) {
      if (it.source !== 'salary' || it.envelope || it.paid || it.autoPaid || !(it.amount > 0)) return;
      var dia = diaDePago_(plan, it); if (!dia) return;
      var fecha = fechaDePago_(k, dia);
      if (fecha < hoy || fecha > fin) return;
      var clave = fecha + '|' + (it.payWith || it.name);
      var g = grupos[clave] = grupos[clave] || { fecha: fecha, pw: it.payWith || '', items: [], fuentes: {} };
      if (it.payWith !== 'Cuenta de impuestos') g.fuentes[fuenteDePago_(plan, it, dia)] = 1;
      g.items.push(it);
    });
  });
  Object.keys(grupos).sort().forEach(function (c) {
    var g = grupos[c], total = g.items.reduce(function (a, i) { return a + i.amount; }, 0);
    var quien = g.pw ? etq(g.pw) : g.items[0].name;
    var fs = Object.keys(g.fuentes);
    out.push({ fecha: g.fecha, titulo: 'Pagar ' + quien + ' · ' + usd(total) + (fs.length === 1 ? ' · pago del ' + fs[0] : ''),
      detalle: g.items.map(function (i) { return '• ' + i.name + ': ' + usd(i.amount); }).join('\n') + '\n\nMárcalo como pagado en Mi plan.', avisos: [2340, 900] });
  });
  // Cortes de tarjeta: día de corte del plan (d.cut) o el del último estado de cuenta
  (plan.debts || []).forEach(function (d) {
    if (d.kind !== 'card' || d.closed) return;
    var dia = Number(d.cut) || 0;
    if (!dia && d.digits) {
      var ult = (estados || []).filter(function (e) { return String(e.tarjeta) === String(d.digits) && e.fecha_corte; }).map(function (e) { return String(e.fecha_corte); }).sort().pop();
      if (ult) dia = Number(ult.slice(8, 10));
    }
    if (!dia) return;
    var f = proximoDia_(hoy, dia);
    while (f <= fin) {
      out.push({ fecha: f, titulo: 'Corte de ' + d.name + ' · compras grandes, mejor desde mañana',
        detalle: 'Lo que compres desde mañana entra en el siguiente estado de cuenta: lo pagas más tarde y sin intereses.', avisos: [900] });
      f = proximoDia_(sumarDias_(f, 1), dia);
    }
  });
  return out.sort(function (a, b) { return a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0; });
}

// Día de pago de un ítem: el suyo, el de su destino (config "diasPago") o el de la tarjeta con que se paga
function diaDePago_(plan, it) {
  if (it.due) return Number(it.due);
  var dp = plan.diasPago || {};
  if (dp.pagos && dp.pagos[it.payWith]) return Number(dp.pagos[it.payWith]);
  var nombres = dp.nombres || [];
  for (var i = 0; i < nombres.length; i++) {
    var patron = nombres[i] && nombres[i][0];
    // Solo texto corto: un patrón enorme o que no es texto se ignora
    if (typeof patron !== 'string' || !patron || patron.length > MAX_PATRON) continue;
    try { if (new RegExp(patron, 'i').test(String(it.name || ''))) return Number(nombres[i][1]); } catch (e) { /* patrón malo */ }
  }
  var t = (plan.debts || []).filter(function (d) { return d.kind === 'card' && !d.closed && d.payWith === it.payWith && d.due; })[0];
  return t ? Number(t.due) : 0;
}
// De qué ingreso sale (igual que en la app): "20" salario, "30" honorarios
function fuenteDePago_(plan, it, dia) {
  if (it.fuente) return it.fuente;
  var pref = plan.fuentesPref && plan.fuentesPref[it.recId || it.debtId || it.name]; if (pref) return pref;
  return it.recId === 'casa' || it.payWith === 'MAMÁ' || (dia >= 20 && dia < 30) ? '20' : '30';
}

// Mes del plan = del 20 al 19: los días 20–31 son del mismo mes; 1–19, del siguiente
function fechaDePago_(k, dia) {
  var y = Number(k.slice(0, 4)), m = Number(k.slice(5, 7));
  if (dia < 20) { m++; if (m > 12) { m = 1; y++; } }
  var ultimo = new Date(y, m, 0).getDate();
  return y + '-' + ('0' + m).slice(-2) + '-' + ('0' + Math.min(dia, ultimo)).slice(-2);
}
function sumarDias_(f, n) {
  var d = new Date(Date.UTC(Number(f.slice(0, 4)), Number(f.slice(5, 7)) - 1, Number(f.slice(8, 10)) + n));
  return d.toISOString().slice(0, 10);
}
function proximoDia_(desde, dia) {
  var y = Number(desde.slice(0, 4)), m = Number(desde.slice(5, 7));
  for (var i = 0; i < 3; i++) {
    var ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
    var f = y + '-' + ('0' + m).slice(-2) + '-' + ('0' + Math.min(dia, ultimo)).slice(-2);
    if (f >= desde) return f;
    m++; if (m > 12) { m = 1; y++; }
  }
  return '9999-12-31';
}

/** Se ejecuta UNA vez a mano en el editor para aceptar los permisos. */
function autorizar() {
  Gmail.Users.getProfile('me');
  ScriptApp.getProjectTriggers();
  calendario_();
  carpetaEstados_();
  Logger.log('Listo: permisos aceptados (Gmail solo lectura, calendario y Drive).');
}

// Lee avisos de compra de los bancos. Devuelve
// { ok, monto, comercio, fecha ('AAAA-MM-DD HH:MM'), tarjeta (últimos 4), formato }
// o { ok: true, ignorar: true, motivo } si es una compra rechazada.
function interpretar(texto) {
  var t = String(texto).replace(/\s+/g, ' ');
  var x, r;
  var listo = function (o) { o.ok = true; o.comercio = String(o.comercio).replace(/\s+/g, ' ').trim(); return o; };
  var rechazada = function (estado) { return /rechaz|denegad|declin/i.test(estado || ''); };

  // SMS Cuscatlán: "... Tarjeta de Credito Titular 1234 por USD88.32 en COMERCIO el 2026-11-08 15:17. ..."
  // (por correo dice "... tarjeta titular de Banco CUSCATLAN XXXXXXXXXX1234 por USD 39.95 en COMERCIO el día 2026-09-21 13:03.")
  x = t.match(/Tarjeta.*?(\d{4}) por USD\s?([\d,]+\.\d{2}) en (.+?) el (?:d[ií]a )?(\d{4}-\d{2}-\d{2})[ T](\d{1,2}:\d{2})/i);
  if (x) return listo({ tarjeta: x[1], monto: num_(x[2]), comercio: x[3], fecha: x[4] + ' ' + hora_(x[5]), formato: 'cusca-sms' });

  // SMS BAC: "... VISA 1234: has realizado una compra por USD 109.99 en el comercio: COMERCIO 2026/11/08 16:32:03 ..."
  x = t.match(/(\d{4}): has realizado una compra por USD\s?([\d,]+\.\d{2}) en el comercio:\s*(.+?)\s+(\d{4})\/(\d{2})\/(\d{2}) (\d{1,2}:\d{2})/i);
  if (x) return listo({ tarjeta: x[1], monto: num_(x[2]), comercio: x[3], fecha: x[4] + '-' + x[5] + '-' + x[6] + ' ' + hora_(x[7]), formato: 'bac-sms' });

  // Correo BAC "Alerta PRF": "... compra con tu tarjeta VISA terminada en 1234 Detalles del movimiento: Comercio Monto
  //   COMERCIO 1,240.19 Fecha y hora 2026/11/15-17:55:36 Tipo de la compra Estado Internet Aprobada"
  x = t.match(/terminada en (\d{4}).*?Comercio Monto (.+?) ([\d,]+\.\d{2}) Fecha y hora (\d{4})\/(\d{2})\/(\d{2})[- ](\d{1,2}:\d{2})(?::\d{2})?(?: Tipo de la compra Estado (\S+) (\S+))?/i);
  if (x) {
    if (rechazada(x[9])) return { ok: true, ignorar: true, motivo: 'compra rechazada' };
    return listo({ tarjeta: x[1], monto: num_(x[3]), comercio: x[2], fecha: x[4] + '-' + x[5] + '-' + x[6] + ' ' + hora_(x[7]), formato: 'bac-prf' });
  }

  // Correo BAC "Sistema de Alertas": "... con su tarjeta Visa 1234 Detalle de Transacciones Fecha Moneda Monto Comercio Estado
  //   17/11/26 00:00 Dólar 0.50 COMERCIO Aprobado"
  x = t.match(/tarjeta \S+ (\d{4}) Detalle de Transacciones .*?Estado (\d{2})\/(\d{2})\/(\d{2,4}) (\d{1,2}:\d{2}) (?:D[oó]lar(?:es)?|USD) ([\d,]+\.\d{2}) (.+?) (Aprobad[oa]|Rechazad[oa]|Denegad[oa])/i);
  if (x) {
    if (rechazada(x[8])) return { ok: true, ignorar: true, motivo: 'compra rechazada' };
    var anio = x[4].length === 2 ? '20' + x[4] : x[4];
    return listo({ tarjeta: x[1], monto: num_(x[6]), comercio: x[7], fecha: anio + '-' + x[3] + '-' + x[2] + ' ' + hora_(x[5]), formato: 'bac-alertas' });
  }
  // Correo Credisiman: asunto "..., notificación de movimiento en su tarjeta CREDISIMAN 08/11/2026" y cuerpo
  //   "su tarjeta *CREDISIMAN 1234* ha realizado *compra* por USD *$* *391.81* en *COMERCIO*." (sin hora)
  var sin = t.replace(/\*/g, '');
  x = sin.match(/CREDISIMAN (\d{4}) ha realizado (\S+) por USD\s*\$?\s*([\d,]+\.\d{2}) en (.+?)\.(?:\s|$)/i);
  if (x) {
    if (!/compra|consumo/i.test(x[2])) return { ok: true, ignorar: true, motivo: 'movimiento que no es compra (' + x[2] + ')' };
    var fd = sin.match(/CREDISIMAN (\d{2})\/(\d{2})\/(\d{4})/i);
    return listo({ tarjeta: x[1], monto: num_(x[3]), comercio: x[4], fecha: fd ? fd[3] + '-' + fd[2] + '-' + fd[1] + ' 00:00' : '', formato: 'credisiman' });
  }
  return { ok: false };
}

// Estado de cuenta en el cuerpo del correo (Cuscatlán):
// "Tarjeta Nº 000000******1234 Fecha de corte: 08/11/2026 Última fecha de pago: 03/12/2026 Pago mínimo: $96.69 Pago de contado: $225.48"
function interpretarEstado(texto) {
  var t = String(texto).replace(/\s+/g, ' ');
  var tj = t.match(/Tarjeta N[º°o]?\.?\s*([\d*Xx•]{8,})/i);
  if (tj) tj = [tj[0], tj[1].replace(/\D/g, '').slice(-4)];
  var corte = t.match(/Fecha de corte:?\s*(\d{2})\/(\d{2})\/(\d{4})/i);
  var pago = t.match(/(?:[ÚU]ltima )?fecha (?:l[ií]mite )?de pago:?\s*(\d{2})\/(\d{2})\/(\d{4})/i);
  var minimo = t.match(/Pago m[ií]nimo:?\s*\$?\s*([\d,]+\.\d{2})/i);
  var contado = t.match(/Pago de contado:?\s*\$?\s*([\d,]+\.\d{2})/i);
  var f = function (m) { return m[3] + '-' + m[2] + '-' + m[1]; };
  if (tj && corte && pago) return { ok: true, tarjeta: tj[1], fecha_corte: f(corte), fecha_pago: f(pago), pago_minimo: minimo ? num_(minimo[1]) : '', pago_contado: contado ? num_(contado[1]) : '' };
  // Credisiman: "tarjeta CREDISIMAN número XXXXXXXXXXXX1234 ... con fecha de corte 2026-11-13"
  var cs = t.match(/CREDISIMAN n[uú]mero [X*\d]*?(\d{4})\b.*?fecha de corte (\d{4})-(\d{2})-(\d{2})/i);
  if (cs) return { ok: true, tarjeta: cs[1], fecha_corte: cs[2] + '-' + cs[3] + '-' + cs[4], fecha_pago: '', pago_minimo: '', pago_contado: '' };
  return { ok: false };
}

function hora_(h) { return h.length === 4 ? '0' + h : h; }

// Quita teléfonos, enlaces y números largos antes de guardar el texto en la bitácora
function limpiarTexto(texto, max) {
  return String(texto)
    .replace(/https?:\/\/\S+/g, '[enlace]')
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[correo]')
    .replace(/\b\d{8,}\b/g, '[número]')
    .replace(/\b\d{4}[ -]?\d{4}[ -]?\d{4}[ -]?(\d{4})\b/g, '****$1')
    .replace(/\b\d{4,6}[*Xx•]{4,}(\d{4})\b/g, '****$1')
    .replace(/[*Xx•]{6,}(\d{4})\b/g, '****$1')
    .replace(/\b\d{4}-\d{4}\b/g, '[teléfono]')
    .replace(/(^|[^*\d])\d{4,7}\b/g, '$1[número]') // códigos, cuentas cortas, últimos 4 sueltos
    .slice(0, max || 500);
}

// SHA-256 en hexadecimal (para huellas de textos que no se guardan)
function resumen_(t) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(t), Utilities.Charset.UTF_8)
    .map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('');
}

function num_(s) { return Math.round(Number(String(s).replace(/,/g, '')) * 100) / 100; }

// ---------------------------------------------------------------- plan ⇄ filas
// Funciones puras (sin SpreadsheetApp) para poder probarlas en Node.

function planAFilas(plan) {
  var t = { config: [], deudas: [], fondos: [], recurrentes: [], puntuales: [], fechas: [], meses: [], movimientos: [] };
  Object.keys(plan).forEach(function (k) {
    if (LISTAS[k] || k === 'months' || !claveSegura_(k)) return; // _version, __proto__, etc. no se aceptan del cliente
    t.config.push({ clave: k, valor: JSON.stringify(plan[k]) });
  });
  (plan.debts || []).forEach(function (d) {
    t.deudas.push({ id: d.id, nombre: d.name, tipo: d.kind, saldo: d.balance, tasa: d.rate || 0, cuota: d.cuota || 0,
      paga_con: d.payWith || '', dia_pago: d.due || '', ultimos4: d.digits ? String(d.digits).slice(-4) : '', cerrada: !!d.closed, datos: d });
  });
  (plan.funds || []).forEach(function (f) {
    t.fondos.push({ id: f.id, nombre: f.name, saldo: f.balance, meta: f.target == null ? '' : f.target, datos: f });
  });
  (plan.recurring || []).forEach(function (r) {
    t.recurrentes.push({ id: r.id, nombre: r.name, categoria: r.cat || '', paga_con: r.payWith || '', sobre: !!r.envelope, datos: r });
  });
  (plan.oneoffs || []).forEach(function (o) {
    t.puntuales.push({ id: o.id, mes: o.month, nombre: o.name, tipo: o.type || 'gasto', monto: o.amount == null ? '' : o.amount, datos: o });
  });
  (plan.fechas || []).forEach(function (f) {
    t.fechas.push({ id: f.id, mes: f.m, dia: f.d, nombre: f.name, monto: f.amount, datos: f });
  });
  Object.keys(plan.months || {}).sort().forEach(function (k) {
    var m = plan.months[k];
    t.meses.push({ mes: k, cerrado: m.closed || '', deuda_inicio: m.debtStart == null ? '' : m.debtStart, deuda_cierre: m.debtEnd == null ? '' : m.debtEnd, datos: m });
    (m.items || []).forEach(function (it) {
      t.movimientos.push({ mes: k, nombre: it.name, categoria: it.cat || '', tipo: it.kind || '', paga_con: it.payWith || '',
        monto: it.amount, pagado: !!it.paid, monto_pagado: it.paidAmount == null ? '' : it.paidAmount, deuda: it.debtId || '', fondo: it.fundId || '' });
    });
  });
  // El objeto completo va en "datos" (JSON); las columnas visibles son para leer el Sheet a simple vista
  ['deudas', 'fondos', 'recurrentes', 'puntuales', 'fechas', 'meses'].forEach(function (n) {
    t[n].forEach(function (f) { f.datos = JSON.stringify(f.datos); });
  });
  return t;
}

function filasAPlan(tablas) {
  var plan = {}, version = 0, actualizado = '';
  (tablas.config || []).forEach(function (f) {
    if (f.clave === '_version') { version = Number(f.valor) || 0; return; }
    if (f.clave === '_actualizado') { actualizado = String(f.valor); return; }
    if (f.clave && claveSegura_(String(f.clave))) plan[f.clave] = parsear_(f.valor);
  });
  var lista = function (n) { return (tablas[n] || []).filter(function (f) { return f.datos; }).map(function (f) { return JSON.parse(f.datos); }); };
  plan.debts = lista('deudas');
  plan.funds = lista('fondos');
  plan.recurring = lista('recurrentes');
  plan.oneoffs = lista('puntuales');
  plan.fechas = lista('fechas');
  // Si Rudy corrige un saldo a mano en el Sheet, ese saldo manda
  (tablas.deudas || []).forEach(function (f, i) { if (f.datos && f.saldo !== '' && isFinite(f.saldo)) plan.debts[i].balance = Number(f.saldo); });
  (tablas.fondos || []).forEach(function (f, i) { if (f.datos && f.saldo !== '' && isFinite(f.saldo)) plan.funds[i].balance = Number(f.saldo); });
  plan.months = {};
  (tablas.meses || []).forEach(function (f) { if (f.datos) plan.months[f.mes] = JSON.parse(f.datos); });
  return { plan: plan, version: version, actualizado: actualizado };
}

// Claves que el cliente no puede escribir en config: las internas (_version,
// _actualizado) y las que cambiarían el prototipo de los objetos.
function claveSegura_(k) { return /^[A-Za-z][\w-]{0,60}$/.test(k) && ['constructor', 'prototype'].indexOf(k) < 0; }

function parsear_(v) { try { return JSON.parse(v); } catch (e) { return v; } }

// Parte un texto largo en pedazos que caben en una celda
function partir(texto) {
  var p = []; texto = String(texto);
  for (var i = 0; i < texto.length; i += TAM_CELDA) p.push(texto.slice(i, i + TAM_CELDA));
  return p.length ? p : [''];
}

// ---------------------------------------------------------------- hojas

var ENCABEZADOS_OK = {};
function hoja_(nombre) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var h = ss.getSheetByName(nombre);
  if (!h) { h = ss.insertSheet(nombre); h.appendRow(PESTANAS[nombre]); h.setFrozenRows(1); }
  else if (!ENCABEZADOS_OK[nombre]) {
    var col = PESTANAS[nombre], actual = h.getRange(1, 1, 1, col.length).getValues()[0];
    if (actual.join('|') !== col.join('|')) h.getRange(1, 1, 1, col.length).setValues([col]);
  }
  ENCABEZADOS_OK[nombre] = true;
  return h;
}

// Lee una pestaña como lista de objetos. La última columna ("datos") puede
// seguir en columnas sin título si el JSON no cabía en una celda.
function leerTabla_(nombre) {
  var col = PESTANAS[nombre], h = hoja_(nombre);
  var v = h.getDataRange().getValues();
  var iDatos = colLarga_(col);
  var out = [];
  for (var r = 1; r < v.length; r++) {
    var o = {};
    for (var c = 0; c < col.length; c++) o[col[c]] = desCelda_(v[r][c]);
    if (iDatos >= 0) o[col[iDatos]] = v[r].slice(iDatos).join('');
    if (col.some(function (k) { return o[k] !== '' && o[k] != null; })) out.push(o);
  }
  return out;
}

function escribirTabla_(nombre, filas) {
  var col = PESTANAS[nombre], h = hoja_(nombre);
  var iDatos = colLarga_(col);
  var valores = filas.map(function (f) {
    var fila = col.map(function (k) { return celda_(f[k]); });
    if (iDatos >= 0) fila = fila.slice(0, iDatos).concat(partir(f[col[iDatos]] == null ? '' : f[col[iDatos]])); // JSON: empieza con { o [
    return fila;
  });
  var ancho = Math.max(col.length, valores.reduce(function (a, f) { return Math.max(a, f.length); }, 0));
  valores = valores.map(function (f) { while (f.length < ancho) f.push(''); return f; });
  // Primero se escribe lo nuevo y después se limpia lo que sobra: si algo falla a
  // medias, la pestaña nunca queda vacía.
  if (valores.length) {
    if (h.getMaxColumns() < ancho) h.insertColumnsAfter(h.getMaxColumns(), ancho - h.getMaxColumns());
    if (h.getMaxRows() < valores.length + 1) h.insertRowsAfter(h.getMaxRows(), valores.length + 1 - h.getMaxRows());
    // Texto plano: evita que Sheets convierta "2026-11" en fecha y que algo se lea como fórmula
    h.getRange(2, 1, valores.length, ancho).setNumberFormat('@').setValues(valores);
  }
  var sobranCols = h.getMaxColumns() - ancho, sobranFilas = h.getMaxRows() - 1 - valores.length;
  if (valores.length && sobranCols > 0) h.getRange(2, ancho + 1, valores.length, sobranCols).clearContent();
  if (sobranFilas > 0) h.getRange(valores.length + 2, 1, sobranFilas, h.getMaxColumns()).clearContent();
}

// Texto seguro para una celda: lo que empieza con = + - @ se guarda con un
// apóstrofo delante para que Sheets nunca lo trate como fórmula. (Además todo se
// escribe con formato de texto.) Al leer, se quita ese apóstrofo.
function celda_(v) {
  var t = v == null ? '' : String(v);
  return /^[=+@]/.test(t) || /^-[^\d.]/.test(t) ? "'" + t : t;
}
function desCelda_(v) { return typeof v === 'string' && /^'[=+@-]/.test(v) ? v.slice(1) : v; }

// Columna que puede seguir en las columnas de la derecha si el texto es muy largo
function colLarga_(col) { var i = col.indexOf('datos'); return i >= 0 ? i : col.indexOf('valor'); }

function agregarFila_(nombre, obj) {
  var h = hoja_(nombre), col = PESTANAS[nombre];
  var fila = col.map(function (k) { return celda_(obj[k]); });
  var r = h.getLastRow() + 1;
  if (r > h.getMaxRows()) h.insertRowsAfter(h.getMaxRows(), r - h.getMaxRows());
  // Como texto, para que Sheets no convierta fechas ni montos
  h.getRange(r, 1, 1, col.length).setNumberFormat('@').setValues([fila]);
}

function valorConfig_(filas, clave) {
  for (var i = 0; i < filas.length; i++) if (filas[i].clave === clave) return filas[i].valor;
  return null;
}

function anotar_(origen, accion, detalle) {
  try { agregarFila_('bitacora', { fecha: new Date().toISOString(), origen: origen, accion: accion, detalle: String(detalle).slice(0, 500) }); }
  catch (e) { /* la bitácora nunca debe tumbar una petición */ }
}

function json_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}

// ---------------------------------------------------------------- instalación (se corren a mano una vez)

/** Crea las pestañas con sus encabezados. */
function configurar() {
  for (var n in PESTANAS) hoja_(n);
  var cfg = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('config');
  if (cfg.getLastRow() < 2) cfg.appendRow(['_version', '0']);
  Logger.log('Listo: pestañas creadas.');
}

/** Genera las dos claves si no existen y las muestra UNA vez en el registro. */
function crearClaves() {
  var props = PropertiesService.getScriptProperties();
  var nuevas = {};
  ['CLAVE_APP', 'CLAVE_INGRESO'].forEach(function (k) {
    if (!props.getProperty(k)) { nuevas[k] = Utilities.getUuid().replace(/-/g, ''); props.setProperty(k, nuevas[k]); }
  });
  Logger.log(Object.keys(nuevas).length ? 'Cópialas a un lugar seguro: ' + JSON.stringify(nuevas) : 'Las claves ya existían; no se cambiaron.');
}

