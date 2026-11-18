/*
 * Mi plan — interfaz. Portada de la app original (claude.ai) sin datos personales.
 * Usa js/motor.js (ENG) para los cálculos y js/datos.js (Datos) para guardar.
 */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const fmt = n => { n = ENG.r2(n || 0); const neg = n < -0.004; return (neg ? "−" : "") + "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
const money = n => { const s = fmt(n); const m = s.match(/^(−?)\$([\d,]+)\.(\d\d)$/); return m ? `${m[1]}<span class="cur">$</span>${m[2]}<span class="dec">.${m[3]}</span>` : s; };
const fmt0 = n => { const r = Math.round(n || 0); return (r < 0 ? "−" : "") + "$" + Math.abs(r).toLocaleString("en-US"); };
const num = v => { const x = parseFloat(String(v ?? "").replace(/[$,\s]/g, "")); return isFinite(x) ? x : 0; };
const clone = o => JSON.parse(JSON.stringify(o));
const ICONO_OK = /^[a-z0-9_]{1,40}$/;
// Íconos de Material Symbols: solo nombres válidos (los nombres pueden venir del Sheet)
const ms = (n, cls = "") => `<span class="ms ${esc(cls)}" aria-hidden="true">${ICONO_OK.test(String(n)) ? n : "help"}</span>`;
const ICON = { check: ms("check"), left: ms("chevron_left"), right: ms("chevron_right"), up: ms("keyboard_arrow_up"), down: ms("keyboard_arrow_down") };
const MESC = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
const CAT_ORDER = ["Préstamos","Tarjetas","Cuotas 0%","Hogar","Movilidad","Familia","Educación","Suscripciones","Gustos","Navidad","Fondos","Abonos","Otros"];
const CATS = ["Hogar","Movilidad","Familia","Educación","Suscripciones","Gustos","Navidad","Préstamos","Tarjetas","Fondos","Abonos","Otros"];
const KIND = { card: "Tarjeta", loan: "Préstamo", person: "Persona o familia", installment: "Cuota 0%" };

let S = null, view = "mes", viewMonth = null;
const cap = { sample: null, downloads: true, images: false }; // el asistente y las fotos eran de claude.ai
const undoStack = [];
function will(label) {
  undoStack.push({ label, s: clone(S), viewMonth }); if (undoStack.length > 25) undoStack.shift();
  S.log = (S.log || []).concat([{ at: Date.now(), t: label }]).slice(-150);
  lastLabel = label;
}
let lastLabel = "";
function undo() {
  const u = undoStack.pop(); if (!u) { toast("No hay nada que deshacer"); return; }
  S = u.s; viewMonth = S.months[u.viewMonth] ? u.viewMonth : S.current;
  S.log = (S.log || []).concat([{ at: Date.now(), t: "Deshecho: " + u.label }]).slice(-150);
  changed(...Object.keys(S.months)); render(); toast("Se deshizo: " + u.label);
}
let proj = null, projKey = "";
function getProj() { const key = JSON.stringify([S.current, S.debts.map(d => [d.balance, d.closed, d.start, d.cuota, d.rate, d.cap]), S.funds.map(f => f.balance), S.order, S.recurring.length, S.oneoffs.length, S.months[S.current].items.map(i => [i.amount, i.paid, i.paidAmount])]); if (key !== projKey) { proj = ENG.project(S); projKey = key; } return proj; }


// ---------- guardado: copia en el teléfono + Google Sheet (js/datos.js) ----------
function setSave(st, txt) { document.querySelectorAll(".save").forEach(el => { el.className = "save " + (st || ""); el.querySelector("span").textContent = txt; }); }
function changed() { if (S) Datos.cambio(S); }
function descargar(nombre, blob) {
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = nombre;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}
function prepararPlan() {
  if (!S.months[S.current]) S.current = Object.keys(S.months).sort().at(-1);
  if (!viewMonth || !S.months[viewMonth]) viewMonth = S.current;
}

// Primera vez en este teléfono: pegar el código de conexión
function pantallaConexion(msg) {
  document.body.classList.add("sin-plan");
  $("#main").innerHTML = `<section class="conectar">
    <div class="conectar-ico">${ms("lock", "fill")}</div>
    <h2>Conecta tu plan</h2>
    <p class="muted">Pega el <b>código de conexión</b> que guardaste en Bitwarden (nota "Mi plan · claves"). Solo se guarda en este teléfono.</p>
    <form id="fConectar" autocomplete="off">
      <div class="fld"><label for="f_codigo">Código de conexión</label><textarea id="f_codigo" name="codigo" rows="3" placeholder="miplan1:…" autocapitalize="off" autocorrect="off" spellcheck="false" required></textarea></div>
      <p class="conectar-msg" role="alert">${esc(msg || "")}</p>
      <button class="btn primary wide" type="submit">${ms("link")}Conectar</button>
    </form></section>`;
  $("#fConectar").addEventListener("submit", async e => {
    e.preventDefault(); const f = e.target, b = f.querySelector("button"), out = f.querySelector(".conectar-msg");
    b.disabled = true; out.textContent = "Conectando con tu Sheet…";
    try { S = await Datos.conectar(f.elements.codigo.value); document.body.classList.remove("sin-plan"); prepararPlan(); render(); toast("¡Listo! Tu plan está conectado", false); setSave("", "Al día con tu Sheet"); }
    catch (err) { out.textContent = err.message; b.disabled = false; }
  });
}

function avisarConflicto(remoto, version) {
  const d = dlg();
  d.innerHTML = `<form class="dlg" method="dialog"><h3>Tu plan cambió en otro dispositivo</h3>
    <p class="hint">Mientras usabas este teléfono, se guardó otra versión en tu Sheet. ¿Con cuál te quedas?</p>
    <div class="actions"><button class="btn" value="remoto">Usar la del Sheet</button><button class="btn primary" value="este">Quedarme con la de este teléfono</button></div></form>`;
  d.querySelector("form").addEventListener("submit", e => {
    e.preventDefault(); const v = e.submitter && e.submitter.value; d.close();
    if (v === "remoto") { S = remoto; prepararPlan(); Datos.usarRemoto(remoto, version); render(); toast("Cargaste la versión del Sheet"); }
    else { Datos.quedarmeConEste(); toast("Se guardó la versión de este teléfono"); }
  });
  d.showModal();
}

// ---------- instalar como app (Android: Chrome ofrece instalar; iPhone: Compartir) ----------
let promptInstalar = null;
window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); promptInstalar = e; if (S && view === "ajustes") render(); });
window.addEventListener("appinstalled", () => { promptInstalar = null; toast("¡Listo! Mi plan quedó instalada"); if (S && view === "ajustes") render(); });
const instalada = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const esIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
function instalarHTML() {
  if (instalada()) return "";
  const cuerpo = promptInstalar
    ? `<div class="row"><div class="main"><span class="t">${gIco("install_mobile")}Instala Mi plan en este teléfono</span><span class="m">Se abre como app, sin barra del navegador, y funciona sin señal.</span></div></div>`
    : esIOS()
      ? `<div class="row"><div class="main"><span class="t">${gIco("ios_share")}Instálala desde Safari</span><span class="m">Toca Compartir y luego "Agregar a pantalla de inicio".</span></div></div>`
      : `<div class="row"><div class="main"><span class="t">${gIco("install_mobile")}Instálala desde el navegador</span><span class="m">En Chrome (Android): menú ⋮ y luego "Instalar app" o "Agregar a la pantalla principal".</span></div></div>`;
  return `<section class="block"><h2>Instalar en tu teléfono</h2><div class="list">${cuerpo}</div>${promptInstalar ? '<div class="actions"><button class="btn primary" data-act="instalar"><span class="ms" aria-hidden="true">install_mobile</span>Instalar app</button></div>' : ""}</section>`;
}
// Accesos directos del ícono (mantener presionado): ?accion=gasto | ?accion=bandeja
function abrirAccesoDirecto() {
  const a = new URLSearchParams(location.search).get("accion"); if (!a || !S) return;
  history.replaceState(null, "", location.pathname);
  if (a === "gasto") { view = "mes"; viewMonth = S.current; render(); dlgSpend(S.current); }
  else if (a === "bandeja") { view = "mes"; viewMonth = S.current; render(); const el = document.querySelector(".pcbox"); if (el) el.scrollIntoView({ block: "start" }); else toast("No tienes cargos por clasificar"); }
}

// ---------- candado: huella o código (js/candado.js) ----------
const hayCandado = () => typeof Candado !== "undefined";
function pantallaCandado() {
  return new Promise(resolve => {
    document.body.classList.add("bloqueada");
    const huella = Candado.conHuella();
    const el = document.createElement("div"); el.id = "candado"; el.setAttribute("role", "dialog"); el.setAttribute("aria-modal", "true"); el.setAttribute("aria-label", "Mi plan está bloqueada");
    el.innerHTML = `<div class="candado-caja"><div class="conectar-ico">${ms("lock", "fill")}</div><h2>Mi plan está bloqueada</h2>
      <p class="muted">${huella ? "Usa tu huella o tu rostro para entrar." : "Escribe tu código para entrar."}</p>
      ${huella ? `<button class="btn primary wide" id="cHuella" type="button">${ms("fingerprint")}Desbloquear con huella</button>` : ""}
      <form id="cPin" ${huella ? "hidden" : ""}><div class="fld"><label for="f_pin">Código</label><input id="f_pin" name="pin" type="password" inputmode="numeric" pattern="[0-9]*" autocomplete="off" maxlength="6" required></div><button class="btn ${huella ? "" : "primary"} wide" type="submit">Entrar</button></form>
      ${huella ? '<button class="link" id="cUsarPin" type="button">Usar mi código</button>' : ""}
      <p class="conectar-msg" role="alert" id="cMsg"></p>
      <button class="link tenue" id="cOlvide" type="button">Olvidé mi código</button></div>`;
    document.body.appendChild(el);
    const msg = t => { el.querySelector("#cMsg").textContent = t || ""; };
    const abrir = () => { el.remove(); document.body.classList.remove("bloqueada"); resolve(); };
    const btn = el.querySelector("#cHuella");
    const probarHuella = async auto => { msg(""); btn.disabled = true; const r = await Candado.conHuellaAhora(); btn.disabled = false; if (r.ok) abrir(); else if (!auto) msg(r.error); };
    if (btn) {
      btn.onclick = () => probarHuella(false);
      el.querySelector("#cUsarPin").onclick = () => { el.querySelector("#cPin").hidden = false; el.querySelector("#f_pin").focus(); };
      probarHuella(true); // se pide sola al abrir (si el navegador lo permite sin tocar)
    } else el.querySelector("#f_pin").focus();
    el.querySelector("#cPin").onsubmit = async e => {
      e.preventDefault(); const f = e.target, b = f.querySelector("button");
      b.disabled = true; msg("Revisando…");
      const r = await Candado.conPin(f.elements.pin.value); b.disabled = false;
      if (r.ok) abrir(); else { msg(r.error); f.elements.pin.value = ""; }
    };
    el.querySelector("#cOlvide").onclick = () => {
      if (confirm("Se borrará de este teléfono la copia de tu plan y la conexión. Tus datos siguen seguros en tu Google Sheet: después vuelves a conectar con el código de Bitwarden. ¿Continuar?")) { Candado.borrarTodo(); location.reload(); }
    };
  });
}
// Se vuelve a bloquear si la app pasó más de N minutos en segundo plano
let ocultaDesde = 0;
document.addEventListener("visibilitychange", () => {
  if (!hayCandado() || !Candado.activo()) return;
  if (document.visibilityState === "hidden") ocultaDesde = Date.now();
  else if (ocultaDesde && Date.now() - ocultaDesde > Candado.minutos() * 60000) Candado.listo().then(() => location.reload());
});
// ---------- pedir un ajuste a Claude (sesión de Claude Code en la Mac, vía Remote Control) ----------
const CLAUDE_URL = "https://claude.ai/code";
function haceCuanto(iso) {
  if (!iso) return "";
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  return min < 1 ? "hace un momento" : min < 60 ? `hace ${min} min` : min < 1440 ? `hace ${Math.round(min / 60)} h` : `el ${new Date(iso).toLocaleDateString("es-SV", { day: "numeric", month: "short" })}`;
}
function claudeHTML() {
  const m = Datos.mac();
  if (Date.now() - (m.revisado || 0) > 60000) Datos.revisarMac().then(() => { if (view === "ajustes") render(); });
  const cuerpo = m.enLinea
    ? `<div class="row"><div class="main"><span class="t"><i class="punto ok" aria-hidden="true"></i>Tu Mac está lista</span><span class="m">Claude puede revisar y ajustar tu plan. Te mostrará la vista previa y esperará tu visto bueno antes de guardar.</span></div></div>`
    : `<div class="row apagado"><div class="main"><span class="t"><i class="punto" aria-hidden="true"></i>Tu Mac está fuera de línea</span><span class="m">Enciende tu Mac y abre la sesión de Claude en la carpeta de Mi plan.${m.ultimoLatido ? ` Último aviso ${haceCuanto(m.ultimoLatido)}.` : ""}</span></div></div>`;
  return `<section class="block claude-box"><h2>Pedir un ajuste a Claude</h2><div class="list">${cuerpo}</div>
    <div class="actions">${m.enLinea ? `<a class="btn primary" href="${CLAUDE_URL}" target="_blank" rel="noopener"><span class="ms" aria-hidden="true">forum</span>Abrir Claude</a>` : `<button class="btn" disabled aria-disabled="true"><span class="ms" aria-hidden="true">cloud_off</span>No disponible ahora</button>`}<button class="btn ghost" data-act="mac-revisar"><span class="ms" aria-hidden="true">refresh</span>Revisar</button></div>
    ${m.enLinea ? `<p class="small muted claude-tip">Escríbele como a una persona, por ejemplo: <i>"Jaime me adelantó $500 más"</i> o <i>"sube el súper a $220 desde diciembre"</i>.</p>` : ""}</section>`;
}

function seguridadHTML() {
  if (!hayCandado()) return "";
  if (!Candado.activo()) return `<section class="block"><h2>Seguridad</h2><div class="list"><div class="row"><div class="main"><span class="t">${gIco("fingerprint")}Bloqueo con huella</span><span class="m">Pide tu huella o tu rostro para abrir la app y cifra tus datos en este teléfono.</span></div></div></div>
    <div class="actions"><button class="btn primary" data-act="candado-activar"><span class="ms" aria-hidden="true">lock</span>Activar bloqueo</button></div></section>`;
  return `<section class="block"><h2>Seguridad</h2><div class="list"><div class="row"><div class="main"><span class="t">${gIco("verified_user")}Bloqueo activado</span><span class="m">${Candado.conHuella() ? "Se abre con tu huella o tu rostro; tu código sirve de respaldo." : "Se abre con tu código (este navegador no permite cifrar con la huella)."} Tus datos en este teléfono están cifrados. Se bloquea sola tras ${Candado.minutos()} minutos sin usarla.</span></div></div></div>
    <div class="actions"><button class="btn" data-act="candado-bloquear"><span class="ms" aria-hidden="true">lock</span>Bloquear ahora</button><button class="btn danger" data-act="candado-desactivar"><span class="ms" aria-hidden="true">lock_open</span>Desactivar bloqueo</button></div></section>`;
}
function dlgActivarCandado() {
  const pinFld = (lbl, n) => fld(lbl, n, "", "password", 'inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="new-password" required');
  openDlg(`<h3>Activar bloqueo</h3><p class="hint">Primero crea un código de 4 a 6 números: sirve si la huella falla. Luego el teléfono te pedirá tu huella o tu rostro.</p>
    ${pinFld("Código nuevo", "pin1")}${pinFld("Repite el código", "pin2")}
    <div class="actions"><button class="btn ghost" value="cancel">Cancelar</button><button class="btn primary" value="ok">Continuar</button></div>`, f => {
    const a = g(f, "pin1"), b = g(f, "pin2");
    if (!Candado.pinValido(a)) { toast("El código debe tener de 4 a 6 números"); return false; }
    if (a !== b) { toast("Los dos códigos no coinciden"); return false; }
    activarCandado(a);
  });
}
async function activarCandado(pin) {
  let prf = null;
  if (await Candado.soportaHuella()) {
    try { prf = await Candado.registrarHuella(); } catch (_) { toast("No se registró la huella: se activa solo con tu código"); }
    if (prf && !prf.salida) { prf = null; toast("Este navegador no permite cifrar con la huella: se usará tu código"); }
  }
  try { const r = await Candado.activar({ pin, prf }); render(); toast(r.conHuella ? "Listo: la app se abre con tu huella" : "Listo: la app se abre con tu código"); }
  catch (e) { toast(e.message || "No se pudo activar el bloqueo"); }
}

async function boot() {
  render();
  if (hayCandado() && Candado.activo() && !Candado.abierto()) await pantallaCandado();
  Datos.iniciar({
    alEstado: setSave,
    alRemoto: plan => { const habia = !!S; S = plan; prepararPlan(); if (!document.querySelector("#dlg[open]")) render(); if (habia) toast("Actualizado desde tu Sheet"); },
    alConflicto: avisarConflicto,
    alBandeja: lista => { if (S && view === "mes") render(); },
  });
  if (!Datos.conectado()) { pantallaConexion(); return; }
  const loc = Datos.local();
  if (loc && loc.plan && loc.plan.months) { S = loc.plan; prepararPlan(); setSave(loc.pendiente ? "busy" : "", loc.pendiente ? "Cambios por subir" : "Copia del teléfono"); render(); abrirAccesoDirecto(); }
  await Datos.sincronizar();
  if (!S) { pantallaConexion("No se pudo cargar tu plan. Revisa tu señal o vuelve a pegar el código."); return; }
  abrirAccesoDirecto();
}

// Service worker: abre sin señal (solo en la página publicada)
if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
// ---------- utilidades de mes ----------
const monthKeys = () => Object.keys(S.months).sort();
function period(k) { const [y, m] = k.split("-").map(Number); const n = m === 12 ? 1 : m + 1; return `Pagos del 20 ${MESC[m - 1]} al 19 ${MESC[n - 1]}`; }
function dueDate(k, day) { if (!day) return null; const [y, m] = k.split("-").map(Number); return day >= 20 ? { m, d: day } : { m: m === 12 ? 1 : m + 1, d: day }; }
function fechasRaw(k) {
  const [y, m] = k.split("-").map(Number); const n = m === 12 ? 1 : m + 1;
  return (S.fechas || []).filter(f => (f.m === m && f.d >= 20) || (f.m === n && f.d < 20)).sort((a, b) => ((a.m - m + 12) % 12) * 40 + a.d - (((b.m - m + 12) % 12) * 40 + b.d));
}
function fechasDe(k) { return fechasRaw(k).map(f => `${f.name} · ${f.d} ${MESC[f.m - 1]}${f.amount ? ` · ${fmt0(f.amount)}` : ""}`); }
function toast(t, withUndo) {
  const el = $("#toast"); el.innerHTML = ""; const sp = document.createElement("span"); sp.textContent = t; el.appendChild(sp);
  if (withUndo && undoStack.length) { const b = document.createElement("button"); b.textContent = "Deshacer"; b.className = "tbtn"; b.onclick = () => { el.classList.remove("on"); undo(); }; el.appendChild(b); el.style.pointerEvents = "auto"; } else el.style.pointerEvents = "none";
  el.classList.add("on"); clearTimeout(el._t); el._t = setTimeout(() => { el.classList.remove("on"); el.style.pointerEvents = "none"; }, withUndo ? 5000 : 2400);
}

