# MCP App Counter

A minimal Reboot app exposed both as an MCP App *and* as a
standalone browser SPA. Both frontends share one
`Application(oauth=...)` configuration, one `User` actor per
upstream identity, and one set of servicers. A user signed in on
one frontend is automatically signed in on the other via shared
`rbt_session` cookies (cross-frontend SSO).

## Quick Start

```bash
# Install Python dependencies.
uv sync

# Install web dependencies.
cd frontend && npm install && cd ..

# Generate API code.
uv run rbt generate

# Terminal 1: Start Vite dev server (for Hot Module Replacement), as
# https://frontend-mcp-app-counter.localhost via portless
# (https://github.com/vercel-labs/portless): `npm run dev` is
# `portless frontend-mcp-app-counter vite`, portless being a dev dependency.
# The backend needs the `portless` CLI too (`npm install -g portless`
# once) and its proxy (`portless proxy start`).
cd frontend && npm run dev

# Terminal 2: Start Reboot backend, as https://mcp-app-counter.localhost,
# which serves the web app and the MCP Apps from that Vite.
uv run rbt dev run
```

For plain ports instead, run `cd frontend && npm run dev:ports` and
`uv run rbt dev run --config=ports`, and read `http://localhost:9991`
for the backend below.

## Using as a standalone web app

The same backend also serves a standalone browser SPA at
[`frontend/web/`](frontend/web/). It uses Reboot's unified
`oauth=...` flow: an HttpOnly `rbt_session` cookie carries the
same access JWT MCP clients send as `Authorization: Bearer`.

```bash
# Terminal 1: Reboot backend (same as for MCP).
uv run rbt dev run

# Terminal 2: Vite dev server — serves the MCP Apps and the SPA.
cd frontend && npm run dev
```

Open <https://mcp-app-counter.localhost/> (or <http://localhost:9991/>
without portless): `--web-app` has Envoy send `/` to the Vite dev
server, which serves the SPA there. Click sign-in, pick a
`Development` identity, land back on the SPA, and create counters.
If you also
launch MCPJam against the same backend, MCPJam's authorize step
short-circuits (no second IdP picker) because the browser already
holds a session cookie — same `User` actor, same counter list on
both frontends.

## Testing with MCPJam Inspector

For testing with MCPJam Inspector:

```bash
# In another terminal, run MCPJam:
npx @mcpjam/inspector@2.23.3 --url https://mcp-app-counter.localhost/mcp --oauth
```

This opens a browser-based inspector where you can test tools.

## Learn More

- [Reboot Documentation](https://docs.reboot.dev)
- [MCP Specification](https://modelcontextprotocol.io)
