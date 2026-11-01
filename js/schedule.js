import { db } from './firebase-init.js';
import { t } from './i18n.js';
import { requireUser, say } from './guard.js';
import { doc, getDoc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

const $ = (id) => document.getElementById(id);
const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], SLOTS = [10, 15, 20, 30, 45, 60];
const user = await requireUser();
// The server rules also require the doctor role. This only avoids showing a useless page.
if ((await user.getIdTokenResult(true)).claims.role !== 'doctor') location.replace('/dashboard.html');
const ref = doc(db, 'doctor_schedules', user.uid);
const saved = (await getDoc(ref)).data();

for (const m of SLOTS) { const o = new Option(t('sch.min').replace('{n}', m), m); o.dataset.n = m; $('slot').add(o); }
$('slot').value = saved?.slotMinutes || 15;

const mk = (tag, props = {}) => Object.assign(document.createElement(tag), props);
function rangeRow(d, i, r) {
  const row = mk('div', { className: 'range' });
  const lab = mk('span', { textContent: t('sch.session').replace('{n}', i + 1), className: 'hint' });
  const from = mk('input', { type: 'time', id: `${d}-s${i}`, value: r?.start || '' }); from.setAttribute('aria-label', `${t('day.' + d)} ${t('sch.from')} ${i + 1}`);
  const to = mk('input', { type: 'time', id: `${d}-e${i}`, value: r?.end || '' }); to.setAttribute('aria-label', `${t('day.' + d)} ${t('sch.to')} ${i + 1}`);
  row.append(lab, from, mk('span', { textContent: '–' }), to);
  return row;
}
for (const d of DAYS) {
  const rs = saved?.weekly?.[d] || [];
  const wrap = mk('div', { className: 'day' + (rs.length ? '' : ' off') });
  const l = mk('label', { className: 'on' });
  const cb = mk('input', { type: 'checkbox', id: `on-${d}`, checked: rs.length > 0 });
  const nm = mk('span', { textContent: t('day.' + d) }); nm.dataset.i18n = 'day.' + d;
  l.append(cb, nm);
  const ranges = mk('div', { className: 'ranges' });
  ranges.append(rangeRow(d, 0, rs[0]), rangeRow(d, 1, rs[1]));
  cb.addEventListener('change', () => wrap.classList.toggle('off', !cb.checked));
  wrap.append(l, ranges); $('days').append(wrap);
}
$('app').hidden = false;

const mins = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
$('form').addEventListener('submit', async (e) => {
  e.preventDefault(); say('msg', null);
  const slot = Number($('slot').value), weekly = {}; let any = false;
  for (const d of DAYS) {
    if (!$(`on-${d}`).checked) continue;
    const list = [];
    for (const i of [0, 1]) {
      const s = $(`${d}-s${i}`).value, en = $(`${d}-e${i}`).value;
      if (!s && !en) continue;
      if (!s || !en || mins(en) - mins(s) < slot) return say('msg', 'err.sch', false, t);
      list.push({ start: s, end: en });
    }
    list.sort((a, b) => mins(a.start) - mins(b.start));
    if (list.length === 2 && mins(list[0].end) > mins(list[1].start)) return say('msg', 'err.sch', false, t);
    if (!list.length) return say('msg', 'err.sch', false, t);
    weekly[d] = list; any = true;
  }
  if (!any) return say('msg', 'err.schDay', false, t);
  $('save').disabled = true;
  try { await setDoc(ref, { uid: user.uid, weekly, slotMinutes: slot, updatedAt: serverTimestamp() }); say('msg', 'sch.saved', true, t); }
  catch { say('msg', 'err.generic', false, t); }
  $('save').disabled = false;
});
