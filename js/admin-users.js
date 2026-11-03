import { db, functions } from './firebase-init.js';
import { t } from './i18n.js';
import { requireUser, say } from './guard.js';
import { $, el } from './util.js';
import { collection, getDocs, query, limit } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js';

let users = [];
const user = await requireUser(() => { fill(); render(); });
if ((await user.getIdTokenResult(true)).claims.role !== 'admin') location.replace('/dashboard.html');
function fill() { const s = $('role'), v = s.value; s.replaceChildren(new Option(t('ad.allRoles'), '')); ['patient', 'doctor', 'lab', 'hospital', 'admin'].forEach(r => s.add(new Option(t('role.' + r), r))); s.value = v; }
async function load() { users = (await getDocs(query(collection(db, 'users'), limit(200)))).docs.map(d => ({ id: d.id, ...d.data() })); fill(); render(); }
function render() {
  const q = $('q').value.trim().toLowerCase(), r = $('role').value, box = $('list'); box.replaceChildren();
  const list = users.filter(u => (!r || u.role === r) && (!q || `${u.name} ${u.email}`.toLowerCase().includes(q)));
  for (const u of list) {
    const c = el('article', 'card dr'), h = el('h3', '', u.name || '-'); h.append(el('span', 'badge', t('role.' + u.role))); if (u.status === 'suspended') h.append(el('span', 'status cancelled', t('ad.suspended'))); c.append(h, el('p', 'meta', u.email || ''));
    if (u.role !== 'admin' && u.id !== user.uid) {
      const sus = u.status === 'suspended', b = el('button', 'btn btn-ghost' + (sus ? '' : ' danger'), t(sus ? 'ad.reactivate' : 'ad.suspend'));
      b.onclick = async () => { if (!confirm(t(sus ? 'ad.reactivateAsk' : 'ad.suspendAsk'))) return; b.disabled = true; try { await httpsCallable(functions, 'setUserStatus')({ uid: u.id, status: sus ? 'active' : 'suspended' }); say('msg', 'adm.done', true, t); await load(); } catch { say('msg', 'err.generic', false, t); b.disabled = false; } };
      c.append(b);
    }
    box.append(c);
  }
  $('more').hidden = users.length < 200;
}
['q', 'role'].forEach(id => $(id).addEventListener('input', render));
await load();
$('app').hidden = false;