// ---------- acciones ----------
function balSnap() { return { d: Object.fromEntries(S.debts.map(x => [x.id, x.balance])), f: Object.fromEntries(S.funds.map(x => [x.id, x.balance])) }; }
function celebrate(before) {
  const hits = S.debts.filter(d => d.kind !== "installment" && !d.closed && (before.d[d.id] ?? 0) > 0.5 && d.balance <= 0.5);
  const fh = S.funds.filter(f => f.target && (before.f[f.id] ?? 0) < f.target - 0.01 && f.balance >= f.target - 0.01);
  if (!hits.length && !fh.length) return;
  const nextId = S.order.find(id => id.startsWith("fund:") ? (() => { const f = ENG.fundById(S, id.slice(5)); return f && f.target && f.balance < f.target - 0.01; })() : (() => { const d = ENG.debtById(S, id); return d && !d.closed && d.balance > 0.5 && d.start <= S.current; })());
  const nextName = nextId ? (nextId.startsWith("fund:") ? ENG.fundById(S, nextId.slice(5)).name : ENG.debtById(S, nextId).name) : null;
  const left = S.debts.filter(d => d.kind !== "installment" && !d.closed && d.balance > 0.5).length;
  const t = hits.length ? `¡${hits.map(h => h.name).join(" y ")} en cero!` : `¡${fh.map(f => f.name).join(" y ")} completo!`;
  const msg = hits.length ? `Ya no le debes nada${hits.length > 1 ? "" : ` a ${hits[0].kind === "card" ? "esa tarjeta" : hits[0].name.toLowerCase()}`}.${nextName ? ` Desde el próximo mes, lo que pagabas ahí se va a ${nextName}.` : ""} ${left ? `Te ${left === 1 ? "queda 1 deuda" : `quedan ${left} deudas`}.` : "¡No te queda ninguna deuda!"}` : `Llegaste a la meta de tu fondo. Desde ahora ese dinero va a lo siguiente de tu plan.`;
  const d = dlg();
  d.innerHTML = `<div class="dlg celeb"><div class="confetti" aria-hidden="true">${Array.from({ length: 18 }, (_, i) => `<i style="--x:${(i * 37) % 100}%;--d:${(i % 6) * 0.12}s;--c:${["var(--jade)", "var(--amber)", "var(--debt)"][i % 3]}"></i>`).join("")}</div>
    <div class="big-emoji" aria-hidden="true">${ms(hits.length ? "celebration" : "emoji_events")}</div><h3>${esc(t)}</h3><p class="hint">${esc(msg)}</p>
    <div class="actions" style="justify-content:center"><button class="btn primary" id="celok">¡Seguimos!</button></div></div>`;
  $("#celok").onclick = () => d.close(); d.showModal();
  S.log = (S.log || []).concat([{ at: Date.now(), t: "Liquidado: " + t }]).slice(-150);
}
function togglePaid(it) {
  const before = balSnap();
  will((it.paid ? "Desmarcaste " : "Marcaste ") + it.name);
  if (it.paid) { ENG.effect(S, it, -1); it.paid = false; it.paidAmount = null; }
  else { it.paid = true; it.paidAmount = it.amount; ENG.effect(S, it, 1); }
  changed(); render(); toast(it.paid ? (it.source === "income" ? "Recibido: " : "Pagado: ") + it.name : "Desmarcado: " + it.name, true); celebrate(before);
}
function totalDebt() { return ENG.r2(S.debts.filter(d => !d.closed && (d.since || d.start) <= S.current).reduce((a, d) => a + d.balance, 0)); }
function startNext() {
  const last = monthKeys().at(-1); const t = ENG.totals(S.months[last]); const nk = ENG.keyAdd(last, 1);
  confirmDlg(`Iniciar ${ENG.label(nk)}`, t.nPending ? `En ${ENG.label(last)} quedan ${t.nPending} pagos sin marcar. Se quedan ahí para que los marques después. El nuevo mes se arma con tus saldos reales de hoy.` : `El nuevo mes se arma con tus saldos reales de hoy.`, `Iniciar ${ENG.label(nk)}`, () => {
    will(`Iniciaste ${ENG.label(nk)}`);
    if (S.months[last].debtEnd == null) S.months[last].debtEnd = totalDebt();
    const m = ENG.generate(S, nk); S.months[nk] = m; S.current = nk; viewMonth = nk; changed(last, nk); render(); toast(`${ENG.label(nk)} listo`, true);
  });
}
function recalc(k) {
  confirmDlg("Recalcular el mes", "Se vuelven a calcular los pagos y abonos con tus saldos actuales. Lo que ya marcaste como pagado se conserva.", "Recalcular", () => {
    will(`Recalculaste ${ENG.label(k)}`);
    const old = S.months[k];
    for (const it of old.items) if (it.paid) ENG.effect(S, it, -1);
    for (const [id, x] of Object.entries(old.interest || {})) { const d = ENG.debtById(S, id); if (d) d.balance = ENG.r2(d.balance - x); }
    const keepManual = old.items.filter(i => i.kind === "manual");
    const m = ENG.generate(S, k, { keep: keepManual });
    const used = new Set();
    for (const o of old.items.filter(i => i.paid && i.kind !== "manual")) {
      const n = m.items.find(i => !used.has(i.id) && i.name === o.name && i.kind === o.kind);
      if (n) { used.add(n.id); if (n.autoPaid) { ENG.effect(S, n, -1); } n.paid = true; n.paidAmount = o.paidAmount; ENG.effect(S, n, 1); }
      else { m.items.push(o); ENG.effect(S, o, 1); }
    }
    for (const o of keepManual) { m.items.push(o); if (o.paid) ENG.effect(S, o, 1); }
    for (const o of old.items.filter(i => i.envelope)) { const n = m.items.find(i => i.envelope && i.recId === o.recId); if (n) n.spent = o.spent || []; else m.items.push(o); }
    if (old.closed) { m.closed = old.closed; m.summary = old.summary; m.debtEnd = old.debtEnd; }
    if (old.debtStart != null) m.debtStart = old.debtStart;
    S.months[k] = m; changed(k); render(); toast("Mes recalculado", true);
  });
}

// ---------- render ----------
const MORE = {}; let moreSeq = 0;
function moreBtn(title, html, n, sub) { const key = "m" + (++moreSeq); MORE[key] = { title, html, sub }; return `<button type="button" class="morebtn" data-act="more" data-key="${esc(key)}">Ver ${n} más<span class="ms" aria-hidden="true">expand_more</span></button>`; }
function limitList(arr, n, title, sub) { if (arr.length <= n + 1) return arr.join(""); return arr.slice(0, n).join("") + moreBtn(title, arr.join(""), arr.length - n, sub); }
function render() {
  moreSeq = 0; for (const key in MORE) delete MORE[key];
  document.querySelectorAll("nav.tabs button[data-view]").forEach(b => b.setAttribute("aria-current", b.dataset.view === view ? "page" : "false"));
  const main = $("#main");
  if (!S) { main.innerHTML = '<p class="empty">Cargando tu plan…</p>'; return; }
  main.innerHTML = view === "mes" ? vMes() : view === "plan" ? vPlan() : view === "deudas" ? vDeudas() : view === "fondos" ? vFondos() : vAjustes();
  if (view === "plan") wireSim();
  const cal = document.querySelector(".cal"), td = cal && cal.querySelector(".today"); if (td) cal.scrollLeft = td.offsetLeft - cal.clientWidth / 2 + td.clientWidth / 2;
}
const EMOJI = { super: "shopping_cart", gas: "local_gas_station", gustos: "redeem", renta: "receipt_long", grad: "school", iphone: "smartphone", emerg: "health_and_safety", colchon: "umbrella", contador: "calculate", f07: "account_balance" };
const iconOf = o => (o && (o.icon || EMOJI[o.recId] || EMOJI[o.id])) || "";
const icoHtml = o => { const v = iconOf(o); return !v ? "" : ICONO_OK.test(v) ? ms(v) : esc(v); };
// Cómo se ve cada forma de pago (nombre, color del banco, ícono): viene del Sheet (config "etiquetas")
const etq = k => (S && S.etiquetas && S.etiquetas.pagos && S.etiquetas.pagos[k]) || {};
const bankOf = pw => { const b = !pw ? "" : String(etq(pw).banco || ""); return /^[a-z0-9_]{1,20}$/.test(b) ? b : ""; };
const CAT_ICON = { Hogar: "home", Movilidad: "directions_car", Suscripciones: "subscriptions", "Educación": "school", Gustos: "redeem", Familia: "family_restroom", Otros: "receipt_long", Ingresos: "payments", Tarjetas: "credit_card", "Préstamos": "account_balance", "Cuotas 0%": "shopping_bag", Fondos: "savings", Navidad: "park", Abonos: "trending_down" };
function grpIcon(key) { if (key === "__auto" || key === "Planilla") return "badge"; const e = etq(key); if (e.icono) return e.icono; if (key === "Débito") return "account_balance_wallet"; if (key === "Cuenta de ahorro") return "savings"; if (key === "Transferencia") return "swap_horiz"; if (e.banco === "fam") return "family_restroom"; if (e.banco) return "credit_card"; return "payments"; }
function debtIcon(d) { if (d.icon) return d.icon; if (d.kind === "card") return "credit_card"; if (d.kind === "installment") return "shopping_bag"; if (etq(d.payWith).banco === "fam") return "family_restroom"; return "account_balance"; }
const gIco = (n, pw) => `<span class="gi bkc-${bankOf(pw) || "x"}" aria-hidden="true">${ms(n)}</span>`;
const recIcon = r => { const v = iconOf(r); return /^[a-z0-9_]+$/.test(v) ? v : CAT_ICON[r.cat] || "receipt_long"; };
const bkDot = pw => { const b = bankOf(pw); return b ? `<i class="bk bk-${b}" aria-hidden="true"></i>` : ""; };
function periodDates(k) { const [y, m] = k.split("-").map(Number); return { start: new Date(y, m - 1, 20), end: new Date(m === 12 ? y + 1 : y, m % 12, 19) }; }
function daysLeft(k) { const { start, end } = periodDates(k); const t = new Date(); t.setHours(0, 0, 0, 0); if (t > end) return null; const from = t < start ? start : t; return Math.round((end - from) / 864e5) + 1; }
const QI = { plus: ms("add"), check: ms("task_alt"), move: ms("swap_horiz"), ask: ms("forum"), more: ms("more_horiz") };
const PAY_LABEL = { "Débito": "Desde tu cuenta", "Cuenta de ahorro": "A tu cuenta de ahorro", "Cuenta de impuestos": "Cuenta de impuestos" };
const payLabel = k => etq(k).nombre || PAY_LABEL[k] || k || "Otros";
const MONTHS_LONG = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
function dueAbs(k, day) { if (!day) return null; const [y, m] = k.split("-").map(Number); const dd = dueDate(k, day); return new Date(dd.m < m ? y + 1 : y, dd.m - 1, dd.d); }
function dueTxt(date) {
  const t = new Date(); t.setHours(0, 0, 0, 0); const n = Math.round((date - t) / 864e5);
  const base = `${date.getDate()} ${MESC[date.getMonth()]}`;
  if (n < 0) return { t: `venció el ${base}`, c: "late" };
  if (n === 0) return { t: "vence hoy", c: "late" };
  if (n === 1) return { t: "vence mañana", c: "soon" };
  return { t: `vence ${base} · en ${n} días`, c: n <= 5 ? "soon" : "" };
}
function shortName(x, group) {
  if (x.kind === "card") return x.note && x.note.includes("abono") ? "Pago de la tarjeta + abono" : "Pago de la tarjeta";
  if (x.kind === "loan") { const n = x.name.replace(/ — cuota$/, "").replace(/ \(.*\)/, ""); return n === group ? "Cuota" : n + " (cuota)"; }
  if (x.kind === "installment") return x.name.replace("Cuota 0% ", "Cuota 0% · ");
  return x.name.replace(/^Fondo /, "Fondo de ").replace("Fondo de fondo", "Fondo");
}
function rowItem(it, k, group) {
  const val = it.paid ? it.paidAmount : it.amount;
  const label = group ? shortName(it, group) : it.name;
  const sub = group ? (it.autoPaid ? "Se descuenta de tu salario" : it.note && !/^Mínimo/.test(it.note) && it.kind !== "card" ? it.note : "") : [it.note].filter(Boolean).join("");
  const diff = it.paid && Math.abs(it.paidAmount - it.amount) > 0.004 ? `<s>${fmt(it.amount)}</s>` : "";
  const isInc = it.source === "income";
  return `<div class="row ${it.paid ? "paid" : ""} ${it.autoPaid ? "auto" : ""}">
    <button class="chk" data-act="toggle" data-id="${esc(it.id)}" aria-label="${it.paid ? "Desmarcar" : isInc ? "Marcar como recibido" : "Marcar como pagado"}: ${esc(label)}" aria-pressed="${it.paid}"><span>${ICON.check}</span></button>
    <button class="main" data-act="item" data-id="${esc(it.id)}"><span class="t">${esc(label)}</span>${sub ? `<span class="m">${esc(sub)}</span>` : ""}</button>
    <div class="amt num">${fmt(val)}${diff}</div></div>`;
}
function insight(m, k) {
  if (k !== S.current) return "";
  const envs = m.items.filter(x => x.envelope && x.amount > 0);
  const over = envs.find(x => ENG.spentOf(x) > x.amount + 0.5);
  const n = x => x.name.replace(/ \(.*\)/, "").toLowerCase();
  const card = (cls, ic, t, s, act, id) => `<button class="insight ${cls}" data-act="${act}" ${id ? `data-id="${esc(id)}"` : ""}><span class="ii" aria-hidden="true">${ic}</span><span><b>${esc(t)}</b><em>${esc(s)}</em></span><span class="chev" aria-hidden="true">${ICON.right}</span></button>`;
  if (over) return card("bad", ms("warning"), `Te pasaste en ${n(over)}`, `Gastaste ${fmt(ENG.spentOf(over) - over.amount)} de más. Cúbrelo con otro rubro.`, "env", over.id);
  const { start, end } = periodDates(k); const t = new Date(); t.setHours(0, 0, 0, 0);
  const el = t < start ? 0 : Math.min(1, (t - start) / (end - start + 864e5));
  const fast = envs.map(x => ({ x, p: ENG.spentOf(x) / x.amount })).filter(o => el > 0.05 && o.p > el + 0.15).sort((a, b) => b.p - a.p)[0];
  if (fast) return card("warn", ms("speed"), `Vas rápido en ${n(fast.x)}`, `Llevas ${Math.round(fast.p * 100)}% gastado y va ${Math.round(el * 100)}% del mes.`, "env", fast.x.id);
  const p = getProj(); const nx = p.milestones.find(x => x.type === "debt");
  if (nx) { const d = S.debts.find(x => x.name === nx.t); if (d && monthsBetween(S.current, nx.k) <= 3) return card("good", ms("flag"), `${d.name} queda en cero en ${ENG.longLabel(nx.k)}`, `Te faltan ${fmt(d.balance)}. Sigue el plan y la liquidas en ${monthsBetween(S.current, nx.k)} ${monthsBetween(S.current, nx.k) === 1 ? "mes" : "meses"}.`, "go-deudas"); }
  const sp = envs.reduce((a, x) => a + ENG.spentOf(x), 0), bud = envs.reduce((a, x) => a + x.amount, 0);
  return card("good", ms("eco"), "Vas bien este mes", bud ? `Llevas ${Math.round(sp / bud * 100)}% de tu día a día y va ${Math.round(el * 100)}% del mes.` : "Sigue marcando tus pagos.", "spend");
}
const DONUT_GROUPS = [["Deudas", ["Préstamos", "Tarjetas", "Cuotas 0%", "Abonos"], "var(--c1)"], ["Hogar", ["Hogar", "Suscripciones"], "var(--c2)"], ["Movilidad", ["Movilidad"], "var(--c3)"], ["Familia", ["Familia"], "var(--c4)"], ["Educación", ["Educación"], "var(--c5)"], ["Ahorro", ["Fondos"], "var(--c6)"], ["Gustos y fechas", ["Gustos", "Navidad"], "var(--c7)"], ["Otros", ["Otros", "Dinero extra"], "var(--c8)"]];
function donut(m) {
  const exp = m.items.filter(i => i.source === "salary");
  const val = i => i.envelope ? Math.max(i.amount, ENG.spentOf(i)) : i.paid ? i.paidAmount : i.amount;
  const tot = exp.reduce((a, i) => a + val(i), 0); if (tot <= 0) return "";
  const segs = DONUT_GROUPS.map(([lbl, cats, c]) => ({ lbl, c, v: exp.filter(i => cats.includes(i.cat) || (lbl === "Otros" && !DONUT_GROUPS.some(g => g[1].includes(i.cat)))).reduce((a, i) => a + val(i), 0) })).filter(s => s.v > 0.5);
  const R = 46, C = 2 * Math.PI * R; let off = 0; const gap = 2.2;
  const arcs = segs.map(s => { const len = s.v / tot * C; const d = `<circle cx="60" cy="60" r="${R}" fill="none" stroke="${s.c}" stroke-width="16" stroke-dasharray="${Math.max(0, len - gap).toFixed(2)} ${C.toFixed(2)}" stroke-dashoffset="${(-off).toFixed(2)}" transform="rotate(-90 60 60)"/>`; off += len; return d; }).join("");
  const debtPct = Math.round((segs.find(s => s.lbl === "Deudas") || { v: 0 }).v / tot * 100);
  return `<section class="block"><h2>A dónde va tu salario</h2><div class="donut">
    <svg viewBox="0 0 120 120" width="150" height="150" role="img" aria-label="${segs.map(s => `${s.lbl} ${Math.round(s.v / tot * 100)}%`).join(", ")}">${arcs}<text x="60" y="58" text-anchor="middle" font-size="20" font-weight="600" fill="var(--ink)" font-family="Sora,system-ui">${debtPct}%</text><text x="60" y="74" text-anchor="middle" font-size="9.5" fill="var(--muted)">a deudas</text></svg>
    <ul>${segs.map(s => `<li><i style="background:${s.c}"></i><span>${s.lbl}</span><b class="num">${Math.round(s.v / tot * 100)}%</b></li>`).join("")}</ul></div></section>`;
}
function calStrip(m, k) {
  const { start, end } = periodDates(k); const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = new Map();
  for (const x of m.items.filter(x => x.source === "salary" && !x.envelope && x.due)) {
    const d = dueAbs(k, x.due); const key = d.toDateString(); if (!days.has(key)) days.set(key, { pend: 0, paid: 0, lines: new Map() });
    const o = days.get(key); const lbl = x.autoPaid ? "Planilla" : payLabel(x.payWith);
    if (x.paid) o.paid++; else { o.pend++; o.lines.set(lbl, (o.lines.get(lbl) || 0) + x.amount); }
  }
  const [y, mo] = k.split("-").map(Number);
  const bdays = new Set((S.fechas || []).map(f => new Date(f.m < mo ? y + 1 : y, f.m - 1, f.d).toDateString()));
  let h = `<div class="cal" role="list" aria-label="Calendario de pagos del periodo">`;
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const key = d.toDateString(), o = days.get(key), isT = d.getTime() === today.getTime();
    const st = o ? (o.pend ? (d < today ? "late" : (d - today) / 864e5 <= 5 ? "soon" : "pend") : "ok") : "";
    const tip = o && o.pend ? [...o.lines].map(([l, v]) => `${l} ${fmt(v)}`).join(" · ") : o ? "Pagado" : "";
    h += `<button class="day ${isT ? "today" : ""} ${st}" role="listitem" data-act="day" data-day="${key}" data-tip="${esc(tip)}" data-bday="${bdays.has(key) ? 1 : ""}" aria-label="${d.getDate()} ${MONTHS_LONG[d.getMonth()]}${tip ? ": " + esc(tip) : ""}${bdays.has(key) ? ", cumpleaños" : ""}">
      <span class="wd">${d.getDate() === 1 || d.getTime() === start.getTime() ? MESC[d.getMonth()] : "DLMMJVS"[d.getDay()]}</span><span class="dn num">${d.getDate()}</span><span class="dots">${o ? `<i class="${st}"></i>` : ""}${bdays.has(key) ? "<i class=\"bd\"></i>" : ""}${d.getDate() === 20 && d.getMonth() === start.getMonth() ? "<i class=\"sal\"></i>" : ""}</span></button>`;
  }
  return h + `</div><p class="calkey"><span><i class="pend"></i>Por pagar</span><span><i class="soon"></i>Pronto</span><span><i class="ok"></i>Pagado</span><span><i class="sal"></i>Salario</span><span><i class="bd"></i>Cumpleaños</span></p>`;
}
function groupsOf(m, k) {
  const map = new Map();
  for (const x of m.items.filter(x => x.source === "salary" && !x.envelope)) {
    const key = x.autoPaid ? "__auto" : (x.payWith || "Otros");
    if (!map.has(key)) map.set(key, { key, label: key === "__auto" ? "Descuento de planilla" : payLabel(key), items: [] });
    map.get(key).items.push(x);
  }
  const gs = [...map.values()].map(g => {
    const dues = g.items.filter(i => i.due && !i.paid).map(i => dueAbs(k, i.due)).sort((a, b) => a - b);
    const total = g.items.reduce((a, i) => a + (i.paid ? i.paidAmount : i.amount), 0);
    const pend = g.items.filter(i => !i.paid && i.amount > 0);
    return Object.assign(g, { due: dues[0] || null, total, pend, done: !pend.length });
  });
  const rank = g => g.due ? g.due.getTime() : g.key === "Débito" ? 9e15 : g.key === "Cuenta de ahorro" ? 9.2e15 : 9.1e15;
  return { open: gs.filter(g => !g.done).sort((a, b) => rank(a) - rank(b)), done: gs.filter(g => g.done) };
}
function groupCard(g, k) {
  const d = g.due ? dueTxt(g.due) : null;
  const pendT = g.pend.reduce((a, i) => a + i.amount, 0);
  return `<div class="pg ${g.done ? "done" : ""}" id="pg-${esc(g.key).replace(/[^a-z0-9]/gi, "")}">
    <div class="pgh"><div><b>${gIco(grpIcon(g.key), g.key)}${esc(g.label)}</b>${d ? `<span class="due ${d.c}">${d.t}</span>` : g.done ? `<span class="due ok">Todo pagado</span>` : ""}</div>
      <div class="pgt num">${fmt(g.done ? g.total : pendT)}${!g.done && g.items.length > g.pend.length ? `<small>de ${fmt(g.total)}</small>` : ""}</div></div>
    <div class="pgl">${g.items.map(x => rowItem(x, k, g.label)).join("")}</div>
    ${g.pend.length > 1 ? `<button class="pgall" data-act="pay-group" data-key="${esc(g.key)}"><span class="ms" aria-hidden="true">done_all</span>Marcar ${g.pend.length} pagos como hechos · ${fmt(pendT)}</button>` : ""}
  </div>`;
}
let prevCache = { key: "", m: null };
function previewMonth(k) {
  const lastK = monthKeys().at(-1);
  const key = JSON.stringify([k, S.debts.map(d => [d.balance, d.closed, d.cuota, d.rate]), S.funds.map(f => f.balance), S.months[lastK].items.map(i => [i.amount, i.paid, i.paidAmount]), S.recurring.map(r => r.schedule), S.oneoffs.length, S.order, S.income]);
  if (prevCache.key === key) return prevCache.m;
  const s = clone(S); const last = s.months[lastK];
  for (const it of last.items) if (!it.paid) { it.paid = true; it.paidAmount = it.amount; ENG.effect(s, it, 1); }
  s.months = {}; let kk = lastK, m = null;
  while (kk < k) { kk = ENG.keyAdd(kk, 1); m = ENG.generate(s, kk); if (kk < k) for (const it of m.items) if (!it.paid) { it.paid = true; it.paidAmount = it.amount; ENG.effect(s, it, 1); } }
  prevCache = { key, m }; return m;
}
// ---------- cargos por clasificar (alertas del banco por correo o SMS) ----------
const tarjetaDe = ult4 => ult4 ? S.debts.find(d => d.kind === "card" && String(d.digits || "") === String(ult4)) : null;
function fechaCargo(f) { const m = String(f || "").match(/^(\d{4})-(\d{2})-(\d{2})(?: (\d{2}):(\d{2}))?/); if (!m) return ""; return `${+m[3]} ${MESC[+m[2] - 1]}${m[4] && m[4] + m[5] !== "0000" ? ` · ${+m[4]}:${m[5]}` : ""}`; }
// ---------- estados de cuenta (llegan por correo) ----------
function ultimoEstado(d) {
  if (!d || !d.digits) return null;
  return Datos.estadosCuenta().filter(e => String(e.tarjeta) === String(d.digits) && e.fecha_corte).sort((a, b) => String(a.fecha_corte) < String(b.fecha_corte) ? -1 : 1).pop() || null;
}
// Mes del plan al que pertenece una fecha de pago (del 20 al 19)
function mesDeFecha(f) { const [y, m, d] = String(f).split("-").map(Number); return d >= 20 ? `${y}-${String(m).padStart(2, "0")}` : ENG.keyAdd(`${y}-${String(m).padStart(2, "0")}`, -1); }
// Lo que el plan paga a una tarjeta en un mes (incluye las cuotas 0% que van dentro del pago)
function planPagaTarjeta(d, k) {
  const m = S.months[k]; if (!m) return null;
  const ids = new Set([d.id].concat(S.debts.filter(x => x.parent === d.id).map(x => x.id)));
  return ENG.r2(m.items.filter(i => ids.has(i.debtId) && (i.debtSign ?? -1) === -1 && i.source !== "income").reduce((a, i) => a + (i.paid ? i.paidAmount : i.amount), 0));
}
// Avisos: el banco pide un mínimo mayor que lo que paga el plan ese mes
function avisosMinimo(k) {
  const out = [];
  for (const d of S.debts.filter(x => x.kind === "card" && !x.closed)) {
    const e = ultimoEstado(d); if (!e || !(num(e.pago_minimo) > 0) || !e.fecha_pago) continue;
    if (mesDeFecha(e.fecha_pago) !== k) continue;
    const paga = planPagaTarjeta(d, k); if (paga == null) continue;
    if (paga + 0.009 < num(e.pago_minimo)) out.push({ d, e, paga });
  }
  return out;
}
function fechaCorta(f) { const [y, m, d] = String(f).split("-").map(Number); return d ? `${d} ${MESC[m - 1]}` : ""; }

