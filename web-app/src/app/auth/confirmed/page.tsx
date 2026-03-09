'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { createClient } from '@/lib/supabaseClient';

const STORAGE_KEY = 'onboarding_profile';

export default function ConfirmedPage() {
  const { user, loading } = useAuth();
  const [submitted, setSubmitted] = useState(false);
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL;

  useEffect(() => {
    if (loading || !user) return;

    const saved = localStorage.getItem(STORAGE_KEY);
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem('onboarding_awaiting');

    if (!saved) {
      setSubmitted(true);
      return;
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(saved);
    } catch {
      setSubmitted(true);
      return;
    }

    const submit = async () => {
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token ?? '';
        const profile = parsed as {
          fullName: string; role: string; companyName: string; companyUrl: string;
          productName: string; productDescription: string; useCases: string[]; useCaseContext: string;
        };
        await fetch(`${apiBase}/user/profile`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            full_name: profile.fullName,
            role: profile.role,
            company_name: profile.companyName || null,
            company_url: profile.companyUrl
              ? `https://${profile.companyUrl.replace(/^https?:\/\//, '')}`
              : null,
            product_name: profile.productName || null,
            product_description: profile.productDescription || null,
            use_case: [
              ...profile.useCases,
              ...(profile.useCaseContext?.trim() ? [profile.useCaseContext.trim()] : []),
            ].join(', ') || null,
          }),
        });
      } finally {
        setSubmitted(true);
      }
    };

    submit();
  }, [user, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-close once submission is done.
  useEffect(() => {
    if (!submitted) return;
    const t = setTimeout(() => window.close(), 3000);
    return () => clearTimeout(t);
  }, [submitted]);

  return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-4 font-sans text-zinc-900">
      <div className="w-full max-w-sm bg-white border border-zinc-200 shadow-sm rounded-xl px-8 py-12 flex flex-col items-center gap-5 text-center">
        {submitted ? (
          <>
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-green-100">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-green-600">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div>
              <p className="text-base font-semibold text-zinc-900">Email confirmed!</p>
              <p className="mt-1.5 text-sm text-zinc-500">
                Head back to your previous tab to finish setup. This window will close automatically.
              </p>
            </div>
          </>
        ) : (
          <>
            <svg className="animate-spin h-6 w-6 text-zinc-400" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className="text-sm text-zinc-500">Setting up your workspace…</p>
          </>
        )}
      </div>
    </div>
  );
}
