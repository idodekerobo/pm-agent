"""
Linear context gathering agent.
Uses OpenAI Agents SDK to discover user's team, projects, and role through intelligent
Linear exploration, reading issues, projects, and analyzing patterns.
"""
from agents import Agent, Runner, ItemHelpers
import os
from app.agents.tools import (
    AgentContext,
    tool_fs_list,
    tool_fs_read,
    tool_fs_write,
    tool_bash,
)


def load_skills():
    """Load all SKILL.md files from the linear-cli skills directory."""
    skills_dir = os.path.join(os.path.dirname(__file__), "skills", "linear-cli")
    skills_content = []
    for root, dirs, files in os.walk(skills_dir):
        if "SKILL.md" in files:
            with open(os.path.join(root, "SKILL.md"), "r") as f:
                skills_content.append(f.read())
    return "\n\n".join(skills_content)


BASE_INSTRUCTIONS = [
    "You are a Linear context analyzer for a Product Manager Agent.",
    "Your mission: Discover and document the user's team, projects, and current work context through intelligent Linear exploration.",
    "",
    "## Your Task",
    "Analyze the user's Linear workspace to extract and document:",
    "1. Team Context: What teams does the user belong to? What is the team structure?",
    "2. Project Context: What are the active projects and initiatives?",
    "3. User Focus: What issues are assigned to the user? What is their current workload?",
    "4. Process: How does the team use Linear (cycles, estimates, labels)?",
    "",
    "## Discovery Process",
    "1. START: List teams to identify the organizational scope.",
    "2. EXPLORE: List active projects and current cycles for the relevant teams.",
    "3. ANALYZE: List issues assigned to the user ('assignee self') to understand their specific responsibilities.",
    "4. SEARCH: Look for recent activity or high-priority items.",
    "5. SYNTHESIZE: Combine findings into coherent team and user context.",
    "",
    "## Output Format",
    "Write your findings to the filesystem using tool_fs_write:",
    "- context/linear_teams.md: Document the teams, their purpose, and structure.",
    "- context/linear_projects.md: Document active projects, their status, and timelines.",
    "- context/user_work.md: Document the user's assigned issues, focus areas, and recent activity.",
    "",
    "Include in each file:",
    "- What you discovered and how",
    "- Key items (teams, projects, issues) that informed your analysis",
    "- Confidence level and any gaps in your understanding",
    "",
    "## Available Tools",
    "- tool_bash with required_provider_auth='linear': Run Linear CLI commands",
    "- tool_fs_read/write/list: Manage workspace files",
    "",
]


async def run_linear_context_agent(
    user_id: str,
    organization_id: str,
    workspace_id: str,
    sandbox_id: str | None,
) -> dict:
    """
    Run the Linear context gathering agent.
    
    The agent has access to:
    - tool_fs_read/write/list: Read/write/list files in workspace
    - tool_bash: Run shell commands (with required_provider_auth="linear" for auth)
    
    Args:
        user_id: User ID for integration lookup
        organization_id: Organization ID for context
        workspace_id: Workspace ID for file operations
        sandbox_id: Optional sandbox ID for execution environment
    
    Returns:
        Dictionary with structured context data from Linear
    """
    
    instructions = BASE_INSTRUCTIONS + [
        "\n## Available Skills\n" + load_skills()
    ]
    
    agent = Agent(
        name="Linear Context Agent",
        instructions="\n".join(instructions),
        model="gpt-4o",
        tools=[tool_fs_list, tool_fs_read, tool_fs_write, tool_bash],
    )
    
    context = AgentContext(
        organization_id=organization_id,
        user_id=user_id,
        workspace_id=workspace_id,
        sandbox_id=sandbox_id,
    )
    
    input_message = {
        "type": "message",
        "role": "user",
        "content": [{
            "type": "input_text",
            "text": "Analyze the user's Linear workspace to discover and document their team, projects, and work context. Write your findings to context/linear_teams.md, context/linear_projects.md, and context/user_work.md.",
        }]
    }
    
    result = Runner.run_streamed(agent, input=input_message, context=context)
    
    async for event in result.stream_events():
        if event.type == "raw_response_event":
            continue
        elif event.type == "agent_updated_stream_event":
            print(f"Agent updated: {event.new_agent.name}")
            continue
        elif event.type == "run_item_stream_event":
            if event.item.type == "tool_call_item":
                print(f"-- Tool was called: {event.item.raw_item.name}")
                print(event.item.raw_item.arguments)
            elif event.item.type == "tool_call_output_item":
                output = str(event.item.output)
                print(f"-- Tool output: {output[:200]}")
            elif event.item.type == "message_output_item":
                print(f"-- Message output:\n {ItemHelpers.text_message_output(event.item)}")
            else:
                pass
    
    final_output = result.final_output
    
    if isinstance(final_output, dict):
        return final_output
    
    return {
        "raw_output": str(final_output),
    }
