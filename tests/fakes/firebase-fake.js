// In-memory stand-ins for firebase-admin and firebase-functions so functions/index.js can run unchanged in tests.
class Timestamp { constructor(ms) { this._ms = ms; this.seconds = Math.floor(ms / 1000); } toMillis() { return this._ms; } toDate() { return new Date(this._ms); }
  static now() { return new Timestamp(Date.now()); } static fromMillis(ms) { return new Timestamp(ms); } static fromDate(d) { return new Timestamp(d.getTime()); } }
const SV = { __op: 'ts' };
const FieldValue = { serverTimestamp: () => SV, increment: (n) => ({ __op: 'inc', n }), arrayUnion: (...els) => ({ __op: 'union', els }), delete: () => ({ __op: 'del' }) };
const isTs = (o) => o instanceof Timestamp;
const clone = (o) => { if (o == null || typeof o !== 'object' || isTs(o)) return o; if (o.__op) return o; if (Array.isArray(o)) return o.map(clone); return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, clone(v)])); };
const same = (a, b) => JSON.stringify(a, (k, v) => (isTs(v) ? { t: v._ms } : v)) === JSON.stringify(b, (k, v) => (isTs(v) ? { t: v._ms } : v));
function resolve(old, patch) { const out = { ...(old || {}) }; for (const [k, v] of Object.entries(patch)) {
  if (v && v.__op === 'ts') out[k] = Timestamp.now(); else if (v && v.__op === 'inc') out[k] = (out[k] || 0) + v.n; else if (v && v.__op === 'del') delete out[k];
  else if (v && v.__op === 'union') { const cur = Array.isArray(out[k]) ? out[k].slice() : []; for (const e of v.els) if (!cur.some(x => same(x, e))) cur.push(e); out[k] = cur; }
  else out[k] = fin(v); } return out; }
const fin = (o) => { if (o == null || typeof o !== 'object' || isTs(o)) return o; if (o.__op === 'ts') return Timestamp.now(); if (Array.isArray(o)) return o.map(fin); return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, fin(v)])); };
class Fake {
  constructor() { this.m = new Map(); this.writes = []; }
  reset() { this.m.clear(); this.writes = []; }
  seed(path, data) { this.m.set(path, resolve({}, clone(data))); }
  get(path) { return this.m.get(path); }
  snap(path) { const d = this.m.get(path); return { id: path.split('/').pop(), exists: d !== undefined, data: () => (d === undefined ? undefined : clone(d)), ref: this.doc(path) }; }
  doc(path) { const f = this; return { path, id: path.split('/').pop(), get: async () => f.snap(path), set: async (d, o) => f._write(path, 'set', d, o), update: async (d) => f._write(path, 'update', d), delete: async () => f._write(path, 'delete') }; }
  _write(path, kind, d, o) {
    if (kind === 'delete') { this.m.delete(path); this.writes.push({ path, kind }); return; }
    if (kind === 'update' && !this.m.has(path)) { const e = new Error('NOT_FOUND: no document to update: ' + path); e.code = 5; throw e; }
    const old = this.m.get(path); this.m.set(path, kind === 'set' && !(o && o.merge) ? resolve({}, d) : resolve(old, d)); this.writes.push({ path, kind, data: d });
  }
  collection(name) { const f = this; const mk = (filters, lim) => ({
    where: (fl, op, v) => mk([...filters, [fl, op, v]], lim), limit: (n) => mk(filters, n), orderBy: () => mk(filters, lim),
    get: async () => { let rows = [...f.m.keys()].filter(k => k.startsWith(name + '/') && !k.slice(name.length + 1).includes('/')); rows = rows.filter(k => filters.every(([fl, op, v]) => { const x = fl.split('.').reduce((a, p) => (a == null ? undefined : a[p]), f.m.get(k)); return op === '==' ? x === v : op === '>=' ? x >= v : op === '<=' ? x <= v : false; })); if (lim) rows = rows.slice(0, lim); const docs = rows.map(k => f.snap(k)); return { docs, size: docs.length, empty: !docs.length, forEach: (fn) => docs.forEach(fn) }; },
    count: () => ({ get: async () => ({ data: () => ({ count: [...f.m.keys()].filter(k => k.startsWith(name + '/') && filters.every(([fl, op, v]) => f.m.get(k)[fl] === v)).length }) }) }) });
    return Object.assign(mk([], 0), { doc: (id) => f.doc(`${name}/${id ?? 'auto' + Math.random().toString(36).slice(2, 10)}`), add: async (d) => { const id = 'auto' + Math.random().toString(36).slice(2, 10); f._write(`${name}/${id}`, 'set', d); return f.doc(`${name}/${id}`); } }); }
  async runTransaction(fn) { // reads must come before writes (as in real Firestore); writes apply together at the end
    const f = this, buf = []; let wrote = false;
    const tx = { get: async (r) => { if (wrote) throw new Error('Firestore transactions require all reads to be executed before all writes.'); return r.get ? r.get() : r; },
      set: (r, d, o) => { wrote = true; buf.push(() => f._write(r.path, 'set', d, o)); return tx; }, update: (r, d) => { wrote = true; buf.push(() => f._write(r.path, 'update', d)); return tx; }, delete: (r) => { wrote = true; buf.push(() => f._write(r.path, 'delete')); return tx; } };
    const out = await fn(tx); buf.forEach(b => b()); return out; }
}
const db = new Fake();
const users = new Map();
const auth = { getUser: async (uid) => { const u = users.get(uid); if (!u) { const e = new Error('no user'); e.code = 'auth/user-not-found'; throw e; } return { ...u }; },
  getUserByEmail: async (email) => { const u = [...users.values()].find(x => x.email === email); if (!u) { const e = new Error('no user'); e.code = 'auth/user-not-found'; throw e; } return { ...u }; },
  setCustomUserClaims: async (uid, c) => { users.get(uid).customClaims = c; }, updateUser: async (uid, p) => Object.assign(users.get(uid), p), revokeRefreshTokens: async (uid) => { users.get(uid).revoked = true; } };
const files = new Map();
const bucketObj = { exists: async () => [true], file: (p) => ({ exists: async () => [files.has(p)], download: async () => [files.get(p).buf], getMetadata: async () => [{ contentType: files.get(p).contentType }] }) };
const admin = { initializeApp: () => {}, firestore: Object.assign(() => db, { FieldValue, Timestamp }), auth: () => auth, storage: () => ({ bucket: () => bucketObj }) };
class HttpsError extends Error { constructor(code, message) { super(message); this.code = code; } }
const param = (n, o = {}) => ({ value: () => process.env[n] ?? o.default ?? '' });
module.exports = { Timestamp, FieldValue, db, users, files, admin,
  https: { onCall: (a, b) => (b || a), onRequest: (a, b) => (b || a), HttpsError },
  params: { defineString: param, defineSecret: (n) => ({ value: () => process.env[n] ?? '' }) }, scheduler: { onSchedule: (a, b) => b } };
