import type { Metadata } from 'next';
import CustomerSignup from './CustomerSignup';

export const metadata: Metadata = { title: 'Create a customer account' };

export default function Page() {
  return <CustomerSignup />;
}
