import { db } from './firebase-init.js';
import { initLang, setLang, t, getLang } from './i18n.js';
import { $, el, nameOf } from './util.js';
import { collection, getDocs } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

let tests = [], cats = [], best = {};
document.querySelectorAll('.lang button').forEach(b => b.addEventListener('click', async () => { await setLang(b.dataset.lang); fill(); render(); }));
await initLang();
const [tt, c, l, p] = await Promise.all(['diagnostic_tests', 'diagnostic_categories', 'labs', 'lab_pricing'].map(n => getDocs(collection(db, n))));
tests = tt.docs.map(d => ({ id: d.id, ...d.data() })).filter(x => x.active !== false);
cats = c.docs.map(d => ({ id: d.id, ...d.data() }));
const liveLabs = new Set(l.docs.filter(d => d.data().verified === true && d.data().active !== false).map(d => d.id));
for (const d of p.docs) { // cheapest real price per test, only from verified labs
  const x = d.data(); if (!liveLabs.has(x.labUid) || x.active === false) continue;
  const b = best[x.testId] ||= { min: Infinity, n: 0 }; b.min = Math.min(b.min, x.price); b.n++;
}
function fill() { const s = $('cat'), v = s.value; s.replaceChildren(new Option(t('tt.allCats'), '')); cats.forEach(k => s.add(new Option(nameOf(k, getLang()), k.id))); s.value = v; }
function render() {
  const q = $('q').value.trim().toLowerCase(), cat = $('cat').value;
  const list = tests.filter(x => (!cat || x.category === cat) && (!q || `${x.name_en} ${x.name_hi || ''}`.toLowerCase().includes(q))).sort((a, b) => a.name_en.localeCompare(b.name_en));
  $('empty').hidden = list.length > 0; $('empty').textContent = t(tests.length ? 'tt.noMatch' : 'tt.empty');
  const box = $('list'); box.replaceChildren();
  for (const x of list) {
    const c = el('a', 'card dr'); c.href = `/compare.html?t=${encodeURIComponent(x.id)}`;
    const b = best[x.id];
    c.append(el('h3', '', nameOf(x, getLang())), el('p', 'meta', nameOf(cats.find(k => k.id === x.category) || { name_en: '' }, getLang())),
      el('p', b ? 'fee' : 'meta', b ? t('tt.from').replace('{p}', b.min).replace('{n}', b.n) : t('tt.noLab')));
    box.append(c);
  }
}
['q', 'cat'].forEach(id => $(id).addEventListener('input', render));
fill(); render();
