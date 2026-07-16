import { defineConfig } from "vitest/config";
import { BetterErrorTracingReporter } from "@reboot-dev/reboot-std/vitest";

export default defineConfig({
  test: {
    reporters: [new BetterErrorTracingReporter()],
  },
});
