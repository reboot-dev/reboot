import { defineConfig } from "vitest/config";

// The unit tests run on their own config: they need none of the
// dev-server and build settings `reboot()` adds in `vite.config.ts`,
// which vitest's own server rejects.
export default defineConfig({
  test: {
    include: ["common/**/*.test.ts", "web/src/**/*.test.{ts,tsx}"],
  },
});
