// Aplica un ajuste al plan que vive en el Sheet, de forma segura.
//
// Uso:
//   node herramientas/ajuste.js privado/ajustes/2026-11-20-algo.js            (solo muestra qué cambiaría)
//   node herramientas/ajuste.js privado/ajustes/2026-11-20-algo.js --aplicar  (lo guarda)
//
// El archivo de ajuste (en privado/, nunca en el repo) exporta una función:
//   module.exports = (plan, ENG) => { ...modifica plan...; return "Texto para el historial"; };
//
// Antes de guardar revisa que el mes actual siga cuadrando, que no haya saldos
// negativos ni NaN, y muestra la proyección antes y después. Guarda con control
// de versión: si Rudy cambió algo en el teléfono mientras tanto, no pisa nada.
const fs = require("fs");
const path = require("path");
const ENG = require("../js/motor.js");

const PRIV = path.join(__dirname, "..", "privado");
const { url } = require(path.join(PRIV, "conexion.json"));
const { CLAVE_APP } = require(path.join(PRIV, "claves.json"));
const archivo = process.argv[2], aplicar = process.argv.includes("--aplicar");
if (!archivo) { console.error("Falta el archivo del ajuste"); process.exit(1); }

const post = b => fetch(url, { method: "POST", headers: { "Content-Type": "text/plain" }, body: JSON.stringify(Object.assign({ clave: CLAVE_APP }, b)) }).then(r => r.json());
const usd = n => "$" + ENG.r2(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const copia = x => JSON.parse(JSON.stringify(x));

function resumen(plan) {
  const p = ENG.project(copia(plan));
  const t = ENG.totals(plan.months[plan.current]);
  return { deuda: p.rows[0].debt, libreDe: p.debtFree, intereses: p.interest, mesLibre: t.free };
}
// Simula los próximos meses (marcando todo pagado) y avisa si alguno no cuadra
function mesesQueNoCuadran(plan, n = 6) {
  const s = copia(plan), out = [];
  let k = s.current;
  for (const it of s.months[k].items) if (!it.paid) { it.paid = true; it.paidAmount = it.amount; ENG.effect(s, it, 1); }
  for (let i = 0; i < n; i++) {
    k = ENG.keyAdd(k, 1);
    const m = ENG.generate(s, k); s.months[k] = m;
    const t = ENG.totals(m);
    if (t.free < -0.01) out.push(`${ENG.longLabel(k)}: faltan ${usd(-t.free)}`);
    for (const it of m.items) if (!it.paid) { it.paid = true; it.paidAmount = it.amount; ENG.effect(s, it, 1); }
  }
  return out;
}
function problemas(plan) {
  const out = [], malo = x => typeof x !== "number" || !Number.isFinite(x);
  for (const d of plan.debts) if (malo(d.balance) || d.balance < -0.005) out.push(`deuda ${d.name}: ${d.balance}`);
  for (const f of plan.funds) if (malo(f.balance) || f.balance < -0.005) out.push(`fondo ${f.name}: ${f.balance}`);
  for (const [k, m] of Object.entries(plan.months)) for (const it of m.items) if (malo(it.amount)) out.push(`${k} · ${it.name}: ${it.amount}`);
  try { ENG.project(copia(plan)); } catch (e) { out.push("la proyección falla: " + e.message); }
  const t = ENG.totals(plan.months[plan.current]); if (t.free < -0.01) out.push(`${ENG.longLabel(plan.current)}: faltan ${usd(-t.free)}`);
  try { out.push(...mesesQueNoCuadran(plan)); } catch (e) { out.push("no se pudo simular los próximos meses: " + e.message); }
  return out;
}
// Lista simple de diferencias por id (deudas, fondos, puntuales, fijos) y campos sueltos
function diferencias(a, b) {
  const out = [];
  for (const lista of ["debts", "funds", "oneoffs", "recurring", "incomeExtra", "fechas"]) {
    const A = new Map((a[lista] || []).map(x => [x.id, x])), B = new Map((b[lista] || []).map(x => [x.id, x]));
    for (const [id, x] of B) if (!A.has(id)) out.push(`+ ${lista}: ${x.name || id}`);
    for (const [id, x] of A) if (!B.has(id)) out.push(`- ${lista}: ${x.name || id}`);
    for (const [id, x] of A) if (B.has(id) && JSON.stringify(x) !== JSON.stringify(B.get(id)))
      for (const k of new Set([...Object.keys(x), ...Object.keys(B.get(id))])) if (JSON.stringify(x[k]) !== JSON.stringify(B.get(id)[k])) out.push(`~ ${lista}: ${x.name || id} · ${k}: ${JSON.stringify(x[k])} → ${JSON.stringify(B.get(id)[k])}`);
  }
  for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
    if (["debts", "funds", "oneoffs", "recurring", "incomeExtra", "fechas", "months", "log"].includes(k)) continue;
    if (JSON.stringify(a[k]) !== JSON.stringify(b[k])) out.push(`~ ${k}: ${JSON.stringify(a[k])?.slice(0, 80)} → ${JSON.stringify(b[k])?.slice(0, 80)}`);
  }
  for (const k of new Set([...Object.keys(a.months), ...Object.keys(b.months)])) if (JSON.stringify(a.months[k]) !== JSON.stringify(b.months[k])) out.push(`~ mes ${k}: cambió`);
  return out;
}

(async () => {
  const r = await post({ accion: "leer" });
  if (!r.ok) throw new Error(r.error);
  const antes = r.plan, despues = copia(antes);
  const texto = require(path.resolve(archivo))(despues, ENG);
  if (!texto || typeof texto !== "string") throw new Error("El ajuste debe devolver el texto para el historial");

  const p = problemas(despues);
  const ra = resumen(antes), rd = resumen(despues);
  console.log(`Ajuste: ${texto}\n`);
  diferencias(antes, despues).forEach(d => console.log("  " + d));
  console.log(`\n              antes            después`);
  console.log(`Deuda hoy     ${usd(ra.deuda).padEnd(16)} ${usd(rd.deuda)}`);
  console.log(`Sin deudas    ${String(ra.libreDe).padEnd(16)} ${rd.libreDe}`);
  console.log(`Intereses     ${usd(ra.intereses).padEnd(16)} ${usd(rd.intereses)}`);
  console.log(`Libre del mes ${usd(ra.mesLibre).padEnd(16)} ${usd(rd.mesLibre)}`);
  if (p.length) { console.log("\n✖ No se guarda: " + p.join(" · ")); process.exit(1); }
  if (!aplicar) { console.log("\n(Vista previa: no se guardó nada. Agrega --aplicar para guardarlo.)"); return; }

  despues.log = (despues.log || []).concat([{ at: Date.now(), t: texto }]).slice(-150);
  const g = await post({ accion: "guardar", version: r.version, plan: despues });
  if (!g.ok) throw new Error(g.conflicto ? "Rudy cambió algo en el teléfono mientras tanto: vuelve a correr el ajuste" : g.error);
  console.log(`\n✔ Guardado (versión ${g.version}). El teléfono lo verá al abrir la app.`);
})().catch(e => { console.error("✖", e.message); process.exit(1); });
