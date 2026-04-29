import asyncio
import json
import logging
import pydantic_ai
from agent_wiki.v1.wiki import (
    UserCreateWikiRequest,
    UserCreateWikiResponse,
    UserListWikisResponse,
    WikiAddTranscriptResponse,
    WikiSummary,
)
from agent_wiki.v1.wiki_rbt import Page, Transcript, User, Wiki
from dataclasses import dataclass
from pydantic_ai import RunContext
from rbt.v1alpha1.errors_pb2 import Ok, PermissionDenied, Unauthenticated
from reboot.agents.pydantic_ai import Agent
from reboot.aio.auth.authorizers import allow_if, is_app_internal
from reboot.aio.contexts import (
    ReaderContext,
    TransactionContext,
    WorkflowContext,
    WriterContext,
)
from reboot.aio.workflows import at_most_once, until
from typing import Union

logger = logging.getLogger(__name__)


def _caller_is_owner(
    *,
    context: ReaderContext,
    state: Union[Wiki.State, Page.State, Transcript.State],
    **kwargs,
):
    """Allow when the caller's `user_id` matches `state.owner_id`."""
    if context.auth is None or context.auth.user_id is None:
        return Unauthenticated()
    if state is not None and context.auth.user_id == state.owner_id:
        return Ok()
    return PermissionDenied()


def _caller_is_authenticated(
    *,
    context: ReaderContext,
    **kwargs,
):
    """Allow any authenticated caller. Used for factory `create` methods
    where no state exists yet to check ownership against."""
    if context.auth is None or context.auth.user_id is None:
        return Unauthenticated()
    return Ok()


def _truncate(value: object, limit: int = 500) -> str:
    """Render `value` as a string, shortened for log lines so a
    big tool payload doesn't flood the output."""
    text = value if isinstance(value, str) else repr(value)
    if len(text) <= limit:
        return text
    return text[:limit] + f"... [+{len(text) - limit} chars]"


def _log_librarian_node(prefix: str, node: object) -> None:
    """Log one step of a `librarian.iter(...)` run. Called
    for every node yielded by the iterator so the backend
    log shows the model's thoughts, its tool calls, and
    each tool's return value as the ingest happens."""
    if pydantic_ai.Agent.is_user_prompt_node(node):
        logger.info("%s prompt submitted", prefix)
    elif pydantic_ai.Agent.is_model_request_node(node):
        # `node.request.parts` holds the tool results (and
        # any user prompts) being fed back to the model.
        for part in node.request.parts:
            if getattr(part, "part_kind", None) == "tool-return":
                logger.info(
                    "%s tool return %s -> %s",
                    prefix,
                    part.tool_name,
                    _truncate(part.content),
                )
    elif pydantic_ai.Agent.is_call_tools_node(node):
        # `node.model_response.parts` is the model's latest
        # reply: free-form text (its "thinking") and the
        # tool calls it wants us to execute.
        for part in node.model_response.parts:
            kind = getattr(part, "part_kind", None)
            if kind == "text":
                logger.info(
                    "%s thinking: %s",
                    prefix,
                    _truncate(part.content),
                )
            elif kind == "tool-call":
                logger.info(
                    "%s tool call %s(%s)",
                    prefix,
                    part.tool_name,
                    _truncate(part.args),
                )
    elif pydantic_ai.Agent.is_end_node(node):
        logger.info("%s done", prefix)
    else:
        logger.debug("%s unknown node: %r", prefix, node)


@dataclass
class LibrarianDeps:
    wiki_id: str
    owner_id: str


