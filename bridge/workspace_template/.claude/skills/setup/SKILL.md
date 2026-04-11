---
name: setup
description: >
  PM brain initialization. Runs a short conversational interview to derive
  product context, then writes structured files to the workspace so every
  future session starts grounded. Run once at onboarding, or anytime to
  refresh context after a significant shift.
---

# /setup — PM Brain Initialization

You are loading the PM brain with context about what the user is building, who they're building it for, and how they work. This interview takes about 3–5 minutes.

The goal is **derived context, not transcribed answers** — synthesize what the user says into structured knowledge, don't just copy their words.

---

## Before starting

Check whether context already exists:

```bash
python3 -c "
import os
from pathlib import Path
ws = os.environ.get('DRAFT_WORKSPACE', os.path.expanduser('~/.draft/workspace'))
files = list(Path(ws, 'context').glob('*/index.md'))
has_content = any(
    '---' in Path(f).read_text() and 'No information recorded yet' not in Path(f).read_text()
    for f in files
)
print('has_content' if has_content else 'empty')
" 2>/dev/null || echo "empty"
```

- **If `empty`**: run the full interview below from Q1
- **If `has_content`**: run the re-run flow instead (see end of this file)

---

## The interview

Ask questions **one at a time**. Wait for the full answer before asking the next. Adapt each question to what you've already heard — skip or merge questions if the user already answered them.

If the user says **"skip"** at any point, stop the interview immediately and say: "No problem — run `/setup` anytime you're ready to load your PM brain."

---

### Q1 — What you're building

Ask:
> "What are you building, and who's it for? Give me the one-liner."

Listen for: product name, problem being solved, target customer, stage (pre-launch / early users / scaling / growth).

If the answer is vague on the customer, probe once:
> "Who specifically — a job title, a type of company, a situation they're in?"

---

### Q2 — Distribution and traction

Ask, adapted to stage:
- **Pre-launch:** "Who are you building with right now — any design partners or early testers?"
- **Post-launch:** "How do users find you today, and how many do you have?"

Listen for: acquisition channel (word of mouth, content, outbound, product-led), number of users or customers, whether they're paying, how the user thinks about growth right now.

Skip this question if they already answered it in Q1.

---

### Q3 — Team

Ask:
> "What does your team look like?"

Listen for: team size, who does what (eng, design, PM, founders), whether they're solo. One follow-up max if the answer is thin. Keep this short.

---

### Q4 — Current focus

Ask:
> "What's the most important thing you're working on right now?"

Listen for: specific milestone or sprint goal, the bet they're making, blockers, what success looks like this week or month.

If vague, probe once:
> "What would make this week a win?"

---

### Q5 — How you work

Ask:
> "What tools do you use day-to-day, and what does a typical week look like?"

Listen for: project management (Linear, Jira, Notion), communication (Slack, email), planning cadence (sprints, async, ad hoc), how decisions get made. This shapes how Draft formats artifacts and interacts with integrations.

---

### Q6 — Hardest problem

Ask:
> "What's the hardest PM problem you're dealing with right now?"

This is the most important question. Let them answer fully — don't rush or redirect. Listen for the actual underlying tension: prioritization pressure, alignment friction, user understanding gaps, build vs. buy decisions, scope creep, etc.

---

## After the interview

Once all answers are in (or the user says they're done), do the following in order:

### 1. Synthesize

Do not pass raw answers to @draft-learner. Before writing, derive:

- **company:** name, what they do, business model (B2B/B2C/marketplace/etc.), stage, funding if mentioned
- **product:** product name, problem it solves, target user (specific, not vague), how users find it today, key bets or hypotheses the team is making
- **user:** their role, team context, working style, communication preferences, tools they use
- **team:** size, structure, who does what, capacity constraints if mentioned
- **priorities:** current milestone or sprint goal, the single most important thing, open questions or blockers, what success looks like this period
- **memory/vocabulary:** any domain-specific terms they used (their word for "users", "tickets", "sprints", etc.), working preferences that came through, goals they named

### 2. Call @draft-learner

Pass the synthesized content as a single, structured message. Instruct @draft-learner to write:

- `context/company/index.md`
- `context/product/index.md`
- `context/user/index.md`
- `context/team/index.md`
- `context/priorities/index.md`
- `memory/memory.md`

Each index file must have complete frontmatter:
- `name`: dimension name
- `description`: 2–10 sentences, specific and factual (this gets loaded as session context — make it count)
- `last_updated`: today's date (YYYY-MM-DD)
- `source: /setup interview`

For `priorities/index.md`, also include the full body content — this file is loaded in full each session, not just its description.

Do NOT write log entries during /setup — this is the initial state, there is no prior state to log against.

### 3. Confirm

After @draft-learner writes the files, confirm to the user:

- Which files were written (paths)
- One-line summary of what's in each
- Invite corrections: "Does that capture it right? Say 'update [company/product/team/priorities/user]' to fix anything."

### 4. Ask the first real question

End with one sharp, specific question grounded in what you just learned. Make it feel like starting real work together, not closing a form. Base it on the hardest problem they named in Q6, or the most interesting tension you noticed.

---

## Re-run flow

If context files already have content, start with:

> "Your PM brain already has context. Here's what I have:
> [show one-line description per dimension — read from frontmatter]
>
> Want to do a full refresh, or just tell me what's changed?"

- **Full refresh**: run the interview from Q1, overwrite all context files
- **What's changed**: ask "Walk me through what's different since we last synced." Then call @draft-learner to update only the relevant dimensions and write log entries for any changes to `product/` or `priorities/`.

---

## Rules

- One question at a time — never ask two questions in the same message
- No preamble before questions ("Great answer!" / "Thanks for sharing" = never)
- Adapt — skip questions already answered, merge where natural
- Synthesize before writing — derived context beats transcribed answers
- The description field in frontmatter is loaded every session — write it like a briefing note, not a data dump
