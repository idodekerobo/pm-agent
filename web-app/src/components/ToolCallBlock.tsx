'use client';

import { useState } from 'react';

interface ToolCallBlockProps {
  toolName: string;
  toolArguments: string;
  output: string | null; // null = output not yet received (loading)
}

function formatArguments(raw: string): string {
  try {
    const parsed = JSON.parse(raw);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return raw;
  }
}

export default function ToolCallBlock({ toolName, toolArguments, output }: ToolCallBlockProps) {
  const [expanded, setExpanded] = useState(false);
  const isLoading = output === null;

  return (
    <div className="w-full max-w-lg overflow-hidden rounded-lg border border-zinc-200 bg-white text-xs">
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-zinc-50"
        disabled={isLoading}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="shrink-0 text-zinc-400"
        >
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
        </svg>

        <span className="truncate font-mono font-medium text-zinc-600">{toolName}</span>

        <span className="ml-auto flex shrink-0 items-center gap-1.5 text-zinc-400">
          {isLoading ? (
            <span className="flex items-center gap-0.5">
              <span
                className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400"
                style={{ animationDelay: '0ms' }}
              />
              <span
                className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400"
                style={{ animationDelay: '150ms' }}
              />
              <span
                className="h-1.5 w-1.5 animate-bounce rounded-full bg-zinc-400"
                style={{ animationDelay: '300ms' }}
              />
            </span>
          ) : (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`transition-transform ${expanded ? 'rotate-180' : ''}`}
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          )}
        </span>
      </button>

      {expanded && !isLoading && (
        <div className="divide-y divide-zinc-100 border-t border-zinc-100">
          <div className="px-3 py-2.5">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
              Input
            </p>
            <pre className="whitespace-pre-wrap break-all font-mono text-[11px] leading-relaxed text-zinc-500">
              {formatArguments(toolArguments)}
            </pre>
          </div>
          <div className="px-3 py-2.5">
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-zinc-400">
              Output
            </p>
            <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-zinc-500">
              {output}
            </pre>
          </div>
        </div>
      )}
    </div>
  );
}
