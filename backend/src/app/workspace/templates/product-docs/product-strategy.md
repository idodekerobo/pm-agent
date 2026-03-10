<!-- ==========================================
     AGENT INSTRUCTIONS — NOT PART OF THE DOCUMENT
     ========================================== -->

## How to Use This Template

You are writing a Product Strategy document on behalf of a founder, product manager, or engineer — typically at a startup or small-to-mid-sized company (under 200 people).

A product strategy answers: **Where is our product going over the next 6-18 months, and why?** It sits above individual PRDs — the strategy drives what PRDs get written.

Your job is to produce a focused, specific, and opinionated strategy — not a filled-in template with vague aspirational language. A strategy that tries to be everything is a strategy that says nothing.

### Before you start
- Review all available context files: `context/company.md`, `context/user.md`, `context/product.md`
- Use whatever input the user has provided. If input is sparse, make reasonable inferences and flag them with `[ASSUMED]`.
- Do not leave any required section blank. If you genuinely lack the information, write your best hypothesis and mark it `[NEEDS VALIDATION]`.

### Tone and style
- Write in plain, direct language. No corporate jargon, no buzzwords.
- Be specific — "grow activation" means nothing without saying how, for whom, and by how much.
- Default to bullet points over prose. Use tables where the format is provided.
- **Keep it lean.** The default output should be 1-3 pages. A tight strategy that forces hard choices is more useful than a comprehensive one that doesn't. Only expand beyond 3 pages if the user's org or product genuinely has the complexity to warrant it (multiple product lines, multi-sided marketplace, platform strategy, etc.) — and even then, be disciplined.

### Narrative framing — how to make strategies land
The best strategies read like a story, not a spreadsheet. When writing, follow this arc:
1. **Ground the reader in the activity** — What are people doing today? Make it concrete and personal.
2. **Show how the world is changing** — What trends, shifts, or events make this moment different?
3. **Name the pain** — What's broken about the current way? Make the reader feel it.
4. **Size the opportunity** — It's not just one person. How many people share this pain?
5. **Show why you can uniquely solve it** — What about your product, team, or position makes you the right one?
6. **Lay out the approach** — Your strategic themes. What you'll do (and won't do).
7. **Define what winning looks like** — Concrete, measurable outcomes.

You don't need to follow this arc rigidly or label these steps — just let the strategy flow like a narrative. The reader should finish thinking "this is obviously the right path" rather than "these are some interesting ideas."

### Scaling structure to fit the team
Not every team needs every section. Use your judgment:

**Early-stage startup (pre-PMF, <10 people):**
- Skip Milestone Plan — they're iterating week-to-week
- Lightweight on Landscape — focus on the 1-2 insights that matter most
- Strategic themes should be 1-2, not 3-4
- Success section can be simpler — a few key bets and the signals you'd look for
- The whole doc might be 1-2 pages

**Growth-stage startup (post-PMF, 20-100 people):**
- Full template is appropriate
- Strategic themes can be 2-3
- Milestone plan becomes important for cross-team coordination

**Larger org (100+ people):**
- May need a more detailed Landscape section
- May need an Option Space section if there's a major strategic fork in the road
- Strategic themes can be 3-4 with sub-themes
- Milestone plan should include dependencies across teams

### Vocabulary
- **Strategic theme / pillar**: A major area of investment. Each theme groups related bets under a common thesis.
- **Thesis**: A belief about what will work and why. A good thesis is falsifiable — you can be wrong about it.
- **Bet**: A specific product or business initiative within a theme. Bigger than a feature, smaller than a theme.
- **PMF**: Product-market fit — when you've built something people want and can grow it.
- **[ASSUMED]**: You inferred this — it has not been confirmed by the user.
- **[HYPOTHESIZED]**: This is your best guess, not backed by data or research yet.
- **[NEEDS VALIDATION]**: This needs more information before it can be considered reliable.
- **[VERIFY WITH USER]**: You need the user to confirm or provide this — do not guess.

