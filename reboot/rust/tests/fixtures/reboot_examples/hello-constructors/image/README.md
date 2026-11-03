# hello-constructors: native release images and shared conformance

This stack packages the existing Rust constructors application, a compatible C++
Database, and the unchanged Python example at reboot-examples
`5c332a2910122d6035799bfaf2a314bf1de830b8`. It qualifies this application, not the
whole SDK. Rust business logic never falls back to Python.

## Build

Use Linux/amd64, Rust **1.99.1**, the checked-in Cargo.lock, and a source-built
compatible native Database. `build_images.py` invokes `cargo build --release
--locked`, requires the native binary's SHA-256, and copies its runtime C++/GCC
libraries. It refuses a missing or differently hashed binary. The engine's source
revision remains a separate required provenance field: a hash is not a source-build
proof. No arbitrary reboot-base image is a compatible replacement.

The Python recipe dereferences a pinned SDK's Bazel `rbt.runfiles`, runs that SDK's
public `rbt generate` on the original schema, and launches the original `main.py`
with **`rbt serve run`**. Supply the matching Bazel plugin directory and
mypy-protobuf tools in `--generator-path`. The receipt hashes every packaged file,
including the Python native library and dependency metadata. The supplied Envoy
binary is extracted from `envoyproxy/envoy:v1.38.4`, Linux/amd64 manifest
`sha256:f02b483283bf9651c85fe31f943e59496e76a87e54ba70a277d00a8eb7a4328b`,
with SHA-256 `c994c452de131f59c9ec9f4a2fffcc65039f250a38b6279870bb95dac21db0fa`.
Both runtime Dockerfiles use the same digest-pinned Ubuntu 24.04 image. Builds have
no Docker build-time network and perform no registry push.

On the authorized CCX43 qualification host, from the repository root:

```sh
export PATH=/home/benchbuild/.cargo/bin:$PATH
export CARGO_HOME=/home/benchbuild/.cargo
export CARGO_TARGET_DIR=/home/benchbuild/.cache/hello-image-target
IMAGE=reboot/rust/tests/fixtures/reboot_examples/hello-constructors/image
python3 "$IMAGE/build_images.py" \
  --out /home/benchbuild/.cache/hello-image-evidence/recipe-build \
  --database /home/benchbuild/reboot-rust/bazel-bin/reboot/server/database \
  --database-sha256 619002c569e9841144a8bbedf4f2ce6a753bb0e6b103af71883d91d43f413803 \
  --engine-source 8574ccb0df9893274e69d1a19eca469dad56d779 \
  --rbt /home/benchbuild/reboot-rust/bazel-bin/reboot/cli/rbt \
  --python-sdk-source 8574ccb0df9893274e69d1a19eca469dad56d779 \
  --envoy /home/benchbuild/.cache/hello-image-evidence/envoy/envoy \
  --generator-path /home/benchbuild/reboot-rust/bazel-bin/reboot:/home/benchbuild/reboot-rust/.venv-acceptance/bin \
  --offline
```

`--out` must not already exist; choose another task-owned output for a rebuild.
The checked-in qualification receipt identifies the actual built images and
source/artifact hashes. Images remain local to that authorized host.

## Run and stop

```sh
docker compose -f "$IMAGE/compose.yaml" up --detach --wait --wait-timeout 60
# Perform public-interface calls from this isolated network.
docker compose -f "$IMAGE/compose.yaml" stop --timeout 30
# Optional container/network retirement, preserving the named state volumes:
docker compose -f "$IMAGE/compose.yaml" down
```

The network is internal. **No host port is published, including the native engine.**
The public application gRPC endpoints inside it are `rust:9990` and `python:9991`.
Do not use host networking or attach unrelated containers. Run the qualification
owner in `ccx43/stack_owner.py` under durable supervision instead of abandoning a
background stack. Its paths are intentionally scoped to this qualification host.
It records exact container IDs, joins every Docker wait child, reads back terminal
container state, and stops its own children in app→engine order. It does not kill
unknown processes or remove volumes.

Config uses the same release Rust binary to create/validate immutable server-info.
Database must pass an actual read-only native Load before Rust starts. Rust becomes
ready only after stable-key Create→Send→Messages initialization; the Docker probe
checks canonical gRPC health **and** a read-only initialized actor request through
Database. Engine loss makes **stack readiness** unhealthy. Host-only gRPC health
is not an engine-liveness guarantee. Containers use Docker's init for signal
forwarding/reaping. Python's public launcher gracefully re-raises SIGTERM (container
exit 143); Rust and native Database exit 0. Do not misclassify Python 143 as a
forced-kill result; interruption tests separately record SIGKILL as 137.