// Sugerencias: a dónde mandó Rudy cada comercio la última vez (se guarda en el plan)
function normComercio(c) { return String(c || "").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^A-Z. &]+/g, " ").replace(/\s+/g, " ").trim().split(" ").filter(w => w.length > 1).slice(0, 3).join(" "); }
function sugerencia(x) { const k = normComercio(x.comercio); return k && S.sugerencias ? S.sugerencias[k] || null : null; }
function textoSugerencia(dest) {
  if (!dest) return "";
  if (dest === "card") return "solo a la tarjeta";
  if (dest === "skip") return "no va en el plan";
  const env = S.months[S.current].items.find(i => i.envelope && "env:" + (i.recId || i.id) === dest);
  return env ? env.name.replace(/ \(.*\)/, "") : "";
}

function bandejaHTML() {
  const lista = Datos.bandeja(); if (!lista.length) return "";
  const filas = lista.map(x => { const t = tarjetaDe(x.tarjeta), sg = textoSugerencia(sugerencia(x)); return `<div class="row pcrow"><button class="main" data-act="pc" data-id="${esc(x.id)}"><span class="t">${gIco(t ? "credit_card" : x.nota ? "help" : "receipt_long", t && t.payWith)}${esc(x.comercio || "Cargo sin interpretar")}${sg ? `<span class="tag a">→ ${esc(sg)}</span>` : ""}</span><span class="m">${esc([t ? t.name : x.tarjeta ? "Tarjeta ··" + x.tarjeta : "", fechaCargo(x.fecha), x.origen === "correo" ? "por correo" : x.origen === "sms" ? "por SMS" : ""].filter(Boolean).join(" · "))}</span></button><div class="amt num">${x.monto ? fmt(num(x.monto)) : "—"}</div></div>`; });
  return `<section class="block pcbox"><h2>Por clasificar <small>${lista.length === 1 ? "1 cargo nuevo" : lista.length + " cargos nuevos"} de tu banco</small></h2><div class="list">${limitList(filas, 4, "Por clasificar", "Toca un cargo para asignarlo")}</div></section>`;
}
function dlgClasificar(id) {
  const x = Datos.bandeja().find(y => y.id === id); if (!x) return;
  const m = S.months[S.current], envs = m.items.filter(i => i.envelope), t = tarjetaDe(x.tarjeta), monto = ENG.r2(num(x.monto));
  const sug = sugerencia(x), envSug = sug && sug.startsWith("env:") ? envs.find(e => "env:" + (e.recId || e.id) === sug) : null;
  const marcado = envSug ? "env:" + envSug.id : sug === "card" && t ? "card" : sug === "skip" ? "skip" : envs.length ? "env:" + envs[0].id : t ? "card" : "skip";
  const opciones = envs.map((e, i) => { const left = ENG.r2(e.amount - ENG.spentOf(e)); return `<label><input type="radio" name="dest" value="env:${esc(e.id)}" ${marcado === "env:" + e.id ? "checked" : ""}><span><b>${icoHtml(e)} ${esc(e.name.replace(/ \(.*\)/, ""))}</b><em class="num">${left < -0.5 ? `te pasaste ${fmt0(-left)}` : `quedan ${fmt0(Math.max(0, left))}`}</em></span></label>`; })
    .concat(t ? [`<label><input type="radio" name="dest" value="card" ${marcado === "card" ? "checked" : ""}><span><b>${ms("credit_card")} Solo a la tarjeta</b><em>compra aparte, sin sobre</em></span></label>`] : [])
    .concat([`<label><input type="radio" name="dest" value="skip" ${marcado === "skip" ? "checked" : ""}><span><b>${ms("block")} No va en el plan</b><em>ya lo anoté o no es mío</em></span></label>`]);
  openDlg(`<h3>${esc(x.comercio || "Cargo del banco")}</h3>
    <p class="hint">${esc([monto ? fmt(monto) : "", t ? t.name : x.tarjeta ? "tarjeta ··" + x.tarjeta : "", fechaCargo(x.fecha)].filter(Boolean).join(" · "))}${t ? ". Al asignarlo sube el saldo de la tarjeta." : ""}${sug && textoSugerencia(sug) ? ` La última vez lo mandaste a <b>${esc(textoSugerencia(sug))}</b>.` : ""}</p>
    ${monto ? "" : fld("Monto", "amount", "", "number", 'required placeholder="$0.00"')}
    <fieldset class="seg"><legend>¿A dónde va?</legend>${opciones.join("")}</fieldset>
    <div class="actions"><button class="btn ghost" value="cancel">Cancelar</button><button class="btn primary" value="ok">Listo</button></div>`,
    f => {
      const dest = (f.querySelector('input[name="dest"]:checked') || {}).value || "skip";
      const amt = monto || ENG.r2(num(g(f, "amount")));
      if (dest !== "skip" && !amt) { toast("Escribe el monto"); return false; }
      const nombre = x.comercio || "Cargo del banco";
      const recordar = d => { const k = normComercio(x.comercio); if (k) { S.sugerencias = Object.assign({}, S.sugerencias || {}); S.sugerencias[k] = d; } };
      if (dest.startsWith("env:")) {
        const env = m.items.find(i => i.id === dest.slice(4)); if (!env) return false;
        will(`Asignaste ${nombre} a ${env.name}`);
        ENG.anotarGasto(S, env, amt, nombre, t ? t.id : null); recordar("env:" + (env.recId || env.id));
        Datos.clasificar(x.id, "asignado", "sobre:" + (env.recId || env.id));
        const left = ENG.r2(env.amount - ENG.spentOf(env));
        toast(left >= 0 ? `Anotado. Te quedan ${fmt(left)} en ${env.name.replace(/ \(.*\)/, "").toLowerCase()}` : `Anotado. Te pasaste ${fmt(-left)}`, true);
      } else if (dest === "card" && t) {
        will(`Cargo de ${fmt(amt)} a ${t.name}`);
        const it = { id: ENG.uid(), kind: "manual", source: "extra", cat: "Dinero extra", name: nombre, amount: amt, debtId: t.id, debtSign: 1, note: `Compra con ${t.name}${x.fecha ? " · " + fechaCargo(x.fecha) : ""}`, paid: true, paidAmount: amt };
        m.items.push(it); ENG.effect(S, it, 1); recordar("card");
        Datos.clasificar(x.id, "asignado", "tarjeta:" + t.id);
        toast(`Anotado en ${t.name}`, true);
      } else {
        will(`Descartaste ${nombre}`); recordar("skip");
        Datos.clasificar(x.id, "descartado", "");
        toast("Listo, no se anota en el plan", true);
      }
      changed(); render();
    });
}

