import { db, functions, storage } from './firebase-init.js';
import { t, getLang } from './i18n.js';
import { requireUser, say } from './guard.js';
import { $, el } from './util.js';
import { collection, getDocs, addDoc, updateDoc, doc, query, where, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js';
import { ref, uploadBytes } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-storage.js';

const CATS = ['blood', 'diagnostic', 'prescription', 'xray', 'mri_ct', 'discharge', 'other'];
let records = [], consents = [], access = [], members = [], doctors = [];
const user = await requireUser(() => { fillSelects(); render(); });
const call = (n, d) => httpsCallable(functions, n)(d);
const dt = (ts) => ts?.toDate ? ts.toDate().toLocaleString(getLang() === 'hi' ? 'hi-IN' : 'en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' }) : '';
$('recordDate').max = new Date().toISOString().slice(0, 10);

function fillSelects() {
  const c = $('category'), f = $('fcat'), cv = c.value, fv = f.value;
  c.replaceChildren(); f.replaceChildren(new Option(t('tt.allCats'), ''));
  CATS.forEach(k => { c.add(new Option(t('rc.' + k), k)); f.add(new Option(t('rc.' + k), k)); }); c.value = cv || 'blood'; f.value = fv;
  const m = $('member'), mv = m.value || 'self'; m.replaceChildren(new Option(t('bk.self'), 'self')); members.forEach(x => m.add(new Option(x.name, x.id))); m.value = mv;
}
async function load() {
  const own = (n, ...w) => getDocs(query(collection(db, n), ...w));
  const [r, c, a, fm, ap] = await Promise.all([
    own('medical_records', where('ownerUid', '==', user.uid), where('status', '==', 'active')), own('consents', where('ownerUid', '==', user.uid)),
    own('record_access', where('ownerUid', '==', user.uid)), own('family_members', where('ownerUid', '==', user.uid), where('status', '==', 'active')),
    own('appointments', where('patientUid', '==', user.uid))]);
  records = r.docs.map(d => ({ id: d.id, ...d.data() })); consents = c.docs.map(d => ({ id: d.id, ...d.data() }));
  access = a.docs.map(d => ({ id: d.id, ...d.data() })); members = fm.docs.map(d => ({ id: d.id, name: d.data().name }));
  const seen = new Map(); ap.docs.forEach(d => seen.set(d.data().doctorUid, d.data().doctorName)); doctors = [...seen].map(([id, name]) => ({ id, name }));
  fillSelects(); render();
}
function render() {
  const fc = $('fcat').value, fd = $('fdate').value;
  const list = records.filter(r => (!fc || r.category === fc) && (!fd || (r.recordDate || '') >= fd)).sort((a, b) => (b.recordDate || '').localeCompare(a.recordDate || ''));
  $('empty').hidden = list.length > 0; const box = $('list'); box.replaceChildren();
  for (const r of list) {
    const c = el('article', 'card dr'); c.append(el('h3', '', r.title), el('p', 'meta', `${t('rc.' + r.category)} · ${r.recordDate || ''} · ${r.memberName}`));
    const act = el('div', 'actions');
    const view = el('button', 'btn btn-primary', t('rec.view'));
    view.onclick = async () => { const w = window.open('', '_blank'); view.disabled = true; try { const x = (await call('getRecordFile', { recordId: r.id })).data; if (w) w.location = URL.createObjectURL(new Blob([Uint8Array.from(atob(x.data), ch => ch.charCodeAt(0))], { type: x.contentType })); } catch { w?.close(); say('msg', 'err.generic', false, t); } view.disabled = false; };
    const rm = el('button', 'btn btn-ghost danger', t('fam.remove'));
    rm.onclick = async () => { if (!confirm(t('rec.removeAsk'))) return; try { await updateDoc(doc(db, 'medical_records', r.id), { status: 'removed', removedAt: serverTimestamp() }); await load(); } catch { say('msg', 'err.generic', false, t); } };
    act.append(view, rm); c.append(act);
    // sharing: only with doctors this patient has booked; time-limited; can be withdrawn at any time
    const mine = consents.filter(x => x.recordId === r.id), sh = el('details'); sh.append(el('summary', '', t('rec.sharing')));
    const open = mine.filter(x => x.status === 'active' && x.expiresAt?.toMillis() > Date.now());
    const free = doctors.filter(d => !open.some(x => x.doctorUid === d.id));
    if (free.length) {
      const row = el('div', 'row'), sel = el('select'); sel.style.minHeight = '44px'; free.forEach(d => sel.add(new Option(d.name, d.id)));
      const go = el('button', 'btn btn-ghost', t('rec.share'));
      go.onclick = async () => { if (!confirm(t('rec.shareAsk'))) return; go.disabled = true; try { await call('shareRecord', { recordId: r.id, doctorUid: sel.value }); say('msg', 'rec.shared', true, t); await load(); } catch { say('msg', 'err.generic', false, t); go.disabled = false; } };
      row.append(sel, go); sh.append(row);
    } else if (!open.length) sh.append(el('p', 'mini', t('rec.noDoctors')));
    for (const x of open) {
      const row = el('div', 'row'); row.append(el('span', '', `${x.doctorName} · ${t('rec.until')} ${dt(x.expiresAt)}`));
      const rv = el('button', 'btn btn-ghost danger', t('rec.revoke')); rv.style.minHeight = '36px';
      rv.onclick = async () => { rv.disabled = true; try { await call('revokeShare', { consentId: x.id }); await load(); } catch { say('msg', 'err.generic', false, t); } };
      row.append(rv); sh.append(row);
    }
    const hist = el('details'); hist.append(el('summary', '', t('rec.history')));
    const mineAcc = access.filter(x => x.recordId === r.id).sort((a, b) => (b.at?.seconds || 0) - (a.at?.seconds || 0));
    if (!mineAcc.length) hist.append(el('p', 'mini', t('rec.noHistory')));
    for (const x of mineAcc) hist.append(el('p', 'mini', `${dt(x.at)} · ${t('ra.' + x.action)} · ${t(x.byRole === 'doctor' ? 'role.doctor' : 'rec.you')}`));
    c.append(sh, hist); box.append(c);
  }
}
$('add').onclick = () => { $('panel').hidden = false; $('title').focus(); say('msg', null); };
$('cancel').onclick = () => { $('panel').hidden = true; };
['fcat', 'fdate'].forEach(id => $(id).addEventListener('input', render));
$('form').addEventListener('submit', async (e) => {
  e.preventDefault(); say('msg', null);
  const title = $('title').value.trim(), file = $('file').files[0], date = $('recordDate').value;
  if (title.length < 2) return say('msg', 'err.field', false, t);
  if (date && (isNaN(Date.parse(date)) || date > $('recordDate').max)) return say('msg', 'err.dob', false, t);
  if (!file || !['application/pdf', 'image/jpeg', 'image/png'].includes(file.type) || file.size > 5 * 1024 * 1024) return say('msg', 'err.file', false, t);
  $('save').disabled = true; $('spin').hidden = false;
  try {
    const safe = file.name.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').slice(-60), path = `records/${user.uid}/${Date.now()}-${safe}`;
    await uploadBytes(ref(storage, path), file, { contentType: file.type });
    const mid = $('member').value, mem = members.find(x => x.id === mid);
    await addDoc(collection(db, 'medical_records'), { ownerUid: user.uid, memberId: mid, memberName: mem ? mem.name : (user.displayName || t('bk.self')), category: $('category').value, title, recordDate: date,
      file: { path, name: file.name.slice(0, 100), contentType: file.type, size: file.size }, status: 'active', createdAt: serverTimestamp() });
    $('form').reset(); $('panel').hidden = true; say('msg', 'rec.saved', true, t); await load();
  } catch { say('msg', 'err.upload', false, t); }
  $('save').disabled = false; $('spin').hidden = true;
});
await load();
$('app').hidden = false;
