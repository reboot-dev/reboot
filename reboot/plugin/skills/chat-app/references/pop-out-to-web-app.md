---
title: Pop-out button — deep-linking an MCP UI widget to your web app
impact: MEDIUM
impactDescription: An MCP UI widget runs in a sandboxed iframe that blocks `window.open`, so a naive "open in browser" button silently does nothing in most hosts. Use the bound entity's `state_id` to build a deep link and ask the host to open it via the MCP Apps `openLink` request, with a `window.open` fallback.
tags: react, app-tsx, pop-out, deep-link, openLink, state_id, useMcpApp, dual-surface, web-app
---

## Pop-out button — deep-linking an MCP UI widget to your web app

When the same backend also serves a standalone web app (see the
`web-app` skill), an MCP UI widget can offer a "pop out into the
web app" button that opens the **same entity** in a full browser
tab. Two facts make this work:

1. The generated `use<Type>()` hook exposes the resolved entity ID
   as `state_id`, so a widget that auto-resolved its entity from
   the MCP session can still recover the concrete ID.
2. The host opens external URLs on the widget's behalf via the MCP
   Apps `openLink` request — necessary because the widget's
   sandboxed iframe blocks `window.open` (the host doesn't grant
   `allow-popups`), so a direct `window.open` silently no-ops.

### Recipe

```tsx
import { useMcpApp } from "@reboot-dev/reboot-react";
import { useCounter } from "@api/<pkg>/v1/<name>_rbt_react";

export const ClickerApp = () => {
  const counter = useCounter();

  // The resolved entity ID — even though `useCounter()` inferred
  // it from the MCP session rather than an explicit `{ id }`.
  const counterId = counter.state_id;

  // The MCP host handle; `null` when not running under a host.
  const mcpApp = useMcpApp();

  const handlePopOut = async () => {
    // Pass the entity ID to the web app as a query param it reads
    // on load to render that one entity.
    const url =
      "https://your-web-app.example/?counter=" + encodeURIComponent(counterId);

    // Ask the host to open the link; `window.open` is blocked in
    // the sandboxed iframe. Fall back to `window.open` when not
    // under an MCP host (or the host declines the request).
    if (mcpApp?.openLink) {
      try {
        const { isError } = await mcpApp.openLink({ url });
        if (!isError) {
          return;
        }
      } catch {
        // Fall through to `window.open`.
      }
    }
    window.open(url, "_blank", "noopener");
  };

  return <button onClick={handlePopOut}>Open in web app ↗</button>;
};
```

### The web-app side

The web app reads the query param on load and shows just that
entity — e.g. `?counter=<id>` selects a single-counter view via
`useCounter({ id })`. Because both surfaces share the
`oauth=...`-driven session (the `rbt_session` cookie), a user
signed in to the MCP host is already signed in when the tab opens.
The entity's authorizer still applies, so the deep-linked entity
must be one the signed-in user is allowed to read.

### Notes

- `useMcpApp()` is re-exported from `@reboot-dev/reboot-react`; its
  value is the `@modelcontextprotocol/ext-apps` `App`, whose
  `openLink({ url })` resolves to `{ isError }` (the host denies
  blocked domains or a cancelled request).
- Hardcoding the web app's origin is fine for local development;
  for deployed apps, source it from config rather than assuming a
  port.
