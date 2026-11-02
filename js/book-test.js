import { db, functions } from './firebase-init.js';
import { t, getLang } from './i18n.js';
import { requireUser, say } from './guard.js';
import { $, el, ist, toMins, dayKey, addDays, slotsFor, chip, nameOf } from './util.js';
import { doc, getDoc, getDocs, collection, query, where } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js';

const q = new URLSearchParams(location.search), labId = q.get('l'), testId = q.get('t');
if (!labId || !testId) location.replace('/tests.html');
let lab, sch, test, price, members = [], type = '', date = '', time = '', counts = {};
const user = await requireUser(() => { head(); renderTypes(); renderMembers(); renderDates(); renderTimes(); });
const role = (await user.getIdTokenResult(true)).claims.role;
const [l, s, tt, p] = await Promise.all([getDoc(doc(db, 'labs', labId)), getDoc(doc(db, 'lab_settings', labId)), getDoc(doc(db, 'diagnostic_tests', testId)), getDoc(doc(db, 'lab_pricing', `${labId}_${testId}`))]);
if (!l.exists() || !tt.exists() || !p.exists() || l.data().verified !== true) location.replace('/tests.html');
lab = l.data(); sch = s.data(); test = tt.data(); price = p.data();
function head() {
  $('with').textContent = `${nameOf(test, getLang())} · ${lab.name}`;
  $('priceNote').textContent = t('dbk.price').replace('{n}', price.price).replace('{pay}', t(type === 'home' ? 'lab.payCollect' : 'lab.payLab'));
}
head();
const homeOk = lab.homeCollection === true && price.homeCollection === true && (sch?.collectionPins || []).length > 0;
if (role !== 'patient') { $('blocked').hidden = false; $('blocked').textContent = t('bk.patientOnly'); $('formWrap').hidden = true; }
else if (!sch || !Object.values(sch.weekly || {}).some(a => a.length)) { $('blocked').hidden = false; $('blocked').textContent = t('dbk.noHours'); $('formWrap').hidden = true; }
else {
  const fm = await getDocs(query(collection(db, 'family_members'), where('ownerUid', '==', user.uid), where('status', '==', 'active')));
  members = fm.docs.map(x => ({ id: x.id, name: x.data().name }));
  type = homeOk ? 'home' : 'lab'; renderTypes(); renderMembers(); renderDates(); head();
}
$('app').hidden = false;

function renderTypes() {
  const box = $('types'); box.replaceChildren();
  box.append(chip(t('lab.typeLab'), type === 'lab', () => setType('lab')));
  if (homeOk) box.prepend(chip(t('lab.typeHome'), type === 'home', () => setType('home')));
  else box.append(el('p', 'hint', t('dbk.noHome')));
  $('addrBox').hidden = type !== 'home';
}
function setType(x) { type = x; renderTypes(); head(); }
function renderMembers() { const s = $('member'), cur = s.value || 'self'; s.replaceChildren(new Option(t('bk.self'), 'self')); members.forEach(m => s.add(new Option(m.name, m.id))); s.value = cur; }
function renderDates() {
  const box = $('dates'); box.replaceChildren(); if (!sch) return;
  for (let i = 0; i < 14; i++) {
    const d = addDays(ist().date, i);
    if ((sch.weekly?.[dayKey(d)] || []).length) box.append(chip(`${t('day.' + dayKey(d))} ${d.slice(8)}/${d.slice(5, 7)}`, d === date, () => pickDate(d)));
  }
}
async function pickDate(d) {
  date = d; time = ''; $('confirm').disabled = true; say('msg', null);
  const snap = await getDocs(query(collection(db, 'lab_slot_counts'), where('labUid', '==', labId), where('date', '==', d)));
  counts = Object.fromEntries(snap.docs.map(x => [x.data().time, x.data().count])); renderDates(); renderTimes();
}
function renderTimes() {
  const box = $('times'); box.replaceChildren(); if (!date) return;
  const now = ist(), cap = sch.capacity || 1; let free = 0;
  for (const x of slotsFor(sch, date)) {
    const gone = (counts[x] || 0) >= cap || (date === now.date && toMins(x) < now.mins + 60);
    if (!gone) free++;
    box.append(chip(x, x === time, () => { time = x; $('confirm').disabled = false; renderTimes(); }, gone));
  }
  $('noSlots').hidden = free > 0;
}
$('confirm').addEventListener('click', async () => {
  say('msg', null);
  const phone = $('phone').value.trim();
  if (!/^[6-9]\d{9}$/.test(phone)) return say('msg', 'err.phone', false, t);
  const address = type === 'home' ? { line: $('line').value.trim(), pin: $('apin').value.trim() } : null;
  if (type === 'home' && (address.line.length < 5 || !/^\d{6}$/.test(address.pin))) return say('msg', 'dbk.badAddr', false, t);
  $('confirm').disabled = true; $('spin').hidden = false;
  try {
    await httpsCallable(functions, 'bookDiagnostic')({ labUid: labId, testIds: [testId], memberId: $('member').value, type, date, time, phone, address });
    $('summary').textContent = `${nameOf(test, getLang())} · ${lab.name} · ${date} · ${time}`; $('formWrap').hidden = true; $('done').hidden = false;
  } catch (e) {
    const k = { 'functions/already-exists': 'bk.slotTaken', 'functions/failed-precondition': 'bk.past', 'functions/out-of-range': 'dbk.noArea', 'functions/permission-denied': 'bk.patientOnly' }[e.code] || 'err.generic';
    say('msg', k, false, t); if (k === 'bk.slotTaken') await pickDate(date); else $('confirm').disabled = !time;
  }
  $('spin').hidden = true;
});
