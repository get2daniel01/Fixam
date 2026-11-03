// Receives payment events from Paystack. Paystack signs every event with your secret key;
// events with a wrong signature are ignored. Set this function's URL as the webhook URL
// in the Paystack dashboard (Settings > API Keys & Webhooks). Deploy with --no-verify-jwt.
// Secret: PAYSTACK_SECRET_KEY.
import { serviceClient, recordPayment } from '../_shared/common.ts';

async function hmacSha512Hex(key: string, body: string) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(key), { name: 'HMAC', hash: 'SHA-512' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(body));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Use POST', { status: 405 });
  const secret = Deno.env.get('PAYSTACK_SECRET_KEY');
  if (!secret) return new Response('Not configured', { status: 503 });

  const raw = await req.text();
  const given = (req.headers.get('x-paystack-signature') || '').toLowerCase();
  const expected = await hmacSha512Hex(secret, raw);
  if (!given || !safeEqual(given, expected)) return new Response('Invalid signature', { status: 401 });

  try {
    const event = JSON.parse(raw);
    if (event?.event === 'charge.success' && event.data) {
      const res = await recordPayment(serviceClient(), event.data);
      console.log('paystack charge.success', event.data.reference, res.result);
    }
  } catch (e) {
    console.error('webhook error', e);
    return new Response('Error', { status: 500 }); // Paystack retries on non-200
  }
  return new Response('ok', { status: 200 });
});
