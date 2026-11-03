'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { sb, rpc, invoke } from '@/lib/supabase';
import { ROUTES, tradeLabel, naira, fmtDate, photoUrl, myRole } from '@/lib/common';
import { Header, Shell, Notice, SignedInLinks, useRequiredSession } from '@/components/ui';

type Tab = 'kyc' | 'posts' | 'bookings';
type Doc = { url?: string; pdf?: boolean; error?: string };

const ageOf = (dob: string) => Math.floor((Date.now() - new Date(dob).getTime()) / 31557600000);
const BOOKING_LABEL: Record<string, [string, string]> = {
  requested: ['Waiting for quote', 'p-warn'], quoted: ['Quoted, not paid', 'p-warn'], declined: ['Declined', 'p-muted'],
  cancelled: ['Cancelled', 'p-muted'], paid: ['Paid', 'p-brand'], in_progress: ['In progress', 'p-brand'],
  done: ['Done, awaiting customer', 'p-warn'], confirmed: ['Completed', 'p-ok'], disputed: ['Dispute', 'p-bad'], refunded: ['Refunded', 'p-muted'],
};
const val = (id: string) => ((document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement)?.value || '').trim();

async function sendDecisionEmail(id: string): Promise<{ sent: boolean; to?: string; reason?: string }> {
  try { return await invoke('send-kyc-email', { application_id: id }); }
  catch (err: any) { return { sent: false, reason: err.message }; }
}

