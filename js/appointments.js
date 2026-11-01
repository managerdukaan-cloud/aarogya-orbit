import { db, functions } from './firebase-init.js';
import { t } from './i18n.js';
import { requireUser, say } from './guard.js';
import { collection, getDocs, query, where } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js';

const $ = (id) => document.getElementById(id);
let items = [];
const user = await requireUser(render);
async function load() {
  const s = await getDocs(query(collection(db, 'appointments'), where('patientUid', '==', user.uid)));
  items = s.docs.map(x => ({ id: x.id, ...x.data() }));
  render();
}
const line = (cls, text) => { const p = document.createElement('p'); p.className = cls; p.textContent = text; return p; };
function render() {
  const live = (a) => ['pending', 'confirmed', 'rescheduled'].includes(a.status);
  items.sort((a, b) => (live(b) - live(a)) || `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`) * (live(a) ? 1 : -1));
  $('empty').hidden = items.length > 0;
  const box = $('list'); box.replaceChildren();
  for (const a of items) {
    const c = document.createElement('article'); c.className = 'card dr';
    const h = document.createElement('h3'); h.append(document.createTextNode(a.doctorName));
    const st = document.createElement('span'); st.className = 'status ' + a.status; st.textContent = t('st.' + a.status); h.append(st);
    c.append(h, line('', `${a.date} · ${a.time}`), line('meta', t('ap.for').replace('{name}', a.memberName)),
      line('meta', a.clinicName || ''), line('meta', t('bk.fee').replace('{n}', a.fee)));
    if (live(a)) {
      const b = document.createElement('button'); b.className = 'btn btn-ghost danger'; b.textContent = t('ap.cancel');
      b.onclick = async () => {
        if (!confirm(t('ap.cancelConfirm'))) return; b.disabled = true;
        try { await httpsCallable(functions, 'cancelAppointment')({ id: a.id }); say('msg', 'ap.cancelled', true, t); await load(); }
        catch { say('msg', 'err.generic', false, t); b.disabled = false; }
      };
      c.append(b);
    }
    box.append(c);
  }
}
await load();
$('app').hidden = false;
