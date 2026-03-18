'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import {
  BASE_MEMORY_PROMPT,
  getMemoryPrompt,
  getNextOtherLabel,
  MEMORY_PROVIDERS,
  type MemoryProvider,
  type ImportedMemory,
} from '@/lib/memoryImport';

export default function MemoryTab() {
  const { session } = useAuth();
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL;

  const [importedMemories, setImportedMemories] = useState<ImportedMemory[]>([]);
  const [memoryWorkOnly, setMemoryWorkOnly] = useState(false);
  const [memoryRedactPII, setMemoryRedactPII] = useState(false);
  const [memoryPromptText, setMemoryPromptText] = useState(BASE_MEMORY_PROMPT);
  const [copied, setCopied] = useState(false);
  const [showProviderDropdown, setShowProviderDropdown] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<'idle' | 'success' | 'error'>('idle');

  useEffect(() => {
    setMemoryPromptText(getMemoryPrompt(memoryWorkOnly, memoryRedactPII));
  }, [memoryWorkOnly, memoryRedactPII]);

  const handleSubmit = async () => {
    const nonEmpty = importedMemories.filter((m) => m.content.trim());
    if (!nonEmpty.length) return;

    setSubmitting(true);
    setSubmitStatus('idle');
    try {
      const res = await fetch(`${apiBase}/user/memories/import`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token ?? ''}`,
        },
        body: JSON.stringify({ imported_memories: nonEmpty }),
      });
      if (!res.ok) throw new Error();
      setSubmitStatus('success');
      setImportedMemories([]);
    } catch {
      setSubmitStatus('error');
    } finally {
      setSubmitting(false);
    }
  };

  const hasContent = importedMemories.some((m) => m.content.trim());

  return (
    <div className="px-8 py-8 max-w-2xl space-y-7">
      <div>
        <h2 className="text-sm font-semibold text-zinc-900">Import AI Memories</h2>
        <p className="mt-1 text-sm text-zinc-500">
          Import memories from ChatGPT, Claude, or Gemini to give your agent more context about you. You can do this as many times as you like — new memories are merged into your existing context files.
        </p>
      </div>

      {/* Add-on checkboxes */}
      <div className="space-y-2.5">
        <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Prompt options</p>
        <label className="flex items-center gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={memoryWorkOnly}
            onChange={(e) => setMemoryWorkOnly(e.target.checked)}
            className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500"
          />
          <span className="text-sm text-zinc-700">Only include work and business related items</span>
        </label>
        <label className="flex items-center gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={memoryRedactPII}
            onChange={(e) => setMemoryRedactPII(e.target.checked)}
            className="h-4 w-4 rounded border-zinc-300 text-zinc-900 focus:ring-zinc-500"
          />
          <span className="text-sm text-zinc-700">Redact personal data (names, locations, etc.)</span>
        </label>
      </div>

      {/* Editable prompt textarea */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Prompt to copy</p>
          <button
            type="button"
            onClick={() => { navigator.clipboard.writeText(memoryPromptText); setCopied(true); setTimeout(() => setCopied(false), 2000); }}
            className="rounded border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs font-medium text-zinc-600 hover:bg-zinc-100 transition-colors"
          >
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>
        <p className="text-xs text-zinc-400">Feel free to edit the prompt to your needs.</p>
        <textarea
          value={memoryPromptText}
          onChange={(e) => setMemoryPromptText(e.target.value)}
          rows={7}
          className="block w-full rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2.5 text-xs text-zinc-700 font-mono leading-relaxed focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 resize-y"
        />
      </div>

      {/* Provider links */}
      <div className="flex items-center gap-1.5 flex-wrap">
        <p className="text-xs text-zinc-400 mr-1">Open in:</p>
        {MEMORY_PROVIDERS.filter((p) => p.url).map((p) => (
          <a
            key={p.key}
            href={p.url}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-600 hover:border-zinc-300 hover:text-zinc-900 transition-colors"
          >
            {p.label} ↗
          </a>
        ))}
      </div>

      {/* Per-provider paste areas */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide">Paste responses</p>
            <p className="text-xs text-zinc-400 mt-0.5">Works with any AI tool — Claude Code, Cursor, Devin, Dia, and more.</p>
          </div>
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowProviderDropdown((v) => !v)}
              className="rounded border border-zinc-200 bg-white px-2.5 py-1 text-xs font-medium text-zinc-600 hover:border-zinc-300 hover:text-zinc-900 transition-colors"
            >
              + Add provider
            </button>
            {showProviderDropdown && (
              <div className="absolute right-0 top-full mt-1 z-10 min-w-[140px] rounded-md border border-zinc-200 bg-white shadow-sm">
                {MEMORY_PROVIDERS.filter((p) => p.key === 'other' || !importedMemories.find((m) => m.provider === p.key)).map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => {
                      setImportedMemories((prev) => {
                        const label = p.key === 'other' ? getNextOtherLabel(prev) : undefined;
                        return [...prev, { provider: p.key as MemoryProvider, content: '', customLabel: label, _id: Math.random().toString(36).slice(2) }];
                      });
                      setShowProviderDropdown(false);
                    }}
                    className="block w-full text-left px-4 py-2 text-sm text-zinc-700 hover:bg-zinc-50 first:rounded-t-md last:rounded-b-md"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {importedMemories.length === 0 && (
          <p className="text-xs text-zinc-400 italic">No providers added yet. Run the prompt above in your AI assistant, then paste the response here.</p>
        )}

        {importedMemories.map((mem, idx) => {
          const displayLabel = mem.provider === 'other' ? (mem.customLabel ?? 'Other') : MEMORY_PROVIDERS.find((p) => p.key === mem.provider)?.label ?? mem.provider;
          return (
            <div key={mem._id ?? mem.provider} className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                {mem.provider === 'other' ? (
                  <input
                    type="text"
                    value={mem.customLabel ?? 'Other'}
                    onChange={(e) => {
                      const updated = [...importedMemories];
                      updated[idx] = { ...updated[idx], customLabel: e.target.value };
                      setImportedMemories(updated);
                    }}
                    placeholder="Provider name"
                    className="rounded border border-zinc-200 bg-zinc-50 px-2 py-1 text-xs font-medium text-zinc-700 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 w-36"
                  />
                ) : (
                  <p className="text-xs font-medium text-zinc-700">{displayLabel}</p>
                )}
                <button
                  type="button"
                  onClick={() => setImportedMemories((prev) => prev.filter((_, i) => i !== idx))}
                  className="text-xs text-zinc-400 hover:text-red-500 transition-colors flex-shrink-0"
                >
                  Remove
                </button>
              </div>
              <textarea
                value={mem.content}
                onChange={(e) => {
                  const updated = [...importedMemories];
                  updated[idx] = { ...updated[idx], content: e.target.value };
                  setImportedMemories(updated);
                }}
                rows={5}
                placeholder={`Paste your ${displayLabel} response here…`}
                className="block w-full rounded-md border border-zinc-200 bg-white px-3 py-2.5 text-sm text-zinc-700 placeholder-zinc-300 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 resize-y"
              />
            </div>
          );
        })}
      </div>

      {/* Submit */}
      {importedMemories.length > 0 && (
        <div className="space-y-2">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !hasContent}
            className="rounded-md bg-zinc-900 px-5 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:bg-zinc-400 disabled:cursor-not-allowed transition-colors"
          >
            {submitting ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Importing…
              </span>
            ) : (
              'Import memories →'
            )}
          </button>
          {!hasContent && (
            <p className="text-xs text-zinc-400">Paste at least one response before importing.</p>
          )}
        </div>
      )}

      {submitStatus === 'success' && (
        <div className="rounded-md border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          Your memories are being merged into your workspace. This may take a moment.
        </div>
      )}
      {submitStatus === 'error' && (
        <div className="rounded-md border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700">
          Something went wrong. Please try again.
        </div>
      )}
    </div>
  );
}
