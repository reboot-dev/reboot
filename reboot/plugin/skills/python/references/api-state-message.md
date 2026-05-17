---
title: Mark State Messages with `option (rbt.v1alpha1.state)`
impact: CRITICAL
impactDescription: Without the state option a message has no servicer or actor identity
tags: state, option, fields, defaults, rbt
---

## Mark State Messages with `option (rbt.v1alpha1.state)`

> **Critical:** state messages get `option (rbt.v1alpha1.state) = {};`.
> A `service <Name>Methods { ... }` block in the same file is
> **required, even if empty** — `rbt generate` rejects the proto with
> `Missing Reboot service named '<pkg>.<Name>Methods'` if you omit
> it. Multiple state messages can live in one `.proto`, each
> needing its own paired `<Name>Methods` service block.

A message becomes a Reboot **state machine** (an actor, identifiable by
string ID) by adding `option (rbt.v1alpha1.state) = {};` inside it. The
generated code produces `<Name>` (the message), `<Name>.Servicer` (the base
class to implement), and `<Name>.ref(id)` (the actor reference factory).

Every state message needs a paired `service <Name>Methods { ... }` block
in the same file — even if you have no methods to declare yet, an empty
block is required. `rbt generate` enforces this and rejects the proto
otherwise:

```text
Error processing 'bank/v1/bank.proto': Missing Reboot service named
'bank.v1.BankAccountMethods'; expected by state message
'bank.v1.BankAccount' defined in 'bank/v1/bank.proto'.
```

**Incorrect (plain proto message — no servicer is generated):**

```proto
message Account {
  string name = 1;
  int64 balance = 2;
}
```

**Correct (matches the [`reboot-bank`](https://github.com/reboot-dev/reboot-bank) example, `api/bank/v1/bank.proto`):**

```proto
message Account {
  option (rbt.v1alpha1.state) = {};

  string name = 1;
  int64 balance = 2;
}

service AccountMethods {
  rpc Balance(BalanceRequest) returns (BalanceResponse) {
    option (rbt.v1alpha1.method) = { reader: {} };
  }
  rpc Deposit(DepositRequest) returns (DepositResponse) {
    option (rbt.v1alpha1.method) = { writer: {} };
  }
}
```

## Field Numbers and Defaults

Proto3 zero-values are the defaults: `0` for numerics, `""` for strings,
empty for `repeated` and `bytes`. Don't try to specify other defaults; if
you need non-zero initial state, set it in the constructor method (see
`servicer-constructor.md`).

```proto
message Account {
  option (rbt.v1alpha1.state) = {};

  string name = 1;       // default ""
  int64 balance = 2;     // default 0
  repeated string tags = 3;  // default []
}
```

## One State Per Message

Each `state` message corresponds to one actor type. A single proto file can
declare multiple state messages, each with its own service block. The
`bank.proto` example declares both `Account` and `Bank`.

## State Is Per-ID

`Account.ref("alice")` and `Account.ref("bob")` are independent actors with
independent state. The ID is supplied by the caller (constructor flow) or
by `Service.create(context, id)`.
