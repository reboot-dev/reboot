import { defineConfig, mergeConfig } from "vitest/config";
import viteConfig from "./vite.config";

// The frontend's Vite config, so the `reboot()` plugin's `@api` alias
// applies to tests too, plus a DOM for the components under test.
export default mergeConfig(
  viteConfig,
  defineConfig({ test: { environment: "jsdom" } })
);
