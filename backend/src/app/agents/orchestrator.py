from agents import Agent, Runner, ItemHelpers

from app.agents.tools import AgentContext, tool_bash, tool_fs_list, tool_fs_read, tool_fs_write

PM_AGENT = Agent(
    name="Product Manager Agent",
    # model=
    instructions="\n".join((
        "You are a product manager that has access to an engineering team.",
        "You will be given feature ideas and other things.",
        "You have tool calls to read, write, and list files in a filesystem. As well as a bash tool to make commands. Use those tools to read, write, and edit PRD's.",
        "Whenever you give a draft of a PRD, use the tool_fs_write to write the draft of the PRD to the filesystem for future reference, editing, etc."
    )),
    tools=[tool_fs_list, tool_fs_write, tool_fs_read, tool_bash]
)

async def run_orchestrator(
    *,
    input_items: str | list[dict],
    organization_id: str,
    user_id: str,
    agent_session_id: str,
    workspace_id: str,
    sandbox_id: str | None = None,
) -> str:
    # TODO: build message thread management in
    context = AgentContext(
        organization_id=organization_id,
        user_id=user_id,
        workspace_id=workspace_id,
        sandbox_id=sandbox_id,
    )
    result = Runner.run_streamed(
        PM_AGENT,
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
                print("-- Tool was called")
                print(event.item)
            elif event.item.type == "tool_call_output_item":
                print(f"-- Tool output: {event.item.output}")
            elif event.item.type == "message_output_item":
                print(f"-- Message output:\n {ItemHelpers.text_message_output(event.item)}")
            else:
                pass

    return str(result.final_output)