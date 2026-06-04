"""Tests for the agent-wiki backend.

Covers:
* CRUD on each servicer (`User`, `Wiki`, `Page`,
  `Transcript`) via direct Reboot calls.
* The end-to-end `Wiki.ingest` librarian workflow, with the
  real Anthropic model swapped for a scripted Pydantic AI
  `FunctionModel` so no external API call is made.
"""
import asyncio
import unittest
from agent_wiki.v1.wiki import TranscriptMessage
from agent_wiki.v1.wiki_rbt import Page, Transcript, User, Wiki
from pydantic_ai.messages import (
    ModelMessage,
    ModelResponse,
    TextPart,
    ToolCallPart,
)
from pydantic_ai.models.function import AgentInfo, FunctionModel
from reboot.aio.applications import Application
from reboot.aio.auth.oauth_providers import Anonymous
from reboot.aio.tests import OAuthProviderForTest, Reboot
from servicers import wiki as wiki_module
from servicers.wiki import (
    PageServicer,
    TranscriptServicer,
    UserServicer,
    WikiServicer,
)

APPLICATION_SERVICERS = [
    UserServicer,
    WikiServicer,
    PageServicer,
    TranscriptServicer,
]


def _null_librarian_model() -> FunctionModel:
    """Return a `FunctionModel` that refuses to be called.
    Used by tests that should never trigger the librarian;
    if they accidentally do, we get a clear failure instead
    of a real Anthropic request."""

    def _refuse(
        messages: list[ModelMessage],
        info: AgentInfo,
    ) -> ModelResponse:
        raise AssertionError(
            "Librarian invoked in a test that should not "
            "trigger ingestion."
        )

    return FunctionModel(_refuse)


def _simple_librarian_model() -> FunctionModel:
    """Return a `FunctionModel` that always returns the same
    response, used by tests that want to trigger the
    librarian but don't care about its behavior."""

    def _respond(
        messages: list[ModelMessage],
        info: AgentInfo,
    ) -> ModelResponse:
        return ModelResponse(parts=[TextPart(content="Librarian response")])

    return FunctionModel(_respond)


class _WikiTestBase(unittest.IsolatedAsyncioTestCase):
    """Base class that wires up Reboot, creates an `alice` user
    context, and swaps the librarian model for the duration of
    each test. Subclasses override `_make_librarian_model` to
    choose which stand-in model to install."""

    def _make_librarian_model(self) -> FunctionModel:
        raise NotImplementedError

    async def asyncSetUp(self) -> None:
        self._original_model = wiki_module.librarian.wrapped.model
        # Overwrite the librarian's model within the test, so any calls
        # to LLM become deterministic.
        wiki_module.librarian.wrapped.model = self._make_librarian_model()

        self.rbt = Reboot()
        await self.rbt.start()
        await self.rbt.up(
            Application(
                servicers=APPLICATION_SERVICERS,
                oauth=OAuthProviderForTest(Anonymous()),
            ),
        )
        self.user_id = "alice"
        self.context = self.rbt.create_external_context(
            name=f"test-{self.id()}",
            bearer_token=self.rbt.make_valid_oauth_access_token(
                user_id=self.user_id,
            ),
        )
        # `User` is an auto-constructed state type: in
        # production the MCP session's "new session" hook
        # calls `_auto_construct` for the authenticated user.
        # Tests don't go through that hook, so we do it here.
        await UserServicer._auto_construct(
            self.context,
            state_id=self.user_id,
        )

    async def asyncTearDown(self) -> None:
        await self.rbt.stop()
        wiki_module.librarian.wrapped.model = self._original_model


