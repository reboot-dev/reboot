## `mcp_servers.json` is no longer used

MCPJam Inspector is now launched with explicit flags rather than a
config file, so the `mcp_servers.json` file that older Chat Apps kept
in their project root is unused.

If a `mcp_servers.json` file exists at the project root, delete it.
Then remove any leftover references to it:

- In `.dockerignore`, delete a line that is exactly `mcp_servers.json`.
- Anywhere (e.g. `README.md`) that launches MCPJam as
  `npx @mcpjam/inspector@<version> --config mcp_servers.json --server <name>`, replace it with
  `npx @mcpjam/inspector@<version> --url http://localhost:9991/mcp --oauth`
  (use the port the app's backend serves on if it isn't `9991`).
