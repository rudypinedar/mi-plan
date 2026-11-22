// Pruebas de apps-script/Codigo.gs con un Google Sheet simulado en memoria.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { ENG, iniciar, planes, pagarTodo } = require("./ayuda.js");

const CODIGO = fs.readFileSync(path.join(__dirname, "..", "apps-script", "Codigo.gs"), "utf8");

// ---- Simulación mínima de los servicios de Apps Script ----
function hojaFalsa(nombre) {
  const g = []; // filas de texto
  let filas = 1000, cols = 26;
  const celda = (r, c) => (g[r] && g[r][c] != null ? g[r][c] : "");
  const rango = (r, c, nr = 1, nc = 1) => ({
    clearContent() { for (let i = 0; i < nr; i++) for (let j = 0; j < nc; j++) if (g[r - 1 + i]) g[r - 1 + i][c - 1 + j] = ""; return this; },
    setNumberFormat() { return this; },
    setValues(v) {
      assert.equal(v.length, nr); if (r - 1 + nr > filas || c - 1 + nc > cols) throw new Error("Rango fuera de la hoja");
      v.forEach((f, i) => { assert.equal(f.length, nc); g[r - 1 + i] = g[r - 1 + i] || []; f.forEach((x, j) => {
        const t = String(x); if (t.length > 50000) throw new Error("Celda de más de 50,000 caracteres"); g[r - 1 + i][c - 1 + j] = t; }); });
      return this;
    },
    setValue(x) { return this.setValues([[x]]); },
  });
  const ultima = () => { for (let r = g.length - 1; r >= 0; r--) if ((g[r] || []).some(x => x !== "")) return r + 1; return 0; };
  return {
    nombre, g,
    appendRow(f) { const r = ultima(); g[r] = f.map(String); },
    setFrozenRows() {},
    getLastRow: ultima,
    getMaxRows: () => filas, getMaxColumns: () => cols,
    insertColumnsAfter(_, n) { cols += n; }, insertRowsAfter(_, n) { filas += n; },
    getRange: rango,
    getDataRange() {
      const n = ultima(), w = Math.max(1, ...g.slice(0, n).map(f => (f || []).length));
      return { getValues: () => Array.from({ length: n }, (_, r) => Array.from({ length: w }, (_, c) => celda(r, c))) };
    },
  };
}

function calendarioFalso() {
  const eventos = [];
  const cal = { getId: () => "cal1", getEvents: () => eventos.slice().map(e => ({ deleteEvent() { eventos.splice(eventos.indexOf(e), 1); } })),
    createAllDayEvent: (t, d, o) => { const e = { t, d, o, avisos: [] }; eventos.push(e); return { removeAllReminders() {}, addPopupReminder(m) { e.avisos.push(m); } }; } };
  return { eventos, Color: { GREEN: "g" }, getCalendarById: () => cal, createCalendar: () => cal };
}

function utilidadesFalsas() {
  const crypto = require("crypto");
  return {
    getUuid: () => crypto.randomUUID(), formatDate: d => new Date(d).toISOString().slice(0, 10),
    DigestAlgorithm: { SHA_256: "sha256" }, Charset: { UTF_8: "utf8" },
    computeDigest: (alg, t) => [...crypto.createHash("sha256").update(String(t)).digest()].map(b => (b > 127 ? b - 256 : b)),
    // Como Apps Script: exige el relleno final (=) o falla
    base64DecodeWebSafe: s => { if (s.length % 4) throw new Error("No se pudo descifrar la cadena."); return [...Buffer.from(s, "base64url")]; },
    newBlob: (bytes, tipo, nombre) => ({ bytes, tipo, nombre, getDataAsString: () => Buffer.from(bytes).toString("utf8") }),
  };
}

function driveFalso() {
  const archivos = [];
  return {
    archivos,
    Files: {
      create: (res, blob) => { const f = Object.assign({ id: "f" + archivos.length, webViewLink: "https://drive.google.com/file/d/f" + archivos.length + "/view", trashed: false }, res, { blob }); archivos.push(f); return f; },
      list: ({ q }) => { const nombre = (q.match(/name = '([^']*)'/) || [])[1], padre = (q.match(/'([^']+)' in parents/) || [])[1], contiene = (q.match(/name contains '([^']*)'/) || [])[1];
        return { files: archivos.filter(f => !f.trashed && (nombre ? f.name === nombre : contiene ? f.name.includes(contiene) : true) && (!padre || (f.parents || []).includes(padre))).sort((a, b) => (a.name < b.name ? 1 : -1)) }; },
      get: id => archivos.find(f => f.id === id),
      update: (res, id) => Object.assign(archivos.find(f => f.id === id), res),
    },
  };
}

const AUTH_BAC = "mx.google.com; dkim=pass header.i=@baccredomatic.com header.s=s1; spf=pass (google.com: domain of alertas@baccredomatic.com designates 192.0.2.1 as permitted sender) smtp.mailfrom=alertas@baccredomatic.com; dmarc=pass (p=REJECT sp=REJECT dis=NONE) header.from=baccredomatic.com";

