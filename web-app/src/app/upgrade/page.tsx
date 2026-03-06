'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';
import { logError } from '@/lib/errorLogger';

export default function UpgradePage() {
  const router = useRouter();
  const { session, loading: authLoading } = useAuth();
  const [error, setError] = useState<string | null>(null);

  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;

  useEffect(() => {
    // Wait for auth to finish initializing
    if (authLoading) return;

    // Not signed in — send to sign-in with redirect back here
    if (!session) {
      router.replace('/auth/sign-in?redirect=/upgrade');
      return;
    }

    // Signed in — create checkout session and redirect to Stripe
    const startCheckout = async () => {
      try {
        const res = await fetch(`${apiBaseUrl}/billing/checkout`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${session.access_token}` },
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.detail || `Request failed: ${res.status}`);
        }

        const { checkout_url } = await res.json();
        window.location.href = checkout_url;
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to start checkout';
        setError(message);
        const getToken = () => session.access_token ?? '';
        logError(getToken, 'Failed to create checkout session from /upgrade', {
          error: message,
        });
      }
    };

    startCheckout();
  }, [authLoading, session]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white px-4">
        <div className="w-full max-w-sm text-center">
          <p className="text-sm font-medium text-zinc-900">Something went wrong</p>
          <p className="mt-1 text-sm text-zinc-500">{error}</p>
          <button
            onClick={() => router.push('/settings')}
            className="mt-6 rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
          >
            Back to Settings
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-white">
      <div className="flex flex-col items-center gap-3">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-700" />
        <p className="text-sm text-zinc-500">Redirecting to checkout…</p>
      </div>
    </div>
  );
}
