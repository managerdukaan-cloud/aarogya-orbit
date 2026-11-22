import { db, functions } from './firebase-init.js';
import { t } from './i18n.js';
import { requireUser, say } from './guard.js';
import { $, el } from './util.js';
import { collection, getDocs, query, where } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js';

let links = [];
const user = await requireUser(render);
if ((await user.getIdTokenResult(true)).claims.role !== 'doctor') location.replace('/dashboard.html');
const call = (n, d) => httpsCallable(functions, n)(d);
async function load() { links = (await getDocs(query(collection(db, 'hospital_links'), where('doctorUid', '==', user.uid)))).docs.map(d => ({ id: d.id, ...d.data() })).filter(l => ['active', 'invited'].includes(l.status)); render(); }
function render() {
  $('empty').hidden = links.length > 0; const box = $('list'); box.replaceChildren();
  for (const l of links) {
    const c = el('article', 'card dr'), h = el('h3', '', l.hospitalName); h.append(el('span', 'status' + (l.status === 'active' ? '' : ' pending'), t(l.status === 'active' ? 'hp.active' : 'hp.invited'))); c.append(h);
    const act = el('div', 'actions'), go = async (fn, data) => { act.querySelectorAll('button').forEach(b => b.disabled = true); try { await call(fn, data); await load(); } catch { say('msg', 'err.generic', false, t); await load(); } };
    if (l.status === 'invited') {
      const a = el('button', 'btn btn-primary', t('act.confirm')), d = el('button', 'btn btn-ghost danger', t('act.reject'));
      a.onclick = () => go('respondAffiliation', { id: l.id, accept: true }); d.onclick = () => go('respondAffiliation', { id: l.id, accept: false }); act.append(a, d);
    } else { const r = el('button', 'btn btn-ghost danger', t('da.leave')); r.onclick = () => confirm(t('act.confirmAsk')) && go('removeAffiliation', { id: l.id }); act.append(r); }
    c.append(act); box.append(c);
  }
}
await load();
$('app').hidden = false;
