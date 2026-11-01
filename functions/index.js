const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineString } = require('firebase-functions/params');
const admin = require('firebase-admin');
admin.initializeApp();

// Comma-separated emails allowed to become Super Admin. Asked once at deploy time, never stored in code.
const ADMIN_EMAILS = defineString('ADMIN_EMAILS', { default: '' });
const REGION = { region: 'asia-south1' };

// Creates the user profile on first login and sets the role claim. Role is decided here, never by the browser.
exports.ensureProfile = onCall(REGION, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Login required.');
  const uid = req.auth.uid;
  const user = await admin.auth().getUser(uid);
  const ref = admin.firestore().doc(`users/${uid}`);
  const snap = await ref.get();

  let role = snap.exists ? snap.data().role : 'patient';
  const allowed = ADMIN_EMAILS.value().split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const wantsAdmin = user.email && allowed.includes(user.email.toLowerCase());
  if (wantsAdmin && user.emailVerified && role !== 'admin') {
    role = 'admin';
    await admin.firestore().collection('audit_logs').add({
      action: 'admin_granted', targetUid: uid, by: 'system',
      at: admin.firestore.FieldValue.serverTimestamp()
    });
  }
  if (!snap.exists) {
    await ref.set({
      uid, email: user.email || null, name: user.displayName || '', role,
      language: 'en', createdAt: admin.firestore.FieldValue.serverTimestamp()
    });
  } else if (snap.data().role !== role) {
    await ref.update({ role });
  }
  if (user.customClaims?.role !== role) await admin.auth().setCustomUserClaims(uid, { role });
  return { role, name: user.displayName || snap.data()?.name || '' };
});
