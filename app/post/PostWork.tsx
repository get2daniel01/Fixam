'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { sb, rpc } from '@/lib/supabase';
import { ROUTES, TRADES, AREAS, tradeLabel, naira, today } from '@/lib/common';
import { Header, Shell, Notice, SignedInLinks, useRequiredSession } from '@/components/ui';

const BUCKET = 'work-photos';
const MAX_PHOTOS = 4;
const PHONE_IN_TEXT = /(\+?234|0)[ -]?[789][01]([ -]?[0-9]){8}/;
// Placeholder prices. Change these to Fixam's real Featured prices.
const PLANS = [
  { id: 'standard', label: 'Standard', price: 0, text: 'Free. Shows on your profile and in the feed by date.' },
  { id: 'featured_7', label: 'Featured for 7 days', price: 2000, text: 'Pinned to the top of the feed with a Featured label.' },
  { id: 'featured_30', label: 'Featured for 30 days', price: 6000, text: 'Same as above, for a month.' },
];
type Photo = { blob: Blob; url: string };

// Shrink a photo to at most 1600 px on the long side and save as JPEG (keeps uploads well under 5 MB)
function shrink(file: File): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 1600 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      c.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not read photo'))), 'image/jpeg', 0.82);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`${file.name} could not be opened as a photo`)); };
    img.src = url;
  });
}

function friendlyError(err: any) {
  const msg = err?.message || '';
  if (/Only approved/i.test(msg)) return 'Only approved Fixam artisans can post work. Check your application status on your account page.';
  if (/JWT|not authenticated|permission denied/i.test(msg)) return 'You have been signed out. Sign in again and send your post.';
  if (/phone number/i.test(msg)) return 'Remove the phone number. Customers contact you through Fixam.';
  if (/5 posts waiting/i.test(msg)) return 'You already have 5 posts waiting for review. Wait for Fixam to review them first.';
  if (/did not finish uploading|Photos do not belong/i.test(msg)) return 'A photo did not upload. Check your connection and send again.';
  if (/Failed to fetch|NetworkError|network/i.test(msg)) return 'No internet connection. Check your data or Wi-Fi and try again.';
  return `Your post could not be sent (${msg || 'unknown error'}). Please try again.`;
}

const emptyDraft = (a: any) => ({ title: '', trade: a?.trade || 'plumbing', description: '', starting_price: '', work_date: '', areas: a ? [a.base_area] : [], visibility: 'standard', own_work: false });

