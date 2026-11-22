import { db, functions } from './firebase-init.js';
import { t } from './i18n.js';
import { requireUser, say } from './guard.js';
import { doc, getDoc, getDocs, collection, query, where } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js';

const $ = (id) => document.getElementById(id);
const DAYKEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const doctorId = new URLSearchParams(location.search).get('d');
if (!doctorId) location.replace('/doctors.html');
let dr, sch, members = [], date = '', time = '', taken = new Set();

// Dates and times are always Indian Standard Time, whatever the device says.
function ist() {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, mins: +p.hour * 60 + +p.minute };
}
const toMins = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
const pad = (n) => String(n).padStart(2, '0');
const dayKey = (d) => DAYKEYS[new Date(d + 'T00:00:00Z').getUTCDay()];
const addDays = (d, n) => new Date(new Date(d + 'T00:00:00Z').getTime() + n * 864e5).toISOString().slice(0, 10);
function slotsFor(d) {
  const out = [];
  for (const r of sch.weekly?.[dayKey(d)] || []) for (let m = toMins(r.start); m + sch.slotMinutes <= toMins(r.end); m += sch.slotMinutes) out.push(`${pad(Math.floor(m / 60))}:${pad(m % 60)}`);
  return out;
}
const user = await requireUser(() => { renderMembers(); renderDates(); renderTimes(); head(); });
function head() { if (dr) { $('with').textContent = t('bk.with').replace('{name}', dr.name) + ' · ' + dr.clinicName; $('feeNote').textContent = t('bk.fee').replace('{n}', dr.fee); } }

const role = (await user.getIdTokenResult(true)).claims.role;
const [d, s] = await Promise.all([getDoc(doc(db, 'doctors', doctorId)), getDoc(doc(db, 'doctor_schedules', doctorId))]);
if (!d.exists() || d.data().verified !== true || d.data().active === false) location.replace('/doctors.html');
dr = d.data(); sch = s.data(); head();
if (role !== 'patient') { $('blocked').hidden = false; $('blocked').textContent = t('bk.patientOnly'); $('formWrap').hidden = true; }
else if (!sch || !Object.values(sch.weekly || {}).some(a => a.length)) { $('blocked').hidden = false; $('blocked').textContent = t('bk.noDates'); $('formWrap').hidden = true; }
else {
  const fm = await getDocs(query(collection(db, 'family_members'), where('ownerUid', '==', user.uid), where('status', '==', 'active')));
  members = fm.docs.map(x => ({ id: x.id, name: x.data().name }));
  renderMembers(); renderDates();
}
$('app').hidden = false;

function renderMembers() {
  const sel = $('member'), cur = sel.value || 'self';
  sel.replaceChildren(new Option(t('bk.self'), 'self')); members.forEach(m => sel.add(new Option(m.name, m.id))); sel.value = cur;
}
function chip(label, pressed, onClick, disabled = false) {
  const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.textContent = label;
  b.setAttribute('aria-pressed', pressed); b.disabled = disabled; b.onclick = onClick; return b;
}
function renderDates() {
  const box = $('dates'); box.replaceChildren(); if (!sch) return;
  const today = ist().date;
  for (let i = 0; i < 14; i++) {
    const day = addDays(today, i);
    if (!(sch.weekly?.[dayKey(day)] || []).length) continue;
    box.append(chip(`${t('day.' + dayKey(day))} ${day.slice(8)}/${day.slice(5, 7)}`, day === date, () => pickDate(day)));
  }
}
async function pickDate(day) {
  date = day; time = ''; $('confirm').disabled = true; say('msg', null);
  const snap = await getDocs(query(collection(db, 'booked_slots'), where('doctorUid', '==', doctorId), where('date', '==', day)));
  taken = new Set(snap.docs.map(x => x.data().time)); renderDates(); renderTimes();
}
function renderTimes() {
  const box = $('times'); box.replaceChildren(); if (!date) { $('noSlots').hidden = true; return; }
  const now = ist(), all = slotsFor(date);
  const free = all.filter(x => !taken.has(x) && (date !== now.date || toMins(x) >= now.mins + 30));
  all.forEach(x => {
    const gone = taken.has(x) || (date === now.date && toMins(x) < now.mins + 30);
    box.append(chip(x, x === time, () => { time = x; $('confirm').disabled = false; renderTimes(); }, gone));
  });
  $('noSlots').hidden = free.length > 0;
}
$('confirm').addEventListener('click', async () => {
  say('msg', null); $('confirm').disabled = true; $('spin').hidden = false;
  try {
    const res = await httpsCallable(functions, 'bookAppointment')({ doctorUid: doctorId, date, time, memberId: $('member').value });
    $('summary').textContent = `${dr.name} · ${date} · ${time}`; $('formWrap').hidden = true; $('done').hidden = false;
  } catch (e) {
    const k = { 'functions/already-exists': 'bk.slotTaken', 'functions/failed-precondition': 'bk.past', 'functions/permission-denied': 'bk.patientOnly' }[e.code] || 'err.generic';
    say('msg', k, false, t);
    if (k === 'bk.slotTaken') await pickDate(date); else $('confirm').disabled = !time;
  }
  $('spin').hidden = true;
});
