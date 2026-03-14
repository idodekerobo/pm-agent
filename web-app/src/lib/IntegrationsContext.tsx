'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { useAuth } from './AuthContext';

interface Integration {
  provider: string;
  account_label: string | null;
  scopes: string[] | null;
  created_at: string;
}

interface IntegrationsContextValue {
  integrations: Integration[];
  loading: boolean;
  refetch: () => void;
}

const IntegrationsContext = createContext<IntegrationsContextValue | undefined>(undefined);

export function IntegrationsProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);

  const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;

  const fetchIntegrations = useCallback(async () => {
    if (!session?.access_token) return;
    try {
      const res = await fetch(`${apiBaseUrl}/integrations/`, {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      setIntegrations(data);
    } catch {
      // TODO: log error
    } finally {
      setLoading(false);
    }
  }, [session?.access_token, apiBaseUrl]);

  useEffect(() => {
    if (session) {
      fetchIntegrations();
    } else {
      setLoading(false);
    }
  }, [session, fetchIntegrations]);

  return (
    <IntegrationsContext.Provider value={{ integrations, loading, refetch: fetchIntegrations }}>
      {children}
    </IntegrationsContext.Provider>
  );
}

export function useIntegrations() {
  const context = useContext(IntegrationsContext);
  if (!context) throw new Error('useIntegrations must be used within IntegrationsProvider');
  return context;
}
