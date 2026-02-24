'use client';

import Link from 'next/link';

export default function ConfirmEmailPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-4">
      <div className="w-full max-w-md text-center">
        <div className="mb-6 inline-flex h-16 w-16 items-center justify-center rounded-full bg-blue-50">
          <svg
            className="h-8 w-8 text-blue-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
            />
          </svg>
        </div>

        <h1 className="text-3xl font-bold text-zinc-900">Check Your Email</h1>
        <p className="mt-3 text-sm text-zinc-600">
          We've sent a confirmation link to your email address. Click the link to verify your account and get started.
        </p>

        <div className="mt-8 rounded-lg border border-zinc-200 bg-zinc-50 p-4">
          <p className="text-sm font-medium text-zinc-900">Didn't receive an email?</p>
          <p className="mt-2 text-xs text-zinc-600">
            Check your spam or junk folder. Sometimes our emails end up there by mistake.
          </p>
        </div>

        <div className="mt-8">
          <p className="text-sm text-zinc-600">
            Once you confirm your email, you'll be logged in automatically and taken to set up your workspace.
          </p>
        </div>

        <Link
          href="/auth/sign-in"
          className="mt-8 inline-block rounded-lg border border-zinc-300 bg-white px-6 py-2 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-50"
        >
          Back to Sign In
        </Link>
      </div>
    </div>
  );
}
