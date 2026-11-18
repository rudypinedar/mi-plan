// Pruebas de js/datos.js: el código de conexión.
const test = require("node:test");
const assert = require("node:assert/strict");
const Datos = require("../js/datos.js");

const URL_OK = "https://script.google.com/macros/s/AKfyEJEMPLO_de-prueba123/exec";
const codigo = (u, k) => "miplan1:" + Buffer.from(JSON.stringify({ u, k })).toString("base64url");

test("lee un código de conexión válido", () => {
  assert.deepEqual(Datos.leerCodigo(codigo(URL_OK, "x".repeat(32))), { url: URL_OK, clave: "x".repeat(32) });
  assert.deepEqual(Datos.leerCodigo("  " + codigo(URL_OK, "y".repeat(32)) + "\n"), { url: URL_OK, clave: "y".repeat(32) }, "acepta espacios al copiar");
});

test("rechaza códigos incompletos o de otro sitio", () => {
  assert.equal(Datos.leerCodigo(""), null);
  assert.equal(Datos.leerCodigo("hola"), null);
  assert.equal(Datos.leerCodigo(codigo(URL_OK, "corta")), null, "clave muy corta");
  assert.equal(Datos.leerCodigo(codigo("https://otro-sitio.com/exec", "x".repeat(32))), null, "solo acepta Apps Script");
  assert.equal(Datos.leerCodigo(codigo(URL_OK, "x".repeat(32)).slice(0, 30)), null, "código cortado");
});