### This is a living document
This template is a starting point, not a one-time artifact. As you work with the user over time, keep it updated:
- **Update the strategy** as the company learns — new data, pivots, competitive shifts, or user research may change the direction. A strategy that doesn't evolve with new information is just a guess you got attached to.
- **Update the landscape** as the market moves. Strategies go stale when the world changes and the doc doesn't.
- **Update this template file itself** if the user gives you explicit feedback about format, sections, or style. For example: if they tell you they never want a Milestone Plan, or they always want a Competitive Analysis table — edit this file so future strategies reflect that automatically.

The goal is a continual learning loop. Each strategy you write should be sharper and more calibrated than the last.

### Verification — what to ask after drafting
After generating a draft, ask the user to confirm:
- **Assumptions**: Flag any section where you used `[ASSUMED]`, `[HYPOTHESIZED]`, or `[VERIFY WITH USER]` — surface these explicitly.
- **Strategic themes**: Are these the right bets? Is the prioritization right? Is anything missing that keeps them up at night?
- **Non-goals**: Do these feel right? Are there tradeoffs they're not comfortable making?
- **Optional sections**: Do they want to add an Option Space analysis, a more detailed Milestone Plan, or a Competitive Landscape table?

### Optional sections
After generating the document, ask the user if they want to add any of the following:
- Option Space analysis (evaluating multiple strategic paths with criteria — useful for major fork-in-the-road decisions)
- Competitive landscape table
- Detailed milestone / execution plan with dependencies
- Resource allocation view

---

### Context Snapshot
*Maintained by the agent. Update this section as you learn more about the user, their company, and their product — from conversations, context files, or feedback on past documents. The goal is to accumulate useful context so each document you write is better calibrated than the last. Do not leave stale or incorrect values — overwrite them when you learn something new.*

*Last updated: [date]*

**Company**
- Name: [VERIFY WITH USER]
- Stage: [e.g., pre-seed / seed / Series A / growth]
- Industry / domain: [VERIFY WITH USER]
- Team size: [VERIFY WITH USER]
- Current strategic focus: [e.g., "finding PMF", "scaling acquisition", "expanding to new segments"]
- Key metrics or goals (if known): [ASSUMED or VERIFY WITH USER]

**Product**
- Name: [VERIFY WITH USER]
- Type: [e.g., B2B SaaS / consumer app / marketplace / developer tool]
- Current state: [what exists today, rough scale or traction if known]
- PMF status: [pre-PMF / early PMF / strong PMF]

**User**
- Name: [VERIFY WITH USER]
- Role: [founder / PM / engineer / other]
- Strategy experience: [e.g., "experienced PM", "first-time founder", "technical co-founder"]

**Template preferences** *(update based on explicit feedback)*
- Sections to always include: [none noted yet]
- Sections to always skip: [none noted yet]
- Style notes: [e.g., "prefers very lean docs", "wants competitive analysis every time"]

<!-- ==========================================
     END AGENT INSTRUCTIONS
     ========================================== -->

# <Product / Area Name> Strategy

**Author**:
**Status**: Draft \| Ready for Review \| Active
**Date**: MM/DD/YYYY
**Time horizon**: [e.g., "Next 6 months", "Q3-Q4 2026", "2026-2027"]

## TL;DR

Summarize the strategy in 3-5 bullets. A reader should walk away understanding: (1) where we are today, (2) what we believe, and (3) what we're going to do about it. Keep each bullet to 1-2 sentences.

**Example:**
- We've found early PMF with solo creators but retention drops sharply when users try to collaborate — D30 is 22% for solo users vs. 45% for teams. Our biggest growth lever is making collaboration work.
- We believe the market is shifting toward team-based creative tools, and our unique position (real-time editing + built-in publishing) gives us an advantage competitors can't easily replicate.
- Over the next 6 months, we're making two big bets: (1) rebuild the collaboration experience to support real-time team workflows, and (2) launch a team pricing tier to capture expansion revenue.
- We are NOT investing in mobile or new user acquisition this half — we're doubling down on retention and expansion within our existing base.

