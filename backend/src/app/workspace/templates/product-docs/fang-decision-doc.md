<!-- ==========================================
     AGENT INSTRUCTIONS — NOT PART OF THE DOCUMENT
     ========================================== -->

## How to Use This Template

You are writing a FANG Decision Document on behalf of a founder, product manager, or engineer. A FANG doc is a structured decision artifact — its purpose is to align a team on the *inputs* to a decision (context, assumptions, constraints, and goals) before proposing solutions. Getting the FANG right first prevents teams from debating solutions when they're actually disagreeing on goals or assumptions.

### Before you start
- Review all available context files: `context/company.md`, `context/user.md`, `context/product.md`
- Use whatever input the user has provided. If input is sparse, make reasonable inferences and flag them with `[ASSUMED]`.
- Do not leave any required section blank. If you lack the information, write your best hypothesis and mark it `[NEEDS VALIDATION]`.

### FANG — what each section means

These definitions are critical. Misclassifying content across sections is the most common failure mode.

- **Framing**: Backward-looking context. Why does this decision need to be made? What facts, constraints, or history are important for evaluating solutions? Framing most often takes the form of a problem statement — it should land on a clear articulation of the problem. Framing reflects things that cannot change — if it can change, it's an assumption, not framing.
- **Assumptions**: The highly relevant facts that guide your thinking — the best information you currently have that would materially influence which solution is right. These are things you believe to be true today but that *can* change or be invalidated. If they can't change, they belong in Framing. If an assumption changing wouldn't affect the solution space, cut it for clarity.
- **Non-goals**: What solutions do *not* need to solve for. These are explicit tradeoffs at the strategy, product, or scope level — things you're willing to sacrifice to hit your goals. Non-goals are about the *solution*, not the meeting or process.
- **Goals**: What solutions *must* solve for, in priority order. Goals are about the *solution*, not the process. "Reach alignment" is a meeting goal — it does not belong here.

### When to use a FANG-only doc

Sometimes you should write only the FANG sections and stop before proposing solutions. Two cases where this is the right call:
1. **Early alignment check**: You want to confirm the team agrees on the problem before investing time in solution development.
2. **Stuck debate**: When a team can't move forward, it's almost always a proxy debate about goals or assumptions. Stripping away solutions and aligning on FANG first surfaces the real disagreement.

If the user asks for FANG-only, complete through Goals and stop. Do not write Discussion or Proposed Solutions.

### Common mistakes — avoid these

Check your draft against each one before finalizing.

1. **Too much framing**: If information isn't needed to evaluate a solution, cut it. History lessons almost never belong in Framing.
2. **Stating hard facts as assumptions**: Framing = things that cannot change. Assumptions = things that can. "We are a mobile-first product" is framing if it's a fixed constraint, not an assumption.
3. **Goals that are about the meeting, not the solution**: "Reach alignment on approach" is a process goal. "The solution must work without an internet connection" is a design goal. Only design goals belong in Goals.
4. **Too many Discussion items**: If you find yourself seeding more than 3 open questions, stop — it means either you don't have enough detail from the user yet, or the doc is operating at the wrong level of altitude. Flag this to the user rather than padding the Discussion section.

### Discussion section
Seed the Discussion table with 2-3 open questions or unresolved items you identify while writing. Label each row you add with "Draft PM Agent" in the Author column. If you find yourself wanting to add more than 3 items, surface the issue to the user instead — see Common Mistakes above.

### Proposed Solutions
After completing the FANG sections, draft a proposed solution. Label it clearly as **"Draft — AI PM Agent Proposed"**. Keep it focused on what the solution does, not how it's built. This is a starting point for team discussion, not a final recommendation.

### Tone and style
- Write in plain, direct language. No corporate jargon.
- Be specific — vague statements without supporting context weaken the doc.
- Default to bullet points and numbered lists. Use tables where the format is provided.
- This is a decision doc, not a planning doc — it should be tighter and more focused than a PRD. Brevity is a feature.

### Vocabulary
- **[ASSUMED]**: You inferred this — it has not been confirmed by the user.
- **[HYPOTHESIZED]**: This is your best guess, not backed by data or research yet.
- **[NEEDS VALIDATION]**: This needs more information before it can be considered reliable.
- **[VERIFY WITH USER]**: You need the user to confirm or provide this — do not guess.

### This is a living document
Update this template as you learn from the user:
- **Update this template file itself** if the user gives explicit feedback about format, sections, or style — so future FANG docs reflect that automatically.
- **Update the Context Snapshot** as you learn more about the user's decision-making process, stakeholders, and working style.

### Verification — what to ask after drafting
After generating a draft, ask the user to confirm:
- **Sign-off**: Who needs to review and approve this doc?
- **Decision deadline**: Is there a date by which this decision needs to be made?
- **Flagged items**: Surface all sections marked `[ASSUMED]`, `[HYPOTHESIZED]`, or `[VERIFY WITH USER]` explicitly so the user can confirm or correct them.
- **Discussion items**: Confirm your 2-3 seeded questions are the right ones to highlight.

---

