import { db } from './firebase-init.js';
import { t, getLang } from './i18n.js';
import { requireUser, say } from './guard.js';
import { $, el, slug, nameOf } from './util.js';
import { collection, getDocs, getDoc, setDoc, doc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

let pkgs = [], tests = [], editing = null;
const user = await requireUser(() => { drawTests(); render(); });
if ((await user.getIdTokenResult(true)).claims.role !== 'admin') location.replace('/dashboard.html');
async function load() {
  const [p, tt] = await Promise.all([getDocs(collection(db, 'test_packages')), getDocs(collection(db, 'diagnostic_tests'))]);
  pkgs = p.docs.map(d => ({ id: d.id, ...d.data() })); tests = tt.docs.map(d => ({ id: d.id, ...d.data() })).filter(x => x.active !== false).sort((a, b) => a.name_en.localeCompare(b.name_en)); drawTests(); render();
}
function drawTests(selected) {
  const box = $('tests'), keep = selected || [...box.querySelectorAll('input:checked')].map(i => i.value); box.replaceChildren();
  for (const x of tests) { const l = el('label', 'check'); l.style.margin = '4px 0'; const i = el('input'); i.type = 'checkbox'; i.value = x.id; i.checked = keep.includes(x.id); l.append(i, el('span', '', nameOf(x, getLang()))); box.append(l); }
}
function render() {
  $('empty').hidden = pkgs.length > 0; const box = $('list'); box.replaceChildren();
  for (const p of pkgs.sort((a, b) => a.name_en.localeCompare(b.name_en))) {
    const c = el('article', 'card dr'), h = el('h3', '', nameOf(p, getLang())); if (p.active === false) h.append(el('span', 'status cancelled', t('adm.off')));
    c.append(h, el('p', 'meta', (p.testIds || []).map(id => { const x = tests.find(k => k.id === id); return x ? nameOf(x, getLang()) : id; }).join(', ')));
    const b = el('button', 'btn btn-ghost', t('fam.edit')); b.onclick = () => open(p); c.append(b); box.append(c);
  }
}
function open(p) {
  editing = p?.id || null; say('msg', null);
  $('name_en').value = p?.name_en || ''; $('name_hi').value = p?.name_hi || ''; $('description').value = p?.description || ''; $('active').checked = p ? p.active !== false : true;
  $('name_en').disabled = !!p; drawTests(p?.testIds || []); $('formWrap').hidden = false;
}
$('new').onclick = () => open(null); $('cancel').onclick = () => { $('formWrap').hidden = true; };
$('form').addEventListener('submit', async (e) => {
  e.preventDefault(); say('msg', null);
  const name = $('name_en').value.trim(), testIds = [...$('tests').querySelectorAll('input:checked')].map(i => i.value);
  if (name.length < 3) return say('msg', 'err.field', false, t);
  if (testIds.length < 2) return say('msg', 'pk.min', false, t);
  const id = editing || slug(name);
  try {
    if (!editing && (await getDoc(doc(db, 'test_packages', id))).exists()) return say('msg', 'adm.exists', false, t);
    await setDoc(doc(db, 'test_packages', id), { name_en: name, name_hi: $('name_hi').value.trim(), description: $('description').value.trim(), testIds, active: $('active').checked, updatedAt: serverTimestamp() }, { merge: true });
    $('formWrap').hidden = true; say('msg', 'adm.done', true, t); await load();
  } catch { say('msg', 'err.generic', false, t); }
});
await load();
$('app').hidden = false;
