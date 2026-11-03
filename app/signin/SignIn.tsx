'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { sb } from '@/lib/supabase';
import { ROUTES, EMAIL_RE, MIN_PASSWORD, authError, absoluteUrl, hardGo, myRole, queryParam } from '@/lib/common';
import { Header, Shell, Notice, PasswordInput } from '@/components/ui';

type View = 'loading' | 'signin' | 'forgot' | 'sent' | 'reset' | 'confirm';

// Pages each kind of user may be sent back to after signing in
const NEXT_FOR_ROLE: Record<string, string[]> = {
  artisan: [ROUTES.account, ROUTES.post, ROUTES.password],
  customer: [ROUTES.customer, ROUTES.password],
  admin: [ROUTES.admin, ROUTES.password],
};

// After signing in: back to the page that asked for sign-in, otherwise the home page
async function goHome() {
  const next = queryParam('next') || '';
  if (next) {
    let role: string | null = null;
    try { role = await myRole(); } catch (e) { console.error(e); }
    if (role && (NEXT_FOR_ROLE[role] || []).includes(next)) return hardGo(next);
  }
  hardGo(`${ROUTES.home}?msg=signedin`);
}

export default function SignIn() {
  const [view, setView] = useState<View>('loading');
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fromReset = useRef(false);

  const go = (v: View) => { setView(v); setError(null); setInfo(null); };

  useEffect(() => {
    // Arriving from an email link: Supabase reads the token in the address and fires an event
    fromReset.current = /type=recovery/.test(window.location.hash);
    const { data: sub } = sb().auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') { fromReset.current = true; go('reset'); return; }
      if (session && event === 'SIGNED_IN' && !fromReset.current) goHome();
    });
    const hashErr = new URLSearchParams(window.location.hash.slice(1)).get('error_description');
    if (hashErr) setError(/expired|invalid/i.test(hashErr) ? 'That email link has expired or was already used. Sign in, or ask for a new link.' : hashErr.replace(/\+/g, ' '));
    if (fromReset.current) setView('reset');
    else sb().auth.getSession().then(({ data }) => { if (data.session) goHome(); else setView('signin'); });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const kind = e.currentTarget.dataset.form;
    const fd = new FormData(e.currentTarget);
    const em = String(fd.get('email') ?? email).trim().toLowerCase();
    if (fd.has('email')) setEmail(em);
    setError(null); setInfo(null);

    if ((kind === 'signin' || kind === 'forgot') && !EMAIL_RE.test(em)) return setError('Enter your email address.');
    if (kind === 'signin' && !fd.get('password')) return setError('Enter your password.');
    if (kind === 'reset') {
      const p = String(fd.get('password') || ''), p2 = String(fd.get('password2') || '');
      if (p.length < MIN_PASSWORD) return setError(`Your new password must have at least ${MIN_PASSWORD} characters.`);
      if (p !== p2) return setError('The two passwords do not match.');
    }

    setBusy(true);
    try {
      if (kind === 'signin') {
        const { error } = await sb().auth.signInWithPassword({ email: em, password: String(fd.get('password')) });
        if (error) throw error;
        await goHome();
        return;
      }
      if (kind === 'resend') {
        const { error } = await sb().auth.resend({ type: 'signup', email: em, options: { emailRedirectTo: absoluteUrl(ROUTES.signin) } });
        if (error) throw error;
        setInfo('Link sent. Check your inbox and spam folder.');
      }
      if (kind === 'forgot') {
        const { error } = await sb().auth.resetPasswordForEmail(em, { redirectTo: absoluteUrl(ROUTES.signin) });
        if (error) throw error;
        setView('sent');
      }
      if (kind === 'reset') {
        const { error } = await sb().auth.updateUser({ password: String(fd.get('password')) });
        if (error) throw error;
        fromReset.current = false;
        await goHome();
        return;
      }
    } catch (err) {
      console.error(err);
      const m = authError(err);
      if (m === 'CONFIRM_EMAIL') setView('confirm'); else setError(m);
    } finally {
      setBusy(false);
    }
  }

  const btn = (label: string, busyLabel: string) => (
    <div className="btns"><button className="btn" type="submit" disabled={busy}>{busy ? busyLabel : label}</button></div>
  );
  const back = <p className="sub"><button type="button" className="textbtn" onClick={() => go('signin')}>Back to sign in</button></p>;

  return (
    <Shell>
      <Header />
      <Notice error={error} info={info} />
      {view === 'loading' && <p className="sub">Loading…</p>}

      {view === 'signin' && <>
        <h1>Sign in</h1>
        <p className="sub">For customers, artisans and Fixam staff. Use the email and password you chose when you signed up.</p>
        <form data-form="signin" onSubmit={submit} noValidate>
          <label className="f" htmlFor="email">Email
            <input className="inp" id="email" name="email" type="email" autoComplete="email" inputMode="email" defaultValue={email} autoFocus /></label>
          <label className="f" htmlFor="password">Password
            <PasswordInput id="password" name="password" autoComplete="current-password" /></label>
          {btn('Sign in', 'Signing in…')}
        </form>
        <p className="sub"><button type="button" className="textbtn" onClick={() => go('forgot')}>Forgot your password?</button></p>
        <div className="divider" />
        <p className="sub">New to Fixam? <Link href={ROUTES.customerSignup}>Create a customer account</Link> or <Link href={ROUTES.artisanSignup}>join as an artisan</Link>. Both are free.</p>
      </>}

      {view === 'confirm' && <>
        <h1>Confirm your email</h1>
        <p className="sub">We sent a link to <b>{email}</b> when you signed up. Open it to confirm your email, then sign in. Check your spam folder if you cannot find it.</p>
        <form data-form="resend" onSubmit={submit} noValidate>{btn('Send the link again', 'Sending…')}</form>
        {back}
      </>}

      {view === 'forgot' && <>
        <h1>Reset your password</h1>
        <p className="sub">Enter the email you signed up with. We will send you a link to choose a new password.</p>
        <form data-form="forgot" onSubmit={submit} noValidate>
          <label className="f" htmlFor="email">Email
            <input className="inp" id="email" name="email" type="email" autoComplete="email" inputMode="email" defaultValue={email} autoFocus /></label>
          {btn('Send reset link', 'Sending…')}
        </form>
        {back}
      </>}

      {view === 'sent' && <>
        <div className="done-mark" aria-hidden="true">✓</div>
        <h1>Check your email</h1>
        <p className="sub">If <b>{email}</b> has a Fixam account, a reset link is on its way. It works once. Check your spam folder if it does not arrive in a few minutes.</p>
        {back}
      </>}

      {view === 'reset' && <>
        <h1>Choose a new password</h1>
        <form data-form="reset" onSubmit={submit} noValidate>
          <label className="f" htmlFor="password">New password <span className="hint">At least {MIN_PASSWORD} characters</span>
            <PasswordInput id="password" name="password" autoComplete="new-password" /></label>
          <label className="f" htmlFor="password2">Type it again
            <input className="inp" id="password2" name="password2" type="password" autoComplete="new-password" /></label>
          {btn('Save new password', 'Saving…')}
        </form>
      </>}
    </Shell>
  );
}
