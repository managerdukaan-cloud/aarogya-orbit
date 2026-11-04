import { db, functions, storage } from './firebase-init.js';
import { t, getLang } from './i18n.js';
import { requireUser, say } from './guard.js';
import { $, el } from './util.js';
import { collection, getDocs, query, where } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js';
import { ref, uploadBytes } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js';

const OPEN = ['confirmed', 'collection_assigned', 'en_route', 'arrived', 'sample_collected', 'received_at_lab', 'processing', 'report_ready'];
const NEXT_HOME = { confirmed: ['collection_assigned', 'cancelled'], collection_assigned: ['en_route', 'cancelled'], en_route: ['arrived', 'cancelled'], arrived: ['sample_collected', 'cancelled'], sample_collected: ['received_at_lab'], received_at_lab: ['processing'] };
const NEXT_LAB = { confirmed: ['sample_collected', 'cancelled'], sample_collected: ['processing'] };
let items = [];
const user = await requireUser(render);
if ((await user.getIdTokenResult(true)).claims.role !== 'lab') location.replace('/dashboard.html');
const call = (n, d) => httpsCallable(functions, n)(d);
async function load() {
  const s = await getDocs(query(collection(db, 'diagnostic_bookings'), where('labUid', '==', user.uid)));
  items = s.docs.map(x => ({ id: x.id, ...x.data() })); render();
}
const testNames = (b) => (b.packageName_en ? ((getLang() === 'hi' && b.packageName_hi) || b.packageName_en) + ': ' : '') + b.tests.map(x => (getLang() === 'hi' && x.name_hi) || x.name_en).join(', ');
function render() {
  const all = $('filter').value === 'all';
  const list = items.filter(b => all || (OPEN.includes(b.status) && b.status !== 'report_ready'))
    .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`) * (all ? -1 : 1));
  $('empty').hidden = list.length > 0; const box = $('list'); box.replaceChildren();
  for (const b of list) {
    const c = el('article', 'card dr'), h = el('h3', '', `${b.date} · ${b.time}`);
    h.append(el('span', 'status ' + b.status, t('dst.' + b.status)), el('span', 'tag', t(b.type === 'home' ? 'lab.typeHome' : 'lab.typeLab'))); c.append(h);
    c.append(el('p', '', `${t('rx.patient')}: ${b.memberName} · ${b.contactPhone}`), el('p', '', testNames(b)), el('p', 'meta', `₹${b.total} · ${b.paymentStatus === 'paid' ? t('pay.paidOnline') : t(b.paymentMode === 'pay_at_collection' ? 'lab.payCollect' : 'lab.payLab')}`));
    if (b.address) c.append(el('p', 'meta', `${b.address.line} - ${b.address.pin}`));
    const act = el('div', 'actions'), next = (b.type === 'home' ? NEXT_HOME : NEXT_LAB)[b.status] || [];
    for (const s of next) {
      const btn = el('button', 'btn ' + (s === 'cancelled' ? 'btn-ghost danger' : 'btn-primary'), t('lb.to.' + s));
      btn.onclick = async () => {
        if (s === 'cancelled' && !confirm(t('act.confirmAsk'))) return;
        act.querySelectorAll('button').forEach(x => x.disabled = true);
        try { await call('updateDiagnosticStatus', { id: b.id, status: s }); say('msg', 'dap.updated', true, t); } catch { say('msg', 'err.generic', false, t); }
        await load();
      };
      act.append(btn);
    }
    if (['processing', 'report_ready'].includes(b.status)) {
      const f = el('input'); f.type = 'file'; f.accept = 'application/pdf,image/jpeg,image/png'; f.setAttribute('aria-label', t('lab.reportFile'));
      const pub = el('button', 'btn btn-primary', t(b.status === 'report_ready' ? 'lab.amend' : 'lab.publish'));
      pub.onclick = async () => {
        const file = f.files[0];
        if (!file || !['application/pdf', 'image/jpeg', 'image/png'].includes(file.type) || file.size > 5 * 1024 * 1024) return say('msg', 'err.file', false, t);
        let amendReason = '';
        if (b.status === 'report_ready') { amendReason = (prompt(t('lab.amendReason')) || '').trim(); if (amendReason.length < 5) return; }
        else if (!confirm(t('lab.publishAsk'))) return;
        pub.disabled = true;
        try {
          const safe = file.name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').slice(-60), path = `lab_reports/${user.uid}/${b.id}/${Date.now()}-${safe}`;
          await uploadBytes(ref(storage, path), file, { contentType: file.type });
          await call('publishReport', { bookingId: b.id, paths: [path], amendReason });
          say('msg', 'lab.published', true, t);
        } catch { say('msg', 'err.upload', false, t); }
        await load();
      };
      act.append(f, pub);
    }
    if (act.children.length) c.append(act); box.append(c);
  }
}
$('filter').onchange = render;
await load();
$('app').hidden = false;
