import { db, functions } from './firebase-init.js';
import { t, getLang } from './i18n.js';
import { requireUser, say } from './guard.js';
import { $, el } from './util.js';
import { collection, getDocs, getDoc, doc, query, where } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { payEnabled, payOnline } from './pay.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js';

let items = [], reports = {}, canPay = false;
const user = await requireUser(render);
canPay = await payEnabled();
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
    c.append(el('p', '', (b.packageName_en ? ((getLang() === 'hi' && b.packageName_hi) || b.packageName_en) + ': ' : '') + b.tests.map(x => (getLang() === 'hi' && x.name_hi) || x.name_en).join(', ')), el('p', '', `${b.date} · ${b.time} · ${t(b.type === 'home' ? 'lab.typeHome' : 'lab.typeLab')}`),
      el('p', 'meta', t('ap.for').replace('{name}', b.memberName)), el('p', 'meta', `₹${b.total} · ${t(b.paymentMode === 'pay_at_collection' ? 'lab.payCollect' : 'lab.payLab')}`));
    if (b.address) c.append(el('p', 'meta', `${b.address.line} - ${b.address.pin}`));
    const act = el('div', 'actions');
    if (['confirmed', 'collection_assigned'].includes(b.status)) {
      const x = el('button', 'btn btn-ghost danger', t('ap.cancel'));
      x.onclick = async () => { if (!confirm(t('ap.cancelConfirm'))) return; x.disabled = true; try { await call('cancelDiagnosticBooking', { id: b.id }); say('msg', 'ap.cancelled', true, t); } catch { say('msg', 'err.generic', false, t); } await load(); };
      act.append(x);
    }
    if (b.paymentStatus === 'paid') { const rc = el('a', 'btn btn-ghost', t('pay.receipt')); rc.href = `/receipt.html?p=${encodeURIComponent(b.paymentId)}`; act.append(rc); }
    else if (canPay && b.status !== 'cancelled') {
      const pb = el('button', 'btn btn-primary', t('pay.payNow').replace('{n}', b.total));
      pb.onclick = async () => { pb.disabled = true; try { await payOnline('diagnostic', b.id, b.labName); say('msg', 'pay.done', true, t); } catch (e) { say('msg', e.message === 'dismissed' ? 'pay.cancelled' : e.code === 'functions/invalid-argument' ? 'pay.badCoupon' : 'pay.failed', false, t); } await load(); };
      act.append(pb);
    }
    if (b.status === 'report_ready' && !b.reviewId) { const rv = el('a', 'btn btn-ghost', t('rv.rateLab')); rv.href = `/review.html?k=lab&id=${encodeURIComponent(b.id)}`; act.append(rv); }
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
