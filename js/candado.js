/*
 * Mi plan — candado: bloqueo con huella/rostro (WebAuthn) y código, con cifrado.
 *
 * Una llave de datos aleatoria (AES-GCM 256) cifra en el teléfono lo sensible:
 * la conexión (URL + clave), la copia del plan, la bandeja y los estados de cuenta.
 * Esa llave se guarda "envuelta" dos veces:
 *   - con la huella: la extensión PRF de WebAuthn entrega un secreto que solo
 *     sale tras verificar la huella o el rostro (Android, iOS 18+);
 *   - con el código de 4 a 6 dígitos (PBKDF2, 310,000 vueltas).
 * Sin huella ni código, lo guardado no se puede leer.
 *
 * Mientras está abierto, los datos viven en memoria y cada cambio se cifra antes
 * de guardarse. Funciona en el navegador (window.Candado) y en Node (pruebas).
 */
(function (root) {
  const K_META = "miplan.candado";
  const SENSIBLES = ["miplan.conexion", "miplan.datos", "miplan.porclasificar", "miplan.clasificados", "miplan.estados"];
  const ITER = 310000;
  const PREFIJO = "enc1:";
  const te = new TextEncoder(), td = new TextDecoder();
  const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  const deb64 = s => { s = String(s).replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; return Uint8Array.from(atob(s), c => c.charCodeAt(0)); };
  const azar = n => crypto.getRandomValues(new Uint8Array(n));

  let almacen = typeof window !== "undefined" && window.localStorage ? window.localStorage : null;
  let memoria = null, llave = null, cola = Promise.resolve();

  // ---------- meta (no es secreto: sales, envoltorios, id de la credencial) ----------
  function meta() { try { return JSON.parse(almacen.getItem(K_META) || "null"); } catch (_) { return null; } }
  function guardarMeta(m) { almacen.setItem(K_META, JSON.stringify(m)); }
  const activo = () => !!(meta() && meta().activo);
  const abierto = () => !activo() || !!llave;
  const conHuella = () => !!(meta() && meta().prf && meta().credId);

  // ---------- criptografía ----------
  async function kekDePin(pin, sal, iter) {
    const base = await crypto.subtle.importKey("raw", te.encode(String(pin)), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({ name: "PBKDF2", salt: sal, iterations: iter, hash: "SHA-256" }, base, { name: "AES-GCM", length: 256 }, false, ["wrapKey", "unwrapKey"]);
  }
  async function kekDePrf(salida) {
    const base = await crypto.subtle.importKey("raw", salida, "HKDF", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({ name: "HKDF", hash: "SHA-256", salt: te.encode("miplan-candado-v1"), info: te.encode("llave de datos") }, base, { name: "AES-GCM", length: 256 }, false, ["wrapKey", "unwrapKey"]);
  }
  async function envolver(dk, kek) { const iv = azar(12); return { iv: b64(iv), ct: b64(await crypto.subtle.wrapKey("raw", dk, kek, { name: "AES-GCM", iv })) }; }
  function desenvolver(env, kek) { return crypto.subtle.unwrapKey("raw", deb64(env.ct), kek, { name: "AES-GCM", iv: deb64(env.iv) }, { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]); }
  async function cifrar(dk, texto) { const iv = azar(12); return PREFIJO + b64(iv) + ":" + b64(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, dk, te.encode(texto))); }
  async function descifrar(dk, s) { const [, iv, ct] = s.slice(0).split(":"); return td.decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: deb64(iv) }, dk, deb64(ct))); }

  // ---------- almacén (lo usa js/datos.js en lugar de localStorage) ----------
  function get(k) {
    if (activo() && SENSIBLES.includes(k)) return memoria && Object.prototype.hasOwnProperty.call(memoria, k) ? memoria[k] : null;
    try { return JSON.parse(almacen.getItem(k) || "null"); } catch (_) { return null; }
  }
  function set(k, v) {
    if (activo() && SENSIBLES.includes(k)) { if (!memoria) return false; memoria[k] = v; persistir(k, v); return true; }
    try { almacen.setItem(k, JSON.stringify(v)); return true; } catch (_) { return false; }
  }
  function quitar(k) { if (memoria) delete memoria[k]; try { almacen.removeItem(k); } catch (_) {} }
  function persistir(k, v) {
    const copia = v == null ? null : JSON.stringify(v);
    cola = cola.then(async () => { if (!llave) return; if (copia == null) almacen.removeItem(k); else almacen.setItem(k, await cifrar(llave, copia)); }).catch(() => {});
  }
  const listo = () => cola; // espera a que todo lo pendiente quede cifrado

  // Abre con la llave de datos: descifra lo guardado (y cifra lo que estaba en claro)
  async function abrirCon(dk) {
    const mem = {};
    for (const k of SENSIBLES) {
      const raw = almacen.getItem(k); if (raw == null) continue;
      mem[k] = JSON.parse(raw.startsWith(PREFIJO) ? await descifrar(dk, raw) : raw);
    }
    llave = dk; memoria = mem;
    for (const k of Object.keys(mem)) if (!String(almacen.getItem(k)).startsWith(PREFIJO)) persistir(k, mem[k]);
    const m = meta(); if (m && (m.fallos || m.esperaHasta)) { m.fallos = 0; m.esperaHasta = 0; guardarMeta(m); }
    await listo();
    return true;
  }

  // ---------- activar / desactivar ----------
  const pinValido = pin => /^\d{4,6}$/.test(String(pin));

  // opts: { pin, prf: { credId, sal, salida } | null }
  async function activar(opts) {
    if (activo()) throw new Error("El bloqueo ya está activo");
    if (!pinValido(opts.pin)) throw new Error("El código debe tener de 4 a 6 números");
    const dk = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
    const salPin = azar(16);
    const m = { activo: true, v: 1, minutos: 5, pin: { sal: b64(salPin), iter: ITER, env: await envolver(dk, await kekDePin(opts.pin, salPin, ITER)) }, prf: null, credId: null, prfSal: null, fallos: 0, esperaHasta: 0 };
    if (opts.prf && opts.prf.salida) { m.prf = await envolver(dk, await kekDePrf(opts.prf.salida)); m.credId = opts.prf.credId; m.prfSal = opts.prf.sal; }
    // Lo que estaba en claro pasa a memoria; la meta se guarda primero (si algo se
    // interrumpe, abrirCon sabe leer lo que quedó sin cifrar).
    const plano = {}; for (const k of SENSIBLES) { const raw = almacen.getItem(k); if (raw != null) plano[k] = JSON.parse(raw); }
    guardarMeta(m);
    llave = dk; memoria = plano;
    for (const k of Object.keys(plano)) persistir(k, plano[k]);
    await listo();
    return { conHuella: !!m.prf };
  }

  async function desactivar() {
    if (!activo()) return;
    if (!llave) throw new Error("Primero desbloquea");
    await listo();
    for (const k of SENSIBLES) { if (memoria[k] == null) almacen.removeItem(k); else almacen.setItem(k, JSON.stringify(memoria[k])); }
    almacen.removeItem(K_META);
    llave = null; memoria = null;
  }

  // Olvida todo (para "Desconectar este teléfono" o si se olvidó el código)
  function borrarTodo() { for (const k of SENSIBLES) almacen.removeItem(k); almacen.removeItem(K_META); llave = null; memoria = null; }

  // Cierra en memoria (como recargar la página)
  function cerrar() { llave = null; memoria = null; }

  // ---------- desbloquear ----------
  function espera() { const m = meta(); return m && m.esperaHasta > Date.now() ? Math.ceil((m.esperaHasta - Date.now()) / 1000) : 0; }
  async function conPin(pin) {
    const m = meta(); if (!m) return { ok: false, error: "El bloqueo no está activo" };
    const s = espera(); if (s) return { ok: false, error: `Espera ${s} segundos e inténtalo de nuevo`, espera: s };
    try { return { ok: await abrirCon(await desenvolver(m.pin.env, await kekDePin(pin, deb64(m.pin.sal), m.pin.iter))) }; }
    catch (_) {
      // Tras 3 fallos, cada intento espera más: 30 s, 60 s, 120 s… (máximo 1 hora)
      m.fallos = (m.fallos || 0) + 1;
      if (m.fallos >= 3) m.esperaHasta = Date.now() + Math.min(3600, 30 * 2 ** (m.fallos - 3)) * 1000;
      guardarMeta(m);
      return { ok: false, error: "Código incorrecto", fallos: m.fallos };
    }
  }
  async function conSalidaPrf(salida) {
    const m = meta(); if (!m || !m.prf) return { ok: false, error: "La huella no está configurada" };
    try { return { ok: await abrirCon(await desenvolver(m.prf, await kekDePrf(salida))) }; }
    catch (_) { return { ok: false, error: "No se pudo abrir con la huella" }; }
  }

  // ---------- WebAuthn (solo navegador) ----------
  const soportaHuella = async () => {
    try { return typeof PublicKeyCredential !== "undefined" && await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable(); } catch (_) { return false; }
  };
  // Registra la huella o el rostro y obtiene el secreto PRF (null si el navegador no lo da)
  async function registrarHuella() {
    const sal = azar(32);
    const cred = await navigator.credentials.create({ publicKey: {
      rp: { name: "Mi plan" }, user: { id: azar(16), name: "Mi plan", displayName: "Mi plan" }, challenge: azar(32),
      pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "preferred" },
      timeout: 60000, extensions: { prf: { eval: { first: sal } } },
    } });
    const ext = cred.getClientExtensionResults ? cred.getClientExtensionResults() : {};
    const credId = b64(cred.rawId);
    let salida = ext.prf && ext.prf.results && ext.prf.results.first ? new Uint8Array(ext.prf.results.first) : null;
    if (!salida && ext.prf && ext.prf.enabled) salida = await salidaHuella(credId, b64(sal));
    return { credId, sal: b64(sal), salida };
  }
  async function salidaHuella(credId, sal) {
    const a = await navigator.credentials.get({ publicKey: {
      challenge: azar(32), allowCredentials: [{ type: "public-key", id: deb64(credId) }], userVerification: "required", timeout: 60000,
      extensions: { prf: { eval: { first: deb64(sal) } } },
    } });
    const r = a.getClientExtensionResults ? a.getClientExtensionResults() : {};
    return r.prf && r.prf.results && r.prf.results.first ? new Uint8Array(r.prf.results.first) : null;
  }
  async function conHuellaAhora() {
    const m = meta(); if (!m || !m.prf) return { ok: false, error: "La huella no está configurada" };
    let salida;
    try { salida = await salidaHuella(m.credId, m.prfSal); } catch (_) { return { ok: false, error: "Se canceló o no se reconoció la huella" }; }
    if (!salida) return { ok: false, error: "Este navegador no entregó la llave de la huella; usa tu código" };
    return conSalidaPrf(salida);
  }

  const api = { SENSIBLES, activo, abierto, conHuella, get, set, quitar, listo, activar, desactivar, borrarTodo, cerrar, conPin, conSalidaPrf, conHuellaAhora, espera,
    soportaHuella, registrarHuella, pinValido, minutos: () => (meta() && meta().minutos) || 5,
    __almacen: a => { almacen = a; llave = null; memoria = null; cola = Promise.resolve(); } };
  root.Candado = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof self !== "undefined" ? self : this);
