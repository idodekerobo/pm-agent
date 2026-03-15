'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabaseClient';
import { useIntegrations } from '@/lib/IntegrationsContext';
import { useAuth } from '@/lib/AuthContext';
import { usePostHog } from 'posthog-js/react';
import { EVENTS } from '@/lib/analytics';

interface EmptyStateChatProps {
  onPromptSelect: (prompt: string) => void;
}

const PROMPT_MAP = {
  both: [
    'Help me fix a bug',
    'Create a GitHub issue for a feature',
    'Take my Notion spec and open a GitHub issue for it',
    "Review what's in my repo",
  ],
  github: [
    'Help me fix a bug',
    'Create a GitHub issue for this feature',
    "Review what's in my repo",
    'Help me write a product spec',
  ],
  notion: [
    'Pull my latest spec from Notion and summarize it',
    'Help me write a spec',
    'Help me prioritize my backlog',
    'Research my competitors',
  ],
  technicalDefault: [
    'Help me write a product spec',
    'Help me prioritize my backlog',
    'Research my competitors',
    'Help me plan a technical architecture',
  ],
  default: [
    'Help me write a product spec',
    'Research my competitors',
    'Help me prioritize my backlog',
    'Draft a stakeholder update',
  ],
};

type PromptSet = 'both' | 'github' | 'notion' | 'technicalDefault' | 'default';

function getPrompts(hasGitHub: boolean, hasNotion: boolean, useCase: string): { prompts: string[]; promptSet: PromptSet } {
  if (hasGitHub && hasNotion) return { prompts: PROMPT_MAP.both, promptSet: 'both' };
  if (hasGitHub) return { prompts: PROMPT_MAP.github, promptSet: 'github' };
  if (hasNotion) return { prompts: PROMPT_MAP.notion, promptSet: 'notion' };
  const isTechnical = ['Technical planning', 'Manage backlog & issues'].some((o) =>
    useCase.includes(o)
  );
  return isTechnical
    ? { prompts: PROMPT_MAP.technicalDefault, promptSet: 'technicalDefault' }
    : { prompts: PROMPT_MAP.default, promptSet: 'default' };
}

export default function EmptyStateChat({ onPromptSelect }: EmptyStateChatProps) {
  const { integrations, loading: integrationsLoading } = useIntegrations();
  const { user } = useAuth();
  const [useCase, setUseCase] = useState('');
  const ph = usePostHog();

  useEffect(() => {
    if (!user?.id) return;
    createClient()
      .from('users')
      .select('use_case')
      .eq('id', user.id)
      .single()
      .then(({ data }) => setUseCase(data?.use_case ?? ''));
  }, [user?.id]);

  const providers = integrations.map((i) => i.provider);
  const hasGitHub = providers.includes('github');
  const hasNotion = providers.includes('notion');
  const { prompts, promptSet } = getPrompts(hasGitHub, hasNotion, useCase);

  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <div className="w-full max-w-xl">
        <p className="text-lg text-zinc-600">
          Start a conversation with your Product Manager Agent
        </p>
        <p className="mt-2 text-sm text-zinc-400">
          Ask questions about product strategy, market analysis, or feature prioritization
        </p>

        {!integrationsLoading && (
          <div className="mt-8 grid grid-cols-2 gap-3">
            {prompts.map((prompt) => (
              <button
                key={prompt}
                onClick={() => {
                  ph?.capture(EVENTS.EMPTY_STATE_PROMPT_CLICKED, { prompt_text: prompt, prompt_set: promptSet });
                  onPromptSelect(prompt);
                }}
                className="rounded-lg border border-zinc-200 bg-white px-4 py-3 text-left text-sm text-zinc-700 transition-colors hover:border-zinc-400 hover:bg-zinc-50"
              >
                {prompt}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
