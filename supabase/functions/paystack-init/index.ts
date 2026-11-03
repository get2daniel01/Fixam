// Starts a Paystack payment for a quoted booking and returns the Paystack checkout link.
// Called by the customer page. Only the booking's own customer can pay.
// Secrets: PAYSTACK_SECRET_KEY (sk_test_... while testing), SITE_URL.
import { cors, json, serviceClient, callerUser, siteUrl } from '../_shared/common.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);
  try {
    const admin = serviceClient();
    const user = await callerUser(req, admin);
    if (!user) return json({ error: 'Sign in first' }, 401);

    const secret = Deno.env.get('PAYSTACK_SECRET_KEY');
    if (!secret) return json({ error: 'Payments are not set up yet. Fixam needs to add its Paystack key.' }, 503);

    const { booking_id } = await req.json().catch(() => ({}));
    if (!booking_id) return json({ error: 'booking_id is required' }, 400);
    const { data: b } = await admin.from('bookings')
      .select('id, customer_id, status, quote_amount').eq('id', booking_id).maybeSingle();
    if (!b || b.customer_id !== user.id) return json({ error: 'Booking not found' }, 404);
    if (b.status !== 'quoted' || !b.quote_amount) return json({ error: 'This booking is not waiting for payment.' }, 409);

    const site = siteUrl(req);
    if (!site) return json({ error: 'SITE_URL is not set, so Paystack cannot send the customer back. Add it under Edge Functions > Secrets.' }, 503);

    const reference = `FX-${b.id.slice(0, 8)}-${Date.now().toString(36)}`;
    const r = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: user.email,
        amount: b.quote_amount * 100, // Paystack uses kobo
        currency: 'NGN',
        reference,
        callback_url: `${site}/customer/`,
        metadata: { booking_id: b.id, custom_fields: [{ display_name: 'Fixam booking', variable_name: 'booking', value: b.id.slice(0, 8).toUpperCase() }] },
      }),
    });
    const out = await r.json().catch(() => ({}));
    if (!r.ok || !out?.status) return json({ error: `Paystack could not start the payment: ${out?.message || r.status}` }, 502);
    return json({ authorization_url: out.data.authorization_url, reference });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
