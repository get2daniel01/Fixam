import type { Metadata } from 'next';
import CustomerArea from './CustomerArea';

export const metadata: Metadata = { title: 'Find an artisan' };

export default function Page() {
  return <CustomerArea />;
}
