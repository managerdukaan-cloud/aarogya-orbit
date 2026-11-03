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
  await notify(uid, decision === 'approve' ? 'verified' : 'rejected');
  return { ok: true };
});

// Lets an admin view an uploaded certificate without any public or long-lived link.
exports.getApplicationDocument = onCall(REGION, async (req) => {
  requireAdmin(req);
  const { uid, path } = req.data || {};
  if (typeof uid !== 'string' || typeof path !== 'string' || !path.startsWith(`doctor_docs/${uid}/`)) throw new HttpsError('invalid-argument', 'Bad request.');
  const a = await admin.firestore().doc(`doctor_applications/${uid}`).get();
  if (!a.exists || !(a.data().documents || []).some(d => d.path === path)) throw new HttpsError('not-found', 'Document not found.');
  const file = admin.storage().bucket('aarogya-orbit-mumbai').file(path);
  const [[buf], [meta]] = await Promise.all([file.download(), file.getMetadata()]);
  if (buf.length > 6 * 1024 * 1024) throw new HttpsError('failed-precondition', 'File too large.');
  await admin.firestore().collection('audit_logs').add({ action: 'document_viewed', targetUid: uid, by: req.auth.uid, at: FieldValue.serverTimestamp() });
  return { contentType: meta.contentType || 'application/octet-stream', data: buf.toString('base64') };
});

// ---------------- Appointments ----------------
// All booking rules run here on the server. The browser can never write an appointment or a slot directly.
const DAYKEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const toMins = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
const pad = (n) => String(n).padStart(2, '0');
function istNow() { // Indian Standard Time, whatever the server clock says
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, mins: +p.hour * 60 + +p.minute };
}
function validSlots(sch, date) {
  const out = [];
  for (const r of sch.weekly?.[DAYKEYS[new Date(date + 'T00:00:00Z').getUTCDay()]] || [])
    for (let m = toMins(r.start); m + sch.slotMinutes <= toMins(r.end); m += sch.slotMinutes) out.push(`${pad(Math.floor(m / 60))}:${pad(m % 60)}`);
  return out;
}

exports.bookAppointment = onCall(REGION, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Login required.');
  if (req.auth.token.role !== 'patient') throw new HttpsError('permission-denied', 'Only patients can book.');
  const { doctorUid, date, time, memberId } = req.data || {};
  if (typeof doctorUid !== 'string' || typeof memberId !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !/^\d{2}:\d{2}$/.test(time || ''))
    throw new HttpsError('invalid-argument', 'Bad request.');
  const now = istNow();
  const daysAhead = (new Date(date + 'T00:00:00Z') - new Date(now.date + 'T00:00:00Z')) / 864e5;
  if (!(daysAhead >= 0 && daysAhead <= 30)) throw new HttpsError('failed-precondition', 'Date not available.');
  if (date === now.date && toMins(time) < now.mins + 30) throw new HttpsError('failed-precondition', 'Time has passed.');

  const db = admin.firestore();
  const [d, s] = await Promise.all([db.doc(`doctors/${doctorUid}`).get(), db.doc(`doctor_schedules/${doctorUid}`).get()]);
  if (!d.exists || d.data().verified !== true || d.data().active === false || d.data().city !== 'Udaipur') throw new HttpsError('not-found', 'Doctor not available.');
  if (!s.exists || !validSlots(s.data(), date).includes(time)) throw new HttpsError('invalid-argument', 'Not a valid slot.');

  let memberName, memberType = 'self';
  if (memberId === 'self') { const u = await db.doc(`users/${req.auth.uid}`).get(); memberName = u.data()?.name || 'Patient'; }
  else {
    const f = await db.doc(`family_members/${memberId}`).get();
    if (!f.exists || f.data().ownerUid !== req.auth.uid || f.data().status !== 'active') throw new HttpsError('permission-denied', 'Not your family member.');
    memberName = f.data().name; memberType = 'family';
  }
  const lockId = `${doctorUid}_${date}_${time.replace(':', '')}`;
  const lockRef = db.doc(`booked_slots/${lockId}`), apptRef = db.collection('appointments').doc();
  await db.runTransaction(async (tx) => {
    if ((await tx.get(lockRef)).exists) throw new HttpsError('already-exists', 'Slot taken.'); // double-booking guard
    tx.set(lockRef, { doctorUid, date, time, createdAt: FieldValue.serverTimestamp() });
    tx.set(apptRef, {
      patientUid: req.auth.uid, memberId, memberType, memberName, doctorUid, doctorName: d.data().name, clinicName: d.data().clinicName,
      date, time, fee: d.data().fee, paymentMode: 'pay_at_clinic', status: 'pending', lockId, createdAt: FieldValue.serverTimestamp()
    });
  });
  await notify(req.auth.uid, 'appt_requested'); await notify(doctorUid, 'appt_new');
  return { id: apptRef.id };
});

