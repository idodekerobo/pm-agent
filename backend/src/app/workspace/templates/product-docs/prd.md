<!-- ==========================================
     AGENT INSTRUCTIONS — NOT PART OF THE DOCUMENT
     ========================================== -->

## How to Use This Template

You are writing a Product Requirements Document (PRD) on behalf of a founder, product manager, or engineer at a startup, small (~5-50) or mid-sized (typically under 200 people) company.

Your job is to produce a complete, specific, and decision-ready PRD — not a filled-in template with vague placeholder language.

### Before you start
- Review all available context files: `context/company.md`, `context/user.md`, `context/product.md`
- Use whatever input the user has provided. If input is sparse, make reasonable inferences and flag them with `[ASSUMED]`.
- Do not leave any required section blank. If you genuinely lack the information, write your best hypothesis and mark it `[NEEDS VALIDATION]`.

### Tone and style
- Write in plain, direct language. No corporate jargon.
- Be specific — avoid vague phrases like "improve user experience" without saying how or by how much.
- Default to bullet points over prose. Use tables where the format is provided.
- Aim for clarity over completeness — a sharp 1-pager beats a bloated 5-pager.

### Vocabulary
- **P0**: Must-have for launch. Blocking.
- **P1**: Important, but not launch-blocking.
- **P2**: Nice-to-have. Deprioritize if scope is tight.
- **OKR**: Objective + Key Result. Objective = qualitative goal ("Grow activation"). Key Result = measurable outcome ("Increase D1 retention from 30% to 45%").
- **Epic**: A large unit of work that groups related user stories under a common goal.
- **[ASSUMED]**: You inferred this — it has not been confirmed by the user.
- **[HYPOTHESIZED]**: This is your best guess, not backed by data or research yet.
- **[NEEDS VALIDATION]**: This needs more information before it can be considered reliable.
- **[VERIFY WITH USER]**: You need the user to confirm or provide this — do not guess.

### This is a living document
This template is a starting point, not a one-time artifact. As you work with the user over time, keep it updated:
- **Update the audience** as you learn more about who the user is building for — new research, user feedback, or a shifting focus may change the Target Audience section.
- **Update the document** as you learn more about the company, product, or feature — from conversations, context files, or the user's feedback on prior drafts.
- **Update this template file itself** if the user gives you explicit feedback about format, sections, or style. For example: if they tell you they never want Countermetrics included, or they always want a Timeline — edit this file so future PRDs reflect that automatically.

The goal is a continual learning loop. Each PRD you write should be better calibrated to the user's needs than the last.

### Verification — what to ask after drafting
After generating a draft, ask the user to confirm the following before marking the doc Ready for Review:
- **Review process**: Does this doc need formal review? If so, who are the reviewers and what's the target date?
- **Team fields**: Who should be listed under Team, Design, PM, Eng, etc.?
- **Product details**: Flag any section where you used `[ASSUMED]`, `[HYPOTHESIZED]`, or `[VERIFY WITH USER]` — surface these explicitly so the user can confirm or correct them.
- **Optional sections**: Do they want to add Technical Dependencies, Timeline, Stakeholder List, or a detailed Experiment Plan?

### Optional sections
After generating the document, ask the user if they want to add any of the following sections that were omitted:
- Technical dependencies and constraints
- Timeline and launch target date
- Stakeholder list
- Detailed experiment / A/B test plan

---

### Context Snapshot
*Maintained by the agent. Update this section as you learn more about the user, their company, and their product — from conversations, context files, or feedback on past PRDs. The goal is to accumulate useful context so each PRD you write is better calibrated than the last. Do not leave stale or incorrect values — overwrite them when you learn something new.*

*Last updated: [date]*

**Company**
- Name: [VERIFY WITH USER]
- Stage: [e.g., pre-seed / seed / Series A / growth]
- Industry / domain: [VERIFY WITH USER]
- Current strategic focus: [e.g., "growing activation", "expanding to enterprise", "launching in new markets"]
- Key metrics or goals (if known): [ASSUMED or VERIFY WITH USER]

**Product**
- Name: [VERIFY WITH USER]
- Type: [e.g., B2B SaaS / consumer app / marketplace / developer tool]
- User types: [e.g., "creators and viewers", "buyers and sellers", "admins and end users"]
- Current state: [what exists today, rough scale or traction if known]

**User**
- Name: [VERIFY WITH USER]
- Role: [founder / PM / engineer / other]
- PRD experience: [e.g., "experienced PM", "first-time founder, limited PRD background"]

**Template preferences** *(update based on explicit feedback)*
- Review process: [does this person do formal reviews? with whom?]
- Sections to always include: [none noted yet]
- Sections to always skip: [none noted yet]
- Style notes: [e.g., "prefers 1-pagers", "wants detailed user stories", "skips logging spec"]

<!-- ==========================================
     END AGENT INSTRUCTIONS
     ========================================== -->

# Product Requirements Document

**Team**:
**Design**:
**PM**:
**Eng**:
**TPM** *(if applicable)*:
**DS** *(if applicable)*:
**PMM** *(if applicable)*:

