import { RebootClientProvider } from "@reboot-dev/reboot-react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Point the Reboot client at the backend via `VITE_REBOOT_URL`. A web
// app is served from its own origin — a CDN or static host — almost
// never same-origin with the Reboot backend, so a real deploy MUST set
// `VITE_REBOOT_URL` to the backend's origin. `web/.env.development`
// sets it for local dev (to the Envoy endpoint), so this SPA runs on
// the Vite dev server cross-origin to the backend — the same shape as
// production.
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RebootClientProvider url={import.meta.env.VITE_REBOOT_URL}>
      <App />
    </RebootClientProvider>
  </StrictMode>
);
