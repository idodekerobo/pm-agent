'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';

// useSearchParams requires a Suspense boundary in Next.js app router
export default function BridgeAuthPage() {
  return (
    <Suspense fallback={<CenteredSpinner label="Loading..." />}>
      <BridgeAuthContent />
    </Suspense>
  );
}

type PageState = 'loading' | 'authenticating' | 'success' | 'error';

function BridgeAuthContent() {
  const { session, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const status = searchParams.get('status');
  const isSuccess = status === 'success';
  const isError = status === 'error';

  const [state, setState] = useState<PageState>(
    isSuccess ? 'success' : isError ? 'error' : 'loading'
  );
  const [errorMessage, setErrorMessage] = useState(
    isError ? 'No token received from the bridge. Try running draft-bridge auth again.' : ''
  );

  useEffect(() => {
    // Arrived here from bridge redirect — status param set, no auth flow needed
    if (isSuccess || isError) return;

    if (loading) return;

    if (!session) {
      router.push('/auth/sign-in?redirect=/auth/bridge');
      return;
    }

    const issueBridgeToken = async () => {
      setState('authenticating');
      try {
        const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'https://api.draftai.us';
        const res = await fetch(`${apiBase}/bridge/token`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.detail ?? `Request failed (${res.status})`);
        }

        const { token } = await res.json();

        // Cross-origin redirect to the local bridge callback listener.
        // Bridge captures the token from the URL, then redirects back here with ?status=success.
        window.location.href = `http://localhost:7350/auth/callback?token=${encodeURIComponent(token)}`;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Something went wrong.';
        setErrorMessage(message);
        setState('error');
      }
    };

    issueBridgeToken();
  }, [loading, session, router, isSuccess, isError]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-4">
      <div className="w-full max-w-md text-center">

        {(state === 'loading' || state === 'authenticating') && (
          <CenteredSpinner
            label={state === 'loading' ? 'Loading...' : 'Authenticating your local bridge...'}
          />
        )}

        {state === 'success' && (
          <>
            <StatusIcon success />
            <h1 className="mt-4 text-2xl font-semibold text-zinc-900">Bridge authenticated</h1>
            <p className="mt-2 text-sm text-zinc-500">
              You can close this tab and return to your terminal.
            </p>
            <p className="mt-4 text-xs text-zinc-400">
              Then run <code className="font-mono">draft-bridge start</code> to start the bridge server.
            </p>
          </>
        )}

        {state === 'error' && (
          <>
            <StatusIcon success={false} />
            <h1 className="mt-4 text-2xl font-semibold text-zinc-900">Authentication failed</h1>
            <p className="mt-2 text-sm text-zinc-500">{errorMessage}</p>
            <p className="mt-3 text-xs text-zinc-400">
              Make sure <code className="font-mono">draft-bridge auth</code> is running in your terminal, then try again.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="mt-6 inline-block rounded-lg bg-zinc-900 px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
            >
              Retry
            </button>
          </>
        )}

      </div>
    </div>
  );
}

function CenteredSpinner({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center gap-4">
      <div className="inline-flex items-center gap-1.5">
        {[0, 0.15, 0.3].map((delay, i) => (
          <div
            key={i}
            className="h-2 w-2 rounded-full bg-zinc-400 animate-bounce"
            style={{ animationDelay: `${delay}s` }}
          />
        ))}
      </div>
      <p className="text-sm text-zinc-500">{label}</p>
    </div>
  );
}

function StatusIcon({ success }: { success: boolean }) {
  return (
    <div className={`inline-flex h-16 w-16 items-center justify-center rounded-full ${success ? 'bg-green-50' : 'bg-red-50'}`}>
      {success ? (
        <svg className="h-8 w-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="h-8 w-8 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      )}
    </div>
  );
}
