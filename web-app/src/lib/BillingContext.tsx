'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';
import { logError } from './errorLogger';

interface BillingContextValue {
  creditsRemaining: number | null;
  monthlyCredits: number | null;
  planName: string | null;
  currentPeriodEnd: string | null;
  loading: boolean;
  refetch: () => void;
}

const BillingContext = createContext<BillingContextValue | undefined>(undefined);

export function BillingProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const [creditsRemaining, setCreditsRemaining] = useState<number | null>(null);
  const [monthlyCredits, setMonthlyCredits] = useState<number | null>(null);
  const [planName, setPlanName] = useState<string | null>(null);
  const [currentPeriodEnd, setCurrentPeriodEnd] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;

  const fetchStatus = useCallback(async () => {
    if (!session?.access_token) return;
    try {
      const res = await fetch(`${apiBaseUrl}/billing/status`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      setCreditsRemaining(data.credits_remaining);
      setMonthlyCredits(data.monthly_credits);
      setPlanName(data.plan_name);
      setCurrentPeriodEnd(data.current_period_end ?? null);
    } catch (err) {
      // best-effort: don't crash the app if billing is unavailable
      const getToken = () => session?.access_token ?? "";
      logError(getToken, "Failed to fetch billing status", {
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLoading(false);
    }
  }, [session?.access_token, apiBaseUrl]);

  useEffect(() => {
    if (session) {
      fetchStatus();
    } else {
      setLoading(false);
    }
  }, [session, fetchStatus]);

  return (
    <BillingContext.Provider
      value={{ creditsRemaining, monthlyCredits, planName, currentPeriodEnd, loading, refetch: fetchStatus }}
    >
      {children}
    </BillingContext.Provider>
  );
}

export function useBilling() {
  const context = useContext(BillingContext);
  if (!context) throw new Error('useBilling must be used within BillingProvider');
  return context;
}
