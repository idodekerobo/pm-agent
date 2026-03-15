'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';
import { useProfileComplete } from '@/lib/useProfileComplete';
import AgentFilesTab from './AgentFilesTab';
import BillingTab from './BillingTab';
import FeedbackTab from './FeedbackTab';
import IntegrationsTab from './IntegrationsTab';
import ProfileTab from './ProfileTab';

type Tab = 'integrations' | 'agent-files' | 'billing' | 'profile' | 'feedback';

function SettingsContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, session, signOut } = useAuth();
  const profileComplete = useProfileComplete();
  const activeTab: Tab = (searchParams.get('tab') as Tab) ?? 'profile';
  const [billingBanner, setBillingBanner] = useState<'success' | 'canceled' | null>(null);

  const navigateToTab = (tab: Tab) => {
    router.push(`/settings?tab=${tab}`);
  };

  // Read ?billing= query param on mount, show banner, then clear the URL
  useEffect(() => {
    const billing = searchParams.get('billing');
    if (billing === 'success' || billing === 'canceled') {
      setBillingBanner(billing);
      router.replace('/settings?tab=billing', { scroll: false });
    }
  }, []);

  const handleSignOut = async () => {
    try {
      await signOut();
      router.push('/auth/sign-in');
    } catch (err) {
      console.error('Error signing out:', err);
    }
  };

  return (
    <>
      <style>{`
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.35; }
        }
        .pulse-dot  { animation: pulse-dot 2.4s ease-in-out infinite; }
        .row-hover  { transition: background-color 0.1s ease; }
        .row-hover:hover { background-color: #fafafa; }

        .chevron      { transition: transform 0.2s ease; }
        .chevron-open { transform: rotate(180deg); }

        /* CSS grid trick for smooth height animation without fixed max-height */
        .collapsible      { display: grid; grid-template-rows: 0fr; transition: grid-template-rows 0.25s ease, opacity 0.2s ease; opacity: 0; }
        .collapsible-open { grid-template-rows: 1fr; opacity: 1; }
        .collapsible > div { overflow: hidden; }
      `}</style>

      <div className="flex h-screen flex-col bg-white">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-4">
          <div className="flex items-center gap-2.5">
            <Link
              href="/chat"
              className="flex items-center gap-1.5 text-sm text-zinc-400 transition-colors hover:text-zinc-700"
            >
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                <path d="M9 2L4 7L9 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Chat
            </Link>
            <span className="text-zinc-300">/</span>
            <span className="text-sm font-medium text-zinc-900">Settings</span>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-zinc-400" style={{ fontFamily: 'var(--font-geist-mono)' }}>
              {user?.email}
            </span>
            <button
              onClick={handleSignOut}
              className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-500 focus:ring-offset-2"
            >
              Sign Out
            </button>
          </div>
        </div>

        {/* ── Body ───────────────────────────────────────────────────────── */}
        <div className="flex flex-1 overflow-hidden">

          {/* Sidebar */}
          <aside className="w-52 flex-shrink-0 border-r border-zinc-200 bg-zinc-50/60 px-4 py-8">
            <p
              className="mb-3 text-[10px] font-medium uppercase tracking-widest text-zinc-400"
              style={{ fontFamily: 'var(--font-geist-mono)' }}
            >
              Menu
            </p>
            <nav className="flex flex-col gap-1">
              <button
                onClick={() => navigateToTab('profile')}
                className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm font-medium transition-colors ${
                  activeTab === 'profile'
                    ? 'border border-zinc-200 bg-white text-zinc-900 shadow-sm'
                    : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800'
                }`}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
                </svg>
                Profile
              </button>
              <button
                onClick={() => navigateToTab('integrations')}
                className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm font-medium transition-colors ${
                  activeTab === 'integrations'
                    ? 'border border-zinc-200 bg-white text-zinc-900 shadow-sm'
                    : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800'
                }`}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect width="7" height="7" x="3"  y="3"  rx="1" />
                  <rect width="7" height="7" x="14" y="3"  rx="1" />
                  <rect width="7" height="7" x="14" y="14" rx="1" />
                  <rect width="7" height="7" x="3"  y="14" rx="1" />
                </svg>
                Integrations
              </button>
              <button
                onClick={() => navigateToTab('agent-files')}
                className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm font-medium transition-colors ${
                  activeTab === 'agent-files'
                    ? 'border border-zinc-200 bg-white text-zinc-900 shadow-sm'
                    : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800'
                }`}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
                Agent Files
              </button>
              <button
                onClick={() => navigateToTab('billing')}
                className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm font-medium transition-colors ${
                  activeTab === 'billing'
                    ? 'border border-zinc-200 bg-white text-zinc-900 shadow-sm'
                    : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800'
                }`}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
                  <line x1="1" y1="10" x2="23" y2="10" />
                </svg>
                Billing
              </button>
              <button
                onClick={() => navigateToTab('feedback')}
                className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2 text-left text-sm font-medium transition-colors ${
                  activeTab === 'feedback'
                    ? 'border border-zinc-200 bg-white text-zinc-900 shadow-sm'
                    : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800'
                }`}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
                Feedback
              </button>
            </nav>
          </aside>

          {/* Main content */}
          <main className="flex-1 overflow-y-auto px-10 py-8">

            {/* Incomplete profile banner */}
            {profileComplete === false && (
              <div className="mb-6 flex items-center justify-between rounded-lg border border-blue-200 bg-blue-50 px-5 py-3.5">
                <div className="flex items-center gap-3">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-blue-500">
                    <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <p className="text-sm text-blue-800">
                    Your profile isn&apos;t set up — your agent won&apos;t have context about you or your product.
                  </p>
                </div>
                <button
                  onClick={() => router.push('/settings?tab=profile')}
                  className="ml-4 shrink-0 rounded-lg bg-zinc-900 px-4 py-1.5 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
                >
                  Complete profile
                </button>
              </div>
            )}

            {/* Stripe redirect banners */}
            {billingBanner === 'success' && (
              <div className="mb-6 flex items-center justify-between rounded-lg border border-green-200 bg-green-50 px-5 py-3.5">
                <div className="flex items-center gap-3">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-green-600">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                  <div>
                    <p className="text-sm font-medium text-green-900">You&apos;re now on Pro!</p>
                    <p className="text-xs text-green-700">Your credits have been added. You can manage your subscription below.</p>
                  </div>
                </div>
                <button onClick={() => setBillingBanner(null)} className="ml-4 shrink-0 text-green-500 hover:text-green-800" aria-label="Dismiss">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
              </div>
            )}
            {billingBanner === 'canceled' && (
              <div className="mb-6 flex items-center justify-between rounded-lg border border-zinc-200 bg-zinc-50 px-5 py-3.5">
                <div className="flex items-center gap-3">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-zinc-400">
                    <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  <div>
                    <p className="text-sm font-medium text-zinc-700">Checkout canceled</p>
                    <p className="text-xs text-zinc-500">No changes were made. You&apos;re still on your current plan.</p>
                  </div>
                </div>
                <button onClick={() => setBillingBanner(null)} className="ml-4 shrink-0 text-zinc-400 hover:text-zinc-700" aria-label="Dismiss">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
              </div>
            )}

            {activeTab === 'profile'      && <ProfileTab />}
            {activeTab === 'integrations' && <IntegrationsTab />}
            {activeTab === 'agent-files'  && <div className="flex h-full flex-col"><AgentFilesTab /></div>}
            {activeTab === 'billing'      && <BillingTab />}
            {activeTab === 'feedback'     && <FeedbackTab />}

          </main>
        </div>
      </div>
    </>
  );
}

export default function SettingsPage() {
  return (
    <Suspense>
      <SettingsContent />
    </Suspense>
  );
}
