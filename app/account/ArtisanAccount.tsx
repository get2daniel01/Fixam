'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { rpc } from '@/lib/supabase';
import { ROUTES, tradeLabel, naira, fmtDate, photoUrl, queryParam } from '@/lib/common';
import { Header, Shell, Notice, SignedInLinks, useRequiredSession } from '@/components/ui';

const POST_STATUS: Record<string, [string, string]> = {
  pending: ['Waiting for review', 'p-warn'], live: ['Live', 'p-ok'], rejected: ['Not approved', 'p-bad'],
};
const JOB_STATUS: Record<string, [string, string]> = {
  requested: ['New request', 'p-warn'], quoted: ['Price sent', 'p-brand'], declined: ['Declined', 'p-muted'],
  cancelled: ['Cancelled by customer', 'p-muted'], paid: ['Paid: go ahead', 'p-ok'], in_progress: ['In progress', 'p-ok'],
  done: ['Waiting for customer', 'p-warn'], confirmed: ['Completed', 'p-ok'], disputed: ['Under review', 'p-bad'], refunded: ['Refunded', 'p-muted'],
};

export default function ArtisanAccount() {
  const session = useRequiredSession(ROUTES.account);
  const [app, setApp] = useState<any>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [jobs, setJobs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [jobAction, setJobAction] = useState<{ kind: string; id: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [apps, ps, js] = await Promise.all([rpc<any[]>('my_application'), rpc<any[]>('my_work_posts'), rpc<any[]>('artisan_jobs')]);
      setApp(apps?.[0] || null); setPosts(ps || []); setJobs(js || []);
    } catch (err: any) {
      console.error(err);
      setError(/Failed to fetch|network/i.test(err?.message || '') ? 'No internet connection. Check your data or Wi-Fi and reload the page.' : `Your account could not be loaded (${err?.message}). Reload the page to try again.`);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => {
    if (!session) return;
    const msg = queryParam('msg');
    if (msg === 'posted') setInfo('Your post was sent for review. You will see it change to Live once Fixam approves it.');
    if (msg) window.history.replaceState(null, '', window.location.pathname);
    load();
  }, [session, load]);

  async function jobDo(id: string, action: string, amount?: number, note?: string | null) {
    setBusy(true); setError(null); setInfo(null);
    try {
      await rpc('artisan_update_job', { p_id: id, p_action: action, ...(action === 'quote' ? { p_amount: amount, p_note: note } : {}) });
      setJobs((await rpc<any[]>('artisan_jobs')) || []);
      setJobAction(null);
      setInfo({ quote: 'Price sent. The customer can now pay.', decline: 'Job declined.', start: 'Marked as started.', done: 'Marked as finished. The customer has been asked to confirm.' }[action] || null);
    } catch (err: any) { setError(err.message); } finally { setBusy(false); }
  }

  function sendQuote(id: string) {
    const amt = Number((document.getElementById(`amt-${id}`) as HTMLInputElement)?.value);
    if (!Number.isInteger(amt) || amt < 500 || amt > 5000000) { setError('Enter a price between 500 and 5,000,000 naira, in whole naira.'); return; }
    const note = ((document.getElementById(`note-${id}`) as HTMLTextAreaElement)?.value || '').trim() || null;
    jobDo(id, 'quote', amt, note);
  }

  async function removePost(id: string) {
    setConfirmRemove(null);
    try {
      const ok = await rpc<boolean>('remove_my_work_post', { p_id: id });
      if (!ok) throw new Error('not removed');
      setPosts((p) => p.filter((x) => x.id !== id));
      setInfo('Post removed. Customers can no longer see it.');
    } catch { setError('The post could not be removed. Reload the page and try again.'); }
  }

  function applicationCard(a: any) {
    if (a.status === 'rejected') {
      return (
        <div className="card">
          <div className="card-head"><h2>Your application</h2><span className="pill p-bad">Not approved</span></div>
          <p>Fixam could not approve this application. We contact you by email, phone or SMS with the reason. You can apply again once it is fixed.</p>
          <Link className="btn" href={ROUTES.artisanSignup}>Apply again</Link>
        </div>
      );
    }
    const approved = a.status === 'approved';
    const steps: [string, boolean][] = [
      ['Application submitted', true], ['NIN checked', a.nin_verified || approved], ['Guarantor confirmed', a.guarantor_confirmed || approved],
      ['Skill assessment passed', a.skill_test_passed || approved], ['Approved and live on Fixam', approved],
    ];
    let reached = false;
    return (
      <div className="card">
        <div className="card-head"><h2>Your application</h2><span className={`pill ${approved ? 'p-ok' : 'p-warn'}`}>{approved ? 'Approved' : 'Under review'}</span></div>
        <ol className="tl">{steps.map(([label, done]) => {
          let cls = done ? 'done' : 'todo';
          if (!done && !reached) { cls = 'now'; reached = true; }
          return <li key={label} className={cls}><span className="d">{done ? '✓' : ''}</span><span>{label}</span></li>;
        })}</ol>
        <dl className="kv">
          <dt>Reference</dt><dd className="num">{a.reference}</dd><dt>Service</dt><dd>{tradeLabel(a.trade)}</dd>
          <dt>Based in</dt><dd>{a.base_area}</dd><dt>Submitted</dt><dd>{fmtDate(a.submitted_at)}</dd>
        </dl>
      </div>
    );
  }

  function jobCard(j: any) {
    const [label, cls] = JOB_STATUS[j.status] || [j.status, 'p-muted'];
    const act = jobAction?.id === j.id ? jobAction.kind : null;
    let body: React.ReactNode = null;
    if (['requested', 'quoted'].includes(j.status)) {
      if (act === 'quote') {
        body = (
          <div className="confirmbox">
            <label className="f" htmlFor={`amt-${j.id}`}>Your price for the whole job (naira)
              <input className="inp num" id={`amt-${j.id}`} type="number" min={500} step={500} inputMode="numeric" defaultValue={j.quote_amount || ''} /></label>
            <label className="f" htmlFor={`note-${j.id}`}>Note for the customer <span className="hint">Optional. What the price includes.</span>
              <textarea className="inp" id={`note-${j.id}`} maxLength={300} defaultValue={j.quote_note || ''} /></label>
            <span className="sub">Fixam keeps a service fee. You receive the rest after the customer confirms the job is done.</span>
            <span className="btns"><button className="btn ghost sm" onClick={() => setJobAction(null)}>Go back</button>
              <button className="btn sm" onClick={() => sendQuote(j.id)} disabled={busy}>Send price</button></span>
          </div>
        );
      } else if (act === 'decline') {
        body = (
          <div className="confirmbox"><b>Decline this job?</b>
            <span className="btns"><button className="btn ghost sm" onClick={() => setJobAction(null)}>Go back</button>
              <button className="btn danger sm" onClick={() => jobDo(j.id, 'decline')} disabled={busy}>Yes, decline</button></span></div>
        );
      } else {
        body = <>
          {j.status === 'quoted' && <p>You quoted <b className="num">{naira(j.quote_amount)}</b>. Waiting for the customer to pay.</p>}
          <span className="btns"><button className="btn ghost sm" onClick={() => setJobAction({ kind: 'decline', id: j.id })}>Decline</button>
            <button className="btn sm" onClick={() => setJobAction({ kind: 'quote', id: j.id })}>{j.status === 'quoted' ? 'Change price' : 'Send a price'}</button></span>
        </>;
      }
    } else if (['paid', 'in_progress'].includes(j.status)) {
      body = <>
        <dl className="kv"><dt>Address</dt><dd>{j.address}</dd><dt>Customer phone</dt><dd className="num">{j.customer_phone}</dd>
          <dt>Price paid</dt><dd className="num">{naira(j.quote_amount)}</dd><dt>You receive</dt><dd className="num">{naira(j.artisan_payout)}</dd></dl>
        <span className="btns">{j.status === 'paid' && <button className="btn ghost sm" onClick={() => jobDo(j.id, 'start')} disabled={busy}>I have started</button>}
          <button className="btn sm" onClick={() => jobDo(j.id, 'done')} disabled={busy}>The job is finished</button></span>
      </>;
    } else if (j.status === 'done') {
      body = <p className="sub">Waiting for the customer to confirm. Your payment is released once they do.</p>;
    } else if (j.status === 'confirmed') {
      body = <p className="sub">You receive <b className="num">{naira(j.artisan_payout)}</b>. {j.payout_status === 'paid' ? 'Fixam has sent it to your bank account.' : 'Fixam will send it to your bank account.'}</p>;
    }
    return (
      <div className="job" key={j.id}>
        <div className="card-head"><span><b>{j.customer_name} · {j.area}</b><br />
          <span className="sub">{new Date(j.preferred_date).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' })}, {String(j.preferred_time).toLowerCase()}</span></span>
          <span className={`pill ${cls}`}>{label}</span></div>
        <p className="quote">{j.description}</p>{body}
      </div>
    );
  }

  const approved = app?.status === 'approved';
  const openJobs = jobs.filter((j) => !['declined', 'cancelled', 'confirmed', 'refunded'].includes(j.status));
  const pastJobs = jobs.filter((j) => !openJobs.includes(j));

  return (
    <Shell>
      <Header><SignedInLinks /></Header>
      {!session || loading ? <p className="sub">Loading your account…</p> : <>
        <Notice error={error} info={info} />
        <h1>{app ? `Hello, ${app.first_name}` : 'Your Fixam account'}</h1>
        <p className="sub">Signed in as {session.user.email}</p>
        {!app ? (
          <div className="card"><h2>No application found</h2>
            <p>We could not find an artisan application for {session.user.email}. If you applied with a different email, sign out and sign in with that one. Otherwise, apply now.</p>
            <Link className="btn" href={ROUTES.artisanSignup}>Sign up as an artisan</Link></div>
        ) : <>
          {applicationCard(app)}
          {approved && (
            <div className="card">
              <div className="card-head"><h2>Job requests</h2>{openJobs.length > 0 && <span className="pill p-warn">{openJobs.length} open</span>}</div>
              {openJobs.length ? openJobs.map(jobCard) : <p className="sub">No open requests. Customers near you can now find and book you.</p>}
              {pastJobs.length > 0 && <details><summary className="sub">Past jobs ({pastJobs.length})</summary>{pastJobs.map(jobCard)}</details>}
            </div>
          )}
          {approved ? (
            <div className="card">
              <div className="card-head"><h2>Your work posts</h2></div>
              <Link className="btn" href={ROUTES.post}>+ Post new work</Link>
              {posts.length ? posts.map((p) => {
                const [label, cls] = POST_STATUS[p.status] || [p.status, 'p-muted'];
                const featured = p.visibility !== 'standard'
                  ? (p.payment_status === 'unpaid' ? <span className="pill p-warn">Featured: awaiting payment</span>
                    : p.featured_until && new Date(p.featured_until) > new Date() ? <span className="pill p-brand">Featured until {fmtDate(p.featured_until)}</span> : null)
                  : null;
                return (
                  <div className="post" key={p.id}>
                    <img src={photoUrl(p.photo_paths[0])} alt="" loading="lazy" />
                    <div className="post-body">
                      <b>{p.title}</b>
                      <span className="sub">{tradeLabel(p.trade)} · posted {fmtDate(p.created_at)}</span>
                      <span className="pills"><span className={`pill ${cls}`}>{label}</span>{featured}</span>
                      {p.rejection_reason && <span className="sub">Reason: {p.rejection_reason}</span>}
                      {p.status !== 'rejected' && (confirmRemove === p.id
                        ? <span className="btns"><button className="btn ghost sm" onClick={() => setConfirmRemove(null)}>Keep it</button>
                            <button className="btn danger sm" onClick={() => removePost(p.id)}>Yes, remove</button></span>
                        : <button className="textbtn" onClick={() => setConfirmRemove(p.id)}>Remove this post</button>)}
                    </div>
                  </div>
                );
              }) : <p className="sub">You have not posted any work yet. Posts with clear before and after photos get more enquiries.</p>}
            </div>
          ) : (
            <div className="card"><h2>Your work posts</h2>
              <p className="sub">Once you are approved, you can post photos of jobs you have finished so customers can see your work.</p></div>
          )}
        </>}
      </>}
    </Shell>
  );
}
