// Dijana oleh tools/build-pwa.js — jangan edit
var V = 'tj-708b922b9f';
var FILES = ["./","app.js","calc.js","i18n.js","icons/apple-touch-icon.png","icons/icon-192.png","icons/icon-512.png","index.html","manifest.webmanifest","ocr/eng.traineddata","ocr/tesseract-core-lstm.wasm.js","ocr/tesseract-core-simd-lstm.wasm.js","ocr/tesseract.min.js","ocr/worker.min.js","roster.js","seed.js"];
self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(V).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k !== V; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET' || new URL(e.request.url).origin !== location.origin) return;
  e.respondWith(caches.match(e.request, { ignoreSearch: true }).then(function (r) { return r || fetch(e.request); }));
});
