import { db, functions } from './firebase-init.js';
import { t } from './i18n.js';
import { requireUser, say } from './guard.js';
import { $, ist, toMins, dayKey, addDays, slotsFor, chip } from './util.js';
import { doc, getDoc, getDocs, collection, query, where } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js';

const rid = new URLSearchParams(location.search).get('r');
if (!rid) location.replace('/appointments.html');
let appt, sch, date = '', time = '', taken = new Set();
const user = await requireUser(() => { renderDates(); renderTimes(); head(); });
appt = (await getDoc(doc(db, 'appointments', rid))).data();
if (!appt || appt.patientUid !== user.uid || !['pending', 'confirmed', 'rescheduled'].includes(appt.status)) location.replace('/appointments.html');
sch = (await getDoc(doc(db, 'doctor_schedules', appt.doctorUid))).data();
function head() { $('with').textContent = `${appt.doctorName} · ${appt.clinicName || ''}`; $('current').textContent = `${t('rs.current')}: ${appt.date} ${appt.time}`; }
head();
if ((appt.rescheduleCount || 0) >= 2 || !sch) { $('blocked').hidden = false; $('blocked').textContent = t((appt.rescheduleCount || 0) >= 2 ? 'rs.limit' : 'bk.noDates'); $('formWrap').hidden = true; }
else renderDates();
$('app').hidden = false;
function renderDates() {
  const box = $('dates'); box.replaceChildren(); if (!sch) return;
  for (let i = 0; i < 14; i++) { const d = addDays(ist().date, i); if ((sch.weekly?.[dayKey(d)] || []).length) box.append(chip(`${t('day.' + dayKey(d))} ${d.slice(8)}/${d.slice(5, 7)}`, d === date, () => pickDate(d))); }
}
async function pickDate(d) {
  date = d; time = ''; $('confirm').disabled = true; say('msg', null);
  const snap = await getDocs(query(collection(db, 'booked_slots'), where('doctorUid', '==', appt.doctorUid), where('date', '==', d)));
  taken = new Set(snap.docs.map(x => x.data().time)); renderDates(); renderTimes();
}
function renderTimes() {
  const box = $('times'); box.replaceChildren(); if (!date) return; const now = ist(); let free = 0;
  for (const x of slotsFor(sch, date)) {
    const gone = taken.has(x) || (date === now.date && toMins(x) < now.mins + 30); if (!gone) free++;
    box.append(chip(x, x === time, () => { time = x; $('confirm').disabled = false; renderTimes(); }, gone));
  }
  $('noSlots').hidden = free > 0;
}
$('confirm').addEventListener('click', async () => {
  say('msg', null); $('confirm').disabled = true; $('spin').hidden = false;
  try { await httpsCallable(functions, 'rescheduleAppointment')({ id: rid, date, time }); $('formWrap').hidden = true; $('done').hidden = false; }
  catch (e) {
    const k = { 'functions/already-exists': 'bk.slotTaken', 'functions/failed-precondition': 'bk.past', 'functions/resource-exhausted': 'rs.limit' }[e.code] || 'err.generic';
    say('msg', k, false, t); if (k === 'bk.slotTaken') await pickDate(date); else $('confirm').disabled = !time;
  }
  $('spin').hidden = true;
});
