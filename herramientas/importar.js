// Sube privado/respaldo.json al Google Sheet (una sola vez, o para restaurar).
// Uso:  MIPLAN_URL=https://script.google.com/.../exec MIPLAN_CLAVE=... node herramientas/importar.js [--forzar]
// La URL y la clave se pasan por variables de entorno: nunca se escriben en el código.
const fs = require("fs");
const path = require("path");

const url = process.env.MIPLAN_URL, clave = process.env.MIPLAN_CLAVE;
const forzar = process.argv.includes("--forzar");
if (!url || !clave) { console.error("Faltan MIPLAN_URL y MIPLAN_CLAVE"); process.exit(1); }

const archivo = path.join(__dirname, "..", "privado", "respaldo.json");
const plan = JSON.parse(fs.readFileSync(archivo, "utf8"));
if (!plan.months || !plan.debts) { console.error("respaldo.json no parece un respaldo de Mi plan"); process.exit(1); }
// Nombres reales (banco, quien paga los honorarios) que no van en el código
const fNombres = path.join(__dirname, "..", "privado", "nombres.json");
if (!plan.nombres && fs.existsSync(fNombres)) plan.nombres = JSON.parse(fs.readFileSync(fNombres, "utf8"));

const post = cuerpo => fetch(url, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify(cuerpo), redirect: "follow" }).then(r => r.json());

(async () => {
  const l = await post({ accion: "leer", clave });
  if (!l.ok) throw new Error(l.error);
  if (l.version > 0 && !forzar) { console.error(`El Sheet ya tiene datos (versión ${l.version}). Usa --forzar para reemplazarlos.`); process.exit(1); }
  const g = await post({ accion: "guardar", clave, version: l.version, plan, forzar });
  if (!g.ok) throw new Error(g.error);
  console.log(`Listo: ${Object.keys(plan.months).length} meses y ${plan.debts.length} deudas importados (versión ${g.version}).`);
})().catch(e => { console.error("No se pudo importar:", e.message); process.exit(1); });
