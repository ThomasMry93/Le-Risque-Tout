// Service worker : le jeu fonctionne hors connexion après la première visite.
// Une nouvelle version se télécharge en arrière-plan mais ne s'installe que lorsque
// le joueur appuie sur « Mettre à jour » dans le bandeau.
// Changer VERSION à chaque mise à jour du jeu.
const VERSION = "risque-tout-v9";
const SHELL = ["./", "index.html", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "icons/apple-touch-icon.png"];

self.addEventListener("install", e => {
  e.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    await cache.addAll(SHELL.map(u => new Request(u, { cache: "reload" })));
    // Passage depuis les versions d'avant le bouton (v1 à v6) : elles s'effacent toutes seules
    const old = await caches.keys();
    if (old.some(k => /^risque-tout-v[1-6]$/.test(k))) self.skipWaiting();
  })());
});

self.addEventListener("message", e => {
  if (e.data === "skipWaiting") self.skipWaiting();
});

self.addEventListener("activate", e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  // Page du jeu : toujours la version installée, jusqu'à ce qu'on choisisse de mettre à jour
  if (req.mode === "navigate") {
    e.respondWith(caches.open(VERSION).then(c => c.match("index.html")).then(hit => hit || fetch(req)));
    return;
  }
  // Polices Google et fichiers du jeu : cache d'abord
  if (url.origin === location.origin || url.host.endsWith("fonts.googleapis.com") || url.host.endsWith("fonts.gstatic.com")) {
    e.respondWith(caches.open(VERSION).then(c => c.match(req).then(hit => hit || fetch(req).then(res => {
      c.put(req, res.clone());
      return res;
    }))));
  }
});
