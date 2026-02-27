'use client';

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";

interface Integration {
  provider: string;
  account_label: string;
  scopes: string[];
  created_at: string;
}

const INTEGRATION_META: Record<string, { name: string; description: string; color: string; abbr: string }> = {
  linear: { name: "Linear",       description: "Issue tracking & project management", color: "#5E6AD2", abbr: "LN" },
  google: { name: "Google Drive", description: "Cloud storage & document sync",        color: "#34A853", abbr: "GD" },
  notion: { name: "Notion",       description: "Docs, notes & knowledge base",         color: "#191919", abbr: "NT" },
  slack:  { name: "Slack",        description: "Team messaging & channel alerts",       color: "#E01E5A", abbr: "SL" },
};

const ALL_PROVIDERS = ["linear", "google", "notion", "slack"];

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function ProviderIcon({ provider }: { provider: string }) {
  const meta = INTEGRATION_META[provider];
  if (!meta) return null;
  return (
    <div
      className="flex flex-shrink-0 items-center justify-center rounded-lg text-white"
      style={{ width: 36, height: 36, backgroundColor: meta.color }}
    >
      <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.06em", fontFamily: "var(--font-geist-mono)" }}>
        {meta.abbr}
      </span>
    </div>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const { user, session, signOut } = useAuth();
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState<Record<string, boolean>>({});
  const [availableOpen, setAvailableOpen] = useState(false);

  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL;

  const fetchIntegrations = useCallback(async () => {
    try {
      const token = session?.access_token ?? "";
      const res = await fetch(`${apiBase}/integrations/`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      setIntegrations(await res.json());
    } catch {
      setError("Could not load integrations. Please refresh.");
    } finally {
      setLoading(false);
    }
  }, [user, apiBase]);

  useEffect(() => {
    if (user) fetchIntegrations();
  }, [user, fetchIntegrations]);

  const handleDisconnect = async (provider: string) => {
    setDisconnecting((p) => ({ ...p, [provider]: true }));
    try {
      const token = session?.access_token ?? "";
      const res = await fetch(`${apiBase}/integrations/${provider}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error();
      setIntegrations((p) => p.filter((i) => i.provider !== provider));
    } catch {
      /* TODO: show error toast */
    } finally {
      setDisconnecting((p) => ({ ...p, [provider]: false }));
    }
  };

  const handleConnect = (provider: string) => {
    if (!user) return;
    window.open(`${apiBase}/integrations/${provider}/connect?user_id=${user.id}`, "_blank");
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      router.push("/auth/sign-in");
    } catch (err) {
      console.error("Error signing out:", err);
    }
  };

  const connectedSet = new Set(integrations.map((i) => i.provider));
  const available = ALL_PROVIDERS.filter((p) => !connectedSet.has(p));

  return (
    <>
      <style>{`
        @keyframes pulse-dot {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.35; }
        }
        .pulse-dot  { animation: pulse-dot 2.4s ease-in-out infinite; }
        .row-hover  { transition: background-color 0.1s ease; }
        .row-hover:hover { background-color: #fafafa; }

        .chevron      { transition: transform 0.2s ease; }
        .chevron-open { transform: rotate(180deg); }

        /* CSS grid trick for smooth height animation without fixed max-height */
        .collapsible      { display: grid; grid-template-rows: 0fr; transition: grid-template-rows 0.25s ease, opacity 0.2s ease; opacity: 0; }
        .collapsible-open { grid-template-rows: 1fr; opacity: 1; }
        .collapsible > div { overflow: hidden; }
      `}</style>

      <div className="flex h-screen flex-col bg-white">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-4">
          <div className="flex items-center gap-2.5">
            <Link
              href="/chat"
              className="flex items-center gap-1.5 text-sm text-zinc-400 transition-colors hover:text-zinc-700"
            >
              <svg width="13" height="13" viewBox="0 0 14 14" fill="none">
                <path d="M9 2L4 7L9 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Chat
            </Link>
            <span className="text-zinc-300">/</span>
            <span className="text-sm font-medium text-zinc-900">Settings</span>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-zinc-400" style={{ fontFamily: "var(--font-geist-mono)" }}>
              {user?.email}
            </span>
            <button
              onClick={handleSignOut}
              className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-500 focus:ring-offset-2"
            >
              Sign Out
            </button>
          </div>
        </div>

        {/* ── Body ───────────────────────────────────────────────────────── */}
        <div className="flex flex-1 overflow-hidden">

          {/* Sidebar */}
          <aside className="w-52 flex-shrink-0 border-r border-zinc-200 bg-zinc-50/60 px-4 py-8">
            <p
              className="mb-3 text-[10px] font-medium uppercase tracking-widest text-zinc-400"
              style={{ fontFamily: "var(--font-geist-mono)" }}
            >
              Menu
            </p>
            <nav className="flex flex-col gap-1">
              {/* Active tab */}
              <div className="flex items-center gap-2.5 rounded-md border border-zinc-200 bg-white px-3 py-2 text-sm font-medium text-zinc-900 shadow-sm">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect width="7" height="7" x="3"  y="3"  rx="1" />
                  <rect width="7" height="7" x="14" y="3"  rx="1" />
                  <rect width="7" height="7" x="14" y="14" rx="1" />
                  <rect width="7" height="7" x="3"  y="14" rx="1" />
                </svg>
                Integrations
              </div>
              {/* Placeholder tab */}
              <div className="flex cursor-not-allowed select-none items-center gap-2.5 rounded-md px-3 py-2 text-sm text-zinc-400">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                Account
                <span
                  className="ml-auto text-[9px] uppercase tracking-wider text-zinc-300"
                  style={{ fontFamily: "var(--font-geist-mono)" }}
                >
                  soon
                </span>
              </div>
            </nav>
          </aside>

          {/* Main content */}
          <main className="flex-1 overflow-y-auto px-10 py-8">
            <div className="max-w-xl">
              <h2 className="text-2xl font-semibold tracking-tight text-zinc-900">Integrations</h2>
              <p className="mt-1.5 text-sm text-zinc-500">
                Manage the tools and services your PM agent can access.
              </p>

              <div className="mt-8">

                {/* ── Connected label ──────────────────────────────────── */}
                <div className="mb-3 flex items-center gap-2">
                  <p
                    className="text-[10px] font-medium uppercase tracking-widest text-zinc-400"
                    style={{ fontFamily: "var(--font-geist-mono)" }}
                  >
                    Connected
                  </p>
                  {!loading && (
                    <span
                      className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-500"
                      style={{ fontFamily: "var(--font-geist-mono)" }}
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
                      style={{ fontFamily: "var(--font-geist-mono)" }}
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
                            idx < integrations.length - 1 ? "border-b border-zinc-100" : ""
                          }`}
                        >
                          <ProviderIcon provider={item.provider} />

                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium text-zinc-900">{meta?.name ?? item.provider}</p>
                            <p
                              className="mt-0.5 truncate text-xs text-zinc-400"
                              style={{ fontFamily: "var(--font-geist-mono)" }}
                            >
                              {item.account_label}
                            </p>
                          </div>

                          <div className="flex-shrink-0 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              <span className="pulse-dot block h-1.5 w-1.5 rounded-full bg-green-500" />
                              <span
                                className="text-[10px] text-green-600"
                                style={{ fontFamily: "var(--font-geist-mono)" }}
                              >
                                connected
                              </span>
                            </div>
                            <p
                              className="mt-0.5 text-[10px] text-zinc-400"
                              style={{ fontFamily: "var(--font-geist-mono)" }}
                            >
                              since {formatDate(item.created_at)}
                            </p>
                          </div>

                          <button
                            onClick={() => handleDisconnect(item.provider)}
                            disabled={!!disconnecting[item.provider]}
                            className="flex-shrink-0 rounded-md border border-red-200 px-3 py-1.5 text-xs font-medium text-red-500 transition-all hover:border-red-300 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {disconnecting[item.provider] ? "Removing..." : "Disconnect"}
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
                          style={{ fontFamily: "var(--font-geist-mono)" }}
                        >
                          {available.length} available
                        </span>
                      </div>
                      <svg
                        className={`chevron text-zinc-400 ${availableOpen ? "chevron-open" : ""}`}
                        width="14" height="14" viewBox="0 0 24 24"
                        fill="none" stroke="currentColor" strokeWidth="2"
                        strokeLinecap="round" strokeLinejoin="round"
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>

                    <div className={`collapsible mt-1 ${availableOpen ? "collapsible-open" : ""}`}>
                      <div>
                        <div className="overflow-hidden rounded-lg border border-zinc-200">
                          {available.map((provider, idx) => {
                            const meta = INTEGRATION_META[provider];
                            return (
                              <div
                                key={provider}
                                className={`row-hover flex items-center gap-4 px-5 py-4 ${
                                  idx < available.length - 1 ? "border-b border-zinc-100" : ""
                                }`}
                              >
                                <ProviderIcon provider={provider} />
                                <div className="flex-1">
                                  <p className="text-sm font-medium text-zinc-800">{meta.name}</p>
                                  <p className="mt-0.5 text-xs text-zinc-400">{meta.description}</p>
                                </div>
                                <button
                                  onClick={() => handleConnect(provider)}
                                  className="flex-shrink-0 rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-xs font-medium text-zinc-600 transition-all hover:border-zinc-400 hover:bg-zinc-50 hover:text-zinc-900"
                                >
                                  Connect →
                                </button>
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
          </main>
        </div>
      </div>
    </>
  );
}
