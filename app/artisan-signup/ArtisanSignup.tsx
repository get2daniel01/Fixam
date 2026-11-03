'use client';

import Link from 'next/link';
import { Fragment, useState } from 'react';
import { sb } from '@/lib/supabase';
import { ROUTES, TRADES, AREAS, PHONE_RE, EMAIL_RE, MIN_PASSWORD, tradeLabel, authError, absoluteUrl } from '@/lib/common';
import { Header, Shell, Notice } from '@/components/ui';

/* Options: must match the checks in supabase/migrations (001_artisan_signups.sql) */
const RADIUS = ['Up to 3 km', 'Up to 5 km', 'Up to 10 km', 'Anywhere in Yola'];
const ID_TYPES = ['NIN slip or National ID card', "Voter's card", "Driver's licence", 'International passport'];
const RELATIONSHIPS = ['Family member', 'Former master or employer', 'Community or religious leader', 'Trade association official', 'Other'];
const BANKS = ['Access Bank', 'Fidelity Bank', 'First Bank', 'GTBank', 'Jaiz Bank', 'Keystone Bank', 'Moniepoint', 'OPay', 'PalmPay', 'UBA', 'Union Bank', 'Zenith Bank'];
const STEPS = ['About you', 'Your trade', 'Identity check', 'Guarantor and payout', 'Review'];
const BUCKET = 'kyc-documents';
const MAX_FILE_BYTES = 5 * 1024 * 1024; // matches the bucket limit
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'application/pdf'];

type Files = { certificate: File | null; id_document: File | null; selfie: File | null };
const mask = (s?: string, keep = 4) => (s ? '•'.repeat(Math.max(0, s.length - keep)) + s.slice(-keep) : '');

function checkFile(file: File) {
  if (file.size > MAX_FILE_BYTES) return `${file.name} is larger than 5 MB. Take a smaller photo or reduce its size.`;
  if (file.type && !ALLOWED_TYPES.includes(file.type)) return `${file.name} is not a supported file. Use a JPG, PNG, WEBP, HEIC photo or a PDF.`;
  return null;
}
const extOf = (file: File) => {
  const fromName = (file.name.split('.').pop() || '').toLowerCase();
  return /^[a-z0-9]{2,5}$/.test(fromName) ? fromName : file.type === 'application/pdf' ? 'pdf' : 'jpg';
};

function friendlyError(err: any) {
  const msg = err?.message || '';
  if (err?.stage === 'account') return authError(err) === 'CONFIRM_EMAIL' ? 'Confirm your email first.' : authError(err);
  if (/email_active/.test(msg)) return 'An application with this email is already being reviewed. Sign in to follow it.';
  if (err?.code === '23505' || /duplicate key/.test(msg)) return 'An application with this phone number is already being reviewed. Call Fixam if you need to change it.';
  if (/at least 18/.test(msg)) return 'You must be 18 or older to join Fixam.';
  if (/Guarantor phone/.test(msg)) return 'Your guarantor must have a different phone number from yours.';
  if (/Consent/.test(msg)) return 'Tick the box to agree to the identity and guarantor checks.';
  if (/Failed to fetch|NetworkError|network/i.test(msg)) return 'No internet connection. Check your data or Wi-Fi and press Submit again.';
  if (err?.stage === 'upload') return `A photo could not be uploaded (${msg}). Try a smaller photo and submit again.`;
  return `Your application could not be sent (${msg || 'unknown error'}). Please try again.`;
}

