import { sb, rpc } from './supabase';

export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || '';

export const TRADES: [string, string][] = [
  ['plumbing', 'Plumbing'], ['electrical', 'Electrical'], ['carpentry', 'Carpentry'],
  ['tailoring', 'Tailoring'], ['ac_generator', 'AC & Generator repair'], ['painting', 'Painting'],
  ['welding', 'Welding'], ['tiling', 'Tiling'],
];
export const tradeLabel = (id: string) => (TRADES.find((t) => t[0] === id) || [id, id])[1];
export const AREAS = ['Jimeta', 'Karewa', 'Doubeli', 'Jambutu', 'Bekaji', 'Nassarawa', 'Mbamba', 'Wuro Chekke', 'Yola Town', 'Damilu'];
export const PHONE_RE = /^0[789][01][0-9]{8}$/;
export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export const MIN_PASSWORD = 8;

export const naira = (n: number) => '₦' + Number(n).toLocaleString('en-NG');
export const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
export const photoUrl = (path: string) => sb().storage.from('work-photos').getPublicUrl(path).data.publicUrl;
export const today = () => new Date().toISOString().slice(0, 10);

// Page routes inside the app (Next adds the base path to <Link> and router calls)
export const ROUTES = {
  home: '/',
  artisanSignup: '/artisan-signup',
  customerSignup: '/customer-signup',
  signin: '/signin',
  password: '/password',
  account: '/account',   // artisan dashboard
  post: '/post',         // artisan: post your work
  customer: '/customer', // customer area
  admin: '/admin',
} as const;

export const HOME_FOR_ROLE: Record<string, string> = { admin: ROUTES.admin, artisan: ROUTES.account, customer: ROUTES.customer };

// Pages are exported as folders, so their addresses end in "/" (e.g. /signin/?next=...)
const withSlash = (route: string) => route.replace(/^([^?#]*?)\/?([?#].*)?$/, (_m, p, rest) => `${p}/${rest || ''}`).replace(/^\/\//, '/');

// Full address of a page, for links that leave the site (email links, Paystack)
export const absoluteUrl = (route: string) => `${window.location.origin}${BASE_PATH}${withSlash(route)}`;

// Navigate with a full page load. Used after sign-in and sign-out so every page starts fresh.
export const hardGo = (route: string) => window.location.replace(`${BASE_PATH}${withSlash(route)}`);

export async function myRole(): Promise<string | null> {
  return rpc<string | null>('my_role');
}

export function authError(err: any): string {
  const msg = err?.message || '';
  if (/Invalid login credentials/i.test(msg)) return 'Email or password is wrong. Check both and try again.';
  if (/Email not confirmed/i.test(msg)) return 'CONFIRM_EMAIL';
  if (/rate limit|too many/i.test(msg)) return 'Too many attempts. Wait a few minutes and try again.';
  if (/Password should be|weak password/i.test(msg)) return `Choose a stronger password: at least ${MIN_PASSWORD} characters, mixing letters and numbers.`;
  if (/Unable to validate email|invalid format|Email address .* is invalid/i.test(msg)) return 'That email address does not look right. Check it and try again.';
  if (/Failed to fetch|NetworkError|network/i.test(msg)) return 'No internet connection. Check your data or Wi-Fi and try again.';
  if (/expired|invalid.*token|otp/i.test(msg)) return 'This link has expired. Ask for a new one below.';
  return msg || 'Something went wrong. Please try again.';
}

export function friendly(err: any): string {
  const m = err?.message || '';
  if (/Failed to fetch|network/i.test(m)) return 'No internet connection. Check your data or Wi-Fi and try again.';
  if (/JWT|not authenticated/i.test(m)) return 'You have been signed out. Sign in again.';
  return m || 'Something went wrong. Please try again.';
}

export const queryParam = (name: string) => (typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get(name));
