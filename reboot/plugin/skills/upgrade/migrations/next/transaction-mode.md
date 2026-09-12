## Every transaction must declare `exclusive` or `shared`

A transaction method now says how it holds the lock on its own state
while it runs, and `rbt generate` refuses one that does not. There is
no default: the choice matters for both throughput and deadlocks, so
each transaction makes it.

- **Exclusive.** The transaction takes the lock on its own state
  exclusive from the start, so that concurrent callers of the same
  state queue behind it. The choice for a transaction that writes its
  own state, which is most of them: two such transactions can never
  run to completion concurrently anyway, and starting shared is what
  lets them deadlock when both try to upgrade.
- **Shared.** The transaction takes the lock shared and upgrades it to
  exclusive only if it writes its own state, so that callers proceed
  concurrently while none of them writes it. This was the behavior of
  every transaction before this change. The choice for a transaction
  that mostly reads its own state while writing others, such as the
  root of a tree of states that every call descends through.

When in doubt, choose exclusive: it is never wrong, only sometimes
slower. Choose shared only for a transaction whose body reads its own
state and rarely, or never, writes it.

Apply the declaration in whichever API surface the application uses.

**Hand-written `.proto` files.** Add `exclusive: {}` or `shared: {}`
inside the `transaction` options. Two option spellings are in use.

Full form:

```proto
// Before.
option (rbt.v1alpha1.method) = {
  transaction: {},
  errors: [ "OverdraftError" ],
};

// After.
option (rbt.v1alpha1.method) = {
  transaction: { exclusive: {} },
  errors: [ "OverdraftError" ],
};
```

Shorthand form, keeping any `constructor: {}` that is already there:

```proto
// Before.
option (rbt.v1alpha1.method).transaction = {
  constructor: {},
};

// After.
option (rbt.v1alpha1.method).transaction = {
  constructor: {},
  exclusive: {},
};
```

**Pydantic API files (`reboot.api`).** Add `mode=Exclusive()` or
`mode=Shared()` to every `Transaction(...)`, and import `Exclusive`
or `Shared` from `reboot.api`:

```python
# Before.
transfer=Transaction(
    request=TransferRequest,
    response=None,
    mcp=None,
),

# After.
transfer=Transaction(
    mode=Exclusive(),
    request=TransferRequest,
    response=None,
    mcp=None,
),
```

**Zod API files (`@reboot-dev/reboot-api`).** Add `mode: exclusive()`
or `mode: shared()` to every `transaction({...})`, and import
`exclusive` or `shared` from `@reboot-dev/reboot-api`:

```ts
// Before.
transfer: transaction({
  request: { ... },
  response: z.void(),
}),

// After.
transfer: transaction({
  mode: exclusive(),
  request: { ... },
  response: z.void(),
}),
```

Choosing or later changing a transaction's mode is a
backwards-compatible change: it changes how concurrent callers are
scheduled, not what is sent or stored.
