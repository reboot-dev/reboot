// frontend/mcp/birthdays/main.tsx
import { RebootClientProvider } from "@reboot-dev/reboot-react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BirthdaysApp } from "./App";
import "../theme.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RebootClientProvider>
      <BirthdaysApp />
    </RebootClientProvider>
  </StrictMode>
);