function vMes() {
  const keys = monthKeys(); const lastK = keys.at(-1); const maxK = ENG.keyAdd(lastK, 24);
  if (!S.months[viewMonth] && !(viewMonth > lastK && viewMonth <= maxK)) viewMonth = S.current;
  const PREVIEW = !S.months[viewMonth];
  const k = viewMonth, m = PREVIEW ? previewMonth(k) : S.months[k], i = keys.indexOf(k), t = ENG.totals(m);
  const [yy, mm] = k.split("-").map(Number); const nk = ENG.keyAdd(k, 1); const nextName = MONTHS_LONG[+nk.slice(5) - 1];
  const base = Math.max(t.inc, t.total, 1);
  const wP = t.paid / base * 100, wQ = t.pending / base * 100, wF = Math.max(0, t.free) / base * 100;
  const { open, done } = groupsOf(m, k);
  const nextG = open.find(g => g.due);
  const fechas = fechasRaw(k);
  const isLast = k === keys.at(-1);
  let h = `<div class="monthbar">
      <button class="iconbtn" data-act="prev" ${k <= keys[0] ? "disabled" : ""} aria-label="Mes anterior">${ICON.left}</button>
      <div class="name"><b>${MONTHS_LONG[mm - 1][0].toUpperCase() + MONTHS_LONG[mm - 1].slice(1)} ${yy}</b><span>Pagos del 20 ${MESC[mm - 1]} al 19 ${MESC[(mm % 12)]}</span></div>
      <button class="iconbtn" data-act="next" ${k >= maxK ? "disabled" : ""} aria-label="Mes siguiente">${ICON.right}</button></div>`;
  if (PREVIEW) h += `<div class="preview"><b>${ms("visibility")}Vista previa</b><span>Así se vería ${MONTHS_LONG[mm - 1]} si sigues el plan. Los montos se ajustan con tus saldos reales cuando pases a ese mes.</span><button class="link" data-act="go-current">Volver a ${ENG.label(S.current)}</button></div>`;
  if (!PREVIEW && (!S.ui || !S.ui.introOff)) h += `<div class="intro"><b>Cómo se usa</b><ol><li>Cuando compres súper, gasolina o un gusto, toca <b>+ Gasto</b>.</li><li>Cuando hagas un pago, toca su círculo. Las deudas bajan solas.</li><li>Cuando llegue el siguiente salario, toca <b>Pasar a ${nextName}</b>.</li></ol><button class="btn ghost" data-act="intro-x">Entendido</button></div>`;
  if (m.closed) h += closedCard(m);
  const B = {};
  B.hero = `<div class="hero dark">
      <div class="hrow"><p class="lead">${t.pending > 0.004 ? "Te falta pagar" : "Este mes"}</p><span class="pill">${MONTHS_LONG[mm - 1]}</span></div>
      ${t.pending > 0.004 ? `<p class="big num">${money(t.pending)}</p>` : `<p class="big num">Todo pagado</p>`}
      <div class="pay" role="img" aria-label="Pagado ${fmt(t.paid)}, pendiente ${fmt(t.pending)}, libre ${fmt(Math.max(0, t.free))}"><span class="p" style="width:${wP}%"></span><span class="q" style="width:${wQ}%"></span><span class="f" style="width:${wF}%"></span></div>
      <div class="legend3">
        <div><i class="lp"></i>Pagado <b class="num">${fmt(t.paid)}</b></div>
        <div><i class="hatch"></i>Falta <b class="num">${fmt(t.pending)}</b></div>
        <div><i class="lf"></i>${t.free < -0.004 ? "Te faltan" : "Libre"} <b class="num">${fmt(Math.abs(t.free))}</b></div>
      </div>
      <p class="cap">De un ingreso de ${fmt(t.inc)}</p>
      ${t.free < -0.5 ? `<div class="warn">Te faltan ${fmt(-t.free)} para cubrir el mes. Agrega un ingreso o baja un gasto, y toca Recalcular.</div>` : t.free > 0.5 ? `<div class="okmsg">Tienes ${fmt(t.free)} sin asignar. Toca Recalcular para mandarlos a tu siguiente deuda.</div>` : ""}
    </div>
    <div class="qa">
      <button data-act="spend"><span>${QI.plus}</span>Gasto</button>
      <button data-act="go-pay"><span>${QI.check}</span>Pagar</button>
      <button data-act="move-any"><span>${QI.move}</span>Mover</button>
      ${cap.sample ? `<button data-act="ask"><span>${QI.ask}</span>Preguntar</button>` : `<button data-act="add-item"><span>${QI.more}</span>Más</button>`}
    </div>`;
  B.next = "";
  B.note = "";
  if (!PREVIEW && k === S.current) {
    const day = new Date().getDate(); const incs = m.items.filter(x => x.source === "income");
    const sal = incs.find(x => /^Salario/.test(x.name)), hon = incs.find(x => /^Honorarios/.test(x.name));
    const amtOf = re => { const it = m.items.find(x => re.test(x.name) && !x.paid); return it ? it.amount : 0; };
    if (sal && !sal.paid && day >= 19 && day <= 23) B.note += `<div class="paynote">${ms("payments")}<b>¿Ya llegó tu salario?</b><span class="small muted">Márcalo como recibido para que el mes cuadre.</span><button class="btn" data-act="toggle" data-id="${esc(sal.id)}">Ya llegó ${fmt(sal.amount)}</button></div>`;
    if (hon && !hon.paid && (day >= 28 || day <= 3)) { const iva = amtOf(/^IVA cobrado/), osc = amtOf(/^Contador · mensualidad/), ret = amtOf(/^Retención 10% del contador/); B.note += `<div class="paynote">${ms("receipt_long")}<b>¿Llegaron los honorarios?</b><ul>${iva ? `<li>Separa ${fmt(iva)} de IVA a tu cuenta de impuestos</li>` : ""}${osc ? `<li>Transfiere ${fmt(osc)} ${esc(S.etiquetas && S.etiquetas.contador ? "a " + S.etiquetas.contador : "al contador")} y aparta ${fmt(ret)} de retención</li>` : ""}<li>El resto (${fmt(hon.amount)}) es tuyo</li></ul><button class="btn" data-act="toggle" data-id="${esc(hon.id)}">Ya llegaron</button></div>`; }
  }
  if (nextG) { const d = dueTxt(nextG.due); B.next = `<div class="nextup ${d.c}"><span>Próximo pago</span><b>${esc(nextG.label)}</b><em>${d.t}</em><strong class="num">${fmt(nextG.pend.reduce((a, x) => a + x.amount, 0))}</strong></div>`; }
  B.chips = fechas.length ? `<div class="chips">${fechas.map(f => `<span class="chip">${ms("cake")}${esc(f.name)} · ${f.d} ${MESC[f.m - 1]}${f.amount ? ` · ${fmt0(f.amount)}` : ""}</span>`).join("")}</div>` : "";
  const envs = m.items.filter(x => x.envelope && x.source === "salary");
  B.env = "";
  if (envs.length) {
    B.env = `<section class="block"><h2>Tu día a día <button class="link" data-act="spend"><span class="ms" aria-hidden="true">add</span>Anotar gasto</button></h2><div class="list">`;
    for (const x of envs) {
      const sp = ENG.spentOf(x), left = ENG.r2(x.amount - sp), pct = Math.min(100, sp / Math.max(x.amount, 1) * 100), over = left < -0.004;
      const dl = k === S.current ? daysLeft(k) : null; const perDay = dl && left > 0.5 ? `<span class="perday">~${fmt(left / dl)} por día · ${dl} ${dl === 1 ? "día" : "días"}</span>` : "";
      B.env += `<button class="env" data-act="env" data-id="${esc(x.id)}"><span class="et"><b><span class="tile t-${esc(x.recId || "x")}" aria-hidden="true">${icoHtml(x)}</span>${esc(x.name.replace(/ \(.*\)/, ""))}</b><span class="num ${over ? "over" : ""}">${over ? `Te pasaste ${fmt(-left)}` : `Te quedan ${fmt(left)}`}</span></span>
        <span class="ebar"><span style="width:${pct}%;background:${over ? "var(--debt)" : pct >= 75 ? "var(--amber)" : "var(--jade)"}"></span></span>
        <span class="em">Gastado ${fmt(sp)} de ${fmt(x.amount)}<span class="pctpill ${over ? "over" : pct >= 75 ? "warn" : ""}">${Math.round(sp / Math.max(x.amount, 1) * 100)}%</span>${(x.spent || []).length ? ` · ${(x.spent || []).length} ${(x.spent || []).length === 1 ? "compra" : "compras"}` : ""}</span>${perDay}${over ? `<span class="perday over">Toca para cubrirlo con otro rubro</span>` : ""}</button>`;
    }
    B.env += `</div></section>`;
  }
  B.pay = `<section class="block"><h2>Pagos por hacer <small>${open.length ? `ordenados por fecha` : ""}</small></h2>${calStrip(m, k)}${open.length ? `<div class="pgs">${open.slice(0, 4).map(g => groupCard(g, k)).join("")}</div>${open.length > 5 ? moreBtn("Pagos por hacer", `<div class="pgs">${open.map(g => groupCard(g, k)).join("")}</div>`, open.length - 4, "Toca un destino para ver y marcar sus pagos") : open.length === 5 ? `<div class="pgs">${groupCard(open[4], k)}</div>` : ""}` : `<div class="list"><p class="empty">No te queda ningún pago este mes.</p></div>`}</section>`;
  const inc = m.items.filter(x => x.source === "income");
  B.inc = `<section class="block"><h2>Ingresos <small>marca cuando los recibas</small></h2><div class="list">${inc.map(x => rowItem(x, k)).join("")}</div></section>`;
  const ext = m.items.filter(x => x.source === "extra");
  B.ext = ext.length ? `<section class="block"><h2>Dinero extra <small>no sale de tu salario</small></h2><div class="list">${limitList(ext.map(x => rowItem(x, k)), 2, "Dinero extra", "Movimientos que no salen de tu salario")}</div></section>` : "";
  B.done = done.length ? `<section class="block"><details class="doneall"><summary>Ya pagado · ${done.length} ${done.length === 1 ? "destino" : "destinos"} · ${fmt(done.reduce((a, g) => a + g.total, 0))}</summary><div class="pgs">${done.map(g => groupCard(g, k)).join("")}</div></details></section>` : "";
  B.end = `<section class="block endcard">
     ${isLast ? `<h2>Fin de mes</h2><p class="small muted" style="margin:0 0 12px">Cuando recibas tu salario del 20 de ${nextName}, cierra este mes. Verás un resumen y se arma ${nextName} con tus saldos reales.</p><button class="btn primary wide" data-act="pass-next">Pasar a ${nextName}<span class="ms after" aria-hidden="true">arrow_forward</span></button>` : m.closed ? "" : `<button class="btn wide" data-act="close-month"><span class="ms" aria-hidden="true">event_available</span>Cerrar este mes</button>`}
     <details class="more"><summary>Más opciones</summary><div class="actions">
       ${cap.sample ? '<button class="btn" data-act="ask"><span class="ms" aria-hidden="true">forum</span>Preguntarle a mi plan</button>' : ""}
       <button class="btn" data-act="add-item"><span class="ms" aria-hidden="true">add</span>Agregar gasto o ingreso</button>
       ${isLast ? '<button class="btn" data-act="recalc"><span class="ms" aria-hidden="true">refresh</span>Recalcular mes</button>' : ""}
       ${m.closed ? '<button class="btn" data-act="reopen"><span class="ms" aria-hidden="true">lock_open</span>Reabrir mes</button>' : isLast ? '<button class="btn" data-act="close-month"><span class="ms" aria-hidden="true">event_available</span>Solo cerrar el mes</button>' : ""}
     </div></details></section>`;
  if (PREVIEW) { B.hero = B.hero.split('<div class="qa">')[0]; B.end = ""; }
  B.pc = !PREVIEW && k === S.current && !m.closed ? bandejaHTML() : "";
  if (!PREVIEW && !m.closed) for (const a of avisosMinimo(k)) B.note += `<div class="paynote aviso-min">${ms("warning")}<b>${esc(a.d.name)}: el banco pide un mínimo de ${fmt(num(a.e.pago_minimo))}</b><span class="small muted">Tu plan le paga ${fmt(a.paga)} este mes. Págale al menos el mínimo antes del ${fechaCorta(a.e.fecha_pago)} para evitar recargos.</span><button class="btn" data-act="debt" data-id="${esc(a.d.id)}">Ver la tarjeta</button></div>`;
  B.ins = insight(m, k);
  B.donut = donut(m);
  const o = (n, x) => x ? `<div class="o${n}">${x}</div>` : "";
  h += `<div class="cols mes"><div class="ca">${o(1, B.hero + B.note + B.pc)}${o(2, B.ins + B.next)}${o(3, B.chips)}${o(4, B.env)}${o(6, B.donut)}${o(7, B.inc)}${o(8, B.ext)}${o(10, B.end)}</div><div class="cb">${o(5, B.pay)}${o(9, B.done)}</div></div>`;
  if (PREVIEW) h = h.replace(/data-act="(toggle|item|pay-group|env|spend|go-pay|move-any|add-item)"/g, 'data-act="ro"').replace('<div class="cols mes">', '<div class="cols mes ro">');
  else if (k === S.current && !m.closed) h += `<button class="fab" data-act="spend" aria-label="Anotar gasto">${ms("add")}</button>`;

  return h;
}

