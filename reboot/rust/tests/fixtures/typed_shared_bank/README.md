# Typed shared Bank prerequisite fixtures

This checked-in fixture uses repository-relative SDK/proto paths and pinned
`reboot-dev/reboot-examples` schemas at
`5c332a2910122d6035799bfaf2a314bf1de830b8`. Both Cargo workspaces have lockfiles.
No Python seed, private snapshot or nonrunnable original Bank native candidate is
part of the fixture.

## Run

From the repository root, use the canonical C++ Database executable for native
cases and the same exclusive build-owner/resource-budget discipline as other
native SDK suites:

```sh
cargo test --locked --offline --manifest-path reboot/rust/tests/fixtures/typed_shared_bank/Cargo.toml --lib -- --test-threads=1
export REBOOT_NATIVE2PC_CXX_DATABASE=/absolute/path/to/canonical/database
cargo test --locked --offline --manifest-path reboot/rust/tests/fixtures/typed_shared_bank/supported-companion/Cargo.toml --lib -- --nocapture --test-threads=1
```

The root library has five tests: three original Account semantics/task-description
checks, actual original Bank default/malformed-header receiver refusal, and the
exact original `bank.v1.OverdraftError` codec. The original Bank and Account
adapters are included unconditionally. Refusal tests use panic sidecars, root
factories and handlers; they do not require an initialized Bank or native process.
Constructing a task description is not atomic scheduling, execution or Wait proof.

The companion library has thirteen tests: three semantics checks, one canonical
native commit/restart/typed-rollback/ACK-loss test, six fresh-host
`typed_shared_ticket_` cases, and three `cleanup_failure_tests` wrapper cases.
Filter by those names for focused runs; a filtered command that runs zero tests
is not acceptance.

## What the synthetic companion proves

The companion uses `shared.probe.SharedRoot`, not original Bank. Supported test
constructors initialize a synthetic root and response-only Account.Open. Real
canonical Database operations test 60/40 persistence and acknowledged rollback,
exact typed payloads and genuine Abort-response loss with same-store gate exclusion.

The six ticket cases issue a genuine registered Account.Withdraw ticket inside an
actually authorized root handler. Wrong-target shared-declared Transfer calls
must reject malformed/valid input and burn the ticket; original and clone replay
against the intended Account receiver must fail exactly already-consumed. Counters
separate the legitimate issuing root from rejected calls. No shared-target outbound
permission, fabricated context, before-effects exemption or participant list grants
authority. Recorded successful terminal responses are not an exhaustive wire trace.
Unsettled issuance retains the exact consuming-owner/host cleanup failure; it is
never reported as a healthy committed probe.

Both native targets own dedicated synchronous Tokio runtimes destroyed before final
Native Drop. Three wrapper-only failure tests exercise proof panic and two join
timeouts with real callback/task destruction and an explicitly labeled owner
surrogate. These are not production ApplicationHost failure tests or Native kill/wait
proofs. Runtime destruction can wait indefinitely for non-yielding work; the parent
watchdog must classify a hang as failure. No leaking background/timeout shutdown
is used. Watch counts do not imply a Notify wakeup when callbacks already dropped.

## Original Bank remains blocked

Original Bank has no constructor RPC; non-factory SignUp cannot initialize it.
Admitted original Transfer needs existing Bank state. Transactional Account creation
inside SignUp and atomic WelcomeEmail scheduling inside original Account.Open are
still missing. The synthetic root, response-only constructor, task descriptions and
codec tests do not establish original Bank business/task/Wait acceptance.

`src/registered_ticket_probe.rs` is shared repository-relatively by the companion.
It accepts only real registered handler contexts and actual generated receivers.
The older Account-only malformed probe remains a helper, not the six-case new
shared-declared receiver proof.

See the canonical `reboot/rust/PARITY.md` ledger for source-bound acceptance and
remaining capability limits.
