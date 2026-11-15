const { chromium } = require('playwright');
const fs = require('fs'), serve = require('./server.js'), { scenario } = require('./scenarios.js');
const ROOT = process.argv[2] || require('path').resolve(__dirname, '..'), PORT = 8741, MOCK = fs.readFileSync(__dirname + '/mock-all.js', 'utf8');
const only = process.env.ONLY ? new RegExp(process.env.ONLY, 'i') : null;
const results = []; let browser;
async function open(role, url, { lang = 'en', width = 390, scn = null, dialogs = [] } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 900 } }), sc = Object.assign(scenario(role), scn || {});
  await ctx.addInitScript(({ sc, lang }) => { window.__SCENARIO = sc; localStorage.setItem('ao_lang', lang); }, { sc, lang });
  await ctx.route('https://www.gstatic.com/firebasejs/**', r => r.fulfill({ contentType: 'application/javascript', body: MOCK }));
  await ctx.route(/fonts\.|razorpay/, r => r.fulfill({ body: '' }));
  const page = await ctx.newPage(), errs = []; page.__errs = errs; page.__ctx = ctx;
  page.on('pageerror', e => errs.push(e.message.split('\n')[0]));
  let di = 0; page.on('dialog', d => d.accept(typeof dialogs[di] === 'string' ? dialogs[di++] : undefined));
  await page.goto(`http://localhost:${PORT}/${url}`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => { const a = document.getElementById('app'); return !a || !a.hidden; }, null, { timeout: 4000 }).catch(() => {}); await page.waitForTimeout(200);
  return page;
}
const calls = (p, n) => p.evaluate((n) => (window.__calls || []).filter(c => !n || c.name === n), n);
const writes = (p) => p.evaluate(() => window.__writes || []);
const txt = (p, sel) => p.locator(sel).first().innerText();
const msg = async (p, sel = '#msg') => { await p.waitForTimeout(250); return (await p.locator(sel).first().isVisible()) ? txt(p, sel) : ''; };
const eq = (a, b, what) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${what}: expected ${JSON.stringify(b)} got ${JSON.stringify(a)}`); };
const ok = (c, what) => { if (!c) throw new Error(what); };
async function T(name, fn) { if (only && !only.test(name)) return; let p; try { await fn(); results.push([name, 'PASS']); } catch (e) { results.push([name, 'FAIL', e.message.split('\n')[0]]); } }
const pickSlot = async (p) => { const n = await p.locator('#dates .chip').count(); for (let i = 0; i < n; i++) { await p.locator('#dates .chip').nth(i).click(); await p.waitForTimeout(200); if (await p.locator('#times .chip:not([disabled])').count()) { await p.locator('#times .chip:not([disabled])').first().click(); await p.waitForTimeout(150); return; } } throw new Error('no free slot on any date'); };
const first = async (p, sel) => { await p.locator(sel).first().click(); await p.waitForTimeout(250); };

(async () => {
  const server = await serve(ROOT, __dirname, PORT); browser = await chromium.launch();
  const done = async (p) => { const e = p.__errs.slice(); await p.__ctx.close(); if (e.length) throw new Error('page error: ' + e[0]); };

  await T('auth: empty signup shows an error, nothing is sent', async () => {
    const p = await open('none', 'auth.html'); await first(p, '[data-tab=signup]'); await first(p, '#submit'); ok((await msg(p)).length > 3, 'no error message'); eq((await calls(p)).length, 0, 'calls'); await done(p); });
  await T('auth: password strength meter reacts', async () => {
    const p = await open('none', 'auth.html'); await first(p, '[data-tab=signup]'); await p.fill('#password', 'abc'); const weak = await p.locator('#meter').getAttribute('data-level');
    await p.fill('#password', 'Abcdef12!xyzAbc'); const strong = await p.locator('#meter').getAttribute('data-level'); ok(+strong > +weak, `meter ${weak} -> ${strong}`); await done(p); });
  await T('auth: signup without consent is refused; with consent it welcomes and calls ensureProfile', async () => {
    const p = await open('none', 'auth.html'); await first(p, '[data-tab=signup]'); await p.fill('#name', 'Asha Verma'); await p.fill('#email', 'asha@example.com'); await p.fill('#password', 'Strong#Pass1'); await first(p, '#submit');
    ok((await msg(p)).length > 3, 'terms error missing'); await p.check('#terms'); await first(p, '#submit'); await p.waitForSelector('#welcome:not([hidden])', { timeout: 3000 }); ok((await txt(p, '#hello')).includes('Asha'), 'name not in welcome');
    eq((await calls(p, 'ensureProfile')).length, 1, 'ensureProfile calls'); await p.waitForURL('**/dashboard.html', { timeout: 5000 }); await done(p); });
  await T('auth: wrong email format is caught on login', async () => {
    const p = await open('none', 'auth.html'); await p.fill('#email', 'not-an-email'); await p.fill('#password', 'x'); await first(p, '#submit'); ok((await msg(p)).length > 3, 'no error'); await done(p); });

  await T('profile: bad phone refused, good phone saved (only allowed fields)', async () => {
    const p = await open('patient', 'profile.html'); await p.fill('#phone', '12345'); await first(p, '#save'); ok((await msg(p)).length > 3, 'no phone error'); eq((await writes(p)).length, 0, 'writes before valid');
    await p.fill('#phone', '9811122233'); await first(p, '#save'); const w = (await writes(p))[0]; ok(w && w.path === 'users/p1', 'wrong path ' + (w && w.path)); eq(Object.keys(w.data).sort(), ['dob', 'gender', 'language', 'name', 'phone', 'updatedAt'].sort(), 'fields written'); await done(p); });
  await T('family: add member needs consent; saved with owner and active status', async () => {
    const p = await open('patient', 'family.html'); await first(p, '#add'); await p.fill('#name', 'Ravi Verma'); await p.selectOption('#relationship', 'parent'); await first(p, '#save'); ok((await msg(p)).length > 3, 'no consent error');
    await p.check('#consent'); await first(p, '#save'); const w = (await writes(p)).find(x => x.path.startsWith('family_members/')); ok(w, 'nothing written'); eq([w.data.ownerUid, w.data.status, w.data.consentConfirmed], ['p1', 'active', true], 'family doc'); await done(p); });
  await T('doctors: featured doctor labelled, Book links to booking page', async () => {
    const p = await open('patient', 'doctors.html'); ok((await txt(p, '#list')).toLowerCase().includes('featured'), 'no Featured label'); const href = await p.locator('#list a.btn').first().getAttribute('href'); eq(href, '/book.html?d=d1', 'book link'); await done(p); });
  await T('doctors: search filters the list, fee filter hides expensive doctors', async () => {
    const p = await open('none', 'doctors.html'); await p.fill('#q', 'zzz'); await p.waitForTimeout(150); eq(await p.locator('#list article').count(), 0, 'search no match'); await p.fill('#q', ''); await p.fill('#maxfee', '100'); await p.waitForTimeout(150); eq(await p.locator('#list article').count(), 0, 'fee filter'); await done(p); });

  await T('book: choose date+time, confirm -> bookAppointment payload', async () => {
    const p = await open('patient', 'book.html?d=d1'); await pickSlot(p); await first(p, '#confirm');
    const c = (await calls(p, 'bookAppointment'))[0]; ok(c, 'bookAppointment not called'); eq(Object.keys(c.data).sort(), ['date', 'doctorUid', 'memberId', 'time'], 'payload keys'); eq([c.data.doctorUid, c.data.memberId], ['d1', 'self'], 'ids'); ok(/^\d{4}-\d{2}-\d{2}$/.test(c.data.date) && /^\d{2}:\d{2}$/.test(c.data.time), 'date/time format');
    ok(await p.locator('#done').isVisible(), 'no success panel'); await done(p); });
  await T('book: for a family member sends that member id', async () => {
    const p = await open('patient', 'book.html?d=d1'); await p.selectOption('#member', 'f1'); await pickSlot(p); await first(p, '#confirm'); eq((await calls(p, 'bookAppointment'))[0].data.memberId, 'f1', 'member'); await done(p); });
  await T('book: slot taken error offers to choose again (no success shown)', async () => {
    const p = await open('patient', 'book.html?d=d1', { scn: { fnError: { bookAppointment: 'functions/already-exists' } } }); await pickSlot(p); await first(p, '#confirm'); ok((await msg(p)).length > 3, 'no message'); ok(!(await p.locator('#done').isVisible()), 'success shown on failure'); await done(p); });
  await T('book: a doctor account cannot book (blocked notice)', async () => {
    const p = await open('doctor', 'book.html?d=d1'); ok(await p.locator('#blocked').isVisible(), 'no blocked notice'); ok(!(await p.locator('#formWrap').isVisible()), 'form visible'); await done(p); });
  await T('reschedule: pick new slot -> rescheduleAppointment', async () => {
    const p = await open('patient', 'reschedule.html?r=ap1'); await pickSlot(p); await first(p, '#confirm'); const c = (await calls(p, 'rescheduleAppointment'))[0]; ok(c, 'not called'); eq(c.data.id, 'ap1', 'id'); await done(p); });
  await T('appointments: cancel calls cancelAppointment; paid one shows receipt; completed shows rate link', async () => {
    const p = await open('patient', 'appointments.html', { dialogs: [undefined] }); const has = async (href) => (await p.locator(`#list a[href="${href}"]`).count()) === 1; ok(await has('/receipt.html?p=ord1'), 'receipt link'); ok(await has('/review.html?k=doctor&id=ap3'), 'rate link'); ok(await has('/reschedule.html?r=ap1'), 'reschedule link');
    await p.locator('#list article', { hasText: '10:15' }).locator('button.danger').click(); await p.waitForTimeout(300); eq((await calls(p, 'cancelAppointment'))[0]?.data, { id: 'ap1' }, 'cancel payload'); await done(p); });

  await T('doctor panel: Accept sends confirmed; pending/rescheduled show Accept+Reject; in-consultation has Prescription link', async () => {
    const p = await open('doctor', 'doctor-appointments.html'); await p.selectOption('#filter', 'all'); await p.waitForTimeout(200);
    const card = p.locator('#list article', { hasText: '17:30' }); ok((await card.locator('button').count()) === 2, 'pending should have 2 buttons'); const resched = p.locator('#list article', { hasText: '10:45' }); ok((await resched.locator('button').count()) === 2, 'rescheduled should have 2 buttons');
    await card.locator('button.btn-primary').click(); await p.waitForTimeout(300); const c = (await calls(p, 'updateAppointmentStatus'))[0]; eq(c.data, { id: 'ap4', status: 'confirmed' }, 'payload');
    ok((await p.locator('#list a[href^="/prescription.html?a=ap2"]').count()) === 1, 'prescription link for in_consultation'); await done(p); });
  await T('prescription: form needs a medicine; submit sends createPrescription with trimmed rows', async () => {
    const p = await open('doctor', 'prescription.html?a=ap2', { dialogs: [undefined] }); await first(p, '#issue'); ok((await msg(p)).length > 3, 'no empty error'); eq((await calls(p, 'createPrescription')).length, 0, 'sent while empty');
    const row = p.locator('.medrow').first(); await row.locator('input[data-k=name]').fill('  Paracetamol '); await row.locator('input[data-k=dose]').fill('500 mg'); await p.fill('#advice', 'Rest'); await first(p, '#issue');
    const c = (await calls(p, 'createPrescription'))[0]; ok(c, 'not sent'); eq(c.data.appointmentId, 'ap2', 'appt'); eq(c.data.medicines[0].name, 'Paracetamol', 'trim'); await done(p); });
  await T('prescription: a patient sees the issued prescription with doctor reg no', async () => {
    const p = await open('patient', 'prescription.html?a=ap3'); const t = await txt(p, '#view'); ok(t.includes('RJ12345') && t.includes('Paracetamol'), 'content missing'); await done(p); });
  await T('schedule: saves doctor_schedules with valid weekly ranges; bad range refused', async () => {
    const p = await open('doctor', 'schedule.html'); await p.fill('#mon-s0', '12:00'); await p.fill('#mon-e0', '10:00'); await first(p, '#save'); ok((await msg(p)).length > 3, 'no range error'); eq((await writes(p)).length, 0, 'wrote bad schedule');
    await p.fill('#mon-e0', '14:00'); await first(p, '#save'); const w = (await writes(p))[0]; eq(w.path, 'doctor_schedules/d1', 'path'); eq(w.data.weekly.mon[0], { start: '12:00', end: '14:00' }, 'mon'); await done(p); });

  await T('lab pricing: saving writes lab_pricing/<lab>_<test> with integer hours; bad data refused', async () => {
    const p = await open('lab', 'lab-pricing.html'); const card = p.locator('#list article', { hasText: 'CBC' }); const inputs = card.locator('input[type=text]'); await inputs.nth(0).fill('0'); await card.locator('button').last().click(); ok((await msg(p)).length > 3, 'no price error');
    await inputs.nth(0).fill('350'); await inputs.nth(2).fill('12'); await card.locator('button').last().click(); await p.waitForTimeout(250); const w = (await writes(p)).find(x => x.path === 'lab_pricing/l1_cbc'); ok(w, 'not written'); eq([w.data.price, w.data.turnaroundHours, w.data.labUid], [350, 12, 'l1'], 'values'); await done(p); });
  await T('lab bookings: owner can move status and publish; staff with reports permission can too; staff without cannot publish', async () => {
    const p = await open('lab', 'lab-bookings.html'); ok(await p.locator('#list input[type=file]').count() >= 1, 'owner: no upload'); await done(p);
    const q = await open('staff', 'lab-bookings.html', { scn: { claims: { role: 'staff', labUid: 'l1', canBookings: true, canReports: false } } }); eq(await q.locator('#list input[type=file]').count(), 0, 'staff w/o reports sees upload'); ok(await q.locator('#list article').count() >= 1, 'staff sees bookings'); await done(q); });
  await T('lab bookings: status button calls updateDiagnosticStatus with next status', async () => {
    const p = await open('lab', 'lab-bookings.html'); const card = p.locator('#list article', { hasText: '5 Park Road' }); await card.locator('button.btn-primary').first().click(); await p.waitForTimeout(300); eq((await calls(p, 'updateDiagnosticStatus'))[0].data, { id: 'b3', status: 'collection_assigned' }, 'payload'); await done(p); });
  await T('book-test: home collection needs address; sends bookDiagnostic with testIds', async () => {
    const p = await open('patient', 'book-test.html?l=l1&t=cbc'); await pickSlot(p); await p.fill('#phone', '9811122233'); await first(p, '#confirm'); ok((await msg(p)).length > 3, 'no address error');
    await p.fill('#line', '12 Gandhi Street'); await p.fill('#apin', '313002'); await first(p, '#confirm'); const c = (await calls(p, 'bookDiagnostic'))[0]; ok(c, 'not called'); eq([c.data.labUid, c.data.testIds, c.data.type, c.data.address.pin], ['l1', ['cbc'], 'home', '313002'], 'payload'); ok(!('packageId' in c.data), 'packageId leaked'); await done(p); });
  await T('book-test: a package booking sends packageId and no testIds', async () => {
    const p = await open('patient', 'book-test.html?l=l1&p=full'); await pickSlot(p); await p.fill('#phone', '9811122233'); await p.fill('#line', '12 Gandhi Street'); await p.fill('#apin', '313002'); await first(p, '#confirm'); const c = (await calls(p, 'bookDiagnostic'))[0]; ok(c, 'not called'); eq(c.data.packageId, 'full', 'package'); ok(!('testIds' in c.data), 'testIds sent with package'); await done(p); });
  await T('my lab bookings: report button opens via getReportFile; paid shows nothing odd', async () => {
    const p = await open('patient', 'my-tests.html'); const btn = p.locator('#list button', { hasText: 'report.pdf' }); ok(await btn.count() === 1, 'report button'); await btn.click(); await p.waitForTimeout(400); eq((await calls(p, 'getReportFile'))[0].data, { bookingId: 'b2', path: 'lab_reports/l1/b2/x.pdf' }, 'payload'); await done(p); });

  await T('records: upload writes a private record under records/<uid>/; share calls shareRecord', async () => {
    const p = await open('patient', 'records.html', { dialogs: [undefined] }); await first(p, '#add'); await p.fill('#title', 'Thyroid report'); await p.setInputFiles('#file', { name: 'r.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4') }); await first(p, '#save');
    const w = await writes(p); const up = w.find(x => x.upload), rec = w.find(x => x.path && x.path.startsWith('medical_records/')); ok(up && up.upload.startsWith('records/p1/'), 'upload path'); ok(rec && rec.data.file.path === up.upload, 'record points at the upload'); eq(rec.data.status, 'active', 'status');
    await p.locator('#list article', { hasText: 'Blood test October' }).locator('summary', { hasText: /./ }).first().click(); await done(p); });
  await T('records: view button asks getRecordFile for that record', async () => {
    const p = await open('patient', 'records.html'); await p.locator('#list article').first().locator('button.btn-primary').click(); await p.waitForTimeout(400); eq((await calls(p, 'getRecordFile'))[0].data, { recordId: 'm1' }, 'payload'); await done(p); });
  await T('shared records (doctor): lists active share, view asks getRecordFile', async () => {
    const p = await open('doctor', 'shared-records.html'); eq(await p.locator('#list article').count(), 1, 'cards'); await p.locator('#list button').click(); await p.waitForTimeout(300); eq((await calls(p, 'getRecordFile'))[0].data, { recordId: 'm1' }, 'payload'); await done(p); });
  await T('support: ticket needs subject and message; saved as open with no replies', async () => {
    const p = await open('patient', 'support.html'); await first(p, '#send'); ok((await msg(p)).length > 3, 'no error'); await p.fill('#subject', 'Cannot see report'); await p.fill('#message', 'Please help me find it'); await first(p, '#send'); const w = (await writes(p)).find(x => x.path.startsWith('support_tickets/')); ok(w, 'not written'); eq([w.data.status, w.data.replies, w.data.ownerUid], ['open', [], 'p1'], 'ticket'); await done(p); });
  await T('privacy centre: saves email preference; export calls exportMyData; deletion asks for confirmation', async () => {
    const p = await open('patient', 'privacy-center.html', { dialogs: [undefined] }); await p.check('#email'); await first(p, '#savePrefs'); const w = (await writes(p)).find(x => x.path === 'notification_preferences/p1'); ok(w && w.data.email === true, 'email pref'); await first(p, '#export'); eq((await calls(p, 'exportMyData')).length, 1, 'export');
    await first(p, '#delete'); eq((await calls(p, 'requestAccountDeletion')).length, 1, 'deletion'); await done(p); });
  await T('review: stars required, submitReview payload correct', async () => {
    const p = await open('patient', 'review.html?k=doctor&id=ap3'); ok(await p.locator('#send').isDisabled(), 'send enabled before rating'); await p.locator('#stars .chip').nth(3).click(); await p.fill('#comment', 'Kind and clear'); await first(p, '#send'); eq((await calls(p, 'submitReview'))[0].data, { kind: 'doctor', refId: 'ap3', rating: 4, comment: 'Kind and clear' }, 'payload'); await done(p); });
  await T('assistant: consent first, then ask; emergency reply shows fixed guidance', async () => {
    const p = await open('patient', 'assistant.html'); ok(await p.locator('#consentBox').isVisible(), 'consent box'); ok(!(await p.locator('#askBox').isVisible()), 'ask box before consent'); await p.check('#agree'); await first(p, '#accept'); eq((await calls(p, 'setAiConsent'))[0].data, { accept: true }, 'consent payload'); await done(p);
    const q = await open('patient', 'assistant.html', { scn: { fn: { aiAvailable: { available: true, consent: true }, askAssistant: { emergency: true } } } }); await q.fill('#q', 'I have chest pain'); await first(q, '#send'); ok(await q.locator('#emergency').isVisible(), 'emergency not shown'); ok(!(await q.locator('#answer').isVisible()), 'answer shown with emergency'); ok((await txt(q, '#emergency')).includes('112'), '112 missing'); await done(q); });
  await T('assistant: when switched off it says so and hides the form', async () => {
    const p = await open('patient', 'assistant.html', { scn: { fn: { aiAvailable: { available: false, consent: false } } } }); ok(await p.locator('#off').isVisible(), 'no unavailable notice'); ok(!(await p.locator('#askBox').isVisible()) && !(await p.locator('#consentBox').isVisible()), 'form visible'); await done(p); });
  await T('notifications: unread click marks read; mark-all-read updates everything', async () => {
    const p = await open('patient', 'notifications.html'); await first(p, '#readAll'); await p.waitForTimeout(300); ok((await writes(p)).filter(x => x.path.startsWith('notifications/')).length >= 3, 'not marked read'); await done(p); });

  await T('admin: approve doctor sends reviewApplication approve; reject needs a reason', async () => {
    const p = await open('admin', 'admin.html', { dialogs: [undefined, 'Documents unclear', 'Documents unclear'] }); const card = p.locator('#list article').first(); await card.locator('button.btn-primary').click(); await p.waitForTimeout(300); const c = (await calls(p, 'reviewApplication'))[0]; eq([c.data.uid, c.data.decision], ['p9', 'approve'], 'approve');
    await card.locator('button.danger').click().catch(() => {}); await done(p); });
  await T('admin: lab approve passes accreditationVerified from the second confirm', async () => {
    const p = await open('admin', 'admin.html', { dialogs: [undefined, undefined] }); await p.locator('#labList article').first().locator('button.btn-primary').click(); await p.waitForTimeout(300); const c = (await calls(p, 'reviewLabApplication'))[0]; eq([c.data.uid, c.data.decision, c.data.accreditationVerified], ['p8', 'approve', true], 'payload'); await done(p); });
  await T('admin: hospital approve calls reviewHospitalApplication', async () => {
    const p = await open('admin', 'admin.html', { dialogs: [undefined] }); await p.locator('#hospList article').first().locator('button.btn-primary').click(); await p.waitForTimeout(300); eq((await calls(p, 'reviewHospitalApplication'))[0].data.uid, 'p7', 'uid'); await done(p); });
  await T('admin: service area needs a 6-digit PIN and writes service_areas/<pin>', async () => {
    const p = await open('admin', 'admin.html'); await p.fill('#pin', '12'); await first(p, '#addArea'); ok((await msg(p)).length > 3, 'no PIN error'); await p.fill('#pin', '313001'); await first(p, '#addArea'); ok((await writes(p)).some(w => w.path === 'service_areas/313001'), 'not written'); await done(p); });
  await T('admin growth: coupon validated (percent <= 100), banner link must be internal or https', async () => {
    const p = await open('admin', 'admin-growth.html'); await p.fill('#c_code', 'save20'); await p.fill('#c_value', '150'); await first(p, '#addCoupon'); ok((await msg(p)).length > 3, 'no coupon error'); await p.fill('#c_value', '20'); await first(p, '#addCoupon'); const w = (await writes(p)).find(x => x.path === 'coupons/SAVE20'); ok(w && w.data.value === 20 && w.data.used === 0, 'coupon doc');
    await p.fill('#b_en', 'Hello'); await p.fill('#b_link', 'javascript:alert(1)'); await first(p, '#addBanner'); ok(!(await writes(p)).some(x => x.path.startsWith('banners/') && x.data && x.data.link && x.data.link.startsWith('javascript')), 'javascript: link accepted'); await done(p); });
  await T('admin growth: featured toggle and subscription call the right functions', async () => {
    const p = await open('admin', 'admin-growth.html'); await p.locator('#featList button').first().click(); await p.waitForTimeout(300); eq((await calls(p, 'setFeatured')).length, 1, 'featured'); await p.fill('#s_plan', 'Gold'); await p.fill('#s_amount', '1000'); await p.fill('#s_exp', '2027-12-31'); await first(p, '#setSub'); eq((await calls(p, 'setSubscription'))[0].data.plan, 'Gold', 'sub'); await done(p); });
  await T('admin payments: shows not-connected state, saves settings, refund needs a reason', async () => {
    const p = await open('admin', 'admin-payments.html', { dialogs: ['Duplicate payment', undefined] }); ok((await txt(p, '#state')).length > 10, 'state'); await p.fill('#pct', '99'); await first(p, '#save'); ok((await msg(p)).length > 3, 'no bad-settings error'); await p.fill('#pct', '5'); await first(p, '#save'); ok((await writes(p)).some(w => w.path === 'settings/platform'), 'not saved');
    await p.locator('#list button.danger').first().click(); await p.waitForTimeout(300); eq((await calls(p, 'adminRefund'))[0].data.orderId, 'ord1', 'refund'); await done(p); });
  await T('admin users: suspend calls setUserStatus; admins have no suspend button', async () => {
    const p = await open('admin', 'admin-users.html', { dialogs: [undefined] }); const card = p.locator('#list article', { hasText: 'Other Patient' }); await card.locator('button').click(); await p.waitForTimeout(300); eq((await calls(p, 'setUserStatus'))[0].data, { uid: 'p2', status: 'suspended' }, 'payload'); eq(await p.locator('#list article', { hasText: 'Admin' }).locator('button').count(), 0, 'admin has button'); await done(p); });
  await T('admin data requests: complete needs a note', async () => {
    const p = await open('admin', 'admin-requests.html', { dialogs: ['Data removed, bills kept for tax'] }); await p.locator('#list button.btn-primary').click(); await p.waitForTimeout(300); const c = (await calls(p, 'updateDeletionRequest'))[0]; eq([c.data.uid, c.data.status], ['p2', 'completed'], 'payload'); await done(p); });
  await T('admin integrations & readiness render statuses', async () => {
    const p = await open('admin', 'admin-integrations.html'); eq(await p.locator('#cards article').count(), 3, 'cards'); await done(p); const q = await open('admin', 'admin-readiness.html'); ok((await q.locator('#checks .row').count()) >= 10, 'checks'); await done(q); });
  await T('wrong role is bounced to the dashboard (patient on admin page, doctor on lab page)', async () => {
    const p = await open('patient', 'admin-users.html'); ok(p.url().endsWith('/dashboard.html'), 'patient not redirected: ' + p.url()); await p.__ctx.close(); const q = await open('doctor', 'lab-pricing.html'); ok(q.url().endsWith('/dashboard.html'), 'doctor not redirected'); await q.__ctx.close(); });
  await T('lab staff add: sends only email and permissions', async () => {
    const p = await open('lab', 'lab-staff.html'); await p.fill('#email', 'new.staff@example.com'); await p.check('#canReports'); await first(p, '#add'); eq((await calls(p, 'addLabStaff'))[0].data, { email: 'new.staff@example.com', canBookings: true, canReports: true }, 'payload'); await done(p); });
  await T('hospital: invite sends registration number', async () => {
    const p = await open('hospital', 'hospital-portal.html'); await p.fill('#reg', 'RJ12345'); await first(p, '#invite'); eq((await calls(p, 'inviteDoctor'))[0].data, { regNumber: 'RJ12345' }, 'payload'); await done(p); });
  await T('doctor affiliation: accept sends respondAffiliation accept:true', async () => {
    const p = await open('doctor', 'doctor-affiliations.html'); await p.locator('#list article', { hasText: 'Other Clinic' }).locator('button.btn-primary').click(); await p.waitForTimeout(300); eq((await calls(p, 'respondAffiliation'))[0].data, { id: 'h2_d1', accept: true }, 'payload'); await done(p); });
  await T('hindi: booking page and doctor list show Hindi text, not English keys', async () => {
    const p = await open('patient', 'doctors.html', { lang: 'hi' }); ok(/[\u0900-\u097F]/.test(await txt(p, 'h1')), 'h1 not Hindi'); await done(p); });

  await browser.close(); server.close();
  const fails = results.filter(r => r[1] === 'FAIL'); results.forEach(r => console.log(`${r[1]}  ${r[0]}${r[2] ? '\n        -> ' + r[2] : ''}`)); console.log(`\n${results.length - fails.length}/${results.length} passed`); process.exitCode = fails.length ? 1 : 0;
})();
