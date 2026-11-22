import { db } from './firebase-init.js';
import { t, getLang } from './i18n.js';
import { requireUser, say } from './guard.js';
import { $, el, nameOf } from './util.js';
import { collection, getDocs, getDoc, setDoc, deleteDoc, doc, query, where, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

let pkgs = [], tests = [], mine = {}, lab = null;
const user = await requireUser(render);
if ((await user.getIdTokenResult(true)).claims.role !== 'lab') location.replace('/dashboard.html');
const [l, p, tt, m] = await Promise.all([getDoc(doc(db, 'labs', user.uid)), getDocs(collection(db, 'test_packages')), getDocs(collection(db, 'diagnostic_tests')), getDocs(query(collection(db, 'lab_package_pricing'), where('labUid', '==', user.uid)))]);
lab = l.data(); pkgs = p.docs.map(d => ({ id: d.id, ...d.data() })).filter(x => x.active !== false); tests = tt.docs.map(d => ({ id: d.id, ...d.data() })); m.docs.forEach(d => mine[d.data().packageId] = d.data());
function field(k, v) { const f = el('label', 'f'); f.append(el('span', '', t(k))); const i = el('input'); i.type = 'text'; i.inputMode = 'decimal'; i.value = v ?? ''; f.append(i); return f; }
function render() {
  $('empty').hidden = pkgs.length > 0; const box = $('list'); box.replaceChildren();
  for (const p of pkgs) {
    const x = mine[p.id], c = el('article', 'card fam'); c.append(el('h3', '', nameOf(p, getLang())),
      el('p', 'mini', (p.testIds || []).map(id => { const k = tests.find(q => q.id === id); return k ? nameOf(k, getLang()) : id; }).join(', ')));
    const row = el('div', 'pr'), on = el('label', 'c'), cb = el('input'); cb.type = 'checkbox'; cb.checked = !!x; on.append(cb, el('span', '', t('pk.offer')));
    const price = field('lab.price', x?.price), orig = field('lab.orig', x?.originalPrice || ''), tat = field('lab.tat', x?.turnaroundHours);
    const hm = el('label', 'c'), hc = el('input'); hc.type = 'checkbox'; hc.checked = x?.homeCollection === true; hc.disabled = lab.homeCollection !== true; hm.append(hc, el('span', '', t('lab.homeThis')));
    const save = el('button', 'btn btn-primary', t('fam.save')); save.style.minHeight = '44px'; row.append(on, price, orig, tat, hm, save); c.append(row);
    save.onclick = async () => {
      const id = `${user.uid}_${p.id}`; say('msg', null);
      try {
        if (!cb.checked) { if (x) await deleteDoc(doc(db, 'lab_package_pricing', id)); delete mine[p.id]; return say('msg', 'adm.done', true, t); }
        const pv = Number(price.querySelector('input').value), ov = orig.querySelector('input').value.trim() === '' ? 0 : Number(orig.querySelector('input').value), tv = Number(tat.querySelector('input').value);
        if (!(pv > 0 && pv <= 200000) || !(ov === 0 || (ov > pv && ov <= 200000)) || !Number.isInteger(tv) || tv < 1 || tv > 720) return say('msg', 'lab.badPrice', false, t);
        const data = { labUid: user.uid, packageId: p.id, price: pv, originalPrice: ov, turnaroundHours: tv, homeCollection: hc.checked && lab.homeCollection === true, active: true, updatedAt: serverTimestamp() };
        await setDoc(doc(db, 'lab_package_pricing', id), data); mine[p.id] = data; say('msg', 'adm.done', true, t);
      } catch { say('msg', 'err.generic', false, t); }
    };
    box.append(c);
  }
}
render();
$('app').hidden = false;
