# AI Counter (Dashboard)

An AI Chat App built with Reboot that includes a parameterized
dashboard UI. Includes React UIs that run inside AI chat
interfaces via MCP.

## Quick Start

```bash
# Install Python dependencies.
uv sync

# Install web dependencies.
cd web && npm install && cd ..

# Generate API code.
uv run rbt generate

# Terminal 1: Start Vite dev server (for Hot Module Replacement).
cd web && npm run dev

# Terminal 2: Start Reboot backend.
uv run rbt dev run
```

## Testing with MCPJam Inspector

The project includes `mcp_servers.json` for testing with MCPJam Inspector:

```bash
# In another terminal, run MCPJam:
npx @mcpjam/inspector@2.4.0 --config mcp_servers.json --server counter-server
```

This opens a browser-based inspector where you can test tools.

## Learn More

- [Reboot Documentation](https://docs.reboot.dev)
- [MCP Specification](https://modelcontextprotocol.io)
