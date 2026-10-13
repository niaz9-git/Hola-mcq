/* MCQ Reader - static, no build step. Reads data/ (see build_site_data.py). Keeps your progress in this browser. */
(function () {
"use strict";

var CFG = Object.assign({ TITLE: "MCQ Reader", IMG_BASE: "", DATA_BASE: "data/", PAGE: 50, OFFLINE: true }, window.MCQ_CONFIG || {});
if (CFG.IMG_BASE && CFG.IMG_BASE.slice(-1) !== "/") CFG.IMG_BASE += "/";
if (CFG.DATA_BASE && CFG.DATA_BASE.slice(-1) !== "/") CFG.DATA_BASE += "/";

var T = {
  total: "Total questions:", topics: "Topics:",
  allQ: "All Questions", allSub: "All Subtopics", quiz: "Random Quiz",
  subtopics: "Subtopics:", questions: "Questions:", readPct: "প্রশ্ন পড়া হয়েছে",
  progress: "Progress", completed: "Completed",
  showAns: "Show All Answer", showExp: "Show All Explanation", filter: "Filter Questions",
  fAll: "All", fFav: "Favorite", fRead: "Read", fUnread: "Unread",
  answer: "উত্তর", explain: "ব্যাখ্যা", noExp: "ব্যাখ্যা নেই",
  order: "Order", oGroup: "Grouped by subtopic (fast)", oApp: "Same order as the app",
  more: "Load more", search: "Search topics...", none: "Nothing here.",
  quizHow: "How many questions?", start: "Start", next: "Next", finish: "Finish", again: "Try again", back: "Back",
  exportT: "Export my progress", importT: "Import progress", resetT: "Reset my progress",
  saveOff: "⬇ Save for offline", savedOff: "✓ Saved offline", offMenu: "Offline storage",
  offNote: "Saves this topic and all its subtopics (questions and images) on this device so it opens without internet."
};
var LAB = ["ক", "খ", "গ", "ঘ", "ঙ"];
var app = document.getElementById("app");

/* ---------- helpers ---------- */
function addKids(e, kids) {
  for (var i = 0; i < kids.length; i++) {
    var c = kids[i];
    if (c == null || c === false) continue;
    if (Array.isArray(c)) addKids(e, c);
    else e.appendChild(c && c.nodeType ? c : document.createTextNode(String(c)));
  }
}
function h(tag, props) {
  var e = document.createElement(tag);
  if (props) {
    for (var k in props) {
      var v = props[k];
      if (v == null || v === false) continue;
      if (k === "class") e.className = v;
      else if (k === "html") e.innerHTML = v;
      else if (k.slice(0, 2) === "on") e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? "" : v);
    }
  }
  addKids(e, Array.prototype.slice.call(arguments, 2));
  return e;
}
function clear(e) { while (e.firstChild) e.removeChild(e.firstChild); }
function fmtK(n) { return n >= 1000 ? (n / 1000).toFixed(1) + "K" : String(n); }
function pctText(r, t) { return (t ? (r * 100 / t) : 0).toFixed(2) + "%"; }
function shuffle(a) { for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var x = a[i]; a[i] = a[j]; a[j] = x; } return a; }

var BAD_TAGS = { SCRIPT: 1, STYLE: 1, IFRAME: 1, OBJECT: 1, EMBED: 1, LINK: 1, META: 1, FORM: 1, INPUT: 1, BUTTON: 1, TEXTAREA: 1, SELECT: 1, BASE: 1 };
function cleanNode(node) {
  var kids = Array.prototype.slice.call(node.children);
  for (var i = 0; i < kids.length; i++) {
    var c = kids[i];
    if (BAD_TAGS[c.tagName]) { c.parentNode.removeChild(c); continue; }
    var attrs = Array.prototype.slice.call(c.attributes);
    for (var j = 0; j < attrs.length; j++) {
      var n = attrs[j].name.toLowerCase(), v = attrs[j].value.replace(/\s+/g, "").toLowerCase();
      if (n.slice(0, 2) === "on" || ((n === "href" || n === "src" || n === "srcset" || n === "xlink:href" || n === "style" || n === "action") &&
          (v.indexOf("javascript:") === 0 || v.indexOf("data:text") === 0 || v.indexOf("expression(") >= 0))) c.removeAttribute(attrs[j].name);
    }
    if (c.tagName === "IMG") c.setAttribute("loading", "lazy");
    if (c.tagName === "A") { c.setAttribute("target", "_blank"); c.setAttribute("rel", "noopener noreferrer"); }
    cleanNode(c);
  }
}
function clean(html) {
  if (!html) return "";
  html = String(html).split("{{IMG}}").join(CFG.IMG_BASE);
  var t = document.createElement("template");
  t.innerHTML = html;
  cleanNode(t.content);
  return t.innerHTML;
}

/* ---------- preferences ---------- */
var prefs = { showAns: false, showExp: false, order: "group" };
try { var pp = JSON.parse(localStorage.getItem("mcq-prefs") || "{}"); for (var pk in pp) prefs[pk] = pp[pk]; } catch (e) {}
function savePrefs() { try { localStorage.setItem("mcq-prefs", JSON.stringify(prefs)); } catch (e) {} }