exports.cancelAppointment = onCall(REGION, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Login required.');
  const id = req.data?.id; if (typeof id !== 'string') throw new HttpsError('invalid-argument', 'Bad request.');
  const db = admin.firestore(), ref = db.doc(`appointments/${id}`);
  await db.runTransaction(async (tx) => {
    const a = await tx.get(ref);
    if (!a.exists) throw new HttpsError('not-found', 'Not found.');
    const x = a.data(), uid = req.auth.uid;
    if (![x.patientUid, x.doctorUid].includes(uid) && req.auth.token.role !== 'admin') throw new HttpsError('permission-denied', 'Not allowed.');
    if (!['pending', 'confirmed', 'rescheduled'].includes(x.status)) throw new HttpsError('failed-precondition', 'Cannot cancel.');
    const now = istNow();
    if (x.patientUid === uid && (x.date < now.date || (x.date === now.date && toMins(x.time) <= now.mins))) throw new HttpsError('failed-precondition', 'Already started.');
    tx.update(ref, { status: 'cancelled', cancelledBy: uid, cancelledAt: FieldValue.serverTimestamp() });
    tx.delete(db.doc(`booked_slots/${x.lockId}`)); // frees the slot for someone else
  });
  { const a2 = (await ref.get()).data(); await notify(a2.cancelledBy === a2.patientUid ? a2.doctorUid : a2.patientUid, 'appt_cancelled'); }
  return { ok: true };
});

// Doctor moves an appointment through its stages. Only these transitions are allowed.
const NEXT = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['checked_in', 'cancelled', 'no_show'],
  checked_in: ['in_consultation', 'cancelled'],
  in_consultation: ['completed']
};
exports.updateAppointmentStatus = onCall(REGION, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Login required.');
  if (req.auth.token.role !== 'doctor') throw new HttpsError('permission-denied', 'Doctors only.');
  const { id, status } = req.data || {};
  if (typeof id !== 'string' || typeof status !== 'string') throw new HttpsError('invalid-argument', 'Bad request.');
  const db = admin.firestore(), ref = db.doc(`appointments/${id}`);
  await db.runTransaction(async (tx) => {
    const a = await tx.get(ref);
    if (!a.exists || a.data().doctorUid !== req.auth.uid) throw new HttpsError('permission-denied', 'Not your appointment.');
    const x = a.data();
    if (!(NEXT[x.status] || []).includes(status)) throw new HttpsError('failed-precondition', 'Not allowed from this status.');
    const now = istNow(), started = x.date < now.date || (x.date === now.date && toMins(x.time) <= now.mins);
    if (status === 'checked_in' && x.date !== now.date) throw new HttpsError('failed-precondition', 'Only on the appointment day.');
    if (status === 'no_show' && !started) throw new HttpsError('failed-precondition', 'Time has not come yet.');
    const upd = { status, statusHistory: FieldValue.arrayUnion({ status, by: req.auth.uid, at: admin.firestore.Timestamp.now() }) };
    if (status === 'cancelled') { upd.cancelledBy = req.auth.uid; upd.cancelledAt = FieldValue.serverTimestamp(); tx.delete(db.doc(`booked_slots/${x.lockId}`)); }
    tx.update(ref, upd);
  });
  if (['confirmed', 'cancelled', 'completed'].includes(status)) await notify((await ref.get()).data().patientUid, 'appt_' + status);
  return { ok: true };
});

// A prescription can be issued ONLY here, by the treating doctor, tied to a real appointment.
// It is stored with the doctor's registration details and cannot be edited afterwards (clients cannot write to it at all).
const clip = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
exports.createPrescription = onCall(REGION, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Login required.');
  if (req.auth.token.role !== 'doctor') throw new HttpsError('permission-denied', 'Doctors only.');
  const { appointmentId, medicines, advice, followUpDate } = req.data || {};
  if (typeof appointmentId !== 'string' || !Array.isArray(medicines) || medicines.length < 1 || medicines.length > 10) throw new HttpsError('invalid-argument', 'Bad request.');
  const meds = medicines.map(m => ({ name: clip(m?.name, 100), dose: clip(m?.dose, 50), frequency: clip(m?.frequency, 50), duration: clip(m?.duration, 50), notes: clip(m?.notes, 150) }));
  if (meds.some(m => m.name.length < 2)) throw new HttpsError('invalid-argument', 'Each medicine needs a name.');
  let follow = '';
  if (followUpDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(followUpDate) || followUpDate < istNow().date) throw new HttpsError('invalid-argument', 'Bad follow-up date.');
    follow = followUpDate;
  }
  const db = admin.firestore(), apptRef = db.doc(`appointments/${appointmentId}`), rxRef = db.doc(`prescriptions/${appointmentId}`), docRef = db.doc(`doctors/${req.auth.uid}`);
  await db.runTransaction(async (tx) => {
    const [a, existing, d] = await Promise.all([tx.get(apptRef), tx.get(rxRef), tx.get(docRef)]);
    if (!a.exists || a.data().doctorUid !== req.auth.uid) throw new HttpsError('permission-denied', 'Not your appointment.');
    if (!['in_consultation', 'completed'].includes(a.data().status)) throw new HttpsError('failed-precondition', 'Consultation has not started.');
    if (existing.exists) throw new HttpsError('already-exists', 'Prescription already issued.');
    if (!d.exists || d.data().verified !== true) throw new HttpsError('permission-denied', 'Doctor not verified.');
    const x = a.data(), dr = d.data();
    tx.set(rxRef, {
      appointmentId, doctorUid: req.auth.uid, doctorName: dr.name, regNumber: dr.regNumber, council: dr.council, clinicName: dr.clinicName,
      patientUid: x.patientUid, memberId: x.memberId, memberName: x.memberName,
      medicines: meds, advice: clip(advice, 1000), followUpDate: follow, issuedAt: FieldValue.serverTimestamp()
    });
    tx.update(apptRef, { prescriptionId: appointmentId });
    tx.set(db.collection('audit_logs').doc(), { action: 'prescription_issued', targetUid: x.patientUid, appointmentId, by: req.auth.uid, at: FieldValue.serverTimestamp() });
  });
  await notify((await rxRef.get()).data().patientUid, 'rx_issued');
  return { id: appointmentId };
});

