import { db } from './firebase-init.js';
import { t, getLang } from './i18n.js';
import { requireUser, say } from './guard.js';
import { $, el, nameOf } from './util.js';
import { collection, getDocs, getDoc, setDoc, deleteDoc, doc, query, where, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

let tests = [], mine = {}, lab = null;
const user = await requireUser(render);
if ((await user.getIdTokenResult(true)).claims.role !== 'lab') location.replace('/dashboard.html');
const [l, tt, p] = await Promise.all([getDoc(doc(db, 'labs', user.uid)), getDocs(collection(db, 'diagnostic_tests')), getDocs(query(collection(db, 'lab_pricing'), where('labUid', '==', user.uid)))]);
lab = l.data(); tests = tt.docs.map(d => ({ id: d.id, ...d.data() })).filter(x => x.active !== false).sort((a, b) => a.name_en.localeCompare(b.name_en));
p.docs.forEach(d => mine[d.data().testId] = d.data());
$('q').oninput = render;

function field(labelKey, value, id, w) { const f = el('label', 'f'); f.append(el('span', '', t(labelKey))); const i = el('input'); i.type = 'text'; i.inputMode = 'decimal'; i.value = value ?? ''; i.id = id; f.append(i); return f; }
function render() {
  $('empty').hidden = tests.length > 0;
  const q = $('q').value.trim().toLowerCase(), box = $('list'); box.replaceChildren();
  for (const x of tests.filter(x => !q || `${x.name_en} ${x.name_hi}`.toLowerCase().includes(q))) {
    const m = mine[x.id], c = el('article', 'card fam'); c.append(el('h3', '', nameOf(x, getLang())));
    const row = el('div', 'pr');
    const on = el('label', 'c'), cb = el('input'); cb.type = 'checkbox'; cb.checked = !!m; on.append(cb, el('span', '', t('lab.offer')));
    const price = field('lab.price', m?.price, 'p-' + x.id), orig = field('lab.orig', m?.originalPrice || '', 'o-' + x.id), tat = field('lab.tat', m?.turnaroundHours, 't-' + x.id);
    const hm = el('label', 'c'), hc = el('input'); hc.type = 'checkbox'; hc.checked = m?.homeCollection === true; hc.disabled = lab.homeCollection !== true; hm.append(hc, el('span', '', t('lab.homeThis')));
    const save = el('button', 'btn btn-primary', t('fam.save')); save.style.minHeight = '44px';
    row.append(on, price, orig, tat, hm, save); c.append(row);
    save.onclick = async () => {
      const id = `${user.uid}_${x.id}`; say('msg', null);
      try {
        if (!cb.checked) { if (m) await deleteDoc(doc(db, 'lab_pricing', id)); delete mine[x.id]; return say('msg', 'adm.done', true, t); }
        const pv = Number(price.querySelector('input').value), ov = orig.querySelector('input').value.trim() === '' ? 0 : Number(orig.querySelector('input').value), tv = Number(tat.querySelector('input').value);
        if (!(pv > 0 && pv <= 100000) || !(ov === 0 || (ov > pv && ov <= 100000)) || !Number.isInteger(tv) || tv < 1 || tv > 720) return say('msg', 'lab.badPrice', false, t);
        const data = { labUid: user.uid, testId: x.id, price: pv, originalPrice: ov, turnaroundHours: tv, homeCollection: hc.checked && lab.homeCollection === true, active: true, updatedAt: serverTimestamp() };
        await setDoc(doc(db, 'lab_pricing', id), data); mine[x.id] = data; say('msg', 'adm.done', true, t);
      } catch { say('msg', 'err.generic', false, t); }
    };
    box.append(c);
  }
}
render();
$('app').hidden = false;
