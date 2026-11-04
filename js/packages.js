import { db } from './firebase-init.js';
import { initLang, setLang, t, getLang } from './i18n.js';
import { $, el, nameOf } from './util.js';
import { collection, getDocs } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

let pkgs = [], tests = [], best = {};
document.querySelectorAll('.lang button').forEach(b => b.addEventListener('click', async () => { await setLang(b.dataset.lang); render(); }));
await initLang();
const [p, tt, l, pp] = await Promise.all(['test_packages', 'diagnostic_tests', 'labs', 'lab_package_pricing'].map(n => getDocs(collection(db, n))));
pkgs = p.docs.map(d => ({ id: d.id, ...d.data() })).filter(x => x.active !== false); tests = tt.docs.map(d => ({ id: d.id, ...d.data() }));
const live = new Set(l.docs.filter(d => d.data().verified === true && d.data().active !== false).map(d => d.id));
for (const d of pp.docs) { const x = d.data(); if (!live.has(x.labUid) || x.active === false) continue; const b = best[x.packageId] ||= { min: Infinity, n: 0 }; b.min = Math.min(b.min, x.price); b.n++; }
function render() {
  $('empty').hidden = pkgs.length > 0; $('empty').textContent = t('pk.empty'); const box = $('list'); box.replaceChildren();
  for (const x of pkgs.sort((a, b) => a.name_en.localeCompare(b.name_en))) {
    const c = el('a', 'card dr'); c.href = `/package.html?p=${encodeURIComponent(x.id)}`; const b = best[x.id];
    c.append(el('h3', '', nameOf(x, getLang())), el('p', 'meta', t('pk.testCount').replace('{n}', (x.testIds || []).length)), el('p', b ? 'fee' : 'meta', b ? t('tt.from').replace('{p}', b.min).replace('{n}', b.n) : t('tt.noLab'))); box.append(c);
  }
}
render();
