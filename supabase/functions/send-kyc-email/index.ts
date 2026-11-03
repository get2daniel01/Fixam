// Emails an artisan the decision on their KYC application (approved or rejected), using Resend.
// Called by the admin page after an admin approves or rejects. Admins only.
// Secrets: RESEND_API_KEY, EMAIL_FROM (e.g. "Fixam <no-reply@yourdomain.com>"), SITE_URL.
import { cors, json, serviceClient, callerUser, esc, siteUrl } from '../_shared/common.ts';

const TRADES: Record<string, string> = {
  plumbing: 'Plumbing', electrical: 'Electrical', carpentry: 'Carpentry', tailoring: 'Tailoring',
  ac_generator: 'AC & Generator repair', painting: 'Painting', welding: 'Welding', tiling: 'Tiling',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);
  try {
    const admin = serviceClient();
    const user = await callerUser(req, admin);
    if (!user) return json({ error: 'Sign in first' }, 401);
    const { data: isAdmin } = await admin.from('admins').select('user_id').eq('user_id', user.id).maybeSingle();
    const { data: invited } = await admin.from('admin_invites').select('email').eq('email', (user.email || '').toLowerCase()).maybeSingle();
    if (!isAdmin && !(invited && user.email_confirmed_at)) return json({ error: 'Admins only' }, 403);

    const { application_id } = await req.json().catch(() => ({}));
    if (!application_id) return json({ error: 'application_id is required' }, 400);
    const { data: app } = await admin.from('artisan_signups')
      .select('id, full_name, email, status, reviewer_notes, trade').eq('id', application_id).maybeSingle();
    if (!app) return json({ error: 'Application not found' }, 404);
    if (!['approved', 'rejected'].includes(app.status)) return json({ error: 'Approve or reject the application first' }, 400);
    if (!app.email) return json({ sent: false, reason: 'This application has no email address, so no email was sent.' });

    const key = Deno.env.get('RESEND_API_KEY');
    const from = Deno.env.get('EMAIL_FROM');
    if (!key || !from) {
      return json({ sent: false, reason: 'Email is not set up yet. Add RESEND_API_KEY and EMAIL_FROM under Supabase > Edge Functions > Secrets.' });
    }

    const site = siteUrl(req);
    const first = String(app.full_name).split(' ')[0];
    const approved = app.status === 'approved';
    const subject = approved ? 'Your Fixam account is approved' : 'An update on your Fixam application';
    const signin = site ? `${site}/signin/` : '';
    const para = (t: string) => `<p style="margin:0 0 14px;font:16px/1.5 Arial,sans-serif;color:#17212B">${t}</p>`;
    const button = signin
      ? `<p style="margin:22px 0"><a href="${esc(signin)}" style="background:#F2B705;color:#1A1400;padding:13px 22px;border-radius:10px;font:bold 16px Arial,sans-serif;text-decoration:none">Sign in to Fixam</a></p>`
      : '';
    const body = approved
      ? para(`Hello ${esc(first)},`) +
        para(`Good news: Fixam has checked your details and <b>approved you as a ${esc(TRADES[app.trade] || app.trade)} artisan</b>. Customers in your area can now find you and book you.`) +
        para('Sign in to post photos of your past work. Artisans with clear before-and-after photos get more bookings.') + button
      : para(`Hello ${esc(first)},`) +
        para('Thank you for applying to Fixam. We could not approve your application this time.') +
        para(`<b>Reason:</b> ${esc(app.reviewer_notes || 'Not given')}`) +
        para('You can apply again once this is fixed. Reply to this email if you have questions.');
    const html = `<div style="max-width:560px;margin:0 auto;padding:24px"><p style="font:bold 22px Arial,sans-serif;color:#1E3A5C;margin:0 0 20px">Fixam</p>${body}
      <p style="margin:28px 0 0;font:13px/1.5 Arial,sans-serif;color:#5A6570">You received this because you applied to join Fixam as an artisan.</p></div>`;
    const text = approved
      ? `Hello ${first},\n\nFixam has approved you as a ${TRADES[app.trade] || app.trade} artisan. Customers in your area can now find and book you.\n\nSign in to post photos of your work${signin ? `: ${signin}` : '.'}\n`
      : `Hello ${first},\n\nWe could not approve your Fixam application this time.\nReason: ${app.reviewer_notes || 'Not given'}\n\nYou can apply again once this is fixed.\n`;

    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [app.email], subject, html, text }),
    });
    if (!r.ok) {
      const detail = (await r.text()).slice(0, 300);
      return json({ sent: false, reason: `Resend did not accept the email (${r.status}): ${detail}` });
    }
    await admin.from('artisan_signups').update({ decision_email_sent_at: new Date().toISOString() }).eq('id', app.id);
    return json({ sent: true, to: app.email });
  } catch (e) {
    return json({ error: String((e as Error)?.message || e) }, 500);
  }
});
