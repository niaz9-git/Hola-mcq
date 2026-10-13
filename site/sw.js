/* Service worker: lets the reader open offline.
   - app shell + small data files (meta/tree/ids): network first, cached copy when offline
   - questions (data/q, data/t) and images (img/): served from the "saved offline" cache first, then the network
   Topics are saved into the "mcq-saved" cache from the page (button "Save for offline"). */
var SHELL = "mcq-shell-v1";
var SAVED = "mcq-saved";
var PRECACHE = ["./", "index.html", "app.js", "style.css", "config.js", "manifest.webmanifest",
  "icon-192.png", "icon-512.png", "data/meta.json", "data/tree.json", "data/ids.json"];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(SHELL).then(function (c) {
    return Promise.all(PRECACHE.map(function (u) {
      return c.add(new Request(u, { cache: "reload" })).catch(function () {});   // one missing file must not break install
    }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf("mcq-shell-") === 0 && k !== SHELL; })
      .map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

function isSavedKind(path) { return /\/data\/(q|t)\/[^/]+$/.test(path) || /\/img\//.test(path); }

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (isSavedKind(url.pathname)) {
    e.respondWith(caches.open(SAVED).then(function (c) { return c.match(req); })
      .then(function (hit) { return hit || fetch(req); }));
    return;
  }
  e.respondWith(
    new Promise(function (resolve, reject) {
      var timer = setTimeout(function () { reject(new Error("slow")); }, 6000);
      fetch(req).then(function (res) { clearTimeout(timer); resolve(res); }, function (err) { clearTimeout(timer); reject(err); });
    }).then(function (res) {
      if (res && res.ok) { var copy = res.clone(); caches.open(SHELL).then(function (c) { c.put(req, copy); }); }
      return res;
    }).catch(function () {
      return caches.match(req, { ignoreSearch: true }).then(function (hit) {
        if (hit) return hit;
        if (req.mode === "navigate") return caches.match("index.html");
        return Response.error();
      });
    })
  );
});
