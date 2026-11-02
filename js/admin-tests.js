import { db } from './firebase-init.js';
import { t, getLang } from './i18n.js';
import { requireUser, say } from './guard.js';
import { $, el, slug, nameOf } from './util.js';
import { collection, getDocs, getDoc, setDoc, writeBatch, doc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

let cats = [], tests = [], editing = null;
const user = await requireUser(() => { fillCats(); render(); });
if ((await user.getIdTokenResult(true)).claims.role !== 'admin') location.replace('/dashboard.html');

// Starter catalogue: names and categories only. Sample type, fasting and preparation are left EMPTY on purpose:
// clinical instructions must be entered by someone qualified, never guessed. Test names are kept in English in both languages.
const CATS = [['blood', 'Blood Tests', 'रक्त जाँच'], ['diabetes', 'Diabetes', 'मधुमेह'], ['thyroid', 'Thyroid', 'थायरॉइड'], ['vitamins', 'Vitamins', 'विटामिन'], ['liver', 'Liver', 'लिवर'], ['kidney', 'Kidney', 'किडनी'], ['heart', 'Heart', 'हृदय'], ['imaging', 'Imaging', 'इमेजिंग'], ['other', 'Other', 'अन्य जाँच']];
const TESTS = { blood: ['CBC', 'Hemoglobin', 'ESR', 'Blood Group'], diabetes: ['Fasting Blood Sugar', 'PPBS', 'HbA1c', 'GTT'], thyroid: ['T3', 'T4', 'TSH'], vitamins: ['Vitamin D', 'Vitamin B12'], liver: ['LFT'], kidney: ['KFT', 'Creatinine', 'Urea'], heart: ['Lipid Profile', 'ECG', 'Echo', 'TMT'], imaging: ['X-ray', 'Ultrasound', 'CT Scan', 'MRI'], other: ['Urine Tests', 'Hormonal Tests'] };

async function load() {
  const [c, tt] = await Promise.all([getDocs(collection(db, 'diagnostic_categories')), getDocs(collection(db, 'diagnostic_tests'))]);
  cats = c.docs.map(d => ({ id: d.id, ...d.data() })); tests = tt.docs.map(d => ({ id: d.id, ...d.data() }));
  fillCats(); render();
}
function fillCats() { const s = $('category'), v = s.value; s.replaceChildren(); cats.forEach(c => s.add(new Option(nameOf(c, getLang()), c.id))); s.value = v || (cats[0]?.id ?? ''); }
function render() {
  $('count').textContent = t('adm.testCount').replace('{n}', tests.length).replace('{c}', cats.length);
  const q = $('q').value.trim().toLowerCase(), box = $('list'); box.replaceChildren();
  for (const x of tests.filter(x => !q || `${x.name_en} ${x.name_hi}`.toLowerCase().includes(q)).sort((a, b) => a.name_en.localeCompare(b.name_en))) {
    const c = el('article', 'card fam'), h = el('h3', '', nameOf(x, getLang()));
    if (x.active === false) h.append(el('span', 'status cancelled', t('adm.off')));
    c.append(h, el('p', 'meta', nameOf(cats.find(k => k.id === x.category) || { name_en: x.category }, getLang())));
    const b = el('button', 'btn btn-ghost', t('fam.edit')); b.onclick = () => open(x); c.append(b); box.append(c);
  }
}
function open(x) {
  editing = x?.id || null; say('msg', null);
  for (const k of ['name_en', 'name_hi', 'description', 'sampleType', 'fasting', 'preparation']) $(k).value = x?.[k] || '';
  $('category').value = x?.category || cats[0]?.id || ''; $('active').checked = x ? x.active !== false : true;
  $('name_en').disabled = !!x; $('formWrap').hidden = false; $('name_en').focus();
}
$('new').onclick = () => open(null); $('cancel').onclick = () => { $('formWrap').hidden = true; editing = null; };
$('q').oninput = render;
$('form').addEventListener('submit', async (e) => {
  e.preventDefault(); say('msg', null);
  const name = $('name_en').value.trim();
  if (name.length < 2 || !$('category').value) return say('msg', 'err.field', false, t);
  const id = editing || slug(name);
  if (!id) return say('msg', 'err.field', false, t);
  try {
    if (!editing && (await getDoc(doc(db, 'diagnostic_tests', id))).exists()) return say('msg', 'adm.exists', false, t);
    const data = { name_en: name, name_hi: $('name_hi').value.trim(), category: $('category').value, description: $('description').value.trim(),
      sampleType: $('sampleType').value.trim(), fasting: $('fasting').value.trim(), preparation: $('preparation').value.trim(), active: $('active').checked, updatedAt: serverTimestamp() };
    await setDoc(doc(db, 'diagnostic_tests', id), data, { merge: true });
    $('formWrap').hidden = true; editing = null; say('msg', 'adm.done', true, t); await load();
  } catch { say('msg', 'err.generic', false, t); }
});
$('seed').onclick = async () => {
  $('seed').disabled = true;
  try {
    const b = writeBatch(db);
    for (const [id, en, hi] of CATS) b.set(doc(db, 'diagnostic_categories', id), { name_en: en, name_hi: hi, active: true }, { merge: true });
    for (const [cat, list] of Object.entries(TESTS)) for (const n of list) {
      const id = slug(n), ref = doc(db, 'diagnostic_tests', id);
      if (!tests.some(x => x.id === id)) b.set(ref, { name_en: n, name_hi: '', category: cat, description: '', sampleType: '', fasting: '', preparation: '', active: true }); // never overwrite edits
    }
    await b.commit(); say('msg', 'adm.seeded', true, t); await load();
  } catch { say('msg', 'err.generic', false, t); }
  $('seed').disabled = false;
};
await load();
$('app').hidden = false;