Python's cryptographic root keys are generated once, mode 0600, inside its retained
state volume; they are neither baked into an image nor printed. Keep application
names, initializer identities, and volumes stable across restarts. Never use `down
-v` for a retained-state test.

## Shared test and interruption boundary

Copy both `shared_probe.py` and `transcript_comparison.py` into the running Python reference container (the test can
also run in a separate client container carrying its pinned generated bindings),
then execute that identical program against the two public gRPC endpoints. Pass
the same fresh actor prefix and UUIDv7 key base, whose timestamp is in the future,
to both runs. The CCX43 controllers demonstrate exact invocations. They assert
22 complete case records: **21 deterministic records compared exactly**
and **1 concurrent isolation record compared by membership/multiplicity**.
This includes rich status code/message/type/serialized fields, anonymous and
supplied-token access, identity misuse, fidelity, replay and isolation. The raw
concurrent response is never sorted or overwritten: it remains in the `isolation`
case and the separate `concurrency_raw_messages` evidence. `compare_transcripts`
checks each side against the expected multiset, not just against each other.
Concurrent ordering is not a contract; **errors are never normalized**. `--restart`
reuses the original actor IDs and keys, and `--boot` reads only initialized state.

Observed Python behavior corrects an assumption in the initial assessment:
missing **reader** state has `StateNotConstructed(requires_constructor=false)`;
missing non-constructor **writer** state sets it true. Construction errors have
empty diagnostic messages. Changed-request/wrong-method identities return rich
FAILED_PRECONDITION with `FailedPrecondition` and the original capitalized message.
The Rust runtime is repaired to those real observations, not a relaxed harness.

The initializer retries failed RPCs with owned cancellable backoff and stable
persisted identities, matching Python's convergence policy. Failures remain
logged; they never turn into successful readiness. Constructor replay additionally
fails closed on missing/empty legacy fingerprints, including CreateActor conflict
reconciliation. The lower-level legacy replay API intentionally retains its prior
compatibility boundary; this is not universal strict-fingerprint migration.

Interruption uses the production images with **external test instrumentation**:
Rust has a transparent gRPC proxy that parks the first real C++ CreateActor ACK;
Python has a test-only `sitecustomize` wrapper around the original generated
`Hello.create`, parking only after that public call returned. Neither replaces the
business handler, engine or persistence implementation; original source bytes
remain unchanged. The exact owned app container is SIGKILLed at that boundary,
restarted on the same volume, checked for exactly two boot messages, then restarted
again. Instrumentation is not baked into the shipped runtime images. Independent
SDK gates in the constructor conflict unit test are an in-process gRPC fake, not
a multi-process C++ race proof.

See `qualification.json` for actual gates, artifact identities, retained evidence
handles and any bounded qualifications. No benchmark or full-SDK parity claim is
made by these application correctness results.

## Review correction receipts

`qualification.json` now distinguishes deterministic exact equality from concurrent
membership/multiplicity equivalence. The previous whole-transcript-equality gate
was an overclaim because the earlier probe sorted the concurrent response in place.
Historical source and evidence remain frozen at candidate
`98265ecb9c5d6ef4dd3da9efcae752421637b8b7` and the prior evidence root; the corrected
run is separately retained in `stack-review-correction` with corrected source bytes
in `review-correction-source-v1`. No runtime/business implementation changed and
none of the three retained production images was rebuilt or pulled.

The finite `ccx43/review_probe_run.py` runs the existing exact-ID owner as a waited
child with new, refuse-existing source/evidence/project names, immutable original
image IDs, fresh volumes, and then a full app/engine retained-volume restart.
Run it only on the authorized host after reviewing its host-scoped paths; these
paths now already exist, so a repeat must use new names rather than overwrite proof.
Fresh public probes produced 22 records per implementation (21 exact,
1 concurrent membership/multiplicity); restart produced 5 deterministic
records per implementation using the same actor IDs and keys. Raw concurrent order
happened to match in this run; that observation is not an ordering guarantee.
The comparator unit suite accepts different concurrent order without mutation and
rejects missing, duplicate, unexpected messages, raw-evidence mismatch, deterministic
ordering differences, and exact rich-error byte/message differences.

```sh
python3 -m unittest discover -s "$IMAGE" -p test_transcript_comparison.py -v
```

Prior SDK/build/interruption results in the qualification are inherited historical
receipts, **not rerun** by this narrow correction. There is no benchmark, full-SDK
parity, registry publication, deployment or new-capacity claim.
