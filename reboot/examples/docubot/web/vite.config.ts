import react from "@vitejs/plugin-react";
import path, { resolve } from "path";
import tailwindcss from "tailwindcss";
import { defineConfig } from "vite";
import dts from "vite-plugin-dts";
import { libInjectCss } from "vite-plugin-lib-inject-css";

export default defineConfig({
  plugins: [react(), dts({ include: ["lib"] }), libInjectCss()],
  css: {
    postcss: {
      plugins: [tailwindcss()],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./lib"),
    },
  },
  define: {
    "process.env": {},
  },
  build: {
    rollupOptions: {
      external: ["react", "react-jsx-runtime"],
    },
    copyPublicDir: false,
    lib: {
      // Could also be a dictionary or array of multiple entry points
      entry: resolve(__dirname, "lib/main.ts"),
      formats: ["es"],
      // name: "RebootDocubot",
      // // the proper extensions will be added
      // fileName: "reboot-docubot",
    },
  },
});
