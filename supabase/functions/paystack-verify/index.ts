// Checks a Paystack payment with Paystack itself when the customer returns to the site,
// and marks the booking paid if the amount matches. The webhook does the same in the background.
// Secret: PAYSTACK_SECRET_KEY.
import { cors, json, serviceClient, callerUser, recordPayment } from '../_shared/common.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);
  try {
    const admin = serviceClient();
    const user = await callerUser(req, admin);
    if (!user) return json({ error: 'Sign in first' }, 401);
    const secret = Deno.env.get('PAYSTACK_SECRET_KEY');
    if (!secret) return json({ error: 'Payments are not set up yet.' }, 503);

    const { reference } = await req.json().catch(() => ({}));
    if (!reference || !/^FX-[0-9a-f]{8}-[0-9a-z]+$/.test(reference)) return json({ error: 'Invalid payment reference' }, 400);

    const r = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${secret}` },
    });
    const out = await r.json().catch(() => ({}));
    if (!r.ok || !out?.status) return json({ error: `Paystack could not find this payment: ${out?.message || r.status}` }, 502);

    const tx = out.data;
    if (tx.status !== 'success') return json({ result: tx.status === 'abandoned' ? 'abandoned' : 'not_successful', paystack_status: tx.status });
    const res = await recordPayment(admin, tx, user.id);
    return json(res);
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
