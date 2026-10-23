import { RebootClientProvider } from "@reboot-dev/reboot-react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Root } from "./Root.tsx";
import "./index.css";

// The Reboot client uses the page's own origin, which is the backend:
// in development Envoy serves this SPA from the Vite dev server at
// the backend's origin (`--web-app`), and built, the backend serves it
// itself (`--web-app-dist-path`). Only a web app served from another
// origin — a CDN or static host in production — MUST set
// `VITE_REBOOT_URL` to the backend's origin (`web/.env.production`).
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RebootClientProvider url={import.meta.env.VITE_REBOOT_URL}>
      <Root />
    </RebootClientProvider>
  </StrictMode>
);
