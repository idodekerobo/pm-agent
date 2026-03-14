'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';
import { createClient } from '@/lib/supabaseClient';
import { ROLES } from '@/lib/profileOptions';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

// ---------------------------------------------------------------------------
// Integrations config
// ---------------------------------------------------------------------------

const INTEGRATIONS = [
  {
    key: 'github',
    name: 'GitHub',
    abbr: 'GH',
    color: '#24292F',
    value: 'Open PRs, create issues, and sync your codebase directly from chat.',
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
    value: 'Read and write your knowledge base. Sync docs and database context automatically.',
  },
  {
    key: 'google',
    name: 'Google Drive',
    abbr: 'GD',
    color: '#34A853',
    value: 'Write Docs and Sheets directly. Your agent can use Drive as a live knowledge base.',
    comingSoon: true,
  },
  {
    key: 'linear',
    name: 'Linear',
    abbr: 'LN',
    color: '#5E6AD2',
    value: 'Create and triage issues automatically. Manage your full backlog and sprint cycles from chat.',
  },
  {
    key: 'claude-code',
    name: 'Claude Code',
    abbr: 'CC',
    color: '#D97756',
    value: 'Use your own Anthropic API key to power your agent with AI coding capabilities.',
    isByok: true,
  },
  {
    key: 'figma',
    name: 'Figma',
    abbr: 'FG',
    color: '#F24E1E',
    value: 'Reference and annotate design files directly in your specs and PRDs.',
    comingSoon: true,
  },
  {
    key: 'posthog',
    name: 'PostHog',
    abbr: 'PH',
    color: '#FF5A31',
    value: 'Pull product analytics and user behavior into your planning context automatically.',
    comingSoon: true,
  },
  {
    key: 'jira',
    name: 'Jira',
    abbr: 'JR',
    color: '#0052CC',
    value: 'Sync issues and epics. Your agent can create and update Jira tickets from a spec.',
    comingSoon: true,
  },
];

// ---------------------------------------------------------------------------
// Chip options
// ---------------------------------------------------------------------------

const FOCUS_CHIPS = [
  'Shipping features',
  'Reducing bugs',
  'Growing users',
  'Cutting costs',
  'Managing stakeholders',
];

const ACTIVITY_CHIPS = [
  'Design & specs',
  'Data & analytics',
  'Customer support',
  'Engineering collaboration',
  'Strategy & planning',
];

// ---------------------------------------------------------------------------
// Templated reactions
// ---------------------------------------------------------------------------

const FOCUS_REACTIONS: Record<string, string> = {
  'Shipping features': "Shipping focus — I'll keep sprint planning, spec writing, and engineering handoffs front of mind.",
  'Reducing bugs': "Bug reduction focus — I'll prioritize helping you triage issues and write clear bug specs.",
  'Growing users': "Growth focus — I'll keep user metrics, retention, and acquisition context front of mind.",
  'Cutting costs': "Cost focus — I'll look for opportunities to surface efficiency signals in your planning.",
  'Managing stakeholders': "Stakeholder focus — I'll help you communicate clearly and keep everyone aligned.",
};

