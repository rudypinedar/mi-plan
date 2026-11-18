// Utilidades para las pruebas del motor.
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ENG = require("../js/motor.js");
const planEjemplo = require("./plan-ejemplo.js");

const PRIVADO = path.join(__dirname, "..", "privado");
const clonar = x => JSON.parse(JSON.stringify(x));

// Arma un plan nuevo (sin meses) a partir de su primer mes
function iniciar(s) {
  const m = ENG.generate(s, s.startKey); s.months[m.key] = m; s.current = m.key;
  return s;
}

// Motor original, sacado de privado/mi-plan.html (solo existe en la computadora de Rudy)
function motorOriginal() {
  const f = path.join(PRIVADO, "mi-plan.html");
  if (!fs.existsSync(f)) return null;
  const html = fs.readFileSync(f, "utf8");
  const ini = html.indexOf("const ENG = (() => {");
  const fin = html.indexOf("if (typeof module", ini);
  if (ini < 0 || fin < 0) return null;
  const ctx = { Math, JSON, Object, Number, String, Date, Set, Array };
  vm.createContext(ctx);
  vm.runInContext(html.slice(ini, fin) + "\nthis.ENG = ENG;", ctx);
  return ctx.ENG;
}

// Nombres que no van en el repositorio (privado/nombres.json), si existen
function privados() {
  const f = path.join(PRIVADO, "nombres.json");
  return fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : null;
}

// Planes contra los que se corren las pruebas. El de ejemplo siempre;
// los reales solo si están en privado/.
function planes() {
  const lista = [{ nombre: "plan de ejemplo", crear: () => iniciar(planEjemplo()) }];
  const resp = path.join(PRIVADO, "respaldo.json");
  if (fs.existsSync(resp)) {
    const datos = JSON.parse(fs.readFileSync(resp, "utf8"));
    lista.push({ nombre: "respaldo real", crear: () => clonar(datos) });
  }
  const orig = motorOriginal();
  if (orig) {
    const semilla = orig.seed();
    // Los nombres reales que el motor original tenía escritos en el código
    const nombres = privados();
    lista.push({ nombre: "plan original de mi-plan.html", crear: () => iniciar(Object.assign(clonar(semilla), nombres ? { nombres } : {})) });
  }
  return lista;
}

// Marca todo lo del mes como pagado/recibido y gasta los sobres completos
function pagarTodo(s, k) {
  const m = s.months[k];
  for (const it of m.items) {
    if (it.envelope) { const falta = ENG.r2(it.amount - ENG.spentOf(it)); if (falta > 0) ENG.anotarGasto(s, it, falta, "prueba"); continue; }
    if (!it.paid) ENG.marcar(s, it, true);
  }
}

// Busca NaN, Infinity y saldos negativos. Devuelve la lista de problemas.
function problemas(s) {
  const p = [];
  const malo = x => typeof x !== "number" || !Number.isFinite(x);
  for (const d of s.debts) {
    if (malo(d.balance)) p.push(`deuda ${d.id}: saldo ${d.balance}`);
    else if (d.balance < -0.005) p.push(`deuda ${d.id}: saldo negativo ${d.balance}`);
  }
  for (const f of s.funds) {
    if (malo(f.balance)) p.push(`fondo ${f.id}: saldo ${f.balance}`);
    else if (f.balance < -0.005) p.push(`fondo ${f.id}: saldo negativo ${f.balance}`);
  }
  for (const [k, m] of Object.entries(s.months)) {
    for (const it of m.items) {
      if (malo(it.amount)) p.push(`${k} · ${it.name}: monto ${it.amount}`);
      else if (it.amount < -0.005) p.push(`${k} · ${it.name}: monto negativo ${it.amount}`);
      if (it.paid && malo(it.paidAmount)) p.push(`${k} · ${it.name}: pagado ${it.paidAmount}`);
    }
    const t = ENG.totals(m);
    for (const [n, v] of Object.entries(t)) if (malo(v)) p.push(`${k} · totales.${n} = ${v}`);
  }
  return p;
}

// ¿Queda algún destino en la cascada que todavía pueda recibir dinero?
function quedaDestino(s, m) {
  const k = m.key;
  if (k < s.waterfallFrom) return true; // antes de la cascada el sobrante no se reparte: debe ser 0
  const plan = {}; for (const it of m.items) {
    if (it.paid) continue; // lo ya pagado ya bajó el saldo
    if (it.debtId && (it.debtSign ?? -1) === -1 && it.source !== "income") plan[it.debtId] = (plan[it.debtId] || 0) + it.amount * (it.ratio ?? 1);
    if (it.fundId) plan["fund:" + it.fundId] = (plan["fund:" + it.fundId] || 0) + it.amount;
  }
  for (const t of s.order) {
    if (t.startsWith("fund:")) {
      const f = ENG.fundById(s, t.slice(5)); if (!f || f.target == null) continue;
      if (f.target - f.balance - (plan[t] || 0) > 0.01) return true;
      continue;
    }
    const d = ENG.debtById(s, t); if (!d || d.closed || d.start > k) continue;
    const resto = d.balance - (plan[t] || 0);
    if (d.cap != null) continue;               // con tope: ya recibió lo que le toca
    if ((d.kind === "person" || d.round5) && resto < 5) continue; // múltiplos de $5
    if (resto > 0.5) return true;
  }
  return false;
}

module.exports = { privados, ENG, clonar, iniciar, planes, pagarTodo, problemas, quedaDestino, motorOriginal, planEjemplo };
