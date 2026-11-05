import { db, functions } from './firebase-init.js';
import { t } from './i18n.js';
import { requireUser, say } from './guard.js';
import { $, el, ist } from './util.js';
import { collection, getDocs, getDoc, setDoc, addDoc, deleteDoc, doc, Timestamp, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js';

let banners = [], coupons = [], subs = [], providers = [];
const user = await requireUser(render);
if ((await user.getIdTokenResult(true)).claims.role !== 'admin') location.replace('/dashboard.html');
const call = (n, d) => httpsCallable(functions, n)(d);
const all = async (c) => (await getDocs(collection(db, c))).docs.map(d => ({ id: d.id, ...d.data() }));
async function load() {
  const [b, c, s, d, l, h] = await Promise.all([all('banners'), all('coupons'), all('subscriptions'), all('doctors'), all('labs'), all('hospitals')]);
  banners = b; coupons = c; subs = s;
  providers = [...d.map(x => ({ ...x, kind: 'doctor' })), ...l.map(x => ({ ...x, kind: 'lab' })), ...h.map(x => ({ ...x, kind: 'hospital' }))];
  render();
}
const row = (...kids) => { const r = el('div', 'row'); r.style.margin = '8px 0'; r.append(...kids); return r; };
const small = (label, cls, fn) => { const b = el('button', 'btn ' + cls, label); b.style.minHeight = '36px'; b.onclick = async () => { b.disabled = true; try { await fn(); await load(); } catch { say('msg', 'err.generic', false, t); b.disabled = false; } }; return b; };
function render() {
  const bl = $('bannerList'); bl.replaceChildren();
  for (const b of banners) bl.append(row(el('span', '', b.text_en), el('span', 'status' + (b.active ? '' : ' cancelled'), t(b.active ? 'adm.active' : 'adm.off')),
    small(t(b.active ? 'adm.turnOff' : 'adm.turnOn'), 'btn-ghost', () => setDoc(doc(db, 'banners', b.id), { active: !b.active }, { merge: true })), small(t('fam.remove'), 'btn-ghost danger', () => deleteDoc(doc(db, 'banners', b.id)))));
  const cl = $('couponList'); cl.replaceChildren();
  for (const c of coupons) cl.append(row(el('strong', '', c.code), el('span', '', `${c.type === 'percent' ? c.value + '%' : '₹' + c.value} · ${t('gr.used')} ${c.used || 0}${c.maxUses ? '/' + c.maxUses : ''}${c.expiresAt ? ' · ' + c.expiresAt.toDate().toISOString().slice(0, 10) : ''}`),
    el('span', 'status' + (c.active ? '' : ' cancelled'), t(c.active ? 'adm.active' : 'adm.off')), small(t(c.active ? 'adm.turnOff' : 'adm.turnOn'), 'btn-ghost', () => setDoc(doc(db, 'coupons', c.id), { active: !c.active }, { merge: true }))));
  const sw = $('s_who'), cur = sw.value; sw.replaceChildren(); providers.forEach(p => sw.add(new Option(`${t('role.' + p.kind)} · ${p.name}`, p.id))); sw.value = cur;
  const sl = $('subList'); sl.replaceChildren();
  for (const s of subs) { const p = providers.find(x => x.id === s.id); sl.append(row(el('span', '', `${p ? p.name : s.id} · ${s.plan || '-'} · ₹${s.amount ?? 0}`), el('span', 'status' + (s.status === 'active' ? '' : ' cancelled'), t('gr.st.' + s.status)),
    el('span', 'mini', s.expiresAt ? s.expiresAt.toDate().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }) : ''), s.status === 'active' ? small(t('gr.cancelSub'), 'btn-ghost danger', () => call('setSubscription', { providerUid: s.id, cancel: true })) : el('span'))); }
  const fl = $('featList'); fl.replaceChildren();
  for (const p of providers.sort((a, b) => a.name.localeCompare(b.name))) fl.append(row(el('span', '', `${t('role.' + p.kind)} · ${p.name}`), el('span', 'status' + (p.featured ? '' : ' cancelled'), t(p.featured ? 'gr.isFeatured' : 'adm.off')),
    small(t(p.featured ? 'gr.unfeature' : 'gr.feature'), 'btn-ghost', () => call('setFeatured', { kind: p.kind, id: p.id, featured: !p.featured }))));
}
$('addBanner').onclick = async () => {
  const text_en = $('b_en').value.trim(), link = $('b_link').value.trim();
  if (!text_en || (link && !/^(\/|https:\/\/)/.test(link))) return say('msg', 'gr.badBanner', false, t);
  try { await addDoc(collection(db, 'banners'), { text_en, text_hi: $('b_hi').value.trim(), link, active: true, createdAt: serverTimestamp() }); $('b_en').value = $('b_hi').value = $('b_link').value = ''; say('msg', 'adm.done', true, t); await load(); } catch { say('msg', 'err.generic', false, t); }
};
$('addCoupon').onclick = async () => {
  const code = $('c_code').value.trim().toUpperCase(), type = $('c_type').value, value = Number($('c_value').value), maxUses = $('c_max').value.trim() === '' ? 0 : Number($('c_max').value), exp = $('c_exp').value;
  if (!/^[A-Z0-9_-]{3,30}$/.test(code) || !(value > 0) || (type === 'percent' && value > 100) || value > 10000 || !Number.isInteger(maxUses) || maxUses < 0 || (exp && exp < ist().date)) return say('msg', 'gr.badCoupon', false, t);
  try {
    if ((await getDoc(doc(db, 'coupons', code))).exists()) return say('msg', 'adm.exists', false, t);
    await setDoc(doc(db, 'coupons', code), { code, type, value, maxUses, used: 0, expiresAt: exp ? Timestamp.fromDate(new Date(exp + 'T18:29:59Z')) : null, appliesTo: $('c_for').value, active: true, createdAt: serverTimestamp() });
    ['c_code', 'c_value', 'c_max', 'c_exp'].forEach(i => $(i).value = ''); say('msg', 'adm.done', true, t); await load();
  } catch { say('msg', 'err.generic', false, t); }
};
$('setSub').onclick = async () => {
  try { await call('setSubscription', { providerUid: $('s_who').value, plan: $('s_plan').value.trim(), amount: Number($('s_amount').value || 0), expiresAt: $('s_exp').value }); say('msg', 'adm.done', true, t); await load(); }
  catch { say('msg', 'gr.badSub', false, t); }
};
await load();
$('app').hidden = false;
