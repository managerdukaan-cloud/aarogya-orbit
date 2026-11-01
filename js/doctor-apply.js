import { db, storage } from './firebase-init.js';
import { t, getLang } from './i18n.js';
import { requireUser, say } from './guard.js';
import { collection, getDocs, doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { ref, uploadBytes } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js';

const $ = (id) => document.getElementById(id);
let specs = [], app = null;
const user = await requireUser(() => { renderSpecs(); paintStatus(); });
const appRef = doc(db, 'doctor_applications', user.uid);

function renderSpecs() {
  const sel = $('speciality'), cur = sel.value;
  sel.replaceChildren(new Option(t('opt.choose'), ''));
  for (const s of specs) sel.add(new Option(getLang() === 'hi' && s.name_hi ? s.name_hi : s.name_en, s.id));
  sel.value = cur; $('noSpec').hidden = specs.length > 0;
}
function paintStatus() {
  const box = $('status'); box.hidden = !app;
  if (!app) return;
  const key = { pending: 'doc.st.pending', approved: 'doc.st.approved', rejected: 'doc.st.rejected' }[app.status];
  box.textContent = t(key).replace('{reason}', app.rejectReason || '');
  box.className = 'msg ' + (app.status === 'rejected' ? 'bad' : 'ok');
  $('formWrap').hidden = app.status === 'approved';
}
function fill(a) {
  for (const k of ['name', 'phone', 'qualification', 'regNumber', 'council', 'clinicName', 'address']) $(k).value = a[k] || '';
  $('experience').value = a.experience ?? ''; $('fee').value = a.fee ?? '';
  $('languages').value = (a.languages || []).join(', '); $('speciality').value = a.speciality || '';
  $('certHave').hidden = !(a.documents && a.documents.length);
}
const [specSnap, appSnap] = await Promise.all([getDocs(collection(db, 'specialities')), getDoc(appRef)]);
specs = specSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(s => s.active !== false).sort((a, b) => a.name_en.localeCompare(b.name_en));
renderSpecs();
if (appSnap.exists()) { app = appSnap.data(); fill(app); } else $('name').value = user.displayName || '';
paintStatus();
$('app').hidden = false;

$('form').addEventListener('submit', async (e) => {
  e.preventDefault(); say('msg', null);
  const v = (k) => $(k).value.trim();
  const experience = Number(v('experience')), fee = Number(v('fee'));
  const req = ['name', 'qualification', 'regNumber', 'council', 'clinicName', 'address'];
  if (req.some(k => !v(k)) || !$('speciality').value) return say('msg', 'err.field', false, t);
  if (v('name').length < 2) return say('msg', 'err.name', false, t);
  if (!/^[6-9]\d{9}$/.test(v('phone'))) return say('msg', 'err.phone', false, t);
  if (!Number.isInteger(experience) || experience < 0 || experience > 70 || !Number.isFinite(fee) || fee < 0 || fee > 100000 || v('fee') === '') return say('msg', 'err.num', false, t);
  const file = $('cert').files[0];
  const hasDoc = app?.documents?.length > 0;
  if (!file && !hasDoc) return say('msg', 'err.fileReq', false, t);
  if (file && (!['application/pdf', 'image/jpeg', 'image/png'].includes(file.type) || file.size > 5 * 1024 * 1024)) return say('msg', 'err.file', false, t);
  if (!$('consent').checked) return say('msg', 'err.consent2', false, t);
  $('save').disabled = true; $('spin').hidden = false;
  try {
    let documents = app?.documents || [];
    if (file) {
      const ext = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' }[file.type];
      const path = `doctor_docs/${user.uid}/certificate-${Date.now()}.${ext}`;
      try { await uploadBytes(ref(storage, path), file, { contentType: file.type }); } catch { return say('msg', 'err.upload', false, t); }
      documents = [{ type: 'registration_certificate', path, name: file.name.slice(0, 100) }];
    }
    const data = {
      name: v('name'), phone: v('phone'), speciality: $('speciality').value, qualification: v('qualification'),
      experience, regNumber: v('regNumber'), council: v('council'), clinicName: v('clinicName'), address: v('address'), fee,
      languages: v('languages').split(',').map(s => s.trim()).filter(Boolean).slice(0, 8),
      documents, status: 'pending', consentConfirmed: true, updatedAt: serverTimestamp()
    };
    if (app) await updateDoc(appRef, data); else await setDoc(appRef, { ...data, uid: user.uid, createdAt: serverTimestamp() });
    app = (await getDoc(appRef)).data(); paintStatus(); say('msg', 'doc.saved', true, t);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch { say('msg', 'err.generic', false, t); }
  finally { $('save').disabled = false; $('spin').hidden = true; }
});
