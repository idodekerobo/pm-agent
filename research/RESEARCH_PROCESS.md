# Customer Development Research Process

Framework based on [A Smart Bear: Customer Development](https://longform.asmartbear.com/customer-development/)

**Core rule:** The goal is *invalidation*, not validation. Treat every surprise as the most important data point. If you're confirming what you already believe, you're doing it wrong.

---

## Two-File Output Structure

Every call produces two artifacts. Keep them strictly separated — never put analysis in the notes file, never put questions in the tracker.

### `research/customer-development.md` — the tracker (analysis and evaluation)

The tracker is the analytical home. It holds:
- **Pre-call:** segment classification, hypotheses being tested (with testability levels), key dynamic, listen-fors per question
- **Post-call:** high-level notes summary, surprises, hypothesis update table (`Hypothesis | Signal`)
- Nothing else. No questions, no background narrative, no full transcripts.

### `research/interview-notes-transcripts/{YYYYMMDD_<name>}/notes_and_transcript.md` — the notes file (questions and transcript)

This file goes into Granola to guide the call in real time. It must stay clean and copy-paste ready:
- **Pre-call section** (`# Pre-meeting notes/questions`): stack-ranked questions with inline annotations (← reason), "If extra time" section, "Threads to pull" section
- **Post-call section** (`# Meeting Notes`): raw notes with exact quotes, surprises
- Nothing else. No segment analysis, no hypothesis mapping, no background on the person — that lives in the tracker.

**Format rule for questions:** use italics and ← annotations, like the example below. This is what gets loaded into Granola.

```
**Key questions** _(prioritized — get through 1–3 at minimum, 4–5 if time allows)_

1. _"Walk me through what your product workflow looked like last week — what did you actually spend your time on?"_ ← open entry point; let them set the frame
2. _"Where did AI show up in that, if at all?"_ ← don't lead; wait for them to name it or not
...

**If extra time**

6. _"Is there anyone else you think I should talk to — someone with a strong take on this, positive or negative?"_ ← always ask last
```

---

## Pre-Call Prep

### 1. Gather and read background materials on the person

**Before doing anything else, check what materials have been provided. If any of the following are missing, ask the user for them before proceeding. A name alone is not enough to generate tailored questions.**

| Material | What to extract | Ask for it if... |
|---|---|---|
| LinkedIn profile (PDF export preferred) | Role history, company context, career trajectory, how they describe themselves | Always — this is the minimum |
| Resume | Fills gaps LinkedIn doesn't show (internal roles, project detail, technical depth) | LinkedIn is sparse or role history is ambiguous |
| Prior conversation (Slack, DM, email, community post) | Exact language they've used, energy they've already shown, pain they've already named — these become "Threads to pull" | Always for warm calls |
| Newsletter or writing | Their own framing of the problem space, what they care about, how they think | If they publish — high signal for question tailoring |
| Company website or product page | What they're building, who they're building for, their stage | Company is unfamiliar or context is unclear |
| Twitter/X or other public posts | Real-time opinions, things they've shared recently | If they're publicly active |

**Minimum viable input:** LinkedIn + any prior conversation. Without both, questions will be generic — push for more before starting.

From the materials, extract:
- Segment classification (which row in the segments table?)
- How AI-forward they are — power user, experimenter, skeptic?
- What they've built or shipped that's relevant to the hypotheses
- Anything they've said that gives you a thread to pull — exact quotes, specific framing, energy they've already shown
- Flag if they're a non-standard segment (consultant, wrong-segment, etc.) — changes how you use their data

### 2. Map to hypotheses with testability levels
- For each hypothesis, rate testability with this specific person: HIGH / MEDIUM / LOW / NOT TESTABLE
- HIGH: they've directly experienced the problem or built something in this space; their answer will be strong signal
- MEDIUM: adjacent experience; useful but indirect
- LOW: they have a view but it's secondhand or cross-segment
- NOT TESTABLE: flag explicitly and don't waste time on it during the call
- Pick 2–3 to prioritize. You can't test all of them in 30 minutes.

### 3. Generate tailored questions

Start from the `## Interview Template` section in `research/customer-development.md`. Reframe each question using the person's specific context before the call — never read them verbatim.

**Pre-question checklist — run this before writing a single question:**

1. **Check hypothesis status first.** Read `## Hypotheses Table` in `research/customer-development.md`. List only the hypotheses with status `Untested` or `Partially Confirmed` — these are the only ones worth directly probing. For `Confirmed` hypotheses: one tight confirmation question max; don't build exploratory questions around them.
2. **Write the baseline question before routing.** Q2 is always a tool-stack establishment question: *"What AI tools are you actually using for your PM work — not the product you're building, but how you do the job itself?"* This is a routing gate, not a hypothesis probe. Write it before any hypothesis-specific question — the answer determines which branch of the routing table applies for everything that follows.
3. **Map every remaining question to an open hypothesis or open question.** For each question slot, name the hypothesis it tests and any condition on when to ask it (e.g., "if AI-active → H4 probe; if AI-light → H2/H10 probe"). Also check `## Open Questions (tracker)` for any 🔴 unanswered questions this person could address. If a question doesn't map to either, move it to "If extra time."

**Question routing by profile — which questions to prioritize:**

| Profile | Lead with | Deprioritize | Notes |
|---|---|---|---|
| Product-primary Claude Code user (primary ICP) | Q2 (session start ritual), Q3 (re-entry), Q5 (drift/pivot), Q7 (sharing) | Q1 follow-up (they're already on Claude Code — skip the discovery layer) | This is the core ICP. Prioritize open questions: H10, H11, UC1 proof (Q8) |
| Technical solo founder | Q1 (full workflow), Q3 (re-entry), Q5 (drift), Q9 (time sinks) | Q7 (sharing — they're solo, adapt to hiring hypothetical) | High pain across all JTBDs. Drift is likely the sharpest surface. |
| Product-primary, not yet on Claude Code | Q1 (workflow), Q4 (where decisions live), Q6 (normalized pain) | Q2, Q3, Q5, Q7 (don't assume Claude Code usage — establish baseline first) | Don't pitch Claude Code. Understand their current system and what breaks. |
| Warm call (prior conversation exists) | Go directly to threads they've already shown energy on — use "Threads to pull" section | Q1, Q2 (skip baseline — they've already established context) | Prior language is gold. Mirror it back and probe deeper. |
| AI consultant / fractional PM | Q4 (where decisions live across clients), Q7 (sharing across engagements) | H3 probes (they're already AI-forward) | Treat as a window into their clients' pain, not their own |
| Wrong segment / edge case | Don't restructure — run a shorter version and close with the referral question | Everything that depends on them being in-segment | Still capture vocabulary, referrals, and open questions |

**Call length prioritization:**
- **30-minute call:** Q2, Q3, Q6, Q10 minimum. Q5 if the conversation is flowing. Stop before Q8 unless they've fully described their workflow.
- **60-minute call:** Full set. Leave room for screen shares or demos if they offer. Q8 is most valuable in a longer session.

Always include Q10 (referral question). Ask it early if time is running short — don't let it get cut off.

Evaluate every question against the criteria in the Question Evaluation Criteria section before adding it to your pre-call list.

### 4. Generate "listen for" notes per question
For each question, write one or two lines on:
- What good signal sounds like (specific, unprompted, concrete)
- What to probe if they go shallow or generic

These go in the tracker pre-call entry (not the notes file). They're your in-flight reference if the call goes off-script.

### 5. Prioritize for time
- 30-min call: get through 3 questions at minimum, 5 if the conversation flows
- 60-min call: 5–7 questions, leave room for screen shares or demos if relevant
- Order by importance: most critical untested hypothesis first
- Keep an "if extra time" section — don't delete questions, deprioritize them

---

## Question Evaluation Criteria

Before adding any question to your pre-call list, check it against these:

**Is it open-ended?**
- Bad: "Do you find it hard to keep context in Claude?" (yes/no, leads them)
- Good: "When you use Claude for work, where does it fall short for you?"

**Does it lead the witness?**
- Bad: "Don't you think it's annoying to re-enter context every time?" (tells them the pain)
- Good: "Walk me through how you actually start a Claude session for work."
- Test: if the question contains your hypothesis, rewrite it

**Does it invite specific answers?**
- Bad: "How do you use AI?" (too broad)
- Good: "Walk me through the last time you used AI for a real work task — what did that look like?"
- Specific → concrete → actionable signal

**Does it avoid market generalizations?**
- Per the Smart Bear framework: when an interviewee says "most PMs don't use AI seriously," redirect
- "What about you specifically — what did that look like in your day-to-day?"
- You're interviewing them, not their mental model of the market

**Would you learn something if they said the opposite?**
- Good hypothesis tests are falsifiable. If the answer couldn't possibly surprise you, the question is too leading.

---

## What NOT to Do During a Call

- Don't describe your product or hypothesis before they've answered. If they ask what you're building, give one sentence and redirect.
- Don't lead with your pain framing. "Isn't it annoying to re-enter context?" tells them the answer — let them surface it.
- Don't treat a market generalization as signal. When they say "most PMs don't do X," redirect: "What about you specifically?"
- Don't rush to the next question. If they show energy on something unexpected, stay there — that's the data.
- Don't treat a non-standard segment interviewee (consultant, agency owner, enterprise PM) as in-segment signal. Note separately.

---

## Outreach Message Framework (Slack/DM)

For cold or warm async outreach — when you can't book a call yet or want to test a hypothesis quickly.

**Structure:**
1. One-line intro (who you are, connection if any)
2. One-line personalization (something specific to them — role transition, company, something they've written)
3. One open-ended question — no more
4. Explicit low-commitment close ("happy to just chat here")

**The question:**
- Test ONE hypothesis per message
- Most effective for H4: "When you use Claude for work, where does it fall short?"
- Avoid: two questions, leading questions, describing your product before asking
- If they engage: follow up with one more question to go deeper or test H3

**Example:**
> Hey [name] — I'm Idode, founder based in Mexico City, previously PM at Meta.
>
> I noticed [specific thing about them]. I'm building something for PMs and wanted to learn from people in the trenches.
>
> One question if you have 2 mins: when you use Claude or ChatGPT for product work, where does it fall short for you?
>
> Happy to just chat here — no need to book anything unless you'd prefer that.

---

## During the Call

- **Minimize your speaking.** Per Smart Bear: "If you're talking, you're not learning." Speak only to clarify, dig deeper, or redirect.
- **Redirect market generalizations.** When they say "most PMs do X," ask: "What about you specifically?"
- **Follow energy.** If they light up on something, stay there. Don't rush to the next question.
- **Capture exact language.** Write down their words verbatim in real time. This becomes your positioning and copy — not your paraphrase of it.
- **Note surprises immediately.** The most important signal is what you didn't expect. Flag it during the call, not after.

---

## Post-Call: Filling the Tracker

After every call, update `research/customer-development.md` in this order:

1. **High-level notes** — bullet points, exact quotes where possible. Their language, not yours. Link to the notes file for the full transcript.
2. **Surprises** — anything that didn't match your hypotheses. This is the most important section.
3. **Hypothesis updates table** — `Hypothesis | Signal` columns. Signals only — one call is not enough to confirm or invalidate. Use: `"Partial signal —"`, `"Strong signal —"`, `"No signal —"`, `"Contradicts hypothesis —"`
4. **Vocabulary bank** — add any language they used that's vivid, specific, or different from yours
5. **Segments table** — update # interviewed, add any distinct needs that emerged
6. **Open questions** — anything the call surfaced that you don't have a hypothesis about yet
7. **Patterns table** — only update once you have 3+ calls and the same thing appears unprompted across multiple people

**When to update hypothesis status (the main table):**
- 🔵 Untested → ⚠️ Partially confirmed: 2+ in-segment calls with consistent signal, but not yet definitive
- ⚠️ → ✅ Confirmed: pattern has stabilized, new interviews stop adding new information
- Any status → ❌ Invalidated: strong contradicting evidence from in-segment interviewees
- Do NOT update status based on one call, wrong-segment calls, or calls where you asked a leading question

---

## Screening: Who to Talk To

Before booking a call, confirm the person fits your target segment:

**In scope:**
- PM or product decision-maker at a startup, scale-up, or small business (<200 employees, software product)
- Non-technical founder doing PM work solo (pre or post product)
- Technical PM-builder who codes and owns product

**Out of scope:**
- Agency owners managing client deliverables (Daniella pattern)
- PMs at large enterprises with established tooling and IT restrictions
- People who have never used AI for work at all

**Edge cases — note separately, don't discard:**
- AI consultants / fractional PMs who have solved the problem and are deploying it with clients (Ana pattern) — window into many companies' pain, potential partner/competitive signal; their clients are the real target segment
- Wrong-segment interviewees can still produce vocabulary, referrals, and open questions — just don't use their answers as hypothesis signal

**Quick screen question (async):** "Are you currently making product decisions at a software company, or building your own product?"

---

## What Good Signal Looks Like

Per Smart Bear: stop interviewing when new information stops appearing. Until then:

| Signal type | What it means |
|-------------|---------------|
| Unprompted pain | They describe the problem without you naming it — strongest signal |
| Specific example | They give a concrete story, not a general claim |
| Repeated across calls | Same language or pain shows up from different people independently |
| Behavioral evidence | They built a workaround (Justin's 3-layer setup, Daniella's TINTYPE, Ana's custom infrastructure) |
| Surprise | Something you didn't expect — treat this as the most important data |

| Weak signal | What it means |
|-------------|---------------|
| "Yeah, that sounds right" | Agreeing with your framing — you led them |
| "Most people probably..." | Market generalization, not personal experience |
| Wrong segment | Discard for hypothesis purposes, note separately |
| One call only | Not a pattern yet |
