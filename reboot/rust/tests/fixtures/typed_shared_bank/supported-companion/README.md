# Supported synthetic native companion

See [the fixture README](../README.md) for commands, exact test counts and limits.

This is not original Bank acceptance. The thirteen tests include one canonical
commit/restart/typed-error/ACK-loss case, six genuine-ticket receiver negatives,
three task-ownership wrapper failure cases and three Account semantics checks.
Both native targets use dedicated synchronous runtime destruction before final
Native Drop. Runtime destruction is not universally bounded and wrapper failure
tests are not production ApplicationHost or Native failure-cleanup proofs.

There is no Python seed or private snapshot path. Source-bound execution receipts
and the remaining constructor/task gaps live in the canonical SDK parity ledger.
