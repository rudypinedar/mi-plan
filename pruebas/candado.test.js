// Pruebas de js/candado.js: cifrado con código y con el secreto de la huella (PRF).
const test = require("node:test");
const assert = require("node:assert/strict");
const Candado = require("../js/candado.js");

function almacenFalso(inicial = {}) {
  const d = Object.assign({}, inicial);
  return { d, getItem: k => (k in d ? d[k] : null), setItem: (k, v) => { d[k] = String(v); }, removeItem: k => { delete d[k]; } };
}
const DATOS = { plan: { debts: [{ name: "Tarjeta Secreta de Prueba", balance: 1234.56 }] }, version: 7 };
const CONEXION = { url: "https://script.google.com/macros/s/X/exec", clave: "clave-super-secreta-de-prueba-123" };
const prfFalso = () => ({ credId: "cred1", sal: "c2Fs", salida: new Uint8Array(32).fill(7) });

function preparar() {
  const a = almacenFalso({ "miplan.datos": JSON.stringify(DATOS), "miplan.conexion": JSON.stringify(CONEXION), "miplan.theme": JSON.stringify("dark") });
  Candado.__almacen(a);
  return a;
}
const nadaEnClaro = a => !Object.values(a.d).some(v => /Tarjeta Secreta|clave-super-secreta|1234\.56/.test(v));

test("activar con código cifra todo lo sensible y deja lo demás", async () => {
  const a = preparar();
  assert.equal(Candado.activo(), false);
  const r = await Candado.activar({ pin: "4821" });
  assert.equal(r.conHuella, false);
  assert.ok(Candado.activo() && Candado.abierto());
  assert.ok(nadaEnClaro(a), "quedó algo sensible sin cifrar");
  assert.ok(a.d["miplan.datos"].startsWith("enc1:"));
  assert.equal(a.d["miplan.theme"], JSON.stringify("dark"), "lo que no es sensible no se toca");
  assert.deepEqual(Candado.get("miplan.datos"), DATOS);
});

test("cerrado no se lee nada; código malo no abre; el bueno sí", async () => {
  const a = preparar(); await Candado.activar({ pin: "4821" });
  Candado.cerrar();
  assert.equal(Candado.abierto(), false);
  assert.equal(Candado.get("miplan.conexion"), null);
  assert.equal(Candado.set("miplan.datos", { x: 1 }), false, "cerrado no se puede escribir");
  assert.equal((await Candado.conPin("0000")).ok, false);
  assert.equal((await Candado.conPin("4821")).ok, true);
  assert.deepEqual(Candado.get("miplan.conexion"), CONEXION);
  assert.ok(nadaEnClaro(a));
});

test("los cambios hechos con el candado abierto se guardan cifrados y sobreviven al cierre", async () => {
  const a = preparar(); await Candado.activar({ pin: "123456" });
  const nuevo = { plan: { debts: [{ name: "Tarjeta Secreta de Prueba", balance: 1000 }] }, version: 8 };
  Candado.set("miplan.datos", nuevo); Candado.set("miplan.porclasificar", [{ comercio: "Tarjeta Secreta de Prueba" }]);
  await Candado.listo();
  assert.ok(nadaEnClaro(a));
  Candado.cerrar(); await Candado.conPin("123456");
  assert.deepEqual(Candado.get("miplan.datos"), nuevo);
  assert.equal(Candado.get("miplan.porclasificar")[0].comercio, "Tarjeta Secreta de Prueba");
});

test("con huella (PRF): abre con el secreto correcto y no con otro; el código sigue sirviendo", async () => {
  preparar(); const prf = prfFalso();
  const r = await Candado.activar({ pin: "4821", prf });
  assert.equal(r.conHuella, true); assert.equal(Candado.conHuella(), true);
  Candado.cerrar();
  assert.equal((await Candado.conSalidaPrf(new Uint8Array(32).fill(8))).ok, false, "otra huella no abre");
  assert.equal((await Candado.conSalidaPrf(prf.salida)).ok, true);
  assert.deepEqual(Candado.get("miplan.datos"), DATOS);
  Candado.cerrar();
  assert.equal((await Candado.conPin("4821")).ok, true, "el código de respaldo también abre");
});

test("tras 3 códigos malos hay que esperar, y la espera crece", async () => {
  preparar(); await Candado.activar({ pin: "4821" }); Candado.cerrar();
  for (let i = 0; i < 2; i++) assert.equal((await Candado.conPin("1111")).espera, undefined);
  const r3 = await Candado.conPin("1111");
  assert.equal(r3.fallos, 3);
  const bloq = await Candado.conPin("4821");
  assert.equal(bloq.ok, false, "durante la espera ni el bueno entra"); assert.ok(bloq.espera > 0 && bloq.espera <= 30);
});

test("código: solo de 4 a 6 números", async () => {
  preparar();
  for (const malo of ["123", "1234567", "12a4", ""]) await assert.rejects(Candado.activar({ pin: malo }));
  assert.equal(Candado.activo(), false);
});

test("desactivar devuelve los datos a como estaban, sin cifrar", async () => {
  const a = preparar(); await Candado.activar({ pin: "4821" });
  await Candado.desactivar();
  assert.equal(Candado.activo(), false);
  assert.deepEqual(JSON.parse(a.d["miplan.datos"]), DATOS);
  assert.equal(a.d["miplan.candado"], undefined);
  assert.deepEqual(Candado.get("miplan.conexion"), CONEXION);
});

test("si se interrumpe al activar, lo que quedó sin cifrar se lee y se cifra al abrir", async () => {
  const a = preparar(); await Candado.activar({ pin: "4821" });
  a.d["miplan.estados"] = JSON.stringify([{ tarjeta: "0001" }]); // quedó en claro
  Candado.cerrar(); await Candado.conPin("4821");
  assert.deepEqual(Candado.get("miplan.estados"), [{ tarjeta: "0001" }]);
  await Candado.listo();
  assert.ok(a.d["miplan.estados"].startsWith("enc1:"));
});

test("borrar todo deja el teléfono como nuevo", async () => {
  const a = preparar(); await Candado.activar({ pin: "4821" });
  Candado.borrarTodo();
  assert.equal(Candado.activo(), false);
  assert.equal(a.d["miplan.datos"], undefined); assert.equal(a.d["miplan.conexion"], undefined);
  assert.equal(a.d["miplan.theme"], JSON.stringify("dark"));
});
