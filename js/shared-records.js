import { db, functions } from './firebase-init.js';
import { t, getLang } from './i18n.js';
import { requireUser, say } from './guard.js';
import { $, el } from './util.js';
import { collection, getDocs, query, where } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js';

let items = [];
const user = await requireUser(render);
if ((await user.getIdTokenResult(true)).claims.role !== 'doctor') location.replace('/dashboard.html');
const s = await getDocs(query(collection(db, 'consents'), where('doctorUid', '==', user.uid)));
items = s.docs.map(d => ({ id: d.id, ...d.data() })).filter(x => x.status === 'active' && x.expiresAt?.toMillis() > Date.now()); // revoked or expired shares disappear
function render() {
  $('empty').hidden = items.length > 0; const box = $('list'); box.replaceChildren();
  for (const x of items) {
    const c = el('article', 'card dr'); c.append(el('h3', '', x.title), el('p', 'meta', `${t('rc.' + x.category)} · ${x.recordDate || ''}`), el('p', '', `${t('rx.patient')}: ${x.memberName}`),
      el('p', 'mini', `${t('rec.until')} ${x.expiresAt.toDate().toLocaleDateString(getLang() === 'hi' ? 'hi-IN' : 'en-IN', { timeZone: 'Asia/Kolkata' })}`));
    const b = el('button', 'btn btn-primary', t('rec.view'));
    b.onclick = async () => { const w = window.open('', '_blank'); b.disabled = true; try { const r = (await httpsCallable(functions, 'getRecordFile')({ recordId: x.recordId })).data; if (w) w.location = URL.createObjectURL(new Blob([Uint8Array.from(atob(r.data), ch => ch.charCodeAt(0))], { type: r.contentType })); } catch { w?.close(); say('msg', 'rec.noAccess', false, t); } b.disabled = false; };
    c.append(b); box.append(c);
  }
}
render();
$('app').hidden = false;
