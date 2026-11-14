// A tiny in-memory stand-in for the Firebase web SDK, driven by window.__SCENARIO. Only for testing the pages.
const S = window.__SCENARIO || {};
class Timestamp { constructor(s){ this.seconds = s; } toDate(){ return new Date(this.seconds*1000); } toMillis(){ return this.seconds*1000; }
  static now(){ return new Timestamp(Math.floor(Date.now()/1000)); } static fromDate(d){ return new Timestamp(Math.floor(d.getTime()/1000)); } static fromMillis(m){ return new Timestamp(Math.floor(m/1000)); } }
const revive = (o) => { if (o && typeof o === 'object') { if ('__ts' in o) return new Timestamp(o.__ts); for (const k of Object.keys(o)) o[k] = revive(o[k]); } return o; };
const store = new Map();
for (const [c, docs] of Object.entries(S.db || {})) for (const [id, d] of Object.entries(docs)) store.set(`${c}/${id}`, revive(JSON.parse(JSON.stringify(d))));
const calls = (window.__calls ||= []); const writes = (window.__writes ||= []);
const clone = (o) => { if (o == null || typeof o !== 'object') return o; if (o instanceof Timestamp) return new Timestamp(o.seconds); if (Array.isArray(o)) return o.map(clone); return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, clone(v)])); };
const SERVER_TS = { __server: true };
const fin = (o) => { if (o && typeof o === 'object' && !(o instanceof Timestamp)) { if (o.__server) return Timestamp.now(); const r = Array.isArray(o) ? [] : {}; for (const k of Object.keys(o)) r[k] = fin(o[k]); return r; } return o; };
export const serverTimestamp = () => SERVER_TS;
export { Timestamp };
// --- app / functions / storage ---
export const initializeApp = (c) => ({ config: c });
export const getFunctions = () => ({}); export const getStorage = () => ({});
export const ref = (_s, path) => ({ path }); export const uploadBytes = async (r, f) => { writes.push({ upload: r.path }); return {}; };
// --- auth ---
const listeners = new Set(); let user = null;
const mkUser = () => S.role ? { uid: S.uid, displayName: S.name || 'Test User', email: S.email || 'test@example.com', emailVerified: true,
  getIdToken: async () => 't', getIdTokenResult: async () => ({ claims: S.claims || { role: S.role } }) } : null;
