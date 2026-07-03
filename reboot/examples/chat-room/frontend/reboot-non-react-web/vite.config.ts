import { defineConfig } from "vite";

export default defineConfig({
  server: {
    fs: {
      // The generated `frontend/api/` bindings live outside this
      // app's root, so allow serving files from `frontend/`.
      allow: [".."],
    },
  },
});
