'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabaseClient';

export default function AuthCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const handleCallback = async () => {
      try {
        const supabase = createClient();

        const errorCode = searchParams.get('error');
        const errorDescription = searchParams.get('error_description');

        if (errorCode) {
          setError(errorDescription || 'Email confirmation failed');
          setLoading(false);
          return;
        }

        const code = searchParams.get('code');
        if (code) {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(code);
          if (exchangeError) {
            setError(exchangeError.message || 'Email confirmation failed. The link may have expired.');
            setLoading(false);
            return;
          }
        }

        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError || !user) {
          setError('Email confirmation failed. Please try signing up again.');
          setLoading(false);
          return;
        }

        router.push('/onboarding');
      } catch (err: any) {
        setError(err.message || 'An error occurred during email confirmation');
        setLoading(false);
      }
    };

    handleCallback();
  }, [router, searchParams]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-center">
          <div className="h-8 w-8 rounded-full border-2 border-zinc-300 border-t-zinc-900 animate-spin mx-auto" />
          <p className="mt-4 text-sm text-zinc-500">Confirming your email...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white px-4">
        <div className="w-full max-w-md text-center">
          <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-full bg-red-50">
            <svg
              className="h-8 w-8 text-red-600"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </div>

          <h1 className="text-3xl font-bold text-zinc-900">Confirmation Failed</h1>
          <p className="mt-3 text-sm text-zinc-600">{error}</p>

          <a
            href="/auth/sign-up"
            className="mt-8 inline-block rounded-lg bg-zinc-900 px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
          >
            Try Again
          </a>
        </div>
      </div>
    );
  }

  return null;
}