user = mkUser();
export const getAuth = () => ({ get currentUser() { return user; } });
export const onAuthStateChanged = (_a, cb) => { listeners.add(cb); setTimeout(() => cb(user), 0); return () => listeners.delete(cb); };
export const signOut = async () => { user = null; listeners.forEach(f => f(null)); };
export const signInWithEmailAndPassword = async () => { user = mkUser() || { uid: 'x', displayName: 'New', getIdToken: async () => 't', getIdTokenResult: async () => ({ claims: { role: 'patient' } }) }; return { user }; };
export const createUserWithEmailAndPassword = signInWithEmailAndPassword; export const signInWithPopup = signInWithEmailAndPassword;
export class GoogleAuthProvider {} export const sendPasswordResetEmail = async () => {}; export const sendEmailVerification = async () => {}; export const updateProfile = async (u, p) => { window.__lastName = p.displayName; return Object.assign(u, p); };
// --- firestore ---
export const getFirestore = () => ({});
export const collection = (_db, path) => ({ __col: path });
export const doc = (a, ...p) => (a && a.__col ? { __doc: `${a.__col}/${p[0] ?? ('auto' + Math.random().toString(36).slice(2, 8))}` } : { __doc: p.join('/') });
const snap = (path, d) => ({ id: path.split('/').pop(), ref: { __doc: path }, exists: () => d !== undefined, data: () => clone(d) });
export const getDoc = async (r) => snap(r.__doc, store.get(r.__doc));
export const where = (f, op, v) => ({ t: 'where', f, op, v }); export const orderBy = (f, d = 'asc') => ({ t: 'order', f, d }); export const limit = (n) => ({ t: 'limit', n });
export const query = (c, ...cs) => ({ __q: c.__col, cs });
const val = (o, f) => f.split('.').reduce((x, k) => (x == null ? undefined : x[k]), o);
export const getDocs = async (q) => {
  const col = q.__col || q.__q, cs = q.cs || []; let rows = [...store.entries()].filter(([k]) => k.startsWith(col + '/') && !k.slice(col.length + 1).includes('/')).map(([k, d]) => [k, d]);
  for (const c of cs.filter(c => c.t === 'where')) rows = rows.filter(([, d]) => { const x = val(d, c.f); return c.op === '==' ? x === c.v : c.op === 'in' ? c.v.includes(x) : c.op === '>=' ? x >= c.v : c.op === '<=' ? x <= c.v : true; });
  for (const c of cs.filter(c => c.t === 'order')) rows.sort(([, a], [, b]) => { const x = val(a, c.f), y = val(b, c.f), xv = x?.seconds ?? x, yv = y?.seconds ?? y; return (xv > yv ? 1 : xv < yv ? -1 : 0) * (c.d === 'desc' ? -1 : 1); });
  const lim = cs.find(c => c.t === 'limit'); if (lim) rows = rows.slice(0, lim.n);
  const docs = rows.map(([k, d]) => snap(k, d)); return { docs, size: docs.length, empty: !docs.length, forEach: (f) => docs.forEach(f) };
};
const put = (path, data, merge) => { const d = fin(clone(data)); const old = store.get(path); store.set(path, merge && old ? { ...old, ...d } : d); writes.push({ path, data: d }); };
export const setDoc = async (r, d, o) => put(r.__doc, d, o?.merge);
export const addDoc = async (c, d) => { const id = 'new' + Math.random().toString(36).slice(2, 8); put(`${c.__col}/${id}`, d); return { id }; };
export const updateDoc = async (r, d) => { if (!store.has(r.__doc)) throw new Error('no such doc'); put(r.__doc, d, true); };
export const deleteDoc = async (r) => { store.delete(r.__doc); writes.push({ deleted: r.__doc }); };
export const writeBatch = () => { const ops = []; return { set: (r, d, o) => ops.push(() => put(r.__doc, d, o?.merge)), commit: async () => ops.forEach(f => f()) }; };
// --- functions ---
const DEFAULT = {
  ensureProfile: () => ({ role: S.role, name: window.__lastName || S.name || 'Test User' }), paymentConfig: () => ({ configured: false, enabled: false }), aiAvailable: () => ({ available: true, consent: false }),
  askAssistant: () => ({ text: 'Sample answer.' }), setAiConsent: () => ({ ok: true }),
  adminStats: () => ({ patients: 3, doctors: 2, labs: 1, hospitals: 1, appointments: { total: 5, pending: 1, confirmed: 2, completed: 1, cancelled: 1 }, diagnostics: { total: 2, reportReady: 1, cancelled: 0 }, pending: { doctors: 1, labs: 0, hospitals: 0 }, openTickets: 1 }),
  integrationStatus: () => ({ payments: { configured: false, enabled: false }, email: { configured: false, enabled: false }, ai: { configured: false, enabled: false } }),
  systemCheck: () => ({ checks: ['adminEmails', 'bucket', 'specialities', 'categories', 'tests', 'areas', 'doctors', 'labs', 'hospitals', 'paymentKeys', 'paymentWebhook', 'paymentOn', 'emailKey', 'aiKey', 'users'].map((k, i) => ({ key: k, ok: i % 3 !== 0, n: k === 'users' || i % 2 ? 4 : undefined })) }),
  exportMyData: () => ({ exportedAt: 'now', profile: {} }),
  getReportFile: () => ({ contentType: 'application/pdf', data: btoa('%PDF-1.4 test') }), getRecordFile: () => ({ contentType: 'application/pdf', data: btoa('%PDF-1.4 test') }),
  getApplicationDocument: () => ({ contentType: 'application/pdf', data: btoa('%PDF-1.4 test') }), getLabApplicationDocument: () => ({ contentType: 'application/pdf', data: btoa('%PDF-1.4 test') }), getHospitalApplicationDocument: () => ({ contentType: 'application/pdf', data: btoa('%PDF-1.4 test') }) };
export const httpsCallable = (_f, name) => async (data) => {
  calls.push({ name, data }); const err = (S.fnError || {})[name]; if (err) { const e = new Error(err); e.code = err; throw e; }
  const h = (S.fn || {})[name]; return { data: h !== undefined ? h : (DEFAULT[name] ? DEFAULT[name]() : { ok: true }) };
};
