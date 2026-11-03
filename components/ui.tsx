'use client';

import Link from 'next/link';
import { useEffect, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { sb } from '@/lib/supabase';
import { ROUTES, hardGo } from '@/lib/common';

export function Header({ children }: { children?: ReactNode }) {
  return (
    <div className="top">
      <Link className="logo" href={ROUTES.home} style={{ color: 'inherit', textDecoration: 'none' }}><i />Fixam</Link>
      {children}
    </div>
  );
}

export function SignedInLinks() {
  return (
    <span className="toplinks">
      <Link className="linkbtn" href={ROUTES.password}>Change password</Link>
      <button className="linkbtn" onClick={signOut}>Sign out</button>
    </span>
  );
}

export async function signOut() {
  await sb().auth.signOut();
  hardGo(`${ROUTES.home}?msg=signedout`);
}

export function Notice({ error, info }: { error?: string | null; info?: string | null }) {
  return (
    <>
      {error && <div className="err" role="alert">{error}</div>}
      {info && <div className="ok" role="status">{info}</div>}
    </>
  );
}

export const Shell = ({ wide, children }: { wide?: boolean; children: ReactNode }) => (
  <main className={wide ? 'shell wide' : 'shell'} aria-live="polite">{children}</main>
);

// Returns the session once known. Sends signed-out visitors to sign-in, then back here.
export function useRequiredSession(returnTo: string) {
  const [session, setSession] = useState<Session | null>(null);
  useEffect(() => {
    let alive = true;
    sb().auth.getSession().then(({ data }) => {
      if (!alive) return;
      if (data.session) setSession(data.session);
      else hardGo(`${ROUTES.signin}?next=${encodeURIComponent(returnTo)}`);
    });
    const { data: sub } = sb().auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') hardGo(`${ROUTES.home}?msg=signedout`);
    });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, [returnTo]);
  return session;
}

export function PasswordInput(props: { id: string; name: string; autoComplete: string }) {
  const [show, setShow] = useState(false);
  return (
    <span className="pw">
      <input className="inp" type={show ? 'text' : 'password'} {...props} />
      <button type="button" className="pw-toggle" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'}>{show ? 'Hide' : 'Show'}</button>
    </span>
  );
}
