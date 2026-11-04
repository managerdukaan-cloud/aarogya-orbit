import { db, functions } from './firebase-init.js';
import { t, getLang } from './i18n.js';
import { requireUser, say } from './guard.js';
import { $, el } from './util.js';
import { collection, getDocs, query, orderBy, limit } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js';

let items = [];
const user = await requireUser(render);
if ((await user.getIdTokenResult(true)).claims.role !== 'admin') location.replace('/dashboard.html');
async function load() { items = (await getDocs(query(collection(db, 'reviews'), orderBy('createdAt', 'desc'), limit(200)))).docs.map(d => ({ id: d.id, ...d.data() })); render(); }
function render() {
  $('empty').hidden = items.length > 0; const box = $('list'); box.replaceChildren();
  for (const r of items) {
    const c = el('article', 'card dr'), h = el('h3', '', '★'.repeat(r.rating)); h.append(el('span', 'tag', t(r.kind === 'doctor' ? 'rv.doctor' : 'rv.lab')), el('span', 'status' + (r.status === 'hidden' ? ' cancelled' : ''), t(r.status === 'hidden' ? 'rv.hidden' : 'rv.published')));
    const p = el('p', '', r.comment || '-'); p.style.whiteSpace = 'pre-wrap'; c.append(h, p);
    const hide = r.status !== 'hidden', b = el('button', 'btn btn-ghost' + (hide ? ' danger' : ''), t(hide ? 'rv.hide' : 'rv.restore'));
    b.onclick = async () => { b.disabled = true; try { await httpsCallable(functions, 'moderateReview')({ id: r.id, action: hide ? 'hide' : 'show' }); say('msg', 'adm.done', true, t); await load(); } catch { say('msg', 'err.generic', false, t); b.disabled = false; } };
    c.append(b); box.append(c);
  }
}
await load();
$('app').hidden = false;
