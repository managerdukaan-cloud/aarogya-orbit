import { db, functions } from './firebase-init.js';
import { t, getLang } from './i18n.js';
import { requireUser, say } from './guard.js';
import { $, el } from './util.js';
import { collection, getDocs, getDoc, setDoc, doc, query, where, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js';

let shares = [], access = [], del = null;
const user = await requireUser(render);
const call = (n, d) => httpsCallable(functions, n)(d);
const dt = (ts) => ts?.toDate ? ts.toDate().toLocaleString(getLang() === 'hi' ? 'hi-IN' : 'en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) : '';
async function load() {
  const [c, a, p, d] = await Promise.all([
    getDocs(query(collection(db, 'consents'), where('ownerUid', '==', user.uid))), getDocs(query(collection(db, 'record_access'), where('ownerUid', '==', user.uid))),
    getDoc(doc(db, 'notification_preferences', user.uid)), getDoc(doc(db, 'deletion_requests', user.uid))]);
  shares = c.docs.map(x => ({ id: x.id, ...x.data() })).filter(x => x.status === 'active' && x.expiresAt?.toMillis() > Date.now());
  access = a.docs.map(x => x.data()).sort((x, y) => (y.at?.seconds || 0) - (x.at?.seconds || 0)).slice(0, 30);
  const pf = p.data() || {}; $('reminders').checked = pf.reminders !== false; $('updates').checked = pf.updates !== false;
  del = d.exists() ? d.data() : null; render();
}
function render() {
  $('noShares').hidden = shares.length > 0; const sb = $('shares'); sb.replaceChildren();
  for (const s of shares) {
    const c = el('article', 'card dr'); c.append(el('h3', '', s.title), el('p', 'meta', `${s.doctorName} · ${t('rec.until')} ${dt(s.expiresAt)}`));
    const b = el('button', 'btn btn-ghost danger', t('rec.revoke')); b.onclick = async () => { b.disabled = true; try { await call('revokeShare', { consentId: s.id }); await load(); } catch { say('msg', 'err.generic', false, t); b.disabled = false; } };
    c.append(b); sb.append(c);
  }
  $('noAccess').hidden = access.length > 0; const ab = $('access'); ab.replaceChildren();
  for (const x of access) ab.append(el('p', 'mini', `${dt(x.at)} · ${t('ra.' + x.action)} · ${t(x.byRole === 'doctor' ? 'role.doctor' : 'rec.you')}`));
  const open = del && ['open', 'in_progress'].includes(del.status);
  $('delForm').hidden = !!open; $('delState').hidden = !del;
  if (del) $('delState').textContent = t('pc.del.' + del.status) + (del.note ? ` — ${del.note}` : '');
}
$('savePrefs').onclick = async () => { try { await setDoc(doc(db, 'notification_preferences', user.uid), { reminders: $('reminders').checked, updates: $('updates').checked, updatedAt: serverTimestamp() }); say('msg', 'prof.saved', true, t); } catch { say('msg', 'err.generic', false, t); } };
$('export').onclick = async () => {
  $('export').disabled = true;
  try { const d = (await call('exportMyData')).data, a = el('a'); a.href = URL.createObjectURL(new Blob([JSON.stringify(d, null, 2)], { type: 'application/json' })); a.download = 'aarogya-orbit-my-data.json'; a.click(); say('msg', 'pc.downloaded', true, t); }
  catch (e) { say('msg', e.code === 'functions/resource-exhausted' ? 'err.many' : 'err.generic', false, t); }
  $('export').disabled = false;
};
$('delete').onclick = async () => {
  if (!confirm(t('pc.deleteAsk'))) return; $('delete').disabled = true;
  try { await call('requestAccountDeletion', { reason: $('reason').value.trim() }); say('msg', 'pc.requested', true, t); await load(); }
  catch (e) { say('msg', e.code === 'functions/already-exists' ? 'pc.already' : 'err.generic', false, t); }
  $('delete').disabled = false;
};
await load();
$('app').hidden = false;
