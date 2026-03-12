from typing import AsyncGenerator
from agents import Agent, Runner, ItemHelpers

from app.agents.context import AgentRunPayload, build_agent_instructions
from app.agents.execution_agent import build_execution_agent
from app.agents.researcher_agent import build_researcher_agent
from app.agents.learning_agent import build_learning_agent


async def run_orchestrator(
    *,
    input_items: str | list[dict],
    payload: AgentRunPayload,
) -> AsyncGenerator[dict, None]:
    execution = build_execution_agent(payload)
    researcher = build_researcher_agent(payload)
    learner = build_learning_agent(payload)

    read_tools = [t for t in payload.tools if t.name in {"tool_fs_read", "tool_fs_list"}]
    coding_tools = [t for t in payload.tools if t.name == "tool_spawn_code_task"]

    model_id = "gpt-5.2"
    pm_agent = Agent(
        name="Product Manager Agent",
        instructions=await build_agent_instructions(payload),
        model=model_id,
        tools=[
            *read_tools,
            *coding_tools,
            execution.as_tool(
                tool_name="execution_agent",
                tool_description=(
                    "Performs concrete actions: writes documents, sends Slack messages, "
                    "creates Linear issues, runs integrations. Use when you need to DO something."
                ),
                max_turns=40,
            ),
            researcher.as_tool(
                tool_name="researcher_agent",
                tool_description=(
                    "Finds and retrieves information: searches workspace files, reads docs, "
                    "queries external APIs. Use when you need to KNOW something."
                ),
                max_turns=20,
            ),
            learner.as_tool(
                tool_name="learning_agent",
                tool_description=(
                    "Updates persistent memory: writes and merges context files "
                    "(company, user, product). Use after learning something worth remembering."
                ),
            ),
        ],
    )

    result = Runner.run_streamed(
        pm_agent,
        input=input_items,
        context=payload.agent_context,
        max_turns=40,
    )

    # TODO: sub-agent tool calls (execution_agent, researcher_agent, learning_agent) are opaque
    # from the parent stream — only a single tool_call/tool_output pair is visible per sub-agent
    # invocation. To get granular logging of what each sub-agent does internally (its own tool
    # calls, outputs, messages), add a RunHooks or wrap each build_*_agent call with a custom
    # Runner that streams its own events separately.
    async for event in result.stream_events():
        if event.type == "raw_response_event":
            continue
        elif event.type == "agent_updated_stream_event":
            print(f"Agent updated: {event.new_agent.name}")
            continue
        elif event.type == "run_item_stream_event":
            if event.item.type == "tool_call_item":
                raw = event.item.raw_item
                print(f"-- Tool was called: {raw.name}")
                print(raw.arguments)
                yield {
                    "type": "tool_call",
                    "content": f"{raw.name} tool was called",
                    "db_item": {
                        "type": "function_call",
                        "name": raw.name,
                        "call_id": raw.call_id,
                        "arguments": raw.arguments,
                    },
                }
            elif event.item.type == "tool_call_output_item":
                output = str(event.item.output)
                print(f"-- Tool output: {output[:200]}")
                short_output = (output[:200] + "...") if len(output) > 200 else output
                raw = event.item.raw_item
                call_id = raw.call_id if hasattr(raw, "call_id") else raw.get("call_id", "")
                yield {
                    "type": "tool_output",
                    "content": short_output,
                    "db_item": {
                        "type": "function_call_output",
                        "call_id": call_id,
                        "output": output,
                    },
                }
            elif event.item.type == "message_output_item":
                print(f"-- Message output:\n {ItemHelpers.text_message_output(event.item)}")
                content = ItemHelpers.text_message_output(event.item)
                if content:
                    yield {
                        "type": "message",
                        "content": content,
                    }

    try:
        usage = result.context_wrapper.usage
        yield {
            "type": "run_usage",
            "provider": "openai",
            "model": model_id,
            "input_tokens": usage.input_tokens,
            "output_tokens": usage.output_tokens,
            "cached_input_tokens": (
                usage.input_tokens_details.cached_tokens
                if usage.input_tokens_details else 0
            ),
            "reasoning_tokens": (
                usage.output_tokens_details.reasoning_tokens
                if usage.output_tokens_details else 0
            ),
        }
    except Exception:
        pass  # best-effort — never block final_output

    yield {
        "type": "final_output",
        "content": str(result.final_output),
    }
