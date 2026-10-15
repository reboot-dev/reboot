import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RebootClientProvider } from "@reboot-dev/reboot-react";
import { DashboardApp } from "./App";
import "../../index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RebootClientProvider>
      <DashboardApp />
    </RebootClientProvider>
  </StrictMode>
);
