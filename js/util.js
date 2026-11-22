// Small helpers shared by the lab and test pages. All dates and times are Indian Standard Time.
export const $ = (id) => document.getElementById(id);
export const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
export const DAYKEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
export const pad = (n) => String(n).padStart(2, '0');
export const toMins = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
export function ist() {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, mins: +p.hour * 60 + +p.minute };
}
export const dayKey = (d) => DAYKEYS[new Date(d + 'T00:00:00Z').getUTCDay()];
export const addDays = (d, n) => new Date(new Date(d + 'T00:00:00Z').getTime() + n * 864e5).toISOString().slice(0, 10);
export function slotsFor(sch, date) {
  const out = [];
  for (const r of sch.weekly?.[dayKey(date)] || []) for (let m = toMins(r.start); m + sch.slotMinutes <= toMins(r.end); m += sch.slotMinutes) out.push(`${pad(Math.floor(m / 60))}:${pad(m % 60)}`);
  return out;
}
export const nameOf = (o, lang) => (lang === 'hi' && o.name_hi ? o.name_hi : o.name_en);
export const chip = (label, pressed, onClick, disabled = false) => {
  const b = el('button', 'chip', label); b.type = 'button'; b.setAttribute('aria-pressed', pressed); b.disabled = disabled; b.onclick = onClick; return b;
};
export const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
