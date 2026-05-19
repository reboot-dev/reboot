---
title: Deploy on Reboot Cloud
impact: MEDIUM
impactDescription: Production deployment target — needed when an app graduates beyond `rbt dev run` or a single-machine `rbt serve`.
tags: deploy, cloud, rbt-cloud, scaling, secrets, dockerfile, api-key
---

## Deploy on Reboot Cloud

> **What it is:** Reboot Cloud is the easiest place to deploy a
> Reboot application. It takes a Dockerfile, builds and pushes the
> image to a managed registry, then runs the app with automatic
> partitioning across a cluster of machines — horizontal scaling
> and high-availability failover (~seconds) come built-in,
> backed by Reboot's transactional safety guarantees.

Reboot Cloud is the hosted deployment target for Reboot apps. The
alternative is `rbt serve` on your own infrastructure (EBS or
EFS); that runs on a **single machine** and can only scale
vertically. Reboot Cloud scales out: it shards an app's state
machines across the cluster automatically, so the same code that
ran under `rbt dev run` keeps working at multi-machine scale
without sharding logic in user code.

## When to Reach for Cloud vs. `rbt serve`

| Feature                | `rbt serve` (EBS)        | `rbt serve` (EFS) | Reboot Cloud  |
| ---------------------- | ------------------------ | ----------------- | ------------- |
| Physical backups       | Yes                      | Yes               | Yes           |
| Replication            | Within availability zone | Within region     | Within region |
| HA failover            | ~minutes                 | ~seconds          | ~seconds      |
| Vertical scaling       | Yes                      | Yes               | Yes           |
| **Horizontal scaling** | **No**                   | **No**            | **Yes**       |

Pick `rbt serve` when one machine is enough and you want full
control of the host. Pick Reboot Cloud when you want a managed
deployment, need to scale beyond a single machine, or just want
the shortest path from `rbt dev run` to production.

## Getting Access

Sign up at [`cloud.reboot.dev`](https://cloud.reboot.dev/), and create
an API key. Then run `rbt cloud up --api-key=<your-key>` to get your
application running in production!

For organizations with strict compliance requirements, Reboot
Cloud can also be deployed onto an enterprise-owned Kubernetes
cluster — same managed runtime, self-hosted control plane.
Contact Reboot via the Discord community or
[`docs.reboot.dev`](https://docs.reboot.dev) to set that up.

## Deploying: `rbt cloud up`

The app needs a `Dockerfile` at the project root that builds the
backend image — see
[`lifecycle-dockerfile.md`](lifecycle-dockerfile.md) for the
canonical layout. `rbt cloud up` builds it, pushes it to Reboot's
managed registry, and rolls out a new revision:

```sh
rbt cloud up \
  --api-key=$REBOOT_CLOUD_API_KEY \
  --application-name=my-app \
  --organization=my-org \
  --size=xsmall
```

- `--application-name` names the app inside your organization;
  the same value is used to refer to it on later `cloud`
  subcommands. (`--name` is a deprecated alias and prints a
  warning — write `--application-name` in fresh scripts.)
- `--organization` is required the **first** time an app is
  created; once it exists, subsequent `up` calls can omit it.
  Creating an app requires a valid payment method on the
  organization.
- `--size` picks the application footprint: `xsmall` (default),
  `small`, `medium`, `large`, `xlarge`.
- `--dockerfile=./Dockerfile` (default) picks the Dockerfile.
  `--docker-build-arg=KEY=VALUE` (repeatable) forwards build
  args.

On success, `rbt cloud up` prints three URLs:

```text
  Your API is available at:      https://<application-id>.prod1.rbt.cloud:9991
  MCP clients can connect at:    https://<application-id>.prod1.rbt.cloud:9991/mcp
  You can inspect your state at: https://<application-id>.prod1.rbt.cloud:9991/__/inspect
```

The `__/inspect` page is the production equivalent of the inspect
page `rbt dev run` exposes locally — it shows live state and
recent calls.

## Secrets: `rbt cloud secret set/list/delete`

> **Cross-reference:** `lifecycle-secrets.md` is the canonical
> secrets doc — it covers both delivery mechanisms (`rbt dev run`
> shell env vars vs. Cloud's `rbt cloud secret set`) and the
> "don't" list (no secrets in `.rbtrc`, no `REBOOT_*`/`RBT_*`
> names, etc.). This section is the Cloud-side detail.

Secrets are application-scoped and surfaced to the app as
environment variables. Names must be uppercase environment-style
identifiers (letters, digits, underscores; not starting with a
digit). The prefixes `REBOOT_*` and `RBT_*` are reserved by the
platform.

```sh
# Set values, reading them out of your shell environment so
# they don't appear in shell history or process listings:
export STRIPE_API_KEY=sk_live_...
rbt cloud secret set STRIPE_API_KEY \
  --api-key=$REBOOT_CLOUD_API_KEY \
  --application-name=my-app \
  --organization=my-org

# Or pass `KEY=VALUE` directly (value will appear in shell
# history — only do this for non-sensitive values):
rbt cloud secret set FEATURE_FLAG=on ...

# Inspect / remove:
rbt cloud secret list ...
rbt cloud secret delete STRIPE_API_KEY ...
```

Read secrets inside the app the same way as any other
environment variable (e.g. `os.environ["STRIPE_API_KEY"]`).

## Logs: `rbt cloud logs`

`rbt cloud logs` streams application logs from the cluster.
Supports filtering by revision and `--follow` for tailing.

## Tearing Down: `rbt cloud down`

`rbt cloud down` retires a revision (and, with the right flags,
the whole application). Use it when an app is no longer needed
or to roll back a bad revision; for routine updates, just run
`rbt cloud up` again — it creates a new revision and rolls
forward.

## Auth Implications

Before deploying to Reboot Cloud, every externally reachable
Servicer method needs an authorizer — calls without one are
**denied** (`PermissionDenied`) under `rbt cloud up`, exactly
like under `rbt serve`. (Under `rbt dev run` they're allowed with
a 60-second warning, so the gap only shows up on first deploy.)
See [`servicer-authorizer.md`](servicer-authorizer.md),
[`auth-allow-if.md`](auth-allow-if.md), and the surrounding
`auth-*` references for the predicate machinery.
