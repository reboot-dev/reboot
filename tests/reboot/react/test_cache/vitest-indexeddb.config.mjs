import react from "@vitejs/plugin-react";

export default {
  testEnvironment: "jsdom",
  testMatch: ["**/*.test.js"],
  plugins: [react()],
  // Under Bazel every file here is a runfiles symlink whose target
  // lies in the execroot, outside this directory and read-only, and
  // the jsdom environment loads modules through Vite, which resolves
  // symlinks to their targets unless told to keep them: `@reboot-dev/
  // reboot` then makes its Python venv under its real, unwritable
  // directory, and a test file resolves outside the root Vite serves.
  resolve: { preserveSymlinks: true },
  server: { fs: { strict: false } },
  test: {
    globals: true,
    environment: "jsdom",
    hookTimeout: 60000,
    testTimeout: 60000,
    setupFiles: ["./fakeIndexedDb.mjs"],
  },
};
