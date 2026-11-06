import { functions } from './firebase-init.js';
import { t } from './i18n.js';
import { requireUser, say } from './guard.js';
import { $, el } from './util.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js';

let checks = null;
const user = await requireUser(render);
if ((await user.getIdTokenResult(true)).claims.role !== 'admin') location.replace('/dashboard.html');
const INFO = ['users']; // shown as information, not as pass or fail
const OPTIONAL = ['paymentKeys', 'paymentWebhook', 'paymentOn', 'emailKey', 'aiKey', 'hospitals']; // not needed to start; a cross means "not set up yet"
const MANUAL = ['m1', 'm2', 'm3', 'm4', 'm5', 'm6', 'm7', 'm8', 'm9', 'm10'];
let saved = {}; try { saved = JSON.parse(localStorage.getItem('ao_launch') || '{}'); } catch {}
async function run() { $('recheck').disabled = true; try { checks = (await httpsCallable(functions, 'systemCheck')()).data.checks; } catch { say('msg', 'err.generic', false, t); } $('recheck').disabled = false; render(); }
function render() {
  const box = $('checks'); box.replaceChildren();
  for (const c of checks || []) {
    const info = INFO.includes(c.key), opt = OPTIONAL.includes(c.key), row = el('div', 'row'); row.style.margin = '8px 0';
    row.append(el('span', 'status' + (c.ok || info ? '' : ' cancelled'), info ? 'i' : c.ok ? '✓' : opt ? '–' : '✗'), el('span', '', `${t('rd.' + c.key)}${c.n != null ? ': ' + c.n : ''}`));
    box.append(row); if (!c.ok && !info) box.append(el('p', 'mini', t('rd.' + c.key + '.hint')));
  }
  const m = $('manual'); m.replaceChildren();
  for (const k of MANUAL) { const l = el('label', 'check'), cb = el('input'); cb.type = 'checkbox'; cb.checked = !!saved[k]; cb.onchange = () => { saved[k] = cb.checked; try { localStorage.setItem('ao_launch', JSON.stringify(saved)); } catch {} }; l.append(cb, el('span', '', t('rd.' + k))); m.append(l); }
}
$('recheck').onclick = run;
await run();
$('app').hidden = false;
