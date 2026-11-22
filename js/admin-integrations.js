import { db, functions } from './firebase-init.js';
import { t } from './i18n.js';
import { requireUser, say } from './guard.js';
import { $, el } from './util.js';
import { collection, getDocs, setDoc, doc, query, orderBy, limit, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js';

let st = null, counts = {};
const user = await requireUser(render);
if ((await user.getIdTokenResult(true)).claims.role !== 'admin') location.replace('/dashboard.html');
async function load() {
  try { st = (await httpsCallable(functions, 'integrationStatus')()).data; } catch { say('msg', 'err.generic', false, t); }
  try { counts = {}; (await getDocs(query(collection(db, 'email_outbox'), orderBy('createdAt', 'desc'), limit(100)))).docs.forEach(d => { const s = d.data().status; counts[s] = (counts[s] || 0) + 1; }); } catch {}
  render();
}
function card(key, s, docName) {
  const c = el('article', 'card dr'), h = el('h3', '', t('ig.' + key)); h.append(el('span', 'status' + (s.configured ? '' : ' cancelled'), t(s.configured ? 'ig.keysOk' : 'ig.keysNo')), el('span', 'status' + (s.enabled ? '' : ' cancelled'), t(s.enabled ? 'ig.on' : 'ig.off')));
  c.append(h, el('p', 'meta', t('ig.' + key + 'D')));
  if (docName) {
    const l = el('label', 'check'), cb = el('input'); cb.type = 'checkbox'; cb.checked = s.enabled; l.append(cb, el('span', '', t('ig.enable')));
    const b = el('button', 'btn btn-primary', t('prof.save'));
    b.onclick = async () => {
      if (cb.checked && !s.configured && !confirm(t('ig.enableAsk'))) return;
      try { await setDoc(doc(db, 'settings', docName), { enabled: cb.checked, updatedAt: serverTimestamp() }); say('msg', 'adm.done', true, t); await load(); } catch { say('msg', 'err.generic', false, t); }
    };
    c.append(l, b);
  } else { const a = el('a', 'btn btn-ghost', t('ad.payments')); a.href = '/admin-payments.html'; c.append(a); }
  return c;
}
function render() {
  const box = $('cards'); box.replaceChildren(); if (!st) return;
  box.append(card('pay', st.payments, null), card('email', st.email, 'email'), card('ai', st.ai, 'ai'));
  const ob = $('outbox'); ob.replaceChildren();
  for (const k of ['queued', 'accepted', 'skipped', 'failed']) ob.append(el('span', 'tag', `${t('ig.q.' + k)}: ${counts[k] || 0}`));
}
await load();
$('app').hidden = false;