function closedCard(m) {
  const s = m.summary || {};
  return `<div class="closed"><b>Mes cerrado</b><span>${s.debtStart != null ? `La deuda bajó ${fmt(s.debtStart - s.debtEnd)} este mes. ` : ""}${s.diff > 0.5 ? `Gastaste ${fmt(s.diff)} más de lo planeado.` : s.diff < -0.5 ? `Gastaste ${fmt(-s.diff)} menos de lo planeado.` : "Gastaste justo lo planeado."}${s.carried ? ` Pasaste ${fmt(s.carried)} al mes siguiente.` : ""}</span></div>`;
}
function dlgClose(k, andNext) {
  const m = S.months[k], t = ENG.totals(m), nk = ENG.keyAdd(k, 1);
  const planned = ENG.r2(m.items.filter(i => i.source === "salary").reduce((a, i) => a + i.amount, 0));
  const diff = ENG.r2(t.total - planned);
  const unpaid = m.items.filter(i => i.source === "salary" && !i.envelope && !i.paid && i.amount > 0);
  const carryable = unpaid.filter(i => !i.debtId && !i.fundId);
  const envLeft = ENG.r2(m.items.filter(i => i.envelope).reduce((a, i) => a + Math.max(0, i.amount - ENG.spentOf(i)), 0));
  const leftover = ENG.r2(envLeft + Math.max(0, t.free));
  const incPending = m.items.filter(i => i.source === "income" && !i.paid && i.amount > 0);
  const overs = m.items.filter(i => i.source === "salary").map(i => ({ n: i.name, d: ENG.r2((i.envelope ? Math.max(i.amount, ENG.spentOf(i)) : i.paid ? i.paidAmount : i.amount) - i.amount) })).filter(x => Math.abs(x.d) > 0.5);
  const dEnd = totalDebt(), dStart = m.debtStart;
  openDlg(`<h3>Cerrar ${ENG.label(k)}</h3><p class="hint">Un resumen de cómo te fue. Puedes reabrirlo después.</p>
    <div class="sumgrid">
      <div><span>Planeado</span><b class="num">${fmt(planned)}</b></div><div><span>Real</span><b class="num">${fmt(t.total)}</b></div>
      <div><span>Diferencia</span><b class="num" style="color:${diff > 0.5 ? "var(--debt)" : "var(--jade)"}">${diff > 0 ? "+" : ""}${fmt(diff)}</b></div>
      <div><span>Deuda al cierre</span><b class="num">${fmt(dEnd)}</b>${dStart != null ? `<em>bajó ${fmt(dStart - dEnd)}</em>` : ""}</div>
    </div>
    ${overs.length ? `<p class="small" style="margin:12px 0 4px"><b>Donde cambió</b></p><ul class="small" style="margin:0 0 8px;padding-left:18px">${overs.map(o => `<li>${esc(o.n)}: ${o.d > 0 ? "+" : ""}${fmt(o.d)}</li>`).join("")}</ul>` : ""}
    ${unpaid.length ? `<p class="small" style="margin:12px 0 4px"><b>Quedaron sin marcar (${unpaid.length})</b></p><ul class="small" style="margin:0 0 8px;padding-left:18px">${unpaid.map(i => `<li>${esc(i.name)}: ${fmt(i.amount)}${i.debtId || i.fundId ? " · si ya lo pagaste, márcalo antes de cerrar para que el saldo quede bien" : ""}</li>`).join("")}</ul>` : ""}
    ${carryable.length ? `<div class="fld"><label><input type="checkbox" name="carry" checked> Pasar ${carryable.length === 1 ? "el gasto pendiente" : "los gastos pendientes"} a ${ENG.label(nk)} (${fmt(carryable.reduce((a, i) => a + i.amount, 0))})</label></div>` : ""}
    ${incPending.length ? `<p class="small" style="margin:12px 0 4px;color:var(--debt)"><b>Faltan ingresos por marcar (${incPending.length}):</b> ${incPending.map(i => esc(i.name)).join(", ")}. Márcalos antes de cerrar para que el sobrante sea real.</p>` : ""}
    ${leftover > 0.5 ? `<div class="fld"><label><input type="checkbox" name="left" ${incPending.length ? "" : "checked"}> Mandar el sobrante (${fmt(leftover)}) a ${ENG.label(nk)} para abonar a tu deuda</label></div>` : ""}
    <div class="actions"><button class="btn ghost" value="cancel">Cancelar</button><button class="btn primary" value="ok">${andNext ? `Cerrar y empezar ${MONTHS_LONG[+nk.slice(5) - 1]}` : "Cerrar mes"}</button></div>`,
    f => {
      will(andNext ? `Pasaste a ${ENG.label(nk)}` : `Cerraste ${ENG.label(k)}`);
      const doCarry = f.elements.carry && f.elements.carry.checked, doLeft = f.elements.left && f.elements.left.checked;
      if (doCarry) { S.carry = S.carry || {}; S.carry[nk] = (S.carry[nk] || []).concat(carryable.map(i => ({ name: i.name, cat: i.cat, payWith: i.payWith, amount: i.amount }))); for (const i of carryable) i.note = (i.note ? i.note + " · " : "") + "pasado a " + ENG.label(nk); }
      if (doLeft) { S.carryIncome = S.carryIncome || {}; S.carryIncome[nk] = ENG.r2((S.carryIncome[nk] || 0) + leftover); }
      if (S.months[nk] && (doCarry || doLeft)) toast(`Toca Recalcular en ${ENG.label(nk)} para aplicarlo`);
      m.closed = new Date().toISOString(); m.debtEnd = dEnd;
      m.summary = { planned, real: t.total, diff, debtStart: dStart, debtEnd: dEnd, carried: doCarry ? ENG.r2(carryable.reduce((a, i) => a + i.amount, 0)) : 0, leftover: doLeft ? leftover : 0 };
      if (andNext && !S.months[nk]) { const mm = ENG.generate(S, nk); S.months[nk] = mm; S.current = nk; viewMonth = nk; changed(k, nk); render(); window.scrollTo({ top: 0 }); toast(`Listo: ${ENG.longLabel(nk)} armado con tus saldos reales`, true); return; }
      changed(k); render(); if (!S.months[nk] || !(doCarry || doLeft)) toast(`${ENG.label(k)} cerrado`, true);
    });
}
function dlgSpend(k, envId) {
  const m = S.months[k]; const envs = m.items.filter(i => i.envelope);
  if (!envs.length) { toast("Este mes no tiene gastos del día a día"); return; }
  const payOpts = [["", "Débito o efectivo"]].concat(S.debts.filter(d => d.kind === "card" && !d.closed).map(d => [d.id, d.name + " (sube la deuda)"]));
  openDlg(`<h3>Anotar un gasto</h3><p class="hint">Se resta de lo que te queda en ese rubro.</p>
    ${fld("Monto", "amount", "", "number", 'required placeholder="$0.00"')}
    <fieldset class="seg"><legend>Rubro</legend>${envs.slice().sort((x, y) => (y.recId === "super") - (x.recId === "super")).map((e, i) => { const sel0 = envId ? e.id === envId : i === 0; const left = ENG.r2(e.amount - ENG.spentOf(e)); return `<label><input type="radio" name="env" value="${esc(e.id)}" ${sel0 ? "checked" : ""}><span><b>${icoHtml(e)} ${esc(e.name.replace(/ \(.*\)/, ""))}</b><em class="num">${left < -0.5 ? `te pasaste ${fmt0(-left)}` : `quedan ${fmt0(Math.max(0, left))}`}</em></span></label>`; }).join("")}</fieldset>
    ${fld("¿Qué fue?", "note", "", "text", 'placeholder="Súper Selectos, gasolinera, regalo…"')}
    ${sel("Pagado con", "card", "", payOpts)}
    <div class="actions"><button class="btn ghost" value="cancel">Cancelar</button><button class="btn primary" value="ok">Anotar</button></div>`,
    f => {
      const amt = ENG.r2(num(g(f, "amount"))); if (!amt) { toast("Escribe el monto"); return false; }
      const ev = f.querySelector('input[name="env"]:checked'); const it = m.items.find(i => i.id === (ev ? ev.value : "")); if (!it) return false;
      will(`Gasto de ${fmt(amt)} en ${it.name}`);
      const e = { id: ENG.uid(), at: new Date().toISOString(), amount: amt, note: g(f, "note") };
      const cid = g(f, "card"); if (cid) { e.cardId = cid; const d = ENG.debtById(S, cid); if (d) d.balance = ENG.r2(d.balance + amt); }
      (it.spent = it.spent || []).push(e); changed(k); render();
      const left = ENG.r2(it.amount - ENG.spentOf(it)); toast(left >= 0 ? `Anotado. Te quedan ${fmt(left)} en ${it.name.replace(/ \(.*\)/, "").toLowerCase()}` : `Anotado. Te pasaste ${fmt(-left)}`, true);
    });
}
function dlgEnv(it, k) {
  const list = (it.spent || []).slice().reverse();
  const d = dlg();
  d.innerHTML = `<div class="dlg"><h3>${esc(it.name)}</h3><p class="hint">${fmt(ENG.spentOf(it))} gastados de ${fmt(it.amount)} en ${ENG.label(k)}.</p>
    <div class="list" style="max-height:44vh;overflow:auto">${list.length ? list.map(e => `<div class="row"><div class="main"><span class="t">${esc(e.note || "Gasto")}</span><span class="m">${new Date(e.at).toLocaleDateString("es-SV", { day: "numeric", month: "short" })}${e.cardId ? " · " + esc((ENG.debtById(S, e.cardId) || {}).name || "tarjeta") : ""}</span></div><div class="amt num">${fmt(e.amount)}</div><button class="btn ghost" data-del="${esc(e.id)}" aria-label="Borrar">Borrar</button></div>`).join("") : '<p class="empty">Todavía no anotas compras aquí.</p>'}</div>
    <form id="envf" style="margin-top:14px">${fld("Presupuesto de este mes", "amount", it.amount, "number")}
    <div class="actions"><button type="button" class="btn" id="envadd">Anotar gasto</button><button type="button" class="btn" id="envmove">${ENG.spentOf(it) > it.amount + 0.004 ? "Cubrir con otro rubro" : "Mover dinero aquí"}</button><button type="button" class="btn ghost" id="envx">Cerrar</button><button class="btn primary">Guardar presupuesto</button></div></form></div>`;
  d.querySelector(".list").addEventListener("click", ev => { const b = ev.target.closest("[data-del]"); if (!b) return; const e = it.spent.find(x => x.id === b.dataset.del); if (!e) return; will(`Borraste un gasto de ${fmt(e.amount)}`); if (e.cardId) { const dd = ENG.debtById(S, e.cardId); if (dd) dd.balance = ENG.r2(Math.max(0, dd.balance - e.amount)); } it.spent = it.spent.filter(x => x !== e); changed(k); render(); d.close(); toast("Gasto borrado", true); });
  $("#envf").addEventListener("submit", ev => { ev.preventDefault(); will(`Cambiaste el presupuesto de ${it.name}`); it.amount = ENG.r2(num(ev.target.elements.amount.value)); changed(k); render(); d.close(); toast("Presupuesto actualizado", true); });
  $("#envadd").onclick = () => { d.close(); dlgSpend(k, it.id); };
  $("#envmove").onclick = () => { d.close(); dlgMove(k, it.id); };
  $("#envx").onclick = () => d.close();
  d.showModal();
}
function dlgMove(k, toId) {
  const m = S.months[k];
  if (!toId) { const envs = m.items.filter(i => i.envelope); if (envs.length < 2) { toast("Necesitas al menos dos rubros para mover dinero"); return; } const ov = envs.find(i => ENG.spentOf(i) > i.amount + 0.004); toId = (ov || envs.slice().sort((x, y) => (x.amount - ENG.spentOf(x)) - (y.amount - ENG.spentOf(y)))[0]).id; }
  const to = m.items.find(i => i.id === toId); if (!to) return;
  const froms = m.items.filter(i => i.envelope && i.id !== toId).map(i => ({ i, left: ENG.r2(i.amount - ENG.spentOf(i)) })).filter(x => x.left > 0.004);
  if (!froms.length) { toast("Ningún otro rubro tiene dinero disponible"); return; }
  const over = ENG.r2(ENG.spentOf(to) - to.amount);
  const n = x => x.name.replace(/ \(.*\)/, "");
  openDlg(`<h3>Mover dinero a ${esc(n(to).toLowerCase())}</h3><p class="hint">${over > 0 ? `Te pasaste ${fmt(over)}. Tómalo de otro rubro para que el mes siga cuadrando.` : "Pasa presupuesto de un rubro a otro. El total del mes no cambia."}</p>
    <fieldset class="seg"><legend>Tomarlo de</legend>${froms.map((x, j) => `<label><input type="radio" name="from" value="${esc(x.i.id)}" ${j === 0 ? "checked" : ""}><span><b>${icoHtml(x.i)} ${esc(n(x.i))}</b><em class="num">disponible ${fmt0(x.left)}</em></span></label>`).join("")}</fieldset>
    ${fld("Monto", "amount", over > 0 ? Math.min(over, froms[0].left).toFixed(2) : "", "number", "required")}
    <div class="actions"><button class="btn ghost" value="cancel">Cancelar</button><button class="btn primary" value="ok">Mover</button></div>`,
    f => {
      const fr = m.items.find(i => i.id === (f.querySelector('input[name="from"]:checked') || {}).value); const amt = ENG.r2(num(g(f, "amount")));
      if (!fr || !amt) { toast("Elige el rubro y el monto"); return false; }
      const avail = ENG.r2(fr.amount - ENG.spentOf(fr)); if (amt > avail + 0.004) { toast(`${n(fr)} solo tiene ${fmt(avail)} disponibles`); return false; }
      will(`Moviste ${fmt(amt)} de ${n(fr)} a ${n(to)}`); fr.amount = ENG.r2(fr.amount - amt); to.amount = ENG.r2(to.amount + amt);
      changed(k); render(); toast(`Listo: ${fmt(amt)} de ${n(fr).toLowerCase()} a ${n(to).toLowerCase()}`, true);
    });
}
function debtLine(d) {
  if (d.kind === "card") return `${(d.rate * 100).toFixed(1)}% · mínimo ${(d.minPct * 100).toFixed(1)}%${d.extra ? ` + $${d.extra}` : ""}`;
  if (d.kind === "installment") return `${fmt(d.cuota)}/mes · quedan ${Math.round(d.balance / d.cuota)}`;
  if (d.kind === "loan") return `${d.rate ? (d.rate * 100).toFixed(1) + "% · " : "sin interés · "}cuota ${fmt(d.cuota)}`;
  return d.rate ? `${(d.rate * 100).toFixed(1)}%` : "sin interés";
}
let orderMode = false;
function vDeudas() {
  const started = S.debts.filter(d => !d.closed && (d.since || d.start) <= S.current);
  const total = started.reduce((a, d) => a + d.balance, 0);
  const initial = started.reduce((a, d) => a + Math.max(d.initial || 0, d.balance), 0);
  const paidPct = initial ? Math.max(0, Math.min(100, (1 - total / initial) * 100)) : 0;
  const p = getProj();
  const R = 52, C = 2 * Math.PI * R;
  const ring = `<svg class="ring" viewBox="0 0 128 128" width="128" height="128" role="img" aria-label="${Math.round(paidPct)}% pagado"><circle cx="64" cy="64" r="${R}" fill="none" stroke="var(--track)" stroke-width="14"/>${paidPct >= 0.5 ? `<circle cx="64" cy="64" r="${R}" fill="none" stroke="var(--jade)" stroke-width="14" stroke-linecap="round" stroke-dasharray="${(paidPct / 100 * C).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 64 64)"/>` : ""}<text x="64" y="62" text-anchor="middle" font-size="26" font-weight="600" fill="var(--ink)" font-family="Sora,system-ui">${Math.round(paidPct)}%</text><text x="64" y="82" text-anchor="middle" font-size="12" fill="var(--muted)">pagado</text></svg>`;
  const zeros = S.debts.filter(d => d.kind !== "installment" && (d.closed || (d.balance <= 0.5 && (d.initial || 0) > 0.5))).length, totalD = S.debts.filter(d => d.kind !== "installment").length;
  let h = `<div class="cols deu"><div class="ca"><div class="o1 stick"><div class="hero"><div class="ringrow">${ring}<div><p class="lead">Debes en total</p><p class="big num" style="color:var(--debt);font-size:clamp(30px,7vw,40px);margin-bottom:6px">${fmt(total)}</p><p class="cap" style="margin:0">${zeros} de ${totalD} deudas liquidadas${p.debtFree ? `<br>Sin deudas en ${ENG.longLabel(p.debtFree)}` : ""}</p></div></div></div>
    <div class="actions">${cap.images ? '<button class="btn primary" data-act="photo"><span class="ms" aria-hidden="true">photo_camera</span>Actualizar saldos con fotos</button>' : ""}<button class="btn" data-act="add-debt"><span class="ms" aria-hidden="true">add</span>Agregar deuda</button></div>
    <p class="small muted" style="margin-top:14px">Toca una deuda para editar su saldo, cuota o tasa. Los cambios se aplican al próximo mes; para aplicarlos ya, usa Recalcular en Mes.</p></div></div><div class="cb"><div class="o2">`;
  h += planVsBase(p);
  const cardsL = S.debts.filter(d => d.kind === "card");
  if (cardsL.length) {
    h += `<section class="block"><h2>Mis tarjetas <small>toca una para ver su detalle</small></h2><div class="ccards">${cardsL.map(d => { const instT = S.debts.filter(x => x.parent === d.id).reduce((s, x) => s + x.balance, 0); const used = d.balance + instT; const pct = d.limit ? Math.min(100, used / d.limit * 100) : 0; return `<button class="ccard b-${bankOf(d.payWith) || "x"} ${d.closed || d.balance <= 0.5 ? "zero" : ""}" data-act="debt" data-id="${esc(d.id)}">
      <span class="cc-top"><span>${esc(d.bank || "")}</span><span>${(d.rate * 100).toFixed(1)}%</span></span>
      <span class="cc-name">${esc(d.name.replace(/^Tarjeta /, ""))}</span>
      <span class="cc-num">•••• ${esc(d.digits || "····")}</span>
      <span class="cc-bal num">${d.closed || d.balance <= 0.5 ? "En cero" : money(d.balance)}</span>
      ${d.limit ? `<span class="cc-bar"><span style="width:${pct}%"></span></span><span class="cc-lim">${Math.round(pct)}% de ${fmt0(d.limit)}${d.due ? ` · paga el ${d.due}` : ""}</span>` : ""}
    </button>`; }).join("")}</div></section>`;
  }
  h += `<section class="block"><h2>Orden de ataque <button class="link" data-act="order-mode"><span class="ms" aria-hidden="true">${orderMode ? "check" : "swap_vert"}</span>${orderMode ? "Listo" : "Cambiar orden"}</button></h2>
    <p class="small muted" style="margin:-2px 0 10px">Lo que sobra cada mes se va a la primera de la lista que no esté en cero.</p><div class="list">`;
  const firstOpen = S.order.findIndex(id => id.startsWith("fund:") ? (() => { const f = ENG.fundById(S, id.slice(5)); return f && f.target && f.balance < f.target - 0.01; })() : (() => { const d = ENG.debtById(S, id); return d && !d.closed && d.balance > 0.5 && d.start <= S.current; })());
  S.order.forEach((id, i) => {
    const isF = id.startsWith("fund:"); const o = isF ? ENG.fundById(S, id.slice(5)) : ENG.debtById(S, id); if (!o) return;
    const bal = o.balance; const zero = isF ? (o.target && bal >= o.target - 0.01) : (o.closed || bal <= 0.5);
    const pct = isF ? Math.min(100, bal / Math.max(o.target || 1, 1) * 100) : Math.min(100, Math.max(0, (1 - bal / Math.max(o.initial || bal || 1, 1)) * 100));
    const tag = isF ? (zero ? '<span class="tag g">Completo</span>' : '<span class="tag a">Fondo</span>') : o.closed ? '<span class="tag">Cerrada</span>' : zero ? '<span class="tag g">En cero</span>' : o.start > S.current ? `<span class="tag">Desde ${ENG.label(o.start)}</span>` : i === firstOpen ? '<span class="tag d">Atacando ahora</span>' : "";
    const meta = isF ? `Meta ${fmt0(o.target)}` : o.kind === "card" ? `${(o.rate * 100).toFixed(1)}% de interés` : o.kind === "loan" ? `Cuota ${fmt0(o.cuota)}${o.rate ? ` · ${(o.rate * 100).toFixed(1)}%` : ""}` : o.rate ? `${(o.rate * 100).toFixed(1)}%` : "Sin interés";
    const when = !isF && !zero && p.milestones.find(x => x.t === o.name); const whenF = isF && !zero && p.milestones.find(x => x.t === o.name);
    h += `<div class="dc ${zero ? "zero" : ""} ${i === firstOpen ? "now" : ""}">
      <span class="rank num">${i + 1}</span>
      <button class="dcm" data-act="${isF ? "fund" : "debt"}" data-id="${esc(isF ? id.slice(5) : id)}"><span class="t">${isF ? `<span class="ico" aria-hidden="true">${icoHtml(o)}</span>` : gIco(debtIcon(o), o.payWith)}${esc(o.name)}${tag}</span><span class="m">${meta}${(when || whenF) ? ` · ${isF ? "completo" : "en cero"}: ${ENG.label((when || whenF).k).toLowerCase()}` : ""}</span><span class="bar"><span style="width:${pct}%"></span></span></button>
      ${orderMode ? `<span class="order"><button data-act="up" data-i="${i}" aria-label="Subir ${esc(o.name)}" ${i === 0 ? "disabled" : ""}>${ICON.up}</button><button data-act="down" data-i="${i}" aria-label="Bajar ${esc(o.name)}" ${i === S.order.length - 1 ? "disabled" : ""}>${ICON.down}</button></span>` : `<span class="amt num">${fmt(bal)}</span>`}
    </div>`;
  });
  h += `</div></section>`;
  const others = S.debts.filter(d => !S.order.includes(d.id));
  if (others.length) {
    h += `<section class="block"><h2>Cuotas 0% <small>toca para ver el detalle</small></h2><div class="list">`;
    const cuotasH = [];
    for (const d of others) { const zero = d.balance <= 0.005; cuotasH.push(`<div class="dc ${zero ? "zero" : ""}"><span class="rank"></span><button class="dcm" data-act="debt" data-id="${esc(d.id)}"><span class="t">${gIco("shopping_bag", d.payWith)}${esc(d.name)}${zero ? '<span class="tag g">En cero</span>' : ""}</span><span class="m">${debtLine(d)}</span></button><span class="amt num">${fmt(d.balance)}</span></div>`); }
    h += limitList(cuotasH, 4, "Cuotas 0%", "Toca una para ver su detalle") + `</div></section>`;
  }
  h += `</div></div></div>`;
  return h;
}

