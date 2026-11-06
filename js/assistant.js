import { functions } from './firebase-init.js';
import { t } from './i18n.js';
import { requireUser, say } from './guard.js';
import { $ } from './util.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js';

const call = (n, d) => httpsCallable(functions, n)(d).then(r => r.data);
await requireUser();
async function state() {
  let s = { available: false, consent: false }; try { s = await call('aiAvailable'); } catch {}
  $('off').hidden = s.available; $('consentBox').hidden = !(s.available && !s.consent); $('askBox').hidden = !(s.available && s.consent);
}
$('agree').onchange = () => { $('accept').disabled = !$('agree').checked; };
$('accept').onclick = async () => { $('accept').disabled = true; try { await call('setAiConsent', { accept: true }); await state(); } catch { say('msg', 'err.generic', false, t); } };
$('send').onclick = async () => {
  say('msg', null); $('emergency').hidden = true; $('answer').hidden = true;
  const question = $('q').value.trim(); if (question.length < 3) return say('msg', 'err.field', false, t);
  $('send').disabled = true; $('spin').hidden = false;
  try {
    const r = await call('askAssistant', { question });
    if (r.emergency) $('emergency').hidden = false; else { $('answerText').textContent = r.text; $('answer').hidden = false; }
  } catch (e) {
    if (e.code === 'functions/failed-precondition') await state(); else say('msg', e.code === 'functions/resource-exhausted' ? 'err.many' : 'ai.error', false, t);
  }
  $('send').disabled = false; $('spin').hidden = true;
};
await state();
$('app').hidden = false;
