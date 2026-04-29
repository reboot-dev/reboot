import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RebootClientProvider } from "@reboot-dev/reboot-react";
import { MenuApp } from "./App";
import "../../index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RebootClientProvider>
      <MenuApp />
    </RebootClientProvider>
  </StrictMode>
);
