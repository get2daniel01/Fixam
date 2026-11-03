import type { Metadata } from 'next';
import ArtisanSignup from './ArtisanSignup';

export const metadata: Metadata = { title: 'Join Fixam as an artisan' };

export default function Page() {
  return <ArtisanSignup />;
}
