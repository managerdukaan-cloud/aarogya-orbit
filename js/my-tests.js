import { db, functions } from './firebase-init.js';
import { t, getLang } from './i18n.js';
import { requireUser, say } from './guard.js';
import { $, el } from './util.js';
import { collection, getDocs, getDoc, doc, query, where } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js';

let items = [], reports = {};
const user = await requireUser(render);
const call = (n, d) => httpsCallable(functions, n)(d);
async function load() {
  const s = await getDocs(query(collection(db, 'diagnostic_bookings'), where('patientUid', '==', user.uid)));
  items = s.docs.map(x => ({ id: x.id, ...x.data() }));
  for (const b of items.filter(b => b.reportId)) { const r = await getDoc(doc(db, 'lab_reports', b.reportId)); if (r.exists()) reports[b.id] = r.data(); }
  render();
}
const live = (b) => !['cancelled', 'report_ready'].includes(b.status);
function render() {
  items.sort((a, b) => (live(b) - live(a)) || `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`));
  $('empty').hidden = items.length > 0; const box = $('list'); box.replaceChildren();
  for (const b of items) {
    const c = el('article', 'card dr'), h = el('h3', '', b.labName);
    h.append(el('span', 'status ' + b.status, t('dst.' + b.status))); c.append(h);
    c.append(el('p', '', b.tests.map(x => (getLang() === 'hi' && x.name_hi) || x.name_en).join(', ')), el('p', '', `${b.date} · ${b.time} · ${t(b.type === 'home' ? 'lab.typeHome' : 'lab.typeLab')}`),
      el('p', 'meta', t('ap.for').replace('{name}', b.memberName)), el('p', 'meta', `₹${b.total} · ${t(b.paymentMode === 'pay_at_collection' ? 'lab.payCollect' : 'lab.payLab')}`));
    if (b.address) c.append(el('p', 'meta', `${b.address.line} - ${b.address.pin}`));
    const act = el('div', 'actions');
    if (['confirmed', 'collection_assigned'].includes(b.status)) {
      const x = el('button', 'btn btn-ghost danger', t('ap.cancel'));
      x.onclick = async () => { if (!confirm(t('ap.cancelConfirm'))) return; x.disabled = true; try { await call('cancelDiagnosticBooking', { id: b.id }); say('msg', 'ap.cancelled', true, t); } catch { say('msg', 'err.generic', false, t); } await load(); };
      act.append(x);
    }
    for (const f of reports[b.id]?.files || []) {
      const v = el('button', 'btn btn-primary', `${t('mt.report')}: ${f.name}`.slice(0, 60));
      v.onclick = async () => {
        const w = window.open('', '_blank'); v.disabled = true; // opened first so the popup blocker allows it
        try { const r = (await call('getReportFile', { bookingId: b.id, path: f.path })).data; const bytes = Uint8Array.from(atob(r.data), ch => ch.charCodeAt(0)); if (w) w.location = URL.createObjectURL(new Blob([bytes], { type: r.contentType })); }
        catch { w?.close(); say('msg', 'err.generic', false, t); }
        v.disabled = false;
      };
      act.append(v);
    }
    if (act.children.length) c.append(act); box.append(c);
  }
}
await load();
$('app').hidden = false;
