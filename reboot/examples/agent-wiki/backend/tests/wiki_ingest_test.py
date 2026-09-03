"""The scenario in `wiki_ingest.feature`: the end-to-end
`Wiki.ingest` librarian workflow, with the LLM replaced by a
scripted Pydantic AI `FunctionModel`."""

import pytest
from pydantic_ai.messages import (
    ModelMessage,
    ModelResponse,
    TextPart,
    ToolCallPart,
)
from pydantic_ai.models.function import AgentInfo, FunctionModel
from reboot.aio.applications import Application
from reboot.bdd import scenarios
from reboot.bdd.fixtures import World
from servicers import wiki as wiki_module
from servicers.wiki import (
    PageServicer,
    TranscriptServicer,
    UserServicer,
    WikiServicer,
)
from typing import Iterator


class ScriptedLibrarian:
    """A stateful scripted Pydantic AI model that drives the
    librarian through a fixed sequence of tool calls:

        get_wiki -> create_page -> update_wiki -> end

    Each call sees the agent's conversation history and
    decides what to do next based on which tools have
    already returned, so the script is robust to any Reboot-
    level retries or extra round-trips. The `page_id`
    produced by `create_page` is extracted from its tool
    return and woven into the `update_wiki` call."""

    PAGE_TITLE = "Test Page"
    PAGE_CONTENT = "Distilled transcript content."

    def __init__(self, world: World) -> None:
        self.world = world
        self.page_id: str | None = None

    async def step(
        self,
        messages: list[ModelMessage],
        info: AgentInfo,
    ) -> ModelResponse:
        # Collect the names of tools whose returns we've
        # already observed. The librarian is deterministic
        # so this is enough to drive the next step.
        returned_tools: set[str] = set()
        for message in messages:
            for part in getattr(message, "parts", []):
                if getattr(part, "part_kind", None) != "tool-return":
                    continue
                returned_tools.add(part.tool_name)
                # The `create_page` tool returns the new
                # page's state ID as a bare string; remember
                # it for the `update_wiki` call.
                if part.tool_name == "create_page":
                    self.page_id = str(part.content)
                    # Save the ID so the scenario can recall it
                    # as ${page_id}.
                    self.world.saved['page_id'] = self.page_id

        if "get_wiki" not in returned_tools:
            return ModelResponse(
                parts=[
                    ToolCallPart(tool_name="get_wiki", args={}),
                ]
            )
        if "create_page" not in returned_tools:
            return ModelResponse(
                parts=[
                    ToolCallPart(
                        tool_name="create_page",
                        args={
                            "title": self.PAGE_TITLE,
                            "content": self.PAGE_CONTENT,
                        },
                    ),
                ]
            )
        if "update_wiki" not in returned_tools:
            assert self.page_id is not None, (
                "create_page must have returned before "
                "update_wiki"
            )
            return ModelResponse(
                parts=[
                    ToolCallPart(
                        tool_name="update_wiki",
                        args={
                            "content":
                                (
                                    "# Table of contents\n\n"
                                    f"- [Test Page](Page:{self.page_id})\n"
                                ),
                        },
                    ),
                ]
            )

        return ModelResponse(parts=[TextPart(content="Done.")])


@pytest.fixture
def application() -> Application:
    return Application(
        servicers=[
            UserServicer,
            WikiServicer,
            PageServicer,
            TranscriptServicer,
        ],
    )


@pytest.fixture(autouse=True)
def script(world: World) -> Iterator[ScriptedLibrarian]:
    """Swaps the librarian's model, for the scenario's duration, for
    the scripted one, which saves the created page's ID as
    `page_id`."""
    scripted = ScriptedLibrarian(world)
    original = wiki_module.librarian.wrapped.model
    wiki_module.librarian.wrapped.model = FunctionModel(scripted.step)
    yield scripted
    wiki_module.librarian.wrapped.model = original


scenarios('wiki_ingest.feature')
