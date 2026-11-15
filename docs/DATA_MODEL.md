# Data model (Cloud Firestore)

Rule of thumb used everywhere: **anything that decides money, safety, identity or access is written only by a Cloud Function** (clients cannot write it at all).
"Client" below means the person's browser, within the limits in `firestore.rules`. "Function" means code in `functions/index.js` (Admin SDK).
Anything not listed here, including `rate_limits`, is denied to all clients.

## Accounts and roles
| Collection | What it holds | Written by | Read by |
|---|---|---|---|
| `users/{uid}` | profile: name, phone, dob, gender, language, role, status | Function creates it and sets `role`; client may edit only name, phone, dob, gender, language | owner, admin |
| `family_members/{id}` | people added under one account; consent flag; soft-removed with `status` | owner (create, edit, soft-remove; never hard delete) | owner |
| `lab_staff/{staffUid}` | staff of a lab and their permissions (bookings, reports) | Function | the lab, the staff member, admin |
| `notification_preferences/{uid}` | reminders / updates / email opt-in | owner | owner |
| `ai_consent/{uid}` | consent to use the AI assistant | Function | owner |
| `deletion_requests/{uid}` | account deletion request and its status | Function | owner, admin |

Roles live in the sign-in token (custom claims) and are set only by functions: `patient, doctor, lab, staff, hospital, admin`. Lab staff also carry `labUid`, `canBookings`, `canReports`.

## Providers (public, verified)
| Collection | What it holds | Written by | Read by |
|---|---|---|---|
| `doctor_applications/{uid}` | application, private documents list, status | applicant (create/edit while pending or rejected); status changes only by Function | owner, admin |
| `doctors/{uid}` | public verified profile (no phone, no documents); rating totals; featured | Function (on approval, reviews, hospital link, featured) | everyone |
| `doctor_schedules/{uid}` | weekly timings and slot length | the doctor | everyone |
| `lab_applications/{uid}`, `labs/{uid}` | same pattern for labs (`accreditationVerified` only if admin confirmed) | applicant / Function | owner+admin / everyone |
| `lab_settings/{uid}` | lab hours, slot length, capacity per slot, home-collection PIN codes | the lab | everyone |
| `lab_pricing/{labUid_testId}` | a lab's real price, original price, report hours, home flag | the lab (own rows only) | everyone |
| `lab_package_pricing/{labUid_packageId}` | same, for packages | the lab | everyone |
| `hospital_applications/{uid}`, `hospitals/{uid}` | same pattern for hospitals and clinics; departments editable by the hospital | applicant / Function (+ hospital edits departments, phone) | owner+admin / everyone |
| `hospital_links/{hospitalUid_doctorUid}` | invitation and affiliation (invited, active, declined, removed) | Function | active links public; otherwise the two parties and admin |
| `subscriptions/{providerUid}` | plan name, amount (for records), end date, status. Tracks status only; it charges nobody | Function | the provider, admin |

## Catalogue and areas (admin-managed)
`specialities`, `diagnostic_categories`, `diagnostic_tests` (clinical fields such as preparation are blank until a qualified person fills them), `test_packages` (exact included `testIds`), `service_areas/{pin}` (home collection only in active PIN codes): written by admin, read by everyone.

## Bookings
| Collection | What it holds | Written by | Read by |
|---|---|---|---|
| `appointments/{id}` | doctor booking: patient, member, doctor, date, time, fee, status, history, payment status, `lockId` | Function only | the patient, the doctor, admin |
| `booked_slots/{doctorUid_date_HHMM}` | one document per taken slot (no personal data). Its existence is what stops double booking | Function (created/deleted in transactions) | everyone |
| `prescriptions/{appointmentId}` | immutable, doctor-attributed, with registration number snapshot | Function only | the patient, the issuing doctor, admin |
| `diagnostic_bookings/{id}` | lab booking: tests with snapshot prices, package, home address, status history | Function only | the patient, the lab, staff with the bookings permission, admin |
| `lab_slot_counts/{labUid_date_HHMM}` | how many bookings a lab slot already has (capacity guard) | Function | everyone |
| `lab_reports/{bookingId}` | report file paths and amendment history (files are private in Storage) | Function only | the patient, the lab, staff with the reports permission, admin |

## Records, consent, privacy
| Collection | What it holds | Written by | Read by |
|---|---|---|---|
| `medical_records/{id}` | metadata of an uploaded document (file stays private in Storage `records/<uid>/`) | owner creates; soft-remove only | owner |
| `consents/{recordId_doctorUid}` | a 30-day share of one record with one doctor you have booked | Function | owner, that doctor |
| `record_access/{id}` | who shared, viewed or revoked, and when | Function | owner |
| `audit_logs/{id}` | sensitive actions (approvals, suspensions, refunds, document and report views) | Function | admin |

## Money and trust
| Collection | What it holds | Written by | Read by |
|---|---|---|---|
| `payments/{orderId}` | order, amount from our database, coupon, commission, status, refund | Function only (marked paid only after signature verification) | the patient, the provider, admin |
| `coupons/{CODE}` | discount rules and usage count | admin; `used` incremented by Function | admin (checked on the server at payment) |
| `reviews/{kind_refId}` | one review per finished visit; hidden reviews are excluded from ratings | Function only | published ones public; owner; admin |
| `settings/platform` | commission %, fixed fee, online payment switch | admin | signed-in users |
| `settings/email`, `settings/ai` | on/off switches for email and the AI assistant | admin | admin |

## Communication and support
| Collection | What it holds | Written by | Read by |
|---|---|---|---|
| `notifications/{id}` | in-app messages (type + params, never medical details); client may only mark `read` | Function | the recipient |
| `email_outbox/{id}` | queue of emails; `accepted` means the provider took it, not that it was delivered | Function | admin |
| `support_tickets/{id}` | ticket opened by the user; replies and closing by Function | owner creates; Function replies | owner, admin |
| `banners/{id}` | homepage banners (link must start with `/` or `https://`) | admin | everyone |

## Storage (bucket `aarogya-orbit-mumbai`, all private)
`doctor_docs/<uid>/`, `lab_docs/<uid>/`, `hospital_docs/<uid>/` (verification documents: owner uploads, admin views through a function), `lab_reports/<labUid>/<bookingId>/` (lab or permitted staff upload; patients download through a function), `records/<uid>/` (owner uploads; doctors with consent read through a function). Nobody is given a public link. Files are create-only (no overwrite), 5 MB, PDF/JPG/PNG.

## Indexes
Every query uses equality filters or a single-field sort, so no composite index is needed (`firestore.indexes.json` stays empty). If you add a query that filters on one field and sorts on another, Firebase prints a link to create the index.
