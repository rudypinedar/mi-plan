// Pruebas obligatorias del motor (ver CLAUDE.md). Se corren con: npm test
// Usan el plan de ejemplo siempre y, si existen en privado/, el respaldo real
// y el plan original de mi-plan.html.
const test = require("node:test");
const assert = require("node:assert/strict");
const { privados, ENG, clonar, iniciar, planes, pagarTodo, problemas, quedaDestino, motorOriginal, planEjemplo } = require("./ayuda.js");

const MESES = 24;
const FECHA = "2030-01-01T00:00:00.000Z";

for (const p of planes()) {
  test(`${p.nombre}: cerrar ${MESES} meses seguidos marcando todo pagado`, () => {
    const s = p.crear();
    assert.deepEqual(problemas(s), [], "el plan inicial ya trae problemas");
    for (let i = 0; i < MESES; i++) {
      const k = s.current, m = s.months[k];
      assert.ok(m, `no existe el mes actual ${k}`);
      if (m.closed) ENG.reabrirMes(s, k); // un respaldo puede venir con el último mes cerrado

      // El mes armado cuadra: lo libre es $0, salvo que ya no quede a dónde mandarlo
      const plan = ENG.totals(m);
      assert.ok(plan.free >= -0.005, `${k}: el plan arranca en negativo (${plan.free})`);
      if (quedaDestino(s, m)) assert.ok(Math.abs(plan.free) <= 0.01, `${k}: no cuadra en $0, quedan ${plan.free} libres`);

      pagarTodo(s, k);
      const real = ENG.totals(m);
      assert.ok(Math.abs(real.free - plan.free) <= 0.01, `${k}: pagando lo planeado, lo libre cambió de ${plan.free} a ${real.free}`);
      assert.equal(real.nPending, 0, `${k}: quedaron pagos sin marcar`);

      const r = ENG.cerrarMes(s, k, { iniciarSiguiente: true, ahora: FECHA });
      assert.ok(r.siguiente, `${k}: no se pudo pasar al siguiente mes`);
      assert.equal(s.current, ENG.keyAdd(k, 1));
      assert.ok(s.months[k].closed);
      assert.deepEqual(problemas(s), [], `${k}: aparecieron saldos negativos o NaN`);
    }
  });

  test(`${p.nombre}: cerrar sin marcar nada`, () => {
    const s = p.crear(); const k = s.current;
    if (s.months[k].closed) ENG.reabrirMes(s, k);
    const r0 = ENG.resumenCierre(s, k);
    const r = ENG.cerrarMes(s, k, { iniciarSiguiente: true, ahora: FECHA });
    assert.ok(r.siguiente, "el siguiente mes no se armó");
    assert.deepEqual(problemas(s), []);
    if (r0.incPending.length) {
      assert.equal(r.resumen.leftover, 0, "mandó el sobrante aunque faltan ingresos por marcar");
      assert.ok(!(s.carryIncome || {})[r0.nk], "quedó un sobrante anotado para el mes siguiente");
    }
    // Los gastos sin deuda ni fondo pasan al mes siguiente
    const pasados = s.months[r0.nk].items.filter(i => i.kind === "carry" && i.source === "salary");
    assert.equal(ENG.r2(pasados.reduce((a, i) => a + i.amount, 0)), r0.carryTotal);
  });

  test(`${p.nombre}: reabrir un mes anterior y volver al último`, () => {
    const s = p.crear();
    for (let i = 0; i < 3; i++) { const k = s.current; if (s.months[k].closed) ENG.reabrirMes(s, k); pagarTodo(s, k); ENG.cerrarMes(s, k, { iniciarSiguiente: true, ahora: FECHA }); }
    const ultimo = s.current, ks = ENG.mesesOrdenados(s), anterior = ks.at(-2);
    ENG.reabrirMes(s, anterior);
    assert.ok(!s.months[anterior].closed, "no se reabrió");
    assert.equal(s.current, ultimo, "reabrir no debe mover el mes actual");
    // Corregir algo en el mes reabierto y volver a cerrarlo
    const it = s.months[anterior].items.find(i => i.paid && i.source === "salary" && !i.autoPaid);
    if (it) { ENG.marcar(s, it, false); ENG.marcar(s, it, true); }
    const r = ENG.cerrarMes(s, anterior, { ahora: FECHA });
    assert.equal(r.siguiente, null, "no debe armar otro mes si el siguiente ya existe");
    assert.ok(s.months[anterior].closed);
    // Seguir desde el último
    pagarTodo(s, ultimo);
    const r2 = ENG.cerrarMes(s, ultimo, { iniciarSiguiente: true, ahora: FECHA });
    assert.ok(r2.siguiente);
    assert.equal(s.current, ENG.keyAdd(ultimo, 1));
    assert.deepEqual(problemas(s), []);
  });

  test(`${p.nombre}: pagos parciales se reflejan en lo libre`, () => {
    const s = p.crear(); const k = s.current, m = s.months[k];
    if (m.closed) ENG.reabrirMes(s, k);
    // Si el mes ya está todo pagado, se usa un pago marcado: se desmarca y se prueba desde ahí
    const it = m.items.find(i => i.source === "salary" && !i.envelope && !i.paid && i.amount >= 10)
      || m.items.find(i => i.source === "salary" && !i.envelope && !i.autoPaid && i.amount >= 10);
    assert.ok(it, "no hay un pago para probar");
    if (it.paid) ENG.marcar(s, it, false);
    const antes = ENG.totals(m).free;
    ENG.marcar(s, it, true, ENG.r2(it.amount - 7.5));
    assert.equal(ENG.totals(m).free, ENG.r2(antes + 7.5), "pagar $7.50 menos debe dejar $7.50 más libres");
    ENG.marcar(s, it, true, ENG.r2(it.amount + 2.25));
    assert.equal(ENG.totals(m).free, ENG.r2(antes - 2.25), "pagar de más debe restar de lo libre");
    ENG.marcar(s, it, false);
    assert.equal(ENG.totals(m).free, antes);
    assert.deepEqual(problemas(s), []);
  });

  test(`${p.nombre}: la proyección termina y no da NaN`, () => {
    const s = p.crear();
    const pr = ENG.project(s);
    assert.ok(pr.rows.length > 0);
    for (const r of pr.rows) assert.ok(Number.isFinite(r.debt), `deuda NaN en ${r.k}`);
    assert.ok(Number.isFinite(pr.interest));
  });
}

