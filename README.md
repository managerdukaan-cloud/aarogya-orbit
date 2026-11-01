# AAROGYA ORBIT: Healthcare, All Connected.
Phase 2 foundation: branding, design tokens, splash, EN/HI i18n, responsive base, starter Firebase rules.

## Run locally
`npx serve .` (ES modules and fetch need a server, not file://)

## Deploy
`npm i -g firebase-tools && firebase login && firebase init` (reuse existing files), fill `js/firebase.js`, then `firebase deploy`.

## Status
| Item | Status |
|---|---|
| Logo set, splash, tokens, loader, tick animation | Done, needs your visual review |
| EN/HI switcher with persistence | Done, Hindi needs native review |
| Firestore/Storage rules | Starter only, not tested |
| Auth, portals, payments, notifications, AI | Not implemented |

## Next: Phase 3 (Firebase Auth, role claims via Cloud Function, welcome animation)