// =====================================================================
// DIAGNOSTICS: lab verification, bookings, sample status, reports
// =====================================================================
const BUCKET = 'aarogya-orbit-mumbai';
const bucket = () => admin.storage().bucket(BUCKET);

// ---- Admin approves or rejects a laboratory application ----
exports.reviewLabApplication = onCall(REGION, async (req) => {
  requireAdmin(req);
  const { uid, decision, reason, accreditationVerified } = req.data || {};
  if (typeof uid !== 'string' || !['approve', 'reject'].includes(decision)) throw new HttpsError('invalid-argument', 'Bad request.');
  if (decision === 'reject' && !(typeof reason === 'string' && reason.trim().length >= 5 && reason.length <= 300))
    throw new HttpsError('invalid-argument', 'A reason of 5 to 300 characters is required.');
  const db = admin.firestore(), appRef = db.doc(`lab_applications/${uid}`), userRef = db.doc(`users/${uid}`);
  await db.runTransaction(async (tx) => {
    const [a, u] = await Promise.all([tx.get(appRef), tx.get(userRef)]);
    if (!a.exists || a.data().status !== 'pending') throw new HttpsError('failed-precondition', 'Application is not pending.');
    if (u.exists && u.data().role !== 'patient') throw new HttpsError('failed-precondition', 'This account already has another role.');
    const d = a.data(), review = { reviewedBy: req.auth.uid, reviewedAt: FieldValue.serverTimestamp() };
    if (decision === 'approve') {
      tx.update(appRef, { status: 'approved', ...review });
      // Public profile. Licence number and documents stay private. Accreditation shows as verified only if the admin confirmed it.
      tx.set(db.doc(`labs/${uid}`), {
        uid, name: d.name, address: d.address, pin: d.pin, phone: d.phone, homeCollection: d.homeCollection === true,
        accreditation: d.accreditation || '', accreditationVerified: accreditationVerified === true && !!d.accreditation,
        city: 'Udaipur', verified: true, active: true, verifiedAt: FieldValue.serverTimestamp()
      });
      tx.set(userRef, { role: 'lab' }, { merge: true });
    } else tx.update(appRef, { status: 'rejected', rejectReason: reason.trim(), ...review });
    tx.set(db.collection('audit_logs').doc(), { action: decision === 'approve' ? 'lab_approved' : 'lab_rejected', targetUid: uid, by: req.auth.uid, at: FieldValue.serverTimestamp() });
  });
  if (decision === 'approve') await admin.auth().setCustomUserClaims(uid, { role: 'lab' });
  await notify(uid, decision === 'approve' ? 'verified' : 'rejected');
  return { ok: true };
});

exports.getLabApplicationDocument = onCall(REGION, async (req) => {
  requireAdmin(req);
  const { uid, path } = req.data || {};
  if (typeof uid !== 'string' || typeof path !== 'string' || !path.startsWith(`lab_docs/${uid}/`)) throw new HttpsError('invalid-argument', 'Bad request.');
  const a = await admin.firestore().doc(`lab_applications/${uid}`).get();
  if (!a.exists || !(a.data().documents || []).some(d => d.path === path)) throw new HttpsError('not-found', 'Document not found.');
  const file = bucket().file(path);
  const [[buf], [meta]] = await Promise.all([file.download(), file.getMetadata()]);
  if (buf.length > 6 * 1024 * 1024) throw new HttpsError('failed-precondition', 'File too large.');
  await admin.firestore().collection('audit_logs').add({ action: 'document_viewed', targetUid: uid, by: req.auth.uid, at: FieldValue.serverTimestamp() });
  return { contentType: meta.contentType || 'application/octet-stream', data: buf.toString('base64') };
});

