const express = require("express"), fs = require("fs"), path = require("path");
const bcrypt = require("bcryptjs"), jwt = require("jsonwebtoken");

const PROD = process.env.NODE_ENV === "production" || !!process.env.VERCEL;
if (PROD && !process.env.JWT_SECRET) throw new Error("Set JWT_SECRET in production.");
const SECRET = process.env.JWT_SECRET || "dev-secret-change-me";

// Admin registration needs this secret code. In production there is no default.
const ADMIN_CODE = process.env.ADMIN_CODE || (PROD ? "" : "admin2026");
if (!ADMIN_CODE) console.warn("ADMIN_CODE not set: admin registration is disabled.");

/* ---------- Storage: Upstash Redis (Vercel) or local JSON file ---------- */
const RURL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const RTOK = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
let store;
if (RURL && RTOK) {
  const { Redis } = require("@upstash/redis");
  const r = new Redis({ url: RURL, token: RTOK });
  store = {
    getUser: u => r.get("jk:u:" + u),
    setUser: (u, o) => r.set("jk:u:" + u, o),
    async createUser(u, o) { return (await r.set("jk:u:" + u, o, { nx: true })) === "OK"; },
    async saves() {
      const ids = await r.lrange("jk:saves", 0, -1);
      if (!ids.length) return [];
      return (await r.mget(...ids.map(i => "jk:s:" + i))).filter(Boolean);
    },
    getSave: id => r.get("jk:s:" + id),
    async addSave(s) { await r.set("jk:s:" + s.id, s); await r.lpush("jk:saves", s.id); },
    putSave: s => r.set("jk:s:" + s.id, s),
    async delSave(id) { await r.lrem("jk:saves", 0, id); await r.del("jk:s:" + id); }
  };
  console.log("Storage: Upstash Redis");
} else {
  if (process.env.VERCEL) console.warn("WARNING: no Redis configured on Vercel; data will not persist.");
  const DIR = process.env.DATA_DIR || (process.env.VERCEL ? "/tmp" : path.join(__dirname, "data"));
  const FILE = path.join(DIR, "db.json");
  fs.mkdirSync(DIR, { recursive: true });
  let db = { users: {}, saves: [] };
  try { db = JSON.parse(fs.readFileSync(FILE, "utf8")); } catch (e) {}
  const flush = () => { fs.writeFileSync(FILE + ".tmp", JSON.stringify(db)); fs.renameSync(FILE + ".tmp", FILE); };
  store = {
    getUser: async u => db.users[u] || null,
    setUser: async (u, o) => { db.users[u] = o; flush(); },
    async createUser(u, o) { if (db.users[u]) return false; db.users[u] = o; flush(); return true; },
    saves: async () => db.saves,
    getSave: async id => db.saves.find(x => x.id === id) || null,
    async addSave(s) { db.saves.unshift(s); flush(); },
    async putSave(s) { const i = db.saves.findIndex(x => x.id === s.id); if (i >= 0) db.saves[i] = s; flush(); },
    async delSave(id) { db.saves = db.saves.filter(x => x.id !== id); flush(); }
  };
  console.log("Storage: local file " + FILE);
}

// Optional fixed admin from ADMIN_USER + ADMIN_PASS
const ready = (async () => {
  if (!process.env.ADMIN_PASS) return;
  const AU = (process.env.ADMIN_USER || "admin").toLowerCase();
  const old = (await store.getUser(AU)) || { sheet: [] };
  await store.setUser(AU, { ...old, hash: bcrypt.hashSync(process.env.ADMIN_PASS, 10), role: "admin" });
})();

