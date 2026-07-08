// frontend/mcp/accounts/main.tsx
import { RebootClientProvider } from "@reboot-dev/reboot-react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { AccountsApp } from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RebootClientProvider>
      <AccountsApp />
    </RebootClientProvider>
  </StrictMode>
);