## Context

Write 3-6 sentences setting up the current state. Answer: Where are we today? What have we learned recently? What has changed (internally or externally) that makes this the right time to set or revisit strategy?

Quality bar: This section should give someone with no context enough background to follow the rest of the document. If understanding your strategy depends on knowing what happened before — set that context here.

**Example:**
We launched our collaborative editor 9 months ago. Since then, we've grown to 2,400 MAU with strong week-over-week growth in signups. However, retention is a problem — D30 is 22% overall and even lower for users who sign up solo. Over the last quarter, we ran 12 user interviews and found a consistent pattern: users love the editor but struggle to get their team on board. Meanwhile, three competitors have shipped team features in the last 6 months, and our sales pipeline shows 60% of lost deals cite "no team support" as the reason. We need to decide how to invest our next two engineering cycles.

## Landscape

Describe the 2-4 most important things happening in your market or domain that shape this strategy. Focus on changes — what's different now vs. 6-12 months ago? These should be trends, shifts, or signals that directly inform your strategic choices. Skip this section if the landscape hasn't materially changed since the last strategy.

Write each as a bold heading with 2-3 sentences of explanation.

Quality bar: Every landscape point should connect to a strategic theme below. If a trend doesn't change what you'd build, it doesn't belong here. Don't list trends for the sake of completeness — only include the ones that matter for your decisions.

**Example:**
- **Team-based workflows are becoming table stakes.** 3 of our top 4 competitors shipped collaboration features in the last 6 months. In our sales pipeline, "team support" went from the #5 to the #1 requested feature.
- **AI-assisted content creation is lowering the bar for individual output.** When individuals can produce more, the bottleneck shifts from creation to coordination. This makes team workflows even more important — the value moves from "help me make something" to "help us make something together."

## Mission + Vision

**Mission**: One sentence describing what your product exists to do. This should be stable — it doesn't change every quarter.

**Vision**: 2-3 sentences describing the future state you're building toward. This is your north star for the next 1-3 years.

Quality bar: The mission should be specific enough that it implies what you'd say no to. "Help people be more productive" is too broad — "Help small creative teams produce and publish content together" is better. If your mission could belong to any company in your space, it's not specific enough.

## Strategic Themes

These are the 1-3 major areas of investment for this strategy period. Each theme represents a thesis about what will move the business forward and a set of bets you're making.

For each theme:

### Theme 1: <Name>

**Thesis**: State what you believe will work and why. A good thesis names the audience, the problem, and the mechanism by which your bet creates value.