librarian = Agent(
    # NOTE: Pydantic AI reads the Anthropic API key from the
    # `ANTHROPIC_API_KEY` environment variable.
    "anthropic:claude-sonnet-4-6",
    name="librarian",
    deps_type=LibrarianDeps,
    system_prompt=(
        "You are the librarian of a knowledge base wiki. "
        "Your job is to progressively AGGREGATE knowledge "
        "from conversation transcripts into a small, "
        "well-organized set of pages — NOT to accumulate "
        "one page per transcript.\n\n"
        "Each transcript you receive was a conversation a "
        "user had and wants captured. Fold its key facts "
        "into the wiki while actively looking for "
        "opportunities to consolidate, generalize, and "
        "rename existing pages so that related material "
        "ends up together under a broader heading.\n\n"
        "Example of the behavior we want: suppose the "
        "wiki already has a page titled \"History of the "
        "Steam Engine\". A new transcript arrives about "
        "the history of the light bulb. Rather than "
        "creating a separate page, you should RENAME the "
        "existing page to something like \"History of "
        "Inventions\" and rewrite its content to cover "
        "both. If a later transcript covers the history "
        "of Greece, broaden again — maybe \"History of "
        "Inventions and Countries\", or just \"History of "
        "Things\" once the scope is wide enough. Keep "
        "generalizing as the material accumulates.\n\n"
        "Your workflow on each transcript:\n"
        "1. Call `get_wiki` to read the wiki's current "
        "markdown body. That markdown is the table of "
        "contents; pages are referenced as "
        "`Page:<state_id>` URIs.\n"
        "2. Decide which existing page (if any) is the "
        "best home for the new material. Prefer "
        "broadening an existing page over creating a new "
        "one. Call `get_page` to read candidates.\n"
        "3. If a page can absorb this material (possibly "
        "after renaming and partial rewrite), call "
        "`update_page` with a new `title` and rewritten "
        "`content`. It is completely fine to rewrite a "
        "page from scratch when that produces a cleaner "
        "summary.\n"
        "4. Only call `create_page` when the new material "
        "genuinely does not fit any existing page even "
        "after generalizing.\n"
        "5. Call `update_wiki` to rewrite the wiki's "
        "markdown body so the table of contents reflects "
        "the current page titles and IDs. Rewriting the "
        "wiki wholesale is fine.\n\n"
        "Important habits:\n"
        "- Pages should be DISTILLED summaries — facts "
        "organized into concise prose — not verbatim "
        "dumps of the transcript. Aim for fewer, "
        "higher-signal pages.\n"
        "- You do not need to inline everything from a "
        "transcript. Linking to the source transcript as "
        "`Transcript:<state_id>` from within a page's "
        "markdown is a perfectly good way to preserve "
        "detail without bloating the page.\n"
        "- Err on the side of fewer, broader pages. If "
        "two pages cover closely related ground, merge "
        "them.\n"
        "- Use `Page:<state_id>` and "
        "`Transcript:<state_id>` URIs liberally so "
        "readers can follow links by calling the "
        "referenced type's `get` method with the "
        "embedded state ID."
    ),
)


@librarian.tool
async def get_wiki(
    context: WorkflowContext,
    run_context: RunContext[LibrarianDeps],
) -> dict:
    """Read the wiki's current name, description, and
    markdown content."""
    state = await Wiki.ref(
        run_context.deps.wiki_id,
    ).get(context)
    return {
        "name": state.name,
        "description": state.description,
        "content": state.content,
    }


@librarian.tool
async def update_wiki(
    context: WorkflowContext,
    run_context: RunContext[LibrarianDeps],
    content: str,
) -> None:
    """Replace the wiki's markdown body. Put the table of
    contents, cross-references, and any structure directly
    in this markdown. Link to pages with `Page:<state_id>`
    URIs."""
    await Wiki.ref(
        run_context.deps.wiki_id,
    ).update(
        context,
        content=content,
    )


@librarian.tool
async def get_page(
    context: WorkflowContext,
    run_context: RunContext[LibrarianDeps],
    page_id: str,
) -> dict:
    """Read a page's title and markdown content."""
    state = await Page.ref(page_id).get(context)
    return {
        "title": state.title,
        "content": state.content,
    }


