import { db } from './firebase-init.js';
import { t } from './i18n.js';
import { requireUser } from './guard.js';
import { $, el, ist } from './util.js';
import { collection, getDocs, query, where } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

let items = [];
const user = await requireUser(render);
if ((await user.getIdTokenResult(true)).claims.role !== 'doctor') location.replace('/dashboard.html');
items = (await getDocs(query(collection(db, 'prescriptions'), where('doctorUid', '==', user.uid)))).docs.map(d => d.data()).filter(x => x.followUpDate).sort((a, b) => a.followUpDate.localeCompare(b.followUpDate));
function render() {
  const today = ist().date, up = items.filter(x => x.followUpDate >= today), past = items.filter(x => x.followUpDate < today).reverse().slice(0, 20);
  $('empty').hidden = items.length > 0; const box = $('list'); box.replaceChildren();
  for (const [list, key] of [[up, 'fu.upcoming'], [past, 'fu.past']]) {
    if (!list.length) continue; box.append(el('h2', 'sec', t(key)));
    for (const x of list) { const c = el('article', 'card dr'); c.append(el('h3', '', `${x.followUpDate} · ${x.memberName}`), el('p', 'meta', x.medicines.map(m => m.name).join(', '))); box.append(c); }
  }
}
render();
$('app').hidden = false;
