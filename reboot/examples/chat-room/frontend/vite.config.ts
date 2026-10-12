import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";
import { reboot } from "@reboot-dev/reboot-react/vite";

// The React web app; `mobile/` (Expo) and `reboot-non-react-web/`
// are workspaces of their own, with their own tooling.
export default defineConfig({
  plugins: [react(), reboot({ webAppPath: "web", apiPath: "api" })],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "web/src"),
    },
  },
  build: {
    sourcemap: true,
  },
});
