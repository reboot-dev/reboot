import { RebootClientProvider } from "@reboot-dev/reboot-react";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

const url = "http://localhost:9991";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <RebootClientProvider url={url}>
      <App />
    </RebootClientProvider>
  </StrictMode>
);
