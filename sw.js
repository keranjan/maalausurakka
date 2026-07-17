/* Maalausurakka — service worker
 *
 * Mitä tämä tekee: nopeuttaa käynnistystä ja tekee sovelluksesta asennettavan.
 * Mitä tämä EI tee: ei mahdollista offline-muokkausta. Maalausdata asuu
 * Supabasessa, ja sitä ei koskaan välimuistiteta — vanhentunut data olisi
 * pahempi kuin selkeä virhe.
 *
 * Kun muutat index.html:ää, nosta CACHE-versiota. Muuten selain voi tarjoilla
 * vanhaa runkoa vielä pitkään.
 */
const CACHE = "maalausurakka-v1";

/* sovelluksen runko */
const SHELL = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./icon-192.png",
  "./icon-512.png",
];

/* nämä eivät koskaan mene välimuistiin */
const NEVER_CACHE = [
  "supabase.co",
  "api.anthropic.com",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE)
      // yksittäisen tiedoston puuttuminen ei saa kaataa koko asennusta
      .then(c => Promise.allSettled(SHELL.map(u => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", (e) => {
  if (e.data === "skip-waiting") self.skipWaiting();
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (NEVER_CACHE.some(h => url.hostname.includes(h))) return; // suoraan verkkoon

  // sivunavigointi: verkko ensin, jotta päivitykset näkyvät heti;
  // välimuisti vain jos verkkoa ei ole
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req)
        .then(res => {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put("./index.html", copy));
          return res;
        })
        .catch(() => caches.match("./index.html").then(r => r || caches.match("./")))
    );
    return;
  }

  // muut (ikonit, CDN-kirjastot): välimuisti ensin, päivitys taustalla
  e.respondWith(
    caches.match(req).then(hit => {
      const net = fetch(req).then(res => {
        // vain onnistuneet vastaukset talteen; opaque (CDN) kelpaa sellaisenaan
        if (res && (res.ok || res.type === "opaque")) {
          const copy = res.clone();
          caches.open(CACHE).then(c => c.put(req, copy));
        }
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
