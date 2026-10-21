# CCX43 custody harness

These are the actual exercised host-scoped controllers, not a portable daemon.
Their source/evidence roots are `/home/benchbuild/.cache/hello-image-src` and
`/home/benchbuild/.cache/hello-image-evidence`. They deliberately refuse an existing
evidence directory and use explicit task-owned container/volume names.

Retained execution filenames under `/home/benchbuild/.cache/` are:
`hello-docker-owner.py`, `hello-control.py`, `hello-lifecycle-check.py`,
`hello-recipe-probes.py`, `hello-interruption-owner.py`,
`hello-database-proxy.py`, `hello-python-interruption-owner.py`, and
`hello-python-sitecustomize.py`. Copy these files under those names before using
the corresponding controllers on a new authorized qualification workspace.
Do not rerun them against existing owned containers: use the live owner inbox,
or first verify its terminal receipt and inspect exact targets. A rerun with new
names is a new run, never retained-volume restart evidence.

The main owner accepts numbered request JSON files through control.py; only
request-NNN.json is input, never its .done.json receipts. It creates the Compose
containers before starting the documented stack, retains IDs, and arms Docker wait
after start. Docker wait against a merely created container can immediately return
0, so every terminal wait is also checked against exact container state/exit code.
The owner exits only after stopping its own app/Python/engine children and joining
wait processes. Docker's runtime is daemon-managed: Docker wait children are exact
Unix subprocesses, while container retirement is separately read-back API evidence.
An absent former owner PID is only a terminal observation, not an exact parent wait.

## Corrected review run

`review_stack_owner.py` is the existing owner with separate source/evidence and
Compose paths only; `review_probe_run.py` is its finite, exact-parent-waited driver.
It uses `compose.review-correction.yaml`, pinned original image IDs, a fresh
`hello-image-review-correction` project and volumes, then restarts that same stack
on those retained volumes. Its output root is `stack-review-correction`; sources
are frozen separately in `review-correction-source-v1`. The original `stack` and
all interruption receipts are untouched. The historical `recipe_probes.py` also
uses the corrected comparator and copies its dependency alongside the shared probe;
it no longer asserts entire-case equality after normalizing concurrency.
