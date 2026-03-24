'use client';

import Link from "next/link";

interface ChatHeaderProps {
  creditsRemaining: number | null;
  onFeedbackClick: () => void;
  onSignOut: () => void;
}

export default function ChatHeader({ creditsRemaining, onFeedbackClick, onSignOut }: ChatHeaderProps) {
  return (
    <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 bg-white px-6 py-4">
      <div>
        <h1 className="text-lg font-semibold text-zinc-900">Product Manager Agent</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Chat with your AI-powered product strategy assistant
        </p>
      </div>
      <div className="flex items-center gap-3">
        {creditsRemaining !== null && (
          <div className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm">
            <span className="text-zinc-500">Credits</span>
            <span className="ml-1.5 font-medium text-zinc-900">{creditsRemaining}</span>
          </div>
        )}
        <button
          onClick={onFeedbackClick}
          className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-500 focus:ring-offset-2"
        >
          Feedback
        </button>
        <Link
          href="/settings"
          className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-500 focus:ring-offset-2"
        >
          Settings
        </Link>
        <div className="border-l border-zinc-200 pl-3">
          <button
            onClick={onSignOut}
            className="rounded-lg border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 focus:outline-none focus:ring-2 focus:ring-zinc-500 focus:ring-offset-2"
          >
            Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}