/* ---------- helpers ---------- */
const FIELDS = ["date", "item", "open", "inn", "sales", "system", "debt"];
const clean = rows => (Array.isArray(rows) ? rows : []).slice(0, 2000).map(r => {
  const o = {}; FIELDS.forEach(f => o[f] = String((r && r[f]) ?? "").slice(0, 80)); return o;
});
const token = u => jwt.sign({ u }, SECRET, { expiresIn: "30d" });
const wrap = fn => (req, res, next) => fn(req, res, next).catch(e => { console.error(e); res.status(500).json({ error: "err" }); });
const auth = wrap(async (req, res, next) => {
  let p;
  try { p = jwt.verify((req.headers.authorization || "").slice(7), SECRET); } catch (e) { return res.status(401).json({ error: "auth" }); }
  const acc = await store.getUser(p.u);
  if (!acc) return res.status(401).json({ error: "auth" });
  req.u = p.u; req.acc = acc; req.role = acc.role; next();
});
const adminOnly = (req, res, next) => req.role === "admin" ? next() : res.status(403).json({ error: "forbidden" });

/* ---------- app ---------- */
const app = express();
app.use(express.json({ limit: "2mb" }));
app.use((q, s, n) => ready.then(() => n(), n));

app.post("/api/register", wrap(async (req, res) => {
  const u = String(req.body.username || "").trim().toLowerCase(), p = String(req.body.password || "");
  if (!/^[a-z0-9_.-]{2,30}$/.test(u) || p.length < 4) return res.status(400).json({ error: "short" });
  const wantAdmin = req.body.role === "admin";
  if (wantAdmin && !(ADMIN_CODE && String(req.body.code || "") === ADMIN_CODE)) return res.status(403).json({ error: "badcode" });
  const ok = await store.createUser(u, { hash: bcrypt.hashSync(p, 10), role: wantAdmin ? "admin" : "user", sheet: [] });
  if (!ok) return res.status(409).json({ error: "exists" });
  res.json({ token: token(u), user: { username: u, role: wantAdmin ? "admin" : "user" } });
}));
app.post("/api/login", wrap(async (req, res) => {
  const u = String(req.body.username || "").trim().toLowerCase(), p = String(req.body.password || "");
  const acc = await store.getUser(u);
  if (!acc || !bcrypt.compareSync(p, acc.hash)) return res.status(401).json({ error: "bad" });
  if (acc.role !== (req.body.role === "admin" ? "admin" : "user")) return res.status(403).json({ error: "role" });
  res.json({ token: token(u), user: { username: u, role: acc.role } });
}));
app.get("/api/me", auth, (req, res) => res.json({ username: req.u, role: req.role }));

// Working sheet (each user's own)
app.get("/api/sheet", auth, (req, res) => res.json({ rows: req.acc.sheet || [] }));
app.put("/api/sheet", auth, wrap(async (req, res) => {
  req.acc.sheet = clean(req.body.rows); await store.setUser(req.u, req.acc); res.json({ ok: 1 });
}));

// Saved records: users see their own, admin sees everyone's
app.get("/api/saves", auth, wrap(async (req, res) =>
  res.json({ saves: (await store.saves()).filter(s => req.role === "admin" || s.owner === req.u) })));
app.post("/api/saves", auth, wrap(async (req, res) => {
  const s = { id: "s" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), owner: req.u,
    name: String(req.body.name || "").trim().slice(0, 80) || new Date().toISOString().slice(0, 16).replace("T", " "),
    ts: Date.now(), rows: clean(req.body.rows) };
  await store.addSave(s); res.json(s);
}));
// Only admin can edit or delete saved records
app.put("/api/saves/:id", auth, adminOnly, wrap(async (req, res) => {
  const s = await store.getSave(req.params.id);
  if (!s) return res.status(404).json({ error: "nf" });
  s.rows = clean(req.body.rows);
  if (req.body.name) s.name = String(req.body.name).slice(0, 80);
  s.editedBy = req.u; s.editedTs = Date.now();
  await store.putSave(s); res.json(s);
}));
app.delete("/api/saves/:id", auth, adminOnly, wrap(async (req, res) => {
  await store.delSave(req.params.id); res.json({ ok: 1 });
}));

app.use(express.static(path.join(__dirname, "public")));

module.exports = app;
if (require.main === module) {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => console.log("JikoStock running on port " + PORT));
}