/* ---------- data ---------- */
var cache = { meta: null, tree: null, ids: null, lists: new Map(), chunks: new Map(), sorted: new Map() };
var nodes = new Map(), parentOf = new Map(), allNodes = [];
function getJSON(path) {
  return fetch(CFG.DATA_BASE + path).then(function (r) {
    if (!r.ok) throw new Error(path + " (HTTP " + r.status + ")");
    return r.json();
  });
}
function memo(key, fn) {
  if (!cache[key]) cache[key] = fn().catch(function (e) { cache[key] = null; throw e; });
  return cache[key];
}
function indexTree(list, parent) {
  list.forEach(function (n) { nodes.set(n.i, n); parentOf.set(n.i, parent); allNodes.push(n); indexTree(n.k, n.i); });
}
function getMeta() { return memo("meta", function () { return getJSON("meta.json"); }); }
function getTree() { return memo("tree", function () { return getJSON("tree.json").then(function (t) { indexTree(t.roots, null); return t; }); }); }
function getIds() { return memo("ids", function () { return getJSON("ids.json"); }); }
function getList(id) {
  var p = cache.lists.get(id);
  if (!p) {
    p = getJSON("t/" + id + ".json").then(function (d) { return d.s; });
    p.catch(function () { cache.lists.delete(id); });
    cache.lists.set(id, p);
  }
  return p;
}
function getChunk(n) {
  var p = cache.chunks.get(n);
  if (p) { cache.chunks.delete(n); cache.chunks.set(n, p); return p; }
  p = getJSON("q/" + n + ".json");
  p.catch(function () { cache.chunks.delete(n); });
  cache.chunks.set(n, p);
  if (cache.chunks.size > 60) cache.chunks.delete(cache.chunks.keys().next().value);
  return p;
}
function getQuestions(seqs) {
  return getMeta().then(function (meta) {
    var size = meta.chunk, need = [];
    seqs.forEach(function (s) { var c = Math.floor(s / size); if (need.indexOf(c) < 0) need.push(c); });
    return Promise.all(need.map(getChunk)).then(function (loaded) {
      var by = {};
      need.forEach(function (c, i) { by[c] = loaded[i]; });
      return seqs.map(function (s) { return by[Math.floor(s / size)][s % size]; });
    });
  });
}
function sortedList(id, list) {
  var s = cache.sorted.get(id);
  if (!s) { s = list.slice().sort(function (a, b) { return a - b; }); cache.sorted.set(id, s); }
  return s;
}
function pathOf(id) { var out = []; while (id != null) { out.unshift(nodes.get(id)); id = parentOf.get(id); } return out; }

/* ---------- your progress (read / favourite / chosen option), kept in this browser ---------- */
var State = {
  map: new Map(), nRead: 0, nFav: 0, db: null, timer: null,
  init: function () {
    var self = this;
    return new Promise(function (resolve) {
      if (!window.indexedDB) { self.loadLocal(); return resolve(); }
      var req;
      try { req = indexedDB.open("mcq-reader", 2); } catch (e) { self.loadLocal(); return resolve(); }
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains("state")) db.createObjectStore("state", { keyPath: "id" });
        if (!db.objectStoreNames.contains("offline")) db.createObjectStore("offline", { keyPath: "id" });
      };
      req.onerror = function () { self.loadLocal(); resolve(); };
      req.onsuccess = function () {
        self.db = req.result;
        var g = self.db.transaction("state").objectStore("state").getAll();
        g.onsuccess = function () { g.result.forEach(function (o) { self.add(o); }); resolve(); };
        g.onerror = function () { resolve(); };
      };
    });
  },
  loadLocal: function () {
    var self = this;
    try { JSON.parse(localStorage.getItem("mcq-state") || "[]").forEach(function (o) { self.add(o); }); } catch (e) {}
  },
  add: function (o) { this.map.set(o.id, o); if (o.r) this.nRead++; if (o.f) this.nFav++; },
  get: function (id) { return this.map.get(id) || { id: id, r: 0, f: 0, c: 0 }; },
  set: function (id, patch) {
    var old = this.get(id), nw = Object.assign({}, old, patch);
    if (old.r !== nw.r) this.nRead += nw.r ? 1 : -1;
    if (old.f !== nw.f) this.nFav += nw.f ? 1 : -1;
    var del = !nw.r && !nw.f && !nw.c;
    if (del) this.map.delete(id); else this.map.set(id, nw);
    this.persist(nw, del);
    return nw;
  },
  persist: function (o, del) {
    var self = this;
    if (this.db) {
      try { var st = this.db.transaction("state", "readwrite").objectStore("state"); if (del) st.delete(o.id); else st.put(o); } catch (e) {}
    } else {
      clearTimeout(this.timer);
      this.timer = setTimeout(function () {
        try { localStorage.setItem("mcq-state", JSON.stringify(Array.from(self.map.values()))); } catch (e) {}
      }, 400);
    }
  },
  clearAll: function () {
    this.map = new Map(); this.nRead = 0; this.nFav = 0;
    if (this.db) { try { this.db.transaction("state", "readwrite").objectStore("state").clear(); } catch (e) {} }
    try { localStorage.removeItem("mcq-state"); } catch (e) {}
  },
  exportData: function () {
    return JSON.stringify({ app: "mcq-reader", v: 1, exported: new Date().toISOString(),
      items: Array.from(this.map.values()).map(function (o) { return [o.id, o.r, o.f, o.c]; }) });
  },
  importData: function (text) {
    var d = JSON.parse(text), n = 0, self = this;
    if (!d || !Array.isArray(d.items)) throw new Error("This is not a progress file.");
    d.items.forEach(function (it) {
      var cur = self.get(it[0]);
      self.set(it[0], { r: cur.r || it[1] ? 1 : 0, f: cur.f || it[2] ? 1 : 0, c: cur.c || it[3] || 0 });
      n++;
    });
    return n;
  }
};
function stats(tagId) {
  if (!State.nRead && !State.nFav) return Promise.resolve({ read: 0, fav: 0 });
  return Promise.all([getList(tagId), getIds()]).then(function (a) {
    var list = a[0], ids = a[1], r = 0, f = 0;
    for (var i = 0; i < list.length; i++) {
      var st = State.map.get(ids[list[i]]);
      if (st) { if (st.r) r++; if (st.f) f++; }
    }
    return { read: r, fav: f };
  });
}

