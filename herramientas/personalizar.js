// Agrega al plan lo personal que no va en el código (lo usa importar.js): nombres reales del banco
// y de quien paga (privado/nombres.json) y etiquetas e íconos
// (privado/etiquetas.json).
const fs = require("fs");
const path = require("path");
const PRIV = path.join(__dirname, "..", "privado");
const leer = f => { const p = path.join(PRIV, f); return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf8")) : null; };

module.exports = function personalizar(plan) {
  const nombres = leer("nombres.json"); if (nombres) plan.nombres = Object.assign({}, plan.nombres, nombres);
  const e = leer("etiquetas.json");
  if (e) {
    plan.etiquetas = e.etiquetas;
    for (const d of plan.debts || []) if (e.iconosDeudas && e.iconosDeudas[d.id] && !d.icon) d.icon = e.iconosDeudas[d.id];
    for (const x of plan.incomeExtra || []) if (e.iconosIngresos && e.iconosIngresos[x.id] && !x.icon) x.icon = e.iconosIngresos[x.id];
  }
  return plan;
};
