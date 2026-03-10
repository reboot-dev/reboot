import react from "@vitejs/plugin-react";

export default {
  testEnvironment: "jsdom",
  testMatch: ["**/*.test.js"],
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    hookTimeout: 60000,
    testTimeout: 60000,
    setupFiles: ["./fakeIndexedDb.mjs"],
  },
};