/* ---------- offline saving (needs https or localhost) ---------- */
var SAVED_CACHE = "mcq-saved";
function mb(n) { return n >= 1e9 ? (n / 1e9).toFixed(2) + " GB" : Math.max(0.1, n / 1e6).toFixed(1) + " MB"; }
function toast(msg) {
  var t = h("div", { class: "toast" }, msg);
  document.body.appendChild(t);
  setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 7000);
}
function subtreeIds(id) {
  var out = [], st = [nodes.get(id)];
  while (st.length) { var n = st.pop(); out.push(n.i); n.k.forEach(function (c) { st.push(c); }); }
  return out;
}
function scanImages(chunk, set) {
  chunk.forEach(function (q) {
    [q.q, q.e].concat(q.o || []).forEach(function (str) {
      if (!str || str.toLowerCase().indexOf("<img") < 0) return;
      var re = /<img[^>]+src=["']?([^"' >]+)/gi, m;
      while ((m = re.exec(str))) {
        try {
          var u = new URL(m[1].split("{{IMG}}").join(CFG.IMG_BASE), location.href);
          if (u.origin === location.origin) set.add(u.href);
        } catch (e) {}
      }
    });
  });
}
async function pool(items, n, fn) {
  var i = 0, err = null;
  async function worker() {
    while (!err) {
      var k = i++;
      if (k >= items.length) return;
      try { await fn(items[k], k); } catch (e) { err = e; }
    }
  }
  var ws = [];
  for (var w = 0; w < n; w++) ws.push(worker());
  await Promise.all(ws);
  if (err) throw err;
}
var Offline = {
  ok: false, recs: new Map(), checked: false,
  init: function () {
    var self = this;
    this.ok = !!(window.caches && State.db && CFG.OFFLINE !== false);
    if (!this.ok) return Promise.resolve();
    return new Promise(function (resolve) {
      try {
        var g = State.db.transaction("offline").objectStore("offline").getAll();
        g.onsuccess = function () { g.result.forEach(function (r) { self.recs.set(r.id, r); }); resolve(); };
        g.onerror = function () { resolve(); };
      } catch (e) { resolve(); }
    });
  },
  store: function (fn) { try { fn(State.db.transaction("offline", "readwrite").objectStore("offline")); } catch (e) {} },
  isSaved: function (id) { while (id != null) { if (this.recs.has(id)) return true; id = parentOf.get(id); } return false; },
  union: function () { var s = new Set(); this.recs.forEach(function (r) { r.urls.forEach(function (u) { s.add(u); }); }); return s; },
  prune: async function () {
    var keep = this.union(), c = await caches.open(SAVED_CACHE), keys = await c.keys();
    for (var i = 0; i < keys.length; i++) if (!keep.has(keys[i].url)) await c.delete(keys[i]);
  },
  remove: async function (id) {
    this.recs.delete(id); this.store(function (st) { st.delete(id); });
    await this.prune();
  },
  clearAll: async function () {
    this.recs.clear(); this.store(function (st) { st.clear(); });
    try { await caches.delete(SAVED_CACHE); } catch (e) {}
  },
  checkBuild: async function () {
    if (this.checked || !this.ok) return;
    this.checked = true;
    try {
      var meta = await getMeta(), stale = false;
      this.recs.forEach(function (r) { if (r.build !== meta.built) stale = true; });
      if (stale) { await this.clearAll(); toast("The data was updated, so the offline copies were removed. Please save your topics again."); }
    } catch (e) {}
  },
  save: async function (tagId, ui) {
    var self = this, meta = await getMeta();
    await getTree();
    if (navigator.storage && navigator.storage.persist) { try { navigator.storage.persist(); } catch (e) {} }
    var cache = await caches.open(SAVED_CACHE);
    var urls = new Set(), bytes = 0, imgSet = new Set(), size = meta.chunk, failedImgs = 0;
    function abs(p) { return new URL(p, location.href).href; }
    async function grab(href, asText) {
      if (ui.cancelled()) throw new Error("cancelled");
      var res = await fetch(href);
      if (!res.ok) throw new Error(href + " (HTTP " + res.status + ")");
      var copy = res.clone(), text = null;
      if (asText) { text = await res.clone().text(); bytes += new Blob([text]).size; }
      else { bytes += (await res.blob()).size; }
      await cache.put(href, copy);
      urls.add(href);
      return text;
    }
    try {
      var ids = subtreeIds(tagId), chunkSet = new Set();
      ui.phase("Topic lists", ids.length);
      await pool(ids, 6, async function (id) {
        var text = await grab(abs(CFG.DATA_BASE + "t/" + id + ".json"), true);
        JSON.parse(text).s.forEach(function (s) { chunkSet.add(Math.floor(s / size)); });
        ui.tick();
      });
      var chunks = Array.from(chunkSet).sort(function (a, b) { return a - b; });
      var estText = chunks.length * (meta.avg_chunk_bytes || 250000);
      if (estText > 300e6 && !ui.confirm("The questions need about " + mb(estText) + ". Continue?")) throw new Error("cancelled");
      ui.phase("Questions", chunks.length);
      await pool(chunks, 4, async function (c) {
        var text = await grab(abs(CFG.DATA_BASE + "q/" + c + ".json"), true);
        scanImages(JSON.parse(text), imgSet);
        ui.tick();
      });
      var imgs = Array.from(imgSet), withImages = true;
      if (imgs.length) {
        var estImg = imgs.length * (meta.avg_image_bytes || 130000);
        if (estImg > 300e6 && !ui.confirm("The images need about " + mb(estImg) + " more. OK = save them too, Cancel = questions only.")) withImages = false;
        if (withImages) {
          ui.phase("Images", imgs.length);
          await pool(imgs, 6, async function (u) {
            try { await grab(u, false); }
            catch (e) { if (ui.cancelled() || (e.name === "QuotaExceededError")) throw e; failedImgs++; }
            ui.tick();
          });
        }
      }
      var rec = { id: tagId, name: nodes.get(tagId).n, t: Date.now(), build: meta.built, files: urls.size, bytes: bytes,
                  images: withImages ? imgs.length - failedImgs : 0, urls: Array.from(urls) };
      this.recs.set(tagId, rec);
      this.store(function (st) { st.put(rec); });
      return rec;
    } catch (e) {
      await self.prune();            // forget everything this failed run added
      throw e;
    }
  }
};

function offlineBtn(tagId) {
  if (!Offline.ok) return null;
  var b = h("button", { class: "btn b2 offline", type: "button" });
  function paint() { b.textContent = Offline.isSaved(tagId) ? T.savedOff : T.saveOff; }
  paint();
  b.addEventListener("click", function () {
    if (Offline.isSaved(tagId)) openManager(); else openSave(tagId, paint);
  });
  return b;
}
function openSave(tagId, onDone) {
  var node = nodes.get(tagId), cancelled = false, running = false, cur = { label: "", total: 0, n: 0 };
  var bar = h("progress", { max: 1, value: 0 }), msg = h("div", { class: "muted" }, T.offNote);
  var start = h("button", { type: "button" }, "Start");
  var cancel = h("button", { type: "button" }, "Cancel");
  function paint() {
    bar.max = cur.total || 1; bar.value = cur.n;
    msg.textContent = cur.label + ": " + cur.n + " / " + cur.total;
  }
  var ui = {
    cancelled: function () { return cancelled; },
    confirm: function (m) { return window.confirm(m); },
    phase: function (label, total) { cur = { label: label, total: total, n: 0 }; paint(); },
    tick: function () { cur.n++; paint(); }
  };
  start.addEventListener("click", async function () {
    running = true; start.hidden = true; msg.textContent = "Starting…";
    try {
      var rec = await Offline.save(tagId, ui);
      bar.value = bar.max;
      msg.textContent = "Saved: " + rec.files + " files, " + mb(rec.bytes) + (rec.images ? " (" + rec.images + " images)" : "");
    } catch (e) {
      msg.textContent = e.message === "cancelled" ? "Cancelled. Nothing was kept from this run."
        : (e.name === "QuotaExceededError" ? "The device has no more room for offline data." : "Failed: " + e.message);
    }
    running = false; cancel.textContent = "Close"; onDone();
  });
  cancel.addEventListener("click", function () { if (running) cancelled = true; else sheet.hidden = true; });
  clear(sheet);
  sheet.appendChild(h("div", { class: "box" }, h("h3", null, node.n), msg, bar, start, cancel));
  sheet.hidden = false;
}
function openManager() {
  clear(sheet);
  var box = h("div", { class: "box" }, h("h3", null, T.offMenu));
  var usage = h("small", null, "");
  function paint() {
    Array.prototype.slice.call(box.querySelectorAll(".orow,.muted")).forEach(function (e) { e.remove(); });
    var recs = Array.from(Offline.recs.values()).sort(function (a, b) { return b.t - a.t; });
    if (!recs.length) box.insertBefore(h("p", { class: "muted" }, "Nothing is saved on this device yet."), usage);
    recs.forEach(function (r) {
      box.insertBefore(h("div", { class: "orow" },
        h("span", null, r.name), h("small", null, mb(r.bytes) + " · " + r.files + " files"),
        h("button", { type: "button", onclick: async function () { await Offline.remove(r.id); paint(); } }, "Delete")), usage);
    });
  }
  box.appendChild(usage);
  if (navigator.storage && navigator.storage.estimate) {
    navigator.storage.estimate().then(function (e) { usage.textContent = "Browser storage: " + mb(e.usage || 0) + " used of about " + mb(e.quota || 0); }).catch(function () {});
  }
  box.appendChild(h("button", { class: "danger", type: "button", onclick: async function () { await Offline.clearAll(); paint(); } }, "Delete all offline data"));
  box.appendChild(h("button", { type: "button", onclick: function () { sheet.hidden = true; } }, "Close"));
  paint();
  sheet.appendChild(box);
  sheet.hidden = false;
}

/* ---------- small UI parts ---------- */
function ringEl(read, total) {
  var c = 2 * Math.PI * 18, frac = total ? Math.min(read / total, 1) : 0;
  var box = h("div", { class: "ring" });
  box.innerHTML = '<svg viewBox="0 0 44 44"><circle class="bg" cx="22" cy="22" r="18"></circle>' +
    '<circle class="fg" cx="22" cy="22" r="18" transform="rotate(-90 22 22)" stroke-dasharray="' + (c * frac).toFixed(2) + " " + c.toFixed(2) + '"></circle></svg><span></span>';
  box.lastChild.textContent = read + "/" + fmtK(total);
  box.setAttribute("data-total", total);
  return box;
}
function setRing(box, read, total) {
  var c = 2 * Math.PI * 18, frac = total ? Math.min(read / total, 1) : 0;
  box.querySelector(".fg").setAttribute("stroke-dasharray", (c * frac).toFixed(2) + " " + c.toFixed(2));
  box.lastChild.textContent = read + "/" + fmtK(total);
}
function link(text, href, cls) { return h("a", { class: "btn " + cls, href: href }, text); }
function go(hash) { location.hash = hash; }

function card(n, withPath) {
  var kids = n.k.length > 0;
  var ring = ringEl(0, n.c), favN = h("b", null, "0"), pct = h("b", null, pctText(0, n.c));
  var c = h("section", { class: "card" },
    h("div", { class: "card-head" },
      h("div", null, h("h3", { onclick: function () { go(kids ? "#/t/" + n.i : "#/q/" + n.i); } }, n.n),
        withPath ? h("div", { class: "path" }, pathOf(n.i).slice(0, -1).map(function (x) { return x.n; }).join(" › ")) : null),
      h("span", { class: "fav" }, "❤ ", favN)),
    h("div", { class: "card-body" }, ring,
      h("div", { class: "pct" }, pct, " " + T.readPct),
      h("div", { class: "meta" }, h("div", null, T.subtopics + " " + n.t), h("div", null, T.questions + " " + n.c))),
    h("div", { class: "btns" },
      link(T.allQ, "#/q/" + n.i, "b1"), kids ? link(T.allSub, "#/t/" + n.i, "b2") : null, link(T.quiz, "#/quiz/" + n.i, "b3")));
  stats(n.i).then(function (s) {
    setRing(ring, s.read, n.c); pct.textContent = pctText(s.read, n.c); favN.textContent = s.fav;
  }).catch(function () {});
  return c;
}

/* ---------- views ---------- */
async function viewTopics(parentId, alive) {
  var tree = await getTree(), meta = await getMeta();
  if (!alive()) return;
  var kids = parentId == null ? tree.roots : nodes.get(parentId).k;
  clear(app);
  if (parentId == null) {
    app.appendChild(h("div", { class: "hero" }, h("h1", null, CFG.TITLE),
      h("p", null, T.total + " " + meta.questions.toLocaleString("en-US") + " · " + T.topics + " " + meta.tags)));
  } else {
    var node = nodes.get(parentId), path = pathOf(parentId);
    app.appendChild(h("div", { class: "crumbs" }, h("a", { href: "#/" }, "Home"),
      path.slice(0, -1).map(function (x) { return [" › ", h("a", { href: "#/t/" + x.i }, x.n)]; })));
    app.appendChild(h("h2", null, node.n));
    app.appendChild(h("div", { class: "banner" }, link(T.allQ + " (" + node.c + ")", "#/q/" + node.i, "b1"), link(T.quiz, "#/quiz/" + node.i, "b3"), offlineBtn(node.i)));
  }
  var list = h("div", { class: "cards" });
  var search = h("input", { class: "search", type: "search", placeholder: T.search });
  var timer = null;
  function fill() {
    clear(list);
    var q = search.value.trim().toLowerCase();
    var items = kids, withPath = false;
    if (q.length >= 2) {
      items = allNodes.filter(function (n) { return n.n.toLowerCase().indexOf(q) >= 0; }).slice(0, 60);
      withPath = true;
    }
    if (!items.length) list.appendChild(h("p", { class: "muted" }, T.none));
    items.forEach(function (n) { list.appendChild(card(n, withPath)); });
  }
  search.addEventListener("input", function () { clearTimeout(timer); timer = setTimeout(fill, 150); });
  app.appendChild(search);
  app.appendChild(list);
  fill();
}

function qCard(q, onChange) {
  var st = State.get(q.i), correct = q.a ? q.a - 1 : -1, opts = [];
  var card = h("article", { class: "q" + (st.r ? " read" : "") + (st.c ? " revealed" : "") });
  var mark = h("button", { class: "readmark", type: "button", "aria-label": "Mark read", onclick: function () {
    var cur = State.get(q.i);
    if (cur.r) {
      State.set(q.i, { r: 0, c: 0 });
      card.classList.remove("read", "revealed");
      opts.forEach(function (o) { o.classList.remove("wrong"); });
    } else { State.set(q.i, { r: 1 }); card.classList.add("read"); }
    onChange();
  } });
  function choose(n) {
    if (State.get(q.i).c) return;
    State.set(q.i, { r: 1, c: n });
    card.classList.add("read", "revealed");
    if (n !== q.a && opts[n - 1]) opts[n - 1].classList.add("wrong");
    onChange();
  }
  q.o.forEach(function (t, i) {
    var o = h("div", { class: "opt" + (i === correct ? " correct" : ""), role: "button", tabindex: "0" },
      h("span", { class: "lab" }, LAB[i] || String(i + 1)), h("div", { class: "txt", html: clean(t) }));
    o.addEventListener("click", function () { choose(i + 1); });
    o.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choose(i + 1); } });
    opts.push(o);
  });
  if (st.c && st.c !== q.a && opts[st.c - 1]) opts[st.c - 1].classList.add("wrong");
  var ansBtn = h("button", { type: "button", onclick: function () {
    var on = card.classList.toggle("revealed");
    if (on && !State.get(q.i).r) { State.set(q.i, { r: 1 }); card.classList.add("read"); onChange(); }
  } }, T.answer);
  var expBtn = h("button", { type: "button", onclick: function () { card.classList.toggle("exp-open"); } }, T.explain);
  var favBtn = h("button", { type: "button", "aria-label": "Favourite", onclick: function () {
    var f = State.get(q.i).f ? 0 : 1;
    State.set(q.i, { f: f });
    favBtn.textContent = f ? "❤" : "♡"; favBtn.classList.toggle("on", !!f);
    onChange();
  } }, st.f ? "❤" : "♡");
  if (st.f) favBtn.classList.add("on");
  card.appendChild(mark);
  card.appendChild(h("div", { class: "qtext", html: clean(q.q) }));
  opts.forEach(function (o) { card.appendChild(o); });
  card.appendChild(h("div", { class: "qbtns" }, ansBtn, expBtn, favBtn));
  card.appendChild(h("div", { class: "exp", html: q.e ? clean(q.e) : "<i>" + T.noExp + "</i>" }));
  return card;
}

