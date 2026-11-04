import { auth, db } from './firebase-init.js';
import { initLang, setLang, t, getLang } from './i18n.js';
import { $, el, nameOf } from './util.js';
import { doc, getDoc, getDocs, collection, query, where } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';

const pid = new URLSearchParams(location.search).get('p');
if (!pid) location.replace('/packages.html');
let pkg, tests = [], rows = [], loggedIn = false;
document.querySelectorAll('.lang button').forEach(b => b.addEventListener('click', async () => { await setLang(b.dataset.lang); paint(); }));
await initLang();
loggedIn = await new Promise(r => { const u = onAuthStateChanged(auth, x => { u(); r(!!x); }); });
const ps = await getDoc(doc(db, 'test_packages', pid));
if (!ps.exists() || ps.data().active === false) location.replace('/packages.html');
pkg = ps.data();
const [pr, lb, tt] = await Promise.all([getDocs(query(collection(db, 'lab_package_pricing'), where('packageId', '==', pid))), getDocs(collection(db, 'labs')), getDocs(collection(db, 'diagnostic_tests'))]);
tests = tt.docs.map(d => ({ id: d.id, ...d.data() })); const labs = Object.fromEntries(lb.docs.map(d => [d.id, d.data()]));
rows = pr.docs.map(d => d.data()).filter(p => p.active !== false && labs[p.labUid]?.verified === true && labs[p.labUid]?.active !== false).map(p => ({ ...p, lab: labs[p.labUid] }));
function paint() {
  $('title').textContent = nameOf(pkg, getLang()); $('sub').textContent = pkg.description || '';
  const ul = $('incl'); ul.replaceChildren(); (pkg.testIds || []).forEach(id => { const x = tests.find(k => k.id === id); ul.append(el('li', '', x ? nameOf(x, getLang()) : id)); });
  const by = $('sort').value, avg = (r) => (r.lab.ratingCount ? r.lab.ratingSum / r.lab.ratingCount : 0);
  rows.sort((a, b) => by === 'price' ? a.price - b.price : by === 'rating' ? avg(b) - avg(a) : a.turnaroundHours - b.turnaroundHours);
  $('empty').hidden = rows.length > 0; const box = $('list'); box.replaceChildren();
  for (const p of rows) {
    const c = el('article', 'card dr'), h = el('h3', '', p.lab.name); h.append(el('span', 'badge', t('dr.verified'))); c.append(h);
    const pe = el('p', 'price', `₹${p.price}`); if (p.originalPrice > p.price) pe.append(el('s', '', `₹${p.originalPrice}`)); c.append(pe);
    if (p.originalPrice > p.price) c.append(el('p', 'off', t('cmp.off').replace('{n}', Math.round((1 - p.price / p.originalPrice) * 100))));
    c.append(el('p', 'meta', t('cmp.tat').replace('{n}', p.turnaroundHours)), el('p', 'meta', `${p.lab.address} - ${p.lab.pin}`), el('p', 'meta', p.lab.ratingCount ? t('rv.avg').replace('{a}', (p.lab.ratingSum / p.lab.ratingCount).toFixed(1)).replace('{n}', p.lab.ratingCount) : t('rv.none')));
    if (p.lab.accreditationVerified && p.lab.accreditation) c.append(el('p', 'meta', t('cmp.accred').replace('{a}', p.lab.accreditation)));
    if (p.homeCollection && p.lab.homeCollection) c.append(el('span', 'tag', t('cmp.home')));
    const a = el('a', 'btn btn-primary', t(loggedIn ? 'cmp.book' : 'bk.loginToBook')); a.href = loggedIn ? `/book-test.html?l=${encodeURIComponent(p.labUid)}&p=${encodeURIComponent(pid)}` : '/auth.html'; c.append(a); box.append(c);
  }
}
$('sort').onchange = paint; paint();