// ---- Patient books a test. Prices, areas, capacity and slots are all decided here, never by the browser. ----
exports.bookDiagnostic = onCall(REGION, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Login required.');
  if (req.auth.token.role !== 'patient') throw new HttpsError('permission-denied', 'Only patients can book.');
  const { labUid, testIds, memberId, type, date, time, phone, address } = req.data || {};
  if (typeof labUid !== 'string' || !Array.isArray(testIds) || testIds.length < 1 || testIds.length > 10 || new Set(testIds).size !== testIds.length
    || testIds.some(x => typeof x !== 'string') || typeof memberId !== 'string' || !['home', 'lab'].includes(type)
    || !/^\d{4}-\d{2}-\d{2}$/.test(date || '') || !/^\d{2}:\d{2}$/.test(time || '') || !/^[6-9]\d{9}$/.test(phone || ''))
    throw new HttpsError('invalid-argument', 'Bad request.');
  const now = istNow();
  const ahead = (new Date(date + 'T00:00:00Z') - new Date(now.date + 'T00:00:00Z')) / 864e5;
  if (!(ahead >= 0 && ahead <= 14)) throw new HttpsError('failed-precondition', 'Date not available.');
  if (date === now.date && toMins(time) < now.mins + 60) throw new HttpsError('failed-precondition', 'Time has passed.');

  const db = admin.firestore();
  const [labS, setS] = await Promise.all([db.doc(`labs/${labUid}`).get(), db.doc(`lab_settings/${labUid}`).get()]);
  if (!labS.exists || labS.data().verified !== true || labS.data().active === false || labS.data().city !== 'Udaipur') throw new HttpsError('not-found', 'Lab not available.');
  const lab = labS.data();
  if (!setS.exists || !validSlots(setS.data(), date).includes(time)) throw new HttpsError('invalid-argument', 'Not a valid slot.');
  const settings = setS.data();

  const tests = []; let total = 0;
  for (const id of testIds) {
    const [t, p] = await Promise.all([db.doc(`diagnostic_tests/${id}`).get(), db.doc(`lab_pricing/${labUid}_${id}`).get()]);
    if (!t.exists || t.data().active === false || !p.exists || p.data().active === false) throw new HttpsError('not-found', 'Test not offered by this lab.');
    if (type === 'home' && p.data().homeCollection !== true) throw new HttpsError('failed-precondition', 'Home collection not available for this test.');
    tests.push({ testId: id, name_en: t.data().name_en, name_hi: t.data().name_hi || '', price: p.data().price }); total += p.data().price;
  }
  let addr = null;
  if (type === 'home') {
    if (lab.homeCollection !== true) throw new HttpsError('failed-precondition', 'Lab does not offer home collection.');
    const line = clip(address?.line, 200), pin = clip(address?.pin, 6);
    if (line.length < 5 || !/^\d{6}$/.test(pin)) throw new HttpsError('invalid-argument', 'Address needed.');
    const area = await db.doc(`service_areas/${pin}`).get();
    if (!area.exists || area.data().active !== true || !(settings.collectionPins || []).includes(pin)) throw new HttpsError('out-of-range', 'Area not served.');
    addr = { line, pin };
  }
  let memberName, memberType = 'self';
  if (memberId === 'self') { const u = await db.doc(`users/${req.auth.uid}`).get(); memberName = u.data()?.name || 'Patient'; }
  else {
    const f = await db.doc(`family_members/${memberId}`).get();
    if (!f.exists || f.data().ownerUid !== req.auth.uid || f.data().status !== 'active') throw new HttpsError('permission-denied', 'Not your family member.');
    memberName = f.data().name; memberType = 'family';
  }
  const slotId = `${labUid}_${date}_${time.replace(':', '')}`, countRef = db.doc(`lab_slot_counts/${slotId}`), bookRef = db.collection('diagnostic_bookings').doc();
  await db.runTransaction(async (tx) => {
    const c = (await tx.get(countRef)).data()?.count || 0;
    if (c >= (settings.capacity || 1)) throw new HttpsError('already-exists', 'Slot full.'); // capacity guard
    tx.set(countRef, { labUid, date, time, count: c + 1 });
    tx.set(bookRef, {
      patientUid: req.auth.uid, memberId, memberType, memberName, contactPhone: phone, labUid, labName: lab.name, tests, total,
      type, address: addr, date, time, slotId, status: 'confirmed', paymentMode: type === 'home' ? 'pay_at_collection' : 'pay_at_lab',
      createdAt: FieldValue.serverTimestamp()
    });
  });
  await notify(req.auth.uid, 'lab_booked'); await notify(labUid, 'lab_new');
  return { id: bookRef.id };
});

const NEXT_HOME = { confirmed: ['collection_assigned', 'cancelled'], collection_assigned: ['en_route', 'cancelled'], en_route: ['arrived', 'cancelled'], arrived: ['sample_collected', 'cancelled'], sample_collected: ['received_at_lab'], received_at_lab: ['processing'] };
const NEXT_LAB = { confirmed: ['sample_collected', 'cancelled'], sample_collected: ['processing'] };

async function moveBooking(req, id, status, who) {
  const db = admin.firestore(), ref = db.doc(`diagnostic_bookings/${id}`);
  await db.runTransaction(async (tx) => {
    const b = await tx.get(ref);
    if (!b.exists) throw new HttpsError('not-found', 'Not found.');
    const x = b.data(), uid = req.auth.uid;
    if (who === 'lab' && x.labUid !== uid) throw new HttpsError('permission-denied', 'Not your booking.');
    if (who === 'patient' && (x.patientUid !== uid || !['confirmed', 'collection_assigned'].includes(x.status) || status !== 'cancelled')) throw new HttpsError('permission-denied', 'Not allowed.');
    const map = x.type === 'home' ? NEXT_HOME : NEXT_LAB;
    if (!(map[x.status] || []).includes(status)) throw new HttpsError('failed-precondition', 'Not allowed from this status.');
    const upd = { status, statusHistory: FieldValue.arrayUnion({ status, by: uid, at: admin.firestore.Timestamp.now() }) };
    if (status === 'cancelled') {
      const cRef = db.doc(`lab_slot_counts/${x.slotId}`), c = (await tx.get(cRef)).data()?.count || 0;
      tx.set(cRef, { labUid: x.labUid, date: x.date, time: x.time, count: Math.max(0, c - 1) }); // frees the place
      upd.cancelledBy = uid; upd.cancelledAt = FieldValue.serverTimestamp();
    }
    tx.update(ref, upd);
  });
  { const b2 = (await ref.get()).data(); await notify(who === 'lab' ? b2.patientUid : b2.labUid, who === 'lab' ? 'lab_status' : 'lab_cancelled'); }
  return { ok: true };
}
exports.updateDiagnosticStatus = onCall(REGION, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Login required.');
  if (req.auth.token.role !== 'lab') throw new HttpsError('permission-denied', 'Labs only.');
  const { id, status } = req.data || {};
  if (typeof id !== 'string' || typeof status !== 'string') throw new HttpsError('invalid-argument', 'Bad request.');
  return moveBooking(req, id, status, 'lab');
});
exports.cancelDiagnosticBooking = onCall(REGION, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Login required.');
  const id = req.data?.id; if (typeof id !== 'string') throw new HttpsError('invalid-argument', 'Bad request.');
  return moveBooking(req, id, 'cancelled', 'patient');
});

