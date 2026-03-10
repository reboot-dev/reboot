import { RebootClientProvider } from "@reboot-dev/reboot-react";
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.tsx";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RebootClientProvider url={"http://localhost:9991"}>
      <App />
    </RebootClientProvider>
  </React.StrictMode>
);
