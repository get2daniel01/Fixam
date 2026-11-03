import type { Metadata } from 'next';
import PostWork from './PostWork';

export const metadata: Metadata = { title: 'Post your work' };

export default function Page() {
  return <PostWork />;
}
