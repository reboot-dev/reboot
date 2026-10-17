// Inlines the logo: the one-file page an MCP host shows has no address
// to fetch it from.
export default { loader: { ".svg": "dataurl" } };
