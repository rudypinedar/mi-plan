// Revisa js/app.js sin navegador: los números del plan (días, plazos, montos sueltos)
// no pueden entrar al HTML tal cual; pasan por nro() (solo dígitos), fmt() o esc().
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const APP = fs.readFileSync(path.join(__dirname, "..", "js", "app.js"), "utf8");

test("app.js: días, plazos y montos del plan no entran al HTML sin protección", () => {
  const malos = [];
  APP.split("\n").forEach((l, i) => {
    const re = /\$\{\s*[A-Za-z_]\w*\.(d|due|extra|cut|term|day|dia|limit|rate|cuota|balance|amount)\s*\}/g; let m;
    while ((m = re.exec(l))) malos.push(`línea ${i + 1}: ${m[0]}`);
  });
  assert.deepEqual(malos, []);
});

test("app.js: nro() deja pasar números y vacía lo demás", () => {
  const def = APP.match(/^const nro = .*$/m);
  assert.ok(def, "falta la función nro");
  const nro = new Function(def[0].replace(/^const nro = /, "return "))();
  assert.equal(nro(16), "16"); assert.equal(nro("25"), "25"); assert.equal(nro(2.5), "2.5");
  assert.equal(nro('16"><img src=x onerror=alert(1)>'), "");
  assert.equal(nro(null), "0"); assert.equal(nro(undefined), ""); assert.equal(nro({}), "");
});

// Las pruebas obligatorias del cierre (CLAUDE.md) revisan el motor: la app tiene que
// usar esas mismas funciones y no copias propias.
test("app.js: marcar, recalcular, cerrar, reabrir e iniciar mes usan el motor", () => {
  for (const f of ["ENG.marcar(", "ENG.recalcular(", "ENG.resumenCierre(", "ENG.cerrarMes(", "ENG.reabrirMes(", "ENG.iniciarSiguiente("])
    assert.ok(APP.includes(f), `app.js no usa ${f}`);
  assert.ok(!/delete m\.closed/.test(APP), "reabre el mes por su cuenta");
  assert.ok(!/S\.carryIncome\s*=/.test(APP), "manda el sobrante por su cuenta");
  assert.ok(!/it\.paid = true; it\.paidAmount = it\.amount; it\.paidAt/.test(APP), "marca pagado por su cuenta");
});

test("app.js: textos de cuándo pagar (la fecha es el límite; otro banco, 2 días antes)", () => {
  const ini = APP.indexOf("function textoVence("), fin = APP.indexOf("\n}\n", ini);
  assert.ok(ini > 0, "falta textoVence");
  const textoVence = new Function(APP.slice(ini, fin + 2) + "; return textoVence;")();
  assert.equal(textoVence(0, "26 nov", true, true), "Vence hoy");
  assert.equal(textoVence(1, "26 nov", true, false), "Vence mañana · 26 nov");
  assert.equal(textoVence(3, "26 nov", true, false), "Vence en 3 días · paga hasta el 26 nov");
  assert.equal(textoVence(2, "26 nov", true, true), "Paga ya · por transferencia tarda, vence el 26 nov");
  assert.equal(textoVence(3, "26 nov", true, true), "Vence en 3 días · paga hasta el 26 nov");
  assert.equal(textoVence(2, "30 nov", false, false), "Al recibir · vence el 30 nov");
  assert.ok(!/Págalo ya/.test(APP), "queda el texto viejo");
});
