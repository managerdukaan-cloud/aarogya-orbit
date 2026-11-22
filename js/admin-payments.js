import { db, functions } from './firebase-init.js';
import { t, getLang } from './i18n.js';
import { requireUser, say } from './guard.js';
import { $, el } from './util.js';
import { collection, getDocs, getDoc, setDoc, doc, query, orderBy, limit, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js';

let pays = [], cfg = { configured: false, enabled: false };
const user = await requireUser(render);
if ((await user.getIdTokenResult(true)).claims.role !== 'admin') location.replace('/dashboard.html');
const call = (n, d) => httpsCallable(functions, n)(d);
const dt = (ts) => ts?.toDate ? ts.toDate().toLocaleString(getLang() === 'hi' ? 'hi-IN' : 'en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) : '';
const set = (await getDoc(doc(db, 'settings', 'platform'))).data() || {};
$('pct').value = set.commissionPct ?? 0; $('fee').value = set.fixedFee ?? 0; $('enabled').checked = set.onlinePaymentEnabled === true;
try { cfg = (await call('paymentConfig')).data; } catch {}
async function load() { pays = (await getDocs(query(collection(db, 'payments'), orderBy('createdAt', 'desc'), limit(200)))).docs.map(d => ({ id: d.id, ...d.data() })); render(); }
function render() {
  $('state').textContent = t(cfg.configured ? (cfg.enabled ? 'pay.stateOn' : 'pay.stateOff') : 'pay.stateNo');
  const paid = pays.filter(p => p.status === 'paid'), ref = pays.filter(p => p.status === 'refunded'), sum = (a, k) => Math.round(a.reduce((s, p) => s + (p[k] || 0), 0) * 100) / 100;
  const box = $('stats'); box.replaceChildren();
  [['pay.collected', '₹' + sum(paid, 'amount')], ['pay.commissionTotal', '₹' + sum(paid, 'commission')], ['pay.providerTotal', '₹' + sum(paid, 'providerShare')], ['pay.refunded', '₹' + sum(ref, 'amount')]]
    .forEach(([k, v]) => { const c = el('article', 'card'); c.append(el('p', 'mini', t(k)), el('p', 'price', v)); box.append(c); });
  $('empty').hidden = pays.length > 0; const list = $('list'); list.replaceChildren();
  for (const p of pays) {
    const c = el('article', 'card dr'), h = el('h3', '', `₹${p.amount} · ${p.providerName}`); h.append(el('span', 'status' + (p.status === 'paid' ? '' : p.status === 'refunded' ? ' cancelled' : ' pending'), t('pay.st.' + p.status))); c.append(h, el('p', 'meta', `${p.description} · ${dt(p.paidAt || p.createdAt)}`));
    if (p.status === 'paid') {
      const rc = el('a', 'btn btn-ghost', t('pay.receipt')); rc.href = `/receipt.html?p=${encodeURIComponent(p.orderId)}`;
      const rf = el('button', 'btn btn-ghost danger', t('pay.refund'));
      rf.onclick = async () => { const reason = (prompt(t('pay.refundReason')) || '').trim(); if (reason.length < 5 || !confirm(t('pay.refundAsk'))) return; rf.disabled = true; try { await call('adminRefund', { orderId: p.orderId, reason }); say('msg', 'adm.done', true, t); await load(); } catch { say('msg', 'err.generic', false, t); rf.disabled = false; } };
      const act = el('div', 'actions'); act.append(rc, rf); c.append(act);
    }
    list.append(c);
  }
}
$('save').onclick = async () => {
  const pct = Number($('pct').value), fee = Number($('fee').value);
  if (!(pct >= 0 && pct <= 50) || !(fee >= 0 && fee <= 1000)) return say('msg', 'pay.badSettings', false, t);
  if ($('enabled').checked && !cfg.configured && !confirm(t('pay.enableAsk'))) return;
  try { await setDoc(doc(db, 'settings', 'platform'), { commissionPct: pct, fixedFee: fee, onlinePaymentEnabled: $('enabled').checked, updatedAt: serverTimestamp() }); cfg = (await call('paymentConfig')).data; say('msg', 'adm.done', true, t); render(); }
  catch { say('msg', 'err.generic', false, t); }
};
await load();
$('app').hidden = false;
