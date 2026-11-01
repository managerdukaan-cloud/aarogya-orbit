import { auth } from './firebase-init.js';
import { initLang, setLang, t } from './i18n.js';
import { finishLogin, firstName } from './auth.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';

document.querySelectorAll('.lang button').forEach(b => b.addEventListener('click', async () => { await setLang(b.dataset.lang); paint(); }));
await initLang();
let state = null;
function paint() {
  if (!state) return;
  document.getElementById('greet').textContent = t('dash.greet').replace('{name}', firstName(state.name) || '');
  document.getElementById('role').textContent = t('role.' + state.role);
  document.getElementById('soon').hidden = state.role === 'patient';
  document.getElementById('patientBox').hidden = state.role !== 'patient';
}
onAuthStateChanged(auth, async (user) => {
  if (!user) return location.replace('/auth.html');
  let role = (await user.getIdTokenResult()).claims.role, name = user.displayName;
  if (!role) { const p = await finishLogin(user); role = p.role; name = p.name || name; } // repairs a half-finished signup
  state = { role, name }; paint();
  document.getElementById('app').hidden = false;
});
document.getElementById('logout').addEventListener('click', async () => { await signOut(auth); location.replace('/'); });
