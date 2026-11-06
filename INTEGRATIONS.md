# Email and AI assistant: setup

Both are built but **off**. Nothing is sent and no AI call is made until you add keys here AND switch the feature on in Admin > Integrations.

## Email notifications (Resend)
Emails go only to people who tick "Email me" in their Privacy center, only to a verified email address, and never contain medical details
(just "you have an update" plus a short headline such as "Your report is ready"). "Accepted" in the admin page means the email service took
the message; it does not prove delivery.

1. Create a Resend account (resend.com). To send to anyone you must verify a domain you own; without one, Resend only lets you test by sending to your own email.
2. Create an API key.
3. `functions/.env` : add `EMAIL_FROM=AAROGYA ORBIT <no-reply@yourdomain.com>` (the address must be on your verified domain).
4. Deploy. When asked for the secret `EMAIL_API_KEY`, paste the key (until you have it, type `not-configured`).
5. Admin > Integrations > Email: tick "Switch this on" and save.
6. Test: as a patient turn on "Email me" in Privacy center (your email must be verified), cause a notification (e.g. book and cancel), wait up to 5 minutes, check the inbox and the Email activity counts.

SMS and WhatsApp are NOT built. In India they need a registered sender (DLT for SMS) and an approved WhatsApp Business provider, plus a consent flow.

## AI help assistant (Anthropic API)
It answers how-to and care-finding questions only. It never receives anyone's records or reports, only the question typed on its page.
It is told not to diagnose, prescribe, advise on medicines or interpret values. Messages that sound urgent (for example chest pain, breathing trouble, self-harm) get fixed emergency guidance (112, Tele-MANAS 14416) and never wait for the AI.
People must consent first, and can withdraw in the Privacy center. The question is not stored by us; the AI provider handles it under its own terms and it may be processed outside India. Mention this in your privacy policy and have a lawyer review it, and review the provider's data terms, before launch.

1. Get an API key from the Anthropic Console.
2. Deploy. When asked for the secret `AI_API_KEY`, paste the key (until then type `not-configured`).
3. Optional: `functions/.env` : `AI_MODEL=claude-haiku-5-5` (this is the default; use another model name if you prefer).
4. Admin > Integrations > AI: tick "Switch this on" and save.
5. Test: open Help assistant, accept the consent, ask "How do I book a lab test?", then type "chest pain" and check you get the emergency message instantly.
Limits: 5 questions a minute and 30 a day per person.
