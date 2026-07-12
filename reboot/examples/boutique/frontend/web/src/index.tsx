import { RebootClientProvider } from "@reboot-dev/reboot-react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";

const root = ReactDOM.createRoot(
  document.getElementById("root") as HTMLElement
);

root.render(
  <RebootClientProvider url={import.meta.env.VITE_REBOOT_URL}>
    <BrowserRouter basename="/">
      <App />
    </BrowserRouter>
  </RebootClientProvider>
);