test("marcar y desmarcar devuelve los saldos a como estaban", () => {
  const s = iniciar(planEjemplo()); const m = s.months[s.current];
  const antes = clonar(s.debts);
  for (const it of m.items) if (!it.paid) ENG.marcar(s, it, true);
  for (const it of m.items) if (!it.autoPaid) ENG.marcar(s, it, false);
  assert.deepEqual(s.debts, antes);
});

test("recalcular conserva lo marcado y vuelve a cuadrar", () => {
  const s = iniciar(planEjemplo()); pagarTodo(s, s.current); ENG.cerrarMes(s, s.current, { iniciarSiguiente: true, ahora: FECHA });
  const k = s.current; const m = s.months[k];
  const pagado = m.items.find(i => i.source === "salary" && !i.envelope && !i.autoPaid);
  ENG.marcar(s, pagado, true);
  const m2 = ENG.recalcular(s, k);
  const mismo = m2.items.find(i => i.name === pagado.name && i.kind === pagado.kind);
  assert.ok(mismo && mismo.paid, "se perdió lo marcado");
  assert.ok(Math.abs(ENG.totals(m2).free) <= 0.01);
  assert.deepEqual(problemas(s), []);
});

test("un puntual marcado como sobre recibe compras, cuadra y las conserva al recalcular", () => {
  const s = iniciar(planEjemplo()); const k = s.current;
  s.oneoffs.push({ id: "regalos", month: k, name: "Regalos", cat: "Navidad", payWith: "Débito", amount: 100, envelope: true, icon: "redeem" });
  const m = ENG.recalcular(s, k);
  const sobre = m.items.find(i => i.recId === "o_regalos");
  assert.ok(sobre && sobre.envelope && sobre.kind === "oneoff", "el puntual no quedó como sobre");
  assert.equal(sobre.icon, "redeem");
  assert.ok(Math.abs(ENG.totals(m).free) <= 0.01, "el mes no cuadra con el sobre nuevo");
  ENG.anotarGasto(s, sobre, 38.85, "Regalo", null);
  const m2 = ENG.recalcular(s, k);
  const mismo = m2.items.filter(i => i.recId === "o_regalos");
  assert.equal(mismo.length, 1, "el sobre quedó repetido");
  assert.equal(ENG.spentOf(mismo[0]), 38.85, "se perdieron las compras del sobre");
  // Al pasar al otro mes sin ese puntual, el sobre no aparece
  pagarTodo(s, k); ENG.cerrarMes(s, k, { iniciarSiguiente: true, ahora: FECHA });
  assert.ok(!s.months[s.current].items.some(i => i.recId === "o_regalos"));
  assert.deepEqual(problemas(s), []);
});

test("el plan vacío no trae datos personales", () => {
  const s = ENG.seed();
  assert.deepEqual([s.debts, s.funds, s.recurring, s.oneoffs, s.fechas], [[], [], [], [], []]);
});

// El motor nuevo debe dar exactamente lo mismo que el de la app original
const ORIG = motorOriginal(), NOMBRES = privados();
// Lo que el motor original no tenía se quita antes de comparar: puntuales que funcionan como sobre
function sinNovedades(s) {
  for (const o of s.oneoffs || []) { delete o.envelope; delete o.icon; }
  for (const m of Object.values(s.months || {})) for (const it of m.items || [])
    if (String(it.recId || "").startsWith("o_")) { delete it.envelope; delete it.spent; delete it.recId; delete it.icon; }
  return s;
}

