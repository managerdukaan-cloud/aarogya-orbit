import { db, functions } from './firebase-init.js';
import { t } from './i18n.js';
import { requireUser, say } from './guard.js';
import { renderRx } from './rx-view.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js';

const $ = (id) => document.getElementById(id);
const aid = new URLSearchParams(location.search).get('a');
if (!aid) location.replace('/dashboard.html');
const user = await requireUser(() => { if (rx) showRx(); });
const role = (await user.getIdTokenResult(true)).claims.role;
let appt, rx = null;
try { appt = (await getDoc(doc(db, 'appointments', aid))).data(); } catch { appt = null; }
if (!appt) location.replace('/dashboard.html');
try { const s = await getDoc(doc(db, 'prescriptions', aid)); rx = s.exists() ? s.data() : null; } catch { rx = null; }

function showRx() { $('view').replaceChildren(renderRx(rx)); }
function medRow() {
  const row = document.createElement('div'); row.className = 'medrow';
  [['name', 'rx.medicine', 100], ['dose', 'rx.dose', 50], ['frequency', 'rx.freq', 50], ['duration', 'rx.dur', 50], ['notes', 'rx.notes', 150]].forEach(([k, label, max]) => {
    const i = document.createElement('input'); i.type = 'text'; i.dataset.k = k; i.maxLength = max; i.placeholder = t(label); i.setAttribute('aria-label', t(label)); row.append(i);
  });
  const rm = document.createElement('button'); rm.type = 'button'; rm.className = 'btn btn-ghost danger'; rm.textContent = t('rx.remove');
  rm.onclick = () => { if ($('meds').children.length > 1) row.remove(); }; row.append(rm);
  $('meds').append(row);
}
if (rx) showRx();
else if (role === 'doctor' && appt.doctorUid === user.uid) {
  if (!['in_consultation', 'completed'].includes(appt.status)) { $('note').hidden = false; $('note').textContent = t('rx.errStatus'); }
  else { $('forWho').textContent = `${t('rx.patient')}: ${appt.memberName} · ${appt.date} ${appt.time}`; $('formWrap').hidden = false; medRow(); }
} else { $('note').hidden = false; $('note').textContent = t('rx.notYet'); }
$('addMed').onclick = () => { if ($('meds').children.length < 10) medRow(); };
$('app').hidden = false;

$('form').addEventListener('submit', async (e) => {
  e.preventDefault(); say('msg', null);
  const medicines = [...$('meds').children].map(r => Object.fromEntries([...r.querySelectorAll('input')].map(i => [i.dataset.k, i.value.trim()]))).filter(m => m.name || m.dose || m.frequency || m.duration || m.notes);
  if (!medicines.length || medicines.some(m => m.name.length < 2)) return say('msg', 'err.rx', false, t);
  if (!confirm(t('rx.issueAsk'))) return;
  $('issue').disabled = true; $('spin').hidden = false;
  try {
    await httpsCallable(functions, 'createPrescription')({ appointmentId: aid, medicines, advice: $('advice').value.trim(), followUpDate: $('follow').value });
    rx = (await getDoc(doc(db, 'prescriptions', aid))).data(); $('formWrap').hidden = true; showRx(); say('msg', 'rx.issued', true, t);
  } catch (err) {
    say('msg', { 'functions/already-exists': 'rx.errAlready', 'functions/failed-precondition': 'rx.errStatus' }[err.code] || 'err.generic', false, t);
    $('issue').disabled = false;
  }
  $('spin').hidden = true;
});
