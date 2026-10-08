// Mirrors `reboot/dashboard/constants.py`, which
// TypeScript cannot read. Keep the two in step.
export const PRESENCE_ID = "dashboard";
export const DASHBOARD_ID = "dashboard";
export const PREFERENCES_ID = "preferences";
export const CHANGELOG_ID = "changelog";

// Whether an MCP host shows the page: the same test `RebootClientProvider`
// makes to enter MCP mode. The application writes the title into the
// page before any script runs; a dev iframe carries it as a query
// parameter.
export const IN_MCP_HOST: boolean =
  (window as { REBOOT_MCP_UI_TITLE?: string }).REBOOT_MCP_UI_TITLE !==
    undefined ||
  new URLSearchParams(window.location.search).get("mcpUiTitle") !== null;
