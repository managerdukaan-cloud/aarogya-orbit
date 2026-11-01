import { auth } from './firebase-init.js';
import { initLang, setLang, t } from './i18n.js';
import { finishLogin, routeFor, firstName } from './auth.js';
import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider,
  sendPasswordResetEmail, updateProfile, sendEmailVerification, onAuthStateChanged
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';

const $ = (id) => document.getElementById(id);
let mode = 'login', busy = false;

document.querySelectorAll('.lang button').forEach(b => b.addEventListener('click', () => setLang(b.dataset.lang)));
await initLang();
onAuthStateChanged(auth, (u) => { if (u && !busy) location.replace('/dashboard.html'); });

const ERR = {
  'auth/invalid-credential': 'err.invalid', 'auth/wrong-password': 'err.invalid', 'auth/user-not-found': 'err.invalid',
  'auth/email-already-in-use': 'err.exists', 'auth/weak-password': 'err.weak', 'auth/invalid-email': 'err.email',
  'auth/network-request-failed': 'err.network', 'auth/too-many-requests': 'err.many',
  'auth/popup-closed-by-user': null, 'auth/cancelled-popup-request': null
};
function say(key, ok = false) {
  const m = $('msg'); m.hidden = !key; if (!key) return;
  m.textContent = t(key); m.className = 'msg ' + (ok ? 'ok' : 'bad');
}
function fail(e) {
  const code = e?.code || '';
  if (code.startsWith('functions/')) return say('err.setup');
  if (code in ERR) return ERR[code] && say(ERR[code]);
  say('err.generic');
}
function setBusy(v) { busy = v; $('submit').disabled = v; $('google').disabled = v; $('spin').hidden = !v; }

function setMode(m) {
  mode = m; say(null);
  document.querySelectorAll('[data-tab]').forEach(b => b.setAttribute('aria-selected', b.dataset.tab === m));
  document.querySelectorAll('.only-signup').forEach(e => e.hidden = m !== 'signup');
  document.querySelectorAll('.only-login').forEach(e => e.hidden = m !== 'login');
  $('title').dataset.i18n = m === 'login' ? 'auth.login.title' : 'auth.signup.title';
  $('submitLabel').dataset.i18n = m === 'login' ? 'auth.login.btn' : 'auth.signup.btn';
  $('title').textContent = t($('title').dataset.i18n);
  $('submitLabel').textContent = t($('submitLabel').dataset.i18n);
  $('password').autocomplete = m === 'login' ? 'current-password' : 'new-password';
}
document.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => setMode(b.dataset.tab)));

$('toggle').addEventListener('click', () => {
  const show = $('password').type === 'password';
  $('password').type = show ? 'text' : 'password';
  $('toggle').textContent = t(show ? 'auth.hide' : 'auth.show');
  $('toggle').setAttribute('aria-pressed', show);
});

// Password strength: length plus variety. Minimum accepted is 8 characters.
function strength(p) {
  let s = 0;
  if (p.length >= 8) s++; if (p.length >= 12) s++;
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) s++;
  if (/\d/.test(p) && /[^A-Za-z0-9]/.test(p)) s++;
  return Math.min(s, 4);
}
$('password').addEventListener('input', () => {
  const s = strength($('password').value);
  $('meter').dataset.level = $('password').value ? s : 0;
  $('strengthText').textContent = $('password').value ? t(['auth.s1', 'auth.s1', 'auth.s2', 'auth.s3', 'auth.s4'][s]) : '';
});

async function welcome(user, profile) {
  const name = firstName(profile.name || user.displayName);
  $('hello').textContent = name ? t('auth.hello').replace('{name}', name) : '';
  $('welcome').hidden = false;
  setTimeout(() => location.replace(routeFor(profile.role)), 2200);
}
async function afterAuth(cred) {
  const profile = await finishLogin(cred.user);
  await welcome(cred.user, profile);
}

$('form').addEventListener('submit', async (e) => {
  e.preventDefault(); say(null);
  const name = $('name').value.trim(), email = $('email').value.trim(), pw = $('password').value;
  if (!/^\S+@\S+\.\S+$/.test(email)) return say('err.email');
  if (mode === 'signup') {
    if (name.length < 2) return say('err.name');
    if (pw.length < 8) return say('err.weak');
    if (!$('terms').checked) return say('err.terms');
  } else if (!pw) return say('err.invalid');
  setBusy(true);
  try {
    let cred;
    if (mode === 'signup') {
      cred = await createUserWithEmailAndPassword(auth, email, pw);
      await updateProfile(cred.user, { displayName: name });
      sendEmailVerification(cred.user).catch(() => {});
    } else cred = await signInWithEmailAndPassword(auth, email, pw);
    await afterAuth(cred);
  } catch (err) { fail(err); setBusy(false); }
});

$('google').addEventListener('click', async () => {
  say(null); setBusy(true);
  try { await afterAuth(await signInWithPopup(auth, new GoogleAuthProvider())); }
  catch (err) { fail(err); setBusy(false); }
});

$('forgot').addEventListener('click', async () => {
  const email = $('email').value.trim();
  if (!/^\S+@\S+\.\S+$/.test(email)) return say('err.email');
  try { await sendPasswordResetEmail(auth, email); } catch (err) { if (err.code === 'auth/network-request-failed') return fail(err); }
  say('auth.resetSent', true); // same message whether or not the account exists
});
setMode('login');
