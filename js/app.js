import { initLang, setLang, getLang } from './i18n.js';
document.querySelectorAll('.lang button').forEach(b => b.addEventListener('click', async () => { await setLang(b.dataset.lang); drawBanners(); }));
await initLang(); // splash stays until translations have loaded
setTimeout(() => document.getElementById('splash').classList.add('hide'), 1200);

// Admin-managed announcement banners (only active ones). A failure here never blocks the page.
let banners = [];
function drawBanners() {
  const box = document.getElementById('banners'); if (!box) return; box.replaceChildren();
  for (const b of banners) {
    const text = (getLang() === 'hi' && b.text_hi) || b.text_en, p = document.createElement('p'); p.className = 'notice'; p.style.margin = '8px 0';
    if (b.link) { const a = document.createElement('a'); a.href = b.link; a.textContent = text; a.style.color = 'inherit'; a.style.fontWeight = '600'; p.append(a); } else p.textContent = text;
    box.append(p);
  }
}
try {
  const { db } = await import('./firebase-init.js');
  const { collection, getDocs, query, where } = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js');
  banners = (await getDocs(query(collection(db, 'banners'), where('active', '==', true)))).docs.map(d => d.data()).filter(b => !b.link || /^(\/|https:\/\/)/.test(b.link));
  drawBanners();
} catch { /* ignore */ }
