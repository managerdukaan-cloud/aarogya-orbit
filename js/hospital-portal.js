import { db, functions } from './firebase-init.js';
import { t } from './i18n.js';
import { requireUser, say } from './guard.js';
import { $, el } from './util.js';
import { collection, getDocs, getDoc, updateDoc, doc, query, where, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js';

let links = [];
const user = await requireUser(render);
if ((await user.getIdTokenResult(true)).claims.role !== 'hospital') location.replace('/dashboard.html');
const call = (n, d) => httpsCallable(functions, n)(d);
const h = (await getDoc(doc(db, 'hospitals', user.uid))).data();
$('hname').textContent = h.name; $('hmeta').textContent = `${t('ha.' + h.type)} · ${h.address} - ${h.pin}`;
$('departments').value = (h.departments || []).join(', '); $('phone').value = h.phone || '';
async function load() { links = (await getDocs(query(collection(db, 'hospital_links'), where('hospitalUid', '==', user.uid)))).docs.map(d => ({ id: d.id, ...d.data() })); render(); }
function render() {
  const live = links.filter(l => ['active', 'invited'].includes(l.status)); $('noneLinks').hidden = live.length > 0; const box = $('links'); box.replaceChildren();
  for (const l of live) {
    const c = el('article', 'card dr'), hh = el('h3', '', l.doctorName); hh.append(el('span', 'status' + (l.status === 'active' ? '' : ' pending'), t(l.status === 'active' ? 'hp.active' : 'hp.invited'))); c.append(hh);
    const b = el('button', 'btn btn-ghost danger', t(l.status === 'active' ? 'hp.remove' : 'hp.cancelInvite'));
    b.onclick = async () => { if (!confirm(t('act.confirmAsk'))) return; b.disabled = true; try { await call('removeAffiliation', { id: l.id }); await load(); } catch { say('msg', 'err.generic', false, t); b.disabled = false; } };
    c.append(b); box.append(c);
  }
}
$('saveInfo').onclick = async () => {
  const departments = [...new Set($('departments').value.split(',').map(s => s.trim()).filter(Boolean))].slice(0, 20), phone = $('phone').value.trim();
  if (departments.some(d => d.length > 40) || !/^[6-9]\d{9}$/.test(phone)) return say('msg', 'err.phone', false, t);
  try { await updateDoc(doc(db, 'hospitals', user.uid), { departments, phone, updatedAt: serverTimestamp() }); say('msg', 'prof.saved', true, t); } catch { say('msg', 'err.generic', false, t); }
};
$('invite').onclick = async () => {
  const regNumber = $('reg').value.trim(); if (regNumber.length < 3) return say('msg', 'err.field', false, t);
  $('invite').disabled = true;
  try { await call('inviteDoctor', { regNumber }); $('reg').value = ''; say('msg', 'hp.sent', true, t); await load(); }
  catch (e) { say('msg', { 'functions/not-found': 'hp.notFound', 'functions/already-exists': 'hp.already', 'functions/failed-precondition': 'hp.other' }[e.code] || 'err.generic', false, t); }
  $('invite').disabled = false;
};
await load();
$('app').hidden = false;
