// Accessibility, touch-target and SEO audit across every page, on a 390px phone.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), serve = require('./server.js'), { scenario, PUBLIC, PAGES } = require('./scenarios.js');
const ROOT = process.argv[2] || require('path').resolve(__dirname, '..'), PORT = 8761, MOCK = fs.readFileSync(__dirname + '/mock-all.js', 'utf8');
const publicFiles = new Set(PUBLIC.map(p => p.split('?')[0]));
const auditPage = () => {
  const out = { small: [], unlabeled: [], noName: [], noAlt: [], h1: document.querySelectorAll('h1').length, lang: document.documentElement.lang };
  const vis = (el) => { for (let e = el; e; e = e.parentElement) { if (e.hidden) return false; const c = getComputedStyle(e); if (c.display === 'none' || c.visibility === 'hidden') return false; } return true; };
  const name = (el) => (el.getAttribute('aria-label') || el.getAttribute('title') || el.textContent || el.value || (el.querySelector('img') && el.querySelector('img').alt) || '').trim();
  const desc = (el) => `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${el.className && typeof el.className === 'string' ? '.' + el.className.split(' ')[0] : ''}`;
  for (const el of document.querySelectorAll('a[href], button, select, input:not([type=hidden]), textarea, summary')) {
    if (!vis(el)) continue; const r = el.getBoundingClientRect(); if (!r.width) continue;
    const isCheck = el.type === 'checkbox' || el.type === 'radio'; const target = isCheck && el.closest('label') ? el.closest('label').getBoundingClientRect() : r;
    const inText = el.tagName === 'A' && el.closest('p, li') && !el.classList.contains('btn'); // plain links inside a sentence are exempt
    if (!inText && target.height < 43.5) out.small.push(`${desc(el)} ${Math.round(target.width)}x${Math.round(target.height)}`);
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName) && !(el.type === 'submit' || el.type === 'button')) { const lab = el.id && document.querySelector(`label[for="${el.id}"]`), wrap = el.closest('label'); if (!lab && !wrap && !el.getAttribute('aria-label')) out.unlabeled.push(desc(el) + (el.placeholder ? ' (placeholder only)' : '')); }
    if (['A', 'BUTTON', 'SUMMARY'].includes(el.tagName) && !name(el)) out.noName.push(desc(el));
  }
  for (const img of document.querySelectorAll('img')) if (img.getAttribute('alt') === null) out.noAlt.push(img.getAttribute('src'));
  return out;
};
(async () => {
  const server = await serve(ROOT, __dirname, PORT), browser = await chromium.launch(); const tasks = [];
  PUBLIC.forEach(p => tasks.push(['none', p])); for (const [r, ps] of Object.entries(PAGES)) ps.forEach(p => tasks.push([r, p]));
  const report = {}, seo = []; let i = 0;
  // SEO: static checks on the files themselves
  for (const f of fs.readdirSync(ROOT).filter(x => x.endsWith('.html'))) { const s = fs.readFileSync(path.join(ROOT, f), 'utf8'), pub = publicFiles.has(f) || f === '404.html';
    const noindex = /name="robots" content="noindex/.test(s); if (!pub && !noindex) seo.push(`${f}: private page is missing noindex`); if (pub && noindex && f !== 'auth.html') seo.push(`${f}: public page is marked noindex`);
    if (!/<title>[^<]{3,}<\/title>/.test(s)) seo.push(`${f}: missing title`); if (publicFiles.has(f) && f !== 'auth.html' && !/name="description"/.test(s)) seo.push(`${f}: public page without meta description`); if (!/<html lang=/.test(s)) seo.push(`${f}: no lang attribute`); if (!/name="viewport"/.test(s) && f !== '404.html') seo.push(`${f}: no viewport`); }
  async function worker() { while (i < tasks.length) { const [role, page] = tasks[i++], ctx = await browser.newContext({ viewport: { width: 390, height: 800 } });
    await ctx.addInitScript(({ sc }) => { window.__SCENARIO = sc; localStorage.setItem('ao_lang', 'en'); }, { sc: scenario(role) });
    await ctx.route('https://www.gstatic.com/firebasejs/**', r => r.fulfill({ contentType: 'application/javascript', body: MOCK })); await ctx.route(/fonts\.|razorpay/, r => r.fulfill({ body: '' }));
    const p = await ctx.newPage(); try { await p.goto(`http://localhost:${PORT}/${page}`, { waitUntil: 'networkidle', timeout: 15000 }); await p.waitForFunction(() => { const a = document.getElementById('app'); return !a || !a.hidden; }, null, { timeout: 4000 }).catch(() => {}); await p.waitForTimeout(250);
      const a = await p.evaluate(auditPage); (report[page.split('?')[0]] ||= []).push({ role, ...a }); } catch (e) {} await ctx.close(); } }
  await Promise.all(Array.from({ length: 5 }, worker)); await browser.close(); server.close();
  const agg = { small: {}, unlabeled: {}, noName: {}, noAlt: {}, h1: [] , lang: []};
  for (const [pg, rs] of Object.entries(report)) for (const r of rs) { for (const k of ['small', 'unlabeled', 'noName', 'noAlt']) for (const x of r[k]) ((agg[k][x.replace(/ \d+x\d+$/, '')] ||= new Set()).add(pg)); if (r.h1 !== 1) agg.h1.push(`${pg} (${r.role}) h1 count ${r.h1}`); if (!r.lang) agg.lang.push(pg); }
  console.log('SEO / structure:', seo.length ? '\n  ' + seo.join('\n  ') : 'ok');
  for (const k of ['small', 'unlabeled', 'noName', 'noAlt']) { const e = Object.entries(agg[k]); console.log(`\n${k}: ${e.length} distinct`); e.sort((a, b) => b[1].size - a[1].size).slice(0, 25).forEach(([x, pgs]) => console.log(`  ${x}  [${[...pgs].slice(0, 4).join(', ')}${pgs.size > 4 ? ' +' + (pgs.size - 4) : ''}]`)); }
  process.exitCode = (seo.length || ['small', 'unlabeled', 'noName', 'noAlt'].some(k => Object.keys(agg[k]).length) || agg.h1.length || agg.lang.length) ? 1 : 0;
  console.log('\nh1 problems:', [...new Set(agg.h1)].slice(0, 20).join('; ') || 'none'); console.log('missing lang:', agg.lang.length ? [...new Set(agg.lang)].join(', ') : 'none');
})();
