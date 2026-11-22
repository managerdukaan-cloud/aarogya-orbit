import { db } from './firebase-init.js';
import { t } from './i18n.js';
import { requireUser, say } from './guard.js';
import { $, el, toMins } from './util.js';
import { doc, getDoc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'], SLOTS = [30, 60, 120];
const user = await requireUser();
if ((await user.getIdTokenResult(true)).claims.role !== 'lab') location.replace('/dashboard.html');
const ref = doc(db, 'lab_settings', user.uid), saved = (await getDoc(ref)).data();
for (const m of SLOTS) $('slot').add(new Option(t('sch.min').replace('{n}', m), m));
$('slot').value = saved?.slotMinutes || 60; $('cap').value = saved?.capacity || 3; $('pins').value = (saved?.collectionPins || []).join(', ');
function rangeRow(d, i, r) {
  const row = el('div', 'range');
  const from = el('input'); from.type = 'time'; from.id = `${d}-s${i}`; from.value = r?.start || ''; from.setAttribute('aria-label', `${t('day.' + d)} ${t('sch.from')} ${i + 1}`);
  const to = el('input'); to.type = 'time'; to.id = `${d}-e${i}`; to.value = r?.end || ''; to.setAttribute('aria-label', `${t('day.' + d)} ${t('sch.to')} ${i + 1}`);
  row.append(el('span', 'hint', t('sch.session').replace('{n}', i + 1)), from, el('span', '', '–'), to); return row;
}
for (const d of DAYS) {
  const rs = saved?.weekly?.[d] || [], wrap = el('div', 'day' + (rs.length ? '' : ' off')), l = el('label', 'on');
  const cb = el('input'); cb.type = 'checkbox'; cb.id = `on-${d}`; cb.checked = rs.length > 0;
  const nm = el('span', '', t('day.' + d)); nm.dataset.i18n = 'day.' + d; l.append(cb, nm);
  const ranges = el('div', 'ranges'); ranges.append(rangeRow(d, 0, rs[0]), rangeRow(d, 1, rs[1]));
  cb.onchange = () => wrap.classList.toggle('off', !cb.checked); wrap.append(l, ranges); $('days').append(wrap);
}
$('app').hidden = false;
$('form').addEventListener('submit', async (e) => {
  e.preventDefault(); say('msg', null);
  const slot = Number($('slot').value), cap = Number($('cap').value.trim()), weekly = {}; let any = false;
  if (!Number.isInteger(cap) || cap < 1 || cap > 20) return say('msg', 'lab.badCap', false, t);
  const pins = $('pins').value.split(',').map(s => s.trim()).filter(Boolean);
  if (pins.some(p => !/^\d{6}$/.test(p)) || pins.length > 30) return say('msg', 'adm.badPin', false, t);
  for (const d of DAYS) {
    if (!$(`on-${d}`).checked) continue;
    const list = [];
    for (const i of [0, 1]) {
      const s = $(`${d}-s${i}`).value, en = $(`${d}-e${i}`).value;
      if (!s && !en) continue;
      if (!s || !en || toMins(en) - toMins(s) < slot) return say('msg', 'err.sch', false, t);
      list.push({ start: s, end: en });
    }
    list.sort((a, b) => toMins(a.start) - toMins(b.start));
    if (!list.length || (list.length === 2 && toMins(list[0].end) > toMins(list[1].start))) return say('msg', 'err.sch', false, t);
    weekly[d] = list; any = true;
  }
  if (!any) return say('msg', 'err.schDay', false, t);
  $('save').disabled = true;
  try { await setDoc(ref, { uid: user.uid, weekly, slotMinutes: slot, capacity: cap, collectionPins: [...new Set(pins)], updatedAt: serverTimestamp() }); say('msg', 'sch.saved', true, t); }
  catch { say('msg', 'err.generic', false, t); }
  $('save').disabled = false;
});
