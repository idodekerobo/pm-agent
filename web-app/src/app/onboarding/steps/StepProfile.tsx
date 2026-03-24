'use client';

import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

type ScrapeStatus = 'idle' | 'loading' | 'done' | 'error';

interface StepProfileProps {
  fullName: string;
  setFullName: (v: string) => void;
  companyUrl: string;
  setCompanyUrl: (v: string) => void;
  scrapeStatus: ScrapeStatus;
  setScrapeStatus: (v: ScrapeStatus) => void;
  scrapeObservations: string;
  setScrapeObservations: (v: string) => void;
  scrapeConfirmed: boolean;
  setScrapeConfirmed: (v: boolean) => void;
  showCorrection: boolean;
  setShowCorrection: (v: boolean) => void;
  correction: string;
  setCorrection: (v: string) => void;
  correctionSubmitted: boolean;
  setCorrectionSubmitted: (v: boolean) => void;
  showScrapeDetail: boolean;
  setShowScrapeDetail: (v: boolean) => void;
  runScrape: () => void;
  handleConfirmScrape: () => void;
  handleSubmitCorrection: () => void;
}

export default function StepProfile({
  fullName,
  setFullName,
  companyUrl,
  setCompanyUrl,
  scrapeStatus,
  setScrapeStatus,
  scrapeObservations,
  setScrapeObservations,
  scrapeConfirmed,
  setScrapeConfirmed,
  showCorrection,
  setShowCorrection,
  correction,
  setCorrection,
  correctionSubmitted,
  setCorrectionSubmitted,
  showScrapeDetail,
  setShowScrapeDetail,
  runScrape,
  handleConfirmScrape,
  handleSubmitCorrection,
}: StepProfileProps) {
  return (
    <div className="px-8 py-6 space-y-5">
      {/* Name + URL inputs */}
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2 sm:col-span-1">
          <label className="block text-sm font-medium text-zinc-700 mb-1.5">Your name</label>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            disabled={scrapeStatus === 'loading'}
            className="block w-full rounded-md border border-zinc-300 bg-zinc-50/50 px-3 py-2.5 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 disabled:opacity-50"
            placeholder="Ada Lovelace"
          />
        </div>

        <div className="col-span-2 sm:col-span-1">
          <label className="block text-sm font-medium text-zinc-700 mb-1.5">Company or product URL</label>
          <div className="flex items-center rounded-md border border-zinc-300 bg-zinc-50/50 focus-within:border-zinc-900 focus-within:ring-1 focus-within:ring-zinc-900">
            <span className="flex items-center self-stretch pl-3 pr-2 text-sm text-zinc-400 select-none bg-zinc-100 border-r border-zinc-300 rounded-l-md">https://</span>
            <input
              type="text"
              value={companyUrl.replace(/^https?:\/\//, '')}
              onChange={(e) => {
                setCompanyUrl(e.target.value);
                if (scrapeStatus !== 'idle') {
                  setScrapeStatus('idle');
                  setScrapeObservations('');
                  setScrapeConfirmed(false);
                  setShowCorrection(false);
                  setCorrectionSubmitted(false);
                }
              }}
              disabled={scrapeStatus === 'loading'}
              className="flex-1 bg-transparent py-2.5 pl-3 pr-3 text-sm text-zinc-900 focus:outline-none disabled:opacity-50"
              placeholder="acme.com"
            />
          </div>
        </div>
      </div>

      {/* Analyze button — shown before scrape */}
      {scrapeStatus === 'idle' && (
        <button
          type="button"
          onClick={runScrape}
          className="w-full rounded-md bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 transition-colors"
        >
          Analyze →
        </button>
      )}

      {/* Loading state */}
      {scrapeStatus === 'loading' && (
        <div className="rounded-lg border border-zinc-100 bg-zinc-50 px-4 py-4">
          <div className="flex items-center gap-2.5 text-sm text-zinc-500">
            <svg className="animate-spin h-4 w-4 flex-shrink-0 text-zinc-400" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Reading your product page…
          </div>
          {scrapeObservations && (
            <div className="mt-3 text-sm text-zinc-600 leading-relaxed [&>p]:mb-1.5 [&>ul]:pl-4 [&>ul]:list-disc [&>ul>li]:mb-0.5 [&>strong]:font-semibold">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{scrapeObservations}</ReactMarkdown>
            </div>
          )}
        </div>
      )}

      {/* Scrape result */}
      {scrapeStatus === 'done' && !scrapeConfirmed && !correctionSubmitted && (
        <div className="rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-4 space-y-4">
          <div>
            <p className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2">Here&apos;s what I found</p>
            <div className="text-sm text-zinc-800 leading-relaxed [&>p]:mb-1.5 [&>ul]:pl-4 [&>ul]:list-disc [&>ul>li]:mb-0.5 [&>ol]:pl-4 [&>ol]:list-decimal [&>strong]:font-semibold">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{scrapeObservations}</ReactMarkdown>
            </div>
          </div>

          {!showCorrection ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleConfirmScrape}
                className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 transition-colors"
              >
                Yes, that&apos;s right
              </button>
              <button
                type="button"
                onClick={() => setShowCorrection(true)}
                className="rounded-md border border-zinc-200 bg-white px-4 py-2 text-sm font-medium text-zinc-600 hover:border-zinc-300 hover:text-zinc-900 transition-colors"
              >
                Not quite
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              <textarea
                value={correction}
                onChange={(e) => setCorrection(e.target.value)}
                rows={3}
                className="block w-full rounded-md border border-zinc-300 bg-white px-3 py-2.5 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 resize-none"
                placeholder="e.g. 'This is actually a different product' or 'I work on a specific team within this company'"
                autoFocus
              />
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSubmitCorrection}
                  disabled={!correction.trim()}
                  className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:bg-zinc-400 disabled:cursor-not-allowed transition-colors"
                >
                  Submit correction
                </button>
                <button
                  type="button"
                  onClick={() => { setShowCorrection(false); setCorrection(''); }}
                  className="text-sm text-zinc-500 hover:text-zinc-800 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Confirmed state — collapsible toggle */}
      {(scrapeConfirmed || correctionSubmitted) && (
        <div className="rounded-lg border border-green-200 bg-green-50 overflow-hidden">
          <button
            type="button"
            onClick={() => setShowScrapeDetail(!showScrapeDetail)}
            className="w-full flex items-center justify-between px-4 py-3 text-left"
          >
            <div className="flex items-center gap-2.5">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="flex-shrink-0 text-green-600">
                <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
                <path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <p className="text-sm text-green-800">
                {correctionSubmitted ? `Got it — I've noted your correction.` : 'Your product context is saved.'}
              </p>
            </div>
            <svg
              width="14" height="14" viewBox="0 0 16 16" fill="none"
              className={`flex-shrink-0 text-green-600 transition-transform ${showScrapeDetail ? 'rotate-180' : ''}`}
            >
              <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {showScrapeDetail && (
            <div className="border-t border-green-200 px-4 py-3 space-y-3 bg-green-50/60">
              <div className="text-sm text-zinc-700 leading-relaxed [&>p]:mb-1.5 [&>ul]:pl-4 [&>ul]:list-disc [&>ul>li]:mb-0.5 [&>strong]:font-semibold">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{scrapeObservations}</ReactMarkdown>
              </div>
              {correctionSubmitted && correction && (
                <div className="border-t border-green-200 pt-3">
                  <p className="text-xs font-medium text-green-700 mb-1">Your correction</p>
                  <p className="text-sm text-zinc-700 italic">{correction}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Scrape error with manual fallback */}
      {scrapeStatus === 'error' && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-4 space-y-3">
          <p className="text-sm text-amber-800">
            I wasn&apos;t able to read that page. You can describe your product instead — I&apos;ll use it as context.
          </p>
          <textarea
            value={correction}
            onChange={(e) => setCorrection(e.target.value)}
            rows={3}
            className="block w-full rounded-md border border-amber-200 bg-white px-3 py-2.5 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900 resize-none"
            placeholder="We build a B2B SaaS platform that helps logistics teams track shipments in real time…"
          />
          <button
            type="button"
            onClick={() => { if (correction.trim()) { setCorrectionSubmitted(true); setScrapeObservations(''); } }}
            disabled={!correction.trim()}
            className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:bg-zinc-400 disabled:cursor-not-allowed transition-colors"
          >
            Save and continue
          </button>
        </div>
      )}
    </div>
  );
}
