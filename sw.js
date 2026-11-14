/* Service worker de Forte Envíos
   - Red primero: los precios y textos siempre salen de la última versión publicada.
   - La copia guardada solo se usa sin conexión o si la red tarda demasiado.
   - Nada de otros dominios (tasa de Yadio, WhatsApp…) pasa por aquí: siempre en vivo. */
'use strict';

const VERSION = 'v1';
const CACHE = `forte-${VERSION}`;
const NETWORK_TIMEOUT_MS = 5000;

const PRECACHE = [
  './',
  './index.html',
  './styles.css',
  './script.js',
  './nav.js',
  './pwa.js',
  './logo.png',
  './manifest.webmanifest',
  './icons/icon-192.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(networkFirst(req, event));
});

async function networkFirst(req, event) {
  const cache = await caches.open(CACHE);

  const network = fetch(req).then((res) => {
    if (res.ok) cache.put(req, res.clone());
    return res;
  });
  // Si la red responde tarde, igual se guarda la versión nueva para la próxima vez
  event.waitUntil(network.catch(() => {}));

  try {
    return await withTimeout(network, NETWORK_TIMEOUT_MS);
  } catch (err) {
    const cached = await cache.match(req, { ignoreSearch: req.mode === 'navigate' });
    if (cached) return cached;
    return network; // sin copia guardada: esperar a la red (o fallar)
  }
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (v) => { clearTimeout(t); resolve(v); },
      (e) => { clearTimeout(t); reject(e); }
    );
  });
}
