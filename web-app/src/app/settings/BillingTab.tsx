'use client';

import { useAuth } from '@/lib/AuthContext';
import { useBilling } from '@/lib/BillingContext';

export default function BillingTab() {
  const { session } = useAuth();
  const { creditsRemaining, monthlyCredits, planName, currentPeriodEnd, loading: billingLoading } = useBilling();
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL;

  const handleUpgrade = async () => {
    try {
      const token = session?.access_token ?? '';
      const res = await fetch(`${apiBase}/billing/checkout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      const { checkout_url } = await res.json();
      window.location.href = checkout_url;
    } catch {
      console.error('Failed to create checkout session');
    }
  };

  const handlePortal = async () => {
    try {
      const token = session?.access_token ?? '';
      const res = await fetch(`${apiBase}/billing/portal`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      const { portal_url } = await res.json();
      window.location.href = portal_url;
    } catch {
      console.error('Failed to create portal session');
    }
  };

  return (
    <div className="max-w-xl">
      <h2 className="text-2xl font-semibold tracking-tight text-zinc-900">Billing</h2>
      <p className="mt-1.5 text-sm text-zinc-500">
        Manage your plan and credit usage.
      </p>

      {billingLoading ? (
        <div className="mt-8 flex items-center gap-3">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-600" />
          <span className="text-xs text-zinc-400" style={{ fontFamily: 'var(--font-geist-mono)' }}>
            Loading billing...
          </span>
        </div>
      ) : (
        <div className="mt-8 space-y-6">

          {/* Plan card */}
          <div className="overflow-hidden rounded-lg border border-zinc-200">
            <div className="flex items-center justify-between px-5 py-4">
              <div>
                <div className="flex items-center gap-2.5">
                  <span
                    className="rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider"
                    style={{
                      fontFamily: 'var(--font-geist-mono)',
                      backgroundColor: planName === 'pro' ? '#18181b' : '#f4f4f5',
                      color: planName === 'pro' ? '#fff' : '#52525b',
                    }}
                  >
                    {planName ?? '—'}
                  </span>
                  <p className="text-sm font-medium text-zinc-900">
                    {monthlyCredits !== null ? `${monthlyCredits} credits / month` : '—'}
                  </p>
                </div>
                {currentPeriodEnd && (
                  <p className="mt-1 text-xs text-zinc-400" style={{ fontFamily: 'var(--font-geist-mono)' }}>
                    Renews {new Date(currentPeriodEnd).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                )}
              </div>
              {planName !== 'pro' ? (
                <button
                  onClick={handleUpgrade}
                  className="flex-shrink-0 rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700"
                >
                  Upgrade to Pro
                </button>
              ) : (
                <button
                  onClick={handlePortal}
                  className="flex-shrink-0 rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
                >
                  Manage Billing
                </button>
              )}
            </div>
          </div>

          {/* Usage */}
          <div>
            <p
              className="mb-3 text-[10px] font-medium uppercase tracking-widest text-zinc-400"
              style={{ fontFamily: 'var(--font-geist-mono)' }}
            >
              Usage this period
            </p>
            <div className="rounded-lg border border-zinc-200 px-5 py-4">
              {creditsRemaining !== null && monthlyCredits !== null ? (
                <>
                  <div className="flex items-baseline justify-between">
                    <p className="text-sm text-zinc-700">
                      <span className="font-semibold text-zinc-900">{creditsRemaining}</span>
                      <span className="text-zinc-400"> / {monthlyCredits} credits remaining</span>
                    </p>
                    <p className="text-xs text-zinc-400" style={{ fontFamily: 'var(--font-geist-mono)' }}>
                      {monthlyCredits - creditsRemaining} used
                    </p>
                  </div>
                  <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-zinc-100">
                    <div
                      className="h-full rounded-full bg-zinc-900 transition-all"
                      style={{ width: `${Math.min(100, ((monthlyCredits - creditsRemaining) / monthlyCredits) * 100)}%` }}
                    />
                  </div>
                </>
              ) : (
                <p className="text-sm text-zinc-400">No usage data available.</p>
              )}
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
