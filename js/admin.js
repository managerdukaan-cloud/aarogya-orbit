import { db, functions } from './firebase-init.js';
import { t, getLang } from './i18n.js';
import { requireUser, say } from './guard.js';
import { collection, query, where, getDocs, writeBatch, doc } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js';

const $ = (id) => document.getElementById(id);
let pending = [], specs = [];
const user = await requireUser(() => { renderList(); renderSpecCount(); });
// The server re-checks the admin role on every action. This client check only avoids showing a useless page.
if ((await user.getIdTokenResult(true)).claims.role !== 'admin') location.replace('/dashboard.html');

const specName = (id) => { const s = specs.find(x => x.id === id); return !s ? id : (getLang() === 'hi' && s.name_hi ? s.name_hi : s.name_en); };
const call = (name, data) => httpsCallable(functions, name)(data).then(r => r.data);

async function load() {
  const [a, s] = await Promise.all([getDocs(query(collection(db, 'doctor_applications'), where('status', '==', 'pending'))), getDocs(collection(db, 'specialities'))]);
  pending = a.docs.map(d => ({ id: d.id, ...d.data() }));
  specs = s.docs.map(d => ({ id: d.id, ...d.data() }));
  renderList(); renderSpecCount();
}
function line(label, value) { const p = document.createElement('p'); const b = document.createElement('strong'); b.textContent = label + ': '; p.append(b, document.createTextNode(value)); return p; }
function renderList() {
  const list = $('list'); list.replaceChildren(); $('none').hidden = pending.length > 0;
  for (const a of pending) {
    const c = document.createElement('article'); c.className = 'card fam';
    const h = document.createElement('h3'); h.textContent = a.name; c.append(h,
      line(t('doc.speciality'), specName(a.speciality)), line(t('doc.qual'), a.qualification),
      line(t('doc.reg'), a.regNumber), line(t('doc.council'), a.council), line(t('doc.exp'), String(a.experience)),
      line(t('doc.fee'), '₹' + a.fee), line(t('doc.clinic'), a.clinicName), line(t('doc.address'), a.address),
      line(t('prof.phone'), a.phone), line(t('doc.langs'), (a.languages || []).join(', ')));
    const act = document.createElement('div'); act.className = 'actions';
    const mk = (cls, label, fn) => { const b = document.createElement('button'); b.className = 'btn ' + cls; b.textContent = t(label); b.onclick = () => fn(b); return b; };
    act.append(
      mk('btn-ghost', 'adm.view', (b) => viewDoc(a, b)),
      mk('btn-primary', 'adm.approve', (b) => decide(a, 'approve', b)),
      mk('btn-ghost danger', 'adm.reject', (b) => decide(a, 'reject', b)));
    c.append(act); list.append(c);
  }
}
async function viewDoc(a, btn) {
  const w = window.open('', '_blank'); // opened first so the popup blocker allows it
  btn.disabled = true;
  try {
    const r = await call('getApplicationDocument', { uid: a.id, path: a.documents[0].path });
    const bytes = Uint8Array.from(atob(r.data), c => c.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: r.contentType }));
    if (w) w.location = url;
  } catch { w?.close(); say('msg', 'err.generic', false, t); }
  btn.disabled = false;
}
async function decide(a, decision, btn) {
  let reason = '';
  if (decision === 'reject') { reason = (prompt(t('adm.reasonPrompt')) || '').trim(); if (reason.length < 5) return; }
  else if (!confirm(t('adm.confirmApprove'))) return;
  btn.disabled = true;
  try { await call('reviewApplication', { uid: a.id, decision, reason }); say('msg', 'adm.done', true, t); await load(); }
  catch { say('msg', 'err.generic', false, t); btn.disabled = false; }
}
function renderSpecCount() { $('specCount').textContent = t('adm.specCount').replace('{n}', specs.length); }

// One-time starter list. After seeding, specialities live in the database and are managed there.
const DEFAULTS = [
 ['General Physician','सामान्य चिकित्सक'],['Cardiologist','हृदय रोग विशेषज्ञ'],['Dermatologist','त्वचा रोग विशेषज्ञ'],
 ['Ophthalmologist','नेत्र रोग विशेषज्ञ'],['Orthopedic','हड्डी रोग विशेषज्ञ'],['Gynecologist','स्त्री रोग विशेषज्ञ'],
 ['Pediatrician','बाल रोग विशेषज्ञ'],['Neurologist','न्यूरोलॉजिस्ट (तंत्रिका रोग विशेषज्ञ)'],['Dentist','दंत चिकित्सक'],
 ['ENT Specialist','ईएनटी (कान-नाक-गला) विशेषज्ञ'],['Urologist','मूत्र रोग विशेषज्ञ'],['Gastroenterologist','पेट और आँत रोग विशेषज्ञ'],
 ['Psychiatrist','मनोरोग विशेषज्ञ'],['Oncologist','कैंसर रोग विशेषज्ञ'],['Pulmonologist','फेफड़े के रोग विशेषज्ञ'],
 ['Endocrinologist','हार्मोन रोग विशेषज्ञ'],['Nephrologist','गुर्दा रोग विशेषज्ञ'],['Rheumatologist','गठिया रोग विशेषज्ञ'],['General Surgeon','सामान्य सर्जन']];
$('seed').addEventListener('click', async () => {
  $('seed').disabled = true;
  try {
    const b = writeBatch(db);
    for (const [en, hi] of DEFAULTS) b.set(doc(db, 'specialities', en.toLowerCase().replace(/[^a-z]+/g, '-')), { name_en: en, name_hi: hi, active: true }, { merge: true });
    await b.commit(); say('msg', 'adm.seeded', true, t); await load();
  } catch { say('msg', 'err.generic', false, t); }
  $('seed').disabled = false;
});
await load();
$('app').hidden = false;
