import { RebootClientProvider } from "@reboot-dev/reboot-react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

// This SPA is served same-origin behind the app's built-in HTTP server
// at `/__/frontend/web/`, so the provider auto-detects the backend URL
// from `window.location.origin` — no explicit `url` needed.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RebootClientProvider>
      <App />
    </RebootClientProvider>
  </StrictMode>
);