export default function PostWork() {
  const session = useRequiredSession(ROUTES.post);
  const [artisan, setArtisan] = useState<any>(undefined); // undefined = loading, null = none
  const [draft, setDraft] = useState<any>(emptyDraft(null));
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ id: string; title: string; visibility: string } | null>(null);
  const [formKey, setFormKey] = useState(0);

  useEffect(() => {
    if (!session) return;
    rpc<any[]>('my_application')
      .then((rows) => { const a = rows?.[0] || null; setArtisan(a); setDraft(emptyDraft(a)); })
      .catch((err) => { setArtisan(null); setError(friendlyError(err)); });
  }, [session]);

  function collect(form: HTMLFormElement) {
    const fd = new FormData(form);
    const d = {
      title: String(fd.get('title') || '').trim(), trade: String(fd.get('trade')), description: String(fd.get('description') || '').trim(),
      starting_price: String(fd.get('starting_price') || '').trim(), work_date: String(fd.get('work_date') || ''),
      areas: fd.getAll('areas').map(String), visibility: String(fd.get('visibility') || 'standard'), own_work: fd.has('own_work'),
    };
    setDraft(d);
    return d;
  }

  async function addPhotos(input: HTMLInputElement) {
    const list = Array.from(input.files || []);
    input.value = '';
    const room = MAX_PHOTOS - photos.length;
    setError(list.length > room ? `Only ${MAX_PHOTOS} photos per post. The extra photos were left out.` : null);
    const added: Photo[] = [];
    for (const f of list.slice(0, room)) {
      try { const blob = await shrink(f); added.push({ blob, url: URL.createObjectURL(blob) }); }
      catch (err: any) { setError(err.message); }
    }
    setPhotos((p) => [...p, ...added]);
  }

  function removePhoto(i: number) {
    setPhotos((p) => { URL.revokeObjectURL(p[i].url); return p.filter((_, k) => k !== i); });
  }

  function validate(d: any) {
    if (d.title.length < 5) return 'Give your post a title of at least 5 characters.';
    if (d.description.length < 20) return 'Describe the work in at least 20 characters.';
    if (PHONE_IN_TEXT.test(`${d.title} ${d.description}`)) return 'Remove the phone number. Customers contact you through Fixam.';
    if (!photos.length) return 'Add at least one photo of the finished work.';
    if (d.starting_price !== '' && (!/^[0-9]+$/.test(d.starting_price) || Number(d.starting_price) > 10000000)) return 'Enter the starting price as a whole number of naira.';
    if (d.work_date && d.work_date > today()) return 'The work date cannot be in the future.';
    if (!d.areas.length) return 'Choose at least one area you cover.';
    if (!d.own_work) return 'Tick the box to confirm the photos show your own work.';
    return null;
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const d = collect(e.currentTarget);
    const problem = validate(d);
    setError(problem);
    if (problem) { window.scrollTo(0, 0); return; }
    setBusy(true);
    try {
      const postId = crypto.randomUUID();
      const paths = await Promise.all(photos.map(async (p, i) => {
        const path = `${postId}/${i + 1}.jpg`;
        const { error } = await sb().storage.from(BUCKET).upload(path, p.blob, { contentType: 'image/jpeg', upsert: false });
        if (error) throw new Error(`Photo ${i + 1} did not finish uploading: ${error.message}`);
        return path;
      }));
      await rpc('submit_my_work_post', {
        p_post_id: postId, p_title: d.title, p_trade: d.trade, p_description: d.description, p_photo_paths: paths,
        p_starting_price: d.starting_price === '' ? null : Number(d.starting_price), p_areas: d.areas,
        p_work_date: d.work_date || null, p_own_work: d.own_work, p_visibility: d.visibility,
      });
      setResult({ id: postId, title: d.title, visibility: d.visibility });
    } catch (err) {
      console.error(err);
      setError(friendlyError(err));
    } finally { setBusy(false); window.scrollTo(0, 0); }
  }

  function another() {
    photos.forEach((p) => URL.revokeObjectURL(p.url));
    setPhotos([]); setDraft(emptyDraft(artisan)); setResult(null); setError(null); setFormKey((k) => k + 1);
    window.scrollTo(0, 0);
  }

  let body: React.ReactNode;
  if (!session || artisan === undefined) body = <p className="sub">Loading…</p>;
  else if (!artisan || artisan.status !== 'approved') {
    body = <>
      <h1>Post your work</h1>
      <div className="card">
        <p>{artisan ? 'You can post work once Fixam has approved your application. You can follow its progress on your account page.' : 'We could not find an artisan application for this account.'}</p>
        <Link className="btn" href={artisan ? ROUTES.account : ROUTES.artisanSignup}>{artisan ? 'Go to my account' : 'Sign up as an artisan'}</Link>
      </div>
    </>;
  } else if (result) {
    const plan = PLANS.find((p) => p.id === result.visibility)!;
    body = <>
      <div className="done-mark" aria-hidden="true">✓</div>
      <h1>Sent for review, {artisan.first_name}</h1>
      <p className="sub">Fixam checks every post before customers see it. You will see “{result.title}” change to Live on your account page once it is approved.</p>
      {plan.price > 0 && <div className="note">You chose <b>{plan.label}</b>. Fixam will contact you for payment of <b>{naira(plan.price)}</b>. The Featured label starts when payment is confirmed.</div>}
      <div className="card"><h2>Post reference</h2><span className="ref">{result.id.slice(0, 8).toUpperCase()}</span></div>
      <div className="btns"><Link className="btn ghost" href={`${ROUTES.account}?msg=posted`}>My account</Link><button className="btn" type="button" onClick={another}>Post another job</button></div>
    </>;
  } else {
    const d = draft;
    body = <>
      <div className="card"><div className="card-head"><span><b>{artisan.first_name}</b> · {tradeLabel(artisan.trade)} · {artisan.base_area}</span>
        <Link className="linkbtn" href={ROUTES.account}>My account</Link></div></div>
      <h1>Post your work</h1>
      <form key={formKey} onSubmit={submit} noValidate>
        <label className="f" htmlFor="title">Title <span className="hint">5 to 60 characters</span>
          <input className="inp" id="title" name="title" maxLength={60} placeholder="Example: Kitchen sink and drain replacement" defaultValue={d.title} /></label>
        <label className="f" htmlFor="trade">Service<select className="inp" id="trade" name="trade" defaultValue={d.trade}>{TRADES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>
        <label className="f" htmlFor="description">What did you do? <span className="hint">The problem, the work, materials used and how long it took. 20 to 400 characters.</span>
          <textarea className="inp" id="description" name="description" maxLength={400} defaultValue={d.description} /></label>
        <div style={{ display: 'grid', gap: 8, fontSize: 14, fontWeight: 600 }}>
          <span>Photos <span className="hint">1 to {MAX_PHOTOS}. Before and after photos work best.</span></span>
          {photos.length > 0 && <div className="thumbs">{photos.map((p, i) => (
            <div className="thumb" key={p.url}><img src={p.url} alt={`Photo ${i + 1}`} />
              <button type="button" className="thumb-x" onClick={() => removePhoto(i)} aria-label={`Remove photo ${i + 1}`}>×</button></div>))}</div>}
          {photos.length < MAX_PHOTOS && <label className="addphoto" htmlFor="photos">+ Add photo
            <input id="photos" type="file" accept="image/jpeg,image/png,image/webp" multiple hidden onChange={(e) => addPhotos(e.currentTarget)} /></label>}
        </div>
        <div className="two">
          <label className="f" htmlFor="starting_price">Starting price <span className="hint">Optional, in naira</span>
            <input className="inp num" id="starting_price" name="starting_price" type="number" min={0} step={500} inputMode="numeric" defaultValue={d.starting_price} /></label>
          <label className="f" htmlFor="work_date">When was it done? <span className="hint">Optional</span>
            <input className="inp" id="work_date" name="work_date" type="date" max={today()} defaultValue={d.work_date} /></label>
        </div>
        <fieldset className="fs"><legend>Areas you cover for this work</legend>
          <div className="chips">{AREAS.map((x, i) => (
            <label className="chip" htmlFor={`area-${i}`} key={x}><input type="checkbox" id={`area-${i}`} name="areas" value={x} defaultChecked={d.areas.includes(x)} />{x}</label>))}</div>
        </fieldset>
        <fieldset className="fs"><legend>Visibility</legend>
          {PLANS.map((p) => (
            <label className="radio" htmlFor={`plan-${p.id}`} key={p.id}><input type="radio" id={`plan-${p.id}`} name="visibility" value={p.id} defaultChecked={d.visibility === p.id} />
              <span><b>{p.label}</b>{p.price > 0 && <> · <span className="num">{naira(p.price)}</span></>}<br /><span className="sub">{p.text}</span></span></label>))}
        </fieldset>
        <label className="consent" htmlFor="own_work"><input type="checkbox" id="own_work" name="own_work" defaultChecked={d.own_work} />
          <span>These photos show work I did myself. I understand Fixam removes posts with copied photos, phone numbers, or requests for payment outside Fixam.</span></label>
        <div className="btns"><button className="btn" type="submit" disabled={busy}>{busy ? 'Uploading…' : 'Send for review'}</button></div>
      </form>
    </>;
  }

  return (
    <Shell>
      <Header>{session && <SignedInLinks />}</Header>
      <Notice error={error} />
      {body}
    </Shell>
  );
}
