# Online payments (Razorpay): setup

Status: the code is complete but **switched off**. Nothing is charged until you finish every step below.
Patients can always pay at the clinic or lab. No payment is ever faked: a booking is marked paid only after the
server verifies Razorpay's signature (or a verified webhook).

## 1. Get keys (start in TEST mode)
1. Create a Razorpay account. In the dashboard, switch to **Test Mode** and generate API keys (Key ID and Key Secret).
2. Test mode uses Razorpay's own test cards and moves no real money. Switch to Live only after KYC is approved and you have tested everything.
3. In Razorpay Settings > Payment Capture, choose **automatic capture**.

## 2. Add the keys (never put the secret in code or GitHub)
- **Key ID** (not secret): create or edit `functions/.env` and add one line:
  `RAZORPAY_KEY_ID=rzp_test_xxxxxxxx`
- **Secrets**: when you run `firebase deploy`, it asks for two secret values:
  - `RAZORPAY_KEY_SECRET` : your Key Secret. Until you have it, type `not-configured`.
  - `RAZORPAY_WEBHOOK_SECRET` : a long random string you invent (also used in step 3). Until then, type `not-configured`.
- To change a secret later: `firebase functions:secrets:set RAZORPAY_KEY_SECRET` then redeploy.
- Do not commit `functions/.env` if it ever holds anything private. The Key ID alone is not secret.

## 3. Webhook
After deploy, find the URL of the `razorpayWebhook` function (Firebase Console > Functions). In Razorpay > Webhooks, add that URL, paste your `RAZORPAY_WEBHOOK_SECRET`, and tick **payment.captured**, **order.paid** and **refund.processed**.

## 4. Turn it on
Admin > Payments: set the commission percentage and fixed fee, tick **Allow patients to pay online**, save. The page says "Online payment is ON" when everything is ready.

## 5. Test in Test Mode
Book an appointment as a patient, press **Pay online**, use a Razorpay test card, then check: the booking shows "Paid online", a receipt opens, Admin > Payments lists it, and a Refund works.

## Before going Live
Complete Razorpay KYC, replace test keys with live keys, re-test with a small real payment and a refund, and have a lawyer review refund and cancellation terms and any tax requirements. The receipt is NOT a tax invoice.
