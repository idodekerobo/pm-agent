'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { INTEGRATIONS } from '@/lib/integrations';
import { usePostHog } from 'posthog-js/react';
import { EVENTS } from '@/lib/analytics';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Integration {
  provider: string;
  account_label: string;
  scopes: string[];
  created_at: string;
}

interface MonitoringChannel {
  id: string;
  name: string;
  monitoring_enabled: boolean;
}

interface MonitoringRepo {
  full_name: string;
  monitoring_enabled: boolean;
}

interface MonitoringTeam {
  id: string;
  name: string;
  key: string;
  monitoring_enabled: boolean;
}

interface MonitoringProviderData {
  monitoring_enabled: boolean;
  channels?: MonitoringChannel[];
  repos?: MonitoringRepo[];
  teams?: MonitoringTeam[];
}

interface MonitoringData {
  global_enabled: boolean;
  providers: Record<string, MonitoringProviderData>;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const INTEGRATION_META = Object.fromEntries(INTEGRATIONS.map((i) => [i.key, i]));
const ALL_PROVIDERS = INTEGRATIONS.map((i) => i.key);

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function ProviderIcon({ provider }: { provider: string }) {
  const meta = INTEGRATION_META[provider];
  if (!meta) return null;
  return (
    <div
      className="flex flex-shrink-0 items-center justify-center rounded-lg text-white"
      style={{ width: 36, height: 36, backgroundColor: meta.color }}
    >
      <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', fontFamily: 'var(--font-geist-mono)' }}>
        {meta.abbr}
      </span>
    </div>
  );
}

function Toggle({
  enabled,
  onChange,
  disabled,
}: {
  enabled: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      disabled={disabled}
      onClick={() => onChange(!enabled)}
      className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer items-center rounded-full transition-colors duration-200 focus:outline-none disabled:cursor-not-allowed disabled:opacity-40 ${
        enabled ? 'bg-green-500' : 'bg-zinc-200'
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform duration-200 ${
          enabled ? 'translate-x-4' : 'translate-x-0.5'
        }`}
      />
    </button>
  );
}

function resourceSectionHeading(provider: string): string {
  if (provider === 'slack') return 'Channels the agent is invited in';
  if (provider === 'github') return 'Repos the agent has access to';
  if (provider === 'linear') return 'Teams the agent has access to';
  return 'Resources';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function IntegrationsTab() {
  const { user, session } = useAuth();
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL;
  const ph = usePostHog();

  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState<Record<string, boolean>>({});
  const [availableOpen, setAvailableOpen] = useState(false);
  const [notionRevokeNotice, setNotionRevokeNotice] = useState(false);
  const [byokExpanded, setByokExpanded] = useState(false);
  const [byokToken, setByokToken] = useState('');
  const [byokSaving, setByokSaving] = useState(false);
  const [byokError, setByokError] = useState<string | null>(null);

  // Monitoring state
  const [monitoringData, setMonitoringData] = useState<MonitoringData | null>(null);
  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(new Set());
  const [togglingGlobal, setTogglingGlobal] = useState(false);
  const [togglingProvider, setTogglingProvider] = useState<Record<string, boolean>>({});
  const [togglingResource, setTogglingResource] = useState<Record<string, boolean>>({});
  const [syncing, setSyncing] = useState<Record<string, boolean>>({});

  const token = session?.access_token ?? '';

  const fetchIntegrations = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/integrations/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      setIntegrations(await res.json());
    } catch {
      setError('Could not load integrations. Please refresh.');
    } finally {
      setLoading(false);
    }
  }, [user, apiBase, token]);

  const fetchMonitoringData = useCallback(async () => {
    try {
      const res = await fetch(`${apiBase}/integrations/monitoring`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      setMonitoringData(await res.json());
    } catch {
      // Silent — monitoring UI degrades gracefully
    }
  }, [user, apiBase, token]);

  useEffect(() => {
    if (user) {
      fetchIntegrations();
      fetchMonitoringData();
    }
  }, [user, fetchIntegrations, fetchMonitoringData]);

  // Listen for OAuth popup success messages
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type === 'integration_success') {
        ph?.capture(EVENTS.INTEGRATION_CONNECTED, { provider: event.data.provider, source: 'settings' });
        fetchIntegrations();
        fetchMonitoringData();
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [ph, fetchIntegrations, fetchMonitoringData]);

  const handleDisconnect = async (provider: string) => {
    setDisconnecting((p) => ({ ...p, [provider]: true }));
    try {
      const res = await fetch(`${apiBase}/integrations/${provider}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      setIntegrations((p) => p.filter((i) => i.provider !== provider));
      setMonitoringData((prev) => {
        if (!prev) return prev;
        const { [provider]: _, ...rest } = prev.providers;
        return { ...prev, providers: rest };
      });
      ph?.capture(EVENTS.INTEGRATION_DISCONNECTED, { provider });
      if (INTEGRATION_META[provider]?.requiresManualRevoke) setNotionRevokeNotice(true);
    } catch {
      /* TODO: show error toast */
    } finally {
      setDisconnecting((p) => ({ ...p, [provider]: false }));
    }
  };

  const handleConnect = (provider: string) => {
    if (!user) return;
    ph?.capture(EVENTS.INTEGRATION_CONNECT_CLICKED, { provider, source: 'settings' });
    if (provider === 'claude-code') {
      setByokExpanded(true);
      setByokError(null);
      return;
    }
    window.open(`${apiBase}/integrations/${provider}/connect?user_id=${user.id}`, '_blank');
  };

  const handleSaveClaudeCodeToken = async () => {
    if (!byokToken.trim()) {
      setByokError('Token is required.');
      return;
    }
    setByokSaving(true);
    setByokError(null);
    try {
      const res = await fetch(`${apiBase}/integrations/claude-code/connect`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ token: byokToken.trim() }),
      });
      if (!res.ok) throw new Error();
      setIntegrations((prev) => [
        ...prev.filter((i) => i.provider !== 'claude-code'),
        { provider: 'claude-code', account_label: 'Claude Code Enabled', scopes: [], created_at: new Date().toISOString() },
      ]);
      ph?.capture(EVENTS.INTEGRATION_CONNECTED, { provider: 'claude-code', source: 'settings' });
      setByokExpanded(false);
      setByokToken('');
    } catch {
      setByokError('Failed to save token. Please try again.');
    } finally {
      setByokSaving(false);
    }
  };

  // ---------------------------------------------------------------------------
  // Monitoring handlers
  // ---------------------------------------------------------------------------

  const handleGlobalMonitoringToggle = async (enabled: boolean) => {
    setTogglingGlobal(true);
    setMonitoringData((prev) => prev ? { ...prev, global_enabled: enabled } : prev);
    try {
      await fetch(`${apiBase}/integrations/monitoring/settings`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ enable_agent_monitoring: enabled }),
      });
    } catch {
      setMonitoringData((prev) => prev ? { ...prev, global_enabled: !enabled } : prev);
    } finally {
      setTogglingGlobal(false);
    }
  };

  const handleProviderMonitoringToggle = async (provider: string, enabled: boolean) => {
    setTogglingProvider((p) => ({ ...p, [provider]: true }));
    setMonitoringData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        providers: {
          ...prev.providers,
          [provider]: { ...prev.providers[provider], monitoring_enabled: enabled },
        },
      };
    });
    try {
      await fetch(`${apiBase}/integrations/${provider}/monitoring`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ monitoring_enabled: enabled }),
      });
    } catch {
      setMonitoringData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          providers: {
            ...prev.providers,
            [provider]: { ...prev.providers[provider], monitoring_enabled: !enabled },
          },
        };
      });
    } finally {
      setTogglingProvider((p) => ({ ...p, [provider]: false }));
    }
  };

  const handleChannelMonitoringToggle = async (channelId: string, enabled: boolean) => {
    const key = `slack:${channelId}`;
    setTogglingResource((p) => ({ ...p, [key]: true }));
    setMonitoringData((prev) => {
      if (!prev?.providers.slack?.channels) return prev;
      return {
        ...prev,
        providers: {
          ...prev.providers,
          slack: {
            ...prev.providers.slack,
            channels: prev.providers.slack.channels!.map((c) =>
              c.id === channelId ? { ...c, monitoring_enabled: enabled } : c
            ),
          },
        },
      };
    });
    try {
      await fetch(`${apiBase}/integrations/slack/channels/${channelId}/monitoring`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ monitoring_enabled: enabled }),
      });
    } catch {
      setMonitoringData((prev) => {
        if (!prev?.providers.slack?.channels) return prev;
        return {
          ...prev,
          providers: {
            ...prev.providers,
            slack: {
              ...prev.providers.slack,
              channels: prev.providers.slack.channels!.map((c) =>
                c.id === channelId ? { ...c, monitoring_enabled: !enabled } : c
              ),
            },
          },
        };
      });
    } finally {
      setTogglingResource((p) => ({ ...p, [key]: false }));
    }
  };

  const handleRepoMonitoringToggle = async (fullName: string, enabled: boolean) => {
    const key = `github:${fullName}`;
    setTogglingResource((p) => ({ ...p, [key]: true }));
    setMonitoringData((prev) => {
      if (!prev?.providers.github?.repos) return prev;
      return {
        ...prev,
        providers: {
          ...prev.providers,
          github: {
            ...prev.providers.github,
            repos: prev.providers.github.repos!.map((r) =>
              r.full_name === fullName ? { ...r, monitoring_enabled: enabled } : r
            ),
          },
        },
      };
    });
    try {
      await fetch(`${apiBase}/integrations/github/repos/monitoring`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ full_name: fullName, monitoring_enabled: enabled }),
      });
    } catch {
      setMonitoringData((prev) => {
        if (!prev?.providers.github?.repos) return prev;
        return {
          ...prev,
          providers: {
            ...prev.providers,
            github: {
              ...prev.providers.github,
              repos: prev.providers.github.repos!.map((r) =>
                r.full_name === fullName ? { ...r, monitoring_enabled: !enabled } : r
              ),
            },
          },
        };
      });
    } finally {
      setTogglingResource((p) => ({ ...p, [key]: false }));
    }
  };

  const handleTeamMonitoringToggle = async (teamId: string, enabled: boolean) => {
    const key = `linear:${teamId}`;
    setTogglingResource((p) => ({ ...p, [key]: true }));
    setMonitoringData((prev) => {
      if (!prev?.providers.linear?.teams) return prev;
      return {
        ...prev,
        providers: {
          ...prev.providers,
          linear: {
            ...prev.providers.linear,
            teams: prev.providers.linear.teams!.map((t) =>
              t.id === teamId ? { ...t, monitoring_enabled: enabled } : t
            ),
          },
        },
      };
    });
    try {
      await fetch(`${apiBase}/integrations/linear/teams/${teamId}/monitoring`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ monitoring_enabled: enabled }),
      });
    } catch {
      setMonitoringData((prev) => {
        if (!prev?.providers.linear?.teams) return prev;
        return {
          ...prev,
          providers: {
            ...prev.providers,
            linear: {
              ...prev.providers.linear,
              teams: prev.providers.linear.teams!.map((t) =>
                t.id === teamId ? { ...t, monitoring_enabled: !enabled } : t
              ),
            },
          },
        };
      });
    } finally {
      setTogglingResource((p) => ({ ...p, [key]: false }));
    }
  };

  const handleSync = async (provider: string) => {
    setSyncing((p) => ({ ...p, [provider]: true }));
    try {
      const syncPath = provider === 'github' ? 'github/repos/sync' : 'linear/teams/sync';
      await fetch(`${apiBase}/integrations/${syncPath}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      await fetchMonitoringData();
    } catch {
      /* silent */
    } finally {
      setSyncing((p) => ({ ...p, [provider]: false }));
    }
  };

  const toggleExpanded = (provider: string) => {
    setExpandedProviders((prev) => {
      const next = new Set(prev);
      next.has(provider) ? next.delete(provider) : next.add(provider);
      return next;
    });
  };

  const connectedSet = new Set(integrations.map((i) => i.provider));
  const available = ALL_PROVIDERS.filter((p) => !connectedSet.has(p));
  const globalEnabled = monitoringData?.global_enabled ?? true;

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  const renderResourceList = (provider: string) => {
    const data = monitoringData?.providers[provider];
    if (!data) return null;

    const hasSyncButton = provider === 'github' || provider === 'linear';

    let items: { id: string; label: string; enabled: boolean }[] = [];
    if (provider === 'slack' && data.channels) {
      items = data.channels.map((c) => ({ id: c.id, label: `#${c.name}`, enabled: c.monitoring_enabled }));
    } else if (provider === 'github' && data.repos) {
      items = data.repos.map((r) => ({ id: r.full_name, label: r.full_name, enabled: r.monitoring_enabled }));
    } else if (provider === 'linear' && data.teams) {
      items = data.teams.map((t) => ({ id: t.id, label: t.key ? `${t.name} (${t.key})` : t.name, enabled: t.monitoring_enabled }));
    }

    const onToggle = (id: string, enabled: boolean) => {
      if (provider === 'slack') handleChannelMonitoringToggle(id, enabled);
      else if (provider === 'github') handleRepoMonitoringToggle(id, enabled);
      else if (provider === 'linear') handleTeamMonitoringToggle(id, enabled);
    };

    return (
      <div className="border-t border-zinc-100 bg-zinc-50 px-5 py-3">
        {/* Refresh button sits above the section heading */}
        {hasSyncButton && (
          <div className="mb-2 flex justify-end">
            <button
              onClick={() => handleSync(provider)}
              disabled={syncing[provider]}
              className="flex items-center gap-1 text-[10px] text-zinc-400 transition-colors hover:text-zinc-700 disabled:cursor-not-allowed disabled:opacity-40"
              style={{ fontFamily: 'var(--font-geist-mono)' }}
            >
              <svg
                className={syncing[provider] ? 'animate-spin' : ''}
                width="10" height="10" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              >
                <polyline points="23 4 23 10 17 10" />
                <polyline points="1 20 1 14 7 14" />
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              </svg>
              {syncing[provider] ? 'Refreshing...' : 'Refresh'}
            </button>
          </div>
        )}

        <p className="mb-2 text-xs font-medium text-zinc-700">{resourceSectionHeading(provider)}</p>

        {items.length === 0 ? (
          <p className="py-2 text-xs text-zinc-400">
            {provider === 'slack'
              ? 'No channels yet. Invite the bot to a channel to start.'
              : 'None found. Try refreshing.'}
          </p>
        ) : (
          <>
            {/* Column header */}
            <div className="mb-1 flex items-center justify-end pr-1">
              <span
                className="text-[10px] font-medium uppercase tracking-widest text-zinc-400"
                style={{ fontFamily: 'var(--font-geist-mono)' }}
              >
                Background Monitoring
              </span>
            </div>
            <div className="divide-y divide-zinc-100">
              {items.map((item) => {
                const resourceKey = `${provider}:${item.id}`;
                return (
                  <div key={item.id} className="flex items-center justify-between py-2">
                    <span
                      className="text-xs text-zinc-600"
                      style={{ fontFamily: 'var(--font-geist-mono)' }}
                    >
                      {item.label}
                    </span>
                    <Toggle
                      enabled={item.enabled}
                      onChange={(v) => onToggle(item.id, v)}
                      disabled={togglingResource[resourceKey] || !data.monitoring_enabled || !globalEnabled}
                    />
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    );
  };

  // ---------------------------------------------------------------------------
  // JSX
  // ---------------------------------------------------------------------------

  return (
    <div className="max-w-xl">
      <h2 className="text-2xl font-semibold tracking-tight text-zinc-900">Integrations</h2>
      <p className="mt-1.5 text-sm text-zinc-500">
        Manage the tools and services your PM agent can access.
      </p>

      {notionRevokeNotice && (
        <div className="mt-6 flex items-start justify-between rounded-lg border border-amber-200 bg-amber-50 px-5 py-3.5">
          <div className="flex items-start gap-3">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 shrink-0 text-amber-500">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <div>
              <p className="text-sm font-medium text-amber-900">Notion disconnected — one more step</p>
              <p className="mt-0.5 text-xs text-amber-700">
                Notion doesn&apos;t support automatic revocation. To fully remove access, open Notion → click your profile photo → <span className="font-medium">Settings</span> → <span className="font-medium">Connections</span> → find this app and remove it.
              </p>
            </div>
          </div>
          <button onClick={() => setNotionRevokeNotice(false)} className="ml-4 shrink-0 text-amber-400 hover:text-amber-700" aria-label="Dismiss">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
      )}

      <div className="mt-8">

        {/* ── Global monitoring toggle ──────────────────────────────── */}
        {monitoringData && (
          <div className="mb-6 flex items-start justify-between rounded-lg border border-zinc-200 bg-zinc-50 px-5 py-4">
            <div className="flex-1 pr-6">
              <p className="text-sm font-medium text-zinc-900">Background Monitoring</p>
              <p className="mt-0.5 text-xs text-zinc-500 leading-relaxed">
                The agent observes your connected tools in the background and builds context over time — without being asked.
                Control what it watches per channel, repo, or team below.
              </p>
            </div>
            <Toggle
              enabled={globalEnabled}
              onChange={handleGlobalMonitoringToggle}
              disabled={togglingGlobal}
            />
          </div>
        )}

        {/* ── Connected label ──────────────────────────────────────── */}
        <div className="mb-3 flex items-center gap-2">
          <p
            className="text-[10px] font-medium uppercase tracking-widest text-zinc-400"
            style={{ fontFamily: 'var(--font-geist-mono)' }}
          >
            Connected
          </p>
          {!loading && (
            <span
              className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-500"
              style={{ fontFamily: 'var(--font-geist-mono)' }}
            >
              {integrations.length}
            </span>
          )}
        </div>

        {/* Loading */}
        {loading && (
          <div className="flex items-center gap-3 py-10">
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-zinc-200 border-t-zinc-600" />
            <span
              className="text-xs text-zinc-400"
              style={{ fontFamily: 'var(--font-geist-mono)' }}
            >
              Loading integrations...
            </span>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Empty state */}
        {!loading && !error && integrations.length === 0 && (
          <div className="rounded-lg border border-dashed border-zinc-300 px-8 py-10 text-center">
            <p className="text-sm text-zinc-500">No integrations connected yet.</p>
            <p className="mt-1 text-xs text-zinc-400">Use the section below to get started.</p>
          </div>
        )}

        {/* ── Connected list ───────────────────────────────────────── */}
        {!loading && !error && integrations.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-zinc-200">
            {integrations.map((item, idx) => {
              const meta = INTEGRATION_META[item.provider];
              const isLast = idx === integrations.length - 1;
              const supportsMonitoring = meta?.supportsMonitoring === true;
              const providerMonitoringData = monitoringData?.providers[item.provider];
              const isExpanded = expandedProviders.has(item.provider);

              return (
                <div
                  key={item.provider}
                  className={!isLast ? 'border-b border-zinc-100' : ''}
                >
                  {/* Main row */}
                  <div className="row-hover flex items-center gap-4 px-5 py-4">
                    <ProviderIcon provider={item.provider} />

                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-zinc-900">{meta?.name ?? item.provider}</p>
                      <p
                        className="mt-0.5 truncate text-xs text-zinc-400"
                        style={{ fontFamily: 'var(--font-geist-mono)' }}
                      >
                        {item.account_label}
                      </p>
                    </div>

                    <div className="flex-shrink-0 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <span className="pulse-dot block h-1.5 w-1.5 rounded-full bg-green-500" />
                        <span
                          className="text-[10px] text-green-600"
                          style={{ fontFamily: 'var(--font-geist-mono)' }}
                        >
                          connected
                        </span>
                      </div>
                      <p
                        className="mt-0.5 text-[10px] text-zinc-400"
                        style={{ fontFamily: 'var(--font-geist-mono)' }}
                      >
                        since {formatDate(item.created_at)}
                      </p>
                    </div>

                    {/* Per-provider monitoring toggle */}
                    {supportsMonitoring && providerMonitoringData !== undefined && (
                      <div className="flex-shrink-0 flex items-center gap-1.5">
                        <span
                          className="text-[10px] text-zinc-400"
                          style={{ fontFamily: 'var(--font-geist-mono)' }}
                        >
                          monitoring
                        </span>
                        <Toggle
                          enabled={providerMonitoringData.monitoring_enabled}
                          onChange={(v) => handleProviderMonitoringToggle(item.provider, v)}
                          disabled={togglingProvider[item.provider] || !globalEnabled}
                        />
                      </div>
                    )}

                    <button
                      onClick={() => handleDisconnect(item.provider)}
                      disabled={!!disconnecting[item.provider]}
                      className="flex-shrink-0 rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-500 transition-all hover:border-red-300 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {disconnecting[item.provider] ? 'Removing...' : 'Disconnect'}
                    </button>

                    {/* Expand chevron */}
                    {supportsMonitoring && providerMonitoringData !== undefined && (
                      <button
                        onClick={() => toggleExpanded(item.provider)}
                        className="flex-shrink-0 text-zinc-400 hover:text-zinc-700"
                        aria-label={isExpanded ? 'Collapse' : 'Expand monitoring details'}
                      >
                        <svg
                          className={`chevron ${isExpanded ? 'chevron-open' : ''}`}
                          width="14" height="14" viewBox="0 0 24 24"
                          fill="none" stroke="currentColor" strokeWidth="2"
                          strokeLinecap="round" strokeLinejoin="round"
                        >
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </button>
                    )}
                  </div>

                  {/* Expandable resource list */}
                  {supportsMonitoring && (
                    <div className={`collapsible ${isExpanded ? 'collapsible-open' : ''}`}>
                      <div>
                        {renderResourceList(item.provider)}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Available integrations (collapsible) ─────────────────── */}
        {!loading && !error && available.length > 0 && (
          <div className="mt-5">
            <button
              onClick={() => setAvailableOpen((o) => !o)}
              className="flex w-full items-center justify-between rounded-lg border border-zinc-200 px-5 py-3.5 text-left transition-colors hover:bg-zinc-50"
            >
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-zinc-700">Add integrations</span>
                <span
                  className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-500"
                  style={{ fontFamily: 'var(--font-geist-mono)' }}
                >
                  {available.length} available
                </span>
              </div>
              <svg
                className={`chevron text-zinc-400 ${availableOpen ? 'chevron-open' : ''}`}
                width="14" height="14" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" strokeWidth="2"
                strokeLinecap="round" strokeLinejoin="round"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>

            <div className={`collapsible mt-1 ${availableOpen ? 'collapsible-open' : ''}`}>
              <div>
                <div className="overflow-hidden rounded-lg border border-zinc-200">
                  {available.map((provider, idx) => {
                    const meta = INTEGRATION_META[provider];
                    const isLast = idx === available.length - 1;
                    const isByokExpanded = provider === 'claude-code' && byokExpanded;
                    return (
                      <div key={provider} className={!isLast ? 'border-b border-zinc-100' : ''}>
                        <div className="row-hover flex items-center gap-4 px-5 py-4">
                          <ProviderIcon provider={provider} />
                          <div className="flex-1">
                            <p className="text-sm font-medium text-zinc-800">{meta.name}</p>
                            <p className="mt-0.5 text-xs text-zinc-400">{meta.settingsDescription}</p>
                            {meta.note && (
                              <p className="mt-1 text-[10px] text-amber-600 leading-relaxed">{meta.note}</p>
                            )}
                          </div>
                          {meta.comingSoon ? (
                            <span className="flex-shrink-0 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-medium text-zinc-400 cursor-default">
                              Coming soon
                            </span>
                          ) : meta.isByok ? (
                            <button
                              onClick={() => { setByokExpanded((o) => !o); setByokError(null); }}
                              className="flex-shrink-0 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 transition-all hover:border-zinc-400 hover:bg-zinc-50 hover:text-zinc-900"
                            >
                              {isByokExpanded ? 'Cancel' : 'Connect →'}
                            </button>
                          ) : (
                            <button
                              onClick={() => handleConnect(provider)}
                              className="flex-shrink-0 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 transition-all hover:border-zinc-400 hover:bg-zinc-50 hover:text-zinc-900"
                            >
                              Connect →
                            </button>
                          )}
                        </div>

                        {/* Inline BYOK token form */}
                        {isByokExpanded && (
                          <div className="border-t border-zinc-100 bg-zinc-50 px-5 py-4 space-y-3">
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
                                onClick={handleSaveClaudeCodeToken}
                                disabled={byokSaving}
                                className="flex-shrink-0 rounded-md bg-zinc-900 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-300"
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
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
