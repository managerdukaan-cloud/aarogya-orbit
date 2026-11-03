import { db, functions } from './firebase-init.js';
import { t, getLang } from './i18n.js';
import { requireUser, say } from './guard.js';
import { $, el } from './util.js';
import { collection, query, where, getDocs, writeBatch, setDoc, doc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js';

let pending = [], labs = [], hosp = [], specs = [], areas = [];
const user = await requireUser(() => { renderAll(); });
// The server re-checks the admin role on every action. This client check only avoids showing a useless page.
if ((await user.getIdTokenResult(true)).claims.role !== 'admin') location.replace('/dashboard.html');
const specName = (id) => { const s = specs.find(x => x.id === id); return !s ? id : (getLang() === 'hi' && s.name_hi ? s.name_hi : s.name_en); };
const call = (name, data) => httpsCallable(functions, name)(data).then(r => r.data);

async function load() {
  const [a, l, s, ar, h] = await Promise.all([
    getDocs(query(collection(db, 'doctor_applications'), where('status', '==', 'pending'))),
    getDocs(query(collection(db, 'lab_applications'), where('status', '==', 'pending'))),
    getDocs(collection(db, 'specialities')), getDocs(collection(db, 'service_areas')),
    getDocs(query(collection(db, 'hospital_applications'), where('status', '==', 'pending')))]);
  hosp = h.docs.map(d => ({ id: d.id, ...d.data() }));
  pending = a.docs.map(d => ({ id: d.id, ...d.data() })); labs = l.docs.map(d => ({ id: d.id, ...d.data() }));
  specs = s.docs.map(d => ({ id: d.id, ...d.data() })); areas = ar.docs.map(d => ({ id: d.id, ...d.data() })).sort((x, y) => x.id.localeCompare(y.id));
  renderAll();
}
const line = (label, value) => { const p = el('p'); p.append(el('strong', '', label + ': '), document.createTextNode(value || '-')); return p; };
async function viewDoc(fn, a, btn) {
  const w = window.open('', '_blank'); btn.disabled = true; // opened first so the popup blocker allows it
  try {
    const r = await call(fn, { uid: a.id, path: a.documents[0].path });
    const bytes = Uint8Array.from(atob(r.data), c => c.charCodeAt(0));
    if (w) w.location = URL.createObjectURL(new Blob([bytes], { type: r.contentType }));
  } catch { w?.close(); say('msg', 'err.generic', false, t); }
  btn.disabled = false;
}
function buttons(card, a, fn, decide, viewFn) {
  const act = el('div', 'actions');
  const mk = (cls, label, f) => { const b = el('button', 'btn ' + cls, t(label)); b.onclick = () => f(b); return b; };
  act.append(mk('btn-ghost', 'adm.view', (b) => viewDoc(viewFn, a, b)), mk('btn-primary', 'adm.approve', (b) => decide(a, 'approve', b)), mk('btn-ghost danger', 'adm.reject', (b) => decide(a, 'reject', b)));
  card.append(act);
}
function renderAll() {
  $('none').hidden = pending.length > 0; $('noneLab').hidden = labs.length > 0;
  const dl = $('list'); dl.replaceChildren();
  for (const a of pending) {
    const c = el('article', 'card fam'); c.append(el('h3', '', a.name),
      line(t('doc.speciality'), specName(a.speciality)), line(t('doc.qual'), a.qualification), line(t('doc.reg'), a.regNumber), line(t('doc.council'), a.council),
      line(t('doc.exp'), String(a.experience)), line(t('doc.fee'), '₹' + a.fee), line(t('doc.clinic'), a.clinicName), line(t('doc.address'), a.address),
      line(t('prof.phone'), a.phone), line(t('doc.langs'), (a.languages || []).join(', ')));
    buttons(c, a, 'getApplicationDocument', (x, d, b) => decide('reviewApplication', x, d, b), 'getApplicationDocument'); dl.append(c);
  }
  const ll = $('labList'); ll.replaceChildren();
  for (const a of labs) {
    const c = el('article', 'card fam'); c.append(el('h3', '', a.name),
      line(t('lab.owner'), a.ownerName), line(t('prof.phone'), a.phone), line(t('lab.address'), `${a.address} - ${a.pin}`),
      line(t('lab.licence'), a.licenseNo), line(t('lab.accred'), a.accreditation), line(t('lab.home'), t(a.homeCollection ? 'yes' : 'no')));
    buttons(c, a, 'getLabApplicationDocument', (x, d, b) => decide('reviewLabApplication', x, d, b), 'getLabApplicationDocument'); ll.append(c);
  }
  $('noneHosp').hidden = hosp.length > 0; const hl = $('hospList'); hl.replaceChildren();
  for (const a of hosp) {
    const c = el('article', 'card fam'); c.append(el('h3', '', a.name), line(t('ha.type'), t('ha.' + a.type)), line(t('ha.contact'), a.contactName), line(t('prof.phone'), a.phone),
      line(t('lab.address'), `${a.address} - ${a.pin}`), line(t('ha.reg'), a.registrationNo), line(t('hp.depts'), (a.departments || []).join(', ')));
    buttons(c, a, 'getHospitalApplicationDocument', (x, d, b) => decide('reviewHospitalApplication', x, d, b), 'getHospitalApplicationDocument'); hl.append(c);
  }
  const al = $('areaList'); al.replaceChildren();
  for (const a of areas) {
    const r = el('div', 'row'); r.style.margin = '6px 0';
    r.append(el('span', '', `${a.id} ${a.area || ''}`), el('span', 'status' + (a.active ? '' : ' cancelled'), t(a.active ? 'adm.active' : 'adm.off')));
    const b = el('button', 'btn btn-ghost', t(a.active ? 'adm.turnOff' : 'adm.turnOn')); b.style.minHeight = '36px';
    b.onclick = async () => { await setDoc(doc(db, 'service_areas', a.id), { active: !a.active }, { merge: true }); await load(); };
    r.append(b); al.append(r);
  }
  $('specCount').textContent = t('adm.specCount').replace('{n}', specs.length);
}
async function decide(fn, a, decision, btn) {
  let reason = '', accreditationVerified = false;
  if (decision === 'reject') { reason = (prompt(t('adm.reasonPrompt')) || '').trim(); if (reason.length < 5) return; }
  else {
    if (!confirm(t(fn === 'reviewLabApplication' ? 'adm.confirmLab' : fn === 'reviewHospitalApplication' ? 'adm.confirmHosp' : 'adm.confirmApprove'))) return;
    if (fn === 'reviewLabApplication' && a.accreditation) accreditationVerified = confirm(t('adm.accredAsk'));
  }
  btn.disabled = true;
  try { await call(fn, { uid: a.id, decision, reason, accreditationVerified }); say('msg', 'adm.done', true, t); await load(); }
  catch { say('msg', 'err.generic', false, t); btn.disabled = false; }
}
$('addArea').onclick = async () => {
  const pin = $('pin').value.trim();
  if (!/^\d{6}$/.test(pin)) return say('msg', 'adm.badPin', false, t);
  try { await setDoc(doc(db, 'service_areas', pin), { pin, area: $('area').value.trim(), city: 'Udaipur', active: true }, { merge: true }); $('pin').value = ''; $('area').value = ''; await load(); }
  catch { say('msg', 'err.generic', false, t); }
};
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
