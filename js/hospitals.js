import { db } from './firebase-init.js';
import { initLang, setLang, t } from './i18n.js';
import { $, el } from './util.js';
import { collection, getDocs, query, where } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

let hospitals = [], docsBy = {};
document.querySelectorAll('.lang button').forEach(b => b.addEventListener('click', async () => { await setLang(b.dataset.lang); render(); }));
await initLang();
const [h, l] = await Promise.all([getDocs(collection(db, 'hospitals')), getDocs(query(collection(db, 'hospital_links'), where('status', '==', 'active')))]);
hospitals = h.docs.map(d => ({ id: d.id, ...d.data() })).filter(x => x.verified === true && x.active !== false);
l.docs.forEach(d => (docsBy[d.data().hospitalUid] ||= []).push(d.data().doctorName));
function render() {
  const q = $('q').value.trim().toLowerCase(), ty = $('type').value;
  const list = hospitals.filter(x => (!ty || x.type === ty) && (!q || `${x.name} ${x.address} ${(x.departments || []).join(' ')}`.toLowerCase().includes(q))).sort((a, b) => a.name.localeCompare(b.name));
  $('empty').hidden = list.length > 0; $('empty').textContent = t(hospitals.length ? 'hs.noMatch' : 'hs.empty');
  const box = $('list'); box.replaceChildren();
  for (const x of list) {
    const c = el('article', 'card dr'), hh = el('h3', '', x.name); hh.append(el('span', 'badge', t('dr.verified')), el('span', 'tag', t('ha.' + x.type))); if (x.featured) hh.append(el('span', 'tag', t('ft.tag'))); c.append(hh, el('p', 'meta', `${x.address} - ${x.pin}`));
    if (x.phone) c.append(el('p', 'meta', x.phone));
    if (x.departments?.length) { const w = el('div', 'row'); x.departments.forEach(d => w.append(el('span', 'tag', d))); c.append(w); }
    const dl = docsBy[x.id]; if (dl?.length) c.append(el('p', '', `${t('hs.doctors')}: ${dl.join(', ')}`));
    box.append(c);
  }
}
['q', 'type'].forEach(id => $(id).addEventListener('input', render));
render();
