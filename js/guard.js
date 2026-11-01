// Shared by signed-in pages: language switch, logout, and redirect to login if not signed in.
import { auth } from './firebase-init.js';
import { initLang, setLang } from './i18n.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';

export function requireUser(onLang) {
  document.querySelectorAll('.lang button').forEach(b => b.addEventListener('click', async () => { await setLang(b.dataset.lang); onLang?.(); }));
  document.getElementById('logout')?.addEventListener('click', async () => { await signOut(auth); location.replace('/'); });
  return new Promise((resolve) => {
    initLang().then(() => onAuthStateChanged(auth, (u) => { if (!u) location.replace('/auth.html'); else resolve(u); }));
  });
}
export function say(id, key, ok = false, t) {
  const m = document.getElementById(id); m.hidden = !key; if (!key) return;
  m.textContent = t(key); m.className = 'msg ' + (ok ? 'ok' : 'bad');
}
