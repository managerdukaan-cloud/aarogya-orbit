import { db } from './firebase-init.js';
import { t, getLang } from './i18n.js';
import { requireUser } from './guard.js';
import { $, el } from './util.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

const id = new URLSearchParams(location.search).get('p');
let p = null;
await requireUser(render);
try { const s = await getDoc(doc(db, 'payments', id || 'x')); p = s.exists() ? s.data() : null; } catch { p = null; }
if (!p) location.replace('/dashboard.html');
function render() {
  const box = el('article', 'card rx');
  const when = p.paidAt?.toDate ? p.paidAt.toDate().toLocaleString(getLang() === 'hi' ? 'hi-IN' : 'en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'long', timeStyle: 'short' }) : '';
  const head = el('div', 'rxhead'), l = el('div'), r = el('div');
  l.append(el('h2', '', 'AAROGYA ORBIT'), el('p', '', t('pay.receipt'))); r.append(el('p', '', `${t('pay.no')}: ${p.orderId}`), el('p', '', `${t('rx.date')}: ${when}`)); head.append(l, r); box.append(head);
  const row = (k, v) => box.append(el('p', '', `${t(k)}: ${v}`));
  row('rx.patient', p.patientName); row('pay.to', p.providerName); row('pay.for', p.description); row('pay.amount', `₹${p.amount}`);
  row('pay.status', t('pay.st.' + p.status)); if (p.razorpayPaymentId) row('pay.ref', p.razorpayPaymentId);
  box.append(el('p', 'foot', t('pay.note')));
  const b = el('button', 'btn btn-ghost no-print', t('rx.print')); b.onclick = () => window.print(); box.append(b);
  $('view').replaceChildren(box);
}
render();
$('app').hidden = false;
