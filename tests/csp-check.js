// Loads every page with the policy ENFORCED (stricter than report-only) to find anything of ours it would block.
const { chromium } = require('playwright');
const fs = require('fs'); process.env.CSP = JSON.parse(fs.readFileSync(__dirname + '/../firebase.json', 'utf8')).hosting.headers[0].headers.find(h => h.key === 'Content-Security-Policy-Report-Only').value;
const serve = require('./server.js'), { scenario, PUBLIC, PAGES } = require('./scenarios.js'), MOCK = fs.readFileSync(__dirname + '/mock-all.js', 'utf8');
(async () => {
  const s = await serve(require('path').resolve(__dirname, '..'), __dirname, 8781), b = await chromium.launch(), seen = {}; const tasks = [];
  PUBLIC.forEach(p => tasks.push(['none', p])); for (const [r, ps] of Object.entries(PAGES)) ps.forEach(p => tasks.push([r, p]));
  for (const [role, page] of tasks) { const ctx = await b.newContext(); await ctx.addInitScript(({ sc }) => { window.__SCENARIO = sc; window.__v = []; document.addEventListener('securitypolicyviolation', e => window.__v.push(`${e.violatedDirective} blocked ${e.blockedURI || e.sample}`)); localStorage.setItem('ao_lang', 'en'); }, { sc: scenario(role) });
    await ctx.route('https://www.gstatic.com/firebasejs/**', r => r.fulfill({ contentType: 'application/javascript', body: MOCK })); await ctx.route(/fonts\.googleapis|fonts\.gstatic|razorpay/, r => r.fulfill({ contentType: 'text/css', body: '' }));
    const p = await ctx.newPage(); await p.goto('http://localhost:8781/' + page, { waitUntil: 'networkidle' }).catch(() => {}); await p.waitForTimeout(250);
    for (const v of await p.evaluate(() => window.__v || [])) (seen[v] ||= new Set()).add(page.split('?')[0]); await ctx.close(); }
  await b.close(); s.close(); const e = Object.entries(seen); process.exitCode = e.length ? 1 : 0; console.log(e.length ? e.map(([v, pg]) => `${v}  [${[...pg].slice(0, 3).join(', ')}${pg.size > 3 ? ' +' + (pg.size - 3) : ''}]`).join('\n') : 'No violations from our own pages (89 pages)');
})();
