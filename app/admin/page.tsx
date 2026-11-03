import type { Metadata } from 'next';
import AdminArea from './AdminArea';

export const metadata: Metadata = { title: 'Admin' };

export default function Page() {
  return <AdminArea />;
}
