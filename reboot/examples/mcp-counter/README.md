# MCP Counter App

A minimal MCP + Reboot example

## Features

- **Python 3.10** compatible
- Only depends on `reboot` and `mcp` from pip
- Stateless FastMCP backend - simplest integration

## Quick Start

```bash
# Install dependencies
uv sync

# Generate API code
uv run rbt generate

# Build web apps
cd web && npm install && npm run build && cd ..
  or in a separate terminal (to watch application changes):
cd web && npm install && npm run build:watch

# Run the backend
uv run rbt dev run

# In yet another teminal run the MCPJam inspector - opens a browser
npx @mcpjam/inspector@latest --config mcp_servers.json --server counter-server

## Stateless Mode

Each request is independent. Limitations:
- No server->client notifications
- No SSE streaming
- Clients must poll for changes

## MCP Tools

- `get_counter` - Get current counter value
- `increment_counter` - Increment by 1
- `decrement_counter` - Decrement by 1
- `show_clicker_ui` - Open clicker MCP App
- `show_dashboard_ui` - Open dashboard MCP App

## Testing with MCPJam Inspector

The project includes `mcp_servers.json` for testing with MCPJam Inspector:

```bash
# Start the server first
uv run rbt dev run

# In another terminal, run the inspector
npx @mcpjam/inspector@latest --config mcp_servers.json --server counter-server
```

This opens a browser-based inspector where you can test tools and resources.

## Project Structure

```
mcp-counter/
├── api/                    # API definitions (Pydantic)
│   └── mcp_counter/v1/
│       └── counter.py
├── backend/
│   ├── api/                # Generated code (rbt generate)
│   │   └── mcp_counter/v1/
│   │       └── counter_rbt.py
│   └── src/
│       ├── main.py         # MCP tools/resources + Application
│       ├── boot.py         # MCP+Reboot integration layer
│       ├── apps.py         # HTML generation for MCP Apps
│       └── servicers/
│           └── counter.py
├── web/                    # React MCP Apps
│   └── src/apps/
│       ├── clicker/
│       └── dashboard/
├── .rbtrc                  # Reboot configuration
└── pyproject.toml
```

## Learn More

- [Reboot Documentation](https://docs.reboot.dev)
- [MCP Specification](https://modelcontextprotocol.io)
