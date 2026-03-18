// ---------------------------------------------------------------------------
// Base prompt — all memories, no filtering
// ---------------------------------------------------------------------------
export const BASE_MEMORY_PROMPT = `Export all of my stored memories and any context you've learned about me from past conversations. Preserve my words verbatim where possible, especially for instructions and preferences.

## Categories (output in this order):

1. **Instructions**: Rules I've explicitly asked you to follow going forward — tone, format, style, "always do X", "never do Y", and corrections to your behavior. Only include rules from stored memories, not from conversations.

2. **Identity**: Name, age, location, education, family, relationships, languages, and personal interests.

3. **Career**: Current and past roles, companies, and general skill areas.

4. **Projects**: Projects I meaningfully built or committed to. Ideally ONE entry per project. Include what it does, current status, and any key decisions. Use the project name or a short descriptor as the first words of the entry.

5. **Preferences**: Opinions, tastes, and working-style preferences that apply broadly.

## Format:

Use section headers for each category. Within each category, list one entry per line, sorted by oldest date first. Format each line as:

[YYYY-MM-DD] - Entry content here.

If no date is known, use [unknown] instead.

## Output:
- Wrap the entire export in a single code block for easy copying.
- After the code block, state whether this is the complete set or if more remain.`;

// ---------------------------------------------------------------------------
// Work/business only — strips personal life from Identity and Preferences
// ---------------------------------------------------------------------------
export const WORK_ONLY_MEMORY_PROMPT = `Only export work and business related memories. Omit personal, social, and leisure content entirely.

Export my stored work and business memories and context you've learned about me from past conversations. Preserve my words verbatim where possible, especially for instructions and preferences.

## Categories (output in this order):

1. **Instructions**: Rules I've explicitly asked you to follow going forward — tone, format, style, "always do X", "never do Y", and corrections to your behavior. Only include rules from stored memories, not from conversations.

2. **Identity**: Name, location, education, and languages only. Omit age, family details, relationships, and personal interests.

3. **Career**: Current and past roles, companies, and general skill areas.

4. **Projects**: Projects I meaningfully built or committed to. Ideally ONE entry per project. Include what it does, current status, and any key decisions. Use the project name or a short descriptor as the first words of the entry.

5. **Preferences**: Work-style preferences and professional opinions that apply broadly. Omit personal tastes unrelated to work.

## Format:

Use section headers for each category. Within each category, list one entry per line, sorted by oldest date first. Format each line as:

[YYYY-MM-DD] - Entry content here.

If no date is known, use [unknown] instead.

## Output:
- Wrap the entire export in a single code block for easy copying.
- After the code block, state whether this is the complete set or if more remain.`;

// ---------------------------------------------------------------------------
// Redact personal data — strips PII from Identity, adds redaction instruction
// ---------------------------------------------------------------------------
export const REDACT_PII_MEMORY_PROMPT = `Redact personal data and keep focus on working preferences, work/business/career, and projects.

Export my stored memories and context you've learned about me from past conversations. Preserve my words verbatim where possible, especially for instructions and preferences.

## Categories (output in this order):

1. **Instructions**: Rules I've explicitly asked you to follow going forward — tone, format, style, "always do X", "never do Y", and corrections to your behavior. Only include rules from stored memories, not from conversations.

2. **Identity**: Name, education, and general location (city/region only). Omit age, specific addresses, family details, relationships, and personal interests.

3. **Career**: Current and past roles, companies, and general skill areas.

4. **Projects**: Projects I meaningfully built or committed to. Ideally ONE entry per project. Include what it does, current status, and any key decisions. Use the project name or a short descriptor as the first words of the entry.

5. **Preferences**: Opinions and working-style preferences that apply broadly. Replace any names of other people, phone numbers, or specific addresses with [REDACTED].

## Format:

Use section headers for each category. Within each category, list one entry per line, sorted by oldest date first. Format each line as:

[YYYY-MM-DD] - Entry content here.

If no date is known, use [unknown] instead.

## Output:
- Wrap the entire export in a single code block for easy copying.
- After the code block, state whether this is the complete set or if more remain.`;

// ---------------------------------------------------------------------------
// Both: work only + redact PII — most restrictive variant
// ---------------------------------------------------------------------------
export const WORK_ONLY_REDACT_PII_MEMORY_PROMPT = `Only export work and business related memories. Redact all personal data.

Export my stored work and business memories and context you've learned about me from past conversations. Preserve my words verbatim where possible, especially for instructions and preferences.

## Categories (output in this order):

1. **Instructions**: Rules I've explicitly asked you to follow going forward — tone, format, style, "always do X", "never do Y", and corrections to your behavior. Only include rules from stored memories, not from conversations.

2. **Identity**: Name and education only. Omit all other personal details.

3. **Career**: Current and past roles, companies, and general skill areas.

4. **Projects**: Projects I meaningfully built or committed to. Ideally ONE entry per project. Include what it does, current status, and any key decisions. Use the project name or a short descriptor as the first words of the entry.

5. **Preferences**: Work-style preferences and professional opinions that apply broadly. Replace any names of other people, phone numbers, or specific addresses with [REDACTED].

## Format:

Use section headers for each category. Within each category, list one entry per line, sorted by oldest date first. Format each line as:

[YYYY-MM-DD] - Entry content here.

If no date is known, use [unknown] instead.

## Output:
- Wrap the entire export in a single code block for easy copying.
- After the code block, state whether this is the complete set or if more remain.`;

// ---------------------------------------------------------------------------
// Selector helper
// ---------------------------------------------------------------------------
export function getMemoryPrompt(workOnly: boolean, redactPII: boolean): string {
  if (workOnly && redactPII) return WORK_ONLY_REDACT_PII_MEMORY_PROMPT;
  if (workOnly) return WORK_ONLY_MEMORY_PROMPT;
  if (redactPII) return REDACT_PII_MEMORY_PROMPT;
  return BASE_MEMORY_PROMPT;
}

// ---------------------------------------------------------------------------
// Providers
// ---------------------------------------------------------------------------
export const MEMORY_PROVIDERS = [
  { key: 'chatgpt' as const, label: 'ChatGPT', url: 'https://chatgpt.com' },
  { key: 'claude' as const, label: 'Claude', url: 'https://claude.ai' },
  { key: 'gemini' as const, label: 'Gemini', url: 'https://gemini.google.com' },
  { key: 'other' as const, label: 'Other', url: undefined },
];

export type MemoryProvider = 'chatgpt' | 'claude' | 'gemini' | 'other';

export interface ImportedMemory {
  provider: MemoryProvider;
  content: string;
  customLabel?: string; // editable display name, used when provider === 'other'
  _id?: string;         // client-only stable React key, not sent to backend
}

/** Returns a unique label for a new 'other' entry given existing entries. */
export function getNextOtherLabel(existing: ImportedMemory[]): string {
  const taken = new Set(
    existing.filter((m) => m.provider === 'other').map((m) => m.customLabel ?? 'Other')
  );
  if (!taken.has('Other')) return 'Other';
  let i = 1;
  while (taken.has(`Other_${i}`)) i++;
  return `Other_${i}`;
}
