'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/AuthContext';

export default function FeedbackTab() {
  const { session } = useAuth();
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL;

  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);

  const handleFeedbackSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedbackText.trim()) return;
    setFeedbackSubmitting(true);
    setFeedbackError(null);
    try {
      const token = session?.access_token ?? '';
      const res = await fetch(`${apiBase}/feedback`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ description: feedbackText.trim() }),
      });
      if (!res.ok) throw new Error();
      setFeedbackSubmitted(true);
      setFeedbackText('');
    } catch {
      setFeedbackError('Something went wrong. Please try again.');
    } finally {
      setFeedbackSubmitting(false);
    }
  };

  return (
    <div className="max-w-xl">
      <h2 className="text-2xl font-semibold tracking-tight text-zinc-900">Feedback</h2>
      <p className="mt-1.5 text-sm text-zinc-500">
        Report a bug, describe an issue, or request a feature.
      </p>

      <div className="mt-8">
        {feedbackSubmitted ? (
          <div className="flex flex-col items-start gap-3 rounded-lg border border-zinc-200 px-6 py-8">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-100">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-zinc-700">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-medium text-zinc-900">Thanks for your feedback!</p>
              <p className="mt-0.5 text-xs text-zinc-400">We read every submission and use it to improve.</p>
            </div>
            <button
              onClick={() => setFeedbackSubmitted(false)}
              className="mt-1 text-xs font-medium text-zinc-500 underline underline-offset-2 hover:text-zinc-900"
            >
              Submit another
            </button>
          </div>
        ) : (
          <form onSubmit={handleFeedbackSubmit} className="flex flex-col gap-4">
            <div>
              <label className="mb-1.5 block text-xs font-medium text-zinc-600">
                Description
              </label>
              <textarea
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                placeholder="Describe a bug, issue, or feature you'd like to see..."
                rows={6}
                className="w-full resize-none rounded-lg border border-zinc-300 bg-white px-3.5 py-3 text-sm text-zinc-900 placeholder-zinc-400 focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
              />
            </div>
            {feedbackError && <p className="text-xs text-red-600">{feedbackError}</p>}
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={feedbackSubmitting || !feedbackText.trim()}
                className="rounded-lg bg-zinc-900 px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-zinc-700 disabled:cursor-not-allowed disabled:bg-zinc-300"
              >
                {feedbackSubmitting ? 'Sending...' : 'Send feedback'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
