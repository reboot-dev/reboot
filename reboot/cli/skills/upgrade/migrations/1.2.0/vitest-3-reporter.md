## `BetterErrorTracingReporter` now requires Vitest 3

The `BetterErrorTracingReporter` exported from
`@reboot-dev/reboot-std`'s `vitest` module was rewritten against the
Vitest 3 reporter API (`onTestCaseResult`) and no longer works with
Vitest 2. If the app references `BetterErrorTracingReporter` (grep
`vitest.config.*` and test setup files) and `package.json` pins
`vitest` below 3, change the pin to `"vitest": "^3.2.4"`.
