import { db } from './firebase-init.js';
import { t, getLang } from './i18n.js';
import { requireUser } from './guard.js';
import { $, el } from './util.js';
import { collection, getDocs, updateDoc, doc, query, where, limit } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

let items = [], role = 'patient';
const user = await requireUser(render);
role = (await user.getIdTokenResult(true)).claims.role || 'patient';
// Where each kind of notification leads, depending on who is reading it.
function target(type) {
  const doctor = role === 'doctor', lab = role === 'lab';
  return ({ appt_requested: '/appointments.html', appt_new: '/doctor-appointments.html', appt_confirmed: '/appointments.html', appt_completed: '/appointments.html',
    appt_cancelled: doctor ? '/doctor-appointments.html' : '/appointments.html', rx_issued: '/prescriptions.html', lab_booked: '/my-tests.html', lab_new: '/lab-bookings.html',
    lab_status: '/my-tests.html', lab_cancelled: lab ? '/lab-bookings.html' : '/my-tests.html', report_ready: '/my-tests.html', record_shared: '/shared-records.html',
    hosp_invite: '/doctor-affiliations.html', hosp_response: '/hospital-portal.html', ticket_reply: '/support.html', verified: '/dashboard.html', rejected: '/dashboard.html', appt_rescheduled: '/doctor-appointments.html', payment_paid: '/dashboard.html', payment_refunded: '/dashboard.html' })[type] || '/dashboard.html';
}
async function load() { items = (await getDocs(query(collection(db, 'notifications'), where('uid', '==', user.uid), limit(100)))).docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)); render(); }
function render() {
  $('empty').hidden = items.length > 0; $('readAll').hidden = !items.some(n => !n.read); const box = $('list'); box.replaceChildren();
  for (const n of items) {
    const key = 'nt.' + n.type, text = t(key) === key ? t('nt.unknown') : t(key);
    const c = el('a', 'card dr'); c.href = target(n.type);
    const when = n.createdAt?.toDate ? n.createdAt.toDate().toLocaleString(getLang() === 'hi' ? 'hi-IN' : 'en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) : '';
    const p = el('p', n.read ? '' : 'fee', text); c.append(p, el('p', 'mini', when));
    if (!n.read) c.onclick = () => { updateDoc(doc(db, 'notifications', n.id), { read: true }).catch(() => {}); };
    box.append(c);
  }
}
$('readAll').onclick = async () => { $('readAll').disabled = true; await Promise.all(items.filter(n => !n.read).map(n => updateDoc(doc(db, 'notifications', n.id), { read: true }).catch(() => {}))); $('readAll').disabled = false; await load(); };
await load();
$('app').hidden = false;
