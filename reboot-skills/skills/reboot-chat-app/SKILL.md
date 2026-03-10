---
name: reboot-chat-app
description: Use Reboot to build AI Chat Apps (MCP Apps) for ChatGPT, Claude, VSCode, Goose, and others.
argument-hint: [<app-description>]
# Scaffolding requires file creation, shell commands (uv, npm,
# rbt), and code edits across ~15 files.
allowed-tools: Bash, Read, Write, Glob, Grep, Edit
---

# /reboot-chat-app — Build Reboot AI Chat Apps

Build complete Reboot AI Chat Apps from a user description.

## Installation

### From GitHub

Add the Reboot skills marketplace and install the plugin:

```bash
# 1. Add the marketplace (one-time).
claude plugin marketplace add reboot-dev/reboot-skills

# 2. Install the plugin.
claude plugin install reboot-chat-app@reboot-skills
```

If you install the plugin within `claude` with `/plugin` you need to restart for
the configuration and skill to load correctly.

Or add to your project's `.claude/settings.json` so teammates
are automatically offered the plugin on first use:

```json
{
  "extraKnownMarketplaces": {
    "reboot-skills": {
      "source": {
        "source": "github",
        "repo": "reboot-dev/reboot-skills"
      }
    }
  },
  "enabledPlugins": {
    "reboot-chat-app@reboot-skills": true
  }
}
```

### Local (repo checked out)

If you have the `reboot-skills` repo cloned locally:

```bash
claude --plugin-dir /path/to/reboot-skills
```

## When to Use

- Building a new Reboot AI Chat App from a description
- Adding features, state, or UI to an existing Reboot AI Chat App
- Modifying state model, methods, or React UI in a Reboot AI Chat App

## Workflow: Plan First, Then Build

**Always enter plan mode before writing code.** The state model is
the foundation — getting entities, field types, or method types
wrong means regenerating everything across 12+ files.

### Plan Phase

1. Analyze the user's description using the State Model Assessment
   below
2. Enter plan mode (`EnterPlanMode`)
3. Present the proposed design:
   - Session type and its methods (as the MCP front door to the
     application types discussed below, creating new ones and
     locating existing ones)
   - Application types: state shape (fields, types, tags)
   - Method map: which operations, which method type (Reader/
     Writer/Transaction/Workflow), which get UI()
   - Tool surface: what the AI will see as callable tools
4. Get user approval before writing any files
5. Then execute the Step-by-Step Build Flow

For updates to existing apps, still plan: read current state, propose
changes, confirm, then modify.

## State Model Assessment

Before writing code, analyze the user's request:

1. **Application types**: What primary things is the user managing?
   (counter, inventory, chat thread, etc.) Each becomes
   its own `Type` with its own state.
2. **Session methods**: How does the AI create instances of
   application types? Each gets a `Transaction` on `Session`
   that calls `<Type>.create(context)`.
3. **State shape**: Fields, types — lists, nested objects,
   primitives. Each gets `Field(tag=N)`.
4. **Operations**: Map to the right method type:
   - `Reader` — read-only queries
   - `Writer` — single-state mutations
   - `Transaction` — multi-state atomic operations (e.g.,
     transfer between two accounts, or Session creating an
     application type instance)
   - `Workflow` — long-running control flows with loops,
     scheduling, and idempotency helpers
5. **Tool surface**: Which operations need UIs (`UI()`)?
   Which need explicit tool exposure (`mcp=Tool()`)?
6. **Identity**: Single default instance vs multiple instances?
7. **Cross-state coordination**: Does any operation touch
   multiple state instances? If yes, use `Transaction`.

## Key Framework Concepts

### Session and Application Types

Every AI Chat App has a `Session` type and one or more application
types:

- **`Session`** is auto-constructed for each AI chat session. Its
  state is typically empty. Its methods are `Transaction`s that
  create instances of application types, or `Reader`s that find
  the IDs of existing application type instances in indexes that
  have well-known IDs of their own. `Session` methods are
  automatically exposed as MCP tools.
