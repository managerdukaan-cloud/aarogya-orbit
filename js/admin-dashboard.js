import { functions } from './firebase-init.js';
import { t } from './i18n.js';
import { requireUser, say } from './guard.js';
import { $, el } from './util.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js';

let s = null;
const user = await requireUser(render);
if ((await user.getIdTokenResult(true)).claims.role !== 'admin') location.replace('/dashboard.html');
try { s = (await httpsCallable(functions, 'adminStats')()).data; } catch { say('msg', 'err.generic', false, t); }
const tile = (label, value, href) => { const c = el(href ? 'a' : 'article', 'card'); if (href) c.href = href; c.append(el('p', 'mini', t(label)), el('p', 'price', String(value))); return c; };
function render() {
  const box = $('stats'); box.replaceChildren(); if (!s) return;
  [['ad.patients', s.patients], ['ad.doctors', s.doctors], ['ad.labs', s.labs], ['ad.hospitals', s.hospitals],
   ['ad.appts', s.appointments.total], ['ad.apptsPending', s.appointments.pending], ['ad.apptsDone', s.appointments.completed], ['ad.apptsCancelled', s.appointments.cancelled],
   ['ad.diag', s.diagnostics.total], ['ad.diagReady', s.diagnostics.reportReady]].forEach(([k, v]) => box.append(tile(k, v)));
  const p = s.pending.doctors + s.pending.labs + s.pending.hospitals;
  box.prepend(tile('ad.pendingAll', p, '/admin.html'), tile('ad.tickets', s.openTickets, '/admin-support.html'));
}
render();
$('app').hidden = false;
