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

function entorno(props = {}) {
  const hojas = {};
  const P = Object.assign({}, props);
  const ctx = {
    SpreadsheetApp: { getActiveSpreadsheet: () => ({ getSheetByName: n => hojas[n] || null, insertSheet: n => (hojas[n] = hojaFalsa(n)) }) },
    PropertiesService: { getScriptProperties: () => ({ getProperty: k => (k in P ? P[k] : null), setProperty: (k, v) => { P[k] = String(v); }, setProperties: o => Object.assign(P, o) }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    ContentService: { MimeType: { JSON: "json" }, createTextOutput: t => ({ setMimeType: () => ({ texto: t }) }) },
    Utilities: { getUuid: () => require("crypto").randomUUID() },
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

test("claves: la de ingreso solo puede ingresar; se bloquea tras 5 fallos", () => {
  const { post, P } = entorno(CLAVES);
  assert.equal(post({ accion: "leer", clave: CLAVES.CLAVE_INGRESO }).ok, false);
  assert.equal(post({ accion: "ingresar", clave: CLAVES.CLAVE_INGRESO, texto: SMS1 }).ok, true);
  for (let i = 0; i < 4; i++) assert.equal(post({ accion: "leer", clave: "mala" }).bloqueado, undefined);
  post({ accion: "leer", clave: "mala" });
  const r = post({ accion: "leer", clave: CLAVES.CLAVE_APP });
  assert.equal(r.ok, false); assert.equal(r.bloqueado, true, "con la clave buena también debe esperar");
  P.BLOQUEO_HASTA = "0";
  assert.equal(post({ accion: "leer", clave: CLAVES.CLAVE_APP }).ok, true);
});

test("sin CLAVE_APP configurada no deja entrar a nadie", () => {
  const { post } = entorno({});
  assert.equal(post({ accion: "leer", clave: "" }).ok, false);
  assert.equal(post({ accion: "leer", clave: "cualquiera" }).ok, false);
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
});

test("al guardar se pueden marcar los movimientos ya clasificados", () => {
  const s = iniciar(require("./plan-ejemplo.js")());
  const { post } = entorno(CLAVES);
  const { id } = post({ accion: "ingresar", clave: CLAVES.CLAVE_APP, texto: SMS1 });
  post({ accion: "guardar", clave: CLAVES.CLAVE_APP, version: 0, plan: s, clasificados: [{ id, estado: "asignado", asignado_a: "sobre:super" }] });
  assert.equal(post({ accion: "leer", clave: CLAVES.CLAVE_APP }).porClasificar.length, 0);
});