- **Application types** (e.g., `Counter`) hold the
  actual application state. They need a `create` Writer with
  `factory=True` for construction. Their methods require explicit
  `mcp=Tool()` to be AI-callable.

### Tool Exposure Control

- **Session methods are tools by default.** All methods on
  `Session` are automatically callable by the AI.
- **`mcp=False`**: Opt a Session method OUT of being AI-callable.
  Use for human-only actions or to reduce context bloat.
- **`mcp=Tool()`**: Opt an application type method IN to being
  AI-callable. Required on methods of non-Session types.
- **`Tool()` options**: `Tool(name="custom_name", title="Title")`
  to override the default tool name or add a human-readable title.

### Method Types

- **`UI()`**: Opens a React UI in the AI chat interface. Takes
  `request=` (config type or `None`), `path=` (web dir relative
  to project root), `title=`, `description=`. No servicer
  implementation needed — the React app IS the implementation.
  When `request=` is a Model type, its fields are passed to the
  React component as props.
- **`Writer`**: Single-state mutations. Context: `WriterContext`.
  Use `factory=True` on the `create` method of application types.
- **`Reader`**: Read-only queries. Context: `ReaderContext`.
- **`Transaction`**: Multi-state atomic operations. Context:
  `TransactionContext`. Use when an operation must modify multiple
  state instances atomically, or when Session creates application
  type instances.
- **`Workflow`**: Long-running control flows. Context:
  `WorkflowContext`. Implemented as `@classmethod` (not instance
  method). Support `context.loop()` for periodic/reactive loops,
  scheduling with `timedelta`, and idempotency helpers.

### Declarative, Not Decorator

All MCP surface is defined in the API file. `main.py` is minimal.
No `@mcp.tool()` decorators.

### State is Durable

State survives restarts. Set `dev run --name=<name>` in `.rbtrc` to
persist across dev restarts. Use `uv run rbt dev expunge --name=<name>` to reset.

## Project Structure

```
<project>/
├── .python-version          # "3.10"
├── .rbtrc                   # Line-based config (NOT YAML!)
├── pyproject.toml           # Python deps (uv)
├── api/
│   └── <pkg>/v1/
│       └── <name>.py        # API definition
├── backend/
│   └── src/
│       ├── main.py          # Application entrypoint
│       └── servicers/
│           └── <name>.py    # Servicer implementation
└── web/
    ├── package.json
    ├── tsconfig.json
    ├── tsconfig.app.json
    ├── tsconfig.node.json
    ├── vite.config.ts
    ├── index.css            # Theme variables
    └── ui/
        └── <ui-name>/
            ├── index.html
            ├── main.tsx     # RebootClientProvider entry
            ├── App.tsx      # React component
            └── App.module.css
```

## Step-by-Step Build Flow

**Only execute after plan approval. All commands run from the
application directory.**

1. Create `.python-version`, `pyproject.toml`, `.rbtrc`
2. `uv sync`
3. Write API definition (`api/<pkg>/v1/<name>.py`)
4. `uv run rbt generate`
5. Write servicer (`backend/src/servicers/<name>.py`)
6. Write `main.py`
7. Scaffold web: `package.json`, tsconfigs, `vite.config.ts`,
   `index.css`
8. `cd web && npm install`
9. `uv run rbt generate` (React bindings need `node_modules`)
10. Write React: `index.html`, `main.tsx`, `App.tsx`,
    `App.module.css`
11. `cd web && npm run build`
12. Create `mcp_servers.json` with
    `{"mcpServers":{"<name>":{"type":"streamable-http","url":"http://localhost:9991/mcp"}}}`
