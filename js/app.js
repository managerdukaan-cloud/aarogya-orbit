import { initLang, setLang } from './i18n.js';
document.querySelectorAll('.lang button').forEach(b => b.addEventListener('click', () => setLang(b.dataset.lang)));
await initLang(); // splash stays until translations have loaded
setTimeout(() => document.getElementById('splash').classList.add('hide'), 1200);
// Phase 3: import './firebase.js' and './auth.js'
