'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';
import { createClient } from '@/lib/supabaseClient';

interface OnboardingData {
  companyName: string;
  companyLink: string;
}

interface IntegrationStatus {
  googleDrive: boolean;
  linear: boolean;
}

export default function OnboardingPage() {
  const [data, setData] = useState<OnboardingData>({
    companyName: '',
    companyLink: '',
  });
  
  const [integrationsCompleted, setIntegrationsCompleted] = useState<IntegrationStatus>({
    googleDrive: false,
    linear: false,
  });
  
  const [connectingProvider, setConnectingProvider] = useState<'googleDrive' | 'linear' | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { user } = useAuth();

  // Listen for integration completion messages from child windows
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'integration_success') {
        const provider = event.data.provider === 'google_drive' ? 'googleDrive' : 'linear';
        setIntegrationsCompleted(prev => ({
          ...prev,
          [provider]: true,
        }));
        setConnectingProvider(null);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const isValidUrl = (url: string) => {
    if (!url) return true;
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  };

  const handleConnect = (provider: 'googleDrive' | 'linear') => {
    if (!user?.id) return;
    
    setError('');
    setConnectingProvider(provider);
    
    const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL;
    const endpoint = provider === 'googleDrive' 
      ? `${apiBaseUrl}/integrations/google/connect?user_id=${user.id}`
      : `${apiBaseUrl}/integrations/linear/connect?user_id=${user.id}`;
      
    window.open(endpoint, '_blank', 'width=600,height=700');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!data.companyName.trim()) {
      setError('Company name is required');
      return;
    }

    if (!isValidUrl(data.companyLink)) {
      setError('Please enter a valid URL for the company link');
      return;
    }

    if (!integrationsCompleted.googleDrive) {
      setError('Google Drive connection is required');
      return;
    }

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

      sessionStorage.setItem('pending_integrations', JSON.stringify(integrationsCompleted));
      
      router.push('/chat');
    } catch (err: any) {
      setError(err.message || 'Failed to complete onboarding');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-4 font-sans text-zinc-900">
      <div className="w-full max-w-2xl bg-white border border-zinc-200 shadow-sm rounded-xl overflow-hidden">
        
        {/* Header */}
        <div className="px-8 py-6 border-b border-zinc-100 bg-white">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
            Initialize Agent Context
          </h1>
          <p className="mt-2 text-sm text-zinc-500">
            Configure the core knowledge base and execution capabilities for your agent.
          </p>
        </div>

        {error && (
          <div className="mx-8 mt-6 rounded-md bg-red-50 p-4 border border-red-100">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">Error</h3>
                <div className="mt-2 text-sm text-red-700">
                  <p>{error}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="divide-y divide-zinc-100">
          
          {/* Section 1: Overall Company Context */}
          <div className="px-8 py-6 space-y-6">
            <div>
              <h2 className="text-base font-medium text-zinc-900 uppercase tracking-wider text-xs mb-4 text-zinc-500">
                01 / Overall Company Context
              </h2>
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <div className="col-span-2 sm:col-span-1">
                  <label htmlFor="companyName" className="block text-sm font-medium text-zinc-700 mb-1.5">
                    Company Name
                  </label>
                  <input
                    type="text"
                    id="companyName"
                    required
                    value={data.companyName}
                    onChange={(e) => setData({ ...data, companyName: e.target.value })}
                    className="block w-full rounded-md border-zinc-300 shadow-sm focus:border-zinc-900 focus:ring-zinc-900 sm:text-sm py-2.5 px-3 bg-zinc-50/50"
                    placeholder="e.g. Acme Corp"
                  />
                </div>

                <div className="col-span-2 sm:col-span-1">
                  <label htmlFor="companyLink" className="block text-sm font-medium text-zinc-700 mb-1.5">
                    Company URL
                  </label>
                  <input
                    type="url"
                    id="companyLink"
                    value={data.companyLink}
                    onChange={(e) => setData({ ...data, companyLink: e.target.value })}
                    className="block w-full rounded-md border-zinc-300 shadow-sm focus:border-zinc-900 focus:ring-zinc-900 sm:text-sm py-2.5 px-3 bg-zinc-50/50"
                    placeholder="https://acme.com"
                  />
                  <p className="mt-1.5 text-xs text-zinc-500">
                    Where the company URL fits in the context.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Section 2: Issue Tracking & Planning */}
          <div className="px-8 py-6 bg-zinc-50/30">
            <h2 className="text-base font-medium text-zinc-900 uppercase tracking-wider text-xs mb-4 text-zinc-500">
              02 / Issue Tracking & Planning
            </h2>
            
            <div 
              className={`group relative flex items-center justify-between p-4 rounded-lg border transition-all duration-200 ${
                integrationsCompleted.linear
                  ? 'bg-white border-zinc-900 shadow-sm' 
                  : 'bg-white border-zinc-200 hover:border-zinc-300'
              }`}
            >
              <div className="flex-1 pr-4">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium text-zinc-900">Linear Integration</h3>
                  {integrationsCompleted.linear && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                      Connected
                    </span>
                  )}
                </div>
                <p className="text-zinc-500 mt-1 text-sm">
                  Connect your issue tracking system. This is where Linear fits into the agent's workflow for planning and execution monitoring.
                </p>
              </div>
              
              <button
                type="button"
                onClick={() => handleConnect('linear')}
                disabled={integrationsCompleted.linear || connectingProvider === 'linear'}
                className={`flex-shrink-0 inline-flex items-center justify-center px-4 py-2 border text-sm font-medium rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-zinc-900 transition-colors ${
                  integrationsCompleted.linear
                    ? 'border-transparent text-zinc-400 bg-zinc-100 cursor-default'
                    : 'border-zinc-300 text-zinc-700 bg-white hover:bg-zinc-50'
                }`}
              >
                {connectingProvider === 'linear' ? (
                  <span className="flex items-center">
                     <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-zinc-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Connecting...
                  </span>
                ) : integrationsCompleted.linear ? (
                  'Connected'
                ) : (
                  'Connect Linear'
                )}
              </button>
            </div>
          </div>

          {/* Section 3: Docs, Slides, etc. */}
          <div className="px-8 py-6">
            <h2 className="text-base font-medium text-zinc-900 uppercase tracking-wider text-xs mb-4 text-zinc-500">
              03 / Docs, Slides, & Assets
            </h2>

            <div 
              className={`group relative flex items-center justify-between p-4 rounded-lg border transition-all duration-200 ${
                integrationsCompleted.googleDrive
                  ? 'bg-white border-zinc-900 shadow-sm' 
                  : 'bg-white border-zinc-200 hover:border-zinc-300'
              }`}
            >
              <div className="flex-1 pr-4">
                <div className="flex items-center gap-2">
                  <h3 className="font-medium text-zinc-900">Google Drive Integration</h3>
                  {integrationsCompleted.googleDrive && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                      Connected
                    </span>
                  )}
                </div>
                <p className="text-zinc-500 mt-1 text-sm">
                  Connect your document repository. This is where Google Drive fits for accessing docs, slides, and other unstructured knowledge.
                </p>
              </div>

              <button
                type="button"
                onClick={() => handleConnect('googleDrive')}
                disabled={integrationsCompleted.googleDrive || connectingProvider === 'googleDrive'}
                className={`flex-shrink-0 inline-flex items-center justify-center px-4 py-2 border text-sm font-medium rounded-md shadow-sm focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-zinc-900 transition-colors ${
                  integrationsCompleted.googleDrive
                    ? 'border-transparent text-zinc-400 bg-zinc-100 cursor-default'
                    : 'border-zinc-300 text-zinc-700 bg-white hover:bg-zinc-50'
                }`}
              >
                {connectingProvider === 'googleDrive' ? (
                  <span className="flex items-center">
                     <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-zinc-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Connecting...
                  </span>
                ) : integrationsCompleted.googleDrive ? (
                  'Connected'
                ) : (
                  'Connect Drive'
                )}
              </button>
            </div>
          </div>

          {/* Footer Action */}
          <div className="px-8 py-6 bg-zinc-50 border-t border-zinc-200 flex justify-end">
            <button
              type="submit"
              disabled={loading}
              className="inline-flex justify-center rounded-md border border-transparent bg-zinc-900 py-2.5 px-6 text-sm font-medium text-white shadow-sm hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:ring-offset-2 disabled:bg-zinc-400 disabled:cursor-not-allowed transition-all duration-200"
            >
              {loading ? (
                <span className="flex items-center">
                  <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Processing...
                </span>
              ) : (
                'Complete Onboarding'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