**Status**: Draft \| Ready for Review \| Reviewed
**Date**: MM/DD/YYYY

## TL;DR + Review Questions

List 2-4 bullets summarizing what this doc is, what decision it's driving, and what specific questions reviewers should focus on. Keep each bullet to 1-2 sentences.

- What specific questions (if any) should reviewers focus on?
- What tradeoffs or decisions need to be discussed and validated?

## Product Overview

Write 2-4 sentences describing what this feature or product area is, as if explaining it to someone with no prior context. Then fill in the subsections below.

### Opportunity

Answer in bullet form. A strong Opportunity ties the feature to a specific business context (a launch, a goal, a metric), quantifies current vs. target state where possible, and groups impacts into named themes. Avoid vague claims — every bullet should explain why this matters *now* and what specifically changes if we build it.

Quality bar: If you can't cite at least one specific business context (a goal, an event, or a signal), the opportunity isn't defined well enough yet. Flag the section with `[NEEDS VALIDATION]`.

- Why is this worth building now? What's the cost of not building it?
- What company or team goal does this support? Be specific — name the goal or metric.
- What data, research, or signals back this up? If none, mark as `[ASSUMED]`.

**Example:**
We are launching team collaboration to support our Q3 goal of improving D30 retention (currently 22%, target 35%). Teams that use collaborative features retain at 2.4x the rate of solo users, and 60% of churned users cited "can't work with my team" in exit surveys. Without this, we risk continued churn among our highest-value segment while 3 of our top 4 competitors have shipped team features in the last 6 months.

Impact areas:
- **Retention**: Collaborative users retain significantly better — this is our highest-leverage retention lever this quarter
- **Expansion**: Teams that collaborate invite more members — avg team size grows 1.8x within the first 90 days
- **Competitive positioning**: We are the only tool in our category without a team feature; this is a growing gap

### Target Audience

Answer in bullet form:
- Who specifically is this built for? (e.g., "first-time users who haven't completed onboarding", "power users managing multiple projects")
- What is their current state or context when they encounter this problem?
- Link to any relevant user research, interviews, or competitor analysis if available.

### People Problems

List the prioritized problems this feature solves, from most to least important. Write the problem as the user would describe it — not as an engineer or PM would.

If the product serves multiple user types, write a separate problem statement for each using the `[For X]` label format. If problems are hypothesized rather than validated by research, mark each with `[HYPOTHESIZED]`.

**Format:**
`[For <User Type>]` As a [user type], I [cannot / struggle to] [do X]. This [impact — what it costs them or limits].

**Example (multi-sided product):**
- `[For Creators]` As a creator publishing content on the platform, I have no way to see which parts of my content drive the most engagement, so I'm guessing at what to improve. This limits the quality and growth of my work over time.
- `[For Viewers]` As a viewer, I struggle to discover content that matches my interests beyond what's trending. This makes the experience feel generic and reduces how often I come back.
- `[For the Company]` We need creators to succeed and grow their audience on the platform to justify continued investment in creator tools and retain top content. Without better creator analytics, we risk losing our best creators to platforms that give them more insight.

If the product has only one user type, skip the `[For X]` label and write problems as a flat prioritized list.

## Goals + Success

### Hypotheses

State what you believe will change as a result of this feature and why. Each hypothesis must name a specific metric, a specific amount, and a causal mechanism — not just a direction.

*"By [feature/change], we expect [metric] to [increase/decrease] by [X%] because [mechanism]."*

Quality bar: "We think engagement will improve" is not a hypothesis — it's a hope. If you can't fill in the amount or mechanism, flag it with `[NEEDS VALIDATION]` and note what information is missing. Write 1-3 hypotheses.

**Example:**
- By adding real-time collaborative editing, we expect D30 retention to increase from 22% to 32% (+10pp) because teams have a shared daily reason to return to the product rather than using it as a solo tool.
- By surfacing a team invite prompt at the end of onboarding, we expect invite-to-signup conversion to reach 25% (up from ~0% today) because we are prompting at the moment of highest motivation — right after a user has seen the product's value for the first time.

### Success

List goals in OKR format. Objectives are qualitative; Key Results are measurable and time-bound.

Quality bar: A Key Result must have a baseline, a target, and a timeframe. "Improve engagement" belongs in the Objective column, not the Key Result column. If you don't have a baseline metric, note it as `[ASSUMED]` and use your best estimate — a rough number is better than nothing.

| Objective | Key Result |
| :-- | :-- |
| Improve team retention | Increase D30 retention from 22% → 32% within 60 days of launch |
| Drive team growth through the product | 25% of new signups invite at least one teammate within their first week |
| Establish collaboration as a core use case | 40% of active teams use a collaborative feature at least once per week by end of quarter |

**What bad looks like — avoid this:**

| Objective | Key Result |
| :-- | :-- |
| Improve user experience | Users enjoy the feature more |
| Grow engagement | Increase engagement |

### Non-goals

Call out what this feature explicitly will NOT do. This prevents scope creep. Write 2-5 bullets.

### Countermetrics + Guardrails

