'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/lib/AuthContext';

interface Integration {
  provider: string;
  account_label: string;
  scopes: string[];
  created_at: string;
}

const INTEGRATION_META: Record<string, { name: string; description: string; color: string; abbr: string; requiresManualRevoke?: boolean; note?: string; isByok?: boolean }> = {
  github:       { name: 'GitHub',       description: 'Repos, issues & pull requests',        color: '#24292F', abbr: 'GH' },
  linear:       { name: 'Linear',       description: 'Issue tracking & project management',   color: '#5E6AD2', abbr: 'LN' },
  google:       { name: 'Google Drive', description: 'Cloud storage & document sync',         color: '#34A853', abbr: 'GD' },
  notion:       { name: 'Notion',       description: 'Docs, notes & knowledge base',          color: '#191919', abbr: 'NT', requiresManualRevoke: true },
  slack:        { name: 'Slack',        description: 'Team messaging & channel alerts',        color: '#E01E5A', abbr: 'SL', note: 'After connecting, invite the agent to any Slack channels you want it active in.' },
  'claude-code': { name: 'Claude Code', description: 'AI coding assistant via your Anthropic API key', color: '#D97756', abbr: 'CC', isByok: true },
};

const ALL_PROVIDERS = ['github', 'linear', 'google', 'notion', 'slack', 'claude-code'];

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

export default function IntegrationsTab() {
  const { user, session } = useAuth();
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL;

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

  const fetchIntegrations = useCallback(async () => {
    try {
      const token = session?.access_token ?? '';
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
  }, [user, apiBase, session]);

  useEffect(() => {
    if (user) fetchIntegrations();
  }, [user, fetchIntegrations]);

  const handleDisconnect = async (provider: string) => {
    setDisconnecting((p) => ({ ...p, [provider]: true }));
    try {
      const token = session?.access_token ?? '';
      const res = await fetch(`${apiBase}/integrations/${provider}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      setIntegrations((p) => p.filter((i) => i.provider !== provider));
      if (INTEGRATION_META[provider]?.requiresManualRevoke) setNotionRevokeNotice(true);
    } catch {
      /* TODO: show error toast */
    } finally {
      setDisconnecting((p) => ({ ...p, [provider]: false }));
    }
  };

  const handleConnect = (provider: string) => {
    if (!user) return;
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
      const token = session?.access_token ?? '';
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
      setByokExpanded(false);
      setByokToken('');
    } catch {
      setByokError('Failed to save token. Please try again.');
    } finally {
      setByokSaving(false);
    }
  };

  const connectedSet = new Set(integrations.map((i) => i.provider));
  const available = ALL_PROVIDERS.filter((p) => !connectedSet.has(p));

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

        {/* ── Connected label ──────────────────────────────────── */}
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

        {/* ── Connected list ───────────────────────────────────── */}
        {!loading && !error && integrations.length > 0 && (
          <div className="overflow-hidden rounded-lg border border-zinc-200">
            {integrations.map((item, idx) => {
              const meta = INTEGRATION_META[item.provider];
              return (
                <div
                  key={item.provider}
                  className={`row-hover flex items-center gap-4 px-5 py-4 ${
                    idx < integrations.length - 1 ? 'border-b border-zinc-100' : ''
                  }`}
                >
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

                  <button
                    onClick={() => handleDisconnect(item.provider)}
                    disabled={!!disconnecting[item.provider]}
                    className="flex-shrink-0 rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-500 transition-all hover:border-red-300 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {disconnecting[item.provider] ? 'Removing...' : 'Disconnect'}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Available integrations (collapsible) ─────────────── */}
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
                            <p className="mt-0.5 text-xs text-zinc-400">{meta.description}</p>
                            {meta.note && (
                              <p className="mt-1 text-[10px] text-amber-600 leading-relaxed">{meta.note}</p>
                            )}
                          </div>
                          {meta.isByok ? (
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
