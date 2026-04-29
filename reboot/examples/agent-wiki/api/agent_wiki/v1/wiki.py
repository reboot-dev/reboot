from reboot.api import (
    API,
    UI,
    Field,
    Methods,
    Model,
    Reader,
    Tool,
    Transaction,
    Type,
    Workflow,
    Writer,
)

# -- User models. --


class UserState(Model):
    # Map from the user-given wiki name (e.g., "my wiki" or
    # "team foo wiki") to the Wiki's opaque state ID. The
    # name is how the user refers to the wiki; the state ID
    # is what Reboot needs to address it.
    wikis: dict[str, str] = Field(tag=1, default_factory=dict)


class UserCreateWikiRequest(Model):
    name: str = Field(tag=1)
    description: str = Field(tag=2)


class UserCreateWikiResponse(Model):
    wiki_id: str = Field(tag=1)


class WikiSummary(Model):
    wiki_id: str = Field(tag=1)
    name: str = Field(tag=2)
    description: str = Field(tag=3)


class UserListWikisResponse(Model):
    wikis: list[WikiSummary] = Field(tag=1, default_factory=list)


# -- Wiki models. --


class WikiState(Model):
    name: str = Field(tag=1, default="")
    description: str = Field(tag=2, default="")
    # Markdown body of the Wiki. All structure within the
    # wiki — table of contents, cross-references, links to
    # pages or transcripts — lives inside this markdown, not
    # in separate structured fields. Links to other state
    # instances are embedded as URIs of the form
    # `<StateType>:<state_id>`, for example `Page:abc123`
    # or `Transcript:xyz789`. To follow a link, call the
    # corresponding type with the referenced state ID
    # (e.g., `Page.get` on `abc123`).
    content: str = Field(tag=4, default="")
    # Map from the ID of a Transcript added to this Wiki to
    # whether that Transcript has been ingested by the
    # librarian workflow (True) or is still pending (False).
    # The `ingest` workflow watches this map for pending
    # entries and folds each transcript's material into the
    # wiki's markdown `content` and into Pages it references.
    transcripts: dict[str, bool] = Field(tag=5, default_factory=dict)
    # The user ID of the user who owns this Wiki.
    owner_id: str = Field(tag=6)


class WikiCreateRequest(Model):
    name: str = Field(tag=1)
    description: str = Field(tag=2)
    owner_id: str = Field(tag=3)


class WikiGetResponse(Model):
    name: str = Field(tag=1)
    description: str = Field(tag=2)
    content: str = Field(tag=3)


class WikiUpdateRequest(Model):
    content: str = Field(tag=1)


class TranscriptMessage(Model):
    """A single message within a conversation Transcript."""
    # The name of whoever added this message, e.g., "user"
    # or "assistant".
    role: str = Field(tag=1)
    # The text content of the message.
    content: str = Field(tag=2)


class WikiAddTranscriptRequest(Model):
    messages: list[TranscriptMessage] = Field(tag=1, default_factory=list)


class WikiAddTranscriptResponse(Model):
    transcript_id: str = Field(tag=1)


# -- Page models. --


class PageState(Model):
    title: str = Field(tag=1, default="")
    # Markdown body of the Page. A page may draw material
    # from many Transcripts (or summaries of them); merge
    # that into this markdown as appropriate. Links to
    # other state instances are embedded as URIs of the
    # form `<StateType>:<state_id>`, for example
    # `Page:abc123` or `Transcript:xyz789`. To follow a
    # link, call the corresponding type with the referenced
    # state ID (e.g., `Page.get` on `abc123`).
    content: str = Field(tag=2, default="")
    # The user ID of the user who owns this Page.
    owner_id: str = Field(tag=3)


class PageCreateRequest(Model):
    title: str = Field(tag=1)
    content: str = Field(tag=2)
    owner_id: str = Field(tag=3)


class PageGetResponse(Model):
    title: str = Field(tag=1)
    content: str = Field(tag=2)


class PageUpdateRequest(Model):
    title: str = Field(tag=1)
    content: str = Field(tag=2)


# -- Transcript models. --


class TranscriptState(Model):
    messages: list[TranscriptMessage] = Field(tag=1, default_factory=list)
    # The user ID of the user who owns this Transcript.
    owner_id: str = Field(tag=2)


class TranscriptCreateRequest(Model):
    messages: list[TranscriptMessage] = Field(tag=1, default_factory=list)
    owner_id: str = Field(tag=2)


class TranscriptGetResponse(Model):
    messages: list[TranscriptMessage] = Field(tag=1, default_factory=list)


class TranscriptUpdateRequest(Model):
    messages: list[TranscriptMessage] = Field(tag=1, default_factory=list)


