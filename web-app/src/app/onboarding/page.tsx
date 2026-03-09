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

type Step = 1 | 2 | 3 | 4;

interface ProfileData {
  fullName: string;
  role: string;
  companyName: string;
  companyUrl: string;
  productName: string;
  productDescription: string;
  useCases: string[];
  useCaseContext: string;
}

interface IntegrationStatus {
  [key: string]: boolean;
}

const STORAGE_KEY = 'onboarding_profile';

function StepIndicator({ current }: { current: Step }) {
  return (
    <div className="flex items-center gap-2">
      {([1, 2, 3, 4] as Step[]).map((s) => (
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
          {s < 4 && <div className={`h-px w-6 ${s < current ? 'bg-zinc-300' : 'bg-zinc-100'}`} />}
        </div>
      ))}
    </div>
  );
}

const STEP_LABELS: Record<Step, { title: string; subtitle: string; note?: string }> = {
  1: { title: 'About You', subtitle: 'Help your agent understand who you are.' },
  2: { title: 'Your Product', subtitle: 'This helps the agent give you more personalized answers.' },
  3: { title: 'Create Your Account', subtitle: 'Save your progress and activate your workspace.' },
  4: {
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
    productName: '',
    productDescription: '',
    useCases: [],
    useCaseContext: '',
  });
  const [integrations, setIntegrations] = useState<IntegrationStatus>({});
  const [connectingProvider, setConnectingProvider] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const [resuming, setResuming] = useState(false);

  const router = useRouter();
  const { user, loading } = useAuth();
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL;

  // When user returns after confirming their email, this effect fires.
  // AuthContext sets `user` once the session is established from the
  // /auth/callback exchange, then redirects back to /onboarding.
  // We pick up the saved profile from localStorage, submit it, and
  // advance to step 4 (integrations).
  useEffect(() => {
    if (loading) return;
    if (!user) return;

    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return;

    let parsed: ProfileData;
    try {
      parsed = JSON.parse(saved) as ProfileData;
    } catch {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }

    localStorage.removeItem(STORAGE_KEY);
    setProfile(parsed);
    setResuming(true);

    const submitAndAdvance = async () => {
      try {
        const supabase = createClient();
        const { data: { session } } = await supabase.auth.getSession();
        const token = session?.access_token ?? '';

        await fetch(`${apiBase}/user/profile`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            full_name: parsed.fullName,
            role: parsed.role,
            company_name: parsed.companyName || null,
            company_url: parsed.companyUrl || null,
            product_name: parsed.productName || null,
            product_description: parsed.productDescription || null,
            use_case: [
              ...parsed.useCases,
              ...(parsed.useCaseContext.trim() ? [parsed.useCaseContext.trim()] : []),
            ].join(', ') || null,
          }),
        });
      } finally {
        setResuming(false);
        setStep(4);
      }
    };

    submitAndAdvance();
  }, [user, loading]); // eslint-disable-line react-hooks/exhaustive-deps

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
    window.open(`${apiBase}/integrations/${providerKey}/connect?user_id=${user.id}`, '_blank', 'width=600,height=700');
  };

  const validateStep1 = () => {
    if (!profile.fullName.trim()) return 'Full name is required.';
    if (!profile.role) return 'Please select your role.';
    if (profile.companyUrl && !/^https?:\/\/.+/.test(profile.companyUrl)) return 'Please enter a valid URL (starting with https://).';
    return '';
  };

  const validateStep2 = () => {
    if (!profile.productDescription.trim()) return 'Please describe your product.';
    return '';
  };

  const validateStep3 = () => {
    if (!email.trim()) return 'Email is required.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Please enter a valid email address.';
    if (password.length < 8) return 'Password must be at least 8 characters.';
    return '';
  };

  const handleSignUp = async () => {
    const err = validateStep3();
    if (err) { setError(err); return; }
    setError('');
    setSubmitting(true);
    try {
      // Persist profile so we can recover it after email confirmation redirect
      localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));

      const supabase = createClient();
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          // /auth/callback defaults next to /onboarding, which is where we
          // want users to land so the useEffect above can pick up from localStorage.
          emailRedirectTo: `${process.env.NEXT_PUBLIC_WEB_APP_BASE_URL}/auth/callback`,
        },
      });

      if (signUpError) throw signUpError;
      setAwaitingConfirmation(true);
    } catch (e: unknown) {
      localStorage.removeItem(STORAGE_KEY);
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleNext = () => {
    setError('');
    if (step === 1) {
      const err = validateStep1();
      if (err) { setError(err); return; }
      setStep(2);
      return;
    }
    if (step === 2) {
      const err = validateStep2();
      if (err) { setError(err); return; }
      setStep(3);
      return;
    }
    if (step === 3) {
      handleSignUp();
      return;
    }
  };

  const handleBack = () => {
    setError('');
    setStep((s) => (s - 1) as Step);
  };

  const handleFinish = () => {
    router.push('/chat');
  };

  // Resuming state: user just returned from email confirmation, submitting profile
  if (resuming) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-4 font-sans text-zinc-900">
        <div className="w-full max-w-xl bg-white border border-zinc-200 shadow-sm rounded-xl px-8 py-12 flex flex-col items-center gap-4">
          <svg className="animate-spin h-6 w-6 text-zinc-400" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <p className="text-sm text-zinc-500">Setting up your workspace…</p>
        </div>
      </div>
    );
  }

  // Awaiting email confirmation state
  if (awaitingConfirmation) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-4 font-sans text-zinc-900">
        <div className="w-full max-w-xl bg-white border border-zinc-200 shadow-sm rounded-xl overflow-hidden">
          <div className="px-8 py-6 border-b border-zinc-100">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Check your email</h1>
                <p className="mt-1 text-sm text-zinc-500">We sent a confirmation link to <span className="font-medium text-zinc-800">{email}</span>.</p>
              </div>
              <StepIndicator current={3} />
            </div>
          </div>
          <div className="px-8 py-10 flex flex-col items-center gap-4 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-zinc-100">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-600">
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <path d="m2 7 10 7 10-7" />
              </svg>
            </div>
            <div>
              <p className="text-sm text-zinc-700 max-w-xs">
                Click the link in your email to confirm your account. Once confirmed, you&apos;ll be brought right back here to finish setup.
              </p>
              <p className="mt-3 text-xs text-zinc-400">Didn&apos;t receive it? Check your spam folder.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

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
                <label className="block text-sm font-medium text-zinc-700 mb-1.5">Company Name <span className="text-zinc-400 font-normal">(optional)</span></label>
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
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">Product Name(s)</label>
              <input
                type="text"
                value={profile.productName}
                onChange={(e) => setProfile({ ...profile, productName: e.target.value })}
                className="block w-full rounded-md border border-zinc-300 bg-zinc-50/50 px-3 py-2.5 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                placeholder="Acme Shipment Tracker"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">What does your product(s) do?</label>
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

        {/* Step 3 — Create Account */}
        {step === 3 && (
          <div className="px-8 py-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="block w-full rounded-md border border-zinc-300 bg-zinc-50/50 px-3 py-2.5 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                placeholder="ada@acme.com"
                autoComplete="email"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-zinc-700 mb-1.5">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="block w-full rounded-md border border-zinc-300 bg-zinc-50/50 px-3 py-2.5 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                placeholder="At least 8 characters"
                autoComplete="new-password"
              />
            </div>
            <p className="text-xs text-zinc-400">
              Already have an account?{' '}
              <a href="/auth/sign-in" className="text-zinc-600 underline underline-offset-2 hover:text-zinc-900">
                Sign in
              </a>
            </p>
          </div>
        )}

        {/* Step 4 — Connect Tools */}
        {step === 4 && (
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

          {step < 4 ? (
            <button
              type="button"
              onClick={handleNext}
              disabled={submitting}
              className="rounded-md bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:bg-zinc-400 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  {step === 3 ? 'Creating account…' : 'Loading…'}
                </span>
              ) : step === 3 ? (
                'Create Account →'
              ) : (
                'Continue →'
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleFinish}
              className="rounded-md bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-800 transition-colors"
            >
              Finish Setup
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
