import { auth, db } from './firebase-init.js';
import { initLang, setLang, t, getLang } from './i18n.js';
import { $, el, nameOf } from './util.js';
import { doc, getDoc, getDocs, collection, query, where } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';

const tid = new URLSearchParams(location.search).get('t');
if (!tid) location.replace('/tests.html');
let test, rows = [], loggedIn = false;
document.querySelectorAll('.lang button').forEach(b => b.addEventListener('click', async () => { await setLang(b.dataset.lang); paint(); }));
await initLang();
loggedIn = await new Promise(r => { const u = onAuthStateChanged(auth, x => { u(); r(!!x); }); });
const ts = await getDoc(doc(db, 'diagnostic_tests', tid));
if (!ts.exists() || ts.data().active === false) location.replace('/tests.html');
test = ts.data();
const [pr, lb, cats] = await Promise.all([getDocs(query(collection(db, 'lab_pricing'), where('testId', '==', tid))), getDocs(collection(db, 'labs')), getDocs(collection(db, 'diagnostic_categories'))]);
const labs = Object.fromEntries(lb.docs.map(d => [d.id, d.data()]));
rows = pr.docs.map(d => d.data()).filter(p => p.active !== false && labs[p.labUid]?.verified === true && labs[p.labUid]?.active !== false).map(p => ({ ...p, lab: labs[p.labUid] }));
const catName = (id) => { const c = cats.docs.find(d => d.id === id); return c ? nameOf(c.data(), getLang()) : ''; };

function paint() {
  $('title').textContent = nameOf(test, getLang()); $('sub').textContent = catName(test.category);
  const info = $('info'); info.replaceChildren();
  const row = (k, v) => { info.append(el('p', '', `${t(k)}: ${v || t('cmp.notProvided')}`)); };
  if (test.description) info.append(el('p', '', test.description));
  row('cat.sample', test.sampleType); row('cat.fasting', test.fasting); row('cat.prep', test.preparation);
  info.append(el('p', 'mini', t('cmp.prepNote')));
  const by = $('sort').value;
  rows.sort((a, b) => by === 'price' ? a.price - b.price : a.turnaroundHours - b.turnaroundHours);
  $('empty').hidden = rows.length > 0; const box = $('list'); box.replaceChildren();
  for (const p of rows) {
    const c = el('article', 'card dr'), h = el('h3', '', p.lab.name); h.append(el('span', 'badge', t('dr.verified'))); c.append(h);
    const pe = el('p', 'price', `₹${p.price}`); if (p.originalPrice > p.price) { pe.append(el('s', '', `₹${p.originalPrice}`)); }
    c.append(pe);
    if (p.originalPrice > p.price) c.append(el('p', 'off', t('cmp.off').replace('{n}', Math.round((1 - p.price / p.originalPrice) * 100))));
    c.append(el('p', 'meta', t('cmp.tat').replace('{n}', p.turnaroundHours)), el('p', 'meta', `${p.lab.address} - ${p.lab.pin}`));
    if (p.lab.accreditationVerified && p.lab.accreditation) c.append(el('p', 'meta', t('cmp.accred').replace('{a}', p.lab.accreditation)));
    if (p.homeCollection && p.lab.homeCollection) c.append(el('span', 'tag', t('cmp.home')));
    const a = el('a', 'btn btn-primary', t(loggedIn ? 'cmp.book' : 'bk.loginToBook')); a.href = loggedIn ? `/book-test.html?l=${encodeURIComponent(p.labUid)}&t=${encodeURIComponent(tid)}` : '/auth.html'; c.append(a);
    box.append(c);
  }
}
$('sort').onchange = paint;
paint();
