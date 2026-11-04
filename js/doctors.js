import { db } from './firebase-init.js';
import { initLang, setLang, t, getLang } from './i18n.js';
import { auth } from './firebase-init.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { collection, getDocs, query, where } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

const $ = (id) => document.getElementById(id);
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
let docs = [], sched = {}, specs = {};
const specName = (id) => { const s = specs[id]; return !s ? '' : (getLang() === 'hi' && s.name_hi ? s.name_hi : s.name_en); };

document.querySelectorAll('.lang button').forEach(b => b.addEventListener('click', async () => { await setLang(b.dataset.lang); fillFilters(); render(); }));
await initLang();
const loggedIn = await new Promise(r => { const u = onAuthStateChanged(auth, x => { u(); r(!!x); }); });
const [d, s, sp] = await Promise.all([getDocs(collection(db, 'doctors')), getDocs(collection(db, 'doctor_schedules')), getDocs(collection(db, 'specialities'))]);
docs = d.docs.map(x => ({ id: x.id, ...x.data() })).filter(x => x.verified === true && x.active !== false);
const reviewsBy = {};
try { (await getDocs(query(collection(db, 'reviews'), where('status', '==', 'published')))).docs.forEach(r => { const v = r.data(); if (v.kind === 'doctor') (reviewsBy[v.targetUid] ||= []).push(v); }); } catch {}
s.docs.forEach(x => sched[x.id] = x.data());
sp.docs.forEach(x => specs[x.id] = x.data());

function fillFilters() {
  const keep = (sel, fn) => { const v = sel.value; fn(); sel.value = v; };
  keep($('spec'), () => { $('spec').replaceChildren(new Option(t('dr.allSpec'), '')); [...new Set(docs.map(x => x.speciality))].sort((a, b) => specName(a).localeCompare(specName(b))).forEach(id => $('spec').add(new Option(specName(id), id))); });
  keep($('lang'), () => { $('lang').replaceChildren(new Option(t('dr.allLang'), '')); [...new Set(docs.flatMap(x => x.languages || []))].sort().forEach(l => $('lang').add(new Option(l, l))); });
}
const line = (cls, text) => { const p = document.createElement('p'); p.className = cls; p.textContent = text; return p; };
function timings(id) {
  const w = sched[id]?.weekly; if (!w) return null;
  return DAYS.filter(x => w[x]?.length).map(x => `${t('day.' + x)}: ${w[x].map(r => `${r.start}–${r.end}`).join(', ')}`);
}
function render() {
  const q = $('q').value.trim().toLowerCase(), sp = $('spec').value, lg = $('lang').value, mf = Number($('maxfee').value);
  let list = docs.filter(x => (!q || `${x.name} ${x.clinicName} ${x.address}`.toLowerCase().includes(q)) && (!sp || x.speciality === sp)
    && (!lg || (x.languages || []).includes(lg)) && (!mf || x.fee <= mf));
  const by = $('sort').value;
  list.sort((a, b) => by === 'fee' ? a.fee - b.fee : by === 'rating' ? ((b.ratingCount ? b.ratingSum / b.ratingCount : 0) - (a.ratingCount ? a.ratingSum / a.ratingCount : 0)) : by === 'exp' ? b.experience - a.experience : a.name.localeCompare(b.name));
  $('empty').hidden = list.length > 0;
  $('empty').textContent = t(docs.length ? 'dr.noMatch' : 'dr.empty');
  const box = $('list'); box.replaceChildren();
  for (const x of list) {
    const c = document.createElement('article'); c.className = 'card dr';
    const h = document.createElement('h3'); h.append(document.createTextNode(x.name));
    const v = document.createElement('span'); v.className = 'badge'; v.textContent = t('dr.verified'); h.append(v);
    c.append(h, line('meta', `${specName(x.speciality)} · ${x.qualification}`),
      line('', t('dr.exp').replace('{n}', x.experience)), line('fee', t('dr.fee').replace('{n}', x.fee)),
      line('meta', `${x.clinicName}, ${x.address}`),
      line('meta', t('dr.reg').replace('{n}', x.regNumber).replace('{c}', x.council)));
    { const rc = x.ratingCount || 0; c.append(line('meta', rc ? t('rv.avg').replace('{a}', (x.ratingSum / rc).toFixed(1)).replace('{n}', rc) : t('rv.none'))); }
    if (x.languages?.length) c.append(line('meta', x.languages.join(', ')));
    const rvs = (reviewsBy[x.id] || []).filter(v => v.comment).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)).slice(0, 5);
    if (rvs.length) { const rd = document.createElement('details'), rsm = document.createElement('summary'); rsm.textContent = t('rv.reviews'); rd.append(rsm); rvs.forEach(v => { const p = line('meta', `${'★'.repeat(v.rating)} ${v.comment}`); p.style.whiteSpace = 'pre-wrap'; rd.append(p); }); c.append(rd); }
    const tm = timings(x.id), det = document.createElement('details'), sm = document.createElement('summary');
    sm.textContent = t('dr.avail'); det.append(sm);
    if (tm?.length) tm.forEach(l => det.append(line('', l))); else det.append(line('meta', t('dr.noSched')));
    c.append(det);
    if (tm?.length) {
      const a = document.createElement('a'); a.className = 'btn btn-primary';
      a.href = loggedIn ? `/book.html?d=${encodeURIComponent(x.id)}` : '/auth.html';
      a.textContent = t(loggedIn ? 'bk.book' : 'bk.loginToBook'); c.append(a);
    } else c.append(line('tag', t('dr.noBook')));
    box.append(c);
  }
}
['q', 'spec', 'lang', 'maxfee', 'sort'].forEach(id => $(id).addEventListener('input', render));
fillFilters(); render();
