import { db } from './firebase-init.js';
import { t } from './i18n.js';
import { requireUser } from './guard.js';
import { finishLogin, firstName } from './auth.js';
import { collection, getDocs, query, where, limit } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

const $ = (id) => document.getElementById(id);
let state = null;
function paint() {
  if (!state) return;
  const { role, name } = state;
  $('greet').textContent = t('dash.greet').replace('{name}', firstName(name) || '');
  $('role').textContent = t('role.' + role);
  for (const [box, r] of [['patientBox', 'patient'], ['adminBox', 'admin'], ['doctorBox', 'doctor'], ['labBox', 'lab'], ['hospitalBox', 'hospital'], ['staffBox', 'staff']]) $(box).hidden = role !== r;
  $('soon').hidden = true;
}
const user = await requireUser(paint);
const tok = await user.getIdTokenResult(true); // fresh token so a new role shows right after approval
let role = tok.claims.role, name = user.displayName;
if (!role) { const p = await finishLogin(user); role = p.role; name = p.name || name; } // repairs a half-finished signup
state = { role, name }; paint();
$('app').hidden = false;
// unread count (best effort, never blocks the page)
getDocs(query(collection(db, 'notifications'), where('uid', '==', user.uid), where('read', '==', false), limit(50)))
  .then(s => { if (s.size) { $('unread').textContent = s.size >= 50 ? '50+' : s.size; $('unread').hidden = false; } }).catch(() => {});
