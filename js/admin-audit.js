import { db } from './firebase-init.js';
import { getLang } from './i18n.js';
import { requireUser } from './guard.js';
import { $, el } from './util.js';
import { collection, getDocs, query, orderBy, limit } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

const user = await requireUser(render);
if ((await user.getIdTokenResult(true)).claims.role !== 'admin') location.replace('/dashboard.html');
const rows = (await getDocs(query(collection(db, 'audit_logs'), orderBy('at', 'desc'), limit(100)))).docs.map(d => d.data());
const short = (u) => (u === 'system' ? 'system' : (u || '-').slice(0, 8));
function render() {
  const b = $('rows'); b.replaceChildren();
  for (const r of rows) {
    const tr = el('tr'); const when = r.at?.toDate ? r.at.toDate().toLocaleString(getLang() === 'hi' ? 'hi-IN' : 'en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) : '';
    [when, r.action, short(r.by), short(r.targetUid)].forEach(v => { const td = el('td', '', v); td.style.cssText = 'border-bottom:1px solid var(--border);padding:8px 6px'; tr.append(td); }); b.append(tr);
  }
}
render();
$('app').hidden = false;
