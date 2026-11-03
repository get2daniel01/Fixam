'use client';

import Link from 'next/link';
import { useState } from 'react';
import { sb } from '@/lib/supabase';
import { ROUTES, AREAS, PHONE_RE, EMAIL_RE, MIN_PASSWORD, authError, absoluteUrl, hardGo } from '@/lib/common';
import { Header, Shell, Notice } from '@/components/ui';

export default function CustomerSignup() {
  const [d, setD] = useState({ full_name: '', phone: '', email: '', area: 'Jimeta' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<null | 'sent' | 'exists'>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const fd = new FormData(e.currentTarget);
    const next = {
      full_name: String(fd.get('full_name') || '').trim(), phone: String(fd.get('phone') || '').trim(),
      area: String(fd.get('area')), email: String(fd.get('email') || '').trim().toLowerCase(),
    };
    setD(next);
    const pw = String(fd.get('password') || ''), pw2 = String(fd.get('password2') || '');
    const problem =
      next.full_name.length < 3 ? 'Enter your full name.' :
      !PHONE_RE.test(next.phone) ? 'Enter an 11-digit Nigerian phone number, for example 08031234567.' :
      !EMAIL_RE.test(next.email) ? 'Enter your email address.' :
      pw.length < MIN_PASSWORD ? `Your password must have at least ${MIN_PASSWORD} characters.` :
      pw !== pw2 ? 'The two passwords do not match.' : null;
    setError(problem);
    if (problem) { window.scrollTo(0, 0); return; }

    setBusy(true);
    try {
      const { data, error } = await sb().auth.signUp({
        email: next.email, password: pw,
        options: { emailRedirectTo: absoluteUrl(ROUTES.signin), data: { role: 'customer', full_name: next.full_name, phone: next.phone, area: next.area } },
      });
      if (error) {
        if (/already registered|already exists/i.test(error.message)) setDone('exists');
        else throw error;
      } else {
        const exists = !!data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0;
        if (data.session && !exists) { hardGo(ROUTES.customer); return; } // email confirmation switched off
        setDone(exists ? 'exists' : 'sent');
      }
    } catch (err) {
      console.error(err);
      const m = authError(err);
      setError(m === 'CONFIRM_EMAIL' ? 'Confirm your email first.' : m);
    } finally {
      setBusy(false); window.scrollTo(0, 0);
    }
  }

  return (
    <Shell>
      <Header><Link className="linkbtn" href={ROUTES.signin}>Sign in</Link></Header>
      {done ? <>
        <div className="done-mark" aria-hidden="true">✓</div>
        <h1>{done === 'exists' ? 'You already have an account' : 'Check your email'}</h1>
        <p className="sub">{done === 'exists'
          ? <>There is already a Fixam account for <b>{d.email}</b>. Sign in with it, or use “Forgot your password?” on the sign-in page.</>
          : <>We sent a link to <b>{d.email}</b>. Open it to confirm your email, then sign in to find artisans near you. Check your spam folder if you cannot find it.</>}</p>
        <Link className="btn" href={ROUTES.signin}>Go to sign in</Link>
      </> : <>
        <h1>Create your customer account</h1>
        <p className="sub">Find verified artisans near you, book them and pay safely through Fixam.</p>
        <Notice error={error} />
        <form onSubmit={submit} noValidate>
          <label className="f" htmlFor="full_name">Full name<input className="inp" id="full_name" name="full_name" autoComplete="name" defaultValue={d.full_name} /></label>
          <label className="f" htmlFor="phone">Phone number <span className="hint">Shared with an artisan only after you pay for a job</span>
            <input className="inp num" id="phone" name="phone" type="tel" inputMode="numeric" maxLength={11} placeholder="08031234567" autoComplete="tel" defaultValue={d.phone} /></label>
          <label className="f" htmlFor="area">Your area <span className="hint">We show artisans who work here first</span>
            <select className="inp" id="area" name="area" defaultValue={d.area}>{AREAS.map((a) => <option key={a}>{a}</option>)}</select></label>
          <label className="f" htmlFor="email">Email<input className="inp" id="email" name="email" type="email" inputMode="email" autoComplete="email" defaultValue={d.email} /></label>
          <label className="f" htmlFor="password">Password <span className="hint">At least {MIN_PASSWORD} characters</span>
            <input className="inp" id="password" name="password" type="password" autoComplete="new-password" /></label>
          <label className="f" htmlFor="password2">Type the password again<input className="inp" id="password2" name="password2" type="password" autoComplete="new-password" /></label>
          <div className="btns"><button className="btn" type="submit" disabled={busy}>{busy ? 'Creating account…' : 'Create account'}</button></div>
        </form>
        <p className="sub">Are you an artisan? <Link href={ROUTES.artisanSignup}>Join Fixam as an artisan</Link> instead.</p>
      </>}
    </Shell>
  );
}
