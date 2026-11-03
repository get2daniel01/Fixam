'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { sb } from '@/lib/supabase';
import { ROUTES, HOME_FOR_ROLE, myRole, queryParam } from '@/lib/common';
import { Header, Shell, Notice, signOut } from '@/components/ui';

// Button label for each kind of account
const AREA_LABEL: Record<string, string> = {
  admin: 'Go to the admin page',
  artisan: 'Go to my artisan account',
  customer: 'Find an artisan',
};

type Me = { email: string; role: string | null; home: string };

export default function Home() {
  const [me, setMe] = useState<Me | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  useEffect(() => {
    const msg = queryParam('msg');
    if (msg === 'signedout') setInfo('You have signed out.');
    if (msg) window.history.replaceState(null, '', window.location.pathname);

    sb().auth.getSession().then(async ({ data }) => {
      if (!data.session) return;
      let role: string | null = null;
      try { role = await myRole(); } catch { /* show the generic signed-in view */ }
      setMe({ email: data.session.user.email || '', role, home: HOME_FOR_ROLE[role || ''] || ROUTES.customer });
      if (msg === 'signedin') setInfo('You are signed in.');
    });
  }, []);

  return (
    <Shell>
      <Header>
        {me
          ? <button className="linkbtn" onClick={signOut}>Sign out</button>
          : <Link className="linkbtn" href={ROUTES.signin}>Sign in</Link>}
      </Header>
      <Notice info={info} />

      {me && (
        <div className="card">
          <h2>Welcome back</h2>
          <p className="sub">Signed in as {me.email}</p>
          <Link className="btn" href={me.home}>{AREA_LABEL[me.role || ''] || 'Go to my account'}</Link>
          <Link className="linkbtn" href={ROUTES.password} style={{ justifySelf: 'start', alignSelf: 'flex-start' }}>Change password</Link>
        </div>
      )}

      <section className="hero">
        <p className="eyebrow">Yola, Adamawa State</p>
        <h1>Verified artisans near you, paid safely through Fixam</h1>
        <p className="sub">Plumbers, electricians, carpenters, tailors, AC and generator repairers, painters, welders and tilers. Every artisan is checked by Fixam before customers can book them.</p>
      </section>

      {!me && <>
        <Link className="choice" href={ROUTES.customerSignup}>
          <b>I need an artisan</b>
          <span className="sub">Create a free account, find verified artisans in your area, book one and pay through Fixam. Your money is held until you confirm the job is done.</span>
          <span className="go">Create a customer account →</span>
        </Link>
        <Link className="choice" href={ROUTES.artisanSignup}>
          <b>I am an artisan</b>
          <span className="sub">Sign up with your NIN and a guarantor. Once Fixam approves you, we email you and customers near you can book you.</span>
          <span className="go">Join as an artisan →</span>
        </Link>
        <p className="sub">Already have an account? <Link href={ROUTES.signin}>Sign in</Link>.</p>
      </>}

      <div className="card">
        <h2>How payment works</h2>
        <ol className="steps">
          <li>You describe the job. The artisan sends a price.</li>
          <li>You pay through Fixam with Paystack (card, transfer or USSD).</li>
          <li>The artisan does the work. You confirm it is done.</li>
          <li>Fixam pays the artisan. If something goes wrong, report it and Fixam holds the money while it checks.</li>
        </ol>
      </div>
    </Shell>
  );
}
