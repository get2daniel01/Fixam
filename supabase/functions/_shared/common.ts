import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';

export const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

// Service-role client: bypasses row-level security. Only ever used inside these functions.
export function serviceClient(): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// The signed-in user who called the function, or null
export async function callerUser(req: Request, admin: SupabaseClient) {
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  return error ? null : data.user;
}

export const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

// Where the website lives (for links in emails and the Paystack return address)
export function siteUrl(req: Request) {
  const fromEnv = (Deno.env.get('SITE_URL') || '').replace(/\/+$/, '');
  if (fromEnv) return fromEnv;
  const origin = req.headers.get('Origin') || '';
  return /^https?:\/\/[^/]+$/.test(origin) ? origin : '';
}

/* ---------- Paystack ---------- */
export type PaystackTx = {
  status: string; reference: string; amount: number; currency: string;
  metadata?: { booking_id?: string } | string | null;
};

function bookingIdOf(tx: PaystackTx): string | null {
  let m = tx.metadata;
  if (typeof m === 'string') { try { m = JSON.parse(m); } catch { m = null; } }
  return (m && typeof m === 'object' && m.booking_id) ? String(m.booking_id) : null;
}

// Record a successful Paystack payment against its booking. Safe to call more than once.
export async function recordPayment(admin: SupabaseClient, tx: PaystackTx, onlyCustomer?: string) {
  const bookingId = bookingIdOf(tx);
  if (tx.status !== 'success') return { ok: false, result: 'not_successful' };
  if (!bookingId) return { ok: false, result: 'no_booking' };

  const { data: b } = await admin.from('bookings')
    .select('id, customer_id, status, quote_amount, paystack_reference').eq('id', bookingId).maybeSingle();
  if (!b) return { ok: false, result: 'no_booking' };
  if (onlyCustomer && b.customer_id !== onlyCustomer) return { ok: false, result: 'not_yours' };
  if (!tx.reference.startsWith(`FX-${b.id.slice(0, 8)}-`)) return { ok: false, result: 'reference_mismatch' };
  if (b.paystack_reference === tx.reference) return { ok: true, result: 'already_recorded', booking_id: b.id };

  if (b.status !== 'quoted') {
    // Money arrived for a booking that was cancelled, declined or already paid: flag it for a refund.
    await admin.from('bookings').update({
      status: 'disputed',
      dispute_reason: `Payment ${tx.reference} of N${tx.amount / 100} arrived while the booking was "${b.status}". Check and refund the customer if needed.`,
      updated_at: new Date().toISOString(),
    }).eq('id', b.id).in('status', ['cancelled', 'declined', 'requested']);
    // Also leave a note for staff (covers a second payment on a booking that is already paid)
    await admin.from('bookings').update({
      admin_notes: `Extra Paystack payment ${tx.reference} of N${tx.amount / 100} received while status was "${b.status}". Check and refund if needed.`,
    }).eq('id', b.id);
    return { ok: false, result: 'needs_review', booking_id: b.id };
  }
  if (tx.currency !== 'NGN' || tx.amount !== b.quote_amount * 100) {
    await admin.from('bookings').update({
      status: 'disputed',
      dispute_reason: `Paystack amount ${tx.amount / 100} ${tx.currency} does not match the quote of N${b.quote_amount}. Check payment ${tx.reference}.`,
      updated_at: new Date().toISOString(),
    }).eq('id', b.id).eq('status', 'quoted');
    return { ok: false, result: 'amount_mismatch', booking_id: b.id };
  }

  const { data: pct } = await admin.rpc('fixam_commission_percent');
  const fee = Math.round((b.quote_amount * Number(pct ?? 10)) / 100);
  const { error } = await admin.from('bookings').update({
    status: 'paid', paid_at: new Date().toISOString(), paystack_reference: tx.reference,
    platform_fee: fee, artisan_payout: b.quote_amount - fee, updated_at: new Date().toISOString(),
  }).eq('id', b.id).eq('status', 'quoted');
  if (error) throw error;
  return { ok: true, result: 'paid', booking_id: b.id };
}