test("mismo resultado que el motor original", { skip: !(ORIG && NOMBRES) && "faltan privado/mi-plan.html o privado/nombres.json" }, () => {
  const limpiar = s => JSON.parse(JSON.stringify(s, (key, v) => (key === "id" || key === "generatedAt" || key === "closed" || key === "at") ? undefined : v));
  const base = planes().filter(p => p.nombre !== "plan de ejemplo").concat(planes()[0]);
  for (const p of base) {
    const a = sinNovedades(p.crear()); if (!a.nombres) a.nombres = NOMBRES; // el original los tenía fijos en el código
    const b = clonar(a);
    for (let i = 0; i < MESES; i++) {
      const nk = ENG.keyAdd(a.current, 1);
      for (const [s, E] of [[a, ENG], [b, ORIG]]) {
        const m = s.months[s.current];
        for (const it of m.items) if (!it.paid && !it.envelope) { it.paid = true; it.paidAmount = it.amount; E.effect(s, it, 1); }
        const mm = E.generate(s, nk); s.months[nk] = mm; s.current = nk;
      }
      assert.deepEqual(limpiar(a), limpiar(b), `${p.nombre}: difiere en ${nk}`);
    }
    assert.deepEqual(limpiar(ENG.project(a)), limpiar(ORIG.project(b)), `${p.nombre}: la proyección difiere`);
  }
});

test("al empezar el mes, el salario queda recibido solo (y los demás ingresos no)", () => {
  const s = iniciar(planEjemplo()); pagarTodo(s, s.current);
  const r = ENG.cerrarMes(s, s.current, { iniciarSiguiente: true, ahora: FECHA });
  const ingresos = r.siguiente.items.filter(i => i.source === "income");
  const sal = ingresos.find(i => i.name === (s.salaryName || "Salario líquido"));
  assert.ok(sal && sal.paid && sal.paidAmount === sal.amount, "el salario no quedó recibido");
  assert.ok(ingresos.filter(i => i !== sal && i.amount > 0).every(i => !i.paid), "otro ingreso quedó recibido sin marcarlo");
  const res = ENG.resumenCierre(s, s.current);
  assert.ok(!res.incPending.some(i => i === sal), "el salario no debe aparecer como pendiente al cerrar");
  ENG.recibirSalario(s, r.siguiente);
  assert.equal(ENG.totals(r.siguiente).inc, ENG.totals(r.siguiente).inc, "llamarlo dos veces no duplica");
  assert.equal(r.siguiente.items.filter(i => i === sal && i.paid).length, 1);
});

test("tarjeta para cancelar: avisa solo cuando no tiene saldo, cuotas ni cargos", () => {
  const s = iniciar(planEjemplo()); const k = s.current;
  const t = s.debts.find(d => d.kind === "card");
  assert.ok(t, "el plan de ejemplo no trae tarjeta");
  assert.deepEqual(ENG.porCancelar(s, k), [], "sin marcar ninguna, no hay avisos");
  t.cancelar = true;
  for (const d of s.debts) if (d.parent === t.id) d.closed = true; // se parte de una tarjeta sin cuotas propias
  for (const r of s.recurring) if (r.payWith === t.payWith) r.schedule = [{ from: "2000-01", amount: 0 }];
  for (const o of s.oneoffs) if (o.payWith === t.payWith) o.amount = 0;
  t.balance = 120; s.debts.push({ id: "c0", name: "Cuota 0% prueba", kind: "installment", parent: t.id, balance: 50 });
  s.recurring.push({ id: "sus", name: "Suscripción", payWith: t.payWith, schedule: [{ from: k, amount: 5 }, { from: ENG.keyAdd(k, 2), amount: 0 }] });
  s.oneoffs.push({ id: "comp", month: ENG.keyAdd(k, 3), name: "Compra futura", payWith: t.payWith, amount: 10 });
  let c = ENG.porCancelar(s, k)[0];
  assert.equal(c.saldo, 120); assert.deepEqual(c.cuotas, ["Cuota 0% prueba"]); assert.deepEqual(c.cargos, ["Suscripción", "Compra futura"]); assert.equal(c.lista, false);
  t.balance = 0.3; s.debts.find(d => d.id === "c0").balance = 0;
  c = ENG.porCancelar(s, ENG.keyAdd(k, 2))[0];
  assert.deepEqual(c.cargos, ["Compra futura"], "la suscripción ya terminó; la compra todavía viene");
  c = ENG.porCancelar(s, ENG.keyAdd(k, 4))[0];
  assert.equal(c.lista, true, "en cero y sin cargos: lista para cancelar");
  t.closed = true;
  assert.deepEqual(ENG.porCancelar(s, k), [], "ya cancelada, no avisa más");
});
