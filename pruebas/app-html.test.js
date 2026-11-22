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