// Gmail (API avanzada) simulado. Cada correo: texto, o { texto, asunto, de, auth, pdf }
function gmailFalso(correos, comoBytes) {
  // Apps Script puede entregar los datos como base64 sin relleno o ya como bytes
  const b64 = t => (comoBytes ? [...Buffer.from(t, "utf8")] : Buffer.from(t, "utf8").toString("base64url"));
  const norm = (c, i) => (typeof c === "string" ? { texto: c } : c);
  return {
    correos,
    Users: {
      getProfile: () => ({ emailAddress: "yo@example.com" }),
      Messages: {
        list: () => ({ messages: correos.map((c, i) => ({ id: "m" + i })).reverse() }),
        get: (u, id) => {
          const c = norm(correos[Number(id.slice(1))]);
          const de = c.de || "Alertas <alertas@baccredomatic.com>";
          const partes = [{ mimeType: "text/plain", body: { data: b64(c.texto) } }];
          if (c.pdf) partes.push({ filename: "estado.pdf", mimeType: "application/pdf", body: { attachmentId: "a1" } });
          return { id, internalDate: String(Date.now()), payload: { mimeType: "multipart/mixed", headers: [
            { name: "From", value: de }, { name: "Subject", value: c.asunto || "Aviso" },
            { name: "Authentication-Results", value: c.auth || AUTH_BAC },
          ], parts: partes } };
        },
        Attachments: { get: () => ({ data: b64("%PDF-1.4 prueba") }) },
      },
    },
  };
}

function entorno(props = {}) {
  const hojas = {};
  const P = Object.assign({}, props);
  const ctx = {
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: n => hojas[n] || null, insertSheet: n => (hojas[n] = hojaFalsa(n)) }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => (k in P ? P[k] : null), setProperty: (k, v) => { P[k] = String(v); }, setProperties: o => Object.assign(P, o), deleteProperty: k => { delete P[k]; } }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    ContentService: { MimeType: { JSON: "json" }, createTextOutput: t => ({ setMimeType: () => ({ texto: t }) }) },
    Utilities: utilidadesFalsas(),
    CacheService: (() => { const c = {}; const cache = { get: k => c[k] || null, put: (k, v) => { c[k] = v; } }; return { getScriptCache: () => cache }; })(),
    CalendarApp: calendarioFalso(),
    Drive: driveFalso(),
    Gmail: gmailFalso([]),
    Logger: { log() {} },
  };
  vm.createContext(ctx); vm.runInContext(CODIGO, ctx);
  const post = cuerpo => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(cuerpo) } }).texto);
  return { ctx, hojas, P, post };
}

const CLAVES = { CLAVE_APP: "clave-de-prueba-app", CLAVE_INGRESO: "clave-de-prueba-ingreso" };
const SMS1 = "Alerta de compra B.CUSCATLAN con su Tarjeta de Credito Titular 0001 por USD88.32 en TIENDA DE PRUEBA el 2030-11-08 15:17. Mas inf. 22223333";
const SMS2 = "Alertas PRF VISA 0002: has realizado una compra por USD 1,109.99 en el comercio: SUPER DE PRUEBA 2030/11/08 16:32:03 Inf. https://bit.ly/abc";

// ---- Pruebas ----
for (const p of planes()) {
  test(`${p.nombre}: guardar y leer devuelve el mismo plan`, () => {
    const s = p.crear();
    for (let i = 0; i < 3; i++) { pagarTodo(s, s.current); ENG.cerrarMes(s, s.current, { iniciarSiguiente: true }); }
    const { post, ctx } = entorno(CLAVES); ctx.configurar();
    const g = post({ accion: "guardar", clave: CLAVES.CLAVE_APP, version: 0, plan: s });
    assert.equal(g.ok, true, g.error); assert.equal(g.version, 1);
    const l = post({ accion: "leer", clave: CLAVES.CLAVE_APP });
    assert.equal(l.ok, true); assert.equal(l.version, 1);
    assert.deepEqual(l.plan, JSON.parse(JSON.stringify(s)));
  });
}

test("un mes enorme se parte en varias celdas y vuelve completo", () => {
  const s = iniciar(require("./plan-ejemplo.js")());
  const sobre = s.months[s.current].items.find(i => i.envelope);
  for (let i = 0; i < 1500; i++) ENG.anotarGasto(s, sobre, 0.01, "gasto de prueba número " + i);
  const { post } = entorno(CLAVES);
  assert.equal(post({ accion: "guardar", clave: CLAVES.CLAVE_APP, version: 0, plan: s }).ok, true);
  assert.deepEqual(post({ accion: "leer", clave: CLAVES.CLAVE_APP }).plan, JSON.parse(JSON.stringify(s)));
});

