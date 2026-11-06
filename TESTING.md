# Testing guide (do these in order)

Use incognito windows. You need at least 2 browsers or profiles so you can be two people at once. Use a few throwaway Gmail or email addresses.
If anything fails: take a screenshot, press F12, open the Console tab, and note the red error. Then tell me which step number failed.
Tip: after each deploy press Ctrl+Shift+R.

## 0. Admin setup (your admin Gmail)
1. Log in. You should land on Dashboard. Open **Readiness** and press Check again. Fix the red crosses that are not marked optional.
2. Verifications > Add default specialities.
3. Verifications > Service areas: add one real Udaipur PIN code (e.g. the one your test lab uses).
4. Catalogue > Add starter tests and categories.
5. Packages: make one package with 2-3 tests.

## 1. Doctor journey
1. Account A: sign up (email). Dashboard > Join as a doctor. Fill the form, upload any PDF. Submit.
2. Admin: Verifications > View certificate > Approve.
3. Account A: log out, log in. Role shows Doctor. Open My schedule, set tomorrow's weekday, 15 minutes, save.
4. Open the public Doctors page (no login). The doctor appears with the timings.

## 2. Patient journey
1. Account B: sign up. Profile: add a phone number and save. Family: add one member.
2. Doctors > Book. Pick tomorrow and a time, for yourself. Confirm.
3. Book the same time again from another account (Account C) or look at the slot: it must be disabled.
4. Account A (doctor): Appointments > Accept. Account B sees Confirmed.
5. Account B: Reschedule to another time. Account A sees it as needing confirmation; Accept again.
6. Book a second appointment for the family member, then Cancel it. The slot must free up.
7. Doctor: on the appointment day press Patient arrived > Start consultation > Mark completed (if you cannot wait for the day, test these buttons with a same-day slot).
8. Doctor: Write prescription. Patient: My prescriptions, Print. Patient: Rate this visit. Doctors page shows the rating.
9. Patient: Records > Add a record (PDF). Share with the doctor. Doctor: Shared records > View. Patient: Records > Who has accessed this shows the view. Patient: Stop sharing; the doctor's list becomes empty.

## 3. Lab journey
1. Account D: sign up. Register your lab (any PDF). Admin approves. D logs out and in; role is Laboratory.
2. Hours and areas: tomorrow, 60 minutes, capacity 2, PIN = the service-area PIN you added.
3. Test prices: price 2-3 tests (tick home collection on one). Package prices: price your package.
4. Patient B: Lab tests > pick a test > Compare labs > Book. Try Home collection with the same PIN, then a wrong PIN (must be refused).
5. Lab D: Bookings. Move through the statuses. At Processing upload a PDF and Publish.
6. Patient B: Lab bookings > Report > opens. Rate this lab.
7. Staff: Account E signs up and verifies the email. Lab D: Lab staff > add E (tick reports if you like). E logs out/in: role is Lab staff, sees Bookings only. E cannot open prices or hours.

## 4. Hospital journey
1. Account F registers a hospital (any PDF). Admin approves. F logs out/in.
2. Hospital portal: set departments. Invite the doctor by registration number. Doctor A: Hospital affiliation > Accept.
3. Public Hospitals page shows it with the doctor.

## 5. Admin checks
Dashboard numbers match what you did. Users: suspend a test account (it must be signed out and unable to log in), then reactivate. Support: patient sends a ticket via Help; admin replies; patient sees it and a notification. Audit log shows the sensitive actions. Reviews: hide one; the rating changes.

## 6. Privacy and notifications
1. Patient: Privacy center > Download my data (opens as a file). Turn reminders off and on.
2. Request deletion; admin sees it in Data requests; mark it handled with a note; the patient is notified. (Nothing is deleted automatically.)
3. Notifications page lists updates in the chosen language.

## 7. Language and phone
Switch हिं on every page above; nothing should be cut off or show raw keys like `rv.avg`. Repeat the patient journey on a real Android phone (check bottom bar, forms, buttons).

## 8. Optional integrations (see PAYMENTS_SETUP.md and INTEGRATIONS.md)
Payments in Razorpay TEST mode: pay a booking, check the receipt, refund it. Email: opt in, trigger a notification, check the inbox. AI: accept consent, ask a how-to question, then type "chest pain" and confirm the instant emergency message.

## 9. Before real users
Delete all test accounts and data, then walk through the manual checklist at the bottom of the Readiness page.
