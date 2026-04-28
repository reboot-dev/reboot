# Agent Wiki

An AI Chat App built with Reboot that provides a shared
knowledge base humans and AIs can both read from and write to.
Users hand in raw conversation `Transcript`s; a background
"librarian" agent progressively distills those transcripts into
a small, well-organized set of markdown `Page`s linked from the
`Wiki`'s own markdown body, which serves as a living table of
contents. Humans browse the result in embedded React UIs.

Inspired by Andrej Karpathy's "LLM Knowledge Bases" tweet:
https://x.com/karpathy/status/2039805659525644595

## State model

- **`Wiki`** — a knowledge base. Holds a `name`, a
  `description`, and a `content` field that is a single
  markdown blob. The table of contents, cross-references, and
  any other structure all live inside that markdown, not in
  separate fields. Links to other state instances are embedded
  as URIs of the form `<StateType>:<state_id>`, for example
  `Page:abc123` or `Transcript:xyz789`; a reader follows such a
  link by calling the referenced type's `get` method on the
  embedded state ID. The Wiki also holds a `transcripts` map
  from transcript ID to a bool flag indicating whether the
  librarian has ingested that transcript yet.
- **`Page`** — a unit of knowledge. Holds a `title` and a
  markdown `content` body. Pages are referenced from the wiki
  (and from one another) via `Page:<state_id>` URIs embedded in
  markdown.
- **`Transcript`** — a raw conversation, stored as a list of
  `{role, content}` messages. A transcript belongs to exactly
  one wiki.
- **`User`** — per-user state mapping user-given wiki names
  (e.g., `"team knowledge base"`) to opaque wiki state IDs, so
  wikis can be looked up by name later.

The cross-state operations are:

- `User.create_wiki` — creates a `Wiki` and records its state
  ID under the given name on the user. Also schedules the
  wiki's `ingest` workflow (see below).
- `Wiki.add_transcript` — creates a `Transcript` with the
  given messages and records it on the wiki as
  not-yet-ingested, which wakes the librarian.

Both are `Transaction`s so their state changes land atomically.

## The librarian

Every `Wiki` has a long-running `ingest` workflow scheduled at
creation time. That workflow is the **librarian**: a Pydantic
AI agent (see `backend/src/servicers/wiki.py`) whose job is to
watch the wiki's `transcripts` map for pending entries and, for
each one, fold its material into the wiki and its pages, then
mark it ingested.

The librarian is deliberately biased towards aggregation. Given
a new transcript, it prefers **renaming and broadening an
existing page** over creating a new one — so a page titled
"History of the Steam Engine" may grow into "History of
Inventions" and later into "History of Things" as more
transcripts arrive. The goal is a small, high-signal set of
pages, not one page per transcript.

The user-facing write path is therefore: call
`Wiki.add_transcript` with the conversation you want captured,
then let the librarian do the rest asynchronously.
`Wiki.update`, `Page.update`, and `Transcript.update` are
exposed too, but are intended mostly for the librarian (and
for manual fix-ups).

## Quick start

```bash
# Install Python dependencies and create the virtualenv.
rye sync
source .venv/bin/activate

# Install web dependencies.
cd web && npm install && cd ..

# Generate API code (Python + React bindings).
rbt generate

# Build the React UIs.
cd web && npm run build && cd ..
```

The librarian runs on Anthropic's Claude via Pydantic AI, so
the backend needs an Anthropic API key. For local development,
export it in your shell:

```bash
export ANTHROPIC_API_KEY=...
```

When deployed to Reboot Cloud, store the key as a Reboot
secret instead:

```bash
rbt cloud secret set --application-name=agent-wiki ANTHROPIC_API_KEY=sk-ant-...
```

Cloud injects each secret into the application's environment
under its given name, so naming the secret `ANTHROPIC_API_KEY`
is what the Anthropic SDK reads directly — the same code works
in both places.

Then run the app (each command in its own terminal, from the
project directory, with `.venv` activated):

```bash
# Terminal 1: start the Reboot backend.
rbt dev run

# Terminal 2: start the Vite dev server for Hot Module Replacement.
cd web && npm run dev
```

State persists between restarts under the name `agent-wiki`
(configured in `.rbtrc`). To wipe it:

```bash
rbt dev expunge --application-name=agent-wiki
```

## Running the tests

The backend has an in-process test suite that exercises the
servicers and the `Wiki.ingest` librarian workflow without
making any real Anthropic calls (the LLM is replaced by a
scripted Pydantic AI `FunctionModel`).

```bash
rye sync
source .venv/bin/activate
pytest backend/
```

## Testing with MCPJam Inspector

`mcp_servers.json` is pre-configured. In another terminal:

```bash
npx @mcpjam/inspector@v2.4.0 --config mcp_servers.json --server agent-wiki
```

Try these prompts to exercise each capability. The librarian
works asynchronously, so after an `add_transcript` call watch
the backend log for `librarian[...] tool call ...` lines to see
it read the wiki, decide where material belongs, and rewrite
pages.

1. `Create a wiki called "Team Knowledge Base" about
   engineering runbooks.` — exercises `create_wiki`, which
   also schedules the wiki's `ingest` workflow.
2. `List all my wikis.` — exercises `list_wikis`.
3. `Attach this conversation to the Team Knowledge Base as a
   transcript:` followed by a short back-and-forth about, say,
   pushing to main and smoke-testing the deploy — exercises
   `add_transcript`. The librarian will then create a page
   and edit the wiki's markdown to link to it.
4. `Show me the Team Knowledge Base.` — exercises `show_wiki`;
   the rendered markdown is the librarian's table of contents
   with `Page:<state_id>` links.
5. `Read the Team Knowledge Base.` — exercises `Wiki.get` and
   returns the raw markdown the UI renders.
6. `Follow the first page link in that wiki and show it to
   me.` — exercises `Page.get` (to read) and `show_page` (to
   render).
7. `Attach a second transcript about our rollback runbook:`
   followed by another conversation — exercises
   `add_transcript` again. The librarian should prefer
   **broadening the existing page** (e.g., renaming it to
   "Deploy and Rollback Process") rather than creating a new
   one.
8. `Show me the raw transcript we attached first.` — exercises
   `Transcript.get` and `show_transcript`.

## Project layout

```
agent-wiki/
├── api/agent_wiki/v1/wiki.py   # State models + method declarations.
├── backend/
│   ├── api/                    # Generated Python bindings.
│   └── src/
│       ├── main.py             # Application entrypoint.
│       └── servicers/wiki.py   # User/Wiki/Page/Transcript servicers
│                               # plus the Pydantic AI librarian agent.
└── web/
    ├── api/                    # Generated React bindings.
    └── ui/
        ├── wiki_view/          # Renders a Wiki's markdown body.
        ├── page_view/          # Renders a Page's markdown body.
        ├── transcript_view/    # Renders a raw Transcript.
        └── _shared/            # Shared UI helpers (markdown, etc.).
```

## Learn more

- [Reboot Documentation](https://docs.reboot.dev)
- [MCP Specification](https://modelcontextprotocol.io)
