import { RebootClientProvider } from "@reboot-dev/reboot-react";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";

const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement
);

root.render(
  <React.StrictMode>
    <RebootClientProvider>
      <App />
    </RebootClientProvider>
  </React.StrictMode>
);