@librarian.tool
async def update_page(
    context: WorkflowContext,
    run_context: RunContext[LibrarianDeps],
    page_id: str,
    title: str,
    content: str,
) -> None:
    """Replace a page's title and markdown body. Use this to
    rename a page as its scope broadens (e.g., a page about
    the steam engine becoming "History of Inventions"), or
    to rewrite its content to incorporate new material."""
    await Page.ref(page_id).update(
        context,
        title=title,
        content=content,
    )


@librarian.tool
async def create_page(
    context: WorkflowContext,
    run_context: RunContext[LibrarianDeps],
    title: str,
    content: str,
) -> str:
    """Create a new page with the given title and markdown
    content. Returns the new page's state ID, which you
    should link to from the wiki's markdown as
    `Page:<state_id>`."""
    page, _ = await Page.create(
        context,
        title=title,
        content=content,
        owner_id=run_context.deps.owner_id,
    )
    return page.state_id


class UserServicer(User.Servicer):
    """Servicer for the per-user state machine; entry point to
    the Wiki knowledge base."""

    async def create_wiki(
        self,
        context: TransactionContext,
        request: UserCreateWikiRequest,
    ) -> UserCreateWikiResponse:
        """Create a new Wiki, record it on the user under
        the given name, and kick off its ingest workflow."""
        owner_id = (
            context.auth.user_id if context.auth is not None and
            context.auth.user_id is not None else ""
        )
        wiki, _ = await Wiki.create(
            context,
            name=request.name,
            description=request.description,
            owner_id=owner_id,
        )
        self.state.wikis[request.name] = wiki.state_id
        return UserCreateWikiResponse(wiki_id=wiki.state_id)

    async def list_wikis(
        self,
        context: ReaderContext,
    ) -> UserListWikisResponse:
        """List every wiki owned by this user."""
        wikis: list[WikiSummary] = []
        for name, wiki_id in self.state.wikis.items():
            state = await Wiki.ref(wiki_id).get(context)
            wikis.append(
                WikiSummary(
                    wiki_id=wiki_id,
                    name=name,
                    description=state.description,
                )
            )
        return UserListWikisResponse(wikis=wikis)


