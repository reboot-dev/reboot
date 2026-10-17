import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { reboot } from "@reboot-dev/reboot-react/vite";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    reboot({ webAppPath: "web", apiPath: "api" }),
  ],
});
