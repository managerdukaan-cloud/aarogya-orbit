// Central translation system. Usage: <span data-i18n="key"></span> or t('key')
const KEY = 'ao_lang';
let dict = {}, lang = 'en';
export const t = (k) => dict[k] ?? k;
export const getLang = () => lang;
export async function setLang(l) {
  lang = l === 'hi' ? 'hi' : 'en';
  try { localStorage.setItem(KEY, lang); } catch {}
  const res = await fetch(`/locales/${lang}.json`);
  dict = await res.json();
  document.documentElement.lang = lang;
  document.querySelectorAll('[data-i18n]').forEach(e => e.textContent = t(e.dataset.i18n));
  document.querySelectorAll('[data-i18n-ph]').forEach(e => e.placeholder = t(e.dataset.i18nPh));
  document.querySelectorAll('.lang button').forEach(b => b.setAttribute('aria-pressed', b.dataset.lang === lang));
}
export function initLang() {
  let saved = 'en';
  try { saved = localStorage.getItem(KEY) || 'en'; } catch {}
  return setLang(saved);
}