async function viewQuestions(tagId, alive) {
  await getTree();
  var node = nodes.get(tagId);
  if (!node) { clear(app); app.appendChild(h("p", null, "Topic not found.")); return; }
  var list = await getList(tagId);
  if (!alive()) return;
  var filter = "all", view = [], shown = 0, gen = 0, loading = false;

  async function recompute() {
    var seqs = prefs.order === "group" ? sortedList(tagId, list) : list;
    if (filter === "all") { view = seqs; return; }
    if ((filter === "read" && !State.nRead) || (filter === "fav" && !State.nFav)) { view = []; return; }
    if (filter === "unread" && !State.nRead) { view = seqs; return; }
    var ids = await getIds();
    view = seqs.filter(function (s) {
      var st = State.map.get(ids[s]), r = st && st.r, f = st && st.f;
      return filter === "fav" ? f : (filter === "read" ? r : !r);
    });
  }

  var ring = ringEl(0, node.c), pctLine = h("div", null, pctText(0, node.c) + " " + T.completed);
  var qbox = h("div", { class: "qlist" });
  var more = h("button", { class: "more", type: "button", onclick: function () { loadMore(); } }, T.more);
  var refreshT = null;
  function refresh() {
    clearTimeout(refreshT);
    refreshT = setTimeout(function () {
      stats(tagId).then(function (s) { setRing(ring, s.read, node.c); pctLine.textContent = pctText(s.read, node.c) + " " + T.completed; }).catch(function () {});
    }, 120);
  }
  function applyToggles() {
    qbox.classList.toggle("show-ans", !!prefs.showAns);
    qbox.classList.toggle("show-exp", !!prefs.showExp);
  }
  function sw(label, key) {
    var inp = h("input", { type: "checkbox", "data-key": key });
    inp.checked = !!prefs[key];
    inp.addEventListener("change", function () { prefs[key] = inp.checked; savePrefs(); applyToggles(); });
    return h("label", { class: "sw" }, label, inp);
  }
  function radio(label, val) {
    var r = h("input", { type: "radio", name: "flt", value: val });
    if (val === "all") r.checked = true;
    r.addEventListener("change", async function () { filter = val; await recompute(); renderList(); });
    return h("label", null, r, label);
  }
  var orderSel = h("select", { class: "order" },
    h("option", { value: "group" }, T.oGroup), h("option", { value: "app" }, T.oApp));
  orderSel.value = prefs.order;
  orderSel.addEventListener("change", async function () { prefs.order = orderSel.value; savePrefs(); await recompute(); renderList(); });

  clear(app);
  var path = pathOf(tagId);
  app.appendChild(h("div", { class: "crumbs" }, h("a", { href: "#/" }, "Home"),
    path.map(function (x, i) { return [" › ", i < path.length - 1 ? h("a", { href: "#/t/" + x.i }, x.n) : h("span", null, x.n)]; })));
  var wide = !window.matchMedia || window.matchMedia("(min-width: 960px)").matches;
  var filters = h("details", { class: "filters", open: wide }, h("summary", null, T.filter),
    radio(T.fAll, "all"), radio(T.fFav, "fav"), radio(T.fRead, "read"), radio(T.fUnread, "unread"),
    h("h4", null, T.order), orderSel);
  app.appendChild(h("div", { class: "qpage" },
    h("aside", { class: "panel" },
      h("div", { class: "prog" }, h("div", null, h("b", null, T.progress)), ring, pctLine),
      h("div", { class: "opts" }, sw(T.showAns, "showAns"), sw(T.showExp, "showExp"), filters, offlineBtn(tagId))),
    h("div", { class: "qmain" }, qbox, more)));
  applyToggles();
  refresh();

  function updateMore() {
    more.hidden = shown >= view.length;
    more.textContent = T.more + " (" + shown + " / " + view.length + ")";
  }
  async function loadMore() {
    if (loading || shown >= view.length) return;
    loading = true;
    var my = gen;
    try {
      var slice = view.slice(shown, shown + CFG.PAGE);
      var qs = await getQuestions(slice);
      if (my !== gen || !alive()) return;
      qs.forEach(function (q) { qbox.appendChild(qCard(q, refresh)); });
      shown += slice.length;
      if (shown < view.length) getQuestions(view.slice(shown, shown + CFG.PAGE)).catch(function () {});
    } catch (e) {
      more.hidden = false;
      more.textContent = (navigator.onLine === false ? "You are offline and this part is not saved on this device. " : "Could not load (" + e.message + "). ") + "Tap to retry.";
      loading = false; return;
    }
    loading = false;
    updateMore();
  }
  function renderList() {
    gen++; loading = false; shown = 0;
    clear(qbox);
    if (!view.length) { qbox.appendChild(h("p", { class: "muted" }, T.none)); more.hidden = true; return; }
    loadMore();
  }
  await recompute();
  renderList();
  if (window.IntersectionObserver) {
    new IntersectionObserver(function (es) { if (es.some(function (e) { return e.isIntersecting; })) loadMore(); }, { rootMargin: "700px" }).observe(more);
  }
}