test("partir: ningún trozo empieza con ' = + - @ y juntos vuelven al texto original", () => {
  const { ctx } = entorno(CLAVES);
  const T = ctx.TAM_CELDA;
  for (const malo of ["'", "=", "+", "-", "@", "'=+-@'"]) {
    const texto = "a".repeat(T - 3) + "xyz" + malo + "b".repeat(T);  // lo malo cae justo en el corte
    const p = ctx.partir(texto);
    assert.equal(p.join(""), texto);
    p.slice(1).forEach(t => assert.doesNotMatch(t, /^['=+\-@]/, `trozo empieza con ${t[0]}`));
    p.forEach(t => assert.ok(t.length <= T));
  }
  assert.throws(() => ctx.partir("'".repeat(T + 5000)), /No se pudo partir/);
});

test("un apóstrofo justo en el corte vuelve intacto al leer", () => {
  const { ctx, hojas } = entorno(CLAVES);
  const T = ctx.TAM_CELDA;
  const datos = JSON.stringify({ nota: "x".repeat(T - 9) + "'= texto", resto: "y".repeat(T) });
  assert.equal(datos.indexOf("'"), T, "el apóstrofo no quedó en el corte");
  ctx.escribirTabla_("meses", [{ mes: "2030-01", cerrado: "", deuda_inicio: "", deuda_cierre: "", datos }]);
  const fila = hojas.meses.g[1];
  assert.ok(fila.length > 5, "no se partió en varias celdas");
  fila.slice(5).forEach(c => assert.doesNotMatch(c, /^['=+\-@]/));
  assert.equal(ctx.leerTabla_("meses")[0].datos, datos);
});

test("guardar con versión vieja avisa del conflicto y no pisa", () => {
  const s = iniciar(require("./plan-ejemplo.js")());
  const { post } = entorno(CLAVES);
  post({ accion: "guardar", clave: CLAVES.CLAVE_APP, version: 0, plan: s });
  const otro = JSON.parse(JSON.stringify(s)); otro.debts[0].balance = 1;
  const r = post({ accion: "guardar", clave: CLAVES.CLAVE_APP, version: 0, plan: otro });
  assert.equal(r.ok, false); assert.equal(r.conflicto, true); assert.equal(r.version, 1);
  assert.equal(post({ accion: "leer", clave: CLAVES.CLAVE_APP }).plan.debts[0].balance, s.debts[0].balance);
});

test("un saldo corregido a mano en el Sheet manda al leer", () => {
  const s = iniciar(require("./plan-ejemplo.js")());
  const { post, hojas } = entorno(CLAVES);
  post({ accion: "guardar", clave: CLAVES.CLAVE_APP, version: 0, plan: s });
  hojas.deudas.g[1][3] = "123.45"; // columna "saldo" de la primera deuda
  assert.equal(post({ accion: "leer", clave: CLAVES.CLAVE_APP }).plan.debts[0].balance, 123.45);
});

test("claves: la buena siempre entra (sin bloqueo); la de ingreso solo ingresa; los fallos se anotan sin llenar la bitácora", () => {
  const { post, hojas } = entorno(CLAVES);
  assert.equal(post({ accion: "leer", clave: CLAVES.CLAVE_INGRESO }).error, "Clave incorrecta", "no debe revelar que la clave de ingreso existe");
  assert.equal(post({ accion: "ingresar", clave: CLAVES.CLAVE_INGRESO, texto: SMS1 }).ok, true);
  for (let i = 0; i < 50; i++) assert.equal(post({ accion: "leer", clave: "mala" + i }).ok, false);
  assert.equal(post({ accion: "leer", clave: CLAVES.CLAVE_APP }).ok, true, "un atacante no puede dejar fuera al dueño");
  assert.equal(post({ accion: "ingresar", clave: CLAVES.CLAVE_INGRESO, texto: SMS2 }).ok, true, "Atajos sigue funcionando");
  const avisos = hojas.bitacora.g.filter(f => f[2] === "clave incorrecta").length;
  assert.equal(avisos, 1, "una sola fila por ventana de tiempo");
});

test("sin CLAVE_APP configurada no deja entrar a nadie ni lo delata", () => {
  const { post } = entorno({});
  assert.equal(post({ accion: "leer", clave: "" }).error, "Clave incorrecta");
  assert.equal(post({ accion: "leer", clave: "cualquiera" }).error, "Clave incorrecta");
});

test("doGet no dice nada de la app", () => {
  const { ctx } = entorno(CLAVES);
  assert.deepEqual(JSON.parse(ctx.doGet().texto), { ok: true });
});

test("ingresar interpreta las alertas, no duplica y limpia la bitácora", () => {
  const { post, hojas } = entorno(CLAVES);
  const a = post({ accion: "ingresar", clave: CLAVES.CLAVE_INGRESO, texto: SMS1 });
  const b = post({ accion: "ingresar", clave: CLAVES.CLAVE_INGRESO, texto: SMS2 });
  const c = post({ accion: "ingresar", clave: CLAVES.CLAVE_INGRESO, texto: SMS1 });
  const d = post({ accion: "ingresar", clave: CLAVES.CLAVE_INGRESO, texto: "Mensaje raro del banco" });
  assert.equal(a.interpretado, true); assert.equal(b.interpretado, true);
  assert.equal(c.duplicado, true); assert.equal(d.interpretado, false);
  const pc = post({ accion: "leer", clave: CLAVES.CLAVE_APP }).porClasificar;
  assert.equal(pc.length, 3);
  assert.deepEqual([pc[0].tarjeta, pc[0].monto, pc[0].comercio, pc[0].fecha], ["0001", "88.32", "TIENDA DE PRUEBA", "2030-11-08 15:17"]);
  assert.deepEqual([pc[1].tarjeta, pc[1].monto, pc[1].comercio, pc[1].fecha], ["0002", "1109.99", "SUPER DE PRUEBA", "2030-11-08 16:32"]);
  assert.equal(pc[2].nota, "sin interpretar");
  const bit = hojas.bitacora.g.map(f => f.join(" ")).join("\n");
  assert.ok(!bit.includes("22223333"), "el número del banco quedó en la bitácora");
  assert.ok(!bit.includes("bit.ly"), "el enlace quedó en la bitácora");
  assert.ok(!bit.includes("Mensaje raro"), "el texto no interpretado no se guarda");
  assert.ok(!hojas.por_clasificar.g.flat().some(x => /Mensaje raro/.test(x)), "ni en la huella");
});

test("un código reenviado por error no queda guardado", () => {
  const { post, hojas } = entorno(CLAVES);
  post({ accion: "ingresar", clave: CLAVES.CLAVE_INGRESO, texto: "Tu código de verificación es 482913. No lo compartas." });
  const todo = Object.values(hojas).map(h => h.g.flat().join(" ")).join(" ");
  assert.ok(!todo.includes("482913"));
});

test("al guardar se pueden marcar los movimientos ya clasificados", () => {
  const s = iniciar(require("./plan-ejemplo.js")());
  const { post } = entorno(CLAVES);
  const { id } = post({ accion: "ingresar", clave: CLAVES.CLAVE_APP, texto: SMS1 });
  post({ accion: "guardar", clave: CLAVES.CLAVE_APP, version: 0, plan: s, clasificados: [{ id, estado: "asignado", asignado_a: "sobre:super" }] });
  assert.equal(post({ accion: "leer", clave: CLAVES.CLAVE_APP }).porClasificar.length, 0);
});

test("instalar exige el token puesto a mano y solo funciona una vez", () => {
  const a = "a".repeat(32), b = "b".repeat(32);
  const sinToken = entorno({});
  assert.equal(sinToken.post({ accion: "instalar", claveApp: a, claveIngreso: b }).ok, false, "sin token nadie instala");
  assert.equal(sinToken.P.CLAVE_APP, undefined);
  const { post, P, hojas } = entorno({ TOKEN_INSTALACION: "token-de-prueba-123" });
  assert.equal(post({ accion: "instalar", token: "otro", claveApp: a, claveIngreso: b }).ok, false);
  assert.equal(post({ accion: "instalar", token: "token-de-prueba-123", claveApp: "corta", claveIngreso: b }).ok, false);
  assert.equal(post({ accion: "instalar", token: "token-de-prueba-123", claveApp: a, claveIngreso: b }).ok, true);
  assert.equal(P.CLAVE_APP, a); assert.equal(P.TOKEN_INSTALACION, undefined, "el token se borra");
  assert.ok(hojas.config && hojas.deudas, "no creó las pestañas");
  assert.equal(post({ accion: "instalar", token: "token-de-prueba-123", claveApp: "c".repeat(32), claveIngreso: "d".repeat(32) }).ok, false);
  assert.equal(P.CLAVE_APP, a, "dejó cambiar la clave");
});

test("guardar rechaza planes mal formados y claves reservadas", () => {
  const { post, hojas } = entorno(CLAVES);
  const s = iniciar(require("./plan-ejemplo.js")());
  for (const malo of [null, [], { months: [] }, Object.assign({}, s, { debts: "x" }), Object.assign({}, s, { months: { "x": { items: [] } } })])
    assert.equal(post({ accion: "guardar", clave: CLAVES.CLAVE_APP, version: 0, plan: malo }).ok, false);
  assert.equal(post({ accion: "guardar", clave: CLAVES.CLAVE_APP, version: 0, plan: s, clasificados: "x" }).ok, false);
  const raro = Object.assign(JSON.parse(JSON.stringify(s)), { _version: 999, constructor: "x" });
  raro["__proto__x"] = 1;
  assert.equal(post({ accion: "guardar", clave: CLAVES.CLAVE_APP, version: 0, plan: raro }).ok, true);
  const claves = hojas.config.g.slice(1).map(f => f[0]);
  assert.equal(claves.filter(k => k === "_version").length, 1, "_version del cliente no entra");
  assert.ok(!claves.includes("constructor"));
  assert.equal(post({ accion: "guardar", clave: CLAVES.CLAVE_APP, version: 1, plan: s }).version, 2, "el control de versiones sigue bien");
});

test("las celdas nunca quedan como fórmula y vuelven intactas", () => {
  const { post, hojas } = entorno(CLAVES);
  const s = iniciar(require("./plan-ejemplo.js")());
  s.debts[0].name = '=IMPORTXML("https://ejemplo.com","//a")'; s.recurring[0].name = "+SUMA(1)"; s.funds[0].name = "@algo";
  post({ accion: "guardar", clave: CLAVES.CLAVE_APP, version: 0, plan: s });
  const celdas = Object.values(hojas).flatMap(h => h.g.flat());
  assert.ok(!celdas.some(c => /^[=+@]/.test(c)), "alguna celda empieza como fórmula");
  const l = post({ accion: "leer", clave: CLAVES.CLAVE_APP }).plan;
  assert.equal(l.debts[0].name, s.debts[0].name); assert.equal(l.recurring[0].name, "+SUMA(1)");
  post({ accion: "ingresar", clave: CLAVES.CLAVE_APP, texto: SMS1.replace("TIENDA DE PRUEBA", "=HYPERLINK(1)") });
  assert.equal(post({ accion: "leer", clave: CLAVES.CLAVE_APP }).porClasificar[0].comercio, "=HYPERLINK(1)");
  assert.ok(!hojas.por_clasificar.g.flat().some(c => /^=/.test(c)));
});

test("guardar escribe antes de borrar: menos filas o columnas no dejan restos", () => {
  const { post, hojas } = entorno(CLAVES);
  const s = iniciar(require("./plan-ejemplo.js")());
  const sobre = s.months[s.current].items.find(i => i.envelope);
  for (let i = 0; i < 1500; i++) ENG.anotarGasto(s, sobre, 0.01, "gasto largo " + i);
  post({ accion: "guardar", clave: CLAVES.CLAVE_APP, version: 0, plan: s });
  const chico = iniciar(require("./plan-ejemplo.js")()); chico.debts = chico.debts.slice(0, 2);
  post({ accion: "guardar", clave: CLAVES.CLAVE_APP, version: 1, plan: chico });
  assert.deepEqual(post({ accion: "leer", clave: CLAVES.CLAVE_APP }).plan, JSON.parse(JSON.stringify(chico)));
});

// ---- Correo (Gmail simulado). Textos inventados con el mismo formato que los reales ----
const CORREO_PRF = "Logo BAC Credomatic Estimado/a: CLIENTE DE PRUEBA Se acaba de realizar una compra con tu tarjeta VISA terminada en 0003 Detalles del movimiento: Comercio Monto TIENDA EN LINEA 00123 1,240.19 Fecha y hora 2030/11/15-17:55:36 Tipo de la compra Estado Internet Aprobada Si no reconoces la transacción...";
const CORREO_PRF_RECHAZADA = CORREO_PRF.replace("Aprobada", "Rechazada").replace("1,240.19", "50.00");
const CORREO_ALERTAS = "Sistema de Alertas BAC Credomatic Visa 0003 : Detalle de Criterios Le informa que se ha realizado la siguiente transacción con su tarjeta Visa 0003 Detalle de Transacciones Fecha Moneda Monto Comercio Estado 17/11/30 00:00 Dólar 0.50 PARQUEO DE PRUEBA Aprobado Para consultas...";
const CORREO_ALERTAS_MISMA = "Sistema de Alertas BAC Credomatic con su tarjeta Visa 0003 Detalle de Transacciones Fecha Moneda Monto Comercio Estado 15/11/30 00:00 Dólar 1,240.19 TIENDA EN LINEA 00123 Aprobado";
const CORREO_ESTADO = "Estimado(a) Cliente: Adjunto encontrarás el estado de cuenta mensual de tu Tarjeta de Crédito. Tarjeta Nº 400000******0004 Fecha de corte: 08/11/2030 Última fecha de pago: 03/12/2030 Pago mínimo: $96.69 Pago de contado: $225.48";
const CORREO_TRANSFER = "TRANSACCIÓN EXITOSA Le informamos que ha recibido un abono a su CUENTA DE AHORRO X0000 Monto: USD51.75";

test("interpretar: formatos de correo de BAC y estados de cuenta", () => {
  const { ctx } = entorno(CLAVES);
  const a = ctx.interpretar(CORREO_PRF);
  assert.deepEqual([a.tarjeta, a.monto, a.comercio, a.fecha, a.formato], ["0003", 1240.19, "TIENDA EN LINEA 00123", "2030-11-15 17:55", "bac-prf"]);
  const b = ctx.interpretar(CORREO_ALERTAS);
  assert.deepEqual([b.tarjeta, b.monto, b.comercio, b.fecha, b.formato], ["0003", 0.5, "PARQUEO DE PRUEBA", "2030-11-17 00:00", "bac-alertas"]);
  assert.equal(ctx.interpretar(CORREO_PRF_RECHAZADA).ignorar, true);
  assert.equal(ctx.interpretar(CORREO_TRANSFER).ok, false);
  const e = ctx.interpretarEstado(CORREO_ESTADO);
  assert.deepEqual([e.tarjeta, e.fecha_corte, e.fecha_pago, e.pago_minimo, e.pago_contado], ["0004", "2030-11-08", "2030-12-03", 96.69, 225.48]);
  assert.equal(ctx.limpiarTexto("Tarjeta Nº 400000******0004"), "Tarjeta Nº ****0004");
});

test("revisarCorreo: la primera vez no agrega compras viejas; después agrega sin duplicar", () => {
  const env = entorno(CLAVES);
  const correos = [CORREO_PRF, CORREO_ESTADO, CORREO_TRANSFER];
  env.ctx.Gmail = gmailFalso(correos);
  const r1 = env.ctx.revisarCorreo();
  assert.equal(r1.inicial, true); assert.equal(r1.compras, 0); assert.equal(r1.anteriores, 1); assert.equal(r1.estados, 1);
  correos.push(CORREO_ALERTAS, CORREO_ALERTAS_MISMA, CORREO_PRF_RECHAZADA);
  const r2 = env.ctx.revisarCorreo();
  assert.equal(r2.inicial, false); assert.equal(r2.revisados, 3, "solo los nuevos");
  assert.equal(r2.compras, 2, "el parqueo y la compra de la tienda (aún no estaba)");
  assert.equal(r2.ignorados, 1, "la rechazada");
  const r3 = env.ctx.revisarCorreo();
  assert.equal(r3.revisados, 0, "no vuelve a leer lo visto");
  const pc = env.post({ accion: "leer", clave: CLAVES.CLAVE_APP }).porClasificar;
  assert.deepEqual(pc.map(x => x.comercio).sort(), ["PARQUEO DE PRUEBA", "TIENDA EN LINEA 00123"]);
  assert.equal(env.hojas.estados_cuenta.g.length, 2, "encabezado + 1 estado");
});

test("la misma compra por dos correos distintos entra una sola vez", () => {
  const env = entorno(CLAVES);
  env.P.CORREOS_VISTOS = "[]";
  env.ctx.Gmail = gmailFalso([CORREO_PRF, CORREO_ALERTAS_MISMA]);
  const r = env.ctx.revisarCorreo();
  assert.equal(r.compras, 1); assert.equal(r.duplicados, 1);
});

test("calendario: pagos pendientes agrupados y cortes de tarjeta", () => {
  const { ctx } = entorno(CLAVES);
  const plan = {
    current: "2030-11", etiquetas: { pagos: { "BANCO A": { nombre: "Tarjeta A" } } },
    debts: [{ id: "tA", name: "Tarjeta A", kind: "card", balance: 100, cut: 8 }, { id: "tB", name: "Tarjeta B", kind: "card", balance: 0, closed: true, cut: 10 }],
    months: { "2030-11": { items: [
      { name: "Tarjeta A — pago", source: "salary", payWith: "BANCO A", amount: 50, due: 3 },
      { name: "Cuota 0%", source: "salary", payWith: "BANCO A", amount: 20, due: 3 },
      { name: "Ya pagado", source: "salary", payWith: "X", amount: 10, due: 5, paid: true },
      { name: "Sobre", source: "salary", amount: 99, envelope: true, due: 4 },
      { name: "Planilla", source: "salary", amount: 99, autoPaid: true, due: 4 },
      { name: "Casa", source: "salary", payWith: "Débito", amount: 300, due: 25 },
    ] } },
  };
  const ev = JSON.parse(JSON.stringify(ctx.eventosDelPlan(plan, [], "2030-11-22", 50)));
  const t = ev.map(e => e.fecha + " " + e.titulo);
  assert.deepEqual(t, [
    "2030-11-25 Pagar Débito · $300.00 · pago del 20",
    "2030-12-03 Pagar Tarjeta A · $70.00 · pago del 30",
    "2030-12-08 Corte de Tarjeta A · compras grandes, mejor desde mañana",
    "2031-01-08 Corte de Tarjeta A · compras grandes, mejor desde mañana",
  ]);
  assert.deepEqual(ev[1].avisos, [2340, 900]);
  assert.match(ev[1].detalle, /Cuota 0%: \$20\.00/);
  // Lo que ya pasó no se agenda
  assert.equal(ctx.eventosDelPlan(plan, [], "2030-12-04", 10).filter(e => /Pagar/.test(e.titulo)).length, 0);
  // Sin "cut" usa el día del último estado de cuenta
  plan.debts[0].cut = null; plan.debts[0].digits = "0001";
  const ev2 = ctx.eventosDelPlan(plan, [{ tarjeta: "0001", fecha_corte: "2030-10-21" }], "2030-11-22", 30);
  assert.ok(ev2.some(e => e.fecha === "2030-12-21" && /Corte/.test(e.titulo)));
});

test("calendario: lo que no trae día usa el de su destino o el de su tarjeta", () => {
  const { ctx } = entorno(CLAVES);
  const plan = {
    current: "2030-11", diasPago: { pagos: { FAMILIA: 20 }, nombres: [["^Escuela", 8]] }, fuentesPref: { tel: "20" },
    debts: [{ id: "tA", name: "Tarjeta A", kind: "card", balance: 0, payWith: "BANCO A", due: 16 }],
    months: { "2030-11": { items: [
      { name: "Teléfono", recId: "tel", source: "salary", payWith: "BANCO A", amount: 23 },
      { name: "Mamá", source: "salary", payWith: "FAMILIA", amount: 150 },
      { name: "Escuela cuota", source: "salary", payWith: "Débito", amount: 90 },
      { name: "Sin fecha", source: "salary", payWith: "Débito", amount: 5 },
    ] } },
  };
  const t = JSON.parse(JSON.stringify(ctx.eventosDelPlan(plan, [], "2030-11-20", 40))).filter(e => /Pagar/.test(e.titulo)).map(e => e.fecha + " " + e.titulo);
  assert.deepEqual(t, ["2030-11-20 Pagar FAMILIA · $150.00 · pago del 20", "2030-12-08 Pagar Débito · $90.00 · pago del 30", "2030-12-16 Pagar BANCO A · $23.00 · pago del 20"]);
});

test("diasPago: los patrones largos o que no son texto se ignoran", () => {
  const { ctx } = entorno(CLAVES);
  const plan = (nombres) => ({ debts: [], diasPago: { nombres } });
  const it = { name: "Mensualidad del gimnasio" };
  assert.equal(ctx.diaDePago_(plan([["gimnasio", 5]]), it), 5);
  assert.equal(ctx.diaDePago_(plan([["(a+)+" + "x".repeat(60), 5]]), it), 0, "más de 60 caracteres");
  assert.equal(ctx.diaDePago_(plan([[{ source: "gimnasio" }, 5], [["gimnasio"], 6], [12, 7]]), it), 0, "no es texto");
  assert.equal(ctx.diaDePago_(plan([["[", 5], ["gim", 8]]), it), 8, "un patrón malo no rompe los demás");
});

test("fechaDePago: el mes del plan va del 20 al 19", () => {
  const { ctx } = entorno(CLAVES);
  assert.equal(ctx.fechaDePago_("2030-11", 25), "2030-11-25");
  assert.equal(ctx.fechaDePago_("2030-11", 3), "2030-12-03");
  assert.equal(ctx.fechaDePago_("2030-12", 16), "2031-01-16");
  assert.equal(ctx.fechaDePago_("2031-01", 31), "2031-01-31");
  assert.equal(ctx.fechaDePago_("2031-01", 30), "2031-01-30");
});

test("guardar deja el calendario pendiente y la revisión de correo lo actualiza", () => {
  const env = entorno(CLAVES);
  const s = iniciar(require("./plan-ejemplo.js")());
  env.post({ accion: "guardar", clave: CLAVES.CLAVE_APP, version: 0, plan: s });
  assert.equal(env.P.CALENDARIO_PENDIENTE, "1");
  env.P.CORREOS_VISTOS = "[]";
  env.ctx.Gmail = gmailFalso([]);
  const r = env.ctx.revisarCorreo();
  assert.ok(r.calendario && r.calendario.ok, "no actualizó el calendario");
  assert.equal(env.P.CALENDARIO_PENDIENTE, "0");
  assert.equal(env.ctx.CalendarApp.eventos.length, r.calendario.eventos);
});

test("interpretar: Credisiman y Cuscatlán por correo", () => {
  const { ctx } = entorno(CLAVES);
  const sim = ctx.interpretar("Cliente, notificación de movimiento en su tarjeta  CREDISIMAN 08/11/2030 · Estimado(a) CLIENTE Se le informa que su tarjeta *CREDISIMAN 0005* ha realizado *compra* por USD *$* *1,391.81* en *TIENDA EJEMPLO*. Cualquier consulta...");
  assert.deepEqual([sim.tarjeta, sim.monto, sim.comercio, sim.fecha, sim.formato], ["0005", 1391.81, "TIENDA EJEMPLO", "2030-11-08 00:00", "credisiman"]);
  const pago = ctx.interpretar("notificación de movimiento en su tarjeta CREDISIMAN 08/11/2030 · su tarjeta *CREDISIMAN 0005* ha realizado *pago* por USD *$* *50.00* en *SUCURSAL*.");
  assert.equal(pago.ignorar, true);
  const cu = ctx.interpretar("Compra con Tarjeta de Credito Titular · 1213 Estimado Cliente: Se ha realizado una compra con su tarjeta titular de Banco CUSCATLAN XXXXXXXXXX0006 por USD 39.95 en TIENDA DE ROPA el día 2030-09-21 13:03. Consultas al 22220000.");
  assert.deepEqual([cu.tarjeta, cu.monto, cu.comercio, cu.fecha], ["0006", 39.95, "TIENDA DE ROPA", "2030-09-21 13:03"]);
  const e = ctx.interpretarEstado("Estado de cuenta de tarjeta Credisiman de noviembre corte 2030-11-13 · el estado de cuenta de su tarjeta CREDISIMAN número XXXXXXXXXXXX0005 Correspondiente al mes noviembre con fecha de corte 2030-11-13 Le recordamos...");
  assert.deepEqual([e.ok, e.tarjeta, e.fecha_corte, e.fecha_pago], [true, "0005", "2030-11-13", ""]);
  assert.equal(ctx.limpiarTexto("número XXXXXXXXXXXX0005"), "número ****0005");
});

test("correo: remitente que no pasa la verificación no entra", () => {
  const env = entorno(CLAVES); env.P.CORREOS_VISTOS = "[]";
  env.ctx.Gmail = gmailFalso([{ texto: CORREO_PRF, de: "BAC <alertas@baccredomatic.com>", auth: "mx.google.com; spf=fail smtp.mailfrom=otro.example; dmarc=fail" }]);
  const r = env.ctx.revisarCorreo();
  assert.equal(r.sinVerificar, 1); assert.equal(r.compras, 0);
  env.ctx.Gmail.correos.push({ texto: CORREO_ALERTAS, de: "BAC <alertas@baccredomatic.com>", auth: AUTH_BAC });
  assert.equal(env.ctx.revisarCorreo().compras, 1);
});

test("verificarRemitente: solo bancos de la lista, con el DMARC que escribe Gmail", () => {
  const { ctx } = entorno(CLAVES);
  const v = (de, ...auth) => ctx.verificarRemitente_([{ name: "From", value: de }].concat(auth.map(a => ({ name: "Authentication-Results", value: a }))), ctx.BANCOS);
  // correo legítimo (también desde un subdominio del banco)
  assert.equal(v("BAC Credomatic <alertas@baccredomatic.com>", AUTH_BAC).verificado, true);
  assert.equal(v("alertas@notificaciones.baccredomatic.com", "mx.google.com; dmarc=pass (p=REJECT) header.from=notificaciones.baccredomatic.com").verificado, true);
  // nombre visible con el dominio del banco, pero la dirección real es ajena
  const falso = v('"alertas@baccredomatic.com" <x@otro.example>', "mx.google.com; dmarc=pass (p=NONE) header.from=otro.example");
  assert.equal(falso.verificado, false); assert.equal(falso.dominio, "otro.example");
  // un segundo Authentication-Results inventado por quien envía no cuenta
  assert.equal(v("BAC <alertas@baccredomatic.com>", "mx.google.com; spf=fail smtp.mailfrom=otro.example; dmarc=fail (p=REJECT) header.from=baccredomatic.com", AUTH_BAC).verificado, false);
  // un encabezado que no es de Gmail tampoco cuenta, aunque esté primero
  assert.equal(v("BAC <alertas@baccredomatic.com>", "otro.servidor; dmarc=pass header.from=baccredomatic.com").verificado, false);
  // dmarc=pass de otro dominio no sirve
  assert.equal(v("BAC <alertas@baccredomatic.com>", "mx.google.com; dmarc=pass (p=NONE) header.from=otro.example").verificado, false);
  // un dominio que solo se parece al del banco
  assert.equal(v("BAC <alertas@falsobaccredomatic.com>", "mx.google.com; dmarc=pass header.from=falsobaccredomatic.com").verificado, false);
  assert.equal(v("BAC <alertas@baccredomatic.com.otro.example>", "mx.google.com; dmarc=pass header.from=baccredomatic.com.otro.example").verificado, false);
  // sin DMARC no entra
  assert.equal(v("BAC <alertas@baccredomatic.com>", "mx.google.com; dkim=pass header.i=@baccredomatic.com; spf=pass smtp.mailfrom=baccredomatic.com").verificado, false);
});

test("correo: el remitente falso no deja cargos, estados ni PDF", () => {
  const env = entorno(CLAVES); env.P.CORREOS_VISTOS = "[]";
  env.ctx.Gmail = gmailFalso([
    { texto: CORREO_PRF, de: '"alertas@baccredomatic.com" <x@otro.example>', auth: "mx.google.com; dmarc=pass header.from=otro.example" },
    { texto: CORREO_ESTADO, asunto: "Estado de Cuenta", pdf: true, de: '"BAC" <x@otro.example>', auth: "mx.google.com; dmarc=pass header.from=otro.example" },
  ]);
  const r = env.ctx.revisarCorreo();
  assert.equal(r.sinVerificar, 2); assert.equal(r.compras, 0); assert.equal(r.estados, 0);
  assert.equal(env.ctx.Drive.archivos.filter(f => f.mimeType === "application/pdf").length, 0);
});

test("estado de cuenta con PDF: se guarda en Drive una sola vez", () => {
  const env = entorno(CLAVES); env.P.CORREOS_VISTOS = "[]";
  env.ctx.Gmail = gmailFalso([{ texto: CORREO_ESTADO, asunto: "Estado de Cuenta Digital", pdf: true }]);
  assert.equal(env.ctx.revisarCorreo().estados, 1);
  const pdfs = env.ctx.Drive.archivos.filter(f => f.mimeType === "application/pdf");
  assert.equal(pdfs.length, 1); assert.equal(pdfs[0].name, "2030-11-08 BAC ····0004.pdf");
  const est = env.post({ accion: "leer", clave: CLAVES.CLAVE_APP }).estadosCuenta;
  assert.match(est[0].archivo, /^https:\/\/drive\.google\.com\//);
  env.ctx.estadosAnteriores(90);
  assert.equal(env.ctx.Drive.archivos.filter(f => f.mimeType === "application/pdf").length, 1, "no duplica el PDF");
});

test("correo: funciona si Gmail entrega los datos ya como bytes", () => {
  const env = entorno(CLAVES); env.P.CORREOS_VISTOS = "[]";
  env.ctx.Gmail = gmailFalso([CORREO_ALERTAS, { texto: CORREO_ESTADO, asunto: "Estado de Cuenta", pdf: true }], true);
  const r = env.ctx.revisarCorreo();
  assert.equal(r.compras, 1); assert.equal(r.estados, 1);
  assert.equal(env.ctx.Drive.archivos.filter(f => f.mimeType === "application/pdf").length, 1);
});

test("respaldo diario: guarda el plan en Drive y deja solo los últimos 30", () => {
  const env = entorno(CLAVES);
  const s = iniciar(require("./plan-ejemplo.js")());
  env.post({ accion: "guardar", clave: CLAVES.CLAVE_APP, version: 0, plan: s });
  const r = env.ctx.respaldoDiario();
  assert.equal(r.ok, true);
  const archivo = env.ctx.Drive.archivos.find(f => f.name === r.archivo);
  assert.deepEqual(JSON.parse(Buffer.from(archivo.blob.bytes).toString()).plan, JSON.parse(JSON.stringify(s)));
  const carpeta = archivo.parents[0];
  for (let i = 1; i <= 35; i++) env.ctx.Drive.Files.create({ name: `mi-plan-2029-01-${String(i).padStart(2, "0")}.json`, parents: [carpeta] });
  assert.equal(env.ctx.respaldoDiario().borrados, 6);
  assert.equal(env.ctx.Drive.archivos.filter(f => !f.trashed && f.parents && f.parents[0] === carpeta).length, 30);
});

test("ingresar acepta un formulario simple (Android, Atajos) con comillas en el texto", () => {
  const { ctx, post } = entorno(CLAVES);
  const sms = SMS2.replace("SUPER DE PRUEBA", 'SUPER "LA ESQUINA"');
  const r = JSON.parse(ctx.doPost({ postData: { type: "application/x-www-form-urlencoded", contents: "x" }, parameter: { accion: "ingresar", clave: CLAVES.CLAVE_INGRESO, texto: sms, origen: "sms" } }).texto);
  assert.equal(r.ok, true); assert.equal(r.interpretado, true);
  assert.equal(post({ accion: "leer", clave: CLAVES.CLAVE_APP }).porClasificar[0].comercio, 'SUPER "LA ESQUINA"');
  const malo = JSON.parse(ctx.doPost({ postData: { type: "application/x-www-form-urlencoded", contents: "x" }, parameter: { accion: "leer", clave: CLAVES.CLAVE_INGRESO } }).texto);
  assert.equal(malo.ok, false, "la clave de ingreso sigue sin poder leer");
});

test("ingresar acepta el SMS tal cual en el cuerpo con accion y clave en la dirección", () => {
  const { ctx, post } = entorno(CLAVES);
  const sms = SMS2.replace("SUPER DE PRUEBA", "A&B = 50% + OFERTA");
  const r = JSON.parse(ctx.doPost({ postData: { type: "text/plain", contents: sms }, parameter: { accion: "ingresar", clave: CLAVES.CLAVE_INGRESO, origen: "sms" } }).texto);
  assert.equal(r.ok, true); assert.equal(r.interpretado, true);
  assert.equal(post({ accion: "leer", clave: CLAVES.CLAVE_APP }).porClasificar[0].comercio, "A&B = 50% + OFERTA");
  const malo = JSON.parse(ctx.doPost({ postData: { type: "text/plain", contents: sms }, parameter: { accion: "ingresar", clave: "mala" } }).texto);
  assert.equal(malo.ok, false);
  const leerAsi = JSON.parse(ctx.doPost({ postData: { type: "text/plain", contents: "{}" }, parameter: { accion: "leer", clave: CLAVES.CLAVE_APP } }).texto);
  assert.equal(leerAsi.ok, false, "por la dirección solo se puede ingresar");
});

test("cambiar la clave de ingreso: solo con la de la app, y la vieja deja de servir", () => {
  const { post, P } = entorno(CLAVES);
  const nueva = "n".repeat(30);
  assert.equal(post({ accion: "cambiarClaveIngreso", clave: CLAVES.CLAVE_INGRESO, nueva }).ok, false, "la de ingreso no puede cambiarse sola");
  assert.equal(post({ accion: "cambiarClaveIngreso", clave: CLAVES.CLAVE_APP, nueva: "corta" }).ok, false);
  assert.equal(post({ accion: "cambiarClaveIngreso", clave: CLAVES.CLAVE_APP, nueva: CLAVES.CLAVE_APP + "xxxxxxxx" }).ok, true);
  assert.equal(post({ accion: "cambiarClaveIngreso", clave: CLAVES.CLAVE_APP, nueva: CLAVES.CLAVE_APP }).ok, false, "no puede ser igual a la de la app");
  assert.equal(post({ accion: "cambiarClaveIngreso", clave: CLAVES.CLAVE_APP, nueva }).ok, true);
  assert.equal(P.CLAVE_INGRESO, nueva);
  assert.equal(post({ accion: "ingresar", clave: CLAVES.CLAVE_INGRESO, texto: SMS1 }).ok, false, "la vieja ya no sirve");
  assert.equal(post({ accion: "ingresar", clave: nueva, texto: SMS1 }).ok, true);
});
