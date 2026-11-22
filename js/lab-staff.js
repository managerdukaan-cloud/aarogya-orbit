import { db, functions } from './firebase-init.js';
import { t } from './i18n.js';
import { requireUser, say } from './guard.js';
import { $, el } from './util.js';
import { collection, getDocs, query, where } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js';

let staff = [];
const user = await requireUser(render);
if ((await user.getIdTokenResult(true)).claims.role !== 'lab') location.replace('/dashboard.html'); // only the owner manages staff
const call = (n, d) => httpsCallable(functions, n)(d);
async function load() { staff = (await getDocs(query(collection(db, 'lab_staff'), where('labUid', '==', user.uid), where('status', '==', 'active')))).docs.map(d => d.data()); render(); }
function render() {
  $('empty').hidden = staff.length > 0; const box = $('list'); box.replaceChildren();
  for (const s of staff) {
    const c = el('article', 'card dr'); c.append(el('h3', '', s.name || s.email), el('p', 'meta', s.email), el('p', 'mini', `${t('st.permBookings')}${s.canReports ? ' · ' + t('st.permReports') : ''}`));
    const b = el('button', 'btn btn-ghost danger', t('st.remove')); b.onclick = async () => { if (!confirm(t('st.removeAsk'))) return; b.disabled = true; try { await call('removeLabStaff', { staffUid: s.staffUid }); await load(); } catch { say('msg', 'err.generic', false, t); b.disabled = false; } };
    c.append(b); box.append(c);
  }
}
$('add').onclick = async () => {
  say('msg', null); const email = $('email').value.trim();
  if (!/^\S+@\S+\.\S+$/.test(email)) return say('msg', 'err.email', false, t);
  $('add').disabled = true;
  try { await call('addLabStaff', { email, canBookings: true, canReports: $('canReports').checked }); $('email').value = ''; say('msg', 'st.added', true, t); await load(); }
  catch (e) { say('msg', { 'functions/not-found': 'st.noAccount', 'functions/failed-precondition': 'st.cannot', 'functions/resource-exhausted': 'st.limit' }[e.code] || 'err.generic', false, t); }
  $('add').disabled = false;
};
await load();
$('app').hidden = false;