function vFondos() {
  const cur = S.months[S.current];
  let h = `<section class="block" style="margin-top:0"><h2>Tus fondos <small>dinero apartado en tu cuenta de ahorro</small></h2><div class="list fundgrid">`;
  for (const f of S.funds) {
    const thisM = cur ? cur.items.filter(i => i.fundId === f.id).reduce((a, i) => a + (i.paid ? i.paidAmount : i.amount), 0) : 0;
    const pct = f.target ? Math.min(100, f.balance / f.target * 100) : 0;
    const inW = S.order.includes("fund:" + f.id);
    h += `<div class="fund"><div class="head"><b><span class="ico" aria-hidden="true">${icoHtml(f)}</span>${esc(f.name)}</b><span class="num" style="font-weight:600;font-size:18px">${fmt(f.balance)}</span></div>
      ${f.target ? `<div class="bar"><span style="width:${pct}%"></span></div>` : `<div style="height:10px"></div>`}
      <div class="meta"><span>${f.target ? `Meta ${fmt0(f.target)} · ${Math.round(pct)}%` : "Sin meta fija"}</span><span>${thisM ? `Este mes: ${fmt(thisM)}` : inW ? "Recibe lo que sobre, según tu orden" : (() => { const nx = (f.schedule || []).find(e => e.from > S.current && e.amount > 0); const cur = ENG.sched(f.schedule, S.current); return cur > 0 ? `${fmt0(cur)} al mes` : nx ? `Desde ${ENG.label(nx.from).toLowerCase()}: ${fmt0(nx.amount)} al mes` : f.target && f.balance >= f.target - 0.01 ? "Meta cumplida" : "Sin aporte fijo"; })()}</span></div>
      ${f.note ? `<p class="fnote">${esc(f.note)}</p>` : ""}
      <div class="fa"><button class="btn" data-act="withdraw" data-id="${esc(f.id)}" title="Registra que sacaste dinero de este fondo para pagar algo"><span class="ms" aria-hidden="true">output</span>Sacar dinero</button><button class="btn ghost" data-act="fund" data-id="${esc(f.id)}" title="Cambiar nombre, meta, aporte o saldo"><span class="ms" aria-hidden="true">tune</span>Configurar</button></div></div>`;
  }
  h += `</div></section><div class="actions"><button class="btn primary" data-act="add-fund"><span class="ms" aria-hidden="true">add</span>Nuevo fondo</button></div>
   <p class="small muted" style="margin-top:14px">El aporte de cada mes aparece en la hoja del mes; cuando lo marcas como pagado, el fondo sube. Usa “Usar dinero” cuando pagues la renta, la graduación o una emergencia.</p>`;
  return h;
}
const longK = k => { const [y, m] = k.split("-").map(Number); return ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"][m - 1] + " " + y; };
const monthsBetween = (a, b) => { const [y1, m1] = a.split("-").map(Number), [y2, m2] = b.split("-").map(Number); return (y2 - y1) * 12 + m2 - m1; };
const WIDE = () => window.matchMedia("(min-width:1024px)").matches;
function chart(p) {
  const rows = p.rows; const W = WIDE() ? 760 : 360, H = WIDE() ? 250 : 210, P = { l: 8, r: 8, t: 22, b: 26 };
  const real = Object.keys(S.months).sort().filter(k => S.months[k].debtEnd != null && k !== S.current).map(k => [k, S.months[k].debtEnd]);
  const route = real.concat(rows.map(r => [r.k, r.debt]));
  const base = S.baseline || [];
  const keys = [...new Set(base.map(x => x[0]).concat(route.map(x => x[0])))].sort();
  const max = Math.max(...route.map(x => x[1]), ...base.map(x => x[1]), 1); const n = keys.length - 1 || 1;
  const X = k => P.l + keys.indexOf(k) / n * (W - P.l - P.r), Y = v => P.t + (1 - v / max) * (H - P.t - P.b);
  const pts = arr => arr.map(([k, v]) => `${X(k).toFixed(1)},${Y(v).toFixed(1)}`).join(" ");
  const area = `M${X(route[0][0])},${Y(0)} L${pts(route).replace(/ /g, " L")} L${X(route.at(-1)[0])},${Y(0)} Z`;
  const yrs = keys.filter(k => k.endsWith("-01"));
  const xl = yrs.map(k => `<line x1="${X(k)}" x2="${X(k)}" y1="${P.t}" y2="${H - P.b}" stroke="var(--line)"/><text x="${X(k) + 3}" y="${H - 9}" font-size="11" fill="var(--muted)">${k.slice(0, 4)}</text>`).join("");
  let jump = ""; for (let i = 1; i < route.length; i++) if (route[i][1] - route[i - 1][1] > 5000) { const jx = X(route[i][0]) + 22, fin = jx > W - 110; jump = `<text x="${fin ? X(route[i][0]) - 8 : jx}" y="${Y(route[i][1]) + 62}" font-size="11" fill="var(--debt)" text-anchor="${fin ? "end" : "start"}">+ deuda nueva</text>`; break; }
  const top = `<text x="${W - P.r}" y="12" font-size="11" fill="var(--muted)" text-anchor="end">máx. ${fmt0(max)}</text>`;
  const dots = real.map(([k, v]) => `<circle cx="${X(k)}" cy="${Y(v)}" r="3.5" fill="var(--jade)" stroke="var(--surface)" stroke-width="1.5"/>`).join("");
  const end = p.debtFree ? `<circle cx="${X(p.debtFree)}" cy="${Y(0)}" r="5" fill="var(--jade)"/>` : "";
  return `<svg viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="Deuda total proyectada mes a mes">${xl}${top}<path d="${area}" fill="var(--debt-soft)"/>${base.length ? `<polyline points="${pts(base)}" fill="none" stroke="var(--muted)" stroke-width="1.6" stroke-dasharray="4 4"/>` : ""}<polyline points="${pts(route)}" fill="none" stroke="var(--debt)" stroke-width="2.4" stroke-linejoin="round"/>${dots}${end}${jump}</svg>
  <div class="ckey"><span><i style="background:var(--debt)"></i>Tu ruta</span>${base.length ? '<span><i class="dash"></i>Plan original</span>' : ""}${real.length ? '<span><i class="dot"></i>Mes cerrado</span>' : ""}</div>`;
}
function vPlan() {
  const p = getProj();
  const months = p.debtFree ? monthsBetween(S.current, p.debtFree) : null;
  const base = S.baseline ? new Map(S.baseline) : null; const bNow = base ? base.get(S.current) : null; const diff = bNow != null ? ENG.r2(p.rows[0].debt - bNow) : null;
  const vs = diff == null ? "" : Math.abs(diff) < 20 ? "Vas igual que el plan original." : diff < 0 ? `Vas ${fmt0(-diff)} adelante del plan original.` : `Vas ${fmt0(diff)} atrás del plan original.`;
  let h = `<div class="hero">
    <p class="lead">${p.debtFree ? "Quedas sin ninguna deuda en" : "Con el plan actual"}</p>
    <p class="big num" style="color:var(--jade)">${p.debtFree ? longK(p.debtFree) : "más de 10 años"}</p>
    <p class="sub">${p.debtFree ? `Faltan ${months} meses. ${vs}` : "Con estos números las deudas no terminan. Revisa tus cuotas."}</p>
    ${chart(p)}
    <p class="cap">De aquí en adelante pagarías unos ${fmt0(p.interest)} de intereses.</p>
  </div>`;
  h += `<div class="cols plan"><div class="ca"><div class="o1">`;
  h += `<section class="block"><h2>¿Y si pongo más?</h2><div class="sim">
     <label for="simM">Abono extra cada mes</label>
     <div class="simrow"><input id="simM" type="range" min="0" max="800" step="25" value="0" aria-describedby="simOut"><b id="simMv" class="num">$0</b></div>
     <label for="simO">Un ingreso extra el próximo mes</label>
     <input id="simO" type="number" inputmode="decimal" placeholder="Bono, aguinaldo, venta del iPhone…">
     <div id="simOut" class="simout" aria-live="polite">Mueve el control para ver cuánto antes terminarías.</div></div></section></div></div><div class="cb"><div class="o2">`;
  h += `<section class="block"><h2>Lo que viene</h2>${(() => { const L = p.milestones.map(m => `<li class="tl-${esc(m.type)}"><span class="when">${ENG.label(m.k)}</span><span class="what"><b>${esc(m.t)}</b>${m.type === "fund" ? "fondo completo" : "en cero"} · en ${monthsBetween(S.current, m.k)} meses</span></li>`); if (p.debtFree) L.push(`<li class="tl-free"><span class="when">${ENG.label(p.debtFree)}</span><span class="what"><b>Sin ninguna deuda</b>libre</span></li>`); if (!L.length) return `<ol class="tl"><li><span class="what">Todo al día.</span></li></ol>`; const N = 5; return `<ol class="tl">${L.slice(0, N).join("")}</ol>` + (L.length > N + 1 ? moreBtn("Lo que viene", `<ol class="tl">${L.join("")}</ol>`, L.length - N, "Cada deuda y fondo, en orden") : L.length === N + 1 ? `<ol class="tl" start="${N + 1}">${L[N]}</ol>` : ""); })()}</section></div></div></div>`;
  h += `<section class="block"><details class="list"><summary class="sum">Ver la tabla mes a mes</summary><div style="overflow-x:auto"><table class="tbl"><thead><tr><th>Salario de</th><th>Deuda total</th><th>Abonos extra</th><th>Emergencia</th></tr></thead><tbody>${p.rows.slice(1).map(r => `<tr class="num"><td>${ENG.label(r.k)}</td><td>${fmt0(r.debt)}</td><td>${r.extra ? fmt0(r.extra) : "—"}</td><td>${fmt0(r.funds.emerg || 0)}</td></tr>`).join("")}</tbody></table></div></details></section>
  <p class="small muted" style="margin-top:14px">La proyección parte de tus saldos reales de hoy y supone que este mes se paga como está planeado.</p>`;
  return h;
}

let simT = null;
function wireSim() {
  const m = $("#simM"), o = $("#simO"), out = $("#simOut"); if (!m) return;
  const run = () => {
    const em = +m.value, eo = num(o.value); $("#simMv").textContent = fmt0(em);
    if (!em && !eo) { out.textContent = "Mueve el control para ver cuánto antes terminarías."; out.classList.remove("on"); return; }
    const base = getProj(), s = ENG.project(S, { extraMonthly: em, extraOnce: eo });
    if (!s.debtFree || !base.debtFree) { out.textContent = "Con esto no alcanza a cambiar la fecha."; return; }
    const diff = monthsBetween(s.debtFree, base.debtFree), save = base.interest - s.interest;
    out.innerHTML = diff > 0 ? `<b class="num">${diff} ${diff === 1 ? "mes" : "meses"} antes</b><span>Terminarías en ${ENG.longLabel(s.debtFree)} y te ahorras unos ${fmt0(save)} de intereses.</span>` : `<b class="num">Mismo mes</b><span>Sales en ${ENG.longLabel(s.debtFree)}, pero te ahorras unos ${fmt0(save)} de intereses.</span>`; out.classList.add("on");
  };
  const deb = () => { clearTimeout(simT); simT = setTimeout(run, 120); };
  m.addEventListener("input", deb); o.addEventListener("input", deb);
}
function vAjustes() {
  const k = S.current;
  let h = `<div class="cols mas"><div class="ca"><section class="block" style="margin-top:0"><h2>Salario líquido <small>desde ${ENG.label(k)}</small></h2><div class="list"><div class="row"><button class="main" data-act="salary"><span class="t">${gIco("payments")}${esc(S.salaryName || "Salario de cada mes")}</span><span class="m">Toca para cambiarlo desde este mes</span></button><div class="amt num">${fmt(ENG.sched(S.income, k))}</div></div>${(S.incomeExtra || []).map(x => `<div class="row"><button class="main" data-act="incx" data-id="${esc(x.id)}"><span class="t">${gIco(x.icon || (x.id === "iva" ? "receipt" : "work"))}${esc(x.name)}</span><span class="m">${esc(x.note || "")}</span></button><div class="amt num">${fmt(ENG.sched(x.schedule, k))}</div></div>`).join("")}</div></section>`;
  h += `<section class="block"><h2>Gastos fijos <small>se agregan solos cada mes</small></h2><div class="list">`;
  for (const r of S.recurring) { const a = ENG.sched(r.schedule, k); h += `<div class="row"><button class="main" data-act="rec" data-id="${esc(r.id)}"><span class="t">${gIco(recIcon(r))}${esc(r.name)}${a ? "" : '<span class="tag">Sin monto este mes</span>'}</span><span class="m">${esc(r.cat)} · ${esc(r.payWith)}</span></button><div class="amt num">${fmt(a)}</div></div>`; }
  h += `</div></section><div class="actions"><button class="btn" data-act="add-rec"><span class="ms" aria-hidden="true">add</span>Agregar gasto fijo</button></div></div><div class="cb">`;
  h += `<section class="block"><h2>Fechas especiales <small>salen de tus gustos</small></h2><div class="list">`;
  const fs = (S.fechas || []).slice().sort((x, y) => x.m * 40 + x.d - (y.m * 40 + y.d));
  for (const f of fs) h += `<div class="row"><button class="main" data-act="fecha" data-id="${esc(f.id)}"><span class="t"><span class="gi acc" aria-hidden="true">${ms("cake")}</span>${esc(f.name)}</span><span class="m">${f.d} de ${["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"][f.m - 1]}</span></button><div class="amt num">${f.amount ? fmt0(f.amount) : "—"}</div></div>`;
  h += `</div></section><div class="actions"><button class="btn" data-act="add-fecha"><span class="ms" aria-hidden="true">add</span>Agregar fecha</button></div>`;
  if (cap.sample) h += `<section class="block"><h2>Asistente</h2><div class="list"><div class="row"><button class="main" data-act="ask"><span class="t">${gIco("forum")}Preguntarle a mi plan</span><span class="m">Por ejemplo: ¿me alcanza para $80 este mes?</span></button></div></div></section>`;
  const log = (S.log || []).slice(-30).reverse();
  h += `<section class="block"><h2>Historial de cambios <small>lo último que hiciste</small></h2><div class="list">${log.length ? limitList(log.map(l => `<div class="row" style="min-height:48px"><div class="main"><span class="t" style="font-weight:400">${gIco("history")}${esc(l.t)}</span><span class="m">${new Date(l.at).toLocaleString("es-SV", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}</span></div></div>`), 5, "Historial de cambios", "Lo último que hiciste en tu plan") : '<p class="empty">Aquí aparecerá cada cambio que hagas.</p>'}</div>
    <div class="actions">${undoStack.length ? `<button class="btn" data-act="undo"><span class="ms" aria-hidden="true">undo</span>Deshacer: ${esc(undoStack.at(-1).label)}</button>` : ""}</div></section>`;
  h += claudeHTML();
  h += seguridadHTML();
  h += instalarHTML();
  h += `<section class="block"><h2>Tus datos</h2><div class="list"><div class="row"><div class="main"><span class="t">${gIco(Datos.estado().icono)}${esc(Datos.estado().titulo)}</span><span class="m">${esc(Datos.estado().detalle)}</span></div></div></div>
    <div class="actions"><button class="btn primary" data-act="sync-now"><span class="ms" aria-hidden="true">sync</span>Sincronizar ahora</button><button class="btn" data-act="calendario"><span class="ms" aria-hidden="true">event</span>Actualizar calendario</button><button class="btn" data-act="xlsx"><span class="ms" aria-hidden="true">download</span>Descargar Excel</button><button class="btn" data-act="export"><span class="ms" aria-hidden="true">content_copy</span>Copiar respaldo</button><button class="btn danger" data-act="desconectar"><span class="ms" aria-hidden="true">logout</span>Desconectar este teléfono</button></div></section></div></div>`;
  return h;
}

// ---------- diálogos ----------
const dlg = () => $("#dlg");
function openDlg(html, onSubmit, onExtra) {
  const d = dlg(); d.innerHTML = `<form class="dlg" method="dialog">${html}</form>`;
  const f = d.querySelector("form");
  f.querySelectorAll('button[value]:not([value="ok"])').forEach(b => { b.formNoValidate = true; });
  f.addEventListener("submit", e => { e.preventDefault(); const btn = e.submitter && e.submitter.value; if (btn === "cancel") { d.close(); return; } if (btn && btn !== "ok" && onExtra) { onExtra(btn, f); } else if (onSubmit) { if (onSubmit(f) === false) return; } d.close(); });
  d.showModal(); const first = f.querySelector("input,select"); if (first && (window.matchMedia("(min-width:600px)").matches || f.querySelector("fieldset.seg"))) first.focus();
}
function confirmDlg(title, text, okTxt, fn, danger) {
  openDlg(`<h3>${esc(title)}</h3><p class="hint">${esc(text)}</p><div class="actions"><button class="btn ghost" value="cancel">Cancelar</button><button class="btn ${danger ? "danger" : "primary"}" value="ok">${esc(okTxt)}</button></div>`, () => fn());
}
const fld = (lbl, name, val, type = "text", extra = "") => `<div class="fld"><label for="f_${name}">${lbl}</label><input id="f_${name}" name="${name}" type="${type}" value="${esc(val ?? "")}" ${type === "number" ? 'inputmode="decimal" step="0.01"' : ""} ${extra}></div>`;
const sel = (lbl, name, val, opts) => `<div class="fld"><label for="f_${name}">${lbl}</label><select id="f_${name}" name="${name}">${opts.map(([v, t]) => `<option value="${esc(v)}" ${String(v) === String(val) ? "selected" : ""}>${esc(t)}</option>`).join("")}</select></div>`;
const futureMonths = () => { const out = []; let k = S.startKey; for (let i = 0; i < 48; i++) { out.push([k, ENG.label(k)]); k = ENG.keyAdd(k, 1); } return out; };
const g = (f, n) => f.elements[n] ? f.elements[n].value : "";

function dlgItem(it, k) {
  const linked = it.debtId ? ENG.debtById(S, it.debtId) : null; const lf = it.fundId ? ENG.fundById(S, it.fundId) : null;
  const eff = linked ? `Al marcarlo ${it.debtSign === 1 ? "sube" : "baja"} el saldo de ${linked.name}.` : lf ? `Al marcarlo sube el ${lf.name.toLowerCase()}.` : "";
  openDlg(`<h3>${esc(it.name)}</h3><p class="hint">${esc(eff || (it.source === "income" ? "Ingreso del mes." : "Gasto del mes."))}</p>
    ${fld("Nombre", "name", it.name)}
    <div class="grid2">${fld("Monto previsto", "amount", it.amount, "number")}${fld("Monto real pagado", "paid", it.paid ? it.paidAmount : "", "number", 'placeholder="Igual al previsto"')}</div>
    ${fld("Se paga con", "payWith", it.payWith || "")}${fld("Nota", "note", it.note || "")}
    <div class="actions"><button class="btn danger" value="del">Eliminar</button><button class="btn ghost" value="cancel">Cancelar</button><button class="btn primary" value="ok">${it.paid ? "Guardar" : "Guardar"}</button></div>`,
    f => {
      const before = balSnap(); setTimeout(() => celebrate(before), 50);
      will(`Editaste ${it.name}`);
      if (it.paid) ENG.effect(S, it, -1);
      it.name = g(f, "name") || it.name; it.amount = ENG.r2(num(g(f, "amount"))); it.payWith = g(f, "payWith"); it.note = g(f, "note");
      const p = g(f, "paid").trim();
      if (p !== "") { it.paid = true; it.paidAmount = ENG.r2(num(p)); } else if (it.paid) it.paidAmount = it.amount;
      if (it.paid) ENG.effect(S, it, 1);
      changed(); render();
    },
    btn => { if (btn === "del") { will(`Eliminaste ${it.name}`); const m = S.months[k]; if (it.paid) ENG.effect(S, it, -1); m.items = m.items.filter(x => x !== it); changed(); render(); toast("Eliminado"); } });
}
function dlgAddItem(k) {
  const dopts = [["", "No"]].concat(S.debts.filter(d => !d.closed).map(d => [d.id, d.name])).concat(S.funds.map(f => ["fund:" + f.id, "Fondo: " + f.name]));
  openDlg(`<h3>Agregar al mes</h3><p class="hint">Un gasto o ingreso solo de ${ENG.label(k)}.</p>
    ${fld("Nombre", "name", "", "text", "required")}
    <div class="grid2">${fld("Monto", "amount", "", "number", "required")}${sel("Tipo", "type", "salary", [["salary", "Gasto del salario"], ["income", "Ingreso extra"], ["extra", "Pago con dinero extra"]])}</div>
    <div class="grid2">${sel("Categoría", "cat", "Otros", CATS.map(c => [c, c]))}${fld("Se paga con", "payWith", "Débito")}</div>
    ${sel("¿Baja una deuda o sube un fondo?", "link", "", dopts)}
    <div class="actions"><button class="btn ghost" value="cancel">Cancelar</button><button class="btn primary" value="ok">Agregar</button></div>`,
    f => {
      const amt = ENG.r2(num(g(f, "amount"))); if (!g(f, "name") || !amt) { toast("Escribe nombre y monto"); return false; }
      const type = g(f, "type"), link = g(f, "link"); will(`Agregaste ${g(f, "name")}`);
      const it = { id: ENG.uid(), kind: "manual", name: g(f, "name"), cat: type === "income" ? "Ingresos" : type === "extra" ? "Dinero extra" : g(f, "cat"), payWith: g(f, "payWith"), amount: amt, paid: false, paidAmount: null, source: type };
      if (link.startsWith("fund:")) it.fundId = link.slice(5); else if (link) it.debtId = link;
      S.months[k].items.push(it); changed(); render(); toast("Agregado");
    });
}
function payHistory(id) {
  const out = [];
  for (const k of monthKeys()) for (const it of S.months[k].items) if (it.debtId === id && it.paid && (it.debtSign ?? -1) === -1) out.push({ k, name: it.name, amt: it.paidAmount });
  for (const k of monthKeys()) for (const it of S.months[k].items) for (const e of (it.spent || [])) if (e.cardId === id) out.push({ k, name: `Compra con tarjeta: ${e.note || it.name}`, amt: -e.amount });
  return out;
}
function schedHTML(d, p, thisMonth) {
  if (d.closed) return "";
  const out = []; let paid = 0, ints = 0, chg = 0, end = null;
  const r0 = p.rows[0]; const b0 = r0.by[d.id] ?? d.balance;
  if (thisMonth > 0.005 || b0 > 0.5) out.push({ k: S.current, pay: thisMonth, int: 0, chg: 0, bal: b0, now: true });
  paid += thisMonth;
  let prev = b0;
  for (let i = 1; i < p.rows.length; i++) {
    const r = p.rows[i]; const bal = r.by[d.id] ?? 0; const pay = r.pay[d.id] || 0, it = r.ints[d.id] || 0, c = r.chg[d.id] || 0;
    if (prev <= 0.5 && pay < 0.01 && c < 0.01) { if (end) break; prev = bal; continue; }
    out.push({ k: r.k, pay, int: it, chg: c, bal }); paid += pay; ints += it; chg += c;
    if (bal <= 0.5 && !end) end = r.k;
    prev = bal;
    if (bal <= 0.5 && i + 1 < p.rows.length && !(p.rows[i + 1].chg[d.id] > 0)) break;
  }
  if (!out.length) return "";
  if (!end && (out[out.length - 1].bal <= 0.5)) end = out[out.length - 1].k;
  { let from = 0; for (let j = 0; j < out.length - 1; j++) if (out[j].bal <= 0.5) from = j + 1;
    const seg = out.slice(from); paid = seg.reduce((x, r) => x + r.pay, 0); ints = seg.reduce((x, r) => x + r.int, 0); chg = seg.reduce((x, r) => x + r.chg, 0); }
  const head = end ? `Terminas de pagarla en <b>${ENG.longLabel(end)}</b> · pagarás ${fmt(paid)} en total${ints > 0.5 ? `, de eso ${fmt(ints)} de intereses` : ""}` : `Con el plan actual sigue después de ${ENG.longLabel(out[out.length - 1].k)}`;
  return `<p class="dsec">Calendario de pagos <small>· según tu plan</small></p>
    <p class="schedsum">${head}${chg > 0.5 ? ` · incluye cargos nuevos por ${fmt(chg)}` : ""}${d.kind === "card" && S.debts.some(x => x.parent === d.id && x.balance > 0.005) ? " · sin contar las cuotas 0%" : ""}</p>
    <div class="schedwrap"><table class="sched"><thead><tr><th>Mes</th><th>Pagas</th><th>Queda</th></tr></thead><tbody>
    ${out.map(r => `<tr class="${r.now ? "now" : ""}${r.bal <= 0.5 ? " zero" : ""}"><td>${ENG.label(r.k)}${r.now ? " <em>este mes</em>" : ""}${r.chg > 0.005 ? `<em class="chg">+${fmt(r.chg)} de cargos</em>` : ""}</td><td class="num">${fmt(r.pay)}${r.int > 0.005 ? `<em>${fmt(r.int)} de interés</em>` : ""}</td><td class="num">${r.bal <= 0.5 ? "En cero" : fmt(r.bal)}</td></tr>`).join("")}
    </tbody></table></div>`;
}
function baseOf(d) {
  if (d.closed || d.balance <= 0.5 || d.kind === "card" || d.kind === "person") return null;
  const pay = d.portion != null ? d.portion : d.cuota; if (!pay) return null;
  let k = d.start > S.current ? d.start : S.current;
  const cm = S.months[S.current]; if (k === S.current && cm && cm.items.some(i => i.debtId === d.id && i.paid && i.source !== "income")) k = ENG.keyAdd(k, 1);
  let bal = d.balance, I = 0, n = 0; const r = (d.rate || 0) / 12;
  while (bal > 0.005 && n < 600) { const i = bal * r; I += i; bal = ENG.r2(bal + i - Math.min(pay, bal + i)); n++; if (bal > 0.005) k = ENG.keyAdd(k, 1); }
  return { end: k, int: ENG.r2(I), months: n };
}
function durTxt(mb) { const y = Math.floor(mb / 12), m = mb % 12; return [y ? `${y} ${y === 1 ? "año" : "años"}` : "", m ? `${m} ${m === 1 ? "mes" : "meses"}` : ""].filter(Boolean).join(" y "); }
function planVsBase(p) {
  let bInt = 0, bEnd = null, n = 0;
  for (const d of S.debts) { const b = baseOf(d); if (!b) continue; n++; bInt += b.int; if (!bEnd || b.end > bEnd) bEnd = b.end; }
  if (!n || !p.debtFree) return "";
  const save = Math.max(0, bInt - p.interest), mb = Math.max(0, monthsBetween(p.debtFree, bEnd));
  return `<section class="block"><h2>Tu plan vs. pagar solo las cuotas</h2><div class="cmp2"><div><span>Solo las cuotas</span><b class="num">${ENG.label(bEnd)}</b><em class="num">${fmt0(bInt)} de intereses</em></div><div class="on"><span>Con tu plan</span><b class="num">${ENG.label(p.debtFree)}</b><em class="num">${fmt0(p.interest)} de intereses</em></div></div><p class="saveline">${ms("savings")}<span>Ahorras <b class="num">${fmt0(save)}</b> de intereses y quedas libre <b>${durTxt(mb)} antes</b></span></p><p class="small muted">"Solo las cuotas" = pagar cada préstamo con su cuota normal, sin abonos extra, y las tarjetas a tiempo. Toca una deuda para ver su detalle.</p></section>`;
}
function dlgDetail(d) {
  const p = getProj(); const zero = p.milestones.find(x => x.t === d.name);
  const k = S.current, m = S.months[k];
  const thisMonth = m ? m.items.filter(i => i.debtId === d.id && i.source !== "income").reduce((a, i) => a + i.amount, 0) : 0;
  const inst = S.debts.filter(x => x.parent === d.id && x.balance > 0.005);
  const instT = inst.reduce((a, x) => a + x.balance, 0);
  const hist = payHistory(d.id); const paidT = hist.filter(h => h.amt > 0).reduce((a, h) => a + h.amt, 0);
  const intFut = p.interestBy[d.id] || 0;
  const dd = d.due ? `Día ${d.due}` : "—";
  const stat = (lbl, val, sub) => `<div><span>${lbl}</span><b class="num">${val}</b>${sub ? `<em>${sub}</em>` : ""}</div>`;
  const rows = [];
  const add = (l, v) => { if (v != null && v !== "" && v !== false) rows.push(`<div class="dr"><span>${l}</span><b>${v}</b></div>`); };
  add("Banco o acreedor", esc(d.bank || ""));
  add("Producto", esc(d.product || ""));
  add("Tipo", KIND[d.kind]);
  if (d.digits) add("Número", `•••• ${esc(d.digits)}`);
  if (d.ref) add(d.kind === "installment" || d.id === "cartera" ? "Referencia" : d.kind === "card" ? "Cuenta" : "Número de crédito", esc(d.ref.replace(/^Cuenta /, "")));
  if ((d.initial || 0) > d.balance + 0.5) add("Monto original", fmt(d.initial));
  add("Tasa de interés anual", d.rate ? `${(d.rate * 100).toFixed(2)}%` : "Sin interés");
  if (d.rate) add("Interés aproximado al mes", fmt(d.balance * d.rate / 12));
  if (d.kind === "card") { add("Pago mínimo", `${(d.minPct * 100).toFixed(1)}% del saldo${d.extra ? ` + $${d.extra} extra (tu plan)` : ""}`); if (d.cut) add("Fecha de corte", `Día ${d.cut}`); }
  if (d.cuota) add("Cuota mensual", fmt(d.cuota) + (d.portion != null ? ` · ${fmt(d.portion)} bajan el saldo` : ""));
  if (d.term) add("Plazo", `${d.term} ${d.kind === "installment" ? "cuotas" : "meses"}`);
  if (d.ends) add("Termina según contrato", esc(d.ends));
  add("Fecha de pago", dd);
  if (d.kind !== "card") add("Se paga a", esc(d.kind === "installment" ? payLabel(d.payWith) + " (dentro del pago)" : payLabel(d.payWith)));
  if (d.auto) add("Forma de pago", "Descuento automático de planilla");
  if (d.cap != null) add("Tope de abono extra", fmt(d.cap) + " al mes");
  if (d.start > S.current) add("Empieza", ENG.longLabel(d.start));
  if (d.phone) add("Teléfono", `<a href="tel:${esc(d.phone.replace(/\D/g, ""))}">${esc(d.phone)}</a>`);
  if (d.extraInfo) add("Detalle", esc(d.extraInfo));
  const ue = d.kind === "card" ? ultimoEstado(d) : null;
  if (ue) {
    add("Último estado de cuenta", `Corte ${fechaCorta(ue.fecha_corte)} · pagar antes del ${fechaCorta(ue.fecha_pago)}`);
    if (num(ue.pago_minimo) > 0) add("Mínimo según el banco", fmt(num(ue.pago_minimo)));
    if (num(ue.pago_contado) > 0) add("Pago de contado (sin intereses)", fmt(num(ue.pago_contado)));
    if (ue.archivo && /^https:\/\/drive\.google\.com\//.test(ue.archivo)) add("PDF", `<a href="${esc(ue.archivo)}" target="_blank" rel="noopener">Abrir en Drive</a>`);
  }
  if (d.note) add("Nota", esc(d.note));
  const used = d.kind === "card" && d.limit ? d.balance + instT : 0; const usePct = d.limit ? Math.min(100, used / d.limit * 100) : 0;
  const dlgEl = dlg();
  dlgEl.innerHTML = `<div class="dlg detail">
    <div class="dhead ${bankOf(d.payWith) ? "b-" + bankOf(d.payWith) : ""}">
      <div><span class="dk">${esc(d.bank || KIND[d.kind])}${d.digits ? ` · •••• ${esc(d.digits)}` : ""}</span><h3>${esc(d.name)}</h3></div>
      <div class="dbal"><span>Saldo</span><b class="num">${money(d.balance)}</b></div>
      ${d.kind === "card" && d.limit ? `<div class="dlim"><div class="ubar"><span style="width:${usePct}%"></span></div><span>Usas ${fmt0(used)} de ${fmt0(d.limit)} (${Math.round(usePct)}%) · disponible ~${fmt0(Math.max(0, d.limit - used))}</span></div>` : ""}
    </div>
    <div class="sumgrid" style="margin-top:14px">
      ${stat("Tasa anual", d.rate ? `${(d.rate * 100).toFixed(1)}%` : "0%")}
      ${stat("Este mes pagas", fmt(thisMonth), d.due ? `vence el ${d.due}` : "")}
      ${stat("En cero", d.closed || d.balance <= 0.5 ? "Ya" : zero ? ENG.label(zero.k) : d.kind === "installment" ? `${Math.round(d.balance / (d.cuota || 1))} cuotas` : "—", zero ? `en ${monthsBetween(S.current, zero.k)} meses` : "")}
      ${stat("Intereses por pagar", d.rate ? fmt0(intFut) : "$0", d.rate ? "con tu plan" : "")}
    </div>
    ${(() => { const b = baseOf(d); if (!b || !zero) return ""; const sv = Math.max(0, b.int - intFut), mb = Math.max(0, monthsBetween(zero.k, b.end));
      return `<p class="dsec">Tu plan vs. pagar solo la cuota</p><div class="cmp2"><div><span>Solo la cuota</span><b class="num">${ENG.label(b.end)}</b><em class="num">${fmt0(b.int)} de intereses</em></div><div class="on"><span>Con tu plan</span><b class="num">${ENG.label(zero.k)}</b><em class="num">${fmt0(intFut)} de intereses</em></div></div>${sv > 0.5 || mb > 0 ? `<p class="saveline">${ms("savings")}<span>Ahorras <b class="num">${fmt0(sv)}</b>${mb > 0 ? ` y terminas <b>${durTxt(mb)} antes</b>` : ""}</span></p>` : `<p class="small muted">Esta deuda se paga solo con su cuota: tu plan no le hace abonos extra.</p>`}`; })()}
    ${inst.length ? `<p class="dsec">Cuotas 0% dentro de esta tarjeta</p><div class="list">${inst.map(x => `<div class="dr"><span>${esc(x.name)}${x.ref ? ` · op. ${esc(x.ref)}` : ""}</span><b class="num">${fmt(x.balance)} · ${Math.round(x.balance / x.cuota)} × ${fmt(x.cuota)}</b></div>`).join("")}</div>` : ""}
    ${(d.facts || []).length ? `<p class="dsec">Según tu estado de cuenta</p><div class="list">${d.facts.map(([l, v]) => `<div class="dr"><span>${esc(l)}</span><b>${esc(v)}</b></div>`).join("")}</div>` : ""}
    ${schedHTML(d, p, thisMonth)}
    <p class="dsec">Datos</p><div class="list">${rows.join("")}</div>
    <p class="dsec">Pagos registrados ${hist.length ? `<small>· ${fmt(paidT)} en total</small>` : ""}</p>
    <div class="list">${hist.length ? hist.slice().reverse().slice(0, 12).map(h => `<div class="dr"><span>${ENG.label(h.k)} · ${esc(h.name)}</span><b class="num" style="color:${h.amt < 0 ? "var(--debt)" : "inherit"}">${h.amt < 0 ? "+" + fmt(-h.amt) : fmt(h.amt)}</b></div>`).join("") : '<p class="empty">Aún no has marcado pagos a esta deuda.</p>'}</div>
    <div class="actions"><button class="btn ghost" id="dtx"><span class="ms" aria-hidden="true">close</span>Cerrar</button><button class="btn primary" id="dted"><span class="ms" aria-hidden="true">edit</span>Editar datos</button></div></div>`;
  $("#dtx").onclick = () => dlgEl.close(); $("#dted").onclick = () => { dlgEl.close(); dlgDebt(d); };
  dlgEl.showModal();
}
function dlgDebt(d) {
  const isNew = !d; d = d || { id: ENG.uid(), name: "", kind: "card", balance: 0, initial: 0, rate: 0, cuota: 0, portion: null, minPct: 0.038, extra: 25, extraFrom: S.current, payWith: "", due: null, start: S.current, auto: false, cap: null, parent: null, liquidate: false, closed: false, note: "" };
  const cards = [["", "Ninguna"]].concat(S.debts.filter(x => x.kind === "card").map(x => [x.id, x.name]));
  openDlg(`<h3>${isNew ? "Nueva deuda" : esc(d.name)}</h3><p class="hint">${isNew ? "Se agrega al final de tu orden de ataque." : "Ajusta el saldo cuando veas tu banca en línea."}</p>
    ${fld("Nombre", "name", d.name, "text", "required")}
    <div class="grid2">${sel("Tipo", "kind", d.kind, Object.entries(KIND))}${fld("Saldo actual", "balance", d.balance, "number")}</div>
    <div class="grid2">${fld("Interés anual (%)", "rate", ENG.r2(d.rate * 100), "number")}${fld("Cuota mensual", "cuota", d.cuota || "", "number", 'placeholder="Préstamos y cuotas"')}</div>
    <div class="grid2">${fld("Pago mínimo (%)", "minPct", ENG.r2(d.minPct * 100), "number", 'placeholder="Tarjetas"')}${fld("Extra fijo al mínimo", "extra", d.extra || "", "number", 'placeholder="Tarjetas"')}</div>
    <div class="grid2">${fld("Parte de la cuota que baja el saldo", "portion", d.portion ?? "", "number", 'placeholder="Si incluye seguros"')}${fld("Tope de abono extra al mes", "cap", d.cap ?? "", "number", 'placeholder="Sin tope"')}</div>
    <div class="grid2">${fld("Se paga con", "payWith", d.payWith)}${fld("Día de vencimiento", "due", d.due ?? "", "number", 'min="1" max="31"')}</div>
    ${fld("Últimos 4 dígitos (para leer fotos)", "digits", d.digits || "", "text", 'inputmode="numeric" maxlength="4"')}
    <div class="grid2">${sel("Empieza en", "start", d.start, futureMonths())}${sel("Tarjeta asociada (cuota 0%)", "parent", d.parent || "", cards)}</div>
    <div class="fld"><label><input type="checkbox" name="auto" ${d.auto ? "checked" : ""}> Se descuenta solo (planilla)</label></div>
    <div class="fld"><label><input type="checkbox" name="liquidate" ${d.liquidate ? "checked" : ""}> Liquidar las cuotas cuando la tarjeta quede en cero</label></div>
    <details class="more" ${isNew ? "" : "open"}><summary>Datos del producto</summary>
      <div class="grid2">${fld("Banco o acreedor", "bank", d.bank || "")}${fld("Producto", "product", d.product || "")}</div>
      <div class="grid2">${fld("Límite de crédito", "limit", d.limit ?? "", "number", 'placeholder="Tarjetas"')}${fld("Día de corte", "cut", d.cut ?? "", "number", 'min="1" max="31"')}</div>
      <div class="grid2">${fld("Número de crédito u operación", "ref", d.ref || "")}${fld("Plazo (meses o cuotas)", "term", d.term ?? "", "number")}</div>
      <div class="grid2">${fld("Termina según contrato", "ends", d.ends || "", "text", 'placeholder="10/09/2034"')}${fld("Teléfono", "phone", d.phone || "", "tel")}</div>
      ${fld("Detalle", "extraInfo", d.extraInfo || "")}
    </details>
    ${fld("Nota", "note", d.note || "")}
    <div class="actions">${isNew ? "" : `<button class="btn danger" value="del">Eliminar</button><button class="btn" value="close">${d.closed ? "Reabrir" : "Marcar como pagada"}</button>`}<button class="btn ghost" value="cancel">Cancelar</button><button class="btn primary" value="ok">Guardar</button></div>`,
    f => {
      if (!g(f, "name")) { toast("Escribe un nombre"); return false; }
      const bal = ENG.r2(num(g(f, "balance"))); will(isNew ? `Agregaste la deuda ${g(f, "name")}` : `Editaste ${d.name}`);
      Object.assign(d, { name: g(f, "name"), kind: g(f, "kind"), balance: bal, rate: num(g(f, "rate")) / 100, cuota: ENG.r2(num(g(f, "cuota"))), minPct: (num(g(f, "minPct")) || 3.8) / 100, extra: ENG.r2(num(g(f, "extra"))), portion: g(f, "portion").trim() === "" ? null : ENG.r2(num(g(f, "portion"))), cap: g(f, "cap").trim() === "" ? null : ENG.r2(num(g(f, "cap"))), payWith: g(f, "payWith"), due: num(g(f, "due")) || null, start: g(f, "start"), parent: g(f, "parent") || null, auto: f.elements.auto.checked, liquidate: f.elements.liquidate.checked, note: g(f, "note"), digits: g(f, "digits").trim(), bank: g(f, "bank").trim(), product: g(f, "product").trim(), limit: g(f, "limit").trim() === "" ? null : ENG.r2(num(g(f, "limit"))), cut: num(g(f, "cut")) || null, ref: g(f, "ref").trim(), term: num(g(f, "term")) || null, ends: g(f, "ends").trim(), phone: g(f, "phone").trim(), extraInfo: g(f, "extraInfo").trim() });
      if (isNew) { d.initial = bal; S.debts.push(d); if (d.kind !== "installment") S.order.push(d.id); }
      if (!d.initial || d.initial < bal) d.initial = bal;
      changed(); render(); toast(isNew ? "Deuda agregada" : "Deuda actualizada");
    },
    btn => {
      if (btn === "close" || btn === "del") will(btn === "close" ? `${d.closed ? "Reabriste" : "Marcaste como pagada"} ${d.name}` : `Eliminaste la deuda ${d.name}`);
      if (btn === "close") { d.closed = !d.closed; if (d.closed) d.balance = 0; changed(); render(); toast(d.closed ? "Deuda marcada como pagada" : "Deuda reabierta"); }
      if (btn === "del") { S.debts = S.debts.filter(x => x !== d); S.order = S.order.filter(x => x !== d.id); changed(); render(); toast("Deuda eliminada"); }
    });
}
function dlgFund(f) {
  const isNew = !f; f = f || { id: ENG.uid(), name: "", balance: 0, target: null, schedule: [] };
  const inW = S.order.includes("fund:" + f.id);
  openDlg(`<h3>${isNew ? "Nuevo fondo" : esc(f.name)}</h3><p class="hint">El aporte mensual aplica desde ${ENG.label(S.current)}.</p>
    <div class="grid2">${fld("Nombre", "name", f.name, "text", "required")}${fld("Ícono (Material Symbols o emoji)", "icon", iconOf(f), "text", 'maxlength="40" placeholder="savings"')}</div>
    <div class="grid2">${fld("Saldo actual", "balance", f.balance, "number")}${fld("Meta", "target", f.target ?? "", "number", 'placeholder="Sin meta"')}</div>
    ${fld("Aporte mensual fijo", "monthly", ENG.sched(f.schedule, S.current) || "", "number", 'placeholder="0 si solo recibe lo que sobra"')}
    <div class="fld"><label><input type="checkbox" name="inW" ${inW ? "checked" : ""}> Recibe lo que sobra del mes, según el orden de ataque</label></div>
    <div class="actions">${isNew ? "" : '<button class="btn danger" value="del">Eliminar</button>'}<button class="btn ghost" value="cancel">Cancelar</button><button class="btn primary" value="ok">Guardar</button></div>`,
    fm => {
      if (!g(fm, "name")) { toast("Escribe un nombre"); return false; }
      will(isNew ? `Creaste el fondo ${g(fm, "name")}` : `Editaste ${f.name}`); f.name = g(fm, "name"); f.icon = g(fm, "icon").trim(); f.balance = ENG.r2(num(g(fm, "balance"))); f.target = g(fm, "target").trim() === "" ? null : ENG.r2(num(g(fm, "target")));
      const mo = ENG.r2(num(g(fm, "monthly"))); if (mo !== ENG.sched(f.schedule, S.current)) { f.schedule = f.schedule.filter(e => e.from < S.current).concat([{ from: S.current, amount: mo }]); }
      if (isNew) S.funds.push(f);
      const want = fm.elements.inW.checked; if (want && !S.order.includes("fund:" + f.id)) { if (!f.target) { toast("Ponle una meta para que reciba lo que sobra"); } else S.order.push("fund:" + f.id); } if (!want) S.order = S.order.filter(x => x !== "fund:" + f.id);
      changed(); render(); toast("Fondo guardado");
    },
    btn => { if (btn === "del") setTimeout(() => confirmDlg(`¿Eliminar "${f.name}"?`, "El fondo se quita del plan y deja de recibir aportes. Si fue un error, puedes deshacerlo.", "Sí, eliminar", () => { will(`Eliminaste el fondo ${f.name}`); S.funds = S.funds.filter(x => x !== f); S.order = S.order.filter(x => x !== "fund:" + f.id); changed(); render(); toast("Fondo eliminado", true); }, true), 30); });
}
function dlgWithdraw(f) {
  openDlg(`<h3>Usar dinero de ${esc(f.name.toLowerCase())}</h3><p class="hint">Tienes ${fmt(f.balance)} en este fondo.</p>
    ${fld("Monto", "amount", "", "number", "required")}${fld("¿Para qué?", "note", "")}
    <div class="actions"><button class="btn ghost" value="cancel">Cancelar</button><button class="btn primary" value="ok">Usar</button></div>`,
    fm => { const a = ENG.r2(num(g(fm, "amount"))); if (!a) return false; will(`Usaste ${fmt(a)} de ${f.name}`); f.balance = ENG.r2(Math.max(0, f.balance - a)); (f.history = f.history || []).push({ at: new Date().toISOString(), amount: -a, note: g(fm, "note") }); changed(); render(); toast(`Usaste ${fmt(a)}`); });
}
function dlgRec(r) {
  const isNew = !r; r = r || { id: ENG.uid(), name: "", cat: "Hogar", payWith: "Débito", schedule: [] };
  openDlg(`<h3>${isNew ? "Nuevo gasto fijo" : esc(r.name)}</h3><p class="hint">El monto aplica desde ${ENG.label(S.current)}. Los meses anteriores no cambian.</p>
    ${fld("Nombre", "name", r.name, "text", "required")}
    <div class="grid2">${fld("Monto mensual", "amount", ENG.sched(r.schedule, S.current), "number")}${sel("Categoría", "cat", r.cat, CATS.map(c => [c, c]))}</div>
    ${fld("Se paga con", "payWith", r.payWith)}
    <div class="actions">${isNew ? "" : '<button class="btn danger" value="del">Eliminar</button>'}<button class="btn ghost" value="cancel">Cancelar</button><button class="btn primary" value="ok">Guardar</button></div>`,
    f => {
      if (!g(f, "name")) { toast("Escribe un nombre"); return false; }
      will(isNew ? `Agregaste el gasto fijo ${g(f, "name")}` : `Editaste ${r.name}`); r.name = g(f, "name"); r.cat = g(f, "cat"); r.payWith = g(f, "payWith");
      const a = ENG.r2(num(g(f, "amount"))); if (a !== ENG.sched(r.schedule, S.current)) r.schedule = r.schedule.filter(e => e.from < S.current).concat([{ from: S.current, amount: a }]);
      if (isNew) S.recurring.push(r); changed(); render(); toast("Gasto fijo guardado. Toca Recalcular en el mes para aplicarlo ya.");
    },
    btn => { if (btn === "del") { will(`Eliminaste el gasto fijo ${r.name}`); S.recurring = S.recurring.filter(x => x !== r); changed(); render(); toast("Gasto fijo eliminado"); } });
}
function dlgSalary() {
  openDlg(`<h3>Salario líquido</h3><p class="hint">Aplica desde ${ENG.label(S.current)}. Si este mes ya está armado, toca Recalcular.</p>
    ${fld("Monto", "amount", ENG.sched(S.income, S.current), "number")}
    <div class="actions"><button class="btn ghost" value="cancel">Cancelar</button><button class="btn primary" value="ok">Guardar</button></div>`,
    f => { will("Cambiaste el salario"); const a = ENG.r2(num(g(f, "amount"))); S.income = S.income.filter(e => e.from < S.current).concat([{ from: S.current, amount: a }]); changed(); render(); toast("Salario actualizado"); });
}

function dlgFecha(f) {
  const isNew = !f; f = f || { id: ENG.uid(), name: "", m: 1, d: 1, amount: 10 };
  const MS = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
  openDlg(`<h3>${isNew ? "Nueva fecha" : esc(f.name)}</h3><p class="hint">Aparece como recordatorio en el mes que toque.</p>
    ${fld("Persona u ocasión", "name", f.name, "text", "required")}
    <div class="grid2">${fld("Día", "d", f.d, "number", 'min="1" max="31"')}${sel("Mes", "m", f.m, MS.map((x, i) => [i + 1, x]))}</div>
    ${fld("Monto sugerido", "amount", f.amount || "", "number")}
    <div class="actions">${isNew ? "" : '<button class="btn danger" value="del">Eliminar</button>'}<button class="btn ghost" value="cancel">Cancelar</button><button class="btn primary" value="ok">Guardar</button></div>`,
    fm => { if (!g(fm, "name")) { toast("Escribe un nombre"); return false; } will(isNew ? `Agregaste la fecha ${g(fm, "name")}` : `Editaste la fecha ${f.name}`); f.name = g(fm, "name"); f.d = Math.min(31, Math.max(1, num(g(fm, "d")) || 1)); f.m = +g(fm, "m"); f.amount = ENG.r2(num(g(fm, "amount"))); if (isNew) S.fechas.push(f); changed(S.current); render(); toast("Fecha guardada"); },
    btn => { if (btn === "del") { will(`Eliminaste la fecha ${f.name}`); S.fechas = S.fechas.filter(x => x !== f); changed(S.current); render(); toast("Fecha eliminada"); } });
}
// ---------- Excel ----------
function loadXLSX() { return new Promise((res, rej) => { if (window.XLSX) return res(window.XLSX); const s = document.createElement("script"); s.src = "js/vendor/xlsx.full.min.js"; /* SheetJS 0.20.3, dentro del repo (sin CDN) */ s.onload = () => res(window.XLSX); s.onerror = rej; document.head.appendChild(s); }); }
async function exportXlsx() {
  try {
    toast("Preparando tu Excel…"); const X = await loadXLSX(); const wb = X.utils.book_new(); const ks = monthKeys();
    X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([["Salario de", "Ingresos", "Gastos", "Pagado", "Pendiente", "Libre"]].concat(ks.map(k => { const t = ENG.totals(S.months[k]); return [ENG.label(k), t.inc, t.total, t.paid, t.pending, t.free]; }))), "Resumen");
    X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([["Deuda", "Tipo", "Saldo", "Interés anual", "Cuota", "Se paga con", "Estado"]].concat(S.debts.map(d => [d.name, KIND[d.kind], d.balance, d.rate, d.cuota || "", d.payWith, d.closed ? "Cerrada" : d.balance <= 0.5 ? "En cero" : "Activa"]))), "Deudas");
    X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([["Fondo", "Saldo", "Meta"]].concat(S.funds.map(f => [f.name, f.balance, f.target || ""]))), "Fondos");
    const p = getProj(); X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([["Salario de", "Deuda total", "Abonos extra", "Fondo emergencia"]].concat(p.rows.slice(1).map(r => [ENG.label(r.k), r.debt, r.extra, r.funds.emerg || 0]))), "Proyección");
    for (const k of ks) X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([["Descripción", "Categoría", "Se paga con", "Previsto", "Estado", "Real"]].concat(S.months[k].items.map(i => [i.name, i.cat, i.payWith || "", i.amount, i.paid ? (i.source === "income" ? "RECIBIDO" : "PAGADO") : "PENDIENTE", i.paid ? i.paidAmount : ""]))), ENG.label(k));
    const buf = X.write(wb, { type: "array", bookType: "xlsx" });
    descargar("Mi-plan-" + new Date().toISOString().slice(0, 10) + ".xlsx", new Blob([buf]));
    toast("Excel listo");
  } catch (e) { if (e && e.code === "declined") return; toast(e && e.code === "unavailable" ? "La descarga no está disponible aquí" : "No se pudo crear el Excel"); }
}
// ---------- eventos ----------
document.addEventListener("click", e => {
  const b = e.target.closest("[data-act], nav.tabs button"); if (!b || !S && !b.dataset.view) return;
  if (b.dataset.view) { view = b.dataset.view; render(); window.scrollTo({ top: 0 }); return; }
  const a = b.dataset.act, id = b.dataset.id, k = viewMonth, m = S.months[k];
  const findItem = () => m.items.find(x => x.id === id);
  switch (a) {
    case "toggle": { const it = findItem(); if (it) togglePaid(it); break; }
    case "item": { const it = findItem(); if (it) dlgItem(it, k); break; }
    case "prev": { const ks = monthKeys(), last = ks.at(-1); viewMonth = k > last ? ENG.keyAdd(k, -1) : ks[Math.max(0, ks.indexOf(k) - 1)]; render(); window.scrollTo({ top: 0 }); break; }
    case "next": { const ks = monthKeys(), last = ks.at(-1); viewMonth = k >= last ? ENG.keyAdd(k, 1) : ks[ks.indexOf(k) + 1]; render(); window.scrollTo({ top: 0 }); break; }
    case "go-current": viewMonth = S.current; render(); window.scrollTo({ top: 0 }); break;
    case "ro": toast("Es una vista previa: podrás marcar y anotar cuando inicies ese mes"); break;
    case "add-item": dlgAddItem(k); break;
    case "recalc": recalc(k); break;
    case "start-next": startNext(); break;
    case "debt": dlgDetail(ENG.debtById(S, id)); break;
    case "add-debt": dlgDebt(null); break;
    case "up": case "down": { const i = +b.dataset.i, j = a === "up" ? i - 1 : i + 1; if (j < 0 || j >= S.order.length) break; will("Cambiaste el orden de ataque"); [S.order[i], S.order[j]] = [S.order[j], S.order[i]]; changed(); render(); break; }
    case "fund": dlgFund(ENG.fundById(S, id)); break;
    case "add-fund": dlgFund(null); break;
    case "withdraw": dlgWithdraw(ENG.fundById(S, id)); break;
    case "rec": dlgRec(S.recurring.find(x => x.id === id)); break;
    case "add-rec": dlgRec(null); break;
    case "salary": dlgSalary(); break;
    case "incx": { const x = (S.incomeExtra || []).find(z => z.id === id); if (!x) break; openDlg(`<h3>${esc(x.name)}</h3><p class="hint">Aplica desde ${ENG.label(S.current)}. Si este mes ya está armado, toca Recalcular.</p>${fld("Monto", "amount", ENG.sched(x.schedule, S.current), "number")}<div class="actions"><button class="btn ghost" value="cancel">Cancelar</button><button class="btn primary" value="ok">Guardar</button></div>`, f => { will("Cambiaste " + x.name); const am = ENG.r2(num(g(f, "amount"))); x.schedule = x.schedule.filter(e => e.from < S.current).concat([{ from: S.current, amount: am }]); changed(); render(); toast("Ingreso actualizado", true); }); break; }
    case "theme": cycleTheme(); break;
    case "discreet": toggleDiscreet(); break;
    case "more": { const x = MORE[b.dataset.key]; if (!x) break; openDlg(`<h3>${esc(x.title)}</h3>${x.sub ? `<p class="hint">${esc(x.sub)}</p>` : ""}<div class="morelist">${x.html.replace(/<button(?![^>]*type=)/g, '<button type="button"')}</div><div class="actions"><button class="btn primary" value="cancel">Cerrar</button></div>`); const f = dlg().querySelector("form"); if (f) f.addEventListener("click", ev => { if (ev.target.closest('[data-act="toggle"]')) setTimeout(() => { if (dlg().open) dlg().close(); }, 0); }); break; }
    case "spend": if (view !== "mes" || !S.months[viewMonth]) { view = "mes"; viewMonth = S.current; render(); } dlgSpend(viewMonth); break;
    case "move-any": dlgMove(k); break;
    case "go-pay": { const el = document.querySelector(".cb .pg"); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); else toast("No te queda ningún pago este mes"); break; }
    case "go-deudas": view = "deudas"; render(); window.scrollTo({ top: 0 }); break;
    case "day": { const dt = new Date(b.dataset.day); const ttl = `${dt.getDate()} de ${MONTHS_LONG[dt.getMonth()]}`; const parts = [b.dataset.tip, b.dataset.bday ? "Cumpleaños: " + (S.fechas || []).filter(f => f.m === dt.getMonth() + 1 && f.d === dt.getDate()).map(f => f.name).join(", ") : "", dt.getDate() === 20 ? "Llega tu salario" : ""].filter(Boolean); toast(parts.length ? `${ttl}: ${parts.join(" · ")}` : `${ttl}: nada que pagar`); break; }
    case "pass-next": if (m.closed) startNext(); else dlgClose(k, true); break;
    case "intro-x": S.ui = Object.assign(S.ui || {}, { introOff: true }); changed(); render(); break;
    case "order-mode": orderMode = !orderMode; render(); break;
    case "pay-group": { const gk = b.dataset.key; const items = m.items.filter(x => x.source === "salary" && !x.envelope && !x.paid && x.amount > 0 && (gk === "__auto" ? x.autoPaid : !x.autoPaid && (x.payWith || "Otros") === gk)); if (!items.length) break; const before = balSnap(); will(`Pagaste todo a ${gk === "__auto" ? "planilla" : payLabel(gk)}`); for (const it of items) { it.paid = true; it.paidAmount = it.amount; ENG.effect(S, it, 1); } changed(); render(); toast(`${items.length} pagos marcados · ${fmt(items.reduce((s, x) => s + x.amount, 0))}`, true); celebrate(before); break; }
    case "env": { const it = findItem(); if (it) dlgEnv(it, k); break; }
    case "pc": dlgClasificar(id); break;
    case "close-month": dlgClose(k); break;
    case "reopen": will(`Reabriste ${ENG.label(k)}`); delete m.closed; changed(k); render(); toast("Mes reabierto", true); break;

    case "undo": undo(); break;
    case "fecha": dlgFecha((S.fechas || []).find(x => x.id === id)); break;
    case "add-fecha": dlgFecha(null); break;

    case "xlsx": exportXlsx(); break;
    case "export": { const txt = JSON.stringify(S); (navigator.clipboard ? navigator.clipboard.writeText(txt) : Promise.reject()).then(() => toast("Respaldo copiado")).catch(() => toast("No se pudo copiar")); break; }
    case "sync-now": Datos.sincronizar(true); break;
    case "candado-activar": dlgActivarCandado(); break;
    case "mac-revisar": toast("Revisando tu Mac…"); Datos.revisarMac().then(m => { render(); toast(m.enLinea ? "Tu Mac está lista" : "Tu Mac sigue fuera de línea"); }); break;
    case "candado-bloquear": Candado.listo().then(() => location.reload()); break;
    case "candado-desactivar": confirmDlg("Desactivar el bloqueo", "La app ya no pedirá huella ni código, y tus datos en este teléfono quedarán sin cifrar.", "Desactivar", async () => { await Candado.desactivar(); render(); toast("Bloqueo desactivado"); }, true); break;
    case "instalar": if (promptInstalar) { promptInstalar.prompt(); promptInstalar.userChoice.finally(() => { promptInstalar = null; render(); }); } break;
    case "calendario": toast("Actualizando tu calendario…"); Datos.accion("calendario").then(r => toast(r.ok ? `Listo: ${r.eventos} ${r.eventos === 1 ? "evento" : "eventos"} en "Mi plan · pagos"` : (r.error || "No se pudo actualizar"))).catch(() => toast("Sin señal: inténtalo después")); break;
    case "desconectar": confirmDlg("Desconectar este teléfono", "Se borra de este teléfono la copia de tu plan y la clave. Tus datos siguen seguros en tu Google Sheet.", "Desconectar", () => { Datos.desconectar(); location.reload(); }, true); break;
  }
});
// ---------- modo de color ----------
const THEMES = ["system", "light", "dark"];
const THEME_TXT = { system: "Automático", light: "Claro", dark: "Oscuro" };
const THEME_ICON = { system: ms("contrast"), light: ms("light_mode"), dark: ms("dark_mode") };
function getTheme() { try { const t = localStorage.getItem("miplan.theme"); return THEMES.includes(t) ? t : "system"; } catch (_) { return "system"; } }
function applyTheme(t) {
  if (t === "system") document.documentElement.removeAttribute("data-theme"); else document.documentElement.setAttribute("data-theme", t);
  document.querySelectorAll(".themebtn").forEach(b => { b.innerHTML = THEME_ICON[t] + `<span>${THEME_TXT[t]}</span>`; b.setAttribute("aria-label", `Modo de color: ${THEME_TXT[t]}. Toca para cambiar`); });
}
function cycleTheme() { const t = THEMES[(THEMES.indexOf(getTheme()) + 1) % 3]; try { localStorage.setItem("miplan.theme", t); } catch (_) {} applyTheme(t); toast(t === "system" ? "Modo automático: sigue el de tu dispositivo" : `Modo ${THEME_TXT[t].toLowerCase()}`); }
applyTheme(getTheme());
function applyDiscreet(on) { document.documentElement.classList.toggle("discreet", on); document.querySelectorAll(".eyebtn").forEach(b => { const ic = b.querySelector(".ms"); if (ic) ic.textContent = on ? "visibility_off" : "visibility"; b.setAttribute("aria-pressed", on ? "true" : "false"); b.setAttribute("aria-label", on ? "Modo discreto activo: mostrar montos" : "Modo discreto: ocultar montos"); }); }
function toggleDiscreet() { const on = !document.documentElement.classList.contains("discreet"); try { localStorage.setItem("miplan.discreet", on ? "1" : "0"); } catch (_) {} applyDiscreet(on); toast(on ? "Modo discreto: montos ocultos" : "Montos visibles"); }
applyDiscreet(document.documentElement.classList.contains("discreet"));
let wideNow = null; window.addEventListener("resize", () => { const w = window.matchMedia("(min-width:1024px)").matches; if (wideNow !== null && w !== wideNow && S) render(); wideNow = w; });
wideNow = window.matchMedia("(min-width:1024px)").matches;

boot();
