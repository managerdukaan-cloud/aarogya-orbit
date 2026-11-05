// Online payment from the browser. The browser never decides the amount or marks anything paid:
// it opens the provider's checkout for an order our server created, then asks the server to verify the result.
import { functions } from './firebase-init.js';
import { t } from './i18n.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-functions.js';
const call = (n, d) => httpsCallable(functions, n)(d).then(r => r.data);
export const payEnabled = () => call('paymentConfig').then(r => r.enabled === true).catch(() => false);
const loadScript = (src) => new Promise((ok, no) => { if (window.Razorpay) return ok(); const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = no; document.head.append(s); });
export async function payOnline(kind, id, description) {
  const couponCode = (prompt(t('pay.couponAsk')) || '').trim(); // optional; the server checks it and works out the discount
  const o = await call('createPaymentOrder', { kind, id, couponCode });
  await loadScript('https://checkout.razorpay.com/v1/checkout.js');
  return new Promise((resolve, reject) => {
    const r = new window.Razorpay({
      key: o.keyId, amount: o.amountPaise, currency: 'INR', order_id: o.orderId, name: 'AAROGYA ORBIT', description: (description || '').slice(0, 100),
      handler: async (resp) => { try { await call('verifyPayment', { orderId: resp.razorpay_order_id, paymentId: resp.razorpay_payment_id, signature: resp.razorpay_signature }); resolve(); } catch (e) { reject(e); } },
      modal: { ondismiss: () => reject(new Error('dismissed')) }
    });
    r.on('payment.failed', () => reject(new Error('failed')));
    r.open();
  });
}
