import { db, functions } from './firebase-init.js';
import { t, getLang } from './i18n.js';
import { requireUser, say } from './guard.js';
import { $, el } from './util.js';
import { collection, getDocs } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js';

let items = [];
const user = await requireUser(render);
if ((await user.getIdTokenResult(true)).claims.role !== 'admin') location.replace('/dashboard.html');
const dt = (ts) => ts?.toDate ? ts.toDate().toLocaleString(getLang() === 'hi' ? 'hi-IN' : 'en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) : '';
async function load() { items = (await getDocs(collection(db, 'deletion_requests'))).docs.map(d => d.data()).sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)); render(); }
function render() {
  $('empty').hidden = items.length > 0; const box = $('list'); box.replaceChildren();
  for (const r of items) {
    const c = el('article', 'card dr'), h = el('h3', '', r.name || r.email || r.uid); h.append(el('span', 'tag', t('role.' + r.role)), el('span', 'status' + (['completed', 'rejected'].includes(r.status) ? ' cancelled' : ''), t('pc.del.' + r.status)));
    c.append(h, el('p', 'meta', `${r.email} · ${dt(r.createdAt)}`)); if (r.reason) c.append(el('p', '', r.reason)); if (r.note) c.append(el('p', 'mini', r.note));
    if (['open', 'in_progress'].includes(r.status)) {
      const act = el('div', 'actions');
      for (const [s, key, cls] of [['in_progress', 'rq.inProgress', 'btn-ghost'], ['completed', 'rq.complete', 'btn-primary'], ['rejected', 'act.reject', 'btn-ghost danger']]) {
        if (s === r.status) continue; const b = el('button', 'btn ' + cls, t(key));
        b.onclick = async () => {
          let note = ''; if (s !== 'in_progress') { note = (prompt(t('rq.notePrompt')) || '').trim(); if (note.length < 5) return; }
          b.disabled = true; try { await httpsCallable(functions, 'updateDeletionRequest')({ uid: r.uid, status: s, note }); say('msg', 'adm.done', true, t); await load(); } catch { say('msg', 'err.generic', false, t); b.disabled = false; }
        }; act.append(b);
      }
      c.append(act);
    }
    box.append(c);
  }
}
await load();
$('app').hidden = false;