// ---- Lab publishes a report. A re-publish is an amendment: the old version is kept with the reason. ----
exports.publishReport = onCall(REGION, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Login required.');
  if (req.auth.token.role !== 'lab') throw new HttpsError('permission-denied', 'Labs only.');
  const { bookingId, paths, amendReason } = req.data || {};
  const uid = req.auth.uid;
  if (typeof bookingId !== 'string' || !Array.isArray(paths) || paths.length < 1 || paths.length > 3) throw new HttpsError('invalid-argument', 'Bad request.');
  for (const p of paths) {
    if (typeof p !== 'string' || !p.startsWith(`lab_reports/${uid}/${bookingId}/`)) throw new HttpsError('invalid-argument', 'Bad file path.');
    if (!(await bucket().file(p).exists())[0]) throw new HttpsError('not-found', 'File not uploaded.');
  }
  const db = admin.firestore(), bRef = db.doc(`diagnostic_bookings/${bookingId}`), rRef = db.doc(`lab_reports/${bookingId}`);
  await db.runTransaction(async (tx) => {
    const [b, r] = await Promise.all([tx.get(bRef), tx.get(rRef)]);
    if (!b.exists || b.data().labUid !== uid) throw new HttpsError('permission-denied', 'Not your booking.');
    const x = b.data();
    if (!['processing', 'report_ready'].includes(x.status)) throw new HttpsError('failed-precondition', 'Sample is not in processing.');
    const files = paths.map(p => ({ path: p, name: p.split('/').pop().replace(/^\d+-/, '') }));
    let amendments = [];
    if (r.exists) {
      if (!(typeof amendReason === 'string' && amendReason.trim().length >= 5 && amendReason.length <= 300)) throw new HttpsError('invalid-argument', 'Amendment reason required.');
      amendments = [...(r.data().amendments || []), { files: r.data().files, reason: amendReason.trim(), by: uid, replacedAt: admin.firestore.Timestamp.now() }];
    }
    tx.set(rRef, {
      bookingId, labUid: uid, labName: x.labName, patientUid: x.patientUid, memberName: x.memberName, tests: x.tests.map(t => ({ name_en: t.name_en, name_hi: t.name_hi })),
      files, amendments, publishedBy: uid, publishedAt: FieldValue.serverTimestamp()
    });
    tx.update(bRef, { status: 'report_ready', reportId: bookingId, statusHistory: FieldValue.arrayUnion({ status: 'report_ready', by: uid, at: admin.firestore.Timestamp.now() }) });
    tx.set(db.collection('audit_logs').doc(), { action: r.exists ? 'report_amended' : 'report_published', targetUid: x.patientUid, bookingId, by: uid, at: FieldValue.serverTimestamp() });
  });
  await notify((await bRef.get()).data().patientUid, 'report_ready');
  return { ok: true };
});

// ---- Private report download. Never a public link. Every view is logged as access history. ----
exports.getReportFile = onCall(REGION, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Login required.');
  const { bookingId, path } = req.data || {};
  if (typeof bookingId !== 'string' || typeof path !== 'string') throw new HttpsError('invalid-argument', 'Bad request.');
  const db = admin.firestore();
  const [b, r] = await Promise.all([db.doc(`diagnostic_bookings/${bookingId}`).get(), db.doc(`lab_reports/${bookingId}`).get()]);
  if (!b.exists || !r.exists) throw new HttpsError('not-found', 'Report not found.');
  const uid = req.auth.uid, x = b.data();
  if (![x.patientUid, x.labUid].includes(uid) && req.auth.token.role !== 'admin') throw new HttpsError('permission-denied', 'Not allowed.');
  if (!(r.data().files || []).some(f => f.path === path)) throw new HttpsError('not-found', 'File not found.');
  const file = bucket().file(path);
  const [[buf], [meta]] = await Promise.all([file.download(), file.getMetadata()]);
  if (buf.length > 6 * 1024 * 1024) throw new HttpsError('failed-precondition', 'File too large.');
  await db.collection('audit_logs').add({ action: 'report_viewed', targetUid: x.patientUid, bookingId, by: uid, at: FieldValue.serverTimestamp() });
  return { contentType: meta.contentType || 'application/octet-stream', data: buf.toString('base64') };
});

