// Runs every check and exits with a non-zero code if any of them fails (so GitHub shows a red cross).
const { spawnSync } = require('child_process');
const steps = [
  ['Server logic (booking, payments, permissions, reports...)', 'server-tests.js', {}],
  ['Every page, English + Hindi, phone + desktop', 'run.js', {}],
  ['Every page with an empty database', 'run.js', { EMPTY: '1', WIDTHS: '390' }],
  ['Buttons and forms (what they send to the server)', 'flows.js', {}],
  ['Accessibility, touch targets, SEO', 'audit.js', {}],
  ['Content-Security-Policy against our own pages', 'csp-check.js', {}]];
const results = [];
for (const [name, file, env] of steps) {
  console.log(`\n=== ${name} ===`);
  const r = spawnSync(process.execPath, [file], { cwd: __dirname, env: { ...process.env, ...env }, encoding: 'utf8', maxBuffer: 1 << 26 });
  const out = (r.stdout || '') + (r.stderr || ''), lines = out.trim().split('\n');
  console.log(r.status === 0 ? lines.slice(-3).join('\n') : out.length > 6000 ? out.slice(-6000) : out);
  results.push([name, r.status === 0]);
}
console.log('\n=== Summary ===');
results.forEach(([n, ok]) => console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}`));
process.exitCode = results.every(r => r[1]) ? 0 : 1;
