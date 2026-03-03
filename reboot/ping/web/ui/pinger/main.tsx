import { RebootClientProvider } from "@reboot-dev/reboot-react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { PingerApp } from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RebootClientProvider>
      <PingerApp />
    </RebootClientProvider>
  </StrictMode>
);
