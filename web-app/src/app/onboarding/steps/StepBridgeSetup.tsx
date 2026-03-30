'use client';

import { useState } from 'react';
import { useBridge } from '@/lib/BridgeContext';

const STEPS = [
  { num: 1, label: 'Install', cmd: 'curl -fsSL https://install.draftai.us | sh', hint: null },
  { num: 2, label: 'Start', cmd: 'draft-bridge start', hint: 'A browser window will open on first run — sign in to authenticate.' },
];

export default function StepBridgeSetup() {
  const { bridgeStatus, retryNow } = useBridge();
  const [copiedStep, setCopiedStep] = useState<number | null>(null);

  const copyToClipboard = async (text: string, step: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedStep(step);
      setTimeout(() => setCopiedStep(null), 2000);
    } catch {
      // clipboard not available
    }
  };

  return (
    <div className="px-8 py-6 flex flex-col gap-5">
      {STEPS.map(({ num, label, cmd, hint }) => (
        <div key={num} className="flex items-start gap-4">
          <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-xs font-medium text-white">
            {num}
          </div>
          <div className="flex-1 min-w-0">
            <p className="mb-1 text-xs font-medium text-zinc-500">{label}</p>
            <div className="flex items-center justify-between rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2">
              <code
                className="text-xs text-zinc-800 truncate"
                style={{ fontFamily: 'var(--font-geist-mono)' }}
              >
                {cmd}
              </code>
              <button
                type="button"
                onClick={() => copyToClipboard(cmd, num)}
                className="ml-3 shrink-0 text-xs text-zinc-400 hover:text-zinc-700 transition-colors"
              >
                {copiedStep === num ? 'Copied!' : 'Copy'}
              </button>
            </div>
            {hint && <p className="mt-1.5 text-xs text-zinc-400">{hint}</p>}
          </div>
        </div>
      ))}

      <div className="mt-2 flex items-center gap-3">
        <button
          type="button"
          onClick={retryNow}
          className="rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
        >
          Verify Connection
        </button>

        <div className="flex items-center gap-2 text-sm">
          {bridgeStatus === 'checking' && (
            <>
              <svg
                className="animate-spin h-3.5 w-3.5 text-zinc-400"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="text-zinc-400">Checking…</span>
            </>
          )}
          {bridgeStatus === 'connected' && (
            <>
              <span className="h-2 w-2 rounded-full bg-green-500" />
              <span className="font-medium text-green-700">Bridge connected</span>
            </>
          )}
          {bridgeStatus === 'disconnected' && (
            <>
              <span className="h-2 w-2 rounded-full bg-red-400" />
              <span className="text-zinc-500">
                Not detected — run{' '}
                <code
                  className="rounded bg-zinc-100 px-1 text-xs"
                  style={{ fontFamily: 'var(--font-geist-mono)' }}
                >
                  draft-bridge start
                </code>
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
