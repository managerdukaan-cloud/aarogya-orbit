import { functions } from './firebase-init.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js';

// Server creates the profile and sets the role. The browser can never choose its own role.
export async function finishLogin(user) {
  const res = await httpsCallable(functions, 'ensureProfile')({});
  await user.getIdToken(true); // pick up the new role claim
  return res.data; // { role, name }
}
export const routeFor = (role) => role === 'admin' ? '/admin.html' : '/dashboard.html';
export const firstName = (n) => (n || '').trim().split(/\s+/)[0] || '';
