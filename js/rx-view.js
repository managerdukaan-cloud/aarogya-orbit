import { t, getLang } from './i18n.js';
const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
// Everything is inserted with textContent, so nothing a doctor types can run as code.
export function renderRx(rx, withPrint = true) {
  const box = el('article', 'card rx');
  const when = rx.issuedAt?.toDate ? rx.issuedAt.toDate().toLocaleDateString(getLang() === 'hi' ? 'hi-IN' : 'en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'long', year: 'numeric' }) : '';
  const head = el('div', 'rxhead');
  const l = el('div'); l.append(el('h2', '', rx.doctorName), el('p', '', `${t('rx.regLine').replace('{reg}', rx.regNumber).replace('{council}', rx.council)}`), el('p', '', rx.clinicName || ''));
  const r = el('div'); r.append(el('p', '', `${t('rx.date')}: ${when}`), el('p', '', `${t('rx.patient')}: ${rx.memberName}`));
  head.append(l, r); box.append(head);
  const wrap = el('div', 'scroll'), tb = el('table'), th = el('tr');
  ['rx.medicine', 'rx.dose', 'rx.freq', 'rx.dur', 'rx.notes'].forEach(k => th.append(el('th', '', t(k).replace(' (optional)', ''))));
  tb.append(th);
  for (const m of rx.medicines || []) { const tr = el('tr'); [m.name, m.dose, m.frequency, m.duration, m.notes].forEach(v => tr.append(el('td', '', v || ''))); tb.append(tr); }
  wrap.append(tb); box.append(wrap);
  if (rx.advice) { box.append(el('h3', '', t('rx.advice')), el('p', '', rx.advice)); box.lastChild.style.whiteSpace = 'pre-wrap'; }
  if (rx.followUpDate) box.append(el('p', '', `${t('rx.followUp').replace(' (optional)', '')}: ${rx.followUpDate}`));
  box.append(el('p', 'foot', t('rx.footer').replace('{doctor}', rx.doctorName).replace('{reg}', rx.regNumber).replace('{council}', rx.council)));
  if (withPrint) {
    const b = el('button', 'btn btn-ghost no-print', t('rx.print')); b.type = 'button';
    b.onclick = () => { box.classList.add('printing'); document.body.classList.add('print-one'); window.print(); };
    window.addEventListener('afterprint', () => { box.classList.remove('printing'); document.body.classList.remove('print-one'); });
    box.append(b);
  }
  return box;
}
