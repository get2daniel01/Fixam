import type { Metadata } from 'next';
import ArtisanAccount from './ArtisanAccount';

export const metadata: Metadata = { title: 'Your artisan account' };

export default function Page() {
  return <ArtisanAccount />;
}
