/*
 * Mi plan — motor del presupuesto (ENG).
 *
 * Portado de la app original (objeto ENG). La lógica de project, effect,
 * generate y totals se copió sin cambios. No contiene datos personales:
 * el plan real se carga desde el Google Sheet o desde un respaldo.
 *
 * Además incluye, como funciones puras, lo que en la app original vivía en
 * los botones de la pantalla: marcar pagos, cerrar, reabrir, iniciar el mes
 * siguiente y recalcular. Así se pueden probar en Node.
 *
 * Funciona en el navegador (window.ENG) y en Node (require).
 */
(function (root, factory) {
  if (typeof module !== "undefined" && module.exports) module.exports = factory();
  else root.ENG = factory();
})(typeof self !== "undefined" ? self : this, function () {
  const MES = ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"];
  const r2 = x => Math.round((x + Number.EPSILON) * 100) / 100;
  const keyAdd = (k, n) => { let [y, m] = k.split("-").map(Number); m += n; while (m > 12) { m -= 12; y++; } while (m < 1) { m += 12; y--; } return `${y}-${String(m).padStart(2, "0")}`; };
  const label = k => { const [y, m] = k.split("-").map(Number); return `${MES[m - 1]} ${String(y).slice(2)}`; };
  const longLabel = k => { const [y, m] = k.split("-").map(Number); const L = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"]; return `${L[m - 1]} ${y}`; };
  const sched = (s, k) => { let v = 0; for (const e of (s || [])) if (e.from <= k) v = e.amount; return v; };
  const uid = () => Math.random().toString(36).slice(2, 9);


  // Plan vacío. Los datos reales nunca viven en el código.
  function seed(startKey) {
    const k = startKey || "2026-10";
    return {
      v: 1, startKey: k, current: k, puente: 0, waterfallFrom: k, saleTotal: 0,
      income: [{ from: k, amount: 0 }],
      incomeExtra: [], debts: [], order: [], funds: [], recurring: [], oneoffs: [],
      months: {}, fechas: seedFechas(),
    };
  }
  function seedFechas() { return []; }
  // Proyección: termina el mes actual como está planeado y simula hacia adelante
  function project(s0, opt = {}) {
    const max = opt.max || 120, extraM = opt.extraMonthly || 0, extraOnce = opt.extraOnce || 0;
    const s = JSON.parse(JSON.stringify(s0)); const cur = s.months[s.current]; s.months = {};
    for (const it of cur.items) if (!it.paid) { it.paid = true; it.paidAmount = it.amount; effect(s, it, 1); }
    const isDebtFree = k => s.debts.every(d => d.closed || d.kind === "installment" && d.balance <= 0.01 || d.balance <= 0.5);
    const started = k => s.debts.filter(d => !d.closed && (d.since || d.start) <= k);
    const snap = (k, m) => ({ k, debt: r2(started(k).reduce((a, d) => a + d.balance, 0)), by: Object.fromEntries(s.debts.map(d => [d.id, d.balance])), funds: Object.fromEntries(s.funds.map(f => [f.id, f.balance])), extra: m ? r2(m.items.filter(i => i.kind === "waterfall").reduce((a, i) => a + i.amount, 0)) : 0, pay: m ? payOf(m) : {}, chg: m ? chgOf(m) : {}, ints: m ? Object.assign({}, m.interest) : {}, interest: m ? r2(Object.values(m.interest).reduce((a, x) => a + x, 0)) : 0 });
    const payOf = m => { const o = {}; for (const it of m.items) if (it.debtId && (it.debtSign ?? -1) === -1 && it.source !== "income") o[it.debtId] = r2((o[it.debtId] || 0) + (it.paidAmount ?? it.amount) * (it.ratio ?? 1)); return o; };
    const chgOf = m => { const o = {}; for (const it of m.items) if (it.debtId && (it.debtSign ?? -1) === 1) o[it.debtId] = r2((o[it.debtId] || 0) + (it.paidAmount ?? it.amount) * (it.ratio ?? 1)); return o; };
    const rows = [snap(s.current, null)]; const ms = []; const seen = new Set();
    const check = k => {
      for (const d of s.debts) if (!seen.has(d.id) && d.kind !== "installment" && !d.closed && d.start <= k && d.balance <= 0.5 && (d.initial || 0) > 0.5) { seen.add(d.id); ms.push({ k, t: d.name, type: "debt" }); }
      for (const f of s.funds) if (!seen.has("f:" + f.id) && f.target && f.balance >= f.target - 0.01) { seen.add("f:" + f.id); ms.push({ k, t: f.name, type: "fund" }); }
    };
    for (const d of s.debts) if (d.balance <= 0.5) seen.add(d.id);
    for (const f of s.funds) if (f.target && f.balance >= f.target - 0.01) seen.add("f:" + f.id);
    let k = s.current, free = null, interest = 0; const interestBy = {};
    for (let i = 1; i <= max; i++) {
      k = keyAdd(k, 1);
      const inc = (i === 1 ? extraOnce : 0) + extraM;
      if (inc > 0) s.oneoffs.push({ id: uid(), month: k, name: "Ingreso extra (simulación)", type: "income", amount: inc });
      const m = generate(s, k);
      for (const it of m.items) if (!it.paid) { it.paid = true; it.paidAmount = it.amount; effect(s, it, 1); }
      const row = snap(k, m); rows.push(row); interest += row.interest; check(k);
      for (const [id, x] of Object.entries(m.interest)) interestBy[id] = r2((interestBy[id] || 0) + x);
      const future = s.debts.some(d => !d.closed && d.start > k && d.balance > 0.5);
      if (!future && isDebtFree(k)) { free = k; break; }
    }
    return { rows, milestones: ms, debtFree: free, interest: r2(interest), interestBy };
  }

  const active = (dbt, k) => !dbt.closed && dbt.start <= k;
  const debtById = (s, id) => s.debts.find(x => x.id === id);
  const fundById = (s, id) => s.funds.find(x => x.id === id);

  // Aplica el efecto de un ítem (pago/recibido) sobre deudas y fondos. sign=+1 aplicar, -1 revertir
  function effect(s, it, sign) {
    const amt = (it.paidAmount ?? it.amount) || 0;
    if (it.debtId) {
      const d = debtById(s, it.debtId);
      if (d) { const ratio = it.ratio ?? 1; const ds = it.debtSign ?? -1; d.balance = r2(Math.max(0, d.balance + sign * ds * amt * ratio)); }
    }
    if (it.fundId) { const f = fundById(s, it.fundId); if (f) f.balance = r2(f.balance + sign * amt); }
  }

  function generate(s, k, opts = {}) {
    const isFirst = k === s.startKey;
    const items = []; const interest = {};
    // 1) intereses del mes
    for (const d of s.debts) if (active(d, k) && d.balance > 0 && d.rate > 0) { const x = r2(d.balance * d.rate / 12); d.balance = r2(d.balance + x); interest[d.id] = x; }
    const debtStart = r2(s.debts.filter(d => !d.closed && (d.since || d.start) <= k).reduce((a, d) => a + d.balance, 0));
    const proj = {}; for (const d of s.debts) proj[d.id] = d.balance;
    const add = o => { const it = Object.assign({ id: uid(), paid: false, paidAmount: null, source: "salary" }, o); it.amount = r2(it.amount); items.push(it); return it; };
    // 2) ingresos
    add({ kind: "income", source: "income", name: s.salaryName || "Salario líquido", cat: "Ingresos", amount: sched(s.income, k) });
    for (const x of (s.incomeExtra || [])) { const a = sched(x.schedule, k); if (a > 0) add({ kind: "income", source: "income", name: x.name, cat: "Ingresos", amount: a, note: x.note, incId: x.id }); }
    if (s.carryIncome && s.carryIncome[k] > 0) add({ kind: "carry", source: "income", name: "Sobrante del mes anterior", cat: "Ingresos", amount: s.carryIncome[k] });
    const one = s.oneoffs.filter(o => o.month === k);
    // 2b) pagos ya planeados a mano (se respetan al recalcular)
    const keptPay = {};
    for (const it of (opts.keep || [])) if (it.debtId && (it.debtSign ?? -1) === -1 && it.source !== "income" && proj[it.debtId] != null) { const v = (it.paid ? it.paidAmount : it.amount) * (it.ratio ?? 1); proj[it.debtId] -= v; keptPay[it.debtId] = (keptPay[it.debtId] || 0) + v; }
    // 3) préstamos con cuota
    for (const d of s.debts.filter(d => d.kind === "loan" && active(d, k) && d.balance > 0.5)) {
      const portion = d.portion ?? d.cuota; const pAmt = Math.min(portion, proj[d.id]); const amount = pAmt + (d.cuota - portion);
      const it = add({ kind: "loan", name: d.name + " — cuota", cat: "Préstamos", payWith: d.payWith, amount, debtId: d.id, ratio: amount ? r2(pAmt) / r2(amount) : 1, due: d.due, note: d.note });
      proj[d.id] -= pAmt;
      if (d.auto) { it.paid = true; it.paidAmount = it.amount; it.autoPaid = true; effect(s, it, 1); }
    }
    // 4) gastos fijos
    for (const r of s.recurring) {
      const a = sched(r.schedule, k); if (!(a > 0)) continue;
      let pw = r.payWith; const card = s.debts.find(d => d.kind === "card" && d.payWith === pw);
      if (card && r.payWithAlt && (card.closed || card.balance <= 0.5)) pw = r.payWithAlt;
      const it = add({ kind: "fixed", name: r.name, cat: r.cat, payWith: pw, amount: a, recId: r.id });
      if (r.envelope) { it.envelope = true; it.spent = []; }
    }
    // 5) únicos del mes (gastos)
    for (const o of one.filter(o => !o.type)) {
      let amount = o.amount;
      if (o.auto === "puenteRepay") amount = s.puente || 0;
      if (!amount) continue;
      const it = add({ kind: "oneoff", name: o.name, cat: o.cat, payWith: o.payWith, amount, debtId: o.debtId, note: o.note });
      if (o.debtId) proj[o.debtId] -= amount;
    }
    for (const c of (s.carry && s.carry[k]) || []) add({ kind: "carry", name: c.name, cat: c.cat || "Otros", payWith: c.payWith, amount: c.amount, note: "Pendiente del mes anterior" });
    // 6) fondos programados
    for (const f of s.funds) { let a = sched(f.schedule, k); if (f.target != null) a = Math.min(a, Math.max(0, f.target - f.balance)); if (a > 0) add({ kind: "fund", name: f.label || ("Fondo " + f.name.charAt(0).toLowerCase() + f.name.slice(1)), cat: "Fondos", payWith: f.payWith || "Cuenta de ahorro", amount: a, fundId: f.id }); }
    // 7) cuotas 0%
    const instItems = {};
    for (const d of s.debts.filter(d => d.kind === "installment" && active(d, k) && proj[d.id] > 0.005)) {
      instItems[d.id] = add({ kind: "installment", name: d.name, cat: "Cuotas 0%", payWith: d.payWith, amount: Math.min(d.cuota, proj[d.id]), debtId: d.id, due: d.due, note: d.parent ? "Va dentro del pago de la tarjeta" : (d.note || "") });
      proj[d.id] -= instItems[d.id].amount;
    }
    // 8) mínimos de tarjetas (+ extra)
    const cardItems = {};
    for (const id of s.order.filter(x => !x.startsWith("fund:")).concat(s.debts.filter(d => d.kind === "card").map(d => d.id))) {
      const d = debtById(s, id); if (!d || d.kind !== "card" || cardItems[id] || !active(d, k) || proj[id] <= 0.5) continue;
      const mn0 = Math.min(proj[id], r2(proj[id] * d.minPct) + (k >= d.extraFrom ? d.extra : 0));
      const mn = r2(mn0 - (keptPay[id] || 0)); if (mn <= 0.01) continue;
      cardItems[id] = add({ kind: "card", name: d.name + " — pago", cat: "Tarjetas", payWith: d.payWith, amount: mn, debtId: id, due: d.due, note: k >= d.extraFrom && d.extra ? `Mínimo + $${d.extra}` : "Mínimo" });
      proj[id] -= mn;
    }
    // 9) extras (dinero que no es del salario) — reducen proyecciones
    const extrasPlanned = one.filter(o => o.type === "extra" && o.auto !== "saleRest");
    for (const o of extrasPlanned) if (o.debtId) proj[o.debtId] -= o.amount * ((o.debtSign ?? -1) === 1 ? -1 : 1);
    // 10) libre y cobertura automática
    const incomeT = () => items.filter(i => i.source === "income").reduce((a, i) => a + i.amount, 0);
    const expT = () => items.filter(i => i.source === "salary").reduce((a, i) => a + i.amount, 0);
    let free = r2(incomeT() - expT());
    for (const o of one.filter(o => o.type === "income")) {
      let amount = o.amount || 0;
      if (o.auto === "cover") amount = free < 0 ? r2(-free) : 0;
      if (amount > 0) { add({ kind: "income", source: "income", name: o.name, cat: "Ingresos", amount, debtId: o.debtId, debtSign: o.debtSign, note: o.note }); free = r2(free + amount); if (o.auto === "cover" && o.debtId) s.puente = amount; }
    }
    // extras
    const saleFixed = one.filter(o => o.type === "extra" && o.name.startsWith("Venta") && o.auto !== "saleRest").reduce((a, o) => a + o.amount, 0);
    const apoyo = items.filter(i => i.source === "income" && i.name.startsWith("Apoyo")).reduce((a, i) => a + i.amount, 0);
    for (const o of one.filter(o => o.type === "extra")) {
      let amount = o.amount;
      if (o.auto === "saleRest") { amount = r2(Math.min(s.saleTotal - saleFixed - apoyo, Math.max(0, proj[o.debtId]))); if (o.debtId) proj[o.debtId] -= amount; }
      if (amount > 0) add({ kind: "extra", source: "extra", name: o.name, cat: "Dinero extra", amount, debtId: o.debtId, debtSign: o.debtSign, note: o.note });
    }
    // 11) cascada (bola de nieve)
    if (k >= s.waterfallFrom && free > 0.004) {
      for (const t of s.order) {
        if (free <= 0.004) break;
        if (t.startsWith("fund:")) {
          const f = fundById(s, t.slice(5)); if (!f || f.target == null) continue;
          const planned = items.filter(i => i.fundId === f.id).reduce((a, i) => a + i.amount, 0);
          const p = r2(Math.min(free, f.target - f.balance - planned)); if (p <= 0.004) continue;
          add({ kind: "waterfall", name: "Fondo " + f.name.toLowerCase(), cat: "Fondos", payWith: "Cuenta de ahorro", amount: p, fundId: f.id, note: `Meta $${f.target.toLocaleString("en-US")}` }); free = r2(free - p); continue;
        }
        const d = debtById(s, t); if (!d || !active(d, k) || proj[t] <= 0.5) continue;
        let p = Math.min(free, proj[t]); if (d.cap != null) p = Math.min(p, d.cap); p = r2(p);
        if ((d.kind === "person" || d.round5) && p < proj[t] - 0.004) p = Math.floor(p / 5) * 5; // a familia: montos redondos (múltiplos de $5)
        if (p <= 0.004) continue;
        if (d.kind === "card" && cardItems[t]) { cardItems[t].amount = r2(cardItems[t].amount + p); cardItems[t].note = "Mínimo + abono fuerte"; }
        else add({ kind: "waterfall", name: d.name + (d.kind === "person" ? " — abono" : " — abono extra"), cat: "Abonos", payWith: d.payWith, amount: p, debtId: t, note: d.kind === "loan" && d.auto ? "A capital, reduciendo plazo (día 10–12)" : "" });
        proj[t] -= p; free = r2(free - p);
        if (d.kind === "card" && proj[t] <= 0.5) {
          if (cardItems[t]) cardItems[t].note = "¡Queda en cero!";
          for (const ins of s.debts.filter(x => x.kind === "installment" && x.parent === t && x.liquidate && proj[x.id] > 0.005)) {
            if (free >= proj[ins.id]) { const it = instItems[ins.id]; const extra = r2(proj[ins.id]); if (it) { it.amount = r2(it.amount + extra); it.note = "Liquidación total · cerrar tarjeta"; } free = r2(free - extra); proj[ins.id] = 0; }
          }
        }
      }
    }
    { // lo tuyo vs. lo de Hacienda: los honorarios caen en la cuenta de impuestos
      // Los nombres reales del banco y de quien paga viven en el plan (config del Sheet), no en el código
      const banco = (s.nombres && s.nombres.cuentaImpuestos) || "la cuenta de impuestos", pagador = (s.nombres && s.nombres.pagador) || "el cliente";
      const fmtUSD = n => "$" + r2(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const hon = items.find(i => i.source === "income" && /^Honorarios/.test(i.name));
      if (hon) {
        const ivaIn = items.filter(i => i.source === "income" && /^IVA cobrado/.test(i.name)).reduce((a, i) => a + i.amount, 0);
        const tax = items.filter(i => i.source === "salary" && i.payWith === "Cuenta de impuestos");
        const keep = r2(tax.reduce((a, i) => a + i.amount, 0));
        const mine = r2(hon.amount + ivaIn - keep);
        if (mine > 0) add({ kind: "extra", source: "extra", name: `Mover de ${banco} a tu cuenta (lo tuyo)`, cat: "Dinero extra", amount: mine, tag: "mine", note: `De los ${fmtUSD(hon.amount + ivaIn)} que deposita ${pagador}, deja ${fmtUSD(keep)} en ${banco}: ` + tax.map(i => `${i.name.replace(/ \(declaración de abril\)| → Hacienda.*$/g, "")} ${fmtUSD(i.amount)}`).join(" · ") });
      }
    }
    return { key: k, items, interest, debtStart, generatedAt: new Date().toISOString() };
  }

  const spentOf = i => r2((i.spent || []).reduce((a, x) => a + x.amount, 0));
  function totals(m) {
    const inc = m.items.filter(i => i.source === "income").reduce((a, i) => a + (i.paid ? i.paidAmount : i.amount), 0);
    const exp = m.items.filter(i => i.source === "salary");
    const val = i => i.envelope ? Math.max(i.amount, spentOf(i)) : i.paid ? i.paidAmount : i.amount;
    const total = exp.reduce((a, i) => a + val(i), 0);
    const paid = exp.reduce((a, i) => a + (i.envelope ? spentOf(i) : i.paid ? i.paidAmount : 0), 0);
    const reg = exp.filter(i => !i.envelope);
    return { inc: r2(inc), total: r2(total), paid: r2(paid), pending: r2(total - paid), free: r2(inc - total), nPending: reg.filter(i => !i.paid && i.amount > 0).length, nTotal: reg.length };
  }

  // ---------- operaciones del mes (antes vivían en los botones) ----------

  // Deuda total que ya cuenta en el mes actual
  function deudaTotal(s) { return r2(s.debts.filter(d => !d.closed && (d.since || d.start) <= s.current).reduce((a, d) => a + d.balance, 0)); }
  const mesesOrdenados = s => Object.keys(s.months).sort();
  const buscarItem = (s, k, id) => (s.months[k] && s.months[k].items.find(i => i.id === id)) || null;

  // Marca o desmarca un ítem. monto opcional para pagos parciales.
  function marcar(s, it, pagado, monto) {
    if (it.paid) { effect(s, it, -1); it.paid = false; it.paidAmount = null; }
    if (pagado) { it.paid = true; it.paidAmount = r2(monto != null ? monto : it.amount); effect(s, it, 1); }
    return it;
  }

  // Anota un gasto contra un sobre. Si cardId, sube el saldo de esa tarjeta.
  function anotarGasto(s, it, monto, nota, cardId) {
    const e = { id: uid(), at: new Date().toISOString(), amount: r2(monto), note: nota || "" };
    if (cardId) { e.cardId = cardId; const d = debtById(s, cardId); if (d) d.balance = r2(d.balance + e.amount); }
    (it.spent = it.spent || []).push(e);
    return e;
  }

  // Lo que muestra la pantalla de cierre, sin tocar nada
  function resumenCierre(s, k) {
    const m = s.months[k], t = totals(m), nk = keyAdd(k, 1);
    const planned = r2(m.items.filter(i => i.source === "salary").reduce((a, i) => a + i.amount, 0));
    const unpaid = m.items.filter(i => i.source === "salary" && !i.envelope && !i.paid && i.amount > 0);
    const carryable = unpaid.filter(i => !i.debtId && !i.fundId);
    const envLeft = r2(m.items.filter(i => i.envelope).reduce((a, i) => a + Math.max(0, i.amount - spentOf(i)), 0));
    const incPending = m.items.filter(i => i.source === "income" && !i.paid && i.amount > 0);
    return {
      k, nk, planned, real: t.total, diff: r2(t.total - planned), unpaid, carryable,
      carryTotal: r2(carryable.reduce((a, i) => a + i.amount, 0)),
      leftover: r2(envLeft + Math.max(0, t.free)), incPending,
      debtStart: m.debtStart, debtEnd: deudaTotal(s),
      // Igual que la app: el sobrante se manda por defecto solo si ya entraron todos los ingresos
      sugerido: { pasarPendientes: carryable.length > 0, mandarSobrante: incPending.length === 0 },
    };
  }

  // Cierra el mes k. opts: { pasarPendientes, mandarSobrante, iniciarSiguiente, ahora }
  function cerrarMes(s, k, opts = {}) {
    const m = s.months[k]; if (!m) throw new Error("No existe el mes " + k);
    const r = resumenCierre(s, k), nk = r.nk;
    const doCarry = (opts.pasarPendientes ?? r.sugerido.pasarPendientes) && r.carryable.length > 0;
    const doLeft = (opts.mandarSobrante ?? r.sugerido.mandarSobrante) && r.leftover > 0.5;
    if (doCarry) {
      s.carry = s.carry || {};
      s.carry[nk] = (s.carry[nk] || []).concat(r.carryable.map(i => ({ name: i.name, cat: i.cat, payWith: i.payWith, amount: i.amount })));
      for (const i of r.carryable) i.note = (i.note ? i.note + " · " : "") + "pasado a " + label(nk);
    }
    if (doLeft) { s.carryIncome = s.carryIncome || {}; s.carryIncome[nk] = r2((s.carryIncome[nk] || 0) + r.leftover); }
    m.closed = opts.ahora || new Date().toISOString(); m.debtEnd = r.debtEnd;
    m.summary = { planned: r.planned, real: r.real, diff: r.diff, debtStart: r.debtStart, debtEnd: r.debtEnd, carried: doCarry ? r.carryTotal : 0, leftover: doLeft ? r.leftover : 0 };
    // Si el mes siguiente ya existe, hay que recalcularlo para que tome lo pasado
    const recalcular = !!(s.months[nk] && (doCarry || doLeft));
    let siguiente = null;
    if (opts.iniciarSiguiente && !s.months[nk]) siguiente = iniciarSiguiente(s);
    return { resumen: m.summary, siguiente, recalcular };
  }

  // Arma el mes que sigue al último, con los saldos de hoy
  function iniciarSiguiente(s) {
    const last = mesesOrdenados(s).at(-1); const nk = keyAdd(last, 1);
    if (s.months[last].debtEnd == null) s.months[last].debtEnd = deudaTotal(s);
    const m = generate(s, nk); s.months[nk] = m; s.current = nk;
    return m;
  }

  function reabrirMes(s, k) { const m = s.months[k]; if (m) { delete m.closed; } return m; }

  // Recalcula el mes k con los saldos actuales; conserva lo marcado y lo manual
  function recalcular(s, k) {
    const old = s.months[k];
    for (const it of old.items) if (it.paid) effect(s, it, -1);
    for (const [id, x] of Object.entries(old.interest || {})) { const d = debtById(s, id); if (d) d.balance = r2(d.balance - x); }
    const keepManual = old.items.filter(i => i.kind === "manual");
    const m = generate(s, k, { keep: keepManual });
    const used = new Set();
    for (const o of old.items.filter(i => i.paid && i.kind !== "manual")) {
      const n = m.items.find(i => !used.has(i.id) && i.name === o.name && i.kind === o.kind);
      if (n) { used.add(n.id); if (n.autoPaid) { effect(s, n, -1); } n.paid = true; n.paidAmount = o.paidAmount; effect(s, n, 1); }
      else { m.items.push(o); effect(s, o, 1); }
    }
    for (const o of keepManual) { m.items.push(o); if (o.paid) effect(s, o, 1); }
    for (const o of old.items.filter(i => i.envelope)) { const n = m.items.find(i => i.envelope && i.recId === o.recId); if (n) n.spent = o.spent || []; else m.items.push(o); }
    if (old.closed) { m.closed = old.closed; m.summary = old.summary; m.debtEnd = old.debtEnd; }
    if (old.debtStart != null) m.debtStart = old.debtStart;
    s.months[k] = m;
    return m;
  }

  return {
    seed, seedFechas, project, spentOf, generate, effect, totals, keyAdd, label, longLabel, sched, r2, uid, debtById, fundById,
    deudaTotal, mesesOrdenados, buscarItem, marcar, anotarGasto, resumenCierre, cerrarMes, iniciarSiguiente, reabrirMes, recalcular,
  };
});
