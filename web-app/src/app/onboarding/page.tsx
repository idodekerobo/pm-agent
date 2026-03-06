'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';
import { createClient } from '@/lib/supabaseClient';

import { ROLES, USE_CASE_OPTIONS } from '@/lib/profileOptions';

const INTEGRATIONS = [
  {
    key: 'github',
    name: 'GitHub',
    abbr: 'GH',
    color: '#24292F',
    value: 'Your agent can create issues and stay in sync with your codebase — directly from a spec.',
  },
  {
    key: 'slack',
    name: 'Slack',
    abbr: 'SL',
    color: '#E01E5A',
    value: 'Get updates and trigger tasks from Slack. Your agent meets your team where they already work.',
  },
  {
    key: 'notion',
    name: 'Notion',
    abbr: 'NT',
    color: '#191919',
    value: 'Read and write your knowledge base. Sync decisions, specs, and context automatically.',
  },
  {
    key: 'google',
    name: 'Google Drive',
    abbr: 'GD',
    color: '#34A853',
    value: 'Access Docs, Sheets, and Slides. Your agent can draft, update, and analyze documents directly.',
  },
  {
    key: 'linear',
    name: 'Linear',
    abbr: 'LN',
    color: '#5E6AD2',
    value: 'Create and triage issues automatically. Your agent can manage your full backlog and sprint cycles.',
  },
];

type Step = 1 | 2 | 3;

interface ProfileData {
  fullName: string;
  role: string;
  companyName: string;
  companyUrl: string;
  productDescription: string;
  useCases: string[];
  useCaseContext: string;
}

interface IntegrationStatus {
  [key: string]: boolean;
}

