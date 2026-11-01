import { db, functions } from './firebase-init.js';
import { t } from './i18n.js';
import { requireUser, say } from './guard.js';
import { collection, getDocs, query, where } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js';

const $ = (id) => document.getElementById(id);
const OPEN = ['pending', 'confirmed', 'rescheduled', 'checked_in', 'in_consultation'];
let items = [];
const user = await requireUser(render);
// The server re-checks the doctor role on every change. This only avoids showing a useless page.
if ((await user.getIdTokenResult(true)).claims.role !== 'doctor') location.replace('/dashboard.html');

function ist() {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, mins: +p.hour * 60 + +p.minute };
}
const toMins = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
async function load() {
  const s = await getDocs(query(collection(db, 'appointments'), where('doctorUid', '==', user.uid)));
  items = s.docs.map(x => ({ id: x.id, ...x.data() })); render();
}
const line = (cls, text) => { const p = document.createElement('p'); p.className = cls; p.textContent = text; return p; };
// Which buttons make sense for each status. The server enforces the same rules again.
function actions(a) {
  const n = ist(), today = a.date === n.date, started = a.date < n.date || (today && toMins(a.time) <= n.mins);
  switch (a.status) {
    case 'pending': return [['confirmed', 'act.confirm', 'btn-primary'], ['cancelled', 'act.reject', 'btn-ghost danger']];
    case 'confirmed': return [...(today ? [['checked_in', 'act.checkin', 'btn-primary']] : []), ...(started ? [['no_show', 'act.noshow', 'btn-ghost']] : []), ['cancelled', 'act.cancel', 'btn-ghost danger']];
    case 'checked_in': return [['in_consultation', 'act.start', 'btn-primary'], ['cancelled', 'act.cancel', 'btn-ghost danger']];
    case 'in_consultation': return [['completed', 'act.complete', 'btn-primary']];
    default: return [];
  }
}
function render() {
  const all = $('filter').value === 'all';
  const list = items.filter(a => all || OPEN.includes(a.status))
    .sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`) * (all ? -1 : 1));
  $('empty').hidden = list.length > 0;
  const box = $('list'); box.replaceChildren();
  for (const a of list) {
    const c = document.createElement('article'); c.className = 'card dr';
    const h = document.createElement('h3'); h.append(document.createTextNode(`${a.date} · ${a.time}`));
    const st = document.createElement('span'); st.className = 'status ' + a.status; st.textContent = t('st.' + a.status); h.append(st);
    c.append(h, line('', t('dap.patient').replace('{name}', a.memberName)), line('meta', t('dap.collect').replace('{n}', a.fee)));
    const act = document.createElement('div'); act.className = 'actions';
    for (const [status, key, cls] of actions(a)) {
      const b = document.createElement('button'); b.className = 'btn ' + cls; b.textContent = t(key);
      b.onclick = async () => {
        if (status === 'cancelled' && !confirm(t('act.confirmAsk'))) return;
        act.querySelectorAll('button').forEach(x => x.disabled = true);
        try { await httpsCallable(functions, 'updateAppointmentStatus')({ id: a.id, status }); say('msg', 'dap.updated', true, t); await load(); }
        catch (e) { say('msg', e.code === 'functions/failed-precondition' ? 'dap.notNow' : 'err.generic', false, t); await load(); }
      };
      act.append(b);
    }
    if (act.children.length) c.append(act);
    box.append(c);
  }
}
$('filter').addEventListener('change', render);
await load();
$('app').hidden = false;
