## Constructors moved under a `factory` namespace

Constructor (a.k.a. factory) methods are no longer exposed directly on
a state type. They now live under a `factory` namespace on the type,
so the top-level namespace is free for framework methods like `ref()`.
This only changes how constructors are **called** — the way you
**declare** one (`factory=True` on a writer/transaction, or the
`constructor` proto option) is unchanged.

For every call that invokes a constructor **directly on a state type**
(i.e. on the class itself, not on a `.ref(...)` handle), insert
`.factory` between the type and the method:

- `await Foo.create(context, ...)` → `await Foo.factory.create(context, ...)`
- Custom-named constructors too, e.g. `await Account.open(context, ...)`
  → `await Account.factory.open(context, ...)`.
- Class-level idempotency-scoped construction moves under `factory` as
  well: `Foo.idempotently(...)`, `Foo.per_workflow(...)`,
  `Foo.per_iteration(...)`, `Foo.always(...)` (TypeScript:
  `Foo.perWorkflow(...)`, `Foo.perIteration(...)`) when invoked on the
  **class** to construct → `Foo.factory.idempotently(...)`, etc. So
  `await Foo.idempotently("alias").create(context)` becomes
  `await Foo.factory.idempotently("alias").create(context)`.

How to find them: a method invoked directly on a state-type class is
_necessarily_ a constructor — every other method requires a `.ref(...)`
handle. So in `backend/` (Python and TypeScript), search for
`<StateType>.<method>(` calls where `<StateType>` is a generated state
type imported from a `*_rbt`/`*_reboot` module and the call is made on
the bare class (the first argument is a `context`). Rewrite each as
`<StateType>.factory.<method>(`.

Leave these unchanged:

- Calls on a `.ref(...)` handle, including the reference-construction
  form `Foo.ref(id).create(context)` and inline writers like
  `Foo.ref().per_workflow("a").write(context, fn)`.
- `Foo.ref(...)` and `Foo.forall(...)` themselves.
- `factory=True` declarations and the `constructor` proto option.
- Implicit construction on first write (no explicit constructor call).
