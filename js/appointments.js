import { db, functions } from './firebase-init.js';
import { t } from './i18n.js';
import { requireUser, say } from './guard.js';
import { collection, getDocs, query, where } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { payEnabled, payOnline } from './pay.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js';

const $ = (id) => document.getElementById(id);
let items = [], canPay = false;
const user = await requireUser(render);
canPay = await payEnabled();
async function load() {
  const s = await getDocs(query(collection(db, 'appointments'), where('patientUid', '==', user.uid)));
  items = s.docs.map(x => ({ id: x.id, ...x.data() }));
  render();
}
const line = (cls, text) => { const p = document.createElement('p'); p.className = cls; p.textContent = text; return p; };
function render() {
  const live = (a) => ['pending', 'confirmed', 'rescheduled'].includes(a.status);
  items.sort((a, b) => (live(b) - live(a)) || `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`) * (live(a) ? 1 : -1));
  $('empty').hidden = items.length > 0;
  const box = $('list'); box.replaceChildren();
  for (const a of items) {
    const c = document.createElement('article'); c.className = 'card dr';
    const h = document.createElement('h3'); h.append(document.createTextNode(a.doctorName));
    const st = document.createElement('span'); st.className = 'status ' + a.status; st.textContent = t('st.' + a.status); h.append(st);
    c.append(h, line('', `${a.date} · ${a.time}`), line('meta', t('ap.for').replace('{name}', a.memberName)),
      line('meta', a.clinicName || ''), line('meta', t('bk.fee').replace('{n}', a.fee)));
    if (a.status === 'cancelled' && a.cancelledBy === a.doctorUid) c.append(line('meta', t('ap.byDoctor')));
    if (a.prescriptionId) { const l = document.createElement('a'); l.className = 'btn btn-ghost'; l.href = '/prescriptions.html'; l.textContent = t('rx.view'); c.append(l); }
    if (a.paymentStatus === 'paid') { c.append(line('meta', t('pay.paid'))); const rc = document.createElement('a'); rc.className = 'btn btn-ghost'; rc.href = `/receipt.html?p=${encodeURIComponent(a.paymentId)}`; rc.textContent = t('pay.receipt'); c.append(rc); }
    else if (canPay && a.status !== 'cancelled') {
      const pb = document.createElement('button'); pb.className = 'btn btn-primary'; pb.textContent = t('pay.payNow').replace('{n}', a.fee);
      pb.onclick = async () => { pb.disabled = true; try { await payOnline('appointment', a.id, `Consultation with ${a.doctorName}`); say('msg', 'pay.done', true, t); } catch (e) { say('msg', e.message === 'dismissed' ? 'pay.cancelled' : e.code === 'functions/invalid-argument' ? 'pay.badCoupon' : 'pay.failed', false, t); } await load(); };
      c.append(pb);
    }
    if (a.status === 'completed' && !a.reviewId) { const rv = document.createElement('a'); rv.className = 'btn btn-ghost'; rv.href = `/review.html?k=doctor&id=${encodeURIComponent(a.id)}`; rv.textContent = t('rv.rate'); c.append(rv); }
    if (live(a) && (a.rescheduleCount || 0) < 2) { const rs = document.createElement('a'); rs.className = 'btn btn-ghost'; rs.href = `/reschedule.html?r=${encodeURIComponent(a.id)}`; rs.textContent = t('rs.button'); c.append(rs); }
    if (live(a)) {
      const b = document.createElement('button'); b.className = 'btn btn-ghost danger'; b.textContent = t('ap.cancel');
      b.onclick = async () => {
        if (!confirm(t('ap.cancelConfirm'))) return; b.disabled = true;
        try { await httpsCallable(functions, 'cancelAppointment')({ id: a.id }); say('msg', 'ap.cancelled', true, t); await load(); }
        catch { say('msg', 'err.generic', false, t); b.disabled = false; }
      };
      c.append(b);
    }
    box.append(c);
  }
}
await load();
$('app').hidden = false;
