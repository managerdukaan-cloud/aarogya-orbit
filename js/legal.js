import { initLang, setLang } from './i18n.js';
document.querySelectorAll('.lang button').forEach(b => b.addEventListener('click', () => setLang(b.dataset.lang)));
await initLang();
