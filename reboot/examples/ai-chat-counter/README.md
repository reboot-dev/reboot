# AI Chat Counter

A minimal Reboot app exposed both as an MCP chat app *and* as a
standalone browser SPA. Both surfaces share one
`Application(oauth=...)` configuration, one `User` actor per
upstream identity, and one set of servicers. A user signed in on
one surface is automatically signed in on the other via shared
`rbt_session` cookies (cross-surface SSO).

## Quick Start

```bash
# Install Python dependencies.
uv sync

# Install web dependencies.
cd frontend && npm install && cd ..

# Generate API code.
uv run rbt generate

# Terminal 1: Start Vite dev server (for Hot Module Replacement).
cd frontend && npm run dev

# Terminal 2: Start Reboot backend.
uv run rbt dev run
```

## Using as a standalone web app

The same backend also serves a standalone browser SPA at
[`frontend/web/`](frontend/web/). It uses Reboot's unified
`oauth=...` flow: an HttpOnly `rbt_session` cookie carries the
same access JWT MCP clients send as `Authorization: Bearer`.

```bash
# Terminal 1: Reboot backend (same as for MCP).
uv run rbt dev run

# Terminal 2: Vite dev server — serves the MCP UIs and the SPA.
cd frontend && npm run dev
```

Open <http://localhost:4444/__/frontend/web/>. Click sign-in, pick a `Development`
identity, land back on the SPA, and create counters. If you also
launch MCPJam against the same backend, MCPJam's authorize step
short-circuits (no second IdP picker) because the browser already
holds a session cookie — same `User` actor, same counter list on
both surfaces.

## Testing with MCPJam Inspector

For testing with MCPJam Inspector:

```bash
# In another terminal, run MCPJam:
npx @mcpjam/inspector@2.23.3 --url http://localhost:9991/mcp --oauth
```

This opens a browser-based inspector where you can test tools.

## Learn More

- [Reboot Documentation](https://docs.reboot.dev)
- [MCP Specification](https://modelcontextprotocol.io)
