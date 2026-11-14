# Automated tests

These run the real pages and the real `functions/index.js`, but against **stand-ins for Firebase** (an in-memory database, fake sign-in, fake storage). They do not touch your live project, and they cannot see real Firebase, so they do **not** replace testing on the live site (see `../TESTING.md`).

## What is checked
| Step | What it proves |
|---|---|
| Server logic | booking and double-booking, reschedule, status rules, prescriptions, lab booking capacity and areas, staff permissions, reports and amendments, payments (signature, webhook, coupons, refund), reviews, records and consent, deletion requests, reminders, email and AI rules |
| Every page | each page loads with no script error, shows no raw translation key such as `rv.avg`, no `undefined`, no sideways scrolling on a 320px phone, in English and Hindi, for each role |
| Empty database | the same pages survive a brand-new platform where nothing exists yet |
| Buttons and forms | forms are validated; each button sends the right request with the right data; wrong roles are bounced |
| Accessibility and SEO | tap targets are at least 44px, fields have names, one heading per page, private pages are `noindex`, public pages have a description |
| Content-Security-Policy | none of our own pages would be blocked by the policy in `firebase.json` |

## Not covered (do these by hand)
Firestore and Storage **security rules** (use the Firebase emulator), the real Firebase / Razorpay / email / AI services, real phones, and the legal and clinical review.

## Run on GitHub (nothing to install)
Push to GitHub. The workflow in `.github/workflows/tests.yml` runs on every push and pull request. Open the repository's **Actions** tab: a green tick means everything passed.

## Run on your own computer
```
cd tests
npm install
npx playwright install chromium
npm test
```
Single parts: `npm run test:server`, `test:pages`, `test:flows`, `test:audit`, `test:csp`.

## When a test fails
The message names the page or the action and what was expected. Fix the code (or, if the behaviour was changed on purpose, update the test). Seed data and the list of pages are in `scenarios.js`; the fake Firebase for the browser is `mock-all.js`; the fake Firebase for functions is in `fakes/`.
