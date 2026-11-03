'use client';

import { useCallback, useEffect, useState } from 'react';
import { rpc, invoke } from '@/lib/supabase';
import { ROUTES, TRADES, AREAS, PHONE_RE, tradeLabel, naira, fmtDate, photoUrl, today, friendly } from '@/lib/common';
import { Header, Shell, Notice, SignedInLinks, useRequiredSession } from '@/components/ui';

type View = 'loading' | 'setup' | 'find' | 'artisan' | 'book' | 'bookings' | 'profile';

const STATUS: Record<string, [string, string]> = {
  requested: ['Waiting for a price', 'p-warn'], quoted: ['Price received', 'p-brand'], declined: ['Artisan declined', 'p-muted'],
  cancelled: ['Cancelled', 'p-muted'], paid: ['Paid', 'p-ok'], in_progress: ['Work started', 'p-ok'],
  done: ['Artisan says done', 'p-warn'], confirmed: ['Completed', 'p-ok'], disputed: ['Under review', 'p-bad'], refunded: ['Refunded', 'p-muted'],
};
const initials = (n: string) => n.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
const plusDays = (n: number) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const firstName = (n: string) => n.split(' ')[0];
const emptyDraft = { description: '', address: '', date: '', time: 'Any time', area: '' };

export default function CustomerArea() {
  const session = useRequiredSession(ROUTES.customer);
  const [view, setView] = useState<View>('loading');
  const [profile, setProfile] = useState<any>(null);
  const [area, setArea] = useState('Jimeta');
  const [trade, setTrade] = useState<string | null>(null);
  const [artisans, setArtisans] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [posts, setPosts] = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [draft, setDraft] = useState({ ...emptyDraft });
  const [confirm, setConfirm] = useState<{ kind: string; id: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const loadArtisans = useCallback(async (a: string, t: string | null) => {
    setLoading(true);
    try { setArtisans((await rpc<any[]>('list_artisans', { p_area: a, p_trade: t })) || []); }
    catch (err) { setError(friendly(err)); }
    finally { setLoading(false); }
  }, []);
  const loadBookings = useCallback(async () => {
    setLoading(true);
    try { setBookings((await rpc<any[]>('my_bookings')) || []); }
    catch (err) { setError(friendly(err)); }
    finally { setLoading(false); }
  }, []);

  function go(v: View) {
    setView(v); setConfirm(null); setError(null); setInfo(null); window.scrollTo(0, 0);
    if (v === 'find') loadArtisans(area, trade);
    if (v === 'bookings') loadBookings();
  }

  // Start: load profile, handle the return from Paystack
  useEffect(() => {
    if (!session) return;
    (async () => {
      let prof: any = null;
      try { prof = (await rpc<any[]>('my_customer_profile'))?.[0] || null; } catch (err) { setError(friendly(err)); }
      setProfile(prof);
      const startArea = prof?.area || 'Jimeta';
      setArea(startArea);

      const params = new URLSearchParams(window.location.search);
      const reference = params.get('reference') || params.get('trxref');
      if (reference) {
        window.history.replaceState(null, '', window.location.pathname);
        setView('bookings'); setLoading(true);
        try {
          const res = await invoke<any>('paystack-verify', { reference });
          if (res.ok) setInfo('Payment received. The artisan has been told and will contact you.');
          else if (res.result === 'abandoned' || res.result === 'not_successful') setError('The payment was not completed. You have not been charged. You can try again.');
          else setError('We received a payment but could not match it to your booking. Fixam will check it and contact you.');
        } catch (err) {
          console.error(err);
          setError('We could not confirm the payment yet. If you were charged, it will show here within a few minutes.');
        }
        loadBookings();
        return;
      }
      if (!prof) { setView('setup'); return; }
      setView('find');
      loadArtisans(startArea, null);
    })();
  }, [session, loadArtisans, loadBookings]);

  async function run(fn: () => Promise<void>) {
    setBusy(true); setError(null); setInfo(null);
    try { await fn(); } catch (err) { console.error(err); setError(friendly(err)); }
    finally { setBusy(false); }
  }

  async function openArtisan(a: any) {
    setSelected(a); setView('artisan'); setPosts([]); setError(null); window.scrollTo(0, 0);
    setLoading(true);
    try { setPosts((await rpc<any[]>('artisan_live_posts', { p_artisan_id: a.artisan_id })) || []); }
    catch (err) { setError(friendly(err)); }
    finally { setLoading(false); }
  }

  const bookingAction = (id: string, action: string, reason: string | undefined, message: string) => run(async () => {
    await rpc('customer_update_booking', { p_id: id, p_action: action, ...(reason ? { p_reason: reason } : {}) });
    setConfirm(null); setBookings((await rpc<any[]>('my_bookings')) || []); setInfo(message);
  });

  const pay = (id: string) => run(async () => {
    const res = await invoke<any>('paystack-init', { booking_id: id });
    window.location.href = res.authorization_url; // Paystack checkout; it returns to /customer/?reference=...
  });

  async function submitBooking(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const fd = new FormData(e.currentTarget);
    const d = { description: String(fd.get('description') || '').trim(), address: String(fd.get('address') || '').trim(),
      date: String(fd.get('date') || ''), time: String(fd.get('time')), area: String(fd.get('area')) };
    setDraft(d);
    const problem = d.description.length < 10 ? 'Describe the job in at least 10 characters.' :
      !d.date ? 'Choose a preferred date.' : d.date < today() ? 'The date cannot be in the past.' :
      d.address.length < 5 ? 'Enter the address where the work is needed.' : null;
    if (problem) { setError(problem); window.scrollTo(0, 0); return; }
    await run(async () => {
      await rpc('create_booking', { p_artisan_id: selected.artisan_id, p_description: d.description, p_area: d.area,
        p_address: d.address, p_preferred_date: d.date, p_preferred_time: d.time });
      setDraft({ ...emptyDraft });
      setView('bookings');
      setBookings((await rpc<any[]>('my_bookings')) || []);
      setInfo(`Request sent. You will see ${firstName(selected.display_name)}’s price here once they reply.`);
      window.scrollTo(0, 0);
    });
  }

  async function saveProfile(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const fd = new FormData(e.currentTarget);
    const p = { full_name: String(fd.get('full_name') || '').trim(), phone: String(fd.get('phone') || '').trim(), area: String(fd.get('area')) };
    const problem = p.full_name.length < 3 ? 'Enter your full name.' : !PHONE_RE.test(p.phone) ? 'Enter an 11-digit Nigerian phone number.' : null;
    if (problem) { setError(problem); return; }
    const wasSetup = view === 'setup';
    await run(async () => {
      await rpc('save_my_customer_profile', { p_full_name: p.full_name, p_phone: p.phone, p_area: p.area });
      setProfile({ ...profile, ...p }); setArea(p.area);
      if (wasSetup) { setView('find'); await loadArtisans(p.area, null); }
      else setInfo('Profile saved.');
    });
  }

  /* ---------- views ---------- */
  const artisanCard = (a: any) => (
    <button className="acard" key={a.artisan_id} onClick={() => openArtisan(a)}>
      {a.cover_photo ? <img src={photoUrl(a.cover_photo)} alt="" loading="lazy" /> : <span className="avatar">{initials(a.display_name)}</span>}
      <span className="acard-body">
        <b>{a.display_name} <span className="verified" title="Verified by Fixam">✓ Verified</span></b>
        <span className="sub">{tradeLabel(a.trade)} · {a.base_area} · {a.years_experience} yrs</span>
        <span className="pills">
          {a.jobs_completed ? <span className="pill p-ok">{a.jobs_completed} job{a.jobs_completed > 1 ? 's' : ''} done</span> : <span className="pill p-brand">New on Fixam</span>}
          {a.live_posts > 0 && <span className="pill p-muted">{a.live_posts} work photo post{a.live_posts > 1 ? 's' : ''}</span>}
          {a.serves_everywhere && a.base_area !== area && <span className="pill p-muted">Works all over Yola</span>}
        </span>
      </span>
    </button>
  );

  const findView = <>
    <h1>Find an artisan</h1>
    <label className="f" htmlFor="area">Area
      <select className="inp" id="area" value={area} onChange={(e) => { setArea(e.target.value); loadArtisans(e.target.value, trade); }}>
        {AREAS.map((a) => <option key={a}>{a}</option>)}</select></label>
    <div className="chips" role="group" aria-label="Service">
      {([['', 'All'], ...TRADES] as [string, string][]).map(([v, l]) => (
        <button key={v} className="chip" aria-pressed={(trade || '') === v} onClick={() => { const t = v || null; setTrade(t); loadArtisans(area, t); }}>{l}</button>))}
    </div>
    {loading ? <p className="sub">Loading…</p> : artisans.length ? <>
      <p className="sub">{artisans.length} verified artisan{artisans.length > 1 ? 's' : ''} available in {area}.</p>
      <div className="alist">{artisans.map(artisanCard)}</div>
    </> : <p className="empty">No verified {trade ? tradeLabel(trade).toLowerCase() + ' ' : ''}artisans in {area} yet. Try another area or service.</p>}
  </>;

  const artisanView = selected && <>
    <button className="textbtn" onClick={() => go('find')}>← Back to results</button>
    <div className="card">
      <div className="prof">
        {selected.cover_photo ? <img className="prof-img" src={photoUrl(selected.cover_photo)} alt="" /> : <span className="avatar lg">{initials(selected.display_name)}</span>}
        <span><h1 style={{ fontSize: 26 }}>{selected.display_name}</h1><span className="sub">{tradeLabel(selected.trade)} · based in {selected.base_area} · {selected.travel_radius}</span></span>
      </div>
      <span className="verified">✓ Verified by Fixam: ID, guarantor and skill checked</span>
      <p>{selected.bio}</p>
      <dl className="kv"><dt>Experience</dt><dd>{selected.years_experience} years</dd><dt>Jobs completed on Fixam</dt><dd>{selected.jobs_completed}</dd></dl>
      <button className="btn" onClick={() => { setDraft((d) => ({ ...d, area: d.area || area })); setView('book'); setError(null); window.scrollTo(0, 0); }}>Book {firstName(selected.display_name)}</button>
    </div>
    <h2>Work by {firstName(selected.display_name)}</h2>
    {loading ? <p className="sub">Loading…</p> : posts.length ? posts.map((p) => (
      <div className="card" key={p.id}>
        <div className="gallery">{p.photo_paths.map((ph: string) => <img key={ph} src={photoUrl(ph)} alt="" loading="lazy" />)}</div>
        <b>{p.title}</b><p className="sub">{p.description}</p>
        {p.starting_price && <span className="sub">From <span className="num">{naira(p.starting_price)}</span></span>}
      </div>)) : <p className="empty">No work photos posted yet.</p>}
  </>;

  const bookView = selected && <>
    <button className="textbtn" onClick={() => { setView('artisan'); setError(null); }}>← Back to {selected.display_name}</button>
    <h1>Book {selected.display_name}</h1>
    <div className="note">How it works: {firstName(selected.display_name)} reads your request and sends a price. You pay through Fixam only if you accept it. Fixam holds the money until you confirm the job is done.</div>
    <form onSubmit={submitBooking} noValidate>
      <label className="f" htmlFor="description">What do you need done? <span className="hint">10 to 500 characters</span>
        <textarea className="inp" id="description" name="description" maxLength={500} placeholder="Example: The kitchen sink pipe is leaking under the cabinet." defaultValue={draft.description} /></label>
      <div className="two">
        <label className="f" htmlFor="date">Preferred date<input className="inp" id="date" name="date" type="date" min={today()} max={plusDays(60)} defaultValue={draft.date} /></label>
        <label className="f" htmlFor="time">Time of day<select className="inp" id="time" name="time" defaultValue={draft.time}>{['Morning', 'Afternoon', 'Evening', 'Any time'].map((t) => <option key={t}>{t}</option>)}</select></label>
      </div>
      <label className="f" htmlFor="barea">Area<select className="inp" id="barea" name="area" defaultValue={draft.area || area}>{AREAS.map((x) => <option key={x}>{x}</option>)}</select></label>
      <label className="f" htmlFor="address">Address <span className="hint">Shown to the artisan only after you pay</span>
        <textarea className="inp" id="address" name="address" maxLength={300} placeholder="House number, street and a landmark" defaultValue={draft.address} /></label>
      <div className="btns"><button className="btn" type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send request'}</button></div>
    </form>
  </>;

  function bookingCard(b: any) {
    const [label, cls] = STATUS[b.status] || [b.status, 'p-muted'];
    const c = confirm?.id === b.id ? confirm.kind : null;
    const name = firstName(b.artisan_name);
    let act: React.ReactNode = null;
    if (b.status === 'requested') act = <p className="sub">{b.artisan_name} will send a price. You do not pay anything yet.</p>;
    if (b.status === 'quoted') act = <>
      <div className="price"><span>Price</span><b className="num">{naira(b.quote_amount)}</b></div>
      {b.quote_note && <p className="quote">{b.quote_note}</p>}
      <button className="btn" onClick={() => pay(b.id)} disabled={busy}>Pay {naira(b.quote_amount)} with Paystack</button>
      <p className="sub">Card, bank transfer or USSD. Fixam holds the money until you confirm the job is done.</p>
    </>;
    if (['paid', 'in_progress'].includes(b.status)) act = <p>Payment received. {name} will contact you. Phone: <b className="num">{b.artisan_phone || ''}</b></p>;
    if (b.status === 'done') act = <>
      <p>{name} says the job is finished. Check the work, then confirm. This releases the payment to the artisan.</p>
      {c === 'confirm' ? <div className="confirmbox"><b>Is the job done properly?</b><span className="sub">After you confirm, the payment goes to the artisan.</span>
        <span className="btns"><button className="btn ghost sm" onClick={() => setConfirm(null)}>Not yet</button>
          <button className="btn sm" onClick={() => bookingAction(b.id, 'confirm', undefined, 'Thank you. The job is complete and the artisan will be paid.')}>Yes, confirm</button></span></div>
        : <button className="btn" onClick={() => setConfirm({ kind: 'confirm', id: b.id })}>Confirm the job is done</button>}
    </>;
    if (b.status === 'disputed') act = <p className="sub">Fixam is reviewing this job and will contact you. The payment stays on hold until then.</p>;
    if (b.status === 'confirmed') act = <p className="sub">Thank you. This job is complete.</p>;
    const canCancel = ['requested', 'quoted'].includes(b.status);
    const canReport = ['paid', 'in_progress', 'done'].includes(b.status);
    return (
      <article className="card" key={b.id}>
        <div className="card-head"><span><b>{b.artisan_name} · {tradeLabel(b.trade)}</b><br />
          <span className="sub">{fmtDate(b.preferred_date)}, {String(b.preferred_time).toLowerCase()} · {b.area}</span></span>
          <span className={`pill ${cls}`}>{label}</span></div>
        <p className="sub">{b.description}</p>
        {act}
        {canCancel && (c === 'cancel'
          ? <div className="confirmbox"><b>Cancel this request?</b><span className="btns"><button className="btn ghost sm" onClick={() => setConfirm(null)}>Keep it</button>
              <button className="btn danger sm" onClick={() => bookingAction(b.id, 'cancel', undefined, 'Request cancelled.')}>Yes, cancel</button></span></div>
          : <button className="textbtn" onClick={() => setConfirm({ kind: 'cancel', id: b.id })}>Cancel request</button>)}
        {canReport && (c === 'report'
          ? <div className="confirmbox"><label className="f" htmlFor={`rep-${b.id}`}>What is the problem?<textarea className="inp" id={`rep-${b.id}`} maxLength={500} /></label>
              <span className="btns"><button className="btn ghost sm" onClick={() => setConfirm(null)}>Go back</button>
                <button className="btn danger sm" onClick={() => {
                  const reason = ((document.getElementById(`rep-${b.id}`) as HTMLTextAreaElement)?.value || '').trim();
                  if (reason.length < 10) { setError('Describe the problem in at least 10 characters.'); return; }
                  bookingAction(b.id, 'report', reason, 'Reported. Fixam will contact you. The payment stays on hold.');
                }}>Report to Fixam</button></span></div>
          : <button className="textbtn" onClick={() => setConfirm({ kind: 'report', id: b.id })}>Report a problem</button>)}
      </article>
    );
  }

  const bookingsView = <>
    <h1>My bookings</h1>
    {loading ? <p className="sub">Loading…</p> : bookings.length ? bookings.map(bookingCard)
      : <><p className="empty">No bookings yet.</p><button className="btn" onClick={() => go('find')}>Find an artisan</button></>}
  </>;

  const profileForm = (title: string, intro: string) => (
    <>
      <h1>{title}</h1><p className="sub">{intro}</p>
      <form onSubmit={saveProfile} noValidate key={title}>
        <label className="f" htmlFor="pname">Full name<input className="inp" id="pname" name="full_name" defaultValue={profile?.full_name || ''} /></label>
        <label className="f" htmlFor="pphone">Phone number<input className="inp num" id="pphone" name="phone" type="tel" inputMode="numeric" maxLength={11} defaultValue={profile?.phone || ''} /></label>
        <label className="f" htmlFor="parea">Your area<select className="inp" id="parea" name="area" defaultValue={profile?.area || 'Jimeta'}>{AREAS.map((a) => <option key={a}>{a}</option>)}</select></label>
        <div className="btns"><button className="btn" type="submit" disabled={busy}>Save</button></div>
      </form>
    </>
  );

  const tabs: [View, string][] = [['find', 'Find artisans'], ['bookings', 'My bookings'], ['profile', 'Profile']];
  return (
    <Shell>
      <Header><SignedInLinks /></Header>
      {view !== 'setup' && view !== 'loading' && (
        <nav className="tabs" aria-label="Sections">
          {tabs.map(([v, l]) => (
            <button key={v} className="tab" aria-selected={view === v || (v === 'find' && (view === 'artisan' || view === 'book'))} onClick={() => go(v)}>{l}</button>))}
        </nav>
      )}
      <Notice error={error} info={info} />
      {view === 'loading' && <p className="sub">Loading…</p>}
      {view === 'setup' && profileForm('Finish your profile', 'Tell us who you are and where you live so we can show artisans near you.')}
      {view === 'find' && findView}
      {view === 'artisan' && artisanView}
      {view === 'book' && bookView}
      {view === 'bookings' && bookingsView}
      {view === 'profile' && profileForm('Your profile', `Signed in as ${session?.user.email || ''}`)}
    </Shell>
  );
}