### Context Snapshot
*Maintained by the agent. This snapshot stores reusable preferences about how this user writes FANG docs — not the decision itself. Decision-specific details (what's being decided, stakeholders, deadline) belong in the document body since they change with every doc.*

*Last updated: [date]*

**Document preferences** *(update based on explicit feedback)*
- Review process: [does this person do formal sign-offs? with whom?]
- Typical stakeholder roles: [e.g., "always loops in eng lead and design", "founder decides solo"]
- Sections to always include: [none noted yet]
- Sections to always skip: [none noted yet]
- Style notes: [e.g., "prefers minimal framing", "always wants Discussion populated", "skips Document History"]

<!-- ==========================================
     END AGENT INSTRUCTIONS
     ========================================== -->

# [Project or Decision Name]

**Status**: Draft \| RFC (Request for Comments) \| Final \| Inactive
**Author(s)**:
**Decision Owner**:
**Decision Deadline**:
**Last Update**: MM/DD/YYYY

**Decision**: [1-2 sentence summary of what is being decided]
**Trigger**: [What prompted this decision — e.g., a new opportunity, a blocker, a shifting assumption]
**Related PRD / Project**: [link if applicable]

## Document Sign-Off

Add your name once you've reviewed the document. Working Team members should engage during the Draft phase; Additional Reviewers during the RFC phase. If you read the doc and have no changes, sign off to signal that to the author.

| Who | Date | Notes | Final Sign-Off |
| :-- | :-- | :-- | :-- |
| **Working Team** (Draft Phase+) | | | |
| | | | |
| **Additional Reviewers** (RFC Phase+) | | | |
| | | | |

*[Add a high-level summary here once the doc reaches RFC. Example: "This doc proposes X to enable Y. We motivate the context using FANG and introduce a proposed solution. The expected outcome is Z."]*

# FANG

## Framing

Write 3-6 bullets of backward-looking context that land on a clear problem statement. Cover: what the decision is, why it needs to be made now, and any fixed constraints or facts essential for evaluating solutions. The framing should end with a crisp articulation of the problem — if a reader can't state the problem in one sentence after reading this section, rewrite it. Cut anything that isn't necessary to understand the problem — err toward less.

Quality bar: A reader with no prior context should understand why a decision needs to be made, what the hard boundaries are, and what problem we're solving. If it reads like a history lesson or includes things that could change, trim it.

## Assumptions

List the highly relevant facts that guide your thinking — things you believe to be true today that have material influence on which solution is right. Each assumption should pass this test: *"If this turned out to be wrong, would it change which solution we'd pick?"* If not, cut it.

Assumptions are things that *can* change or be invalidated. If they can't change, they belong in Framing. If an assumption changing doesn't affect the solution space, cut it for clarity.

Quality bar: Assumptions should be current-best-knowledge, specific, and consequential. "Most of our users are on mobile" is an assumption (could be disproven by data). "Our API will support 10k req/s by Q3" is an assumption (could slip). "We are a B2B company" is framing if it's a fixed fact — it doesn't belong here.

For this project we have the following assumptions:
- 
- 

## Non-Goals

List what solutions explicitly do not need to solve for. These can range from high-level strategy tradeoffs to specific product-level scoping decisions. Write them as design-level or strategy-level tradeoffs, not process or meeting goals.

Quality bar: "Don't discuss feature X" is a process non-goal — it doesn't belong here. Each non-goal should imply a tradeoff you're consciously accepting. Examples at different altitudes:
- **Strategy**: "We are not trying to win enterprise customers with this solution" / "This does not need to address international markets in v1"
- **Product**: "Solution does not need to support offline mode" / "We are not building a mobile experience for this — web only"
- **Scope**: "We are not redesigning the existing onboarding flow as part of this" / "Backward compatibility with the legacy API is not required"

-
-

## Goals *(priority ordered)*

List what solutions must solve for, in order of importance. These are design goals — concrete, testable things a good solution must do or be.

Quality bar: "Reach alignment" is not a goal. "The solution must work on both web and mobile without a separate codebase" is a goal. "The solution must not require changes to the existing auth model" is a goal. If you can't tell whether a proposed solution passes or fails a goal, rewrite it.

1.
2.
3.

# Discussion

Seed the table with 2-3 open questions or unresolved items identified while writing this doc. Each row added by the agent should be labeled "Draft PM Agent." If you have more than 3, surface the gap to the user before continuing — see Common Mistakes in the agent instructions.

| # | Question / Open Item | Author | Status |
| :-- | :-- | :-- | :-- |
| 1 | [open question or unresolved item] | Draft PM Agent | Open |
| 2 | [open question or unresolved item] | Draft PM Agent | Open |

# Proposed Solutions

**Draft — AI PM Agent Proposed**

[High-level proposed solution based on the FANG above. Focus on what the solution does, not how it's built. This is a starting point for team discussion — not a final recommendation.]

## Solution Elements

Break down the proposed solution into its key components. Keep each element at the product/outcome level.

- **[Element name]**: What this element does and why it matters in the context of the Goals above.

## Further Reading

Link to related documents — prior decisions, related PRDs, background research, etc. If none, write `N/A`.

## Document History

| Name | Date | Description |
| :-- | :-- | :-- |
| | MM/DD/YYYY | Initial draft |
| | | |
