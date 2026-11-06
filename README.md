# AAROGYA ORBIT – Healthcare, All Connected.

Launch market: Udaipur, Rajasthan. Hindi and English throughout. Firebase (Auth, Firestore, Storage, Functions, Hosting).

## Deploy
```
firebase deploy --only functions,hosting,firestore:rules,storage
```
`ADMIN_EMAILS` (asked at deploy) = the Gmail addresses allowed to become Super Admin. Private files live in the Mumbai bucket `aarogya-orbit-mumbai`.

## Roles (set only by Cloud Functions, never by the browser)
patient · doctor · lab · hospital · admin

## What each part does
| Area | Status |
|---|---|
| Login, signup, Google login, password reset, welcome animation | Built, tested by owner |
| Patient profile, family members | Built, tested |
| Doctor registration, admin verification, schedule, booking, double-booking guard | Built, tested |
| Doctor appointment panel, prescriptions (immutable, doctor-attributed, printable) | Built, tested |
| Lab registration and verification, test catalogue, lab prices, price comparison, home collection, sample status, private reports | Built, **not yet tested end to end** |
| Health records, consent sharing (30 days, revocable), access history | Built, **not yet tested** |
| Hospital/clinic registration, departments, doctor affiliation, public discovery | Built, **not yet tested** |
| Admin dashboard (real numbers), users (suspend), support tickets, audit log | Built, **not yet tested** |
| In-app notifications (Hindi/English) | Built, **not yet tested** |
| Homepage, privacy and terms pages | Built. Legal text is a DRAFT |
| Online payments (Razorpay), receipts, refunds, commission setting | Built, **switched off until keys are added** (see PAYMENTS_SETUP.md). Not tested with real keys |
| Reviews and ratings (genuine, one per finished visit, admin can hide) | Built, **not yet tested** |
| Appointment reschedule (max 2, doctor re-confirms) | Built, **not yet tested** |
| Health packages (admin-defined, lab prices, exact tests shown, bookable) | Built, **not yet tested** |
| Privacy center: download my data, consent/sharing view, access history, notification preferences, deletion request | Built, **not yet tested** |
| Rate limits on sensitive actions (booking, sharing, payment, reviews, tickets, invitations) | Built, **not yet tested** |
| Daily in-app reminders (appointment, sample collection, follow-up, plan ending) | Built, **not yet tested** (needs Cloud Scheduler) |
| Homepage banners, featured (sponsored) labels, coupons, provider plan tracking | Built, **not yet tested**. Plans only record status; they do not charge anyone |
| Lab staff accounts (owner adds staff; bookings and optional report permission) | Built, **not yet tested** |
| Email notifications (opt-in, verified email only, no medical details) | Built, **off until a provider key is added** (INTEGRATIONS.md). Not tested |
| AI help assistant (consent first, no access to records, emergency messages bypass the AI) | Built, **off until a key is added** (INTEGRATIONS.md). Not tested |
| Admin Integrations and Readiness pages, TESTING.md | Built, **not yet tested** |
| Hospital staff accounts, SMS, WhatsApp, push, ABDM | **Not built** |
| Service worker / offline | **Not built** on purpose (avoids stale private pages) |

## Handling an account deletion request (manual, on purpose)
Admin > Data requests shows each request. Nothing is erased automatically, because some clinical and payment records may have to be kept by law. For each request, with legal advice on retention:
1. Decide what must be kept (prescriptions, bookings, payments) and for how long.
2. Remove what can go: the user's uploaded files in Storage `records/<uid>/`, their `family_members`, `medical_records`, `consents`, `notifications`, and profile fields.
3. Disable or delete the Auth user (Firebase Console > Authentication).
4. Mark the request Completed with a note saying what was done and why anything was kept. The person is notified.

## Known limitations
- One role per account. A doctor, lab or hospital registers with its own email. Lab staff are added by the lab owner and act for one lab only.
- Staff do not receive the lab's notifications; only the owner does.
- One test per lab booking on screen (server accepts up to 10).
- No distance sorting or ratings (no real data yet).
- Firestore security rules and Storage rules were reviewed by reading, not by an emulator test suite. Write and run rules tests before launch.
- Rate limits are simple per-person counters; add Firebase App Check and abuse monitoring before launch.
- Reminders are in-app only. Email, SMS and WhatsApp are not connected.

## Launch checklist
1. **Delete all test data**: test doctors (`doctors`), labs (`labs`), hospitals, appointments, bookings, records, tickets, and test Auth users.
2. Add real Udaipur PIN codes in Admin > Service areas.
3. Verify every real provider's registration with the issuing authority before pressing Approve.
4. Have the privacy policy and terms reviewed by a qualified lawyer; fill the `[ ]` placeholders. Review DPDP Act, NMC telemedicine rules, clinical establishment and lab regulations, and any NABL claims.
5. Run a security review of `firestore.rules` and `storage.rules` with the Firebase emulator; test with a non-admin account that every forbidden action fails.
6. Set a Cloud Billing budget alert, enable Firestore backups/PITR, and decide data retention periods.
7. Follow PAYMENTS_SETUP.md: test mode first, then live keys after KYC. Re-test payment and refund with real small amounts.
8. Test on real Android phones in Hindi and English (320px to 1920px).
9. Replace placeholders for contact details; connect a custom domain and update `sitemap.xml` and `robots.txt`.
10. Do not say "ABDM", "NABL" or "verified" anywhere unless it is actually true for that provider.
