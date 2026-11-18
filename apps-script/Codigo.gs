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
 *   { accion: "instalar", claveApp, claveIngreso }   (solo la primera vez)
 * y la respuesta siempre es JSON: { ok: true, ... } o { ok: false, error }.
 *
 * Ver docs/SHEET.md para la estructura de cada pestaña.
 */

var MAX_INTENTOS = 5;          // claves equivocadas antes de bloquear
var MINUTOS_BLOQUEO = 15;
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
  estados_cuenta: ['recibido', 'banco', 'tarjeta', 'fecha_corte', 'fecha_pago', 'pago_minimo', 'pago_contado', 'huella'],
  bitacora:       ['fecha', 'origen', 'accion', 'detalle']
};

// Listas del plan que van cada una en su pestaña (el resto va a config)
var LISTAS = { debts: 'deudas', funds: 'fondos', recurring: 'recurrentes', oneoffs: 'puntuales', fechas: 'fechas' };

// ---------------------------------------------------------------- entrada

function doGet() {
  return json_({ ok: true, app: 'Mi plan', mensaje: 'Usa POST' });
}

function doPost(e) {
  var p;
  try { p = JSON.parse((e && e.postData && e.postData.contents) || '{}'); }
  catch (err) { return json_({ ok: false, error: 'La petición no es un JSON válido' }); }

  if (p.accion === 'instalar') return json_(conCandado_(function () { return instalar_(p); }));

  var acceso = revisarClave_(p.clave, p.accion);
  if (!acceso.ok) return json_(acceso);

  try {
    if (p.accion === 'leer') return json_(leer_());
    if (p.accion === 'guardar') return json_(conCandado_(function () { return guardar_(p); }));
    if (p.accion === 'ingresar') return json_(conCandado_(function () { return ingresar_(p); }));
    if (p.accion === 'revisarCorreo') return json_(revisarCorreo());
    if (p.accion === 'activarCorreo') return json_(activarCorreo());
    return json_({ ok: false, error: 'Acción desconocida' });
  } catch (err) {
    anotar_('app', 'error', String(err && err.message || err));
    return json_({ ok: false, error: 'Algo falló en el servidor: ' + (err && err.message || err) });
  }
}

// ---------------------------------------------------------------- instalación remota

// Solo funciona UNA vez: mientras no exista CLAVE_APP. Guarda las dos claves
// que manda la computadora de Rudy y crea las pestañas. Después queda inútil.
function instalar_(p) {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('CLAVE_APP')) return { ok: false, error: 'Ya está instalado' };
  var app = String(p.claveApp || ''), ing = String(p.claveIngreso || '');
  if (app.length < 24 || ing.length < 24 || app === ing) return { ok: false, error: 'Las claves deben ser distintas y de al menos 24 caracteres' };
  props.setProperties({ CLAVE_APP: app, CLAVE_INGRESO: ing, INTENTOS: '0', BLOQUEO_HASTA: '0' });
  configurar();
  anotar_('instalacion', 'instalar', 'Claves guardadas y pestañas creadas');
  return { ok: true };
}

// ---------------------------------------------------------------- acceso

function revisarClave_(clave, accion) {
  var props = PropertiesService.getScriptProperties();
  var bloqueo = Number(props.getProperty('BLOQUEO_HASTA') || 0);
  if (Date.now() < bloqueo) {
    return { ok: false, error: 'Demasiados intentos. Prueba otra vez en unos minutos.', bloqueado: true };
  }
  var app = props.getProperty('CLAVE_APP');
  var ing = props.getProperty('CLAVE_INGRESO');
  if (!app) return { ok: false, error: 'Falta configurar CLAVE_APP en Propiedades del script' };

  var esApp = iguales_(clave, app);
  var esIngreso = !!ing && iguales_(clave, ing);
  var permitido = esApp || (esIngreso && accion === 'ingresar');

  if (!permitido) {
    var n = Number(props.getProperty('INTENTOS') || 0) + 1;
    if (n >= MAX_INTENTOS) {
      props.setProperties({ INTENTOS: '0', BLOQUEO_HASTA: String(Date.now() + MINUTOS_BLOQUEO * 60000) });
      anotar_('seguridad', 'bloqueo', 'Se bloqueó el acceso por ' + MINUTOS_BLOQUEO + ' minutos');
    } else {
      props.setProperty('INTENTOS', String(n));
    }
    return { ok: false, error: esIngreso ? 'Esa clave solo sirve para ingresar movimientos' : 'Clave incorrecta' };
  }
  if (props.getProperty('INTENTOS') && props.getProperty('INTENTOS') !== '0') props.setProperty('INTENTOS', '0');
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
    porClasificar: tablas.por_clasificar.filter(function (f) { return f.estado === 'pendiente'; })
  };
}

// ---------------------------------------------------------------- guardar

function guardar_(p) {
  if (!p.plan || typeof p.plan !== 'object' || !p.plan.months) return { ok: false, error: 'Falta el plan' };
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
  anotar_('app', 'guardar', 'Versión ' + nueva);
  return { ok: true, version: nueva, actualizado: ahora };
}