List any metrics that could move negatively as a side effect. For each, note the threshold that would trigger a pause or rollback.

Example: *"If session length drops >10% in the first week post-launch, pause rollout."*

## Product Plan

### Use Cases & Priorities

List the top use cases this feature enables. Each row is a specific thing a user can now do that they couldn't before (or couldn't do well). If the feature ships in milestones or phases, add the optional Timeline column.

Quality bar: A good summary is specific enough that an engineer could scope it. Avoid "user can collaborate" — write "user can invite a teammate via email; invitee is dropped directly into the shared project." If there are open scoping questions, embed them inline as `OPEN: [question]`.

**Single launch (no timeline):**

| # | Use Case | Summary | Pri |
| :-- | :-- | :-- | :-- |
| 1 | Invite a teammate | User enters a teammate's email from project settings and sends an invite. Invitee receives a branded email and lands in a pre-filled signup flow scoped to that project. | P0 |
| 2 | Real-time collaborative editing | Two or more users can edit the same document simultaneously. Changes appear live with per-user presence indicators (name + cursor color). OPEN: Do we surface edit history in v1? | P0 |
| 3 | Teammate activity feed | User can see a chronological feed of teammate actions (edits, comments, status changes) within a shared project. | P1 |

**Milestone-based launch (add Timeline column):**

| # | Timeline | Use Case | Summary | Pri |
| :-- | :-- | :-- | :-- | :-- |
| 1 | M1 – April | Invite a teammate | User enters a teammate's email from project settings and sends an invite. Invitee lands in a pre-filled signup flow scoped to the project. | P0 |
| 2 | M2 – June | Real-time collaborative editing | Two or more users edit the same document simultaneously with live presence indicators. OPEN: Do we surface edit history in v1? | P0 |
| 3 | M3 – Q3 | Teammate activity feed | Chronological feed of teammate actions (edits, comments, status changes) within a shared project. | P1 |

## Product Rollout

### Go To Market Summary

Write 2-4 bullets covering:
- Who sees this first and how (e.g., "rolling out to 10% of free users in week 1")
- Any comms, announcements, or coordination needed (e.g., support docs, email, changelog)
- Any dependencies on other teams or systems before launch

### Quality Targets

Write 2-4 bullets defining what "working correctly" looks like in production:
- What should a manual QA pass verify?
- Are there error rates, latency thresholds, or uptime requirements?
- How will you know something is broken after launch?

### Logging Spec

List the specific events or metrics you need to instrument to validate your Goals and Hypotheses above. For each, note what triggers it and what data it captures.

Example: `feature_invite_sent` — fires when user submits invite form; captures `user_id`, `invitee_email`, `project_id`, `timestamp`

## Risks + Mitigations

List the top 3-5 risks in order of severity. For each, include a mitigation.

- **Risk**: [description]
  - **Mitigation**: [what you'll do about it now, or your contingency]

## Detailed Requirements *(skip for 1-pager)*

### User Journey

Write a short narrative (3-6 sentences) of what a user experiences end-to-end once this feature is built. Write in second person ("You open the app and...").

### User Stories

Create epics and user stories. If all stories below are built, a user should be able to complete the User Journey and the team should hit the Success metrics above.

Quality bar: Requirements should describe the full product behavior a user would experience — what they do, what the product does in response, what they see or feel as a result. Use sub-bullets for complex stories. Focus on end-to-end flow, not implementation details. Include edge cases and error states where they matter. Do not include technical decisions like architecture or data models — those belong in an eng spec.

| User Story | Requirement | Pri |
| :-- | :-- | :-- |
| **EPIC 1 — Invite and onboard teammates** | | |
| As a user, I want to invite a teammate so we can work on a project together | - User can open an invite modal from the project settings page<br>- User enters one or more email addresses and optionally sets a role (viewer / editor)<br>- Invitee receives a branded email with a link scoped to that specific project<br>- If the invitee is new, the link drops them into a signup flow with the project pre-loaded — they land inside it immediately after creating an account<br>- If the invitee already has an account, the link takes them directly into the project<br>- Inviting user sees a "pending" status for each invite until accepted | P0 |
| As a user, I want to manage who has access to my project | - User can view all teammates and their roles from project settings<br>- User can change a teammate's role or remove them at any time<br>- Removed teammates lose access immediately; content they created stays | P0 |
| **EPIC 2 — Real-time collaboration** | | |
| As a user, I want to edit a document with my teammate at the same time | - Both users can edit simultaneously without overwriting each other's changes<br>- Each user's cursor and active selection is visible to others in real time, labeled with their name<br>- Changes auto-save continuously — no manual save step<br>- If a user loses connection mid-session, their local changes are preserved and synced when they reconnect<br>- If a conflict cannot be resolved automatically, the user is shown both versions and asked to choose | P0 |

### Design Storyboards

Link to Figma or design artifacts here. If none exist yet, note `[DESIGN PENDING]`.

## Appendix

### Related Research + Projects

Link to user research, experiment results, competitor analysis, or related launches. If none, write `N/A`.

### Other Resources

Add any other relevant links, data sources, or reference material here.