export default function AdminArea() {
  const session = useRequiredSession(ROUTES.admin);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>('kyc');
  const [kycFilter, setKycFilter] = useState('pending');
  const [bookingFilter, setBookingFilter] = useState('payouts');
  const [kyc, setKyc] = useState<any[]>([]);
  const [posts, setPosts] = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [docs, setDocs] = useState<Record<string, Record<string, Doc> | 'loading'>>({});
  const [confirm, setConfirm] = useState<{ kind: string; id: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const load = useCallback(async (t: Tab, filter: string) => {
    setLoading(true);
    try {
      if (t === 'kyc') setKyc((await rpc<any[]>('admin_kyc_list', { p_status: filter })) || []);
      else if (t === 'posts') setPosts((await rpc<any[]>('admin_posts_list', { p_status: 'pending' })) || []);
      else setBookings((await rpc<any[]>('admin_bookings_list')) || []);
    } catch (err: any) {
      console.error(err);
      if (/Admins only/i.test(err?.message || '')) setAllowed(false);
      else setError(`Could not load (${err?.message}). Reload the page to try again.`);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (!session) return;
    myRole().then((r) => {
      setAllowed(r === 'admin');
      if (r === 'admin') load('kyc', 'pending');
    }).catch(() => { setAllowed(true); load('kyc', 'pending'); });
  }, [session, load]);

  function switchTab(t: Tab) { setTab(t); setConfirm(null); setError(null); setInfo(null); load(t, kycFilter); }

  async function run(fn: () => Promise<void>) {
    setBusy(true); setError(null); setInfo(null);
    try { await fn(); } catch (err: any) { console.error(err); setError(err?.message || 'Something went wrong. Please try again.'); }
    finally { setBusy(false); }
  }

  async function loadDocs(a: any) {
    setDocs((d) => ({ ...d, [a.id]: 'loading' }));
    const out: Record<string, Doc> = {};
    for (const [k, p] of [['id_document', a.id_document_path], ['selfie', a.selfie_path], ['certificate', a.certificate_path]] as [string, string][]) {
      if (!p) continue;
      const { data, error } = await sb().storage.from('kyc-documents').createSignedUrl(p, 600);
      out[k] = error ? { error: error.message } : { url: data.signedUrl, pdf: /\.pdf$/i.test(p) };
    }
    setDocs((d) => ({ ...d, [a.id]: out }));
  }

  const approve = (a: any) => run(async () => {
    await rpc('admin_decide_kyc', { p_id: a.id, p_decision: 'approved' });
    const mail = await sendDecisionEmail(a.id);
    setKyc((k) => k.filter((x) => x.id !== a.id)); setConfirm(null);
    setInfo(`${a.full_name} is approved and can now sign in and post work.` +
      (mail?.sent ? ` Approval email sent to ${mail.to}.` : ` The email was not sent: ${mail?.reason || 'unknown reason'} You can send it later from the Approved list.`));
  });
  const reject = (a: any) => {
    const reason = val(`reason-${a.id}`);
    if (reason.length < 5) { setError('Write the reason for rejecting (at least 5 characters).'); return; }
    run(async () => {
      await rpc('admin_decide_kyc', { p_id: a.id, p_decision: 'rejected', p_notes: reason });
      const mail = await sendDecisionEmail(a.id);
      setKyc((k) => k.filter((x) => x.id !== a.id)); setConfirm(null);
      setInfo(`Application rejected.${mail?.sent ? ' The artisan has been emailed the reason.' : ` The email was not sent: ${mail?.reason || 'unknown reason'}`}`);
    });
  };
  const resendEmail = (a: any) => run(async () => {
    const mail = await sendDecisionEmail(a.id);
    if (!mail?.sent) throw new Error(`Email not sent: ${mail?.reason || 'unknown reason'}`);
    setInfo(`Email sent to ${mail.to}.`);
    setKyc((k) => k.map((x) => (x.id === a.id ? { ...x, decision_email_sent_at: new Date().toISOString() } : x)));
  });

  /* ---------- KYC ---------- */
  function docBlock(a: any) {
    const d = docs[a.id];
    if (!d) return <button className="btn ghost sm" onClick={() => loadDocs(a)}>Show ID and face photos</button>;
    if (d === 'loading') return <p className="sub">Opening…</p>;
    const one = (label: string, v?: Doc) => !v ? null : v.error ? <div className="sub" key={label}>{label}: could not open ({v.error})</div>
      : v.pdf ? <a className="linkbtn" key={label} href={v.url} target="_blank" rel="noopener noreferrer">{label} (PDF)</a>
      : <figure className="doc" key={label}><a href={v.url} target="_blank" rel="noopener noreferrer"><img src={v.url} alt={label} /></a><figcaption>{label}</figcaption></figure>;
    return <>
      <div className="docs">{one('ID document', d.id_document)}{one('Face photo', d.selfie)}{one('Certificate', d.certificate)}</div>
      <p className="sub">Links expire after 10 minutes. Compare the face photo with the NIN record before approving.</p>
    </>;
  }

  function kycCard(a: any) {
    const c = confirm?.id === a.id ? confirm.kind : null;
    const pending = a.status === 'pending';
    let actions: React.ReactNode;
    if (pending && c === 'approve') {
      actions = <div className="confirmbox"><b>Approve {a.full_name}?</b>
        <span className="sub">Only approve after checking the NIN, calling the guarantor and assessing the skill. {a.email ? `An email goes to ${a.email}.` : 'This application has no email, so no email will be sent.'}</span>
        <span className="btns"><button className="btn ghost sm" onClick={() => setConfirm(null)}>Go back</button><button className="btn sm" onClick={() => approve(a)} disabled={busy}>Yes, approve</button></span></div>;
    } else if (pending && c === 'reject') {
      actions = <div className="confirmbox">
        <label className="f" htmlFor={`reason-${a.id}`}>Reason for rejecting <span className="hint">The artisan sees this in the email</span>
          <textarea className="inp" id={`reason-${a.id}`} maxLength={300} placeholder="Example: The NIN does not match the name given." /></label>
        <span className="btns"><button className="btn ghost sm" onClick={() => setConfirm(null)}>Go back</button><button className="btn danger sm" onClick={() => reject(a)} disabled={busy}>Reject application</button></span></div>;
    } else if (pending) {
      actions = <span className="btns"><button className="btn danger sm" onClick={() => setConfirm({ kind: 'reject', id: a.id })}>Reject</button>
        <button className="btn sm" onClick={() => setConfirm({ kind: 'approve', id: a.id })}>Approve</button></span>;
    } else {
      actions = <>
        <p className="sub">{a.status === 'approved' ? 'Approved' : 'Rejected'} {a.reviewed_at ? fmtDate(a.reviewed_at) : ''}{a.reviewer_notes ? ` · ${a.reviewer_notes}` : ''}.{' '}
          {a.decision_email_sent_at ? `Email sent ${fmtDate(a.decision_email_sent_at)}.` : a.email ? 'Email not sent yet.' : 'No email address.'}</p>
        {!a.decision_email_sent_at && a.email && <button className="btn ghost sm" onClick={() => resendEmail(a)} disabled={busy}>Send decision email</button>}
      </>;
    }
    return (
      <article className="card" key={a.id}>
        <div className="card-head"><span><b>{a.full_name}</b><br /><span className="sub">{tradeLabel(a.trade)} · {a.base_area} · applied {fmtDate(a.created_at)}</span></span>
          <span className="num sub">{a.id.slice(0, 8).toUpperCase()}</span></div>
        <dl className="kv">
          <dt>Phone</dt><dd className="num">{a.phone}</dd>
          <dt>Email</dt><dd>{a.email || '–'}</dd>
          <dt>NIN</dt><dd className="num">{a.nin}</dd>
          <dt>Date of birth</dt><dd>{fmtDate(a.date_of_birth)} (age {ageOf(a.date_of_birth)})</dd>
          <dt>ID document</dt><dd>{a.id_type}</dd>
          <dt>Home address</dt><dd>{a.home_address}</dd>
          <dt>Experience</dt><dd>{a.years_experience} years · {a.travel_radius}</dd>
          <dt>Guarantor</dt><dd>{a.guarantor_name} ({a.guarantor_relationship})</dd>
          <dt>Guarantor phone</dt><dd className="num">{a.guarantor_phone}</dd>
          <dt>Payout account</dt><dd>{a.bank_name} <span className="num">{a.account_number}</span></dd>
        </dl>
        <p className="quote">{a.bio}</p>
        {docBlock(a)}
        {actions}
      </article>
    );
  }

  const kycView = <>
    <div className="chips">{[['pending', 'Pending'], ['approved', 'Approved'], ['rejected', 'Rejected']].map(([v, l]) => (
      <button key={v} className="chip" aria-pressed={kycFilter === v} onClick={() => { setKycFilter(v); setConfirm(null); load('kyc', v); }}>{l}</button>))}</div>
    {loading ? <p className="sub">Loading…</p> : kyc.length ? kyc.map(kycCard) : <p className="empty">No {kycFilter} applications.</p>}
  </>;

  /* ---------- posts ---------- */
  const postAction = (id: string, decision: string, notes: string | null, message: string, after: (list: any[]) => any[]) => run(async () => {
    await rpc('admin_decide_post', { p_id: id, p_decision: decision, ...(notes ? { p_notes: notes } : {}) });
    setPosts(after); setConfirm(null); setInfo(message);
  });

  const postsView = loading ? <p className="sub">Loading…</p> : !posts.length ? <p className="empty">No posts waiting for review.</p> : posts.map((p) => {
    const c = confirm?.id === p.id ? confirm.kind : null;
    const featured = p.visibility !== 'standard';
    return (
      <article className="card" key={p.id}>
        <div className="card-head"><span><b>{p.title}</b><br /><span className="sub">{p.artisan_name} · {tradeLabel(p.trade)} · {fmtDate(p.created_at)}</span></span>
          {featured && <span className={`pill ${p.payment_status === 'paid' ? 'p-ok' : 'p-warn'}`}>{p.visibility === 'featured_30' ? 'Featured 30 days' : 'Featured 7 days'}: {p.payment_status === 'paid' ? 'paid' : 'unpaid'}</span>}</div>
        <div className="gallery">{p.photo_paths.map((ph: string) => <a key={ph} href={photoUrl(ph)} target="_blank" rel="noopener noreferrer"><img src={photoUrl(ph)} alt="" loading="lazy" /></a>)}</div>
        <p className="quote">{p.description}</p>
        <p className="sub">{p.starting_price ? `From ${naira(p.starting_price)} · ` : ''}Areas: {(p.areas || []).join(', ')}</p>
        {c === 'reject' ? <div className="confirmbox">
          <label className="f" htmlFor={`preason-${p.id}`}>Reason for rejecting <span className="hint">The artisan sees this</span>
            <textarea className="inp" id={`preason-${p.id}`} maxLength={300} placeholder="Example: Photos are too dark to see the work." /></label>
          <span className="btns"><button className="btn ghost sm" onClick={() => setConfirm(null)}>Go back</button>
            <button className="btn danger sm" disabled={busy} onClick={() => {
              const reason = val(`preason-${p.id}`);
              if (reason.length < 5) { setError('Write the reason for rejecting (at least 5 characters).'); return; }
              postAction(p.id, 'rejected', reason, 'Post rejected. The artisan sees the reason on their account page.', (l) => l.filter((x) => x.id !== p.id));
            }}>Reject post</button></span></div>
          : <>
            <span className="btns"><button className="btn danger sm" onClick={() => setConfirm({ kind: 'reject', id: p.id })}>Reject</button>
              <button className="btn sm" disabled={busy} onClick={() => postAction(p.id, 'live', null, 'Post published. Customers can now see it.', (l) => l.filter((x) => x.id !== p.id))}>Approve and publish</button></span>
            {featured && p.payment_status !== 'paid' && <button className="btn ghost sm" disabled={busy}
              onClick={() => postAction(p.id, 'featured_paid', null, 'Featured period started.', (l) => l.map((x) => (x.id === p.id ? { ...x, payment_status: 'paid' } : x)))}>Featured fee received: start Featured period</button>}
          </>}
      </article>
    );
  });

  /* ---------- bookings ---------- */
  const bookingUpdate = (id: string, action: string, notes: string, message: string, patch: any) => run(async () => {
    await rpc('admin_update_booking', { p_id: id, p_action: action, p_notes: notes || null });
    setBookings((l) => l.map((x) => (x.id === id ? { ...x, ...patch } : x))); setConfirm(null); setInfo(message);
  });

  function bookingsView() {
    if (loading) return <p className="sub">Loading…</p>;
    const f = bookingFilter;
    const rows = bookings.filter((b) => (f === 'all' ? true : f === 'payouts' ? b.payout_status === 'due' : b.status === 'disputed'));
    const due = bookings.filter((b) => b.payout_status === 'due').length;
    const disputes = bookings.filter((b) => b.status === 'disputed').length;
    const paidTotal = bookings.filter((b) => b.paid_at).reduce((s, b) => s + (b.quote_amount || 0), 0);
    const fees = bookings.filter((b) => b.paid_at && b.status !== 'refunded').reduce((s, b) => s + (b.platform_fee || 0), 0);
    return <>
      <div className="stats">
        <div><b className="num">{naira(paidTotal)}</b><span>Paid by customers</span></div>
        <div><b className="num">{naira(fees)}</b><span>Fixam fees</span></div>
        <div><b className="num">{due}</b><span>Payouts due</span></div>
      </div>
      <div className="chips">{[['payouts', `Payouts due (${due})`], ['disputes', `Disputes (${disputes})`], ['all', 'All bookings']].map(([v, l]) => (
        <button key={v} className="chip" aria-pressed={f === v} onClick={() => { setBookingFilter(v); setConfirm(null); }}>{l}</button>))}</div>
      {rows.length ? rows.map((b) => {
        const [label, cls] = BOOKING_LABEL[b.status] || [b.status, 'p-muted'];
        const c = confirm?.id === b.id ? confirm.kind : null;
        let act: React.ReactNode = null;
        if (b.payout_status === 'due') {
          act = c === 'payout' ? <div className="confirmbox">
            <b>Did you send {naira(b.artisan_payout)} to {b.artisan_name}?</b><span className="sub">{b.artisan_bank} <span className="num">{b.artisan_account}</span></span>
            <label className="f" htmlFor={`pref-${b.id}`}>Transfer reference <span className="hint">Optional</span><input className="inp" id={`pref-${b.id}`} maxLength={100} /></label>
            <span className="btns"><button className="btn ghost sm" onClick={() => setConfirm(null)}>Go back</button>
              <button className="btn sm" disabled={busy} onClick={() => bookingUpdate(b.id, 'payout_sent', val(`pref-${b.id}`), 'Payout recorded.', { payout_status: 'paid' })}>Yes, payout sent</button></span></div>
            : <button className="btn sm" onClick={() => setConfirm({ kind: 'payout', id: b.id })}>Mark payout of {naira(b.artisan_payout)} as sent</button>;
        } else if (b.status === 'disputed') {
          act = <>
            <p className="quote">{b.dispute_reason || 'No reason given'}</p>
            <label className="f" htmlFor={`dnote-${b.id}`}>Decision note <span className="hint">Optional</span><input className="inp" id={`dnote-${b.id}`} maxLength={300} /></label>
            <span className="btns">
              <button className="btn danger sm" disabled={busy} onClick={() => bookingUpdate(b.id, 'refund', val(`dnote-${b.id}`), 'Refund recorded.', { status: 'refunded', payout_status: 'not_applicable' })}>Customer refunded</button>
              <button className="btn sm" disabled={busy} onClick={() => bookingUpdate(b.id, 'release', val(`dnote-${b.id}`), 'Dispute settled. The payout is now due to the artisan.', { status: 'confirmed', payout_status: 'due' })}>Pay the artisan</button></span>
            <p className="sub">Refund the customer in your Paystack dashboard first, then press “Customer refunded” to record it.</p>
          </>;
        }
        return (
          <article className="card" key={b.id}>
            <div className="card-head"><span><b>{tradeLabel(b.trade)} · {b.area}</b><br /><span className="sub">{fmtDate(b.created_at)} · <span className="num">{b.id.slice(0, 8).toUpperCase()}</span></span></span>
              <span className={`pill ${cls}`}>{label}</span></div>
            <dl className="kv">
              <dt>Customer</dt><dd>{b.customer_name} <span className="num">{b.customer_phone}</span></dd>
              <dt>Artisan</dt><dd>{b.artisan_name} <span className="num">{b.artisan_phone}</span></dd>
              <dt>Job</dt><dd style={{ fontWeight: 400 }}>{b.description}</dd>
              {b.quote_amount && <><dt>Price</dt><dd className="num">{naira(b.quote_amount)}</dd></>}
              {b.platform_fee != null && <><dt>Fixam fee</dt><dd className="num">{naira(b.platform_fee)}</dd><dt>Artisan gets</dt><dd className="num">{naira(b.artisan_payout)}</dd></>}
              {b.paystack_reference && <><dt>Paystack ref</dt><dd className="num">{b.paystack_reference}</dd></>}
              {b.payout_status === 'paid' && <><dt>Payout</dt><dd>Sent</dd></>}
            </dl>
            {act}
          </article>
        );
      }) : <p className="empty">{f === 'payouts' ? 'No payouts due.' : f === 'disputes' ? 'No open disputes.' : 'No bookings yet.'}</p>}
    </>;
  }

  if (allowed === false) {
    return (
      <Shell wide>
        <Header><SignedInLinks /></Header>
        <h1>Admins only</h1>
        <div className="card"><p>{session?.user.email} is not a Fixam admin. If you should have access, ask the Fixam owner to make you an admin.</p>
          <Link className="btn" href={ROUTES.home}>Go to Fixam home</Link></div>
      </Shell>
    );
  }

  return (
    <Shell wide>
      <Header><SignedInLinks /></Header>
      <h1>Fixam admin</h1>
      <p className="sub">Signed in as {session?.user.email || '…'}</p>
      <div className="tabs" role="tablist">
        {([['kyc', 'KYC'], ['posts', 'Work posts'], ['bookings', 'Bookings']] as [Tab, string][]).map(([v, l]) => (
          <button key={v} role="tab" className="tab" aria-selected={tab === v} onClick={() => switchTab(v)}>{l}</button>))}
      </div>
      <Notice error={error} info={info} />
      {allowed === null ? <p className="sub">Loading…</p> : tab === 'kyc' ? kycView : tab === 'posts' ? postsView : bookingsView()}
    </Shell>
  );
}
