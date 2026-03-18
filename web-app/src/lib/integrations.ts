export interface IntegrationConfig {
  key: string;
  name: string;
  abbr: string;
  color: string;
  onboardingDescription: string;
  settingsDescription: string;
  note?: string;
  comingSoon?: boolean;
  isByok?: boolean;
  requiresManualRevoke?: boolean;
  supportsMonitoring?: boolean;
}

export const INTEGRATIONS: IntegrationConfig[] = [
  {
    key: 'github',
    name: 'GitHub',
    abbr: 'GH',
    color: '#24292F',
    onboardingDescription: 'Open PRs, create issues, and sync your codebase directly from chat.',
    settingsDescription: 'Repos, issues & pull requests',
    supportsMonitoring: true,
  },
  {
    key: 'slack',
    name: 'Slack',
    abbr: 'SL',
    color: '#E01E5A',
    onboardingDescription: 'Get updates and trigger tasks from Slack. Your agent meets your team where they already work.',
    settingsDescription: 'Team messaging & channel alerts',
    note: 'After connecting, invite the agent to any Slack channels you want it active in.',
    supportsMonitoring: true,
  },
  {
    key: 'notion',
    name: 'Notion',
    abbr: 'NT',
    color: '#191919',
    onboardingDescription: 'Read and write your knowledge base. Sync docs and database context automatically.',
    settingsDescription: 'Docs, databases & sync your knowledge base',
    requiresManualRevoke: true,
  },
  {
    key: 'linear',
    name: 'Linear',
    abbr: 'LN',
    color: '#5E6AD2',
    onboardingDescription: 'Create and triage issues automatically. Manage your full backlog and sprint cycles from chat.',
    settingsDescription: 'Issue tracking & project management',
    supportsMonitoring: true,
  },
  {
    key: 'claude-code',
    name: 'Claude Code',
    abbr: 'CC',
    color: '#D97756',
    onboardingDescription: 'Use your own Anthropic API key to power your agent with AI coding capabilities.',
    settingsDescription: 'AI coding assistant via your Anthropic API key',
    isByok: true,
  },
  {
    key: 'google',
    name: 'Google Drive',
    abbr: 'GD',
    color: '#34A853',
    onboardingDescription: 'Write Docs and Sheets directly. Your agent can use Drive as a live knowledge base.',
    settingsDescription: 'Write docs & sheets, and sync your knowledge base',
  },
  {
    key: 'figma',
    name: 'Figma',
    abbr: 'FG',
    color: '#F24E1E',
    onboardingDescription: 'Reference and annotate design files directly in your specs and PRDs.',
    settingsDescription: 'Reference design files',
    comingSoon: true,
  },
  {
    key: 'posthog',
    name: 'PostHog',
    abbr: 'PH',
    color: '#FF5A31',
    onboardingDescription: 'Pull product analytics and user behavior into your planning context automatically.',
    settingsDescription: 'Product analytics & user insights',
    isByok: true,
    note: 'Create your API key in PostHog under Settings → Personal API keys. Grant read access for:\n- Query\n- Feature Flag\n- Project\n- Organization\n- Experiment\n- Cohort\n- Insight',
  },
  {
    key: 'jira',
    name: 'Jira',
    abbr: 'JR',
    color: '#0052CC',
    onboardingDescription: 'Sync issues and epics. Your agent can create and update Jira tickets from a spec.',
    settingsDescription: 'Issue tracking & sprint management',
    comingSoon: true,
  },
];
