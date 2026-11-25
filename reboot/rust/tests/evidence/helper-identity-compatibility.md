# Draft helper identity correction — PR216

This is a breaking correction to unreleased helpers, not a migration receipt or
current native acceptance claim.

## Compatibility decision

`with_seeds` treats entries as an effective map, sorted lexically by key before
namespace hashing. Existing unseeded keys and already-sorted seed maps retain
identity. Previously unsorted multi-key maps (including no-op overrides that
changed insertion order) do **not** retain the defective key identity.

`make_idempotency_key(alias, true)` now derives identity from the workflow task
UUID, effective seed map and alias only. Finite, cursor and ancestor iteration
scopes do not affect it. Previously generated loop-scoped true-mode keys change.
Iteration-specific keys retain their existing encoding.

These APIs are still in an unmerged draft. There is no automatic dual-read,
external-effect reconciliation, or migration of old keys. **Do not resume an
affected durable workflow across this change or reissue its external effects
with corrected keys.** Already-started effects need explicit reconciliation with
the external system and recorded old keys before adopting the corrected scheme.
A new task identity alone is not reconciliation: it also changes idempotency keys.
No compatibility claim is made for affected persisted workflows.

`state_ref`, `actor_ref`, and `make_idempotency_key` return `Result` so missing,
malformed or mismatched identities fail closed rather than panic, re-encode a
stored actor reference, or silently invent a random task seed.

The generated `WeakReference` identity/store/handler shell is removed. It had no
callable read/write/schedule/spawn behavior, despite documentation saying those
methods were generated. Existing untyped `ActorRef` remains identity-only.

The new `retry_reactively_until` and `retry` wrappers are removed rather than
preserving unsupported reactive-wait or durable-error-memoization promises.
Use the existing descriptor-bound `wait_reader` for supported same-actor predicate
waits; this does not add general Python reactive/retry parity. `until_changes`
and `until_truthy` are manually driven comparisons restricted to top-level finite
scopes (at most 1024 iterations), not reactive waiters. `memoize`/`memoize_unit`
cache successful completion only and can rerun a callback after failure or a
crash before acknowledgement; non-idempotent effects must not rely on them for
at-most-once delivery.

## Evidence boundary

Unit regressions exercise canonical stored-reference preservation (including
escaped slashes and composed references), invalid identity, equivalent effective
seed maps, workflow-wide identity across simulated finite/cursor/nested/restarted
contexts, and a recording external-key set. The set is a test double, not a real
external delivery or native restart proof. Actual generated-writer wake,
checkpoint replay and native Database restart/GC acceptance are separate gates.
