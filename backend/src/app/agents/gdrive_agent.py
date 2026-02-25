"""
Google Drive context gathering agent.
Uses OpenAI Agents SDK to discover user's company and role through intelligent
Google Drive exploration, reading representative documents, and analyzing patterns.
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
    """Load all SKILL.md files from the google-drive skills directory."""
    skills_dir = os.path.join(os.path.dirname(__file__), "skills", "google-drive")
    skills_content = []
    for root, dirs, files in os.walk(skills_dir):
        if "SKILL.md" in files:
            with open(os.path.join(root, "SKILL.md"), "r") as f:
                skills_content.append(f.read())
    return "\n\n".join(skills_content)


BASE_INSTRUCTIONS = [
    "You are a Google Drive context analyzer for a Product Manager Agent.",
    "Your mission: Discover and document the user's company, role, and current work context through intelligent Google Drive exploration.",
    "",
    "## Your Task",
    "Analyze the user's Google Drive to extract and document:",
    "1. Company Context: What company/organization does this user work at? What is the company's business?",
    "2. User Role: What is the user's role/job title? What are their responsibilities?",
    "3. Current Work: What are the user's active projects and focus areas?",
    "",
    "## Discovery Process",
    "1. START: Fetch 50 most recent files to identify current projects and patterns",
    "2. EXPLORE: Examine top-level folder structure to understand organizational logic",
    "3. ANALYZE: Read 3-5 representative documents to understand company and role",
    "4. SEARCH: Use targeted searches based on discovered patterns (e.g., strategy docs, meeting notes, roadmaps)",
    "5. SYNTHESIZE: Combine findings into coherent company and user context",
    "",
    "## Output Format",
    "Write your findings to the filesystem using tool_fs_write:",
    "- context/company.md: Document the company, its business, mission, structure",
    "- context/user.md: Document the user's role, responsibilities, focus areas",
    "- context/product.md: Document the product that the user is focused on, its current state, future plans, etc.",
    "",
    "Include in each file:",
    "- What you discovered and how",
    "- Key documents that informed your analysis",
    "- Confidence level and any gaps in your understanding",
    "",
    "## Available Tools",
    "- tool_bash with required_provider_auth='google': Call Google Drive API via cURL",
    "- tool_fs_read/write/list: Manage workspace files",
    "",
]


async def run_gdrive_context_agent(
    user_id: str,
    organization_id: str,
    workspace_id: str,
    sandbox_id: str | None,
) -> dict:
    """
    Run the Google Drive context gathering agent.
    
    The agent has access to:
    - tool_fs_read/write/list: Read/write/list files in workspace
    - tool_bash: Run shell commands (with required_provider_auth="google" for auth)
    
    Args:
        user_id: User ID for integration lookup
        organization_id: Organization ID for context
        workspace_id: Workspace ID for file operations
        sandbox_id: Optional sandbox ID for execution environment
    
    Returns:
        Dictionary with structured context data from Google Drive
    """
    
    instructions = BASE_INSTRUCTIONS + [
        "\n## Available Skills\n" + load_skills()
    ]
    
    agent = Agent(
        name="Google Drive Context Agent",
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
            "text": "Analyze the user's Google Drive to discover and document their company context and role. Write your findings to context/company.md and context/user.md.",
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
