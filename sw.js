// Mi plan — copia de la app para abrir sin señal.
// La app: primero la red y, si no hay señal, la copia guardada.
// Las letras de Google: primero la copia (no cambian).
// Las llamadas al Sheet (Apps Script) nunca se guardan aquí.
const CACHE = "miplan-v19";
const BASE = ["./", "index.html", "css/app.css", "js/tema.js", "js/motor.js", "js/candado.js", "js/datos.js", "js/app.js", "manifest.json", "icono-v2.png", "icono-v2-192.png", "fonts/sora-cifras.woff2"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(BASE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);

  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") {
    e.respondWith(caches.match(req).then(r => r || fetch(req).then(res => { const c = res.clone(); caches.open(CACHE).then(x => x.put(req, c)); return res; })));
    return;
  }
  if (url.origin !== self.location.origin) return;

  const navega = req.mode === "navigate";
  const clave = navega ? "./" : url.pathname.replace(/^.*\/mi-plan\//, "./"); // sin parámetros
  e.respondWith(
    // "no-cache": siempre pregunta al servidor si hay versión nueva (si no, el navegador usa su copia hasta 10 min)
    fetch(req, { cache: "no-cache" }).then(res => {
      if (res && res.ok) { const c = res.clone(); caches.open(CACHE).then(x => x.put(navega ? "./" : req, c)); }
      return res;
    }).catch(() => caches.match(navega ? "./" : req, { ignoreSearch: true }).then(r => r || caches.match(clave) || caches.match("./")))
  );
});
