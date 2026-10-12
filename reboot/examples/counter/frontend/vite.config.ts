import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { reboot } from "@reboot-dev/reboot-react/vite";

// The Vite web app; `web-next/` is the Next.js one, with its own
// tooling.
export default defineConfig({
  plugins: [react(), reboot({ webAppPath: "web-vite", apiPath: "api" })],
});
