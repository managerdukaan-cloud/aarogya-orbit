// Fast completeness check: is every file the pages need actually in the repository, and are the translation files in step?
// If the repository is a mix of old and new files, this names the culprits instead of leaving a pile of confusing failures.
const fs = require('fs'), path = require('path'), ROOT = path.resolve(__dirname, '..');
const problems = [], has = (p) => fs.existsSync(path.join(ROOT, p));
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');
for (const f of ['index.html', 'firebase.json', 'firestore.rules', 'storage.rules', 'functions/index.js', 'functions/package.json', 'js/firebase.js', 'js/firebase-init.js', 'js/i18n.js', 'js/guard.js', 'js/auth.js', 'js/util.js', 'js/app.js', 'css/base.css', 'css/app.css', 'css/auth.css', 'css/variables.css', 'locales/en.json', 'locales/hi.json', 'assets/logo/logo-light.svg']) if (!has(f)) problems.push(`Missing file: ${f}`);
if (has('js/firebase.js') && !/export\s+const\s+firebaseConfig/.test(read('js/firebase.js'))) problems.push('js/firebase.js must contain: export const firebaseConfig = { ... }');
const pages = fs.readdirSync(ROOT).filter(f => f.endsWith('.html'));
for (const f of pages) for (const m of read(f).matchAll(/(?:src|href)="\/((?:js|css|assets|locales)\/[^"#?]+)/g)) if (!has(m[1])) problems.push(`${f} needs ${m[1]}, which is not in the repository`);
const jsFiles = has('js') ? fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js')) : [];
for (const f of jsFiles) for (const m of read('js/' + f).matchAll(/from '\.\/([a-z0-9-]+\.js)'/g)) if (!has('js/' + m[1])) problems.push(`js/${f} imports ./${m[1]}, which is not in the repository`);
let en = {}, hi = {};
try { en = JSON.parse(read('locales/en.json')); hi = JSON.parse(read('locales/hi.json')); } catch (e) { problems.push('A locales file is not valid JSON: ' + e.message); }
const onlyEn = Object.keys(en).filter(k => !(k in hi)), onlyHi = Object.keys(hi).filter(k => !(k in en));
if (onlyEn.length) problems.push(`locales/hi.json lacks ${onlyEn.length} keys that en.json has (is hi.json an older version?) e.g. ${onlyEn.slice(0, 4).join(', ')}`);
if (onlyHi.length) problems.push(`locales/en.json lacks ${onlyHi.length} keys that hi.json has (is en.json an older version?) e.g. ${onlyHi.slice(0, 4).join(', ')}`);
const used = new Set(); const NS = '(?:nav|dash|adm|cat|tt|cmp|dbk|lab|mt|dst|lb\\.to|rx|bk|ap|st|err|doc|sch|dr|dap|act|day|role|prof|fam|auth|svc|opt|gender|rel|nt|ad|sp|hp|ha|hs|da|rec|rc|ra|lg|home|hero|sec|notice|pay|rv|rs|pk|gr|rq|pc|fu|ft|ai|ig|rd)';
for (const f of pages) for (const m of read(f).matchAll(/data-i18n(?:-ph|-aria)?="([^"]+)"/g)) if (m[1]) used.add(m[1] + '|' + f);
for (const f of jsFiles) for (const m of read('js/' + f).matchAll(new RegExp(`\\bt\\('(${NS}\\.[a-zA-Z0-9_.]+)'\\)`, 'g'))) used.add(m[1] + '|js/' + f);
const missing = {}; for (const u of used) { const [k, where] = u.split('|'); if (!(k in en) || !(k in hi)) (missing[k] ||= []).push(where); }
for (const [k, w] of Object.entries(missing).slice(0, 15)) problems.push(`Translation key "${k}" is used in ${w[0]} but missing from the locales files`);
if (Object.keys(missing).length > 15) problems.push(`...and ${Object.keys(missing).length - 15} more missing translation keys`);
// Does each file match the latest release? (catches an older file that has the same name)
if (has('tests/manifest.json')) {
  const crypto = require('crypto'), want = JSON.parse(read('tests/manifest.json')).files, stale = [], gone = [];
  for (const [f, h] of Object.entries(want)) { if (!has(f)) { gone.push(f); continue; } const got = crypto.createHash('sha256').update(read(f).replace(/\r\n/g, '\n')).digest('hex').slice(0, 16); if (got !== h) stale.push(f); }
  if (gone.length) problems.unshift(`${gone.length} file(s) from the latest release are missing: ${gone.slice(0, 25).join(', ')}${gone.length > 25 ? ' ...' : ''}`);
  if (stale.length) problems.unshift(`${stale.length} file(s) differ from the latest release (an older or edited version): ${stale.slice(0, 40).join(', ')}${stale.length > 40 ? ' ...' : ''}`);
}
if (problems.length) { console.log('The repository is incomplete or out of date:\n  - ' + problems.join('\n  - ') + '\n\nCopy the latest files from the folder you deploy from into the repository, then commit and push again. (If you changed files on purpose, run `npm run manifest` in the tests folder and commit tests/manifest.json.)'); process.exitCode = 1; }
else console.log(`Repository looks complete: ${pages.length} pages, ${jsFiles.length} scripts, ${Object.keys(en).length} translation keys in both languages.`);
