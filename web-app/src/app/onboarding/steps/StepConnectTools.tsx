'use client';

import { INTEGRATIONS } from '@/lib/integrations';

interface IntegrationStatus {
  [key: string]: boolean;
}

interface StepConnectToolsProps {
  integrations: IntegrationStatus;
  connectingProvider: string | null;
  byokExpanded: boolean;
  setByokExpanded: (v: boolean) => void;
  byokToken: string;
  setByokToken: (v: string) => void;
  byokSaving: boolean;
  byokError: string;
  handleConnect: (providerKey: string) => void;
  handleSaveClaudeCodeToken: () => void;
}

export default function StepConnectTools({
  integrations,
  connectingProvider,
  byokExpanded,
  setByokExpanded,
  byokToken,
  setByokToken,
  byokSaving,
  byokError,
  handleConnect,
  handleSaveClaudeCodeToken,
}: StepConnectToolsProps) {
  return (
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
                <p className="mt-0.5 text-xs text-zinc-500 leading-relaxed">{integration.onboardingDescription}</p>
                {'note' in integration && integration.note && (
                  <p className="mt-1 text-[10px] text-amber-600 leading-relaxed">{integration.note}</p>
                )}
              </div>

              {isComingSoon ? (
                <button
                  type="button"
                  className="flex-shrink-0 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-medium text-zinc-400 hover:border-zinc-300 hover:text-zinc-500 transition-colors cursor-pointer"
                >
                  Coming soon
                </button>
              ) : isByok ? (
                <button
                  type="button"
                  onClick={() => { if (!connected) { setByokExpanded(!byokExpanded); } }}
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
  );
}