13. **STOP.** Do NOT run the app yourself. Print the
    following run instructions exactly, then wait:

    ```
    To run (each in a separate terminal, from the project directory):

      uv run rbt dev run          # start backend
      cd web && npm run dev        # HMR frontend (separate terminal)

    To test with MCP inspector (separate terminal):

      npx @mcpjam/inspector@v2.0.4 --config mcp_servers.json --server <name>
    ```

    Replace `<name>` with the actual server name from
    `mcp_servers.json`. Then suggest a first prompt the user
    can try in the inspector (e.g., "Create a new todo list
    and show it to me").

## Inline Patterns

All patterns below are complete and copy-paste-ready. Replace
`<project-name>`, `<pkg>`, `<name>`, `<ui-name>` with actual values.

### `.python-version`

```
3.10
```

### `.rbtrc`

Line-based config. NOT YAML!

```
# Find API definitions in 'api/'.
generate api/

# Tell `rbt generate` where to put generated files.
generate --python=backend/api/

# Generate React bindings for web apps (into "web/api/").
generate --react=web/api
generate --react-extensions

# Watch if any source files are modified.
dev run --watch=backend/**/*.py

# Tell `rbt` that this is a Python application.
dev run --python

# Save state between restarts.
dev run --name=<project-name>

# Run the application!
dev run --application=backend/src/main.py

# Default to HMR mode when no --config is specified.
dev run --default-config=hmr

# Hot Module Replacement (HMR): Vite dev server proxied through Envoy.
# Run Vite in a separate terminal: cd web && npm run dev
# Envoy routes "/__/web/**" to Vite for HMR support.
dev run:hmr --mcp-frontend-host=http://localhost:4444

# Dist mode: serve pre-built artifacts from "web/dist/" (no Vite HMR).
# Usage: uv run rbt dev run --config=dist
# Requires: cd web && npm run build
dev run:dist --mcp-frontend-host=""

# When expunging, expunge that state we've saved.
dev expunge --name=<project-name>
```

### `pyproject.toml`

```toml
[project]
name = "<project-name>"
version = "0.1.0"
requires-python = ">= 3.10"
dependencies = [
    "httpx>=0.27,<1.0",
    "uuid7>=0.1.0",
    "anyio>=4.0.0",
    "reboot>=0.45.2",
]

[tool.rye]
dev-dependencies = [
    "mypy==1.18.1",
    "types-protobuf>=4.24.0.20240129",
    "reboot>=0.45.2",
]

virtual = true
managed = true
```

### API Definition (`api/<pkg>/v1/<name>.py`)

Rules:

- Import only the method types you use from `reboot.api`
- Helper Model types as standalone classes
- State model with `Field(tag=N)` on every field
- `Session` type with empty state and `Transaction` methods
  that create application type instances
- Application types with their own state and methods
- Application type methods need `mcp=Tool()` to be AI-callable
- Application types need a `create` Writer with `factory=True`
- `api = API(Session=Type(...), <AppType>=Type(...))`

#### Simple Example (Counter)

```python
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
    Writer,
)


# -- Session models. --


class CreateCounterResponse(Model):
    counter_id: str = Field(tag=1)


class SessionState(Model):
    pass


# -- Counter models. --


class CounterState(Model):
    value: int = Field(tag=1, default=0)


class ValueResponse(Model):
    value: int = Field(tag=1)


class AmountRequest(Model):
    """Request with an amount parameter."""
    amount: int = Field(tag=1)


api = API(
    Session=Type(
        state=SessionState,
        methods=Methods(
            create_counter=Transaction(
                request=None,
                response=CreateCounterResponse,
                description="Create a new Counter. Returns "
                "the ID of the new counter. That ID is not "
                "human-readable; pass it to future tool "
                "calls where needed, but no need to tell "
                "the human what it is.",
            ),
        ),
    ),
    Counter=Type(
        state=CounterState,
        methods=Methods(
            show_clicker=UI(
                request=None,
                path="web/ui/clicker",
                title="Counter Clicker",
                description="Interactive clicker UI for "
                "the counter.",
            ),
            create=Writer(
                request=None,
                response=None,
                factory=True,
            ),
            get=Reader(
                request=None,
                response=ValueResponse,
                description="Get the current counter value.",
                mcp=Tool(),
            ),
            increment=Writer(
                request=AmountRequest,
                response=None,
                description="Increment the counter by the "
                "specified amount.",
                mcp=Tool(),
            ),
            decrement=Writer(
                request=AmountRequest,
                response=None,
                description="Decrement the counter by the "
                "specified amount.",
                mcp=Tool(),
            ),
        ),
    ),
)
```

#### Parameterized UI Example

When the AI should pass parameters to a React UI (e.g., a
personalized message or configuration), use `request=` with a
Model type. The fields become React component props:

```python
class DashboardConfig(Model):
    """Configuration passed by the AI."""
    personalized_message: str = Field(tag=1)


# In the application type's Methods():
show_dashboard=UI(
    # The AI provides a DashboardConfig when opening this UI.
    # The fields are passed to the React component as props.
    request=DashboardConfig,
    path="web/ui/dashboard",
    title="Counter Dashboard",
    description="Dashboard UI. Use `personalized_message` to "
    "impart wisdom on the topic of counting things.",
),
```

The React component receives the config fields as props:

```tsx
import {
  type DashboardConfig,
  useCounter,
} from "@api/<pkg>/v1/<name>_rbt_react";

export const DashboardApp: FC<DashboardConfig> = ({ personalizedMessage }) => {
  const counter = useCounter();
  const { response } = counter.useGet();
  // personalizedMessage is available as a prop.
  return (
    <div>
      {personalizedMessage}: {response?.value ?? 0}
    </div>
  );
};
```

#### mcp=False Example

Hide a method from the AI (e.g., for human-only actions):

```python
# In an application type's Methods():
# Only callable from the React UI, not by the AI.
confirm_dangerous_action=Writer(
    request=ConfirmRequest,
    response=None,
    description="Confirm a dangerous action.",
    mcp=False,
),
```

#### List State Patterns

For application types with list-based state (items, entries,
messages, etc.):

- Define helper Model types as standalone classes (e.g.,
  `class Item(Model)`) — NOT nested on the application type
- Use `list[Item]` in the state with `default_factory=list`
- Add CRUD Writers: add, remove, toggle, reorder as needed
- Each Writer validates indices before mutating
- The `reorder` pattern uses `pop` + `insert`
- In the servicer, import helpers standalone:
  `from <pkg>.v1.<name> import Item`

The counter example above shows the full Session + application
type pattern. Apply the same structure for any application type,
adding whatever Writers and Readers your app needs.

#### Workflow Example (Long-Running)

Use `Workflow` for periodic or long-running operations:

```python
from reboot.api import (
    API,
    Field,
    Methods,
    Model,
    Tool,
    Type,
    Workflow,
)


class DoPingPeriodicallyRequest(Model):
    num_pings: int = Field(tag=1)
    period_seconds: float = Field(tag=2)


class DoPingPeriodicallyResponse(Model):
    num_pings: int = Field(tag=1)


# In an application type's Methods():
do_ping_periodically=Workflow(
    request=DoPingPeriodicallyRequest,
    response=DoPingPeriodicallyResponse,
)
```

### Servicer (`backend/src/servicers/<name>.py`)

Rules:

- Import helper types standalone:
  `from <pkg>.v1.<name> import MyItem`
- Import generated classes:
  `from <pkg>.v1.<name>_rbt import Session, Counter`
- Each type gets its own servicer class
  (e.g., `SessionServicer`, `CounterServicer`)
- `Session.Servicer` / `Counter.Servicer` base, `allow()` authorizer
- Context types from `reboot.aio.contexts`:
  - `ReaderContext` — read-only
  - `WriterContext` — single-state mutation
  - `TransactionContext` — multi-state atomic
  - `WorkflowContext` — long-running (`@classmethod`)
- Access state via `self.state.<field>`
- Request types: `Counter.XxxRequest`,
  response: `Counter.XxxResponse`

#### Simple Servicer (Counter)

```python
from ai_chat_counter.v1.counter_rbt import Counter, Session
from reboot.aio.auth.authorizers import allow
from reboot.aio.contexts import (
    ReaderContext,
    TransactionContext,
    WriterContext,
)


class SessionServicer(Session.Servicer):

    def authorizer(self):
        return allow()

    async def create_counter(
        self,
        context: TransactionContext,
    ) -> Session.CreateCounterResponse:
        """Create a new Counter and return its ID."""
        counter, _ = await Counter.create(context)
        return Session.CreateCounterResponse(
            counter_id=counter.state_id,
        )


class CounterServicer(Counter.Servicer):

    def authorizer(self):
        return allow()

    async def create(self, context) -> None:
        # State is initialized with defaults; nothing to do.
        pass

    async def increment(
        self,
        context: WriterContext,
        request: Counter.IncrementRequest,
    ) -> None:
        self.state.value += request.amount

    async def decrement(
        self,
        context: WriterContext,
        request: Counter.DecrementRequest,
    ) -> None:
        self.state.value -= request.amount

    async def get(
        self,
        context: ReaderContext,
    ) -> Counter.GetResponse:
        return Counter.GetResponse(value=self.state.value)
```

#### Workflow Servicer

Workflow methods are `@classmethod` — no `self.state` access:

```python
from datetime import timedelta
from reboot.aio.contexts import WorkflowContext

# In the application type's servicer:
@classmethod
async def do_ping_periodically(
    cls,
    context: WorkflowContext,
    request: MyType.DoPingPeriodicallyRequest,
) -> MyType.DoPingPeriodicallyResponse:
    async for iteration in context.loop(
        "Ping periodically",
        interval=timedelta(seconds=request.period_seconds),
    ):
        await MyType.ref().do_ping(context)
        pings_sent = iteration + 1  # iteration starts at 0
        if pings_sent >= request.num_pings:
            break

    state = await MyType.ref().read(context)
    return MyType.DoPingPeriodicallyResponse(
        num_pings=state.num_pings,
    )
```

### `main.py`

Register all servicers (Session + application types):

```python
import asyncio
import logging
from reboot.aio.applications import Application
from servicers.<name> import (
    CounterServicer,
    SessionServicer,
)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)


async def main() -> None:
    application = Application(
        servicers=[SessionServicer, CounterServicer],
    )
    await application.run()


if __name__ == "__main__":
    asyncio.run(main())
```

### `web/package.json`

```json
{
  "name": "<project-name>-web",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build:<ui-name>": "vite build --mode <ui-name>",
    "build:watch:<ui-name>": "vite build --mode <ui-name> --watch",
    "build": "tsc --noEmit && npm run build:<ui-name>",
    "build:watch": "concurrently \"npm:build:watch:*\""
  },
  "dependencies": {
    "@modelcontextprotocol/ext-apps": "^1.0.1",
    "@modelcontextprotocol/sdk": "^1.26.0",
    "@reboot-dev/reboot-react": "^0.45.2",
    "@reboot-dev/reboot-api": "^0.45.2",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "zod": "^3.25.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.67",
    "@types/react-dom": "^18.2.22",
    "@vitejs/plugin-react": "^4.7.0",
    "concurrently": "^9.1.2",
    "typescript": "^5.9.2",
    "vite": "^6.3.5",
    "vite-plugin-singlefile": "^2.0.3"
  }
}
```

For multiple UIs, add `build:<name>` and `build:watch:<name>` entries
for each UI, and update the `build` script to chain them:

```
"build": "tsc --noEmit && npm run build:ui1 && npm run build:ui2"
```

### `web/vite.config.ts`

```typescript
// Vite configuration for Reboot UIs.
import fs from "fs";
import path from "path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

// Auto-discover UIs from ui/ directory.
const uiDir = path.resolve(__dirname, "ui");
const uis: Record<string, { input: string; output: string }> =
  Object.fromEntries(
    fs
      .readdirSync(uiDir)
      .filter((d) => fs.existsSync(path.join(uiDir, d, "index.html")))
      .map((name) => [
        name,
        { input: `ui/${name}/index.html`, output: `${name}.html` },
      ])
  );

export default defineConfig(({ command, mode }) => {
  // Path alias for API imports (@api/... -> ./api/...).
  const resolve = {
    alias: {
      "@api": path.resolve(__dirname, "./api"),
    },
    dedupe: ["react", "react-dom", "zod"],
  };

  // Dev server configuration.
  //
  // UIs use a double iframe architecture:
  //   MCP Host -> srcdoc (origin=null) -> iframe (origin=localhost:9991)
  //
  // The inner iframe loads from Envoy ("/__/web/**"), which proxies
  // to Vite. Because the inner iframe has a real origin, Vite's URLs
  // work normally. `base: "/__/web/"` ensures all paths route through
  // Envoy.
  //
  // Hot Module Replacement works automatically: Vite's client connects
  // to the page's origin, and Envoy proxies WebSocket upgrades to
  // Vite. This also works with tunnels (ngrok) since the tunnel
  // points to Envoy.
  if (command === "serve") {
    const port = parseInt(process.env.RBT_VITE_PORT || "4444", 10);

    return {
      plugins: [react()],
      root: ".",
      resolve,
      base: "/__/web/",
      server: {
        port,
        strictPort: true,
        // Listen on all interfaces since requests come through
        // Envoy (and tunnels).
        host: true,
        allowedHosts: true,
      },
    };
  }

  // Build mode: `vite build --mode <ui-name>`
  const ui = uis[mode];
  if (!ui) {
    const valid = Object.keys(uis).join(", ");
    throw new Error(`Unknown UI: ${mode}. Use --mode with: ${valid}`);
  }

  return {
    plugins: [react(), viteSingleFile()],
    build: {
      outDir: "dist",
      emptyOutDir: false,
      assetsInlineLimit: 100000000,
      cssCodeSplit: false,
      rollupOptions: {
        input: ui.input,
        output: {
          inlineDynamicImports: true,
          entryFileNames: ui.output.replace(".html", ".js"),
          assetFileNames: ui.output.replace(".html", ".[ext]"),
        },
      },
    },
    resolve,
  };
});
```

### `web/tsconfig.json`

```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ]
}
```

### `web/tsconfig.app.json`

```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.app.tsbuildinfo",
    "target": "ES2022",
    "useDefineForClassFields": true,
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "baseUrl": ".",
    "paths": {
      "@api/*": ["./api/*"]
    }
  },
  "include": ["ui"]
}
```

### `web/tsconfig.node.json`

```json
{
  "compilerOptions": {
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.node.tsbuildinfo",
    "target": "ES2023",
    "lib": ["ES2023"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["vite.config.ts"]
}
```

### `web/index.css`

```css
:root {
  --color-bg: #1a1a2e;
  --color-bg-dark: #0f0f1a;
  --color-border: #2d2d4a;
  --color-text: #e0e0e0;
  --color-text-muted: #888899;
  --color-green: #4ade80;
  --color-blue: #60a5fa;
  --color-yellow: #fbbf24;
  --color-pink: #f472b6;
  --color-purple: #a78bfa;
  --color-orange: #fb923c;
  --font-mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas,
    monospace;
}

[data-theme="light"] {
  --color-bg: #f8f9fa;
  --color-bg-dark: #e9ecef;
  --color-border: #dee2e6;
  --color-text: #212529;
  --color-text-muted: #6c757d;
  --color-green: #16a34a;
  --color-blue: #2563eb;
  --color-yellow: #ca8a04;
  --color-pink: #db2777;
  --color-purple: #7c3aed;
  --color-orange: #ea580c;
}

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

body {
  font-family: var(--font-mono);
  background: var(--color-bg);
  color: var(--color-text);
}
```

### `web/ui/<ui-name>/index.html`

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title><UI Title></title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

### `web/ui/<ui-name>/main.tsx`

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RebootClientProvider } from "@reboot-dev/reboot-react";
import { ClickerApp } from "./App";
import "../../index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RebootClientProvider>
      <ClickerApp />
    </RebootClientProvider>
  </StrictMode>
);
```

### `web/ui/<ui-name>/App.tsx`

Generated hook usage — `use<Type>()` returns reader hooks and
mutation functions. Both reads and writes go directly to the
Reboot backend:

```tsx
import { useCounter } from "@api/<pkg>/v1/<name>_rbt_react";

