// Latido de la Mac: si hay una sesión de Claude Code abierta, avisa al script
// para que la app muestre "Pedir un ajuste a Claude" como disponible.
// Lo corre macOS cada 2 minutos (ver herramientas/latido.plist). No manda ningún
// dato: solo la hora. Si la Mac duerme o no hay sesión, no avisa y la app la
// muestra fuera de línea a los 5 minutos.
const { execFileSync } = require("child_process");
const path = require("path");
const PRIV = path.join(__dirname, "..", "privado");

function hayClaude() {
  try { return execFileSync("/usr/bin/pgrep", ["-x", "claude"], { encoding: "utf8" }).trim().length > 0; }
  catch (_) { return false; } // pgrep sale con error cuando no encuentra nada
}

(async () => {
  if (!hayClaude()) return;
  const { url } = require(path.join(PRIV, "conexion.json"));
  const { CLAVE_APP } = require(path.join(PRIV, "claves.json"));
  const ctl = new AbortController(); setTimeout(() => ctl.abort(), 30000);
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify({ accion: "latido", clave: CLAVE_APP }), signal: ctl.signal }).then(x => x.json());
  if (!r.ok) console.error(new Date().toISOString(), "latido rechazado:", r.error);
})().catch(e => console.error(new Date().toISOString(), "sin latido:", e.message));