// =====================================================================
// NOTIFICATIONS (in-app). Text lives in the translation files, so each message shows in the user's language.
// Messages never contain medical details: only that something happened. Best effort: a failure here never breaks the real action.
// =====================================================================
async function notify(uid, type, params = {}) {
  try { await admin.firestore().collection('notifications').add({ uid, type, params, read: false, createdAt: FieldValue.serverTimestamp() }); }
  catch (e) { console.error('notify failed', type, e.message); }
}
const count = async (q) => (await q.count().get()).data().count;

// =====================================================================
// PHASE 13: MEDICAL RECORDS, CONSENT SHARING, ACCESS HISTORY
// =====================================================================
const SHARE_DAYS = 30;
async function logAccess(recordId, ownerUid, by, byRole, action) {
  await admin.firestore().collection('record_access').add({ recordId, ownerUid, by, byRole, action, at: FieldValue.serverTimestamp() });
}
exports.shareRecord = onCall(REGION, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Login required.');
  if (req.auth.token.role !== 'patient') throw new HttpsError('permission-denied', 'Patients only.');
  const { recordId, doctorUid } = req.data || {};
  if (typeof recordId !== 'string' || typeof doctorUid !== 'string') throw new HttpsError('invalid-argument', 'Bad request.');
  const db = admin.firestore(), uid = req.auth.uid;
  const [rec, doc, appt] = await Promise.all([db.doc(`medical_records/${recordId}`).get(), db.doc(`doctors/${doctorUid}`).get(),
    db.collection('appointments').where('patientUid', '==', uid).where('doctorUid', '==', doctorUid).limit(1).get()]);
  if (!rec.exists || rec.data().ownerUid !== uid || rec.data().status !== 'active') throw new HttpsError('not-found', 'Record not found.');
  if (!doc.exists || doc.data().verified !== true) throw new HttpsError('not-found', 'Doctor not found.');
  if (appt.empty) throw new HttpsError('permission-denied', 'You can share only with doctors you have booked.'); // sharing is limited to your own doctors
  const r = rec.data();
  await db.doc(`consents/${recordId}_${doctorUid}`).set({
    recordId, ownerUid: uid, doctorUid, doctorName: doc.data().name, title: r.title, category: r.category, memberName: r.memberName, recordDate: r.recordDate || '',
    status: 'active', grantedAt: FieldValue.serverTimestamp(), expiresAt: admin.firestore.Timestamp.fromMillis(Date.now() + SHARE_DAYS * 864e5), revokedAt: null
  });
  await logAccess(recordId, uid, uid, 'patient', 'shared');
  await notify(doctorUid, 'record_shared');
  return { ok: true };
});
exports.revokeShare = onCall(REGION, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Login required.');
  const id = req.data?.consentId; if (typeof id !== 'string') throw new HttpsError('invalid-argument', 'Bad request.');
  const ref = admin.firestore().doc(`consents/${id}`), c = await ref.get();
  if (!c.exists || c.data().ownerUid !== req.auth.uid) throw new HttpsError('permission-denied', 'Not allowed.');
  await ref.update({ status: 'revoked', revokedAt: FieldValue.serverTimestamp() });
  await logAccess(c.data().recordId, req.auth.uid, req.auth.uid, 'patient', 'revoked');
  return { ok: true };
});
// Owner, or a doctor holding an active, unexpired consent. Every view is written to the access history.
exports.getRecordFile = onCall(REGION, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Login required.');
  const recordId = req.data?.recordId; if (typeof recordId !== 'string') throw new HttpsError('invalid-argument', 'Bad request.');
  const db = admin.firestore(), uid = req.auth.uid, rec = await db.doc(`medical_records/${recordId}`).get();
  if (!rec.exists || rec.data().status !== 'active') throw new HttpsError('not-found', 'Record not found.');
  const r = rec.data();
  let role = 'patient';
  if (r.ownerUid !== uid) {
    role = 'doctor';
    if (req.auth.token.role !== 'doctor') throw new HttpsError('permission-denied', 'Not allowed.');
    const c = await db.doc(`consents/${recordId}_${uid}`).get();
    if (!c.exists || c.data().status !== 'active' || c.data().expiresAt.toMillis() < Date.now()) throw new HttpsError('permission-denied', 'No active consent.');
  }
  if (!r.file?.path?.startsWith(`records/${r.ownerUid}/`)) throw new HttpsError('failed-precondition', 'Bad file.');
  const file = bucket().file(r.file.path), [[buf], [meta]] = await Promise.all([file.download(), file.getMetadata()]);
  if (buf.length > 6 * 1024 * 1024) throw new HttpsError('failed-precondition', 'File too large.');
  await logAccess(recordId, r.ownerUid, uid, role, 'viewed');
  return { contentType: meta.contentType || 'application/octet-stream', data: buf.toString('base64') };
});