api = API(
    User=Type(
        state=UserState,
        methods=Methods(
            create_wiki=Transaction(
                request=UserCreateWikiRequest,
                response=UserCreateWikiResponse,
                description="Create a new Wiki under the "
                "given user-facing `name` (e.g., 'my'"
                "'wiki' or 'team foo wiki') with the "
                "given description. The name is recorded "
                "on the user as a mapping to the Wiki's "
                "opaque state ID so the wiki can be looked "
                "up by name later. The Wiki's body is a "
                "single markdown blob; any table of "
                "contents, cross-links, or structure you "
                "want lives inside that markdown and can "
                "be set later via `update`. Returns a "
                "`wiki_id` which is not human-readable but "
                "should be passed to future tool calls.",
                mcp=Tool(),
            ),
            list_wikis=Reader(
                request=None,
                response=UserListWikisResponse,
                description="List all wikis owned by this "
                "user. Returns `wiki_id`, name, and "
                "description for each. Use a `wiki_id` when "
                "calling other tools.",
                mcp=Tool(),
            ),
        ),
    ),
    Wiki=Type(
        state=WikiState,
        methods=Methods(
            show_wiki=UI(
                request=None,
                path="web/ui/wiki_view",
                title="Wiki",
                description="Open the Wiki viewer UI to "
                "render the Wiki's markdown body.",
            ),
            create=Writer(
                request=WikiCreateRequest,
                response=None,
                factory=True,
                mcp=None,
            ),
            get=Reader(
                request=None,
                response=WikiGetResponse,
                description="Get this Wiki's name, "
                "description, and markdown `content` body. "
                "The markdown is the only place structure "
                "lives: any table of contents or "
                "cross-references are embedded in it. "
                "Links to other state instances appear as "
                "URIs of the form `<StateType>:<state_id>`, "
                "e.g., `Page:abc123` or `Transcript:xyz789`. "
                "Follow any such link by calling that type "
                "with the referenced state ID — for "
                "example, call `Page.get` on `abc123` to "
                "read that page's markdown.",
                mcp=Tool(),
            ),
            update=Writer(
                request=WikiUpdateRequest,
                response=None,
                description="Replace this Wiki's markdown "
                "body with new content. Put the table of "
                "contents, cross-references, and any "
                "structure directly into the markdown. "
                "Link to other state instances (Pages, "
                "Transcripts, other Wikis) by writing "
                "URIs of the form `<StateType>:<state_id>`, "
                "e.g., `Page:abc123`. Readers follow those "
                "links by calling the named type with the "
                "embedded state ID.",
                mcp=Tool(),
            ),
            ingest=Workflow(
                request=None,
                response=None,
                description="Long-running librarian "
                "workflow scheduled once per Wiki. It "
                "watches the `transcripts` map on the "
                "Wiki for entries marked not-yet-ingested "
                "and, for each, runs an LLM agent that "
                "folds the transcript's material into the "
                "Wiki's markdown body and into Pages it "
                "references (updating existing pages and "
                "creating new ones as needed), then marks "
                "the transcript ingested. Not intended to "
                "be called directly by users.",
                mcp=None,
            ),
            add_transcript=Transaction(
                request=WikiAddTranscriptRequest,
                response=WikiAddTranscriptResponse,
                description="Add a conversation transcript "
                "to this Wiki by creating a new Transcript "
                "containing the given `messages` (a list "
                "of {role, content} entries capturing the "
                "conversation turn by turn) and recording "
                "it on the Wiki as not-yet-ingested. Any "
                "publicly available links referenced in "
                "the conversation — for example URLs to "
                "images — should be included verbatim in "
                "the message `content` so the librarian "
                "can see them. A transcript belongs to "
                "exactly one Wiki. The `ingest` workflow "
                "running on the Wiki will then fold the "
                "transcript's material into the Wiki's "
                "markdown `content` and into the Pages it "
                "references, and mark the transcript "
                "ingested when done. Returns the new "
                "`transcript_id`.",
                mcp=Tool(),
            ),
        ),
    ),
    Page=Type(
        state=PageState,
        methods=Methods(
            show_page=UI(
                request=None,
                path="web/ui/page_view",
                title="Page",
                description="Open the Page viewer UI to "
                "render the Page's markdown body.",
            ),
            create=Writer(
                request=PageCreateRequest,
                response=None,
                factory=True,
                mcp=None,
            ),
            get=Reader(
                request=None,
                response=PageGetResponse,
                description="Get this Page's title and "
                "markdown `content` body. The markdown is "
                "the only place structure lives; outbound "
                "links appear inline as URIs of the form "
                "`<StateType>:<state_id>`, e.g., "
                "`Page:abc123` or `Transcript:xyz789`. "
                "Follow any such link by calling that type "
                "with the referenced state ID — for "
                "example, call `Page.get` on `abc123` to "
                "read that page's markdown.",
                mcp=Tool(),
            ),
            update=Writer(
                request=PageUpdateRequest,
                response=None,
                description="Replace this page's title and "
                "markdown body. Renaming a page is fine — "
                "and expected — as its scope broadens to "
                "absorb new material. Put any outbound "
                "links directly into the markdown as URIs "
                "of the form `<StateType>:<state_id>`, "
                "e.g., `Page:abc123` or "
                "`Transcript:xyz789`. Readers follow those "
                "links by calling the named type with the "
                "embedded state ID.",
                mcp=Tool(),
            ),
        ),
    ),
    Transcript=Type(
        state=TranscriptState,
        methods=Methods(
            show_transcript=UI(
                request=None,
                path="web/ui/transcript_view",
                title="Transcript",
                description="Open the Transcript viewer "
                "UI to read the raw conversation "
                "transcript.",
            ),
            create=Writer(
                request=TranscriptCreateRequest,
                response=None,
                factory=True,
                mcp=None,
            ),
            get=Reader(
                request=None,
                response=TranscriptGetResponse,
                description="Get the list of `messages` "
                "that make up this Transcript. Each "
                "message has a `role` (the name of "
                "whoever added the message, e.g., `user` "
                "or `assistant`) and a `content` string.",
                mcp=Tool(),
            ),
            update=Writer(
                request=TranscriptUpdateRequest,
                response=None,
                description="Replace this Transcript's "
                "messages with a new list. Each message is "
                "a {role, content} entry. Any publicly "
                "available links referenced in the "
                "conversation — for example URLs to "
                "images — should be included verbatim in "
                "the message `content`.",
                mcp=Tool(),
            ),
        ),
    ),
)