const ACTIVITY_REACTIONS: Record<string, string> = {
  'Design & specs': "Got it — spec writing and design alignment will be where I add the most value for you.",
  'Data & analytics': "Got it — I'll lean into helping you interpret data and turn it into decisions.",
  'Customer support': "Got it — I'll help you turn customer signals into actionable product insights.",
  'Engineering collaboration': "Got it — I'll focus on making engineering handoffs and technical planning smoother.",
  'Strategy & planning': "Got it — I'll help you think through roadmaps, trade-offs, and strategic decisions.",
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Step = 1 | 2 | 3 | 4 | 5;

interface IntegrationStatus {
  [key: string]: boolean;
}

const STORAGE_KEY = 'onboarding_profile';
const DRAFT_KEY = 'onboarding_draft';
const DRAFT_EXPIRY_MS = 18 * 60 * 60 * 1000; // 18 hours

// ---------------------------------------------------------------------------
// Step indicator
// ---------------------------------------------------------------------------

function StepIndicator({ current }: { current: Step }) {
  return (
    <div className="flex items-center gap-2">
      {([1, 2, 3, 4, 5] as Step[]).map((s) => (
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
          {s < 5 && <div className={`h-px w-6 ${s < current ? 'bg-zinc-300' : 'bg-zinc-100'}`} />}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

function OnboardingPageInner() {
  const [step, setStep] = useState<Step>(1);
  const searchParams = useSearchParams();
  const demoToken = searchParams.get('demo_token');
  const demoCompanyUrl = searchParams.get('company_url');

  // Step 1 — URL + name
  const [fullName, setFullName] = useState('');
  const [companyUrl, setCompanyUrl] = useState(
    demoCompanyUrl ? demoCompanyUrl.replace(/^https?:\/\//, '') : ''
  );

  // Scrape state
  const [scrapeStatus, setScrapeStatus] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [scrapeObservations, setScrapeObservations] = useState('');
  const [scrapeConfirmed, setScrapeConfirmed] = useState(false);
  const [showCorrection, setShowCorrection] = useState(false);
  const [correction, setCorrection] = useState('');
  const [correctionSubmitted, setCorrectionSubmitted] = useState(false);
  const [showScrapeDetail, setShowScrapeDetail] = useState(false);

  // Step 2 — chips
  const [currentFocus, setCurrentFocus] = useState<string[]>([]);
  const [focusCustom, setFocusCustom] = useState('');
  const [showFocusCustom, setShowFocusCustom] = useState(false);
  const [dailyActivities, setDailyActivities] = useState<string[]>([]);
  const [activityCustom, setActivityCustom] = useState('');
  const [showActivityCustom, setShowActivityCustom] = useState(false);

  // Step 3 — role
  const [role, setRole] = useState('');
  const [roleOther, setRoleOther] = useState('');

  // Step 4 — sign up
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Step 5 — connect tools
  const [finishing, setFinishing] = useState(false);
  const [integrations, setIntegrations] = useState<IntegrationStatus>({});
  const [connectingProvider, setConnectingProvider] = useState<string | null>(null);
  const [byokExpanded, setByokExpanded] = useState(false);
  const [byokToken, setByokToken] = useState('');
  const [byokSaving, setByokSaving] = useState(false);
  const [byokError, setByokError] = useState('');

  const [error, setError] = useState('');

  const scrapeObservationsRef = useRef('');

  const router = useRouter();
  const { user, session, loading } = useAuth();
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL;

  // When demo token is present, auto-trigger scrape on mount
  useEffect(() => {
    if (demoToken && demoCompanyUrl && scrapeStatus === 'idle' && fullName === '') {
      // URL is pre-filled; wait for user to enter their name before scraping
      // (name is needed for the LLM prompt). The Analyze button handles this.
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Detect email confirmation return
  useEffect(() => {
    if (loading) return;
    if (!user) return;
    const awaiting = localStorage.getItem('onboarding_awaiting') === 'true';
    if (!awaiting) return;
    localStorage.removeItem('onboarding_awaiting');
    setAwaitingConfirmation(false);
    setStep(5);
  }, [user, loading]); // eslint-disable-line react-hooks/exhaustive-deps

  // Restore in-progress draft from localStorage on mount (18hr expiry)
  useEffect(() => {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return;
    try {
      const draft = JSON.parse(raw);
      if (!draft.ts || Date.now() - draft.ts > DRAFT_EXPIRY_MS) {
        localStorage.removeItem(DRAFT_KEY);
        return;
      }
      if (draft.fullName) setFullName(draft.fullName);
      if (draft.companyUrl) setCompanyUrl(draft.companyUrl);
      if (draft.scrapeObservations) {
        setScrapeObservations(draft.scrapeObservations);
        scrapeObservationsRef.current = draft.scrapeObservations;
        setScrapeStatus('done');
      }
      if (draft.scrapeConfirmed) setScrapeConfirmed(draft.scrapeConfirmed);
      if (draft.correctionSubmitted) setCorrectionSubmitted(draft.correctionSubmitted);
      if (draft.correction) setCorrection(draft.correction);
      if (draft.currentFocus?.length) setCurrentFocus(draft.currentFocus);
      if (draft.dailyActivities?.length) setDailyActivities(draft.dailyActivities);
      if (draft.role) setRole(draft.role);
      if (draft.roleOther) setRoleOther(draft.roleOther);
      if (draft.step && draft.step <= 3) setStep(draft.step);
    } catch {
      localStorage.removeItem(DRAFT_KEY);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Save in-progress draft whenever key state changes
  useEffect(() => {
    // Don't persist if we're in the sign-up confirmation flow or finished
    if (awaitingConfirmation) return;
    const draft = {
      ts: Date.now(),
      step,
      fullName,
      companyUrl,
      scrapeObservations: scrapeObservationsRef.current,
      scrapeConfirmed,
      correctionSubmitted,
      correction,
      currentFocus,
      dailyActivities,
      role,
      roleOther,
    };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }, [step, fullName, companyUrl, scrapeConfirmed, correctionSubmitted, correction, currentFocus, dailyActivities, role, roleOther, awaitingConfirmation]); // eslint-disable-line react-hooks/exhaustive-deps

  // Integration success messages from OAuth popup
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

  // ---------------------------------------------------------------------------
  // Scrape
  // ---------------------------------------------------------------------------

  const runScrape = async () => {
    if (!fullName.trim()) {
      setError('Please enter your name first.');
      return;
    }
    if (!companyUrl.trim()) {
      setError('Please enter your company or product URL.');
      return;
    }
    setError('');
    setScrapeStatus('loading');
    setScrapeObservations('');
    scrapeObservationsRef.current = '';
    setScrapeConfirmed(false);
    setShowCorrection(false);
    setCorrection('');
    setCorrectionSubmitted(false);

    try {
      const normalized = companyUrl.replace(/^https?:\/\//, '');
      const res = await fetch(`${apiBase}/onboarding/scrape`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: normalized, full_name: fullName.trim() }),
      });

      if (!res.ok || !res.body) {
        setScrapeStatus('error');
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === 'message') {
              scrapeObservationsRef.current += event.content;
              setScrapeObservations((prev) => prev + event.content);
            } else if (event.type === 'done') {
              setScrapeStatus('done');
            } else if (event.type === 'error') {
              setScrapeStatus('error');
            }
          } catch {
            // malformed SSE line — skip
          }
        }
      }

      if (scrapeObservationsRef.current.trim()) {
        setScrapeStatus('done');
      }
    } catch {
      setScrapeStatus('error');
    }
  };

  const handleConfirmScrape = () => {
    setScrapeConfirmed(true);
    setCorrectionSubmitted(false);
  };

  const handleSubmitCorrection = () => {
    if (!correction.trim()) return;
    setCorrectionSubmitted(true);
    setShowCorrection(false);
  };

  // ---------------------------------------------------------------------------
  // Chip helpers
  // ---------------------------------------------------------------------------

  const toggleActivity = (chip: string) => {
    setDailyActivities((prev) =>
      prev.includes(chip) ? prev.filter((a) => a !== chip) : [...prev, chip]
    );
  };

  const toggleFocus = (chip: string) => {
    setCurrentFocus((prev) =>
      prev.includes(chip) ? prev.filter((f) => f !== chip) : [...prev, chip]
    );
  };

  const addFocusCustom = () => {
    const val = focusCustom.trim();
    if (!val || currentFocus.includes(val)) return;
    setCurrentFocus((prev) => [...prev, val]);
    setFocusCustom('');
    setShowFocusCustom(false);
  };

  const addActivityCustom = () => {
    const val = activityCustom.trim();
    if (!val || dailyActivities.includes(val)) return;
    setDailyActivities((prev) => [...prev, val]);
    setActivityCustom('');
    setShowActivityCustom(false);
  };

  // ---------------------------------------------------------------------------
  // Sign-up
  // ---------------------------------------------------------------------------

  const handleSignUp = async () => {
    if (!email.trim()) { setError('Email is required.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { setError('Please enter a valid email address.'); return; }
    if (password.length < 8) { setError('Password must be at least 8 characters.'); return; }
    setError('');
    setSubmitting(true);

    // Persist onboarding data to localStorage so it survives the email confirmation round-trip
    const profileSnapshot = {
      full_name: fullName,
      role: resolvedRole,
      company_url: companyUrl.replace(/^https?:\/\//, ''),
      onboarding_scrape_observations: scrapeObservationsRef.current,
      onboarding_scrape_correction: correctionSubmitted ? correction : '',
      current_focus: currentFocus,
      daily_activities: dailyActivities,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profileSnapshot));

    try {
      const supabase = createClient();
      localStorage.setItem('onboarding_awaiting', 'true');
      const callbackBase = `${process.env.NEXT_PUBLIC_WEB_APP_BASE_URL}/auth/callback`;
      const callbackUrl = demoToken ? `${callbackBase}?demo_token=${demoToken}` : callbackBase;

      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: callbackUrl },
      });

      if (signUpError) throw signUpError;
      localStorage.removeItem(DRAFT_KEY);
      setAwaitingConfirmation(true);
    } catch (e: unknown) {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem('onboarding_awaiting');
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Finish (Step 5 → chat)
  // ---------------------------------------------------------------------------

  const handleFinish = async () => {
    if (finishing) return;
    setFinishing(true);
    try {
      const accessToken = session?.access_token ?? '';

      // Save profile first
      const profileSnapshot = {
        full_name: fullName,
        role: resolvedRole,
        company_url: companyUrl.replace(/^https?:\/\//, ''),
        onboarding_scrape_observations: scrapeObservationsRef.current,
        onboarding_scrape_correction: correctionSubmitted ? correction : '',
        current_focus: currentFocus,
        daily_activities: dailyActivities,
      };

      await fetch(`${apiBase}/user/profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify(profileSnapshot),
      });

      // Create welcome session
      const res = await fetch(`${apiBase}/welcome-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          profile: {
            full_name: fullName,
            role: resolvedRole,
            company_url: companyUrl.replace(/^https?:\/\//, ''),
            onboarding_scrape_observations: scrapeObservationsRef.current,
            onboarding_scrape_correction: correctionSubmitted ? correction : '',
            current_focus: currentFocus,
            daily_activities: dailyActivities,
          },
        }),
      });

      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(DRAFT_KEY);

      if (res.ok) {
        const { welcome_session_id } = await res.json();
        router.push(`/chat?s=${welcome_session_id}`);
        return;
      }
    } catch {
      // fall through to /chat
    }
    router.push('/chat');
  };

  // ---------------------------------------------------------------------------
  // Connect tools (Step 5)
  // ---------------------------------------------------------------------------

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
    if (!byokToken.trim()) { setByokError('Token is required.'); return; }
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

  // ---------------------------------------------------------------------------
  // Resolved role — substitutes "Other" with the custom text input value
  const resolvedRole = role === 'Other' ? roleOther.trim() || 'Other' : role;

  // Step validation / navigation
  // ---------------------------------------------------------------------------

  const canAdvanceStep1 = scrapeConfirmed || correctionSubmitted;

  const handleNext = () => {
    setError('');
    if (step === 1) {
      if (!canAdvanceStep1) { setError('Please confirm or correct the product observations first.'); return; }
      setStep(2);
    } else if (step === 2) {
      if (currentFocus.length === 0) { setError('Please select at least one focus area.'); return; }
      if (dailyActivities.length === 0) { setError('Please select at least one daily activity.'); return; }
      setStep(3);
    } else if (step === 3) {
      if (!role) { setError('Please select your role.'); return; }
      if (role === 'Other' && !roleOther.trim()) { setError('Please describe your role.'); return; }
      setStep(4);
    } else if (step === 4) {
      handleSignUp();
    }
  };

  const handleBack = () => {
    setError('');
    setStep((s) => (s - 1) as Step);
  };

  // ---------------------------------------------------------------------------
  // Awaiting email confirmation
  // ---------------------------------------------------------------------------

  if (awaitingConfirmation) {
    return (
      <div className="min-h-screen bg-zinc-50 flex items-center justify-center p-4 font-sans text-zinc-900">
        <div className="w-full max-w-xl bg-white border border-zinc-200 shadow-sm rounded-xl overflow-hidden">
          <div className="px-8 py-6 border-b border-zinc-100">
            <div className="flex items-start justify-between">
              <div>
                <h1 className="text-xl font-semibold tracking-tight text-zinc-900">Check your email</h1>
                <p className="mt-1 text-sm text-zinc-500">
                  We sent a confirmation link to <span className="font-medium text-zinc-800">{email}</span>.
                </p>
              </div>
              <StepIndicator current={4} />
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

  // ---------------------------------------------------------------------------
  // Step labels
  // ---------------------------------------------------------------------------

  const STEP_LABELS: Record<Step, { title: string; subtitle: string; note?: string }> = {
    1: { title: 'Your product', subtitle: `Let's start by understanding what you're building.` },
    2: { title: 'Your priorities', subtitle: 'Help your agent focus on what matters most to you.' },
    3: { title: 'Your role', subtitle: 'One last thing before we set up your account.' },
    4: { title: 'Create your account', subtitle: 'Save your progress and activate your workspace.' },
    5: {
      title: 'Connect your tools',
      subtitle: 'Extend where your agent can help you work.',
      note: 'All integrations are optional — you can connect more later in Settings.',
    },
  };

  const { title, subtitle, note } = STEP_LABELS[step];

  // Step 2 acknowledgment — templated, no LLM call
  const step2Intro = (() => {
    if (!correctionSubmitted) return null;
    return `Thanks for the clarification — I've noted that ${correction}. Now let's talk about your priorities.`;
  })();

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

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

        {/* ── Step 1 — URL + Name + Scrape ─────────────────────────────────── */}
        {step === 1 && (
          <div className="px-8 py-6 space-y-5">
            {/* Name + URL inputs */}
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2 sm:col-span-1">
                <label className="block text-sm font-medium text-zinc-700 mb-1.5">Your name</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  disabled={scrapeStatus === 'loading'}
                  className="block w-full rounded-md border border-zinc-300 bg-zinc-50/50 px-3 py-2.5 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 disabled:opacity-50"
                  placeholder="Ada Lovelace"
                />
              </div>

              <div className="col-span-2 sm:col-span-1">
                <label className="block text-sm font-medium text-zinc-700 mb-1.5">Company or product URL</label>
                <div className="flex items-center rounded-md border border-zinc-300 bg-zinc-50/50 focus-within:border-zinc-900 focus-within:ring-1 focus-within:ring-zinc-900">
                  <span className="flex items-center self-stretch pl-3 pr-2 text-sm text-zinc-400 select-none bg-zinc-100 border-r border-zinc-300 rounded-l-md">https://</span>
                  <input
                    type="text"
                    value={companyUrl.replace(/^https?:\/\//, '')}
                    onChange={(e) => {
                      setCompanyUrl(e.target.value);
                      // Reset scrape if URL changes after a scrape
                      if (scrapeStatus !== 'idle') {
                        setScrapeStatus('idle');
                        setScrapeObservations('');
                        setScrapeConfirmed(false);
                        setShowCorrection(false);
                        setCorrectionSubmitted(false);
                      }
                    }}
                    disabled={scrapeStatus === 'loading'}
                    className="flex-1 bg-transparent py-2.5 pl-3 pr-3 text-sm text-zinc-900 focus:outline-none disabled:opacity-50"
                    placeholder="acme.com"
                  />
                </div>
              </div>
            </div>

            {/* Analyze button — shown before scrape */}
            {scrapeStatus === 'idle' && (
              <button
                type="button"
                onClick={runScrape}
                className="w-full rounded-md bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 transition-colors"
              >
                Analyze →
              </button>
            )}

            {/* Loading state */}
            {scrapeStatus === 'loading' && (
              <div className="rounded-lg border border-zinc-100 bg-zinc-50 px-4 py-4">
                <div className="flex items-center gap-2.5 text-sm text-zinc-500">
                  <svg className="animate-spin h-4 w-4 flex-shrink-0 text-zinc-400" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Reading your product page…
                </div>
                {scrapeObservations && (
                  <div className="mt-3 text-sm text-zinc-700 leading-relaxed [&>p]:mb-1.5 [&>ul]:pl-4 [&>ul]:list-disc [&>ul>li]:mb-0.5 [&>strong]:font-semibold">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{scrapeObservations}</ReactMarkdown>
                  </div>
                )}
              </div>
            )}

            {/* Scrape result */}
            {scrapeStatus === 'done' && !scrapeConfirmed && !correctionSubmitted && (
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-4 space-y-4">
                <div>
                  <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2">Here&apos;s what I found</p>
                  <div className="text-sm text-zinc-800 leading-relaxed [&>p]:mb-1.5 [&>ul]:pl-4 [&>ul]:list-disc [&>ul>li]:mb-0.5 [&>ol]:pl-4 [&>ol]:list-decimal [&>strong]:font-semibold">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{scrapeObservations}</ReactMarkdown>
                  </div>
                </div>

                {!showCorrection ? (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={handleConfirmScrape}
                      className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 transition-colors"
                    >
                      Yes, that&apos;s right
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowCorrection(true)}
                      className="rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-600 hover:border-zinc-300 hover:text-zinc-900 transition-colors"
                    >
                      Not quite
                    </button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <textarea
                      value={correction}
                      onChange={(e) => setCorrection(e.target.value)}
                      rows={3}
                      className="block w-full rounded-md border border-zinc-300 bg-white px-3 py-2.5 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 resize-none"
                      placeholder="e.g. 'This is actually a different product' or 'I work on a specific team within this company'"
                      autoFocus
                    />
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleSubmitCorrection}
                        disabled={!correction.trim()}
                        className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:bg-zinc-400 disabled:cursor-not-allowed transition-colors"
                      >
                        Submit correction
                      </button>
                      <button
                        type="button"
                        onClick={() => { setShowCorrection(false); setCorrection(''); }}
                        className="text-sm text-zinc-500 hover:text-zinc-800 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Confirmed state — collapsible toggle */}
            {(scrapeConfirmed || correctionSubmitted) && (
              <div className="rounded-lg border border-green-200 bg-green-50 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setShowScrapeDetail((v) => !v)}
                  className="w-full flex items-center justify-between px-4 py-3 text-left"
                >
                  <div className="flex items-center gap-2.5">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="flex-shrink-0 text-green-600">
                      <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
                      <path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    <p className="text-sm text-green-800">
                      {correctionSubmitted ? `Got it — I've noted your correction.` : 'Your product context is saved.'}
                    </p>
                  </div>
                  <svg
                    width="14" height="14" viewBox="0 0 16 16" fill="none"
                    className={`flex-shrink-0 text-green-600 transition-transform ${showScrapeDetail ? 'rotate-180' : ''}`}
                  >
                    <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>

                {showScrapeDetail && (
                  <div className="border-t border-green-200 px-4 py-3 space-y-3 bg-green-50/60">
                    <div className="text-sm text-zinc-700 leading-relaxed [&>p]:mb-1.5 [&>ul]:pl-4 [&>ul]:list-disc [&>ul>li]:mb-0.5 [&>strong]:font-semibold">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{scrapeObservations}</ReactMarkdown>
                    </div>
                    {correctionSubmitted && correction && (
                      <div className="border-t border-green-200 pt-3">
                        <p className="text-xs font-medium text-green-700 mb-1">Your correction</p>
                        <p className="text-sm text-zinc-700 italic">{correction}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Scrape error with manual fallback */}
            {scrapeStatus === 'error' && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-4 space-y-3">
                <p className="text-sm text-amber-800">
                  I wasn&apos;t able to read that page. You can describe your product instead — I&apos;ll use it as context.
                </p>
                <textarea
                  value={correction}
                  onChange={(e) => setCorrection(e.target.value)}
                  rows={3}
                  className="block w-full rounded-md border border-amber-200 bg-white px-3 py-2.5 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 resize-none"
                  placeholder="We build a B2B SaaS platform that helps logistics teams track shipments in real time…"
                />
                <button
                  type="button"
                  onClick={() => { if (correction.trim()) { setCorrectionSubmitted(true); setScrapeObservations(''); } }}
                  disabled={!correction.trim()}
                  className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:bg-zinc-400 disabled:cursor-not-allowed transition-colors"
                >
                  Save and continue
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── Step 2 — Chip questions ───────────────────────────────────────── */}
        {step === 2 && (
          <div className="px-8 py-6 space-y-6">
            {/* Correction acknowledgment */}
            {step2Intro && (
              <p className="text-sm text-zinc-600 italic">{step2Intro}</p>
            )}

            {/* Focus chips */}
            <div>
              <p className="text-sm font-medium text-zinc-700 mb-1">What are your biggest focus areas?</p>
              <p className="text-xs text-zinc-400 mb-3">Select all that apply.</p>
              <div className="flex flex-wrap gap-2">
                {FOCUS_CHIPS.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => toggleFocus(chip)}
                    className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
                      currentFocus.includes(chip)
                        ? 'border-zinc-900 bg-zinc-900 text-white'
                        : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50'
                    }`}
                  >
                    {chip}
                  </button>
                ))}
                {/* Persisted custom focus chips */}
                {currentFocus.filter((f) => !FOCUS_CHIPS.includes(f)).map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => toggleFocus(chip)}
                    className="rounded-full border border-zinc-900 bg-zinc-900 text-white px-3.5 py-1.5 text-sm transition-colors"
                  >
                    {chip}
                  </button>
                ))}
                {!showFocusCustom && (
                  <button
                    type="button"
                    onClick={() => setShowFocusCustom(true)}
                    className="rounded-full border border-dashed border-zinc-300 px-3.5 py-1.5 text-sm text-zinc-400 hover:border-zinc-400 hover:text-zinc-600 transition-colors"
                  >
                    + Add your own
                  </button>
                )}
                {showFocusCustom && (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={focusCustom}
                      onChange={(e) => setFocusCustom(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') addFocusCustom(); }}
                      autoFocus
                      placeholder="Your focus…"
                      className="rounded-full border border-zinc-300 px-3.5 py-1.5 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                    />
                    <button type="button" onClick={addFocusCustom} className="text-xs text-zinc-600 hover:text-zinc-900">Add</button>
                  </div>
                )}
              </div>

              {/* Templated focus reaction — show for last selected */}
              {currentFocus.length > 0 && (
                <p className="mt-3 text-sm text-zinc-500 italic">
                  {FOCUS_REACTIONS[currentFocus[currentFocus.length - 1]] ?? `${currentFocus[currentFocus.length - 1]} — got it, I'll keep that front of mind.`}
                </p>
              )}
            </div>

            {/* Activity chips */}
            <div>
              <p className="text-sm font-medium text-zinc-700 mb-1">What do you spend most of your time on?</p>
              <p className="text-xs text-zinc-400 mb-3">Select all that apply.</p>
              <div className="flex flex-wrap gap-2">
                {ACTIVITY_CHIPS.map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => toggleActivity(chip)}
                    className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
                      dailyActivities.includes(chip)
                        ? 'border-zinc-900 bg-zinc-900 text-white'
                        : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50'
                    }`}
                  >
                    {chip}
                  </button>
                ))}
                {/* Persisted custom activity chips */}
                {dailyActivities.filter((a) => !ACTIVITY_CHIPS.includes(a)).map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    onClick={() => toggleActivity(chip)}
                    className="rounded-full border border-zinc-900 bg-zinc-900 text-white px-3.5 py-1.5 text-sm transition-colors"
                  >
                    {chip}
                  </button>
                ))}
                {!showActivityCustom && (
                  <button
                    type="button"
                    onClick={() => setShowActivityCustom(true)}
                    className="rounded-full border border-dashed border-zinc-300 px-3.5 py-1.5 text-sm text-zinc-400 hover:border-zinc-400 hover:text-zinc-600 transition-colors"
                  >
                    + Add your own
                  </button>
                )}
                {showActivityCustom && (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={activityCustom}
                      onChange={(e) => setActivityCustom(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') addActivityCustom(); }}
                      autoFocus
                      placeholder="Your activity…"
                      className="rounded-full border border-zinc-300 px-3.5 py-1.5 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                    />
                    <button type="button" onClick={addActivityCustom} className="text-xs text-zinc-600 hover:text-zinc-900">Add</button>
                  </div>
                )}
              </div>

              {/* Templated activity reaction — show for last selected */}
              {dailyActivities.length > 0 && (
                <p className="mt-3 text-sm text-zinc-500 italic">
                  {ACTIVITY_REACTIONS[dailyActivities[dailyActivities.length - 1]] ?? `${dailyActivities[dailyActivities.length - 1]} — noted.`}
                </p>
              )}
            </div>
          </div>
        )}

        {/* ── Step 3 — Role ─────────────────────────────────────────────────── */}
        {step === 3 && (
          <div className="px-8 py-6 space-y-5">
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-zinc-700 mb-1.5">Role</label>
                <select
                  value={role}
                  onChange={(e) => { setRole(e.target.value); setRoleOther(''); }}
                  className="block w-full rounded-md border border-zinc-300 bg-zinc-50/50 px-3 py-2.5 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                >
                  <option value="">Select your role</option>
                  {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </div>

              {role === 'Other' && (
                <input
                  type="text"
                  value={roleOther}
                  onChange={(e) => setRoleOther(e.target.value)}
                  autoFocus
                  placeholder="Describe your role…"
                  className="block w-full rounded-md border border-zinc-300 bg-zinc-50/50 px-3 py-2.5 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
                />
              )}
            </div>

            {/* Templated role acknowledgment */}
            {resolvedRole && (
              <p className="text-sm text-zinc-500 italic">
                Got it — as a <span className="font-medium text-zinc-700">{resolvedRole}</span>, I&apos;ll tailor how I communicate and prioritize what&apos;s most relevant for your perspective.
              </p>
            )}
          </div>
        )}

        {/* ── Step 4 — Sign-up wall ─────────────────────────────────────────── */}
        {step === 4 && (
          <div className="px-8 py-6 space-y-4">
            <p className="text-sm text-zinc-600">
              Your workspace is being set up — create an account to save your progress.
            </p>
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

        {/* ── Step 5 — Connect tools ────────────────────────────────────────── */}
        {step === 5 && (
          <div className="px-8 py-6 space-y-2.5">
            {INTEGRATIONS.map((integration) => {
              const connected = !!integrations[integration.key];
              const connecting = connectingProvider === integration.key;
              const isByok = 'isByok' in integration && integration.isByok;
              const isComingSoon = 'comingSoon' in integration && integration.comingSoon;
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
                          <span className="rounded px-1.5 py-0.5 text-[10px] font-medium bg-green-100 text-green-700">Connected</span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-zinc-500 leading-relaxed">{integration.value}</p>
                      {'note' in integration && integration.note && (
                        <p className="mt-1 text-[10px] text-amber-600 leading-relaxed">{integration.note}</p>
                      )}
                    </div>

                    {isComingSoon ? (
                      // TODO: wire up PostHog analytics event on click — track intent per integration
                      <button
                        type="button"
                        onClick={() => { /* TODO: PostHog track('coming_soon_clicked', { integration: integration.key }) */ }}
                        className="flex-shrink-0 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-medium text-zinc-400 hover:border-zinc-300 hover:text-zinc-500 transition-colors cursor-pointer"
                      >
                        Coming soon
                      </button>
                    ) : isByok ? (
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
                            Connecting…
                          </span>
                        ) : connected ? 'Connected' : 'Connect'}
                      </button>
                    )}
                  </div>

                  {/* Inline BYOK form */}
                  {isByokOpen && (
                    <div className="border-t border-zinc-100 bg-zinc-50 px-4 py-3 space-y-3">
                      <div>
                        <p className="text-xs font-medium text-zinc-700 mb-2">How to get your API key:</p>
                        <ol className="space-y-1 text-xs text-zinc-500 list-none">
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
                          {byokSaving ? 'Saving…' : 'Save'}
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

          {step < 5 ? (
            <button
              type="button"
              onClick={handleNext}
              disabled={submitting || (step === 1 && !canAdvanceStep1)}
              className="rounded-md bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:bg-zinc-400 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  {step === 4 ? 'Creating account…' : 'Loading…'}
                </span>
              ) : step === 4 ? (
                'Create Account →'
              ) : (
                'Continue →'
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleFinish}
              disabled={finishing}
              className="rounded-md bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:bg-zinc-400 disabled:cursor-not-allowed transition-colors"
            >
              {finishing ? (
                <span className="flex items-center gap-2">
                  <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Setting up…
                </span>
              ) : (
                'Finish Setup →'
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense>
      <OnboardingPageInner />
    </Suspense>
  );
}
