# AI Counter (Dashboard)

An MCP App built with Reboot that includes a parameterized
dashboard UI. Its React UIs run inside MCP clients.

## Quick Start

```bash
# Install Python dependencies.
uv sync

# Install web dependencies.
cd frontend && npm install && cd ..

# Generate API code.
uv run rbt generate

# Terminal 1: Start Vite dev server (for Hot Module Replacement), as
# https://frontend-mcp-app-counter-dashboard.localhost via portless
# (https://github.com/vercel-labs/portless): `npm run dev` is
# `portless frontend-mcp-app-counter-dashboard vite`, portless being a dev dependency. The
# backend needs the `portless` CLI too (`npm install -g portless`
# once) and its proxy (`portless proxy start`).
cd frontend && npm run dev

# Terminal 2: Start Reboot backend, as
# https://mcp-app-counter-dashboard.localhost.
uv run rbt dev run
```

For plain ports instead, run `cd frontend && npm run dev:ports` and
`uv run rbt dev run --config=ports`, and read `http://localhost:9991`
for the backend below.

## Testing with MCPJam Inspector

For testing with MCPJam Inspector:

```bash
# In another terminal, run MCPJam:
npx @mcpjam/inspector@2.23.3 --url https://mcp-app-counter-dashboard.localhost/mcp --oauth
```

This opens a browser-based inspector where you can test tools.

## Learn More

- [Reboot Documentation](https://docs.reboot.dev)
- [MCP Specification](https://modelcontextprotocol.io)
