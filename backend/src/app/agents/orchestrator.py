from typing import AsyncGenerator
from agents import Agent, Runner, ItemHelpers

from app.agents.context import AgentRunPayload, build_agent_instructions


async def run_orchestrator(
    *,
    input_items: str | list[dict],
    payload: AgentRunPayload,
) -> AsyncGenerator[dict, None]:
    pm_agent = Agent(
        name="Product Manager Agent",
        instructions=build_agent_instructions(payload),
        model="gpt-5.2",
        tools=payload.tools,
    )
    result = Runner.run_streamed(
        pm_agent,
        input=input_items,
        context=payload.agent_context,
    )
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
                short_output = (output[:200] + '...') if len(output) > 200 else output
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
                        "content": content
                    }
            else:
                pass

    yield {
        "type": "final_output",
        "content": str(result.final_output)
    }
