import { auth } from './firebase-init.js';
import { t } from './i18n.js';
import { requireUser } from './guard.js';
import { finishLogin, firstName } from './auth.js';

const $ = (id) => document.getElementById(id);
let state = null;
function paint() {
  if (!state) return;
  const { role, name } = state;
  $('greet').textContent = t('dash.greet').replace('{name}', firstName(name) || '');
  $('role').textContent = t('role.' + role);
  $('patientBox').hidden = role !== 'patient';
  $('adminBox').hidden = role !== 'admin';
  $('soon').hidden = ['patient', 'admin'].includes(role);
  $('soon').textContent = t(role === 'doctor' ? 'dash.doctorSoon' : 'dash.soon');
}
const user = await requireUser(paint);
let tok = await user.getIdTokenResult(true); // fresh token so a new role shows right after approval
let role = tok.claims.role, name = user.displayName;
if (!role) { const p = await finishLogin(user); role = p.role; name = p.name || name; } // repairs a half-finished signup
state = { role, name }; paint();
$('app').hidden = false;
