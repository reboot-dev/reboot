// This suite exercises the Reboot web client's plumbing in a
// stripped-down, non-browser ("node") environment that approximates
// React Native: there is no DOM, and we delete or replace the web
// globals (`fetch`, `WebSocket`, `MessageEvent`) that React Native
// either lacks or implements differently. See the test file for the
// specific regressions it guards.
export default {
  testMatch: ["**/*.test.js"],
  test: {
    globals: true,
    environment: "node",
    hookTimeout: 30000,
    testTimeout: 30000,
  },
};