function marcarClasificados_(lista) {
  var hoja = hoja_('por_clasificar');
  var datos = hoja.getDataRange().getValues();
  var col = PESTANAS.por_clasificar;
  var iId = col.indexOf('id'), iEst = col.indexOf('estado'), iA = col.indexOf('asignado_a');
  var porId = {}; lista.forEach(function (x) { porId[x.id] = x; });
  for (var r = 1; r < datos.length; r++) {
    var x = porId[datos[r][iId]]; if (!x) continue;
    hoja.getRange(r + 1, iEst + 1).setValue(x.estado || 'asignado');
    hoja.getRange(r + 1, iA + 1).setValue(x.asignado_a || '');
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
  var huella = m.ok ? [m.tarjeta, m.monto, m.fecha, m.formato].join('|') : 'txt|' + limpiarTexto(texto).trim().slice(0, 200);
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
  anotar_(origen, 'ingresar', limpiarTexto(texto));
  return { ok: true, id: fila.id, interpretado: m.ok };
}

// ---------------------------------------------------------------- correo (Gmail)

// Solo se leen correos de estos remitentes. Se puede cambiar sin tocar el
// código con la propiedad BUSQUEDA_CORREO en Propiedades del script.
var BUSQUEDA_CORREO = 'from:(baccredomatic.com OR baccredomatic.sv OR bancocuscatlan.com) newer_than:3d';
var ETIQUETA_CORREO = 'MiPlan/procesado';
var MAX_VISTOS = 300;

// Busca avisos de compra y estados de cuenta en Gmail. Las compras van a
// por_clasificar; los estados de cuenta, a estados_cuenta. Lo demás (transferencias,
// promociones, códigos) se ignora. No borra ni marca como leído ningún correo.
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
    var etiqueta = GmailApp.getUserLabelByName(ETIQUETA_CORREO) || GmailApp.createLabel(ETIQUETA_CORREO);
    var r = { ok: true, inicial: inicial, revisados: 0, compras: 0, duplicados: 0, estados: 0, ignorados: 0, anteriores: 0 };
    GmailApp.search(q, 0, 50).forEach(function (hilo) {
      var tocado = false;
      hilo.getMessages().forEach(function (m) {
        var id = m.getId(); if (yaVisto[id]) return;
        yaVisto[id] = true; vistos.push(id); r.revisados++;
        var texto = textoDe_(m);
        if (interpretar(texto).ok) {
          if (inicial) { r.anteriores++; return; }
          var x = agregarMovimiento_(texto, 'correo'); tocado = true;
          if (x.duplicado) r.duplicados++; else if (x.ignorado) r.ignorados++; else r.compras++;
          return;
        }
        var e = interpretarEstado(texto);
        if (e.ok) { if (guardarEstado_(e, m.getFrom())) r.estados++; tocado = true; return; }
        r.ignorados++;
      });
      if (tocado) hilo.addLabel(etiqueta);
    });
    props.setProperty('CORREOS_VISTOS', JSON.stringify(vistos.slice(-MAX_VISTOS)));
    props.setProperty('CORREO_ULTIMA', new Date().toISOString());
    if (r.compras || r.estados) anotar_('correo', 'revisar', JSON.stringify(r));
    return r;
  } finally { lock.releaseLock(); }
}

function guardarEstado_(e, remitente) {
  var huella = [e.tarjeta, e.fecha_corte].join('|');
  if (leerTabla_('estados_cuenta').some(function (f) { return f.huella === huella; })) return false;
  var banco = /cuscatlan/i.test(remitente) ? 'Cuscatlán' : /bac/i.test(remitente) ? 'BAC' : '';
  agregarFila_('estados_cuenta', { recibido: new Date().toISOString(), banco: banco, tarjeta: e.tarjeta, fecha_corte: e.fecha_corte,
    fecha_pago: e.fecha_pago, pago_minimo: e.pago_minimo, pago_contado: e.pago_contado, huella: huella });
  return true;
}

// Crea (una sola vez) el disparador que revisa el correo cada 15 minutos
function activarCorreo() {
  var ya = ScriptApp.getProjectTriggers().some(function (t) { return t.getHandlerFunction() === 'revisarCorreo'; });
  if (!ya) ScriptApp.newTrigger('revisarCorreo').timeBased().everyMinutes(15).create();
  var r = revisarCorreo();
  r.activado = true; r.yaEstaba = ya;
  return r;
}

// Texto plano de un correo (si solo trae HTML, se le quitan las etiquetas)
function textoDe_(m) {
  var t = m.getPlainBody();
  if (!t || t.length < 20) t = String(m.getBody()).replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');
  return String(t).replace(/\s+/g, ' ').trim();
}

/** Se ejecuta UNA vez a mano en el editor para aceptar el permiso de Gmail. */
function autorizar() {
  GmailApp.getInboxUnreadCount();
  ScriptApp.getProjectTriggers();
  Logger.log('Listo: permisos de Gmail aceptados.');
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
  x = t.match(/Tarjeta.*?(\d{4}) por USD\s?([\d,]+\.\d{2}) en (.+?) el (\d{4}-\d{2}-\d{2})[ T](\d{1,2}:\d{2})/i);
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
  return { ok: false };
}