**Key bets**:
- Bet 1: [specific initiative — what you'll build or change]
- Bet 2: [specific initiative]

**We'll know it's working when**: [1-2 leading indicators you'd check within weeks/months, not just lagging outcomes]

Quality bar: Each theme should have a clear thesis that's falsifiable — meaning you could be wrong about it, and you'd know. "Improve the product" is not a thesis. "Collaborative features will drive retention because teams have a shared daily reason to return" is a thesis — and if D30 doesn't move after shipping, you know the thesis was wrong.

**Example:**

### Theme 1: Make collaboration the core loop

**Thesis**: Users who collaborate retain at 2.4x the rate of solo users, but only 15% of signups ever invite a teammate. We believe the problem isn't demand for collaboration — it's friction in the invite and onboarding flow. If we reduce the steps from signup-to-first-collaboration from 7 to 2, we'll see invite rates double and D30 improve by 10+ points.

**Key bets**:
- Rebuild the invite flow: one-click invite from the editor, invitee lands directly in the shared project (no separate onboarding)
- Add real-time presence indicators so collaboration feels alive even before real-time editing ships
- Launch a "team workspace" concept that gives teams a shared home for projects

**We'll know it's working when**: Invite-to-signup conversion reaches 25% (up from ~8% today) and D7 for team users exceeds 60%.

### Theme 2: <Name>

*[Repeat the same structure]*

### Theme 3: <Name> *(if needed)*

*[Repeat the same structure]*

## What Success Looks Like

Define the measurable outcomes you expect if this strategy works. Use whatever goal format fits your team — OKRs, KPIs, or simple metric targets. The important thing is that each goal has a baseline, a target, and a timeframe.

Quality bar: If you can't name a current number (even an estimate), you don't have a real goal — you have a wish. Flag unknown baselines with `[ASSUMED]` and your best estimate.

| Goal | Current | Target | Timeframe |
| :-- | :-- | :-- | :-- |
| D30 retention (all users) | 22% | 35% | 6 months post-launch |
| % of signups who invite a teammate in week 1 | 8% | 25% | 3 months post-launch |
| Team accounts as % of total active accounts | 12% | 30% | End of year |

## Non-goals

Call out what this strategy explicitly will NOT pursue. Every non-goal should imply a real tradeoff — if nobody would disagree with it, it doesn't belong here. Write 2-5 bullets.

Quality bar: A good non-goal makes at least one stakeholder uncomfortable. "We won't build a bad product" is not a non-goal. "We won't invest in new user acquisition this half" is — because someone will push back on it.

**Example:**
- We are not investing in mobile this half — web only. 30% of our traffic is mobile, but team workflows are desktop-first and we'd rather nail one platform than ship a mediocre experience on two.
- We are not pursuing enterprise sales or SSO. Our ICP right now is teams of 3-10 on self-serve plans. Enterprise adds sales cycles and compliance requirements we're not ready for.
- We are not trying to grow top-of-funnel signups. Our acquisition is healthy — the problem is retention, and that's where we're putting all our chips.

## Assumptions + Risks

List the 3-5 most important assumptions this strategy depends on, and the risks that could derail it. For each, note how you'd validate the assumption or mitigate the risk.

Quality bar: A strategy with no stated assumptions is a strategy that hasn't been stress-tested. Every strategy is a bet — name what you're betting on so you know when to pivot.

| # | Assumption or Risk | Type | How we'll validate or mitigate |
| :-- | :-- | :-- | :-- |
| 1 | Users who collaborate retain better because of the collaboration, not because they were already more engaged | Assumption | Run a cohort analysis comparing users who were invited vs. self-selected into teams. If invited users retain at similar rates, the thesis holds. |
| 2 | Real-time editing is not a prerequisite for team adoption — presence + async is enough for v1 | Assumption | User interviews + monitor whether team engagement drops off after initial invite flow excitement |
| 3 | A competitor ships a free team tier before we launch, pulling our target segment | Risk | Accelerate M1 launch by 2 weeks. If a competitor ships first, run a rapid competitive teardown and adjust positioning. |

## Milestone Plan *(optional — include for growth-stage+ teams)*

If this strategy plays out over multiple phases, outline the key milestones and their sequencing. Keep it high-level — this is not a roadmap.

| Phase | Timeframe | Focus | Key deliverable | Success signal |
| :-- | :-- | :-- | :-- | :-- |
| M1 | Month 1-2 | Invite flow + team workspace | One-click invite, shared project home | Invite-to-signup > 20% |
| M2 | Month 3-4 | Real-time presence + activity feed | See teammates' cursors and actions | D7 for team users > 55% |
| M3 | Month 5-6 | Team pricing + expansion | Team plan with per-seat billing | 10% of active accounts on team plan |

## Appendix

### Related Research + Context

Link to user research, experiment results, competitor analysis, or related documents. If none, write `N/A`.

### Open Questions

List any unresolved questions that could change the strategy. For each, note who owns the answer and when you expect to have it.
