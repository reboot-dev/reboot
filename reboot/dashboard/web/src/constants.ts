// Mirrors `reboot/dashboard/constants.py`, which
// TypeScript cannot read. Keep the two in step.
export const PRESENCE_ID = "dashboard";
export const DASHBOARD_ID = "dashboard";
export const PREFERENCES_ID = "preferences";
export const CHANGELOG_ID = "changelog";

// The address of the dashboard application when an MCP host shows the
// page, which the application writes into the page it gives the host:
// there the page's origin is the host's, so everything the application
// serves by path is under this address. Empty in a browser, where the
// application serves the page itself and a path alone reaches it.
export const APPLICATION_URL: string =
  (globalThis as { REBOOT_URL?: string }).REBOOT_URL ?? "";

// The dashboard's credential, which the gateway serving the page in a
// browser writes into it; every RPC the page makes carries it. Absent
// in an MCP host, where the page is given its credential the way every
// Reboot MCP App is: in the result of the tool that opened it.
export const DASHBOARD_TOKEN: string | undefined = (
  globalThis as { REBOOT_DASHBOARD_TOKEN?: string }
).REBOOT_DASHBOARD_TOKEN;

// Whether an MCP host shows the page, which the application says the
// same way.
export const IN_MCP_HOST: boolean =
  (globalThis as { REBOOT_MCP_UI_TITLE?: string }).REBOOT_MCP_UI_TITLE !==
  undefined;