// =====================================================================
// PHASE 14: HOSPITALS AND CLINICS
// =====================================================================
exports.reviewHospitalApplication = onCall(REGION, async (req) => {
  requireAdmin(req);
  const { uid, decision, reason } = req.data || {};
  if (typeof uid !== 'string' || !['approve', 'reject'].includes(decision)) throw new HttpsError('invalid-argument', 'Bad request.');
  if (decision === 'reject' && !(typeof reason === 'string' && reason.trim().length >= 5 && reason.length <= 300)) throw new HttpsError('invalid-argument', 'A reason of 5 to 300 characters is required.');
  const db = admin.firestore(), appRef = db.doc(`hospital_applications/${uid}`), userRef = db.doc(`users/${uid}`);
  await db.runTransaction(async (tx) => {
    const [a, u] = await Promise.all([tx.get(appRef), tx.get(userRef)]);
    if (!a.exists || a.data().status !== 'pending') throw new HttpsError('failed-precondition', 'Application is not pending.');
    if (u.exists && u.data().role !== 'patient') throw new HttpsError('failed-precondition', 'This account already has another role.');
    const d = a.data(), review = { reviewedBy: req.auth.uid, reviewedAt: FieldValue.serverTimestamp() };
    if (decision === 'approve') {
      tx.update(appRef, { status: 'approved', ...review });
      tx.set(db.doc(`hospitals/${uid}`), { uid, name: d.name, type: d.type, address: d.address, pin: d.pin, phone: d.phone, departments: d.departments || [], city: 'Udaipur', verified: true, active: true, verifiedAt: FieldValue.serverTimestamp() });
      tx.set(userRef, { role: 'hospital' }, { merge: true });
    } else tx.update(appRef, { status: 'rejected', rejectReason: reason.trim(), ...review });
    tx.set(db.collection('audit_logs').doc(), { action: decision === 'approve' ? 'hospital_approved' : 'hospital_rejected', targetUid: uid, by: req.auth.uid, at: FieldValue.serverTimestamp() });
  });
  if (decision === 'approve') await admin.auth().setCustomUserClaims(uid, { role: 'hospital' });
  await notify(uid, decision === 'approve' ? 'verified' : 'rejected');
  return { ok: true };
});
exports.getHospitalApplicationDocument = onCall(REGION, async (req) => {
  requireAdmin(req);
  const { uid, path } = req.data || {};
  if (typeof uid !== 'string' || typeof path !== 'string' || !path.startsWith(`hospital_docs/${uid}/`)) throw new HttpsError('invalid-argument', 'Bad request.');
  const a = await admin.firestore().doc(`hospital_applications/${uid}`).get();
  if (!a.exists || !(a.data().documents || []).some(d => d.path === path)) throw new HttpsError('not-found', 'Document not found.');
  const file = bucket().file(path), [[buf], [meta]] = await Promise.all([file.download(), file.getMetadata()]);
  if (buf.length > 6 * 1024 * 1024) throw new HttpsError('failed-precondition', 'File too large.');
  await admin.firestore().collection('audit_logs').add({ action: 'document_viewed', targetUid: uid, by: req.auth.uid, at: FieldValue.serverTimestamp() });
  return { contentType: meta.contentType || 'application/octet-stream', data: buf.toString('base64') };
});
// A hospital invites a verified doctor by medical registration number. The doctor must accept.
exports.inviteDoctor = onCall(REGION, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Login required.');
  if (req.auth.token.role !== 'hospital') throw new HttpsError('permission-denied', 'Hospitals only.');
  const reg = clip(req.data?.regNumber, 40); if (reg.length < 3) throw new HttpsError('invalid-argument', 'Registration number needed.');
  const db = admin.firestore(), hid = req.auth.uid;
  const [h, q] = await Promise.all([db.doc(`hospitals/${hid}`).get(), db.collection('doctors').where('regNumber', '==', reg).limit(2).get()]);
  if (!h.exists || h.data().verified !== true) throw new HttpsError('permission-denied', 'Hospital not verified.');
  if (q.size !== 1) throw new HttpsError('not-found', 'No single verified doctor with that number.');
  const d = q.docs[0], dd = d.data();
  if (dd.verified !== true) throw new HttpsError('not-found', 'Doctor not verified.');
  if (dd.hospitalId && dd.hospitalId !== hid) throw new HttpsError('failed-precondition', 'Doctor is linked to another hospital.');
  const ref = db.doc(`hospital_links/${hid}_${d.id}`), ex = await ref.get();
  if (ex.exists && ['active', 'invited'].includes(ex.data().status)) throw new HttpsError('already-exists', 'Already invited or linked.');
  await ref.set({ hospitalUid: hid, hospitalName: h.data().name, doctorUid: d.id, doctorName: dd.name, status: 'invited', createdAt: FieldValue.serverTimestamp() });
  await notify(d.id, 'hosp_invite');
  return { ok: true };
});
exports.respondAffiliation = onCall(REGION, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Login required.');
  if (req.auth.token.role !== 'doctor') throw new HttpsError('permission-denied', 'Doctors only.');
  const { id, accept } = req.data || {};
  if (typeof id !== 'string' || typeof accept !== 'boolean') throw new HttpsError('invalid-argument', 'Bad request.');
  const db = admin.firestore(), ref = db.doc(`hospital_links/${id}`), uid = req.auth.uid;
  let hid;
  await db.runTransaction(async (tx) => {
    const l = await tx.get(ref);
    if (!l.exists || l.data().doctorUid !== uid || l.data().status !== 'invited') throw new HttpsError('failed-precondition', 'No pending invitation.');
    hid = l.data().hospitalUid;
    tx.update(ref, { status: accept ? 'active' : 'declined', respondedAt: FieldValue.serverTimestamp() });
    if (accept) tx.update(db.doc(`doctors/${uid}`), { hospitalId: hid, hospitalName: l.data().hospitalName });
  });
  await notify(hid, 'hosp_response');
  return { ok: true };
});
exports.removeAffiliation = onCall(REGION, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Login required.');
  const id = req.data?.id; if (typeof id !== 'string') throw new HttpsError('invalid-argument', 'Bad request.');
  const db = admin.firestore(), ref = db.doc(`hospital_links/${id}`), uid = req.auth.uid;
  await db.runTransaction(async (tx) => {
    const l = await tx.get(ref);
    if (!l.exists || ![l.data().hospitalUid, l.data().doctorUid].includes(uid) || !['active', 'invited'].includes(l.data().status)) throw new HttpsError('permission-denied', 'Not allowed.');
    tx.update(ref, { status: 'removed', removedBy: uid, removedAt: FieldValue.serverTimestamp() });
    const dRef = db.doc(`doctors/${l.data().doctorUid}`), d = await tx.get(dRef);
    if (d.exists && d.data().hospitalId === l.data().hospitalUid) tx.update(dRef, { hospitalId: FieldValue.delete(), hospitalName: FieldValue.delete() });
  });
  return { ok: true };
});

