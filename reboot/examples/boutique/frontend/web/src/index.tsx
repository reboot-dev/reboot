import { RebootClientProvider } from "@reboot-dev/reboot-react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";

const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement
);

root.render(
  <RebootClientProvider>
    <BrowserRouter basename="/">
      <App />
    </BrowserRouter>
  </RebootClientProvider>
);
