import { db, storage } from './firebase-init.js';
import { t } from './i18n.js';
import { requireUser, say } from './guard.js';
import { $ } from './util.js';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { ref, uploadBytes } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js';

let app = null;
const user = await requireUser(paintStatus);
const appRef = doc(db, 'hospital_applications', user.uid);
const role = (await user.getIdTokenResult(true)).claims.role, snap = await getDoc(appRef);
if (snap.exists()) {
  app = snap.data();
  for (const k of ['name', 'contactName', 'phone', 'address', 'pin', 'registrationNo']) $(k).value = app[k] || '';
  $('type').value = app.type || 'hospital'; $('departments').value = (app.departments || []).join(', '); $('certHave').hidden = !(app.documents && app.documents.length);
}
if (role !== 'patient' && !snap.exists()) { $('blocked').hidden = false; $('formWrap').hidden = true; }
function paintStatus() {
  const box = $('status'); box.hidden = !app; if (!app) return;
  box.textContent = t({ pending: 'doc.st.pending', approved: 'ha.st.approved', rejected: 'doc.st.rejected' }[app.status]).replace('{reason}', app.rejectReason || '');
  box.className = 'msg ' + (app.status === 'rejected' ? 'bad' : 'ok'); $('formWrap').hidden = app.status === 'approved';
}
paintStatus(); $('app').hidden = false;
$('form').addEventListener('submit', async (e) => {
  e.preventDefault(); say('msg', null);
  const v = (k) => $(k).value.trim(), file = $('cert').files[0];
  const departments = [...new Set(v('departments').split(',').map(s => s.trim()).filter(Boolean))].slice(0, 20);
  if (['name', 'contactName', 'address', 'registrationNo'].some(k => !v(k)) || departments.some(d => d.length > 40)) return say('msg', 'err.field', false, t);
  if (!/^[6-9]\d{9}$/.test(v('phone'))) return say('msg', 'err.phone', false, t);
  if (!/^\d{6}$/.test(v('pin'))) return say('msg', 'adm.badPin', false, t);
  if (!file && !(app?.documents?.length)) return say('msg', 'err.fileReq', false, t);
  if (file && (!['application/pdf', 'image/jpeg', 'image/png'].includes(file.type) || file.size > 5 * 1024 * 1024)) return say('msg', 'err.file', false, t);
  if (!$('consent').checked) return say('msg', 'err.consent2', false, t);
  $('save').disabled = true; $('spin').hidden = false;
  try {
    let documents = app?.documents || [];
    if (file) {
      const ext = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png' }[file.type], path = `hospital_docs/${user.uid}/registration-${Date.now()}.${ext}`;
      try { await uploadBytes(ref(storage, path), file, { contentType: file.type }); } catch { return say('msg', 'err.upload', false, t); }
      documents = [{ type: 'registration', path, name: file.name.slice(0, 100) }];
    }
    const data = { name: v('name'), type: $('type').value, contactName: v('contactName'), phone: v('phone'), address: v('address'), pin: v('pin'), registrationNo: v('registrationNo'),
      departments, documents, status: 'pending', consentConfirmed: true, updatedAt: serverTimestamp() };
    if (app) await updateDoc(appRef, data); else await setDoc(appRef, { ...data, uid: user.uid, createdAt: serverTimestamp() });
    app = (await getDoc(appRef)).data(); paintStatus(); say('msg', 'doc.saved', true, t); window.scrollTo({ top: 0, behavior: 'smooth' });
  } catch { say('msg', 'err.generic', false, t); }
  finally { $('save').disabled = false; $('spin').hidden = true; }
});
