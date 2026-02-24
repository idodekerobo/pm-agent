'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';

export default function Home() {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (!loading) {
      if (user) {
        router.push('/chat');
      } else {
        router.push('/auth/sign-in');
      }
    }
  }, [user, loading, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-white">
      <div className="text-center">
        <div className="h-8 w-8 rounded-full border-2 border-zinc-300 border-t-zinc-900 animate-spin mx-auto" />
        <p className="mt-4 text-sm text-zinc-500">Loading...</p>
      </div>
    </div>
  );
}
