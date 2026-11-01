import { db } from './firebase-init.js';
import { requireUser } from './guard.js';
import { renderRx } from './rx-view.js';
import { collection, getDocs, query, where } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

let items = [];
const user = await requireUser(render);
const s = await getDocs(query(collection(db, 'prescriptions'), where('patientUid', '==', user.uid)));
items = s.docs.map(x => x.data()).sort((a, b) => (b.issuedAt?.seconds || 0) - (a.issuedAt?.seconds || 0));
function render() {
  document.getElementById('empty').hidden = items.length > 0;
  document.getElementById('list').replaceChildren(...items.map(x => renderRx(x)));
}
render();
document.getElementById('app').hidden = false;
