const { onCall, HttpsError } = require('firebase-functions/v2/https');
const { defineString } = require('firebase-functions/params');
const admin = require('firebase-admin');
admin.initializeApp();
const FieldValue = admin.firestore.FieldValue;

// Comma-separated emails allowed to become Super Admin. Asked once at deploy time, never stored in code.
const ADMIN_EMAILS = defineString('ADMIN_EMAILS', { default: '' });
const REGION = { region: 'asia-south1' };
const requireAdmin = (req) => { if (req.auth?.token?.role !== 'admin') throw new HttpsError('permission-denied', 'Admin only.'); };

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
    await admin.firestore().collection('audit_logs').add({ action: 'admin_granted', targetUid: uid, by: 'system', at: FieldValue.serverTimestamp() });
  }
  if (!snap.exists) {
    await ref.set({ uid, email: user.email || null, name: user.displayName || '', role, language: 'en', createdAt: FieldValue.serverTimestamp() });
  } else if (snap.data().role !== role) {
    await ref.update({ role });
  }
  // Also repairs a role claim that failed to update after an approval.
  if (user.customClaims?.role !== role) await admin.auth().setCustomUserClaims(uid, { role });
  return { role, name: user.displayName || snap.data()?.name || '' };
});

// Admin approves or rejects a doctor application. Approval creates the public verified profile and grants the doctor role.
exports.reviewApplication = onCall(REGION, async (req) => {
  requireAdmin(req);
  const { uid, decision, reason } = req.data || {};
  if (typeof uid !== 'string' || !['approve', 'reject'].includes(decision)) throw new HttpsError('invalid-argument', 'Bad request.');
  if (decision === 'reject' && !(typeof reason === 'string' && reason.trim().length >= 5 && reason.length <= 300))
    throw new HttpsError('invalid-argument', 'A reason of 5 to 300 characters is required.');
  const db = admin.firestore();
  const appRef = db.doc(`doctor_applications/${uid}`), userRef = db.doc(`users/${uid}`);

  await db.runTransaction(async (tx) => {
    const [a, u] = await Promise.all([tx.get(appRef), tx.get(userRef)]);
    if (!a.exists || a.data().status !== 'pending') throw new HttpsError('failed-precondition', 'Application is not pending.');
    if (u.exists && u.data().role === 'admin') throw new HttpsError('failed-precondition', 'Cannot change an admin account.');
    const d = a.data();
    const review = { reviewedBy: req.auth.uid, reviewedAt: FieldValue.serverTimestamp() };
    if (decision === 'approve') {
      tx.update(appRef, { status: 'approved', ...review });
      // Only fields meant to be public are copied. Phone and documents stay private.
      tx.set(db.doc(`doctors/${uid}`), {
        uid, name: d.name, speciality: d.speciality, qualification: d.qualification, experience: d.experience,
        regNumber: d.regNumber, council: d.council, clinicName: d.clinicName, address: d.address, fee: d.fee,
        languages: d.languages || [], city: 'Udaipur', verified: true, active: true, verifiedAt: FieldValue.serverTimestamp()
      });
      tx.set(userRef, { role: 'doctor' }, { merge: true });
    } else {
      tx.update(appRef, { status: 'rejected', rejectReason: reason.trim(), ...review });
    }
    tx.set(db.collection('audit_logs').doc(), {
      action: decision === 'approve' ? 'doctor_approved' : 'doctor_rejected', targetUid: uid, by: req.auth.uid, at: FieldValue.serverTimestamp()
    });
  });
  if (decision === 'approve') await admin.auth().setCustomUserClaims(uid, { role: 'doctor' });
  return { ok: true };
});

// Lets an admin view an uploaded certificate without any public or long-lived link.
exports.getApplicationDocument = onCall(REGION, async (req) => {
  requireAdmin(req);
  const { uid, path } = req.data || {};
  if (typeof uid !== 'string' || typeof path !== 'string' || !path.startsWith(`doctor_docs/${uid}/`)) throw new HttpsError('invalid-argument', 'Bad request.');
  const a = await admin.firestore().doc(`doctor_applications/${uid}`).get();
  if (!a.exists || !(a.data().documents || []).some(d => d.path === path)) throw new HttpsError('not-found', 'Document not found.');
  const file = admin.storage().bucket().file(path);
  const [[buf], [meta]] = await Promise.all([file.download(), file.getMetadata()]);
  if (buf.length > 6 * 1024 * 1024) throw new HttpsError('failed-precondition', 'File too large.');
  await admin.firestore().collection('audit_logs').add({ action: 'document_viewed', targetUid: uid, by: req.auth.uid, at: FieldValue.serverTimestamp() });
  return { contentType: meta.contentType || 'application/octet-stream', data: buf.toString('base64') };
});