function pickQuiz(list, n, size) {
  var groups = {};
  list.forEach(function (s) { var c = Math.floor(s / size); (groups[c] = groups[c] || []).push(s); });
  var keys = shuffle(Object.keys(groups)), pool = [];
  for (var i = 0; i < keys.length && (pool.length < n * 2 || i < 3) && i < 10; i++) pool = pool.concat(groups[keys[i]]);
  return shuffle(pool).slice(0, n);
}

async function viewQuiz(tagId, alive) {
  await getTree();
  var node = nodes.get(tagId);
  var list = await getList(tagId), meta = await getMeta();
  if (!alive()) return;
  var box = h("div", { class: "quiz" });
  clear(app);
  app.appendChild(h("div", { class: "crumbs" }, h("a", { href: "#/" }, "Home"), " › ", h("a", { href: "#/q/" + tagId }, node.n), " › " + T.quiz));
  app.appendChild(box);
  if (!list.length) { box.appendChild(h("p", { class: "muted" }, T.none)); return; }

  function setup() {
    clear(box);
    var row = h("div", { class: "btns" });
    [10, 20, 30, 50].forEach(function (n) {
      if (n > list.length && n !== 10) return;
      row.appendChild(h("button", { class: "btn b1", type: "button", onclick: function () { begin(n); } }, String(Math.min(n, list.length))));
    });
    box.appendChild(h("div", { class: "setup" }, h("h2", null, node.n), h("p", null, T.quizHow), row));
  }
  async function begin(n) {
    clear(box); box.appendChild(h("p", { class: "muted" }, "Loading…"));
    try {
      var picked = pickQuiz(list, Math.min(n, list.length), meta.chunk);
      var qs = await getQuestions(picked);
      if (!alive()) return;
      run(qs);
    } catch (e) { clear(box); box.appendChild(h("p", null, "Could not load questions: " + e.message)); }
  }
  function run(qs) {
    var i = 0, score = 0, wrong = [];
    function show() {
      var q = qs[i], done = false, opts = [];
      clear(box);
      var correct = q.a ? q.a - 1 : -1;
      var fb = h("div");
      var nextBtn = h("button", { class: "btn b1 next", type: "button", hidden: true, onclick: function () {
        i++; if (i < qs.length) show(); else results();
      } }, i === qs.length - 1 ? T.finish : T.next);
      function pick(n) {
        if (done) return;
        done = true;
        State.set(q.i, { r: 1, c: State.get(q.i).c || n });
        if (n === q.a) score++; else { wrong.push(q); if (opts[n - 1]) opts[n - 1].classList.add("wrong"); }
        opts.forEach(function (o) { o.classList.add("locked"); });
        box.classList.add("show-ans"); box.classList.add("show-exp");
        fb.appendChild(h("div", { class: "exp", html: q.e ? clean(q.e) : "<i>" + T.noExp + "</i>" }));
        nextBtn.hidden = false;
      }
      q.o.forEach(function (t, k) {
        var o = h("div", { class: "opt" + (k === correct ? " correct" : ""), role: "button", tabindex: "0" },
          h("span", { class: "lab" }, LAB[k] || String(k + 1)), h("div", { class: "txt", html: clean(t) }));
        o.addEventListener("click", function () { pick(k + 1); });
        opts.push(o);
      });
      box.classList.remove("show-ans"); box.classList.remove("show-exp");
      box.appendChild(h("div", { class: "head" }, h("span", null, (i + 1) + " / " + qs.length), h("span", null, "Score " + score)));
      box.appendChild(h("div", { class: "qtext", html: clean(q.q) }));
      opts.forEach(function (o) { box.appendChild(o); });
      box.appendChild(fb); box.appendChild(nextBtn);
    }
    function results() {
      clear(box); box.classList.remove("show-ans"); box.classList.remove("show-exp");
      box.appendChild(h("div", { class: "result" }, "Score: " + score + " / " + qs.length + "  (" + pctText(score, qs.length) + ")"));
      var btns = h("div", { class: "btns" },
        h("button", { class: "btn b1", type: "button", onclick: setup }, T.again),
        link(T.back, "#/q/" + tagId, "b2"));
      box.appendChild(btns);
      wrong.forEach(function (q) {
        var ci = q.a ? q.a - 1 : -1;
        box.appendChild(h("div", { class: "wrongitem" }, h("div", { html: clean(q.q) }),
          ci >= 0 ? h("div", { class: "muted" }, "✔ " + (LAB[ci] || (ci + 1)) + ". ", h("span", { html: clean(q.o[ci]) })) : null));
      });
    }
    show();
  }
  setup();
}