export default function ArtisanSignup() {
  const [step, setStep] = useState(1);
  const [data, setData] = useState<Record<string, any>>({
    trade: 'plumbing', base_area: 'Jimeta', travel_radius: 'Up to 5 km', id_type: ID_TYPES[0],
    guarantor_relationship: RELATIONSHIPS[0], bank_name: 'GTBank', consent_given: false,
  });
  const [password, setPassword] = useState('');
  const [files, setFiles] = useState<Files>({ certificate: null, id_document: null, selfie: null });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ reference: string; accountExisted: boolean } | null>(null);

  const top = () => window.scrollTo(0, 0);

  function onFile(key: keyof Files, input: HTMLInputElement) {
    const file = input.files?.[0];
    if (!file) return;
    const problem = checkFile(file);
    if (problem) { setError(problem); input.value = ''; return; }
    setError(null);
    setFiles((f) => ({ ...f, [key]: file }));
  }

  function validate(d: Record<string, any>, pw: string, pw2: string): string | null {
    switch (step) {
      case 1:
        if (!d.full_name || d.full_name.length < 3) return 'Enter your full name.';
        if (!PHONE_RE.test(d.phone || '')) return 'Enter an 11-digit Nigerian phone number, for example 08031234567.';
        if (!EMAIL_RE.test(d.email || '')) return 'Enter your email address. You will use it to sign in.';
        if (pw.length < MIN_PASSWORD) return `Your password must have at least ${MIN_PASSWORD} characters.`;
        if (pw !== pw2) return 'The two passwords do not match.';
        return null;
      case 2: {
        const y = Number(d.years_experience);
        if (d.years_experience === '' || !Number.isInteger(y) || y < 0 || y > 60) return 'Enter your years of experience as a whole number.';
        if (!d.bio || d.bio.length < 10) return 'Describe your work in at least 10 characters.';
        return null;
      }
      case 3: {
        if (!/^[0-9]{11}$/.test(d.nin || '')) return 'Your NIN must be exactly 11 digits.';
        if (!d.date_of_birth) return 'Enter your date of birth.';
        const limit = new Date(); limit.setFullYear(limit.getFullYear() - 18);
        if (new Date(d.date_of_birth) > limit) return 'You must be 18 or older to join Fixam.';
        if (!files.id_document) return 'Add a photo of your ID document.';
        if (!files.selfie) return 'Add a clear photo of your face.';
        if (!d.home_address || d.home_address.length < 5) return 'Enter your home address.';
        return null;
      }
      case 4:
        if (!d.guarantor_name || d.guarantor_name.length < 3) return "Enter your guarantor's full name.";
        if (!PHONE_RE.test(d.guarantor_phone || '')) return "Enter your guarantor's 11-digit phone number.";
        if (d.guarantor_phone === d.phone) return 'Your guarantor must have a different phone number from yours.';
        if (!/^[0-9]{10}$/.test(d.account_number || '')) return 'Account numbers have 10 digits.';
        if (!d.consent_given) return 'Tick the box to agree to the identity and guarantor checks.';
        return null;
    }
    return null;
  }

  async function createAccount(d: Record<string, any>) {
    const { data: res, error } = await sb().auth.signUp({
      email: d.email, password,
      options: { emailRedirectTo: absoluteUrl(ROUTES.signin), data: { role: 'artisan', full_name: d.full_name, phone: d.phone } },
    });
    if (error) {
      if (/already registered|already exists/i.test(error.message)) return true;
      throw Object.assign(new Error(error.message), { stage: 'account' });
    }
    // With email confirmation on, an existing email comes back with no identities
    const existed = !!res.user && Array.isArray(res.user.identities) && res.user.identities.length === 0;
    // Stay signed out until the email is confirmed, so every application is saved the same way
    if (res.session) await sb().auth.signOut();
    return existed;
  }

  async function upload(appId: string, key: string, file: File) {
    const path = `${appId}/${key}.${extOf(file)}`;
    const { error } = await sb().storage.from(BUCKET).upload(path, file, { upsert: false, contentType: file.type || undefined });
    if (error) throw Object.assign(new Error(error.message), { stage: 'upload' });
    return path;
  }

  async function submitApplication(d: Record<string, any>) {
    const accountExisted = await createAccount(d);
    const appId = crypto.randomUUID();
    const [idPath, selfiePath, certPath] = await Promise.all([
      upload(appId, 'id-document', files.id_document!),
      upload(appId, 'selfie', files.selfie!),
      files.certificate ? upload(appId, 'certificate', files.certificate) : Promise.resolve(null),
    ]);
    // No .select() after insert: the public key may add applications but never read them back
    const { error } = await sb().from('artisan_signups').insert({
      id: appId, full_name: d.full_name, phone: d.phone, email: d.email, trade: d.trade,
      years_experience: Number(d.years_experience), base_area: d.base_area, travel_radius: d.travel_radius, bio: d.bio,
      certificate_path: certPath, nin: d.nin, date_of_birth: d.date_of_birth, id_type: d.id_type,
      id_document_path: idPath, selfie_path: selfiePath, home_address: d.home_address,
      guarantor_name: d.guarantor_name, guarantor_phone: d.guarantor_phone, guarantor_relationship: d.guarantor_relationship,
      bank_name: d.bank_name, account_number: d.account_number, consent_given: d.consent_given === true,
    });
    if (error) throw error;
    return { reference: appId.slice(0, 8).toUpperCase(), accountExisted };
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const fd = new FormData(e.currentTarget);
    const d = { ...data };
    let pw = password, pw2 = password;
    for (const [k, v] of fd.entries()) {
      if (typeof v !== 'string') continue;
      if (k === 'password') pw = v; else if (k === 'password2') pw2 = v; else d[k] = v.trim();
    }
    if (step === 1) d.email = (d.email || '').toLowerCase();
    if (step === 4) d.consent_given = fd.has('consent_given');
    setData(d);
    if (step === 1) setPassword(pw);

    const problem = validate(d, pw, pw2);
    if (problem) { setError(problem); top(); return; }
    setError(null);
    if (step < 5) { setStep(step + 1); top(); return; }

    setBusy(true);
    try {
      setDone(await submitApplication(d));
      setPassword('');
    } catch (err) {
      console.error(err);
      setError(friendlyError(err));
    } finally {
      setBusy(false); top();
    }
  }

  const goBack = () => { setStep(step - 1); setError(null); top(); };
  const opts = (list: (string | [string, string])[]) => list.map((o) => {
    const [v, l] = Array.isArray(o) ? o : [o, o];
    return <option key={v} value={v}>{l}</option>;
  });
  const chosen = (key: keyof Files) => files[key] && <span className="uploaded">✓ {files[key]!.name} selected</span>;

  if (done) {
    return (
      <Shell>
        <Header />
        <div className="done-mark" aria-hidden="true">✓</div>
        <h1>Application received, {String(data.full_name).split(' ')[0]}</h1>
        <p className="sub">Fixam will check your NIN, call your guarantor and contact you on {data.phone} to arrange a short skill assessment.</p>
        <div className="card">
          <h2>Next: confirm your email</h2>
          <p>{done.accountExisted
            ? <>There is already a Fixam account for <b>{data.email}</b>. Sign in with it to follow your application.</>
            : <>We sent a link to <b>{data.email}</b>. Open it to confirm your email, then sign in to follow your application. Check your spam folder if you cannot find it.</>}</p>
          <Link className="btn" href={ROUTES.signin}>Go to sign in</Link>
        </div>
        <div className="card">
          <h2>Your reference</h2>
          <span className="ref">{done.reference}</span>
          <span className="sub">Quote this if you call Fixam about your application.</span>
        </div>
      </Shell>
    );
  }

  const d = data;
  return (
    <Shell>
      <Header><Link className="linkbtn" href={ROUTES.signin}>Sign in</Link></Header>
      <div style={{ display: 'grid', gap: 6 }}>
        <span className="eyebrow">Step {step} of 5 · {STEPS[step - 1]}</span>
        <div className="progress"><i style={{ width: `${(step / 5) * 100}%` }} /></div>
      </div>
      <Notice error={error} />
      <form key={step} onSubmit={onSubmit} noValidate>
        {step === 1 && <>
          <h1>Join Fixam as an artisan</h1>
          <p className="sub">Sign-up is free and takes about 10 minutes. Have your NIN, a photo of your ID card and your guarantor&apos;s phone number ready.</p>
          <label className="f" htmlFor="full_name">Full name <span className="hint">As it appears on your NIN</span>
            <input className="inp" id="full_name" name="full_name" autoComplete="name" defaultValue={d.full_name} /></label>
          <label className="f" htmlFor="phone">Phone number
            <input className="inp num" id="phone" name="phone" type="tel" inputMode="numeric" maxLength={11} placeholder="08031234567" defaultValue={d.phone} /></label>
          <div className="divider" />
          <h2>Your Fixam account</h2>
          <p className="sub">You will use this email and password to sign in, follow your application and post your work.</p>
          <label className="f" htmlFor="email">Email<input className="inp" id="email" name="email" type="email" inputMode="email" autoComplete="email" defaultValue={d.email} /></label>
          <label className="f" htmlFor="password">Password <span className="hint">At least {MIN_PASSWORD} characters</span>
            <input className="inp" id="password" name="password" type="password" autoComplete="new-password" defaultValue={password} /></label>
          <label className="f" htmlFor="password2">Type the password again
            <input className="inp" id="password2" name="password2" type="password" autoComplete="new-password" defaultValue={password} /></label>
          <p className="sub">Already have an account? <Link href={ROUTES.signin}>Sign in</Link>.</p>
        </>}

        {step === 2 && <>
          <h1>Your trade</h1>
          <label className="f" htmlFor="trade">Main service<select className="inp" id="trade" name="trade" defaultValue={d.trade}>{opts(TRADES)}</select></label>
          <div className="two">
            <label className="f" htmlFor="years_experience">Years of experience
              <input className="inp num" id="years_experience" name="years_experience" type="number" min={0} max={60} inputMode="numeric" defaultValue={d.years_experience} /></label>
            <label className="f" htmlFor="travel_radius">Travel distance<select className="inp" id="travel_radius" name="travel_radius" defaultValue={d.travel_radius}>{opts(RADIUS)}</select></label>
          </div>
          <label className="f" htmlFor="base_area">Where you are based<select className="inp" id="base_area" name="base_area" defaultValue={d.base_area}>{opts(AREAS)}</select></label>
          <label className="f" htmlFor="bio">Describe your work <span className="hint">Customers see this on your profile. 10 to 300 characters.</span>
            <textarea className="inp" id="bio" name="bio" maxLength={300} placeholder="Example: House wiring, sockets, changeover switches and solar connections." defaultValue={d.bio} /></label>
          <label className="f" htmlFor="certificate">Trade certificate or association card <span className="hint">Optional. Photo or PDF, up to 5 MB.</span>
            <input className="inp" id="certificate" type="file" accept="image/*,application/pdf" onChange={(e) => onFile('certificate', e.currentTarget)} /></label>
          {chosen('certificate')}
        </>}

        {step === 3 && <>
          <h1>Identity check</h1>
          <p className="note">Fixam checks your NIN before approving you. Customers never see your NIN, ID card or address.</p>
          <label className="f" htmlFor="nin">NIN <span className="hint">11 digits</span>
            <input className="inp num" id="nin" name="nin" inputMode="numeric" maxLength={11} autoComplete="off" defaultValue={d.nin} /></label>
          <label className="f" htmlFor="date_of_birth">Date of birth<input className="inp" id="date_of_birth" name="date_of_birth" type="date" defaultValue={d.date_of_birth} /></label>
          <label className="f" htmlFor="id_type">ID document<select className="inp" id="id_type" name="id_type" defaultValue={d.id_type}>{opts(ID_TYPES)}</select></label>
          <label className="f" htmlFor="id_document">Photo of the ID document <span className="hint">Photo or PDF, up to 5 MB</span>
            <input className="inp" id="id_document" type="file" accept="image/*,application/pdf" onChange={(e) => onFile('id_document', e.currentTarget)} /></label>
          {chosen('id_document')}
          <label className="f" htmlFor="selfie">A clear photo of your face <span className="hint">No cap or sunglasses. We compare it with your NIN photo.</span>
            <input className="inp" id="selfie" type="file" accept="image/*" capture="user" onChange={(e) => onFile('selfie', e.currentTarget)} /></label>
          {chosen('selfie')}
          <label className="f" htmlFor="home_address">Home address<textarea className="inp" id="home_address" name="home_address" placeholder="House number, street, area" defaultValue={d.home_address} /></label>
        </>}

        {step === 4 && <>
          <h1>Guarantor and payout</h1>
          <p className="sub">Your guarantor is someone who knows you well and can vouch for you. Fixam will call them to confirm.</p>
          <label className="f" htmlFor="guarantor_name">Guarantor&apos;s full name<input className="inp" id="guarantor_name" name="guarantor_name" defaultValue={d.guarantor_name} /></label>
          <label className="f" htmlFor="guarantor_phone">Guarantor&apos;s phone<input className="inp num" id="guarantor_phone" name="guarantor_phone" type="tel" inputMode="numeric" maxLength={11} defaultValue={d.guarantor_phone} /></label>
          <label className="f" htmlFor="guarantor_relationship">How do they know you?<select className="inp" id="guarantor_relationship" name="guarantor_relationship" defaultValue={d.guarantor_relationship}>{opts(RELATIONSHIPS)}</select></label>
          <div className="divider" />
          <label className="f" htmlFor="bank_name">Bank for payouts<select className="inp" id="bank_name" name="bank_name" defaultValue={d.bank_name}>{opts(BANKS)}</select></label>
          <label className="f" htmlFor="account_number">Account number <span className="hint">10 digits, in your own name</span>
            <input className="inp num" id="account_number" name="account_number" inputMode="numeric" maxLength={10} defaultValue={d.account_number} /></label>
          <label className="consent" htmlFor="consent_given"><input type="checkbox" id="consent_given" name="consent_given" defaultChecked={d.consent_given} />
            <span>I agree that Fixam can verify my identity, contact my guarantor and store my details as set out in the Fixam privacy policy and the Nigeria Data Protection Act 2023.</span></label>
        </>}

        {step === 5 && <>
          <h1>Check your details</h1>
          {([
            [1, [['Name', d.full_name], ['Phone', d.phone], ['Email', d.email]]],
            [2, [['Service', tradeLabel(d.trade)], ['Experience', `${d.years_experience} years`], ['Based in', d.base_area], ['Travel', d.travel_radius], ['Certificate', files.certificate?.name || 'Not added']]],
            [3, [['NIN', mask(d.nin)], ['Date of birth', d.date_of_birth], ['ID document', d.id_type], ['ID photo', files.id_document?.name], ['Face photo', files.selfie?.name]]],
            [4, [['Guarantor', d.guarantor_name], ['Guarantor phone', d.guarantor_phone], ['Relationship', d.guarantor_relationship], ['Payout', `${d.bank_name} ${mask(d.account_number)}`]]],
          ] as [number, [string, string][]][]).map(([n, rows]) => (
            <div className="card" key={n}>
              <div className="card-head"><h2>{STEPS[n - 1]}</h2><button type="button" className="linkbtn" onClick={() => { setStep(n); setError(null); top(); }}>Edit</button></div>
              <dl className="kv">{rows.map(([k, v]) => <Fragment key={k}><dt>{k}</dt><dd>{v || '–'}</dd></Fragment>)}</dl>
            </div>
          ))}
          <p className="note">After you submit, Fixam checks your NIN, calls your guarantor and invites you for a short skill assessment.</p>
        </>}

        <div className="btns">
          {step > 1 && <button type="button" className="btn ghost" onClick={goBack}>Back</button>}
          <button className="btn" type="submit" disabled={busy}>{busy ? 'Sending…' : step === 5 ? 'Submit application' : 'Continue'}</button>
        </div>
      </form>
    </Shell>
  );
}
