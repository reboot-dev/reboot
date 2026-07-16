import asyncio
import pydantic_ai
import uuid
from datetime import datetime
from pydantic_ai import RunContext
from pydantic_ai.mcp import MCPServerStdio
from reboot.agents.pydantic_ai import Agent
from reboot.aio.contexts import WorkflowContext
from reboot.aio.workflows import at_least_once
from tests.reboot.documentation.agents_rbt import (
    Chat,
    ChatRequest,
    ChatResponse,
    Research,
    ResearchRequest,
    ResearchResponse,
)

agent = Agent(
    "anthropic:claude-sonnet-4-5",
    name="research_agent",
    system_prompt="You are a careful research assistant.",
)

bare = pydantic_ai.Agent("anthropic:claude-sonnet-4-5", name="research_agent")
agent = Agent.wrap(bare)


@agent.tool_plain
def now() -> str:
    """Return the current UTC timestamp."""
    # Because every tool is wrapped in an `at_least_once`
    # the same UTC timestamp will be returned during replay!
    return datetime.utcnow().isoformat()


@agent.tool
async def stripe_create_invoice(
    context: WorkflowContext,
    run: RunContext[None],
    customer_id: str,
) -> str:
    """Ask Stripe to create an invoice using an idempotency key so
    only one invoice is ever created even in the event of retry."""

    async def make_idempotency_key() -> uuid.UUID:
        return uuid.uuid4()

    # Using `at_least_once` memoizes values that you want to ensure
    # will be the same every time this tool call is replayed.
    idempotency_key = await at_least_once(
        "Make idempotency key for Stripe",
        context,
        make_idempotency_key,
    )

    # Now call Stripe with `idempotency_key`.
    return str(idempotency_key)


class ResearchServicer(Research.Servicer):

    @classmethod
    async def workflow(
        cls,
        context: WorkflowContext,
        request: ResearchRequest,
    ) -> ResearchResponse:
        result = await agent.run(context, request.query)
        return ResearchResponse(answer=result.output)


async def generate_drafts(context: WorkflowContext) -> None:
    results = await asyncio.gather(
        *[
            agent.run(context, "Generate an idea", variant=f"draft-{i}")
            for i in range(5)
        ]
    )

    del results


async def post_to_chat_ui(event) -> None:
    del event


class ChatServicer(Chat.Servicer):

    @classmethod
    async def workflow(
        cls,
        context: WorkflowContext,
        request: ChatRequest,
    ) -> ChatResponse:

        async def handler(
            run: RunContext[None],
            stream,
        ) -> None:
            i = 0
            async for event in stream:
                # Push each event to the UI via a durable side-effect
                # so the post is only sent once across replays.
                await at_least_once(
                    f"Post event '{i}' to UI",
                    context,
                    lambda: post_to_chat_ui(event),
                )
                i += 1

        result = await agent.run(
            context,
            request.message,
            event_stream_handler=handler,
        )
        return ChatResponse(answer=result.output)


async def quick_check(context: WorkflowContext) -> None:
    with agent.override(model="openai:gpt-4o-mini"):
        result = await agent.run(context, "Quick check.")

    del result


# OK -- distinct ids:
weather = MCPServerStdio("weather-mcp", id="weather")
calendar = MCPServerStdio("calendar-mcp", id="calendar")

agent = Agent(
    "anthropic:claude-sonnet-4-5",
    name="planner",
    toolsets=[weather, calendar],
)

agent = Agent(
    "anthropic:claude-sonnet-4-5",
    name="research_agent",
    parallel_execution_mode="parallel_ordered_events",  # default
)