/* ---------- menu, theme, router ---------- */
function applyTheme(t) {
  document.documentElement.setAttribute("data-theme", t);
  try { localStorage.setItem("mcq-theme", t); } catch (e) {}
}
(function () {
  var t = null;
  try { t = localStorage.getItem("mcq-theme"); } catch (e) {}
  if (!t) t = (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) ? "dark" : "light";
  applyTheme(t);
})();
document.getElementById("theme").addEventListener("click", function () {
  applyTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark");
});
document.getElementById("title").textContent = CFG.TITLE;
document.title = CFG.TITLE;
document.getElementById("back").addEventListener("click", function () {
  if (history.length > 1) history.back(); else location.hash = "#/";
});

var sheet = document.getElementById("sheet");
function openMenu() {
  clear(sheet);
  var file = h("input", { type: "file", accept: "application/json,.json", hidden: true });
  file.addEventListener("change", function () {
    if (!file.files[0]) return;
    var rd = new FileReader();
    rd.onload = function () {
      try { alert(State.importData(String(rd.result)) + " items imported."); location.reload(); }
      catch (e) { alert("Import failed: " + e.message); }
    };
    rd.readAsText(file.files[0]);
  });
  var info = h("small", null, "");
  getMeta().then(function (m) { info.textContent = m.questions + " questions · built " + m.built; }).catch(function () {});
  sheet.appendChild(h("div", { class: "box" },
    h("h3", null, CFG.TITLE),
    h("button", { type: "button", onclick: function () {
      var blob = new Blob([State.exportData()], { type: "application/json" });
      var a = h("a", { href: URL.createObjectURL(blob), download: "mcq-progress.json" });
      document.body.appendChild(a); a.click(); a.remove();
    } }, T.exportT),
    h("button", { type: "button", onclick: function () { file.click(); } }, T.importT), file,
    h("button", { class: "danger", type: "button", onclick: function () {
      if (confirm("Delete all read marks and favourites on this device?")) { State.clearAll(); location.reload(); }
    } }, T.resetT),
    Offline.ok ? h("button", { type: "button", onclick: openManager }, T.offMenu) : null,
    h("button", { type: "button", onclick: function () { sheet.hidden = true; } }, "Close"), info));
  sheet.hidden = false;
}
document.getElementById("menu").addEventListener("click", openMenu);
sheet.addEventListener("click", function (e) { if (e.target === sheet) sheet.hidden = true; });