// useCounter() connects to the Counter state instance.
const counter = useCounter();

// Reader (WebSocket subscription, auto-updates):
const { response, isLoading } = counter.useGet();
const value = response?.value ?? 0;

// Writer (direct call to Reboot backend):
await counter.increment({ amount: 1 });
```

For list state, the same pattern applies — use the generated
hook for the application type and call its methods:

```tsx
// Python from_index -> TypeScript fromIndex (camelCase)
await myType.reorderItem({ fromIndex: 0, toIndex: 1 });
await myType.addItem({ text: "New item" });
```

#### Full Counter App.tsx Example

```tsx
import { useEffect, useRef, useState, type FC } from "react";
import { useCounter } from "@api/ai_chat_counter/v1/counter_rbt_react";
import css from "./App.module.css";

export const ClickerApp: FC = () => {
  const [isPending, setIsPending] = useState(false);
  const counter = useCounter();
  const { response, isLoading } = counter.useGet();

  const prevValueRef = useRef<number | null>(null);
  const [trend, setTrend] = useState<"up" | "down" | "same" | null>(null);

  const value = response?.value ?? 0;

  useEffect(() => {
    if (response?.value !== undefined) {
      if (prevValueRef.current !== null) {
        if (response.value > prevValueRef.current) {
          setTrend("up");
        } else if (response.value < prevValueRef.current) {
          setTrend("down");
        } else {
          setTrend("same");
        }
      }
      prevValueRef.current = response.value;
    }
  }, [response?.value]);

  const handleIncrement = async () => {
    setIsPending(true);
    try {
      await counter.increment({ amount: 1 });
    } finally {
      setIsPending(false);
    }
  };

  const handleDecrement = async () => {
    setIsPending(true);
    try {
      await counter.decrement({ amount: 1 });
    } finally {
      setIsPending(false);
    }
  };

  const trendIcon = trend === "up" ? "↑" : trend === "down" ? "↓" : "→";
  const trendClass =
    trend === "up" ? css.trendUp : trend === "down" ? css.trendDown : "";

  if (isLoading && response === undefined) {
    return (
      <div className={css.container}>
        <div className={css.loading}>loading...</div>
      </div>
    );
  }

  return (
    <div className={css.container}>
      <div className={css.row}>
        <button
          onClick={handleDecrement}
          disabled={isPending}
          className={css.buttonDecrement}
        >
          −
        </button>
        <div className={css.valueGroup}>
          <div
            className={`${css.counter} ${trendClass} ${
              isPending ? css.pending : ""
            }`}
          >
            {value}
          </div>
          {trend && (
            <span className={`${css.trend} ${trendClass}`}>{trendIcon}</span>
          )}
        </div>
        <button
          onClick={handleIncrement}
          disabled={isPending}
          className={css.buttonIncrement}
        >
          +
        </button>
      </div>
      <span className={`${css.syncStatus} ${isPending ? css.visible : ""}`}>
        syncing...
      </span>
    </div>
  );
};
```

### `web/ui/<ui-name>/App.module.css`

```css
.container {
  background: var(--color-bg);
  color: var(--color-text);
  font-family: var(--font-mono);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px 20px 16px;
  gap: 12px;
}

