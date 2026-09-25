---
title: Derive Your Own Keys from Reboot's Managed Crypto Root Keys (with Rotation)
impact: HIGH
impactDescription: Deriving keys wrong, or skipping rotation/usage markers, makes data permanently unrecoverable or pins an old root key forever.
tags: crypto, root-keys, hkdf, derive_key, rotation, use_root_key_version, disuse_root_key_version, encryption, signing
---

## Derive Your Own Keys from Reboot's Managed Crypto Root Keys

> **First decide if you even need rotation.** If you re-derive a key
> from `root_keys.active_version()` **every time** and never persist
> the derived key (or anything encrypted under it) — e.g. an
> HMAC/signing key recomputed on each use — you need **none** of the
> rotation machinery below: just always derive from
> `active_version()`, and a root-key rotation simply produces a new
> key next time. The `Watch` loop and `use_root_key_version` /
> `disuse_root_key_version` markers are **only** for code that
> **persists material wrapped under a specific (possibly older) root
> version** and must keep that version alive until it has migrated
> off. If you just want encryption-at-rest + crypto-shredding, **don't
> build this — use the `Ciphertext` library** (`stdlib-ciphertext.md`),
> which already implements everything here.

Reboot provisions and rotates a versioned set of root secrets in the
`REBOOT_CRYPTO_ROOT_KEYS` environment variable (`rbt dev` and Reboot
Cloud set it automatically — you do not manage it yourself). Your
library/app never uses these roots directly: you **HKDF-derive your
own purpose-specific keys** from them via
`reboot.crypto.root_keys.derive_key`.

```python
from reboot.crypto import root_keys

# `info` is a domain separator: pick a unique, stable byte-string per
# purpose so your derived key is independent of every other consumer's.
key = root_keys.derive_key(
    info=b"my.app.notes-encryption-key",
    version=root_keys.active_version(),
)  # -> 32 bytes (override with length=)
```

### The `root_keys` API

| Call                                                         | Returns / raises                                                                                            |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `derive_key(*, info: bytes, version: int, length: int = 32)` | the derived key (`bytes`); **keyword-only**. Raises `UnknownRootKeyVersion` if `version` is not configured. |
| `active_version()`                                           | highest configured version (the one new material should use)                                                |
| `available_versions()`                                       | all configured versions, ascending                                                                          |

Errors live on the module: `root_keys.MissingRootKeys` (env unset),
`root_keys.MalformedRootKeys`, `root_keys.UnknownRootKeyVersion`.

Two rules that prevent silent data loss:

- **Always derive new material from `active_version()`.** Never
  hard-code a version.
- **`info` is a permanent contract.** Changing the `info` label (or
  `length`) changes every derived key, orphaning everything already
  encrypted under the old one. Choose it once and never change it.

`REBOOT_CRYPTO_ROOT_KEYS` is a versioned list, newest-first:
`v2:<new-key>,v1:<old-key>`. During a rotation both versions are
present so old material still decrypts while you migrate.

### When you persist material: handle rotation

If you store a key (or data) derived from / wrapped under a specific
root version, then when the operator adds a newer version you must
**re-derive (re-wrap) your persisted material onto the new active
version** so the old version can eventually be dropped. Until you do,
the old version must stay in `REBOOT_CRYPTO_ROOT_KEYS`.

You tell the platform which versions you still hold via two writers on
the per-app `Application` singleton, so an operator (or a future
automated actor) knows when a version has zero holders and is safe to
retire:

```python
import reboot.application

# "I now hold material under this version."
await reboot.application.ref().use_root_key_version(
    context, consumer=CONSUMER, version=target,
)

# "I no longer hold anything under this older version."
await reboot.application.ref().disuse_root_key_version(
    context, consumer=CONSUMER, version=old,
)
```

`consumer` is a **globally-unique, namespaced** string identifying
_you_ among all consumers in the app (the field is shared app-wide).
Namespace it by your library and, if you run multiple independent
holders, by instance — e.g. `f"my.app.notes:{manager_id}"`. Both
writers are **idempotent**.

Track the versions you hold in your **own state** (a
`repeated uint32 consuming_versions` set) and treat the `Application`
markers as a mirror of it. This buys two correctness properties:

- **Mark `use` transactionally, deduped.** When you first create
  material under a version, record `use_root_key_version` _in the same
  transaction_ — but only if the version is new to your
  `consuming_versions` set. That closes the window where a key is in
  use before its marker exists (a retirement actor could otherwise see
  the version as unused and drop it), and you touch the shared
  `Application` singleton only **once per version**, not once per key.
- **Keep the markers a conservative superset of `consuming_versions`.**
  A version you still record locally as consumed must never appear
  unused in `Application`. So set the global marker **before** (or in
  the same transaction as) adding the version locally, and clear it
  **after** removing it locally. Erring on the "still in use" side
  until the end is the safe direction — the retirement actor reads the
  markers, so a too-early disuse is what loses data.

