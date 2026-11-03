import { db, functions } from './firebase-init.js';
import { t, getLang } from './i18n.js';
import { requireUser, say } from './guard.js';
import { $, el } from './util.js';
import { collection, getDocs } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js';

let tickets = [];
const user = await requireUser(render);
if ((await user.getIdTokenResult(true)).claims.role !== 'admin') location.replace('/dashboard.html');
const call = (n, d) => httpsCallable(functions, n)(d);
const dt = (ts) => ts?.toDate ? ts.toDate().toLocaleString(getLang() === 'hi' ? 'hi-IN' : 'en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) : '';
async function load() { tickets = (await getDocs(collection(db, 'support_tickets'))).docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0)); render(); }
function render() {
  const all = $('filter').value === 'all', list = tickets.filter(k => all || k.status !== 'closed'); $('empty').hidden = list.length > 0; const box = $('list'); box.replaceChildren();
  for (const k of list) {
    const c = el('article', 'card dr'), h = el('h3', '', k.subject); h.append(el('span', 'status' + (k.status === 'closed' ? ' cancelled' : ''), t('sp.st.' + k.status)), el('span', 'tag', t('role.' + k.role)));
    c.append(h, el('p', 'meta', `${k.ownerName || '-'} · ${dt(k.createdAt)}`), el('p', '', k.message));
    for (const r of k.replies || []) c.append(el('p', 'meta', `${r.role === 'admin' ? t('sp.team') : t('sp.user')} · ${dt(r.at)}: ${r.text}`));
    if (k.status !== 'closed') {
      const row = el('div', 'row'), inp = el('input'); inp.type = 'text'; inp.maxLength = 1000; inp.placeholder = t('sp.reply'); inp.style.cssText = 'flex:1;min-height:44px;border-radius:10px;border:0;padding:0 12px;background:var(--bg);box-shadow:var(--emboss-in)';
      const go = el('button', 'btn btn-primary', t('sp.sendReply')), cl = el('button', 'btn btn-ghost danger', t('sp.close'));
      go.onclick = async () => { if (inp.value.trim().length < 2) return; go.disabled = true; try { await call('replyTicket', { id: k.id, text: inp.value }); await load(); } catch { say('msg', 'err.generic', false, t); go.disabled = false; } };
      cl.onclick = async () => { cl.disabled = true; try { await call('closeTicket', { id: k.id }); await load(); } catch { say('msg', 'err.generic', false, t); cl.disabled = false; } };
      row.append(inp, go, cl); c.append(row);
    }
    box.append(c);
  }
}
$('filter').onchange = render;
await load();
$('app').hidden = false;