class WikiServicer(Wiki.Servicer):
    """Servicer for an individual Wiki: a markdown body plus
    title and description metadata, and the librarian
    `ingest` workflow that folds transcripts into it."""

    def authorizer(self):
        return Wiki.Authorizer(
            create=allow_if(any=[_caller_is_authenticated, is_app_internal]),
            get=allow_if(any=[_caller_is_owner, is_app_internal]),
            update=allow_if(any=[_caller_is_owner, is_app_internal]),
            add_transcript=allow_if(any=[_caller_is_owner, is_app_internal]),
            ingest=allow_if(any=[_caller_is_owner, is_app_internal]),
        )

    async def create(
        self,
        context: WriterContext,
        request: Wiki.CreateRequest,
    ) -> None:
        self.state.name = request.name
        self.state.description = request.description
        self.state.owner_id = request.owner_id
        await self.ref().schedule().ingest(context)

    async def get(
        self,
        context: ReaderContext,
    ) -> Wiki.GetResponse:
        return Wiki.GetResponse(
            name=self.state.name,
            description=self.state.description,
            content=self.state.content,
        )

    async def update(
        self,
        context: WriterContext,
        request: Wiki.UpdateRequest,
    ) -> None:
        self.state.content = request.content

    async def add_transcript(
        self,
        context: TransactionContext,
        request: Wiki.AddTranscriptRequest,
    ) -> WikiAddTranscriptResponse:
        """Create a new Transcript belonging to this Wiki and
        record it as pending ingestion on the Wiki."""
        transcript, _ = await Transcript.create(
            context,
            messages=list(request.messages),
            owner_id=self.state.owner_id,
        )
        self.state.transcripts[transcript.state_id] = False
        return WikiAddTranscriptResponse(
            transcript_id=transcript.state_id,
        )

    @classmethod
    async def ingest(
        cls,
        context: WorkflowContext,
    ) -> None:
        """Librarian workflow: watch this Wiki's transcripts
        map for pending entries, run the LLM librarian on
        each to fold it into the wiki's markdown and into
        Pages, then mark the transcript ingested."""
        wiki = Wiki.ref()
        wiki_id = wiki.state_id
        initial_state = await wiki.read(context)
        owner_id = initial_state.owner_id

        async for _ in context.loop("Ingest loop"):

            async def find_pending_transcript() -> str | bool:
                state = await wiki.read(context)
                for transcript_id, ingested in state.transcripts.items():
                    if not ingested:
                        return transcript_id
                return False

            transcript_id = await until(
                "Pending transcript",
                context,
                find_pending_transcript,
                type=str,
            )

            transcript = await Transcript.ref(transcript_id).get(context)
            conversation = json.dumps(
                [message.model_dump() for message in transcript.messages],
                indent=2,
            )

            prompt = (
                "Ingest this conversation transcript into "
                "the wiki. The transcript is provided below "
                "as a JSON array of {role, content} "
                f"messages:\n\n{conversation}"
            )
            log_prefix = (
                f"librarian[wiki={wiki_id} "
                f"transcript={transcript_id}]"
            )

            async def run_librarian() -> str:
                async with librarian.iter(
                    context,
                    prompt,
                    deps=LibrarianDeps(
                        wiki_id=wiki_id,
                        owner_id=owner_id,
                    ),
                ) as run:
                    async for node in run:
                        _log_librarian_node(log_prefix, node)
                assert run.result is not None
                return str(run.result.output)

            try:
                await at_most_once(
                    f"Ingest {transcript_id}",
                    context,
                    run_librarian,
                    type=str,
                )
            except asyncio.CancelledError:
                # Explicitly propagate cancellation so the workflow can
                # be stopped i.e. during the test teardown.
                raise
            except:
                import traceback
                traceback.print_exc()
                # TODO: better error handling, i.e., some errors might
                # be retryable and others perhaps we just skip this
                # transcript as we are currently doing?

            async def mark_ingested(state):
                state.transcripts[transcript_id] = True

            await wiki.write(context, mark_ingested)


class PageServicer(Page.Servicer):
    """Servicer for an individual Page: a markdown body with
    a title."""

    def authorizer(self):
        return Page.Authorizer(
            create=allow_if(any=[_caller_is_authenticated, is_app_internal]),
            get=allow_if(any=[_caller_is_owner, is_app_internal]),
            update=allow_if(any=[_caller_is_owner, is_app_internal]),
        )

    async def create(
        self,
        context: WriterContext,
        request: Page.CreateRequest,
    ) -> None:
        self.state.title = request.title
        self.state.content = request.content
        self.state.owner_id = request.owner_id

    async def get(
        self,
        context: ReaderContext,
    ) -> Page.GetResponse:
        return Page.GetResponse(
            title=self.state.title,
            content=self.state.content,
        )

    async def update(
        self,
        context: WriterContext,
        request: Page.UpdateRequest,
    ) -> None:
        self.state.title = request.title
        self.state.content = request.content


class TranscriptServicer(Transcript.Servicer):
    """Servicer for an individual Transcript (raw conversation
    transcript)."""

    def authorizer(self):
        return Transcript.Authorizer(
            create=allow_if(any=[_caller_is_authenticated, is_app_internal]),
            get=allow_if(any=[_caller_is_owner, is_app_internal]),
            update=allow_if(any=[_caller_is_owner, is_app_internal]),
        )

    async def create(
        self,
        context: WriterContext,
        request: Transcript.CreateRequest,
    ) -> None:
        self.state.messages = list(request.messages)
        self.state.owner_id = request.owner_id

    async def get(
        self,
        context: ReaderContext,
    ) -> Transcript.GetResponse:
        return Transcript.GetResponse(
            messages=list(self.state.messages),
        )

    async def update(
        self,
        context: WriterContext,
        request: Transcript.UpdateRequest,
    ) -> None:
        self.state.messages = list(request.messages)
