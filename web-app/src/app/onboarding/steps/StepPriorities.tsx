'use client';

const FOCUS_CHIPS = [
  'Shipping features',
  'Reducing bugs',
  'Growing users',
  'Cutting costs',
  'Managing stakeholders',
];

const ACTIVITY_CHIPS = [
  'Design & specs',
  'Data & analytics',
  'Customer support',
  'Engineering collaboration',
  'Strategy & planning',
];

const FOCUS_REACTIONS: Record<string, string> = {
  'Shipping features': "Shipping focus — I'll keep sprint planning, spec writing, and engineering handoffs front of mind.",
  'Reducing bugs': "Bug reduction focus — I'll prioritize helping you triage issues and write clear bug specs.",
  'Growing users': "Growth focus — I'll keep user metrics, retention, and acquisition context front of mind.",
  'Cutting costs': "Cost focus — I'll look for opportunities to surface efficiency signals in your planning.",
  'Managing stakeholders': "Stakeholder focus — I'll help you communicate clearly and keep everyone aligned.",
};

const ACTIVITY_REACTIONS: Record<string, string> = {
  'Design & specs': "Got it — spec writing and design alignment will be where I add the most value for you.",
  'Data & analytics': "Got it — I'll lean into helping you interpret data and turn it into decisions.",
  'Customer support': "Got it — I'll help you turn customer signals into actionable product insights.",
  'Engineering collaboration': "Got it — I'll focus on making engineering handoffs and technical planning smoother.",
  'Strategy & planning': "Got it — I'll help you think through roadmaps, trade-offs, and strategic decisions.",
};

interface StepPrioritiesProps {
  step2Intro: string | null;
  currentFocus: string[];
  dailyActivities: string[];
  focusCustom: string;
  setFocusCustom: (v: string) => void;
  activityCustom: string;
  setActivityCustom: (v: string) => void;
  showFocusCustom: boolean;
  setShowFocusCustom: (v: boolean) => void;
  showActivityCustom: boolean;
  setShowActivityCustom: (v: boolean) => void;
  toggleFocus: (chip: string) => void;
  toggleActivity: (chip: string) => void;
  addFocusCustom: () => void;
  addActivityCustom: () => void;
}

export default function StepPriorities({
  step2Intro,
  currentFocus,
  dailyActivities,
  focusCustom,
  setFocusCustom,
  activityCustom,
  setActivityCustom,
  showFocusCustom,
  setShowFocusCustom,
  showActivityCustom,
  setShowActivityCustom,
  toggleFocus,
  toggleActivity,
  addFocusCustom,
  addActivityCustom,
}: StepPrioritiesProps) {
  return (
    <div className="px-8 py-6 space-y-6">
      {/* Correction acknowledgment */}
      {step2Intro && (
        <p className="text-sm text-zinc-600 italic">{step2Intro}</p>
      )}

      {/* Focus chips */}
      <div>
        <p className="text-sm font-medium text-zinc-700 mb-1">What are your biggest focus areas?</p>
        <p className="text-xs text-zinc-400 mb-3">Select all that apply.</p>
        <div className="flex flex-wrap gap-2">
          {FOCUS_CHIPS.map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => toggleFocus(chip)}
              className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
                currentFocus.includes(chip)
                  ? 'border-zinc-900 bg-zinc-900 text-white'
                  : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50'
              }`}
            >
              {chip}
            </button>
          ))}
          {/* Persisted custom focus chips */}
          {currentFocus.filter((f) => !FOCUS_CHIPS.includes(f)).map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => toggleFocus(chip)}
              className="rounded-full border border-zinc-900 bg-zinc-900 text-white px-3.5 py-1.5 text-sm transition-colors"
            >
              {chip}
            </button>
          ))}
          {!showFocusCustom && (
            <button
              type="button"
              onClick={() => setShowFocusCustom(true)}
              className="rounded-full border border-dashed border-zinc-300 px-3.5 py-1.5 text-sm text-zinc-400 hover:border-zinc-400 hover:text-zinc-600 transition-colors"
            >
              + Add your own
            </button>
          )}
          {showFocusCustom && (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={focusCustom}
                onChange={(e) => setFocusCustom(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addFocusCustom(); }}
                autoFocus
                placeholder="Your focus…"
                className="rounded-full border border-zinc-300 px-3.5 py-1.5 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
              />
              <button type="button" onClick={addFocusCustom} className="text-xs text-zinc-600 hover:text-zinc-900">Add</button>
            </div>
          )}
        </div>

        {currentFocus.length > 0 && (
          <p className="mt-3 text-sm text-zinc-500 italic">
            {FOCUS_REACTIONS[currentFocus[currentFocus.length - 1]] ?? `${currentFocus[currentFocus.length - 1]} — got it, I'll keep that front of mind.`}
          </p>
        )}
      </div>

      {/* Activity chips */}
      <div>
        <p className="text-sm font-medium text-zinc-700 mb-1">What do you spend most of your time on?</p>
        <p className="text-xs text-zinc-400 mb-3">Select all that apply.</p>
        <div className="flex flex-wrap gap-2">
          {ACTIVITY_CHIPS.map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => toggleActivity(chip)}
              className={`rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
                dailyActivities.includes(chip)
                  ? 'border-zinc-900 bg-zinc-900 text-white'
                  : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50'
              }`}
            >
              {chip}
            </button>
          ))}
          {/* Persisted custom activity chips */}
          {dailyActivities.filter((a) => !ACTIVITY_CHIPS.includes(a)).map((chip) => (
            <button
              key={chip}
              type="button"
              onClick={() => toggleActivity(chip)}
              className="rounded-full border border-zinc-900 bg-zinc-900 text-white px-3.5 py-1.5 text-sm transition-colors"
            >
              {chip}
            </button>
          ))}
          {!showActivityCustom && (
            <button
              type="button"
              onClick={() => setShowActivityCustom(true)}
              className="rounded-full border border-dashed border-zinc-300 px-3.5 py-1.5 text-sm text-zinc-400 hover:border-zinc-400 hover:text-zinc-600 transition-colors"
            >
              + Add your own
            </button>
          )}
          {showActivityCustom && (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={activityCustom}
                onChange={(e) => setActivityCustom(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') addActivityCustom(); }}
                autoFocus
                placeholder="Your activity…"
                className="rounded-full border border-zinc-300 px-3.5 py-1.5 text-sm focus:border-zinc-900 focus:outline-none focus:ring-1 focus:ring-zinc-900"
              />
              <button type="button" onClick={addActivityCustom} className="text-xs text-zinc-600 hover:text-zinc-900">Add</button>
            </div>
          )}
        </div>

        {dailyActivities.length > 0 && (
          <p className="mt-3 text-sm text-zinc-500 italic">
            {ACTIVITY_REACTIONS[dailyActivities[dailyActivities.length - 1]] ?? `${dailyActivities[dailyActivities.length - 1]} — noted.`}
          </p>
        )}
      </div>
    </div>
  );
}
