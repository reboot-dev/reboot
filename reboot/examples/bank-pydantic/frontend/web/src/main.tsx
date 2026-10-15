import { RebootClientProvider } from "@reboot-dev/reboot-react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Root } from "./Root.tsx";
import "./index.css";

// The Reboot client finds the backend on its own in development:
// the backend serves this SPA from the Vite dev server at its own
// origin (`--web-app-url`), so it is same-origin, as it is when the
// backend serves the built SPA (`--web-app-dist-path`); opened at the
// dev server's own URL instead, on a plain Vite port, it assumes
// Reboot's default `http://localhost:9991`. Only a deploy on a CDN or
// static host, cross-origin to the backend, MUST set
// `VITE_REBOOT_URL` to the backend's origin (`web/.env.production`).
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RebootClientProvider url={import.meta.env.VITE_REBOOT_URL}>
      <Root />
    </RebootClientProvider>
  </StrictMode>
);