function StepIndicator({ current }: { current: Step }) {
  return (
    <div className="flex items-center gap-2">
      {([1, 2, 3] as Step[]).map((s) => (
        <div key={s} className="flex items-center gap-2">
          <div
            className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-medium transition-colors ${
              s === current
                ? 'bg-zinc-900 text-white'
                : s < current
                ? 'bg-zinc-200 text-zinc-500'
                : 'border border-zinc-200 text-zinc-400'
            }`}
          >
            {s < current ? (
              <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
                <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            ) : (
              s
            )}
          </div>
          {s < 3 && <div className={`h-px w-6 ${s < current ? 'bg-zinc-300' : 'bg-zinc-100'}`} />}
        </div>
      ))}
    </div>
  );
}

const STEP_LABELS: Record<Step, { title: string; subtitle: string; note?: string }> = {
  1: { title: 'About You', subtitle: 'Help your agent understand who you are.' },
  2: { title: 'Your Product', subtitle: 'This helps the agent give you more personalized answers.' },
  3: {
    title: 'Connect Your Tools',
    subtitle: 'Extend all the places your agent can help you work.',
    note: 'All integrations are optional — you can connect more later in Settings.',
  },
};

export default function OnboardingPage() {
  const [step, setStep] = useState<Step>(1);
  const [profile, setProfile] = useState<ProfileData>({
    fullName: '',
    role: '',
    companyName: '',
    companyUrl: '',
    productDescription: '',
    useCases: [],
    useCaseContext: '',
  });
  const [integrations, setIntegrations] = useState<IntegrationStatus>({});
  const [connectingProvider, setConnectingProvider] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const router = useRouter();
  const { user } = useAuth();
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL;

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'integration_success') {
        setIntegrations((prev) => ({ ...prev, [event.data.provider]: true }));
        setConnectingProvider(null);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const toggleUseCase = (option: string) => {
    setProfile((prev) => ({
      ...prev,
      useCases: prev.useCases.includes(option)
        ? prev.useCases.filter((u) => u !== option)
        : [...prev.useCases, option],
    }));
  };

  const handleConnect = (providerKey: string) => {
    if (!user?.id) return;
    setConnectingProvider(providerKey);
    const providerParam = providerKey === 'google' ? 'google' : providerKey;
    window.open(`${apiBase}/integrations/${providerParam}/connect?user_id=${user.id}`, '_blank', 'width=600,height=700');
  };

  const validateStep1 = () => {
    if (!profile.fullName.trim()) return 'Full name is required.';
    if (!profile.role) return 'Please select your role.';
    if (!profile.companyName.trim()) return 'Company name is required.';
    if (profile.companyUrl && !/^https?:\/\/.+/.test(profile.companyUrl)) return 'Please enter a valid URL (starting with https://).';
    return '';
  };

  const validateStep2 = () => {
    if (!profile.productDescription.trim()) return 'Please describe your product.';
    return '';
  };

  const handleNext = () => {
    setError('');
    if (step === 1) {
      const err = validateStep1();
      if (err) { setError(err); return; }
    }
    if (step === 2) {
      const err = validateStep2();
      if (err) { setError(err); return; }
    }
    setStep((s) => (s + 1) as Step);
  };

  const handleBack = () => {
    setError('');
    setStep((s) => (s - 1) as Step);
  };

  const handleFinish = async () => {
    setError('');
    setSubmitting(true);
    try {
      const supabase = createClient();
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token || '';

      await fetch(`${apiBase}/user/profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          full_name: profile.fullName,
          role: profile.role,
          company_name: profile.companyName || null,
          company_url: profile.companyUrl || null,
          product_description: profile.productDescription || null,
          use_case: [
            ...profile.useCases,
            ...(profile.useCaseContext.trim() ? [profile.useCaseContext.trim()] : []),
          ].join(', ') || null,
        }),
      });

      router.push('/chat');
    } catch {
      setError('Something went wrong. Please try again.');
      setSubmitting(false);
    }
  };

  const { title, subtitle, note } = STEP_LABELS[step];

  return (
    <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-4 font-sans text-zinc-900">
      <div className="w-full max-w-xl bg-white border border-zinc-200 shadow-sm rounded-xl overflow-hidden">

        {/* Header */}
        <div className="px-8 py-6 border-b border-zinc-100">
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-zinc-900">{title}</h1>
              <p className="mt-1 text-sm text-zinc-500">{subtitle}</p>
              {note && <p className="mt-0.5 text-xs text-zinc-400">{note}</p>}
            </div>
            <StepIndicator current={step} />
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mx-8 mt-5 rounded-md bg-red-50 border border-red-100 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Step 1 — About You */}
        {step === 1 && (
          <div className="px-8 py-6 space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-sm font-medium text-zinc-700 mb-1.5">Full Name</label>
                <input
                  type="text"
                  value={profile.fullName}
                  onChange={(e) => setProfile({ ...profile, fullName: e.target.value })}
                  className="block w-full rounded-md border border-zinc-300 bg-zinc-50/50 px-3 py-2.5 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                  placeholder="Ada Lovelace"
                />
              </div>

              <div className="col-span-2 sm:col-span-1">
                <label className="block text-sm font-medium text-zinc-700 mb-1.5">Role</label>
                <select
                  value={profile.role}
                  onChange={(e) => setProfile({ ...profile, role: e.target.value })}
                  className="block w-full rounded-md border border-zinc-300 bg-zinc-50/50 px-3 py-2.5 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                >
                  <option value="">Select your role</option>
                  {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>

              <div className="col-span-2 sm:col-span-1">
                <label className="block text-sm font-medium text-zinc-700 mb-1.5">Company Name</label>
                <input
                  type="text"
                  value={profile.companyName}
                  onChange={(e) => setProfile({ ...profile, companyName: e.target.value })}
                  className="block w-full rounded-md border border-zinc-300 bg-zinc-50/50 px-3 py-2.5 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                  placeholder="Acme Inc."
                />
              </div>

              <div className="col-span-2 sm:col-span-1">
                <label className="block text-sm font-medium text-zinc-700 mb-1.5">Company URL <span className="text-zinc-400 font-normal">(optional)</span></label>
                <input
                  type="url"
                  value={profile.companyUrl}
                  onChange={(e) => setProfile({ ...profile, companyUrl: e.target.value })}
                  className="block w-full rounded-md border border-zinc-300 bg-zinc-50/50 px-3 py-2.5 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                  placeholder="https://acme.com"
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 2 — Your Product */}
        {step === 2 && (
          <div className="px-8 py-6 space-y-5">
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">What does your product do?</label>
              <textarea
                value={profile.productDescription}
                onChange={(e) => setProfile({ ...profile, productDescription: e.target.value })}
                rows={4}
                className="block w-full rounded-md border border-zinc-300 bg-zinc-50/50 px-3 py-2.5 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 resize-none"
                placeholder="We build a B2B SaaS platform that helps logistics teams track shipments in real time..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-3">How do you plan to use PM Agent? <span className="text-zinc-400 font-normal">(select all that apply)</span></label>
              <div className="grid grid-cols-2 gap-2">
                {USE_CASE_OPTIONS.map((option) => {
                  const selected = profile.useCases.includes(option);
                  return (
                    <button
                      key={option}
                      type="button"
                      onClick={() => toggleUseCase(option)}
                      className={`rounded-md border px-3 py-2.5 text-left text-sm transition-colors ${
                        selected
                          ? 'border-zinc-900 bg-zinc-900 text-white'
                          : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50'
                      }`}
                    >
                      {option}
                    </button>
                  );
                })}
              </div>
              <textarea
                value={profile.useCaseContext}
                onChange={(e) => setProfile({ ...profile, useCaseContext: e.target.value })}
                rows={3}
                className="mt-3 block w-full rounded-md border border-zinc-300 bg-zinc-50/50 px-3 py-2.5 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 resize-none"
                placeholder="Anything else?"
              />
            </div>
          </div>
        )}

        {/* Step 3 — Connect Tools */}
        {step === 3 && (
          <div className="px-8 py-6 space-y-2.5">
            {INTEGRATIONS.map((integration) => {
              const connected = !!integrations[integration.key];
              const connecting = connectingProvider === integration.key;
              return (
                <div
                  key={integration.key}
                  className={`flex items-center gap-4 rounded-lg border p-4 transition-colors ${
                    connected ? 'border-zinc-900 bg-zinc-50' : 'border-zinc-200 bg-white'
                  }`}
                >
                  <div
                    className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg text-white"
                    style={{ backgroundColor: integration.color }}
                  >
                    <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', fontFamily: 'var(--font-geist-mono)' }}>
                      {integration.abbr}
                    </span>
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-zinc-900">{integration.name}</p>
                      {connected && (
                        <span className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-green-100 text-green-700">
                          Connected
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-zinc-500 leading-relaxed">{integration.value}</p>
                  </div>

                  <button
                    type="button"
                    onClick={() => !connected && handleConnect(integration.key)}
                    disabled={connected || connecting}
                    className={`flex-shrink-0 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                      connected
                        ? 'border-transparent bg-transparent text-zinc-400 cursor-default'
                        : 'border-zinc-300 bg-white text-zinc-600 hover:border-zinc-400 hover:text-zinc-900'
                    }`}
                  >
                    {connecting ? (
                      <span className="flex items-center gap-1.5">
                        <svg className="animate-spin h-3 w-3" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        Connecting...
                      </span>
                    ) : connected ? (
                      'Connected'
                    ) : (
                      'Connect'
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-zinc-100 bg-zinc-50 px-8 py-4">
          <button
            type="button"
            onClick={handleBack}
            className={`text-sm font-medium text-zinc-500 hover:text-zinc-800 transition-colors ${step === 1 ? 'invisible' : ''}`}
          >
            ← Back
          </button>

          {step < 3 ? (
            <button
              type="button"
              onClick={handleNext}
              className="rounded-md bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-800 transition-colors"
            >
              Continue →
            </button>
          ) : (
            <button
              type="button"
              onClick={handleFinish}
              disabled={submitting}
              className="rounded-md bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:bg-zinc-400 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Finishing...
                </span>
              ) : (
                'Finish Setup'
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