.row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.valueGroup {
  display: flex;
  align-items: baseline;
  gap: 4px;
  min-width: 80px;
  justify-content: center;
}

.counter {
  font-size: 36px;
  font-weight: bold;
  color: var(--color-text);
  transition: color 0.15s ease, opacity 0.15s ease;
}

.counter.pending {
  opacity: 0.7;
}

.counter.trendUp {
  color: var(--color-green);
  text-shadow: 0 0 12px rgba(74, 222, 128, 0.25);
}

.counter.trendDown {
  color: var(--color-pink);
  text-shadow: 0 0 12px rgba(244, 114, 182, 0.25);
}

.trend {
  font-size: 18px;
  font-weight: bold;
  transition: color 0.15s ease;
}

.trendUp {
  color: var(--color-green);
}

.trendDown {
  color: var(--color-pink);
}

.button {
  width: 40px;
  height: 40px;
  font-size: 20px;
  font-family: var(--font-mono);
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.buttonIncrement {
  composes: button;
  background: var(--color-green);
  color: var(--color-bg-dark);
}

.buttonDecrement {
  composes: button;
  background: var(--color-pink);
  color: var(--color-bg-dark);
}

.syncStatus {
  color: var(--color-yellow);
  font-size: 11px;
  height: 14px;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.syncStatus.visible {
  opacity: 1;
}

.loading {
  color: var(--color-text-muted);
  font-size: 12px;
}
```

Adapt the CSS module to your app's needs. The CSS variables from
`index.css` provide consistent theming.

## Critical Gotchas

1. **`.rbtrc` is line-based, NOT YAML.** Each line is a command with
   flags. Comments start with `#`.
2. **No `__init__.py` in `api/` directories.** The generator scans
   all `.py` files; `__init__.py` causes conflicts.
3. **`Field(tag=N)` required on every field.** Tags must be unique
   within each Model class. Start at 1.
4. **Helper Model types are standalone imports:**
   `from <pkg>.v1.<name> import MyItem` —
   NOT `Counter.MyItem` (that doesn't exist).
5. **Generated class only has:** `.State`, `.Servicer`,
   `.XxxRequest`, `.XxxResponse`.
6. **React bindings use camelCase:** Python `from_index` becomes
   TypeScript `fromIndex`.
7. **`Session` methods are auto-exposed as MCP tools.** Application
   type methods require explicit `mcp=Tool()`. Use `mcp=False` to
   hide a method from the AI.
8. **Application types need `factory=True`** on their `create`
   Writer method.
9. **`npm install` before second `rbt generate`** — React bindings
   need `node_modules` to exist.
10. **Generated React hook:** `use<TypeName>()` — e.g.,
    `useCounter()`, `useInventory()`, etc.
11. **Generated React import path:**
    `@api/<pkg>/v1/<name>_rbt_react`
12. **Generated Python import path:**
    `from <pkg>.v1.<name>_rbt import Session, Counter`
13. **Use `--default-config=hmr`** in `.rbtrc` (not `--default=hmr`).
14. **`UI(path="web/ui/<name>")`** — path is relative to project root.
15. **`UI(request=<ConfigType>)`** passes config as React component
    props. `UI(request=None)` passes no props.
16. **Register all servicers** in `main.py`:
    `Application(servicers=[SessionServicer, CounterServicer])`.
17. The requests and responses on the frontend are always Zod types
    generated from the Python Models.

## Update Flow

When modifying an existing app:

1. Read `.rbtrc`, API definition, servicer, `main.py`
2. Assess state model changes
3. Update API definition -> re-run `uv run rbt generate`
4. Update servicer methods
5. Update React components
6. `cd web && npm run build`
