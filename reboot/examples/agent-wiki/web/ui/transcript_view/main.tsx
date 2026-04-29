import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RebootClientProvider } from "@reboot-dev/reboot-react";
import { TranscriptView } from "./App";
import "../../index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RebootClientProvider>
      <TranscriptView />
    </RebootClientProvider>
  </StrictMode>
);