var token = 0;
async function route() {
  var my = ++token;
  function alive() { return my === token; }
  sheet.hidden = true;
  var hash = location.hash || "#/";
  var m = hash.match(/^#\/(t|q|quiz)\/(\d+)/);
  document.getElementById("back").hidden = !m;
  try {
    await State.ready;
    Offline.checkBuild();
    if (!m) await viewTopics(null, alive);
    else if (m[1] === "t") { await getTree(); await viewTopics(Number(m[2]), alive); }
    else if (m[1] === "q") await viewQuestions(Number(m[2]), alive);
    else await viewQuiz(Number(m[2]), alive);
    if (alive()) window.scrollTo(0, 0);
  } catch (e) {
    if (!alive()) return;
    clear(app);
    app.appendChild(h("p", null, navigator.onLine === false
      ? "You are offline, and this page was not saved on this device. Open it once online and tap “Save for offline”."
      : "Could not load: " + e.message));
    app.appendChild(h("button", { class: "more", type: "button", onclick: route }, "Retry"));
  }
}
State.ready = State.init().then(function () { return Offline.init(); });
(function () {
  var net = document.getElementById("net");
  function paint() { if (net) net.hidden = navigator.onLine !== false; }
  window.addEventListener("online", paint); window.addEventListener("offline", paint); paint();
  if ("serviceWorker" in navigator && CFG.OFFLINE !== false && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
    window.addEventListener("load", function () { navigator.serviceWorker.register("sw.js").catch(function () {}); });
  }
})();
window.addEventListener("hashchange", route);
window.__mcq = { clean: clean, State: State, route: route, prefs: prefs, Offline: Offline, scanImages: scanImages };
route();
})();
