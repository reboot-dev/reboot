import { defineConfig } from "vite";

export default defineConfig({
  build: {
    // The bundle contains top-level `await`, which the default
    // `es2020` build target rejects.
    target: "es2022",
  },
});
