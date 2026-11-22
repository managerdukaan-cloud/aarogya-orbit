import { functions } from './firebase-init.js';
import { t } from './i18n.js';
import { requireUser, say } from './guard.js';
import { $, chip } from './util.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js';

const q = new URLSearchParams(location.search), kind = q.get('k'), id = q.get('id');
if (!['doctor', 'lab'].includes(kind) || !id) location.replace('/dashboard.html');
let stars = 0;
await requireUser(() => { $('title').textContent = t(kind === 'doctor' ? 'rv.rate' : 'rv.rateLab'); draw(); });
$('title').textContent = t(kind === 'doctor' ? 'rv.rate' : 'rv.rateLab');
function draw() { const b = $('stars'); b.replaceChildren(); for (let i = 1; i <= 5; i++) b.append(chip('★'.repeat(i), i === stars, () => { stars = i; $('send').disabled = false; draw(); })); }
draw(); $('app').hidden = false;
$('send').onclick = async () => {
  say('msg', null); $('send').disabled = true;
  try { await httpsCallable(functions, 'submitReview')({ kind, refId: id, rating: stars, comment: $('comment').value.trim() }); $('formWrap').hidden = true; $('done').hidden = false; }
  catch (e) { say('msg', { 'functions/already-exists': 'rv.already', 'functions/failed-precondition': 'rv.notYet' }[e.code] || 'err.generic', false, t); $('send').disabled = false; }
};
