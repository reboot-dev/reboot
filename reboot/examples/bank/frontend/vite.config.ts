import react from "@vitejs/plugin-react";
import path from "path";
import { defineConfig } from "vite";
import { reboot } from "@reboot-dev/reboot-react/vite";

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
