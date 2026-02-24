'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

export default function LinearSuccessPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const handleSuccess = async () => {
      try {
        setLoading(true);

        if (window.opener) {
          window.opener.postMessage({ type: 'integration_success', provider: 'linear' }, '*');
        }

        await new Promise(resolve => setTimeout(resolve, 2000));

        window.close();
      } catch (err: any) {
        console.error('Error:', err);
        setLoading(false);
      }
    };

    handleSuccess();
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-4">
      <div className="w-full max-w-md text-center">
        <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-full bg-green-50">
          <svg
            className="h-8 w-8 text-green-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>

        <h1 className="text-3xl font-bold text-zinc-900">Linear Connected</h1>
        <p className="mt-3 text-sm text-zinc-600">
          Your agent can now access and manage your Linear workspace
        </p>

        {loading ? (
          <div className="mt-8">
            <div className="inline-flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-zinc-400 animate-bounce" />
              <div className="h-2 w-2 rounded-full bg-zinc-400 animate-bounce" style={{ animationDelay: '0.2s' }} />
              <div className="h-2 w-2 rounded-full bg-zinc-400 animate-bounce" style={{ animationDelay: '0.4s' }} />
            </div>
            <p className="mt-3 text-xs text-zinc-500">Redirecting to chat...</p>
          </div>
        ) : (
          <Link
            href="/chat"
            className="mt-8 inline-block rounded-lg bg-zinc-900 px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
          >
            Go to Chat
          </Link>
        )}
      </div>
    </div>
  );
}
