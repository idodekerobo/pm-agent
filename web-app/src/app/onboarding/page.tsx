'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';
import { createClient } from '@/lib/supabaseClient';

type Step = 'company' | 'integrations' | 'connecting' | 'integrations_connecting';

interface OnboardingData {
  companyName: string;
  companyLink: string;
  integrations: {
    googleDrive: boolean;
    linear: boolean;
  };
}

interface IntegrationStatus {
  googleDrive: boolean;
  linear: boolean;
}

export default function OnboardingPage() {
  const [step, setStep] = useState<Step>('company');
  const [data, setData] = useState<OnboardingData>({
    companyName: '',
    companyLink: '',
    integrations: {
      googleDrive: false,
      linear: false,
    },
  });
  const [integrationsCompleted, setIntegrationsCompleted] = useState<IntegrationStatus>({
    googleDrive: false,
    linear: false,
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { user } = useAuth();

  // Listen for integration completion messages from child windows
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'integration_success') {
        setIntegrationsCompleted(prev => ({
          ...prev,
          [event.data.provider === 'google_drive' ? 'googleDrive' : 'linear']: true,
        }));

        // If all selected integrations are complete, redirect to chat
        const allComplete =
          (!data.integrations.googleDrive || integrationsCompleted.googleDrive) &&
          (!data.integrations.linear || integrationsCompleted.linear);

        if (allComplete) {
          setTimeout(() => router.push('/chat'), 1000);
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [data.integrations, integrationsCompleted, router]);

  const isValidUrl = (url: string) => {
    if (!url) return true;
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  const handleCompanySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!data.companyName.trim()) {
      setError('Company name is required');
      return;
    }

    if (!isValidUrl(data.companyLink)) {
      setError('Please enter a valid URL');
      return;
    }

    setStep('integrations');
  };

  const handleIntegrationToggle = (integration: 'googleDrive' | 'linear') => {
    setData((prev) => ({
      ...prev,
      integrations: {
        ...prev.integrations,
        [integration]: !prev.integrations[integration],
      },
    }));
  };

  const handleIntegrationSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!data.integrations.googleDrive) {
      setError('Google Drive is required');
      return;
    }

    setStep('connecting');
    setLoading(true);

    try {
      const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || '';

      await fetch(`${apiBaseUrl}/onboarding/company`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          company_name: data.companyName,
          company_link: data.companyLink || null,
        }),
      });

      sessionStorage.setItem('connecting_user_id', user?.id || '');
      sessionStorage.setItem('pending_integrations', JSON.stringify(data.integrations));

      if (data.integrations.googleDrive) {
        window.open(`${apiBaseUrl}/integrations/google/connect?user_id=${user?.id}`, '_blank');
      }

      if (data.integrations.linear) {
        window.open(`${apiBaseUrl}/integrations/linear/connect?user_id=${user?.id}`, '_blank');
      }

      setLoading(false);
      setStep('integrations_connecting');
    } catch (err: any) {
      setError(err.message || 'Failed to complete onboarding');
      setLoading(false);
      setStep('integrations');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-4 py-8">
      <div className="w-full max-w-md">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-zinc-900">Let's get started</h1>
          <p className="mt-2 text-sm text-zinc-600">
            {step === 'company' && 'Tell us about your company'}
            {step === 'integrations' && 'Connect your integrations'}
            {step === 'integrations_connecting' && 'Completing integration setup...'}
          </p>

          <div className="mt-6 flex gap-2">
            <div className={`h-1 flex-1 rounded ${step !== 'company' ? 'bg-zinc-900' : 'bg-zinc-200'}`} />
            <div className={`h-1 flex-1 rounded ${step === 'integrations' || step === 'integrations_connecting' ? 'bg-zinc-900' : 'bg-zinc-200'}`} />
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg border border-red-300 bg-red-50 px-4 py-3">
            <p className="text-sm font-medium text-red-800">{error}</p>
          </div>
        )}

        {step === 'company' && (
          <form onSubmit={handleCompanySubmit} className="space-y-4">
            <div>
              <label htmlFor="companyName" className="block text-sm font-medium text-zinc-700 mb-1">
                Company Name
              </label>
              <input
                id="companyName"
                type="text"
                required
                value={data.companyName}
                onChange={(e) => setData({ ...data, companyName: e.target.value })}
                className="w-full rounded-lg border border-zinc-300 px-4 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                placeholder="Acme Inc."
              />
            </div>

            <div>
              <label htmlFor="companyLink" className="block text-sm font-medium text-zinc-700 mb-1">
                Company Link (Optional)
              </label>
              <input
                id="companyLink"
                type="url"
                value={data.companyLink}
                onChange={(e) => setData({ ...data, companyLink: e.target.value })}
                className="w-full rounded-lg border border-zinc-300 px-4 py-2 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                placeholder="https://acme.com"
              />
            </div>

            <button
              type="submit"
              className="w-full rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800"
            >
              Continue
            </button>
          </form>
        )}

        {step === 'integrations' && (
          <form onSubmit={handleIntegrationSubmit} className="space-y-4">
            <div className="space-y-3">
              <div className="flex items-center gap-3 rounded-lg border border-zinc-300 p-4 hover:border-zinc-400 transition-colors">
                <input
                  type="checkbox"
                  id="googleDrive"
                  checked={data.integrations.googleDrive}
                  onChange={() => handleIntegrationToggle('googleDrive')}
                  className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                />
                <div className="flex-1">
                  <label htmlFor="googleDrive" className="block text-sm font-medium text-zinc-900 cursor-pointer">
                    Google Drive
                  </label>
                  <p className="text-xs text-zinc-500">
                    Required — Access your files and documents
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 rounded-lg border border-zinc-300 p-4 hover:border-zinc-400 transition-colors">
                <input
                  type="checkbox"
                  id="linear"
                  checked={data.integrations.linear}
                  onChange={() => handleIntegrationToggle('linear')}
                  className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-900"
                />
                <div className="flex-1">
                  <label htmlFor="linear" className="block text-sm font-medium text-zinc-900 cursor-pointer">
                    Linear
                  </label>
                  <p className="text-xs text-zinc-500">
                    Optional — Track issues and project management
                  </p>
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-800 disabled:bg-zinc-300 disabled:cursor-not-allowed"
            >
              {loading ? 'Connecting...' : 'Connect Integrations'}
            </button>
          </form>
        )}

        {step === 'integrations_connecting' && (
          <div className="text-center py-8">
            <div className="mb-6">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-lg bg-zinc-100">
                <div className="h-4 w-4 rounded-full border-2 border-zinc-300 border-t-zinc-900 animate-spin" />
              </div>
            </div>
            <p className="text-sm text-zinc-600 mb-6">
              Completing integration setup...
            </p>

            <div className="space-y-3 text-left">
              <div className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-4">
                <div className={`h-5 w-5 rounded-full flex items-center justify-center ${
                  integrationsCompleted.googleDrive 
                    ? 'bg-green-100'
                    : 'border-2 border-zinc-300'
                }`}>
                  {integrationsCompleted.googleDrive ? (
                    <svg className="h-3 w-3 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <div className="h-2 w-2 rounded-full bg-zinc-300 animate-pulse" />
                  )}
                </div>
                <p className="text-sm font-medium text-zinc-900">Google Drive</p>
              </div>

              {data.integrations.linear && (
                <div className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-4">
                  <div className={`h-5 w-5 rounded-full flex items-center justify-center ${
                    integrationsCompleted.linear
                      ? 'bg-green-100'
                      : 'border-2 border-zinc-300'
                  }`}>
                    {integrationsCompleted.linear ? (
                      <svg className="h-3 w-3 text-green-600" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    ) : (
                      <div className="h-2 w-2 rounded-full bg-zinc-300 animate-pulse" />
                    )}
                  </div>
                  <p className="text-sm font-medium text-zinc-900">Linear</p>
                </div>
              )}
            </div>

            <p className="mt-6 text-xs text-zinc-500">
              Check the browser windows that opened for each integration
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
