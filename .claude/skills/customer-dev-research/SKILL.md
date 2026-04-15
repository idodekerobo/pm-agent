---
name: customer-dev-research
description: Prep for customer development calls, evaluate outreach messages, read call transcripts, or update the research tracker.
---

# Skill: customer-dev-research

Use this skill to prep for a customer development call, evaluate outreach messages, read a call transcript, or update the research tracker.

The full process lives at*: `research/RESEARCH_PROCESS.md`
The tracker lives at*: `research/customer-development.md`
Interview notes and transcripts live at*: `research/interview-notes-transcripts/{YYYYMMDD_<name>}/notes_and_transcript.md`
Screen Captures from the conversation (if any) live at this directory*:`research/interview-notes-transcripts/{YYYYMMDD_<name>}/screen_captures/`

*note that these file paths are relative to the root of this project's directory

## When to invoke

- User has an upcoming research call → prep tracker pre-call entry + Granola-ready notes file
- User shares a transcript or notes → read it, surface takeaways against hypotheses, update tracker
- User is drafting an outreach message → evaluate for open-endedness, suggest reframes
- User asks about research patterns across calls → read tracker, summarize signals by hypothesis

## Two-file output structure

Every call produces two artifacts. Keep them strictly separated:

**`research/customer-development.md` (the tracker)** — analysis and evaluation only:
- Pre-call: segment, hypotheses being tested (with testability levels), key dynamic, listen-fors per question
- Post-call: high-level notes, surprises, hypothesis update table (Hypothesis | Signal columns)
- No questions, no threads, no background narrative
Be sure to append to the new section to the bottom of the file so entries are in chronological order.

**`research/interview-notes-transcripts/{YYYYMMDD_<name>}/notes_and_transcript.md` (the notes file)** — questions and transcript only:
- Stack-ranked questions with inline annotations (← reason)
- "If extra time" section
- "Threads to pull" section with pre-loaded context from prior conversations
- Post-call: raw notes (exact quotes) and surprises
- No analysis, no segment classification, no hypothesis mapping — that lives in the tracker

The notes file gets copied into Granola to guide the call in real time. Keep it clean.

## How to run

### Pre-call prep

1. Read `research/customer-development.md` — current hypotheses, segment definitions, prior signals, vocabulary bank
2. Read `research/RESEARCH_PROCESS.md` — evaluation criteria and process rules
3. **Gather background materials on the person.** Before doing anything else, check what has been provided and explicitly ask for anything missing:

   **Materials to request if not provided:**
   - LinkedIn profile (PDF export or URL) — role history, company context, career trajectory
   - Resume (if available) — fills gaps LinkedIn doesn't show
   - Any prior conversation: Slack DMs, Twitter/X threads, email threads, community posts — these become "threads to pull"
   - Newsletter or writing — their own words reveal how they think and what they care about
   - Company website or product page — understand what they're building or working on

   **If none of these are provided:** ask the user directly before proceeding. A name alone is not enough to generate tailored questions. Minimum viable input is LinkedIn + any prior conversation.

4. Map to hypotheses: which are HIGH/MEDIUM/LOW testability with this person? Which are NOT testable? Flag upfront.
5. Generate tailored questions (see RESEARCH_PROCESS.md for criteria):
   - Start from the Interview Template in the tracker; reframe using their specific context
   - For warm calls: skip baseline questions, go straight to threads they've already shown energy on
   - Always include the referral question last: "Is there anyone else you think I should talk to?"
   - Generate a "listen for" note per question — what good signal sounds like, what to probe if they go shallow
6. Write the **tracker pre-call entry** (segment, hypotheses + testability, key dynamic, listen-fors)
7. Write the **notes file** in Granola-ready format (questions with inline annotations, if-extra-time, threads to pull)
8. Create the interview directory: `research/interview-notes-transcripts/{YYYYMMDD_<name>}/`

### Post-call

1. Fill in notes and surprises in the notes file (exact quotes, their language)
2. Update the tracker: high-level notes, surprises, hypothesis update table
3. Update vocabulary bank, segments table, open questions as needed
4. Update hypothesis status in the main table only if threshold is met (see RESEARCH_PROCESS.md)

## Core principles (from [A Smart Bear: Customer Development](https://longform.asmartbear.com/customer-development/))

- Goal is invalidation, not validation
- If you're talking, you're not learning — minimize speaking
- Redirect market generalizations back to personal experience
- The most exciting signal is a surprise, not a confirmation
- Stop when new information stops appearing across calls
- One call is never enough to confirm or invalidate a hypothesis
