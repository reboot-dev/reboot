---
title: Mark Methods as `reader`, `writer`, `transaction`, or `workflow`
impact: CRITICAL
impactDescription: The marker drives the context type, isolation, and access semantics
tags: method, reader, writer, transaction, workflow, constructor, options
---

## Mark Methods as `reader`, `writer`, `transaction`, or `workflow`

> **Critical:** the marker fixes the Servicer method's context type:
> `reader: {}` → `ReaderContext`; `writer: {}` → `WriterContext`;
> `transaction: {}` → `TransactionContext`; `workflow: {}` →
> `WorkflowContext` (and the implementation must be a `@classmethod`,
> with no `self.state`). Wrong context type = runtime error.

Every RPC inside a state's service block must carry one of four method
markers. The marker chooses the context type passed to the Servicer method
and the isolation level applied:

- **`reader: {}`** — read-only access to `self.state`. Multiple readers
  may run concurrently. Servicer signature: `context: ReaderContext`.
- **`writer: {}`** — mutates `self.state` for one actor. Serialized with
  other writes/transactions on that actor. Signature: `context: WriterContext`.
- **`transaction: {}`** — atomic across multiple actors and external
  effects. Signature: `context: TransactionContext`.
- **`workflow: {}`** — durable, long-running, restartable. Implemented as
  a `@classmethod` (no `self.state`). Signature: `context: WorkflowContext`.
  See the `workflow-*` reference category for the primitives
  (`at_most_once`, `at_least_once`, `until`, `until_changes`,
  `context.loop`, and state mutation via `ref().write(context, fn)`).

**Incorrect (no marker — code-gen will error):**

```proto
service AccountMethods {
  rpc Balance(BalanceRequest) returns (BalanceResponse) {}
}
```

**Correct (matches the [`reboot-bank`](https://github.com/reboot-dev/reboot-bank) example, `api/bank/v1/bank.proto`):**

```proto
service AccountMethods {
  rpc Balance(BalanceRequest) returns (BalanceResponse) {
    option (rbt.v1alpha1.method) = { reader: {} };
  }

  rpc Deposit(DepositRequest) returns (DepositResponse) {
    option (rbt.v1alpha1.method) = { writer: {} };
  }
}

service BankMethods {
  rpc Transfer(TransferRequest) returns (TransferResponse) {
    option (rbt.v1alpha1.method) = { transaction: {} };
  }
}
```

## `constructor: {}` Marks the Creation Method

A `writer` or `transaction` method nested under `constructor: {}` is the
explicit creation path for the actor. The Servicer can branch on
`context.constructor` to set initial state:

```proto
rpc Open(OpenRequest) returns (OpenResponse) {
  option (rbt.v1alpha1.method) = {
    writer: {
      constructor: {},
    },
  };
}
```

A state without an explicit constructor is created implicitly on first
write (see `lifecycle-initialize-hook.md`).

## Pick the Right Marker

- Reading `self.state` only? → `reader`
- Mutating `self.state` for **one** actor, no calls to other actors? → `writer`
- Mutating across multiple actors, calling external services, or both,
  in a single one-shot transaction? → `transaction`
- Long-running, durable, restartable work (control loops, agents,
  multi-step orchestration)? → `workflow`

Wrong-marker symptoms include "context type mismatch" runtime errors and
deadlocks when a `writer` tries to call into another actor.

## `errors: [...]` Declares Typed Errors

Error message types declared elsewhere in the proto can be attached to a
method, making them part of the typed contract:

```proto
rpc Withdraw(WithdrawRequest) returns (WithdrawResponse) {
  option (rbt.v1alpha1.method) = {
    writer: {},
    errors: [ "OverdraftError" ],
  };
}

message OverdraftError {
  uint64 amount = 1;
}
```

See `api-errors.md` for raising and catching them.

## See Also

After choosing markers, load the references that make those choices
work end-to-end:

- **Pydantic users**: `api-pydantic.md`. The marker → factory mapping
  is different (`Reader(...)`, `Writer(...)`, `Transaction(...)`,
  `Workflow(...)`, with `factory=True` for constructors), and
  pydantic-only rules apply (zero-default Fields,
  `list[<Model>]` not supported).
- **Implementation per marker** — read the matching servicer file:
  - `reader: {}` → `servicer-reader.md`
  - `writer: {}` → `servicer-writer.md`
  - `transaction: {}` → `servicer-transaction.md`
  - `workflow: {}` → `workflow-method.md` (the entire `workflow-*`
    family covers the durable primitives)
  - `constructor: {}` → `servicer-constructor.md`
- **Calling these methods**: `rpc-calls.md` (kwargs convention) and
  `rpc-refs.md` (`self.ref().state_id`, never `self.state_id`).
