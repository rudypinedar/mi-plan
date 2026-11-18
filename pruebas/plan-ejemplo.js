// Plan de EJEMPLO con datos inventados. Sirve para correr las pruebas sin
// datos personales (por ejemplo, en GitHub). Cubre todos los tipos de deuda.
module.exports = function planEjemplo() {
  const d = (o) => Object.assign({ balance: 0, rate: 0, cuota: 0, portion: null, minPct: 0.04, extra: 0, extraFrom: "2030-02", payWith: "", due: null, start: "2030-01", auto: false, cap: null, parent: null, liquidate: false, closed: false, note: "" }, o, { initial: o.initial ?? o.balance });
  return {
    v: 1, startKey: "2030-01", current: "2030-01", puente: 0, waterfallFrom: "2030-02", saleTotal: 3000,
    income: [{ from: "2030-01", amount: 1500 }, { from: "2030-03", amount: 1800 }],
    incomeExtra: [{ id: "hon", name: "Honorarios de ejemplo", schedule: [{ from: "2030-02", amount: 400 }] }],
    debts: [
      d({ id: "fam", name: "Préstamo de un familiar", kind: "person", balance: 900, payWith: "FAMILIA" }),
      d({ id: "tA", name: "Tarjeta A", digits: "0001", kind: "card", balance: 800, rate: 0.36, extra: 20, payWith: "BANCO A", due: 15 }),
      d({ id: "tB", name: "Tarjeta B", digits: "0002", kind: "card", balance: 500, rate: 0.30, extra: 20, payWith: "BANCO B", due: 5 }),
      d({ id: "cuo", name: "Cuota 0% de ejemplo", kind: "installment", balance: 240, cuota: 40, parent: "tA", payWith: "BANCO A", due: 15, liquidate: true }),
      d({ id: "pre", name: "Préstamo personal", kind: "loan", balance: 4000, rate: 0.12, cuota: 140, portion: 130, auto: true, payWith: "BANCO C" }),
      d({ id: "prf", name: "Préstamo familiar con cuota", kind: "loan", balance: 1200, cuota: 50, cap: 50, payWith: "FAMILIA 2" }),
      d({ id: "fut", name: "Préstamo que empieza después", kind: "loan", balance: 2000, rate: 0.09, cuota: 90, portion: 80, payWith: "BANCO D", start: "2030-06" }),
    ],
    order: ["tA", "tB", "fam", "fund:emerg", "prf", "pre", "fut"],
    funds: [
      { id: "renta", name: "Impuestos", balance: 0, target: null, schedule: [{ from: "2030-02", amount: 40 }] },
      { id: "viaje", name: "Viaje", balance: 0, target: 300, schedule: [{ from: "2030-03", amount: 50 }] },
      { id: "emerg", name: "Fondo de emergencia", balance: 0, target: 1000, schedule: [] },
    ],
    recurring: [
      { id: "gas", name: "Gasolina", cat: "Movilidad", payWith: "Débito", envelope: true, schedule: [{ from: "2030-01", amount: 100 }] },
      { id: "super", name: "Supermercado", cat: "Hogar", payWith: "Débito", envelope: true, schedule: [{ from: "2030-01", amount: 200 }] },
      { id: "casa", name: "Casa", cat: "Hogar", payWith: "Débito", schedule: [{ from: "2030-01", amount: 300 }] },
      { id: "tel", name: "Teléfono", cat: "Hogar", payWith: "BANCO A", payWithAlt: "BANCO B", schedule: [{ from: "2030-01", amount: 20 }] },
    ],
    oneoffs: [
      { id: "o1", month: "2030-01", name: "Gasto grande de enero", cat: "Otros", payWith: "Débito", amount: 700 },
      { id: "o2", month: "2030-01", name: "Cobertura con tarjeta", type: "income", auto: "cover", debtId: "tB", debtSign: 1 },
      { id: "o3", month: "2030-02", name: "Pagar la cobertura", cat: "Tarjetas", payWith: "BANCO B", auto: "puenteRepay", debtId: "tB" },
      { id: "o4", month: "2030-02", name: "Venta → familiar", type: "extra", amount: 500, debtId: "fam" },
      { id: "o5", month: "2030-02", name: "Venta → lo que sobra", type: "extra", auto: "saleRest", debtId: "pre" },
    ],
    months: {},
    fechas: [],
  };
};
