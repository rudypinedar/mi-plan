// Instalación de una sola vez: genera las dos claves, las guarda en
// privado/claves.json (no se sube), las instala en el Apps Script y luego
// importa privado/respaldo.json al Sheet.
// Uso: MIPLAN_TOKEN=... node herramientas/instalar.js   (lee la URL de privado/conexion.json)
// MIPLAN_TOKEN es el valor que Rudy puso a mano en TOKEN_INSTALACION (Propiedades del
// script). Sin ese token el script no acepta instalar; el token se borra al usarlo.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { execFileSync } = require("child_process");

const PRIV = path.join(__dirname, "..", "privado");
const { url } = JSON.parse(fs.readFileSync(path.join(PRIV, "conexion.json"), "utf8"));
const fClaves = path.join(PRIV, "claves.json");

const post = cuerpo => fetch(url, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify(cuerpo), redirect: "follow" })
  .then(async r => { const t = await r.text(); try { return JSON.parse(t); } catch (_) { throw new Error("El script no respondió JSON. ¿Ya lo autorizaste? (" + r.status + ")"); } });

(async () => {
  let claves;
  if (fs.existsSync(fClaves)) claves = JSON.parse(fs.readFileSync(fClaves, "utf8"));
  else {
    claves = { CLAVE_APP: crypto.randomBytes(24).toString("base64url"), CLAVE_INGRESO: crypto.randomBytes(24).toString("base64url") };
    fs.writeFileSync(fClaves, JSON.stringify(claves, null, 2) + "\n", { mode: 0o600 });
  }
  if (!process.env.MIPLAN_TOKEN) throw new Error("Falta MIPLAN_TOKEN (el valor de TOKEN_INSTALACION en Propiedades del script)");
  const r = await post({ accion: "instalar", token: process.env.MIPLAN_TOKEN, claveApp: claves.CLAVE_APP, claveIngreso: claves.CLAVE_INGRESO });
  if (!r.ok) throw new Error(r.error + " (¿ya estaba instalado o el token no coincide?)");
  console.log("Claves instaladas y pestañas creadas.");

  execFileSync(process.execPath, [path.join(__dirname, "importar.js")], {
    stdio: "inherit", env: Object.assign({}, process.env, { MIPLAN_URL: url, MIPLAN_CLAVE: claves.CLAVE_APP }),
  });
})().catch(e => { console.error("No se pudo instalar:", e.message); process.exit(1); });