class ServicerTest(_WikiTestBase):
    """Unit tests for each servicer's CRUD methods. These
    tests never add a transcript, so the librarian workflow
    never actually runs — but we still replace the agent's
    model as a belt-and-braces guard against accidental
    Anthropic calls from this suite."""

    def _make_librarian_model(self) -> FunctionModel:
        # The tests should never trigger the librarian.
        return _null_librarian_model()

    async def test_user_create_and_list_wikis(self) -> None:
        """A user can create a wiki and then see it in their
        list, keyed by the user-supplied name."""
        user = User.ref("alice")
        create_response = await user.create_wiki(
            self.context,
            name="my notes",
            description="my personal notes",
        )
        self.assertTrue(create_response.wiki_id)

        list_response = await user.list_wikis(self.context)
        self.assertEqual(len(list_response.wikis), 1)
        (summary,) = list_response.wikis
        self.assertEqual(summary.wiki_id, create_response.wiki_id)
        self.assertEqual(summary.name, "my notes")
        self.assertEqual(summary.description, "my personal notes")

    async def test_wiki_get_and_update(self) -> None:
        """A freshly created wiki exposes its name and
        description, starts with empty markdown, and
        `update` replaces the markdown body."""
        user = User.ref("alice")
        create_response = await user.create_wiki(
            self.context,
            name="my notes",
            description="my personal notes",
        )
        wiki = Wiki.ref(create_response.wiki_id)

        got = await wiki.get(self.context)
        self.assertEqual(got.name, "my notes")
        self.assertEqual(got.description, "my personal notes")
        self.assertEqual(got.content, "")

        await wiki.update(self.context, content="# Hello\n")
        got = await wiki.get(self.context)
        self.assertEqual(got.content, "# Hello\n")

    async def test_page_crud(self) -> None:
        """`Page.create` / `get` / `update` round-trip the
        title and markdown body."""
        page, _ = await Page.create(
            self.context,
            title="My Page",
            content="Initial body.",
            owner_id=self.user_id,
        )
        got = await page.get(self.context)
        self.assertEqual(got.title, "My Page")
        self.assertEqual(got.content, "Initial body.")

        await page.update(
            self.context,
            title="Renamed Page",
            content="New body.",
        )
        got = await page.get(self.context)
        self.assertEqual(got.title, "Renamed Page")
        self.assertEqual(got.content, "New body.")

    async def test_transcript_crud(self) -> None:
        """`Transcript.create` / `get` / `update` round-trip
        a list of `{role, content}` messages."""
        messages = [
            TranscriptMessage(role="user", content="Hello"),
            TranscriptMessage(role="assistant", content="Hi!"),
        ]
        transcript, _ = await Transcript.create(
            self.context,
            messages=messages,
            owner_id=self.user_id,
        )
        got = await transcript.get(self.context)
        self.assertEqual(len(got.messages), 2)
        self.assertEqual(got.messages[0].role, "user")
        self.assertEqual(got.messages[0].content, "Hello")
        self.assertEqual(got.messages[1].role, "assistant")
        self.assertEqual(got.messages[1].content, "Hi!")

        await transcript.update(
            self.context,
            messages=[
                TranscriptMessage(role="user", content="Goodbye"),
            ],
        )
        got = await transcript.get(self.context)
        self.assertEqual(len(got.messages), 1)
        self.assertEqual(got.messages[0].content, "Goodbye")


class ServicerWithSimpleLibrarianTest(_WikiTestBase):

    def _make_librarian_model(self) -> FunctionModel:
        # Depending on the timing, that test might trigger the librarian
        # when the transcription is added an consumed by `until`.
        return _simple_librarian_model()

    async def test_add_transcript_creates_transcript(
        self,
    ) -> None:
        """`Wiki.add_transcript` creates a new `Transcript`
        whose state reflects the given messages and returns
        its ID."""
        user = User.ref("alice")
        create_response = await user.create_wiki(
            self.context,
            name="notes",
            description="",
        )
        wiki = Wiki.ref(create_response.wiki_id)

        add_response = await wiki.add_transcript(
            self.context,
            messages=[
                TranscriptMessage(role="user", content="Hi."),
                TranscriptMessage(role="assistant", content="Hello!"),
            ],
        )
        self.assertTrue(add_response.transcript_id)

        transcript = await Transcript.ref(add_response.transcript_id
                                         ).get(self.context)
        self.assertEqual(len(transcript.messages), 2)
        self.assertEqual(transcript.messages[0].content, "Hi.")
        self.assertEqual(transcript.messages[1].content, "Hello!")


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

    def __init__(self) -> None:
        self.page_id: str | None = None
        self.done = asyncio.Event()

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

        # Signal done the moment we emit the final response, which means
        # the librarian has already executed `update_wiki` and the
        # wiki's content is updated by the time any test code waiting on
        # `done` wakes up.
        self.done.set()
        return ModelResponse(parts=[TextPart(content="Done.")])


class IngestWorkflowTest(_WikiTestBase):
    """End-to-end test of the `Wiki.ingest` librarian
    workflow with the LLM replaced by a `FunctionModel`."""

    script = ScriptedLibrarian()

    def _make_librarian_model(self) -> FunctionModel:
        # Scripted model that drives the librarian through a fixed
        # sequence of tool calls.
        return FunctionModel(self.script.step)

    async def test_ingest_creates_page_and_updates_wiki(
        self,
    ) -> None:
        """Adding a transcript wakes the librarian, which
        runs the scripted `get_wiki -> create_page ->
        update_wiki` sequence and marks the transcript
        ingested. We verify the wiki's markdown was rewritten
        and that the referenced page actually exists with
        the scripted title and body."""
        user = User.ref("alice")
        create_response = await user.create_wiki(
            self.context,
            name="notes",
            description="knowledge base",
        )
        wiki = Wiki.ref(create_response.wiki_id)

        await wiki.add_transcript(
            self.context,
            messages=[
                TranscriptMessage(role="user", content="Tell me about X."),
                TranscriptMessage(
                    role="assistant",
                    content="X is a thing that does Y.",
                ),
            ],
        )

        # Block until the scripted librarian signals it is
        # done. `done` is set the moment `step()` emits its
        # final `TextPart("Done.")`, at which point
        # `update_wiki` has already executed and
        # `Wiki.content` is already updated.
        await self.script.done.wait()

        state = await wiki.get(self.context)

        # The scripted librarian should have created exactly
        # one page and referenced it from the wiki's
        # markdown.
        self.assertIsNotNone(self.script.page_id)
        self.assertIn(f"Page:{self.script.page_id}", state.content)

        page = await Page.ref(self.script.page_id).get(self.context)
        self.assertEqual(page.title, ScriptedLibrarian.PAGE_TITLE)
        self.assertEqual(page.content, ScriptedLibrarian.PAGE_CONTENT)
