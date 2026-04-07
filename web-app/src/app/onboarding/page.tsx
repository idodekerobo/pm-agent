'use client';

import { useState, useEffect, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/AuthContext';
import { useBridge } from '@/lib/BridgeContext';
import { createClient } from '@/lib/supabaseClient';
import {
  BASE_MEMORY_PROMPT,
  getMemoryPrompt,
  type ImportedMemory,
} from '@/lib/memoryImport';
import { usePostHog } from 'posthog-js/react';
import { EVENTS } from '@/lib/analytics';
import StepProfile from './steps/StepProfile';
import StepPriorities from './steps/StepPriorities';
import StepRole from './steps/StepRole';
import StepMemoryImport from './steps/StepMemoryImport';
import StepSignUp from './steps/StepSignUp';
import StepBridgeSetup from './steps/StepBridgeSetup';
import StepConnectTools from './steps/StepConnectTools';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7;

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
      {([1, 2, 3, 4, 5, 6, 7] as Step[]).map((s) => (
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
          {s < 6 && <div className={`h-px w-6 ${s < current ? 'bg-zinc-300' : 'bg-zinc-100'}`} />}
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
  const { bridgeStatus, bridgeUrl } = useBridge();
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

  // Step 4 — memory import
  const [importedMemories, setImportedMemories] = useState<ImportedMemory[]>([]);
  const [memoryWorkOnly, setMemoryWorkOnly] = useState(false);
  const [memoryRedactPII, setMemoryRedactPII] = useState(false);
  const [memoryPromptText, setMemoryPromptText] = useState(BASE_MEMORY_PROMPT);
  const [memoryCopied, setMemoryCopied] = useState(false);
  const [showProviderDropdown, setShowProviderDropdown] = useState(false);

  // Step 5 — sign up
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Step 6 — connect tools
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
  const ph = usePostHog();

  // Track onboarding started on mount
  useEffect(() => {
    ph?.capture(EVENTS.ONBOARDING_STARTED, {
      has_demo_token: !!demoToken,
      has_company_url: !!demoCompanyUrl,
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // When demo token is present, auto-trigger scrape on mount
  useEffect(() => {
    if (demoToken && demoCompanyUrl && scrapeStatus === 'idle' && fullName === '') {
      // URL is pre-filled; wait for user to enter their name before scraping
      // (name is needed for the LLM prompt). The Analyze button handles this.
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Rebuild memory prompt when add-on checkboxes change
  useEffect(() => {
    setMemoryPromptText(getMemoryPrompt(memoryWorkOnly, memoryRedactPII));
  }, [memoryWorkOnly, memoryRedactPII]);

  // Detect email confirmation return
  useEffect(() => {
    if (loading) return;
    if (!user) return;
    const awaiting = localStorage.getItem('onboarding_awaiting') === 'true';
    if (!awaiting) return;
    localStorage.removeItem('onboarding_awaiting');
    setAwaitingConfirmation(false);
    setStep(6);
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
      if (draft.importedMemories?.length) setImportedMemories(draft.importedMemories);
      if (draft.step && draft.step <= 4) setStep(draft.step);
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
      importedMemories,
    };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
  }, [step, fullName, companyUrl, scrapeConfirmed, correctionSubmitted, correction, currentFocus, dailyActivities, role, roleOther, importedMemories, awaitingConfirmation]); // eslint-disable-line react-hooks/exhaustive-deps

  // Integration success messages from OAuth popup
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'integration_success') {
        ph?.capture(EVENTS.INTEGRATION_CONNECTED, { provider: event.data.provider, source: 'onboarding' });
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
        ph?.capture(EVENTS.ONBOARDING_COMPANY_SCRAPED, { success: true });
      }
    } catch {
      setScrapeStatus('error');
      ph?.capture(EVENTS.ONBOARDING_COMPANY_SCRAPED, { success: false });
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
    setDailyActivities((prev) => {
      const isAdding = !prev.includes(chip);
      if (isAdding) ph?.capture(EVENTS.ONBOARDING_ACTIVITY_SELECTED, { activity: chip });
      return isAdding ? [...prev, chip] : prev.filter((a) => a !== chip);
    });
  };

  const toggleFocus = (chip: string) => {
    setCurrentFocus((prev) => {
      const isAdding = !prev.includes(chip);
      if (isAdding) ph?.capture(EVENTS.ONBOARDING_FOCUS_SELECTED, { focus: chip });
      return isAdding ? [...prev, chip] : prev.filter((f) => f !== chip);
    });
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

  const handleGoogleSignUp = async () => {
    setError('');
    setSubmitting(true);

    // Persist onboarding data to localStorage so it survives the OAuth redirect
    const profileSnapshot = {
      full_name: fullName,
      role: resolvedRole,
      company_url: companyUrl.replace(/^https?:\/\//, ''),
      onboarding_scrape_observations: scrapeObservationsRef.current,
      onboarding_scrape_correction: correctionSubmitted ? correction : '',
      current_focus: currentFocus,
      daily_activities: dailyActivities,
      imported_memories: importedMemories,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profileSnapshot));
    localStorage.setItem('onboarding_awaiting', 'true');

    try {
      const supabase = createClient();
      const callbackBase = `${process.env.NEXT_PUBLIC_WEB_APP_BASE_URL}/auth/callback`;
      const callbackUrl = demoToken
        ? `${callbackBase}?demo_token=${demoToken}&next=/onboarding`
        : `${callbackBase}?next=/onboarding`;

      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: callbackUrl },
      });

      if (oauthError) throw oauthError;
      ph?.capture(EVENTS.ONBOARDING_STEP_COMPLETED, { step: 5, step_name: 'sign_up_google' });
      localStorage.removeItem(DRAFT_KEY);
      // signInWithOAuth redirects the browser — no further action needed
    } catch (e: unknown) {
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem('onboarding_awaiting');
      setError(e instanceof Error ? e.message : 'Something went wrong. Please try again.');
      setSubmitting(false);
    }
  };

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
      imported_memories: importedMemories,
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
      ph?.capture(EVENTS.ONBOARDING_STEP_COMPLETED, { step: 5, step_name: 'sign_up' });
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
    const connectedProviders = Object.keys(integrations).filter((k) => integrations[k]);
    if (connectedProviders.length === 0) {
      ph?.capture(EVENTS.ONBOARDING_SKIPPED_INTEGRATIONS);
    }
    ph?.capture(EVENTS.ONBOARDING_COMPLETED, {
      focus_areas: currentFocus,
      activity_types: dailyActivities,
      integrations_connected: connectedProviders,
    });
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
        imported_memories: importedMemories,
      };

      await fetch(`${apiBase}/user/profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify(profileSnapshot),
      });

      const isLocalMode = bridgeStatus === 'connected';

      // Seed workspace context files if bridge is connected — fire-and-forget.
      // If this fails, bridge startup will retry seeding from the saved profile.
      if (isLocalMode) {
        fetch(`${bridgeUrl}/seed-context`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(profileSnapshot),
        }).catch(() => {});
      }

      const profileFields = {
        full_name: fullName,
        role: resolvedRole,
        company_url: companyUrl.replace(/^https?:\/\//, ''),
        onboarding_scrape_observations: scrapeObservationsRef.current,
        onboarding_scrape_correction: correctionSubmitted ? correction : '',
        current_focus: currentFocus,
        daily_activities: dailyActivities,
      };

      // Create welcome session — local mode uses a template message (no cloud LLM call)
      const res = await fetch(`${apiBase}/welcome-session`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({
          profile: profileFields,
          ...(isLocalMode ? { mode: 'local' } : {}),
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
    ph?.capture(EVENTS.INTEGRATION_CONNECT_CLICKED, { provider: providerKey, source: 'onboarding' });
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

  const STEP_NAMES: Record<number, string> = {
    1: 'profile',
    2: 'focus_areas',
    3: 'role',
    4: 'memory_import',
    5: 'sign_up',
    6: 'bridge_setup',
    7: 'integrations',
  };

  const handleNext = () => {
    setError('');
    if (step === 1) {
      if (!canAdvanceStep1) { setError('Please confirm or correct the product observations first.'); return; }
      ph?.capture(EVENTS.ONBOARDING_STEP_COMPLETED, { step: 1, step_name: STEP_NAMES[1] });
      setStep(2);
    } else if (step === 2) {
      if (currentFocus.length === 0) { setError('Please select at least one focus area.'); return; }
      if (dailyActivities.length === 0) { setError('Please select at least one daily activity.'); return; }
      ph?.capture(EVENTS.ONBOARDING_STEP_COMPLETED, { step: 2, step_name: STEP_NAMES[2] });
      setStep(3);
    } else if (step === 3) {
      if (!role) { setError('Please select your role.'); return; }
      if (role === 'Other' && !roleOther.trim()) { setError('Please describe your role.'); return; }
      ph?.capture(EVENTS.ONBOARDING_STEP_COMPLETED, { step: 3, step_name: STEP_NAMES[3] });
      setStep(4);
    } else if (step === 4) {
      ph?.capture(EVENTS.ONBOARDING_STEP_COMPLETED, { step: 4, step_name: STEP_NAMES[4], providers_imported: importedMemories.map((m) => m.provider) });
      setStep(5);
    } else if (step === 5) {
      handleSignUp();
    } else if (step === 6) {
      ph?.capture(EVENTS.ONBOARDING_STEP_COMPLETED, { step: 6, step_name: STEP_NAMES[6] });
      setStep(7);
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
              <StepIndicator current={5} />
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
    3: { title: 'Your role', subtitle: 'One last thing before we import your memories.' },
    4: {
      title: 'Import AI memories',
      subtitle: 'Give your agent a head start with context from other AI tools.',
      note: 'Optional — you can skip this and do it later in Settings.',
    },
    5: { title: 'Create your account', subtitle: 'Save your progress and activate your workspace.' },
    6: {
      title: 'Install Draft Bridge',
      subtitle: 'Connect your local Claude to Draft in 3 steps.',
    },
    7: {
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

        {step === 1 && (
          <StepProfile
            fullName={fullName}
            setFullName={setFullName}
            companyUrl={companyUrl}
            setCompanyUrl={setCompanyUrl}
            scrapeStatus={scrapeStatus}
            setScrapeStatus={setScrapeStatus}
            scrapeObservations={scrapeObservations}
            setScrapeObservations={setScrapeObservations}
            scrapeConfirmed={scrapeConfirmed}
            setScrapeConfirmed={setScrapeConfirmed}
            showCorrection={showCorrection}
            setShowCorrection={setShowCorrection}
            correction={correction}
            setCorrection={setCorrection}
            correctionSubmitted={correctionSubmitted}
            setCorrectionSubmitted={setCorrectionSubmitted}
            showScrapeDetail={showScrapeDetail}
            setShowScrapeDetail={setShowScrapeDetail}
            runScrape={runScrape}
            handleConfirmScrape={handleConfirmScrape}
            handleSubmitCorrection={handleSubmitCorrection}
          />
        )}

        {step === 2 && (
          <StepPriorities
            step2Intro={step2Intro}
            currentFocus={currentFocus}
            dailyActivities={dailyActivities}
            focusCustom={focusCustom}
            setFocusCustom={setFocusCustom}
            activityCustom={activityCustom}
            setActivityCustom={setActivityCustom}
            showFocusCustom={showFocusCustom}
            setShowFocusCustom={setShowFocusCustom}
            showActivityCustom={showActivityCustom}
            setShowActivityCustom={setShowActivityCustom}
            toggleFocus={toggleFocus}
            toggleActivity={toggleActivity}
            addFocusCustom={addFocusCustom}
            addActivityCustom={addActivityCustom}
          />
        )}

        {step === 3 && (
          <StepRole
            role={role}
            setRole={setRole}
            roleOther={roleOther}
            setRoleOther={setRoleOther}
            resolvedRole={resolvedRole}
          />
        )}

        {step === 4 && (
          <StepMemoryImport
            importedMemories={importedMemories}
            setImportedMemories={setImportedMemories}
            memoryWorkOnly={memoryWorkOnly}
            setMemoryWorkOnly={setMemoryWorkOnly}
            memoryRedactPII={memoryRedactPII}
            setMemoryRedactPII={setMemoryRedactPII}
            memoryPromptText={memoryPromptText}
            setMemoryPromptText={setMemoryPromptText}
            memoryCopied={memoryCopied}
            setMemoryCopied={setMemoryCopied}
            showProviderDropdown={showProviderDropdown}
            setShowProviderDropdown={setShowProviderDropdown}
          />
        )}

        {step === 5 && (
          <StepSignUp
            email={email}
            setEmail={setEmail}
            password={password}
            setPassword={setPassword}
            submitting={submitting}
            handleGoogleSignUp={handleGoogleSignUp}
          />
        )}

        {step === 6 && <StepBridgeSetup />}

        {step === 7 && (
          <StepConnectTools
            integrations={integrations}
            connectingProvider={connectingProvider}
            byokExpanded={byokExpanded}
            setByokExpanded={setByokExpanded}
            byokToken={byokToken}
            setByokToken={setByokToken}
            byokSaving={byokSaving}
            byokError={byokError}
            handleConnect={handleConnect}
            handleSaveClaudeCodeToken={handleSaveClaudeCodeToken}
          />
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

          {step === 4 ? (
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => { ph?.capture(EVENTS.ONBOARDING_STEP_COMPLETED, { step: 4, step_name: 'memory_import_skipped' }); setStep(5); }}
                className="text-sm text-zinc-400 hover:text-zinc-600 transition-colors"
              >
                Skip
              </button>
              <button
                type="button"
                onClick={handleNext}
                className="rounded-md bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-800 transition-colors"
              >
                Continue →
              </button>
            </div>
          ) : step === 6 ? (
            <button
              type="button"
              onClick={handleNext}
              disabled={bridgeStatus !== 'connected'}
              className="rounded-md bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:bg-zinc-400 disabled:cursor-not-allowed transition-colors"
            >
              {bridgeStatus === 'connected' ? 'Continue →' : 'Connect bridge to continue'}
            </button>
          ) : step < 7 ? (
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
                  {step === 5 ? 'Creating account…' : 'Loading…'}
                </span>
              ) : step === 5 ? (
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