// =====================================================================
// PHASE 15: SUPER ADMIN (stats, users, support tickets)
// =====================================================================
exports.adminStats = onCall(REGION, async (req) => {
  requireAdmin(req);
  const db = admin.firestore(), c = (name, f, v) => count(f ? db.collection(name).where(f, '==', v) : db.collection(name));
  const [patients, doctors, labs, hospitals, apTotal, apPending, apConfirmed, apDone, apCancelled, dbTotal, dbReady, dbCancelled, pDoc, pLab, pHosp, tickets] = await Promise.all([
    c('users', 'role', 'patient'), c('doctors'), c('labs'), c('hospitals'),
    c('appointments'), c('appointments', 'status', 'pending'), c('appointments', 'status', 'confirmed'), c('appointments', 'status', 'completed'), c('appointments', 'status', 'cancelled'),
    c('diagnostic_bookings'), c('diagnostic_bookings', 'status', 'report_ready'), c('diagnostic_bookings', 'status', 'cancelled'),
    c('doctor_applications', 'status', 'pending'), c('lab_applications', 'status', 'pending'), c('hospital_applications', 'status', 'pending'), c('support_tickets', 'status', 'open')]);
  return { patients, doctors, labs, hospitals, appointments: { total: apTotal, pending: apPending, confirmed: apConfirmed, completed: apDone, cancelled: apCancelled },
    diagnostics: { total: dbTotal, reportReady: dbReady, cancelled: dbCancelled }, pending: { doctors: pDoc, labs: pLab, hospitals: pHosp }, openTickets: tickets };
});
exports.setUserStatus = onCall(REGION, async (req) => {
  requireAdmin(req);
  const { uid, status } = req.data || {};
  if (typeof uid !== 'string' || !['active', 'suspended'].includes(status)) throw new HttpsError('invalid-argument', 'Bad request.');
  if (uid === req.auth.uid) throw new HttpsError('failed-precondition', 'You cannot change your own account.');
  const db = admin.firestore(), ref = db.doc(`users/${uid}`), u = await ref.get();
  if (!u.exists) throw new HttpsError('not-found', 'User not found.');
  if (u.data().role === 'admin') throw new HttpsError('failed-precondition', 'Cannot change an admin account.');
  await admin.auth().updateUser(uid, { disabled: status === 'suspended' });
  if (status === 'suspended') await admin.auth().revokeRefreshTokens(uid);
  await ref.update({ status });
  await db.collection('audit_logs').add({ action: status === 'suspended' ? 'user_suspended' : 'user_reactivated', targetUid: uid, by: req.auth.uid, at: FieldValue.serverTimestamp() });
  return { ok: true };
});
// Support tickets: the owner opens one (client write, see rules). Replies and closing go through here so both sides are trusted.
exports.replyTicket = onCall(REGION, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Login required.');
  const { id } = req.data || {}, text = clip(req.data?.text, 1000);
  if (typeof id !== 'string' || text.length < 2) throw new HttpsError('invalid-argument', 'Bad request.');
  const ref = admin.firestore().doc(`support_tickets/${id}`), t = await ref.get(), isAdmin = req.auth.token.role === 'admin';
  if (!t.exists || (t.data().ownerUid !== req.auth.uid && !isAdmin)) throw new HttpsError('permission-denied', 'Not allowed.');
  if (t.data().status === 'closed') throw new HttpsError('failed-precondition', 'Ticket is closed.');
  await ref.update({ replies: FieldValue.arrayUnion({ by: req.auth.uid, role: isAdmin ? 'admin' : 'user', text, at: admin.firestore.Timestamp.now() }), status: isAdmin ? 'answered' : 'open', updatedAt: FieldValue.serverTimestamp() });
  if (isAdmin) await notify(t.data().ownerUid, 'ticket_reply');
  return { ok: true };
});
exports.closeTicket = onCall(REGION, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Login required.');
  const id = req.data?.id; if (typeof id !== 'string') throw new HttpsError('invalid-argument', 'Bad request.');
  const ref = admin.firestore().doc(`support_tickets/${id}`), t = await ref.get();
  if (!t.exists || (t.data().ownerUid !== req.auth.uid && req.auth.token.role !== 'admin')) throw new HttpsError('permission-denied', 'Not allowed.');
  await ref.update({ status: 'closed', closedBy: req.auth.uid, updatedAt: FieldValue.serverTimestamp() });
  return { ok: true };
});
