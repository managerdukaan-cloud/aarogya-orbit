const { chromium } = require('playwright');
const fs = require('fs'), serve = require('./server.js'), { scenario, PUBLIC, PAGES } = require('./scenarios.js');
const ROOT = process.argv[2] || require('path').resolve(__dirname, '..'), PORT = 8731, MOCK = fs.readFileSync(__dirname + '/mock-all.js', 'utf8');
const ONLY = process.env.ONLY ? new RegExp(process.env.ONLY) : null;
const WIDTHS = (process.env.WIDTHS || '320,1280').split(',').map(Number), LANGS = (process.env.LANGS || 'en,hi').split(',');
const checkPage = () => {
  const bad = [], vis = (el) => { for (let e = el; e; e = e.parentElement) { if (e.hidden) return false; const c = getComputedStyle(e); if (c.display === 'none' || c.visibility === 'hidden') return false; } return true; };
  const RAW = /^[a-z]{1,6}\.[A-Za-z0-9_.]+$/, PH = /\{[a-zA-Z]+\}|\bundefined\b|\bNaN\b|\[object/;
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n;
  while ((n = w.nextNode())) { const el = n.parentElement; if (!el || ['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(el.tagName) || !vis(el)) continue; const t = n.textContent.trim(); if (t && (RAW.test(t) || PH.test(t))) bad.push('text: ' + t.slice(0, 70)); }
  for (const el of document.querySelectorAll('[placeholder],[aria-label]')) { if (!vis(el)) continue; for (const a of ['placeholder', 'aria-label']) { const v = el.getAttribute(a); if (v && (RAW.test(v) || PH.test(v))) bad.push(a + ': ' + v.slice(0, 70)); } }
  const scrolls = (e) => { for (let a = e.parentElement; a; a = a.parentElement) { const o = getComputedStyle(a).overflowX; if (o === 'auto' || o === 'scroll') return true; } return false; };
  const over = document.documentElement.scrollWidth > window.innerWidth + 1 ? [...document.querySelectorAll('body *')].filter(e => vis(e) && !scrolls(e) && e.getBoundingClientRect().right > window.innerWidth + 1).slice(0, 3).map(e => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + '.' + String(e.className).split(' ')[0]) : [];
  return { bad: [...new Set(bad)], over };
};
(async () => {
  const server = await serve(ROOT, __dirname, PORT), browser = await chromium.launch({ headless: true });
  const tasks = [];
  const add = (role, page) => { if (!ONLY || ONLY.test(page + '|' + role)) for (const lang of LANGS) for (const width of WIDTHS) tasks.push({ role, page, lang, width }); };
  PUBLIC.forEach(p => add('none', p)); for (const [r, ps] of Object.entries(PAGES)) ps.forEach(p => add(r, p));
  const results = []; let i = 0;
  async function worker() {
    while (i < tasks.length) {
      const t = tasks[i++], ctx = await browser.newContext({ viewport: { width: t.width, height: 800 } });
      await ctx.addInitScript(({ sc, lang }) => { window.__SCENARIO = sc; try { localStorage.setItem('ao_lang', lang); } catch {} }, { sc: scenario(t.role, !!process.env.EMPTY), lang: t.lang });
      await ctx.route('https://www.gstatic.com/firebasejs/**', r => r.fulfill({ contentType: 'application/javascript', body: MOCK }));
      await ctx.route(/fonts\.(googleapis|gstatic)\.com|checkout\.razorpay\.com/, r => r.fulfill({ contentType: 'text/css', body: '' }));
      const page = await ctx.newPage(), errs = [], failed = [];
      page.on('pageerror', e => errs.push('JS error: ' + e.message.split('\n')[0]));
      page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push('console: ' + m.text().slice(0, 140)); });
      page.on('response', r => { if (r.status() >= 400 && r.url().startsWith('http://localhost') && !/favicon\.ico/.test(r.url())) failed.push(r.status() + ' ' + r.url().replace('http://localhost:' + PORT, '')); });
      let finalUrl = '', res = { bad: [], over: [] };
      try {
        await page.goto(`http://localhost:${PORT}/${t.page}`, { waitUntil: 'networkidle', timeout: 15000 });
        await page.waitForFunction(() => { const a = document.getElementById('app'); return !a || !a.hidden; }, null, { timeout: 4000 }).catch(() => {});
        await page.waitForTimeout(250); finalUrl = page.url().replace('http://localhost:' + PORT, '').replace(/^\//, '');
        res = await page.evaluate(checkPage);
      } catch (e) { errs.push('load: ' + e.message.split('\n')[0]); }
      const base = t.page.split('?')[0], redirected = finalUrl && finalUrl.split('?')[0] !== base && finalUrl !== '';
      results.push({ ...t, redirected: redirected ? finalUrl : '', errs, failed, ...res }); await ctx.close();
    }
  }
  await Promise.all(Array.from({ length: 5 }, worker)); await browser.close(); server.close();
  fs.writeFileSync(__dirname + '/results.json', JSON.stringify(results, null, 1));
  const group = {}; for (const r of results) { const issues = [...r.errs, ...r.failed.map(f => 'asset ' + f), ...r.bad, ...(r.over.length ? ['overflow@' + r.width + ': ' + r.over.join(',')] : []), ...(r.redirected && r.role !== 'none' && !process.env.EMPTY ? ['redirected to ' + r.redirected] : [])]; if (!issues.length) continue; const k = `${r.role}:${r.page}`; (group[k] ||= new Set()); issues.forEach(x => group[k].add(`[${r.lang}/${r.width}] ${x}`)); }
  const keys = Object.keys(group); process.exitCode = keys.length ? 1 : 0; console.log(`${results.length} page loads, ${keys.length} pages with issues`);
  for (const k of keys) { console.log('\n' + k); [...group[k]].slice(0, 8).forEach(x => console.log('   ' + x)); if (group[k].size > 8) console.log('   ... +' + (group[k].size - 8) + ' more'); }
})();