// Estado de cuenta en el cuerpo del correo (Cuscatlán):
// "Tarjeta Nº 428291******1234 Fecha de corte: 08/11/2026 Última fecha de pago: 03/12/2026 Pago mínimo: $96.69 Pago de contado: $225.48"
function interpretarEstado(texto) {
  var t = String(texto).replace(/\s+/g, ' ');
  var tj = t.match(/Tarjeta N[º°o]?\.?\s*([\d*Xx•]{8,})/i);
  if (tj) tj = [tj[0], tj[1].replace(/\D/g, '').slice(-4)];
  var corte = t.match(/Fecha de corte:?\s*(\d{2})\/(\d{2})\/(\d{4})/i);
  var pago = t.match(/(?:[ÚU]ltima )?fecha (?:l[ií]mite )?de pago:?\s*(\d{2})\/(\d{2})\/(\d{4})/i);
  var minimo = t.match(/Pago m[ií]nimo:?\s*\$?\s*([\d,]+\.\d{2})/i);
  var contado = t.match(/Pago de contado:?\s*\$?\s*([\d,]+\.\d{2})/i);
  if (!tj || !corte || !pago) return { ok: false };
  var f = function (m) { return m[3] + '-' + m[2] + '-' + m[1]; };
  return { ok: true, tarjeta: tj[1], fecha_corte: f(corte), fecha_pago: f(pago), pago_minimo: minimo ? num_(minimo[1]) : '', pago_contado: contado ? num_(contado[1]) : '' };
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
    .replace(/\b\d{4}-\d{4}\b/g, '[teléfono]')
    .slice(0, max || 500);
}

function num_(s) { return Math.round(Number(String(s).replace(/,/g, '')) * 100) / 100; }

// ---------------------------------------------------------------- plan ⇄ filas
// Funciones puras (sin SpreadsheetApp) para poder probarlas en Node.

function planAFilas(plan) {
  var t = { config: [], deudas: [], fondos: [], recurrentes: [], puntuales: [], fechas: [], meses: [], movimientos: [] };
  Object.keys(plan).forEach(function (k) {
    if (LISTAS[k] || k === 'months') return;
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
    if (f.clave) plan[f.clave] = parsear_(f.valor);
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

function parsear_(v) { try { return JSON.parse(v); } catch (e) { return v; } }

// Parte un texto largo en pedazos que caben en una celda
function partir(texto) {
  var p = []; texto = String(texto);
  for (var i = 0; i < texto.length; i += TAM_CELDA) p.push(texto.slice(i, i + TAM_CELDA));
  return p.length ? p : [''];
}

// ---------------------------------------------------------------- hojas

function hoja_(nombre) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var h = ss.getSheetByName(nombre);
  if (!h) { h = ss.insertSheet(nombre); h.appendRow(PESTANAS[nombre]); h.setFrozenRows(1); }
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
    for (var c = 0; c < col.length; c++) o[col[c]] = v[r][c];
    if (iDatos >= 0) o[col[iDatos]] = v[r].slice(iDatos).join('');
    if (col.some(function (k) { return o[k] !== '' && o[k] != null; })) out.push(o);
  }
  return out;
}

function escribirTabla_(nombre, filas) {
  var col = PESTANAS[nombre], h = hoja_(nombre);
  var iDatos = colLarga_(col);
  var valores = filas.map(function (f) {
    var fila = col.map(function (k) { return f[k] == null ? '' : f[k]; });
    if (iDatos >= 0) fila = fila.slice(0, iDatos).concat(partir(f[col[iDatos]] == null ? '' : f[col[iDatos]]));
    return fila;
  });
  var ancho = Math.max(col.length, valores.reduce(function (a, f) { return Math.max(a, f.length); }, 0));
  valores = valores.map(function (f) { while (f.length < ancho) f.push(''); return f; });
  if (h.getMaxRows() > 1) h.getRange(2, 1, h.getMaxRows() - 1, h.getMaxColumns()).clearContent();
  if (valores.length) {
    if (h.getMaxColumns() < ancho) h.insertColumnsAfter(h.getMaxColumns(), ancho - h.getMaxColumns());
    if (h.getMaxRows() < valores.length + 1) h.insertRowsAfter(h.getMaxRows(), valores.length + 1 - h.getMaxRows());
    // Texto plano: evita que Sheets convierta "2026-11" en fecha
    h.getRange(2, 1, valores.length, ancho).setNumberFormat('@').setValues(valores);
  }
}

// Columna que puede seguir en las columnas de la derecha si el texto es muy largo
function colLarga_(col) { var i = col.indexOf('datos'); return i >= 0 ? i : col.indexOf('valor'); }

function agregarFila_(nombre, obj) {
  var h = hoja_(nombre), col = PESTANAS[nombre];
  var fila = col.map(function (k) { return obj[k] == null ? '' : String(obj[k]); });
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

/** Quita el bloqueo por intentos fallidos. */
function desbloquear() {
  PropertiesService.getScriptProperties().setProperties({ INTENTOS: '0', BLOQUEO_HASTA: '0' });
}
