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
    note: 'After connecting, invite the agent to any Slack channels you want it active in.',
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
  {
    key: 'claude-code',
    name: 'Claude Code',
    abbr: 'CC',
    color: '#D97756',
    value: 'Use your own Anthropic API key to power your agent with AI coding capabilities.',
    isByok: true,
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
  const [byokExpanded, setByokExpanded] = useState(false);
  const [byokToken, setByokToken] = useState('');
  const [byokSaving, setByokSaving] = useState(false);
  const [byokError, setByokError] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);

  const router = useRouter();
  const { user, session, loading } = useAuth();
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL;

  // When the user confirms their email in the /auth/confirmed tab, that tab
  // handles profile submission and clears localStorage. This tab just needs to
  // detect that a session now exists (via onAuthStateChange) and advance to step 4.
  useEffect(() => {
    if (loading) return;
    if (!user) return;

    const awaiting = localStorage.getItem('onboarding_awaiting') === 'true';
    if (!awaiting) return;

    localStorage.removeItem('onboarding_awaiting');
    setAwaitingConfirmation(false);
    setStep(4);
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
    if (providerKey === 'claude-code') {
      setByokExpanded(true);
      setByokError('');
      return;
    }
    setConnectingProvider(providerKey);
    window.open(`${apiBase}/integrations/${providerKey}/connect?user_id=${user.id}`, '_blank', 'width=600,height=700');
  };

  const handleSaveClaudeCodeToken = async () => {
    if (!byokToken.trim()) {
      setByokError('Token is required.');
      return;
    }
    setByokSaving(true);
    setByokError('');
    try {
      const accessToken = session?.access_token ?? '';
      const res = await fetch(`${apiBase}/integrations/claude-code/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ token: byokToken.trim() }),
      });
      if (!res.ok) throw new Error();
      setIntegrations((prev) => ({ ...prev, 'claude-code': true }));
      setByokExpanded(false);
      setByokToken('');
    } catch {
      setByokError('Failed to save token. Please try again.');
    } finally {
      setByokSaving(false);
    }
  };

  const validateStep1 = () => {
    if (!profile.fullName.trim()) return 'Full name is required.';
    if (!profile.role) return 'Please select your role.';
    if (profile.companyUrl) {
      try { new URL(`https://${profile.companyUrl.replace(/^https?:\/\//, '')}`); }
      catch { return 'Please enter a valid company URL (e.g. acme.com).'; }
    }
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
      localStorage.setItem('onboarding_awaiting', 'true');
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
      localStorage.removeItem('onboarding_awaiting');
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
                <div className="flex items-center rounded-md border border-zinc-300 bg-zinc-50/50 focus-within:border-zinc-900 focus-within:ring-1 focus-within:ring-zinc-900">
                  <span className="flex items-center self-stretch pl-3 pr-2 text-sm text-zinc-400 select-none bg-zinc-100 border-r border-zinc-300 rounded-l-md">https://</span>
                  <input
                    type="text"
                    value={(profile.companyUrl || '').replace(/^https?:\/\//, '')}
                    onChange={(e) => setProfile({ ...profile, companyUrl: e.target.value })}
                    className="flex-1 bg-transparent py-2.5 pl-3 pr-3 text-sm text-zinc-900 focus:outline-none"
                    placeholder="acme.com"
                  />
                </div>
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
              const isByok = 'isByok' in integration && integration.isByok;
              const isByokOpen = isByok && byokExpanded && !connected;
              return (
                <div
                  key={integration.key}
                  className={`rounded-lg border overflow-hidden transition-colors ${
                    connected ? 'border-zinc-900 bg-zinc-50' : 'border-zinc-200 bg-white'
                  }`}
                >
                  <div className="flex items-center gap-4 p-4">
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
                      {'note' in integration && integration.note && (
                        <p className="mt-1 text-[10px] text-amber-600 leading-relaxed">{integration.note}</p>
                      )}
                    </div>

                    {isByok ? (
                      <button
                        type="button"
                        onClick={() => { if (!connected) { setByokExpanded((o) => !o); setByokError(''); } }}
                        disabled={connected}
                        className={`flex-shrink-0 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
                          connected
                            ? 'border-transparent bg-transparent text-zinc-400 cursor-default'
                            : 'border-zinc-300 bg-white text-zinc-600 hover:border-zinc-400 hover:text-zinc-900'
                        }`}
                      >
                        {connected ? 'Connected' : isByokOpen ? 'Cancel' : 'Connect'}
                      </button>
                    ) : (
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
                    )}
                  </div>

                  {/* Inline BYOK token form */}
                  {isByokOpen && (
                    <div className="border-t border-zinc-100 bg-zinc-50 px-4 py-3 space-y-3">
                      <div>
                        <p className="text-xs font-medium text-zinc-700 mb-2">How to get your API key:</p>
                        <ol className="space-y-1 text-xs text-zinc-500 list-none">
                          {/* <li className="flex items-start gap-2">
                            <span className="flex-shrink-0 flex h-4 w-4 items-center justify-center rounded-full bg-zinc-200 text-[10px] font-semibold text-zinc-600 mt-0.5">1</span>
                            <span>If not already installed: <code className="rounded bg-zinc-200 px-1 py-0.5 font-mono text-[10px] text-zinc-700">npm install -g @anthropic-ai/claude-code</code> — <a href="https://code.claude.com/docs/en/quickstart" target="_blank" rel="noopener noreferrer" className="text-zinc-600 underline underline-offset-2 hover:text-zinc-900">see details</a></span>
                          </li> */}
                          <li className="flex items-start gap-2">
                            <span className="flex-shrink-0 flex h-4 w-4 items-center justify-center rounded-full bg-zinc-200 text-[10px] font-semibold text-zinc-600 mt-0.5">1</span>
                            <span>Go to <a href="https://platform.claude.com/settings/keys" target="_blank" rel="noopener noreferrer" className="text-zinc-600 underline underline-offset-2 hover:text-zinc-900">platform.claude.com/settings/keys</a> and create a new API key</span>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="flex-shrink-0 flex h-4 w-4 items-center justify-center rounded-full bg-zinc-200 text-[10px] font-semibold text-zinc-600 mt-0.5">2</span>
                            Copy the key — it starts with <code className="rounded bg-zinc-200 px-1 py-0.5 font-mono text-[10px] text-zinc-700">sk-ant-...</code>
                          </li>
                          <li className="flex items-start gap-2">
                            <span className="flex-shrink-0 flex h-4 w-4 items-center justify-center rounded-full bg-zinc-200 text-[10px] font-semibold text-zinc-600 mt-0.5">3</span>
                            Paste it below — your key is encrypted and stored securely
                          </li>
                        </ol>
                        <div className="mt-4 flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-3 py-3">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 flex-shrink-0 text-amber-500">
                            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
                          </svg>
                          <p className="text-[10px] text-amber-700 leading-relaxed">Coding tasks are billed directly to your Anthropic account at API pricing. Charges apply each time the coding agent runs.</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="password"
                          value={byokToken}
                          onChange={(e) => setByokToken(e.target.value)}
                          placeholder="sk-ant-..."
                          className="flex-1 rounded-md border border-zinc-300 bg-white px-3 py-2 text-xs text-zinc-900 placeholder-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                        />
                        <button
                          type="button"
                          onClick={handleSaveClaudeCodeToken}
                          disabled={byokSaving}
                          className="flex-shrink-0 rounded-md bg-zinc-900 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-zinc-800 disabled:bg-zinc-400"
                        >
                          {byokSaving ? 'Saving...' : 'Save'}
                        </button>
                      </div>
                      {byokError && <p className="text-xs text-red-600">{byokError}</p>}
                    </div>
                  )}
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
