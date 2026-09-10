## Tests become feature files

Reboot applications now specify and test their behavior with
Gherkin `.feature` files in `backend/tests/`, run by `reboot.bdd`
(installed by the `reboot[dev]` extra) and shown by the dashboard's
Features page. An existing suite of `unittest.IsolatedAsyncioTestCase`
tests keeps running, but the developer gets none of that until the
tests are feature files.

Convert the suite with the `feature` skill's "Converting an existing
test suite" section, after the `reboot[dev]` fragment has been
applied:

1. List what each existing test shows, in English.
2. Group the tests into features by capability (deposits,
   withdrawals, transfers), not by servicer or by test file; each
   feature becomes one `.feature` file with a name and description,
   its scenarios named for their situations, and a `Rule` only for a
   real business invariant. Where the grouping is not obvious, or a
   test seems to state a rule the developer never stated, ask the
   developer before writing.
3. Write the scenarios in the built-in steps
   (`python/references/testing-features.md`); the calls of a test
   the built-in steps cannot say become custom steps written as
   plain Reboot code, and a mock becomes an autouse fixture asserted
   through a one-line custom step.
4. Keep the tests that are about Reboot's recovery, the ones that
   crash the application mid-method and bring it back; they stay on
   the harness.
5. Tag every new feature `@wip`, add `*.recordings/` to
   `.gitignore`, run both suites until the scenarios cover the
   tests, then delete the converted tests and ask the developer to
   review the feature files (the dashboard's Features page shows
   them) before removing the `@wip` tags.
