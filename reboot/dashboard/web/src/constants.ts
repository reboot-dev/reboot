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
const MCP_UI_TITLE: string | undefined =
  (window as { REBOOT_MCP_UI_TITLE?: string }).REBOOT_MCP_UI_TITLE ??
  new URLSearchParams(window.location.search).get("mcpUiTitle") ??
  undefined;

export const IN_MCP_HOST: boolean = MCP_UI_TITLE !== undefined;

// Which of the dashboard's MCP Apps the page is, by the title, which
// is the UI's name in `dashboard.proto`: a card of one feature or of
// one state type, or `undefined` for the whole dashboard, in a host
// or in a browser.
export const MCP_CARD: "feature" | "state-type" | undefined =
  MCP_UI_TITLE === "show_feature"
    ? "feature"
    : MCP_UI_TITLE === "show_state_type"
    ? "state-type"
    : undefined;
