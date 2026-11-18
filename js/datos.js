/*
 * Mi plan — datos: copia en el teléfono + sincronización con el Google Sheet.
 *
 * - La conexión (dirección del Apps Script y clave) se guarda SOLO en este
 *   teléfono. Se pega una vez con un "código de conexión" (miplan1:…).
 * - Cada cambio se guarda al instante en el teléfono y, unos segundos
 *   después, en el Sheet. Sin señal, queda pendiente y se sube al volver.
 * - Si otro dispositivo guardó antes, no se pisa nada: se le pregunta a Rudy.
 */
(function (root) {
  const K_CONEXION = "miplan.conexion", K_DATOS = "miplan.datos";
  const K_BANDEJA = "miplan.porclasificar", K_CLASIFICADOS = "miplan.clasificados";
  const ESPERA = 1500, TIEMPO_MAX = 30000;

  let cb = { alEstado() {}, alRemoto() {}, alConflicto() {}, alBandeja() {} };
  let timer = null, subiendo = false, otraVez = false, ultimoError = "";

  const leerLS = k => { try { return JSON.parse(localStorage.getItem(k) || "null"); } catch (_) { return null; } };
  const escribirLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (_) { return false; } };

  // ---------- conexión ----------
  function leerCodigo(texto) {
    const t = String(texto || "").trim();
    const m = t.match(/^miplan1:([A-Za-z0-9_-]+)$/);
    if (!m) return null;
    try {
      const b64 = m[1].replace(/-/g, "+").replace(/_/g, "/");
      const json = decodeURIComponent(escape(atob(b64 + "===".slice((b64.length + 3) % 4))));
      const o = JSON.parse(json);
      if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(o.u) || !o.k || o.k.length < 24) return null;
      return { url: o.u, clave: o.k };
    } catch (_) { return null; }
  }
  const conexion = () => leerLS(K_CONEXION);
  const conectado = () => !!(conexion() && conexion().url && conexion().clave);

  async function conectar(texto) {
    const c = leerCodigo(texto);
    if (!c) throw new Error("Ese código no se ve bien. Cópialo completo desde Bitwarden (empieza con miplan1:).");
    const r = await llamar("leer", {}, c);
    if (!r.ok) throw new Error(r.error || "No se pudo conectar");
    escribirLS(K_CONEXION, c);
    escribirLS(K_DATOS, { plan: r.plan, version: r.version, pendiente: false, sincronizado: Date.now() });
    guardarBandeja(r.porClasificar);
    return r.plan;
  }

  function desconectar() {
    try { [K_CONEXION, K_DATOS, K_BANDEJA, K_CLASIFICADOS].forEach(k => localStorage.removeItem(k)); } catch (_) {}
  }

  // ---------- llamadas al Apps Script ----------
  async function llamar(accion, extra, con) {
    const c = con || conexion();
    if (!c) throw new Error("Sin conexión configurada");
    const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), TIEMPO_MAX);
    try {
      // text/plain evita el permiso previo (CORS) que Apps Script no contesta
      const res = await fetch(c.url, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(Object.assign({ accion, clave: c.clave }, extra)), signal: ctl.signal, redirect: "follow", cache: "no-store" });
      const txt = await res.text();
      try { return JSON.parse(txt); } catch (_) { throw new Error("El Sheet no respondió bien (" + res.status + ")"); }
    } finally { clearTimeout(t); }
  }

  // ---------- copia local ----------
  const local = () => leerLS(K_DATOS);
  function guardarLocal(plan, cambios) {
    const d = Object.assign(local() || { version: 0 }, { plan }, cambios || {});
    if (!escribirLS(K_DATOS, d)) cb.alEstado("err", "El teléfono no tiene espacio para guardar");
    return d;
  }

  // ---------- cargos por clasificar (alertas del banco) ----------
  const bandeja = () => leerLS(K_BANDEJA) || [];
  const pendientesClasificar = () => leerLS(K_CLASIFICADOS) || [];
  function guardarBandeja(lista) {
    if (!Array.isArray(lista)) return;
    const ya = new Set(pendientesClasificar().map(x => x.id));
    const nueva = lista.filter(x => !ya.has(x.id));
    const antes = JSON.stringify(bandeja());
    escribirLS(K_BANDEJA, nueva);
    if (JSON.stringify(nueva) !== antes) cb.alBandeja(nueva);
  }
  // Rudy asignó o descartó un cargo: sale de la bandeja y se avisa al Sheet en el próximo guardado
  function clasificar(id, estado, asignadoA) {
    escribirLS(K_BANDEJA, bandeja().filter(x => x.id !== id));
    escribirLS(K_CLASIFICADOS, pendientesClasificar().filter(x => x.id !== id).concat([{ id, estado, asignado_a: asignadoA || "" }]));
  }

  // ---------- subir ----------
  function cambio(plan) {
    guardarLocal(plan, { pendiente: true });
    cb.alEstado("busy", "Guardando…");
    clearTimeout(timer); timer = setTimeout(subir, ESPERA);
  }

  async function subir(forzar) {
    if (subiendo) { otraVez = true; return; }
    const d = local(); if (!d || !d.pendiente) return;
    const clas = pendientesClasificar();
    if (!navigator.onLine) { cb.alEstado("err", "Sin señal: se guardará al volver"); return; }
    subiendo = true;
    try {
      const r = await llamar("guardar", { version: d.version || 0, plan: d.plan, forzar: !!forzar, clasificados: clas });
      if (r.ok) {
        const enviados = new Set(clas.map(x => x.id));
        escribirLS(K_CLASIFICADOS, pendientesClasificar().filter(x => !enviados.has(x.id)));
        const ahora = local();
        // Si hubo más cambios mientras subía, siguen pendientes
        guardarLocal(ahora.plan, { version: r.version, pendiente: JSON.stringify(ahora.plan) !== JSON.stringify(d.plan), sincronizado: Date.now() });
        ultimoError = "";
        cb.alEstado("", "Guardado en tu Sheet");
      } else if (r.conflicto) {
        const remoto = await llamar("leer", {});
        if (remoto.ok) cb.alConflicto(remoto.plan, remoto.version);
      } else {
        ultimoError = r.error || "No se pudo guardar";
        cb.alEstado("err", ultimoError);
      }
    } catch (e) {
      ultimoError = navigator.onLine ? "No se pudo guardar: se reintentará" : "Sin señal: se guardará al volver";
      cb.alEstado("err", ultimoError);
    } finally {
      subiendo = false;
      if (otraVez || (local() || {}).pendiente) { otraVez = false; clearTimeout(timer); timer = setTimeout(subir, ultimoError ? 15000 : ESPERA); }
    }
  }

  // ---------- bajar ----------
  async function sincronizar(manual) {
    const d = local();
    if (d && d.pendiente) { await subir(); return; }
    if (!navigator.onLine) { cb.alEstado("err", "Sin señal: usando la copia del teléfono"); return; }
    if (manual) cb.alEstado("busy", "Sincronizando…");
    try {
      const r = await llamar("leer", {});
      if (!r.ok) { cb.alEstado("err", r.error || "No se pudo leer el Sheet"); return; }
      const actual = local();
      if (actual && actual.pendiente) return; // hubo cambios mientras leía: se suben primero
      const nuevo = !actual || (r.version || 0) !== (actual.version || 0);
      guardarLocal(r.plan, { version: r.version, pendiente: false, sincronizado: Date.now() });
      if (nuevo) cb.alRemoto(r.plan);
      guardarBandeja(r.porClasificar);
      cb.alEstado("", "Al día con tu Sheet");
    } catch (_) { cb.alEstado("err", "No se pudo conectar: usando la copia del teléfono"); }
  }

  // Resolver un conflicto
  function quedarmeConEste() { subir(true); }
  function usarRemoto(plan, version) { clearTimeout(timer); guardarLocal(plan, { version, pendiente: false, sincronizado: Date.now() }); cb.alEstado("", "Al día con tu Sheet"); }

  function estado() {
    const d = local();
    if (!conectado()) return { icono: "link_off", titulo: "Sin conectar", detalle: "Pega tu código de conexión para empezar." };
    if (d && d.pendiente) return { icono: "cloud_upload", titulo: "Hay cambios por subir", detalle: ultimoError || "Se suben solos cuando hay señal." };
    const cuando = d && d.sincronizado ? new Date(d.sincronizado).toLocaleString("es-SV", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "—";
    return { icono: "cloud_done", titulo: "Se guardan en tu Google Sheet privado", detalle: `Última sincronización: ${cuando}. Este teléfono guarda una copia para usarla sin señal.` };
  }

  function iniciar(callbacks) {
    cb = Object.assign(cb, callbacks || {});
    if (typeof window !== "undefined") {
      window.addEventListener("online", () => sincronizar());
      document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && conectado()) sincronizar(); });
    }
  }

  root.Datos = { iniciar, leerCodigo, conectado, conectar, desconectar, local, cambio, subir, sincronizar, quedarmeConEste, usarRemoto, estado, bandeja, clasificar };
  if (typeof module !== "undefined" && module.exports) module.exports = root.Datos;
})(typeof self !== "undefined" ? self : this);
