import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { McpAppWrapper } from "../../shared/McpAppWrapper";
import { RebootProvider } from "../../shared/RebootProvider";
import { DashboardApp } from "./App";
import "../../shared/index.css";
createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <McpAppWrapper appName="Counter Dashboard">
      {(app) => (
        <RebootProvider>
          <DashboardApp app={app} />
        </RebootProvider>
      )}
    </McpAppWrapper>
  </StrictMode>
);
