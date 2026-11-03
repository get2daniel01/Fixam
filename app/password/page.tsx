import type { Metadata } from 'next';
import ChangePassword from './ChangePassword';

export const metadata: Metadata = { title: 'Change your password' };

export default function Page() {
  return <ChangePassword />;
}
