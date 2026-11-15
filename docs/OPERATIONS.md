# Operations: backup, monitoring, incidents

Commands below were written from memory of the Google Cloud tools. Check them against the current Google Cloud documentation before relying on them.

## Backups and recovery (set these up before launch)
1. **Firestore point-in-time recovery** (lets you restore to any minute in the last 7 days): `gcloud firestore databases update --database='(default)' --enable-pitr`.
2. **Scheduled Firestore backups**: `gcloud firestore backups schedules create --database='(default)' --recurrence=daily --retention=14d`.
3. **Storage**: turn on object versioning and soft delete for the private bucket so an overwritten or deleted report can be recovered: `gcloud storage buckets update gs://aarogya-orbit-mumbai --versioning`.
4. **Code**: GitHub is the backup of the code. Keep `main` protected and deploy only from it.
5. **Restore drill**: once before launch, restore a backup into a *new* database and check that appointments, records and reports are there. A backup you have never restored is not yet a backup.
6. Decide and write down how long each kind of data is kept (clinical records, prescriptions, payments, logs) with legal advice, then enforce it.

## Monitoring
- Google Cloud Billing: set a budget with alerts at 50%, 90% and 100%.
- Cloud Logging / Error Reporting: create an alert for function errors (especially `bookAppointment`, `bookDiagnostic`, `verifyPayment`, `razorpayWebhook`, `publishReport`, `getReportFile`).
- Firebase Console > Authentication: watch for sudden spikes in sign-ups.
- Admin > Readiness and Admin > Audit log: check weekly.
- Content-Security-Policy runs in **report-only** mode. While testing, open the browser console on each page; if it lists a blocked item that is needed, add that host to the policy in `firebase.json`. When the console is clean for a few weeks, change the header name to `Content-Security-Policy` to enforce it.

## If something goes wrong
| Situation | First actions |
|---|---|
| Wrong website version live | Firebase Console > Hosting > Release history > Rollback |
| A bad function release | `git revert` the change, redeploy functions; use Admin switches (Payments, Integrations) to turn the feature off meanwhile |
| Payments misbehaving | Admin > Payments: untick "Allow patients to pay online". Review Razorpay dashboard. Refund through Admin > Payments |
| A secret leaked | Rotate it at the provider, `firebase functions:secrets:set NAME`, redeploy, review the audit log |
| A staff account or user is abusing | Admin > Users > Suspend (signs them out and blocks login). Lab staff: the lab owner removes them |
| A provider was approved by mistake | Suspend the account; hide reviews; remove the public profile in the Console and record why in a ticket |
| Suspected data exposure | Stop the feature, preserve logs, and get legal advice about notification duties under the DPDP Act before telling anyone anything specific |

## Routine
- Weekly: review pending verifications, open support tickets, deletion requests, audit log.
- Monthly: review Auth users with roles `admin`, `lab`, `staff`; remove anyone who should not have access. Check billing.
- Each release: run the tests (`tests/README.md`), deploy, then walk through `TESTING.md` sections 2 and 3 on a phone.
