'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { sb } from '@/lib/supabase';
import { ROUTES, HOME_FOR_ROLE, MIN_PASSWORD, authError, myRole } from '@/lib/common';
import { Header, Shell, Notice, PasswordInput, useRequiredSession } from '@/components/ui';

export default function ChangePassword() {
  const session = useRequiredSession(ROUTES.password);
  const [back, setBack] = useState<string>(ROUTES.home);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (session) myRole().then((r) => setBack(HOME_FOR_ROLE[r || ''] || ROUTES.home)).catch(() => {});
  }, [session]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const fd = new FormData(e.currentTarget);
    const p = String(fd.get('password') || ''), p2 = String(fd.get('password2') || '');
    if (p.length < MIN_PASSWORD) return setError(`Your new password must have at least ${MIN_PASSWORD} characters.`);
    if (p !== p2) return setError('The two passwords do not match.');
    setBusy(true); setError(null);
    const { error } = await sb().auth.updateUser({ password: p });
    setBusy(false);
    if (error) setError(/same|different from the old/i.test(error.message) ? 'Choose a password different from your current one.' : authError(error));
    else setDone(true);
  }

  return (
    <Shell>
      <Header><Link className="linkbtn" href={back}>Back</Link></Header>
      {!session ? <p className="sub">Loading…</p> : done ? <>
        <div className="done-mark" aria-hidden="true">✓</div>
        <h1>Password changed</h1>
        <p className="sub">Use your new password next time you sign in.</p>
        <Link className="btn" href={back}>Continue</Link>
      </> : <>
        <h1>Change your password</h1>
        <p className="sub">Signed in as {session.user.email}</p>
        <Notice error={error} />
        <form onSubmit={submit} noValidate>
          <label className="f" htmlFor="password">New password <span className="hint">At least {MIN_PASSWORD} characters. Do not reuse a password you have shared.</span>
            <PasswordInput id="password" name="password" autoComplete="new-password" /></label>
          <label className="f" htmlFor="password2">Type it again
            <input className="inp" id="password2" name="password2" type="password" autoComplete="new-password" /></label>
          <div className="btns"><button className="btn" type="submit" disabled={busy}>{busy ? 'Saving…' : 'Save new password'}</button></div>
        </form>
      </>}
    </Shell>
  );
}
