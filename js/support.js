import { db, functions } from './firebase-init.js';
import { t, getLang } from './i18n.js';
import { requireUser, say } from './guard.js';
import { $, el } from './util.js';
import { collection, getDocs, addDoc, query, where, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js';

let tickets = [];
const user = await requireUser(render);
const role = (await user.getIdTokenResult(true)).claims.role || 'patient', call = (n, d) => httpsCallable(functions, n)(d);
const dt = (ts) => ts?.toDate ? ts.toDate().toLocaleString(getLang() === 'hi' ? 'hi-IN' : 'en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) : '';
async function load() { tickets = (await getDocs(query(collection(db, 'support_tickets'), where('ownerUid', '==', user.uid)))).docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)); render(); }
function render() {
  $('empty').hidden = tickets.length > 0; const box = $('list'); box.replaceChildren();
  for (const k of tickets) {
    const c = el('article', 'card dr'), h = el('h3', '', k.subject); h.append(el('span', 'status' + (k.status === 'closed' ? ' cancelled' : ''), t('sp.st.' + k.status))); c.append(h, el('p', '', k.message));
    for (const r of k.replies || []) { const p = el('p', 'meta', `${r.role === 'admin' ? t('sp.team') : t('rec.you')} · ${dt(r.at)}: ${r.text}`); p.style.whiteSpace = 'pre-wrap'; c.append(p); }
    if (k.status !== 'closed') {
      const row = el('div', 'row'), inp = el('input'); inp.type = 'text'; inp.maxLength = 1000; inp.placeholder = t('sp.reply'); inp.style.cssText = 'flex:1;min-height:44px;border-radius:10px;border:0;padding:0 12px;background:var(--bg);box-shadow:var(--emboss-in)';
      const go = el('button', 'btn btn-ghost', t('sp.sendReply')), cl = el('button', 'btn btn-ghost danger', t('sp.close'));
      go.onclick = async () => { if (inp.value.trim().length < 2) return; go.disabled = true; try { await call('replyTicket', { id: k.id, text: inp.value }); await load(); } catch { say('msg', 'err.generic', false, t); go.disabled = false; } };
      cl.onclick = async () => { cl.disabled = true; try { await call('closeTicket', { id: k.id }); await load(); } catch { say('msg', 'err.generic', false, t); cl.disabled = false; } };
      row.append(inp, go, cl); c.append(row);
    }
    box.append(c);
  }
}
$('form').addEventListener('submit', async (e) => {
  e.preventDefault(); say('msg', null);
  const subject = $('subject').value.trim(), message = $('message').value.trim();
  if (subject.length < 3 || message.length < 5) return say('msg', 'err.field', false, t);
  $('send').disabled = true;
  try { await addDoc(collection(db, 'support_tickets'), { ownerUid: user.uid, ownerName: user.displayName || '', role, subject, message, status: 'open', replies: [], createdAt: serverTimestamp(), updatedAt: serverTimestamp() }); $('form').reset(); say('msg', 'sp.sent', true, t); await load(); }
  catch { say('msg', 'err.generic', false, t); }
  $('send').disabled = false;
});
await load();
$('app').hidden = false;
