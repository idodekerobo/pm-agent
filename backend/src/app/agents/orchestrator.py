from typing import AsyncGenerator
import os
from agents import Agent, Runner, ItemHelpers

from app.agents.tools import AgentContext, tool_bash, tool_fs_list, tool_fs_read, tool_fs_write
from app.db.supabase_client import get_supabase

BASE_INSTRUCTIONS = [
    "You are a product manager that has access to an engineering team.",
    "You will be given feature ideas and other things.",
    "You have tool calls to read, write, and list files in a filesystem. As well as a bash tool to make commands.",
    "Whenever you give a draft of a PRD, use the tool_fs_write to write the draft of the PRD to the filesystem for future reference, editing, etc."
]

def load_skills():
    skills_dir = os.path.join(os.path.dirname(__file__), "skills")
    skills_content = []
    for root, dirs, files in os.walk(skills_dir):
        if "SKILL.md" in files:
            with open(os.path.join(root, "SKILL.md"), "r") as f:
                skills_content.append(f.read())
    return "\n\n".join(skills_content)

async def run_orchestrator(
    *,
    input_items: str | list[dict],
    organization_id: str,
    user_id: str,
    agent_session_id: str,
    workspace_id: str,
    sandbox_id: str | None = None,
) -> AsyncGenerator[dict, None]:
    supabase = get_supabase()
    integrations_response = (
        supabase.table("integrations")
        .select("provider")
        .eq("user_id", user_id)
        .execute()
    )
    dynamic_instructions = list(BASE_INSTRUCTIONS)

    active_providers = [i['provider'] for i in integrations_response.data] if integrations_response.data else []
    if active_providers:
        dynamic_instructions.append(
            "\n## Active User Integrations \nYou can connect to the below providers/apps to help or do work on behalf of the user. To figure out how to use the app you'll need to use the appropriate SKILL:\n"
            + "\n- ".join(active_providers)
            + "."
        )
    else:
        pass

    # TODO: dynamically load skills based on whats needed
    dynamic_instructions.append("\n## Available Skills:\n" + load_skills())

    pm_agent = Agent(
        name="Product Manager Agent",
        instructions="\n".join(dynamic_instructions),
        tools=[tool_fs_list, tool_fs_write, tool_fs_read, tool_bash]
    )
    context = AgentContext(
        organization_id=organization_id,
        user_id=user_id,
        workspace_id=workspace_id,
        sandbox_id=sandbox_id,
    )
    # TODO: build message thread management in
    result = Runner.run_streamed(
        pm_agent,
        input=input_items,
        context=context,
    )
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
                yield {
                    "type": "tool_call",
                    "content": f"{event.item.raw_item.name} tool was called"
                }
            elif event.item.type == "tool_call_output_item":
                output = str(event.item.output)
                print(f"-- Tool output: {output[:200]}")
                short_output = (output[:200] + '...') if len(output) > 200 else output
                yield {
                    "type": "tool_output",
                    "content": short_output
                }
            elif event.item.type == "message_output_item":
                print(f"-- Message output:\n {ItemHelpers.text_message_output(event.item)}")
                content = ItemHelpers.text_message_output(event.item)
                if content:
                    yield {
                        "type": "message",
                        "content": content
                    }
            else:
                pass

    yield {
        "type": "final_output",
        "content": str(result.final_output)
    }
