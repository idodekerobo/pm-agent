from agents import Agent, Runner

from app.agents.context import AgentRunPayload, build_skill_section


RESEARCHER_INSTRUCTIONS = """
You are the Researcher Agent for a Product Manager AI system.

Your job: Find and surface information. You do NOT write files or take actions.

You retrieve:
- Workspace context files (context/, .skills/)
- Web search results or external API data via bash (curl)
- Linear issues, Google Drive docs, or other integration data
- Answers about the product, market, or codebase

## Process
1. Check memory/memory.md and context/ files for existing knowledge first
2. Search workspace files for relevant docs
3. Use bash for external lookups if workspace knowledge is insufficient

## Tools
- bash: Web searches, API queries (read-only)
    The bash tool supports authentication for external providers like Linear and Google - use the required_provider_auth parameter to automatically inject credentials for CLI tools. Important: each bash call is a completely isolated subprocess — stdout from one call is not available to the next. If you need to fetch data and then process it, do it within a single bash call (e.g. pipe curl into python3, or use Python subprocess to run curl and handle the response).
    When piping curl output into python3, always use `python3 -c \"...\"` so the script is passed as a command argument and stdin remains free for the pipe. Never use `python3 - <<'HEREDOC'` with a pipe — the heredoc and the pipe both compete for stdin, the curl response is lost, and sys.stdin.read() will return empty
    The workspace environment is Debian Linux with the following available: curl, git, python3 (standard library only — no third-party packages like requests or httpx; use curl for HTTP), deno, and the linear CLI.
- fs_read / fs_list: Read workspace files
- fs_write: Write research documents.

## Returning results
Return a concise but complete answer to exactly what you were asked to research.
Include all key facts, data points, and relevant context the orchestrator needs to act — do not
truncate important information. Completeness takes priority over brevity for research.
If findings are extensive, also write them to context/research/<topic>.md and include the path
in your response so the orchestrator or execution agent can reference it later.
"""


GDRIVE_CONTEXT_PROMPT = """
Explore the user's Google Drive to discover and document their company context, role, and current work.

Read the Google Drive skill first: fs_read(".skills/google-drive/SKILL.md")

## Discovery process
1. Fetch the 50 most recent files to identify current projects and activity patterns
2. Explore the top-level folder structure to understand organizational logic
3. Read 3-5 representative documents — prioritize: strategy docs, roadmaps, PRDs, OKRs, meeting notes
4. Run targeted searches based on discovered patterns (e.g. "strategy", "roadmap", "OKR", "product spec")
5. Synthesize findings into a coherent picture of the company and the user's role

## What to look for
- Company Context: Name, business model, mission, industry, team structure
- User Role: Job title, responsibilities, seniority, what they own
- Current Work: Active projects, ongoing initiatives, immediate focus areas

Once you have gathered sufficient context, hand off to the learning agent.
Tell it to write findings to:
- context/company.md — company name, business, mission, structure, key stakeholders
- context/user.md — user's role, responsibilities, focus areas
- context/product.md — product(s) they work on, current state, roadmap, open questions

In each file, note which documents informed the analysis and flag any gaps in confidence.
Instruct the learning agent to ensure each file has valid frontmatter (name, description using > block scalar, last_updated).
"""

LINEAR_CONTEXT_PROMPT = """
Explore the user's Linear workspace to discover and document their team, projects, and current work context.

Read the Linear CLI skill first: fs_read(".skills/linear-cli/SKILL.md")

## Discovery process
1. List teams to identify the organizational scope and team structure
2. List active projects and current cycles for the relevant teams
3. List issues assigned to the user (assignee: self) to understand their specific workload and priorities
4. Look for high-priority or recently updated items to understand immediate focus
5. Synthesize findings into a coherent picture of the team and the user's responsibilities

## What to look for
- Team Context: Team names, purposes, membership, how Linear is used (cycles, labels, estimates)
- Project Context: Active projects, their status, timelines, goals, and owners
- User Focus: Assigned issues, current cycle work, recent activity, workload size

Once you have gathered sufficient context, hand off to the learning agent.
Tell it to write findings to:
- context/linear_teams.md — teams, their purpose, structure, and process
- context/linear_projects.md — active projects, status, timelines, and goals
- context/user_work.md — user's assigned issues, priorities, and recent activity

In each file, note which teams/projects/issues informed the analysis and flag any gaps in confidence.
Instruct the learning agent to ensure each file has valid frontmatter (name, description using > block scalar, last_updated).
"""


def build_researcher_agent(payload: AgentRunPayload, handoffs: list | None = None) -> Agent:
    allowed = {"tool_bash", "tool_fs_read", "tool_fs_list", "tool_fs_write"}
    tools = [t for t in payload.tools if t.name in allowed]
    return Agent(
        name="Researcher Agent",
        instructions=RESEARCHER_INSTRUCTIONS + build_skill_section(payload),
        model="gpt-4.1",
        tools=tools,
        handoffs=handoffs or [],
    )


async def run_research_and_learn(payload: AgentRunPayload, prompt: str) -> None:
    """Run a research task and hand off findings to the learning agent to persist.

    The researcher explores and gathers information per the given prompt, then
    hands off to the learning agent which writes the findings to context files.
    Use the exported prompt constants (GDRIVE_CONTEXT_PROMPT, LINEAR_CONTEXT_PROMPT)
    or pass a custom prompt for ad-hoc research tasks.
    """
    from app.agents.learning_agent import build_learning_agent

    learner = build_learning_agent(payload)
    researcher = build_researcher_agent(payload, handoffs=[learner])

    await Runner.run(
        researcher,
        input=prompt,
        context=payload.agent_context,
    )