Two more rules:

- **The active version is always in use** — never disuse it.
- A version is retire-able only when **every** consumer has disused it
  (zero markers).

### Marking usage when you create material

The first half is a writer/transaction that creates a key under the
active version. Mark `use` here, transactionally and deduped against
`consuming_versions`, and lazily start the `Watch` loop:

```python
import reboot.application
from reboot.aio.contexts import TransactionContext

CONSUMER = "my.app.notes"  # namespace per library/instance


class KeyManagerServicer(KeyManager.Servicer):

    async def register(
        self, context: TransactionContext, request: KeyManager.RegisterRequest,
    ) -> KeyManager.RegisterResponse:
        # ... persist your new key, wrapped under `request.version` ...

        # First time we see this version: mark it in use *in this
        # transaction* (no window before the marker), and only once per
        # version (cheap on the shared `Application` singleton).
        if request.version not in self.state.consuming_versions:
            self.state.consuming_versions.append(request.version)
            await reboot.application.ref().use_root_key_version(
                context, consumer=CONSUMER, version=request.version,
            )
        if not self.state.watch_started:
            await self.ref().schedule().watch(context)
            self.state.watch_started = True
        return KeyManager.RegisterResponse()
```

### The rotation control loop

The second half is a long-lived `Watch` workflow (`workflow-method.md`,
`workflow-loop.md`, `workflow-until.md`). It parks until you still hold
a version older than the env's active one, then: mark + start-consuming
the new version, migrate, stop-consuming + disuse the old ones. The
`consuming_versions` set in your state makes the loop deterministic
across replays and restarts.

```python
import reboot.application
from reboot.aio.contexts import WorkflowContext
from reboot.aio.workflows import until
from reboot.crypto import root_keys


class KeyManagerServicer(KeyManager.Servicer):

    @classmethod
    async def watch(
        cls, context: WorkflowContext, request: KeyManager.WatchRequest,
    ) -> KeyManager.WatchResponse:
        async for _ in context.loop("Watch"):

            # Park until we still hold a version older than the env's
            # active one. A bare `read()` IS allowed in an `until`
            # predicate; use the OWN-instance ref (`.ref()`, no id).
            # Returning a (truthy) tuple ends the wait; `False` keeps it.
            async def stale() -> tuple[int, list[int]] | bool:
                key_manager = await KeyManager.ref().read(context)
                active_version = root_keys.active_version()
                stale_versions = [
                    v for v in key_manager.consuming_versions
                    if v < active_version
                ]
                return (
                    (active_version, stale_versions)
                    if stale_versions else False
                )

            active_version, stale_versions = await until("Stale", context, stale)

            # Mark `use` and start consuming `active_version` BEFORE
            # migrating, so a key wrapped under it mid-sweep is never
            # left unmarked (idempotent if `register` already recorded it).
            await reboot.application.ref().per_iteration(
                "Use root key versions"
            ).use_root_key_version(
                context, consumer=CONSUMER, version=active_version
            )

            async def start_consuming(state: KeyManager.State) -> None:
                if active_version not in state.consuming_versions:
                    state.consuming_versions.append(active_version)

            await KeyManager.ref().per_iteration("Save root key versions being consumed").write(
                context, start_consuming,
            )

            # ... re-derive / re-wrap every persisted key onto
            # `active_version` (your migration sweep; page it for large
            # keyrings) ...

            # Stop consuming the old versions LOCALLY first, then release
            # their `Application` markers — keeping the markers a
            # conservative superset of what we still record as consumed.
            async def stop_consuming(state: KeyManager.State) -> None:
                for v in stale_versions:
                    if v in state.consuming_versions:
                        state.consuming_versions.remove(v)

            await KeyManager.ref().per_iteration("Stop consuming root key versions").write(
                context, stop_consuming,
            )

            for version in stale_versions:
                await reboot.application.ref().per_iteration(
                    f"Disuse root key version v{version}"
                ).disuse_root_key_version(
                    context, consumer=CONSUMER, version=version
                )
```

All cross-state calls inside the loop are wrapped in `.per_iteration(...)`
so they're memoized deterministically across `context.loop`
effect-validation replays (`workflow-idempotency-scopes.md`).

### Don't

- **Don't change `info` or `length` after shipping.** It silently
  orphans everything already derived.
- **Don't disuse the active version**, and don't `use`/`disuse` from
  outside the deterministic `Watch` region without `.per_iteration(...)`.
- **Don't reuse a bare `consumer` like `"default"`** — it's app-global;
  namespace it so two libraries can't collide and prematurely retire
  each other's version.
- **Don't roll your own envelope encryption** if encryption-at-rest +
  crypto-shredding is what you want — use `Ciphertext`
  (`stdlib-ciphertext.md`), the reference implementation of everything
  on this page.
