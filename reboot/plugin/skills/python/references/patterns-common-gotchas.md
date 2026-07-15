---
title: Common Reboot Python Gotchas
impact: MEDIUM
impactDescription: Each item here breaks startup or causes subtle runtime errors
tags: patterns, gotchas, anti-patterns, mistakes
---

## Common Reboot Python Gotchas

The shortlist of things that bite. None of these are speculative — they
all show up in real Reboot Python code review.

### 1. `.rbtrc` Is Line-Based, Not YAML

Don't write nested YAML in `.rbtrc`; one flag per line:

```sh
generate api/
generate --python=backend/api/
dev run --python
dev run --application=backend/src/main.py
```

### 2. `.rbtrc` Uses `--application-name` (Not `--name`) on `reboot>=1.0.4`

The canonical persistence flag is `dev run --application-name=<app>`.
The older `--name` still works as a deprecated alias but prints a
console warning on every `rbt dev run`. Write fresh `.rbtrc` with
`--application-name`; fix old `.rbtrc` that still has `--name` rather
than ignoring the warning.

### 3. No `__init__.py` in `api/` — or Anywhere Else

Hand-written `__init__.py` files in `api/` confuse `rbt generate`'s
package detection, and the `backend/` tree doesn't need them either
(`.mypy.ini` sets `explicit_package_bases`; see
`lifecycle-project-setup.md`). Never create them.

### 4. Pass Kwargs, Not Request Wrappers

```python
# Wrong:
await account.deposit(context, DepositRequest(amount=10))
# Right:
await account.deposit(context, amount=10)
```

### 5. Constructor Calls Use `Service.create` / `Service.<ctor>`

Don't call a constructor through `.ref(id).method(...)`. Use the factory
form so creation semantics apply:

```python
# Wrong:
await Account.ref(id).open(context)
# Right:
account, _ = await Account.open(context, id)
```

### 6. Servicer `authorizer()` Returns an Instance

```python
# Wrong:
def authorizer(self): return allow
# Right:
def authorizer(self): return allow()
```

### 7. Reader Methods Cannot Mutate `self.state`

Mutations inside a `ReaderContext` raise. If you need to mutate, the
method needs to be a `Writer` or `Transaction`.

### 8. Cross-Actor Mutations Need a Transaction; All External Calls Need a Workflow

A `Writer` can only mutate one actor (its own). Cross-actor
mutations belong in a `Transaction(...)` method. A writer or
transaction **may** call readers on other actors — cross-actor
reads are fine.

External side effects — any call that leaves the system: SMS,
email, payment, third-party APIs, LLM/model calls, filesystem
writes — must **not** happen in a `Writer` or a `Transaction`,
**even when the external call is idempotent**. Two reasons stack:

- **Atomicity.** A `Writer` may be invoked inside a `Transaction`,
  and a transaction is all-or-nothing — if it aborts, every
  mutation rolls back, but the external call already happened.
  The same applies to a transaction that makes the call directly.
- **Re-execution.** Writer and transaction bodies may also
  re-execute under transient retries and dev-mode **effect
  validation** (which re-runs the body to assert state mutations
  are deterministic), firing the external call more than once.
  A real bug: an SMS login code sent twice with the first code
  invalidated.

Put the external call in a `Workflow` and pick the right primitive
per `servicer-workflow.md`. The
on-demand "do it now" entry point is a `Writer`/`Transaction` that
only **schedules** the workflow
(`await self.ref().schedule().<workflow_method>(context)`); the
external call itself lives in the workflow. See
`servicer-workflow.md` and "External Calls Belong in a
Workflow, Not a Transaction" in `servicer-transaction.md`.

### 9. `initialize` Runs on Every Restart

It's idempotent only if **you** make it so. Use `Service.create` and
`context.constructor` to gate set-once work.

### 10. Don't Hand-Edit `*_rbt.py`

Any change you make to a generated file is overwritten the next time
`rbt generate` runs (which `rbt dev run` does on file change). Edit
the API definition file instead.

### 11. State Defaults Must Be the Type's Zero Value

You cannot declare a non-zero `default=` on a `Field(tag=N)` —
non-zero defaults are rejected at import. To seed non-zero state, do
it in a constructor method using `context.constructor`.

### 12. Register Stdlib Libraries

`OrderedMap` requires `libraries=[ordered_map_library()]` in the
`Application(...)` call. Forgetting it gives a runtime error about
unknown actor type. The same shape applies to every stdlib state
type with a `<thing>_library()` factory.

### 13. Servicer Class, Not Instance, in `Application(...)`

```python
# Wrong:
await Application(servicers=[ChatRoomServicer()]).run()
# Right:
await Application(servicers=[ChatRoomServicer]).run()
```

### 14. Pydantic `Field(tag=N)` Needs an Explicit Zero-Value Default

Two layered rules:

1. Every Field needs an explicit default — `model_construct()` skips
   fields without one, and reads then `AttributeError`.
2. The default **must be the type's zero value** (`""`, `0`, `0.0`,
   `False`, empty list/dict). Non-zero defaults are rejected at import
   time:

   ```text
   reboot.api.UserPydanticError: Field `turn` in model `CheckersState`
   uses `default` with an unsupported value. Supported default value
   for `str` is ``.
   ```

Always declare zero defaults; set domain defaults inside the
constructor method (or a `start`-style reset writer):

```python
class GameState(Model):
    board: str = Field(tag=1, default="")
    turn: str = Field(tag=2, default="")           # not default="r"
    move_delay_seconds: float = Field(tag=3, default=0.0)  # not 1.0
    history: list[str] = Field(tag=4, default_factory=list)
    paused: bool = Field(tag=5, default=False)


async def open(
    self, context: WriterContext, request: OpenRequest,
) -> None:
    if context.constructor:
        self.state.turn = "r"
        self.state.move_delay_seconds = 1.0
```

### 15. `self.state_id` Doesn't Exist; Use `self.ref().state_id`

Inside a Servicer (writer/reader/transaction), get the actor's ID via
`self.ref().state_id`. Inside a workflow `@classmethod`, use
`context.state_id`. Plain `self.state_id` raises `AttributeError: 'XServicer' object has no attribute 'state_id'`.

### 16. Generated Request/Response Names Come From the Method Name

`<Type>.<MethodPascalCase>Request` and
`<Type>.<MethodPascalCase>Response` — the source class names you
passed to `request=`/`response=` are **internal**. A method
`create_checkers_game` is always exposed as
`User.CreateCheckersGameRequest`/`Response`, regardless of source
name. Mismatching the method PascalCase raises `AttributeError: type object '<Type>' has no attribute '<WrongName>'`. See
`api-pydantic.md` for the full rule.

### 17. `Workflow(...)` Needs `mcp=` Just Like the Other Factories

Easy to miss because workflows are rarely AI-callable. Missing it:

```text
1 validation error for Workflow
mcp
  Field required [type=missing, input_value=...]
```

Set `mcp=None` for non-tool workflows.

### 18. Secrets Don't Belong in Plain `str` Fields

A `str`/`bytes` scalar field is plaintext at rest. Passwords, API keys,
session tokens, and PII must **never** be stored that way — the "it's
just a string" reflex is the trap. Encrypt with the `Ciphertext` stdlib
type and store the returned `state_id` instead:

```python
# Wrong — API key in plaintext at rest:
api_key: str = Field(tag=1, default="")
# Right — store the Ciphertext id; the secret is encrypted:
api_key_id: str = Field(tag=1, default="")
```

**OAuth access/refresh tokens are the exception** — don't hand-roll
`Ciphertext` for them; use the purpose-built `OAuthTokenManager`
(`stdlib-oauth-tokens.md`), which with `store_tokens=True` captures and
encrypts them automatically.

See `stdlib-ciphertext.md` and "Never Store Secrets in Plain Scalar
Fields" in `state-scalar-fields.md`.

### 19. Inline Writer Parameter Must Be Named `state`

The runtime calls the writer as `writer(state=typed_state)`. Renaming
the parameter raises `TypeError: ... got an unexpected keyword argument 'state'`. Always:

```python
async def fn(state):
    state.x += 1
await Service.ref().write(context, fn)
```

### 19. Schema Evolution Is Additive-Only Once State Persists

Changing the API of an application that has persisted state or has
been deployed can make it fail to boot ("Updated state or method
definitions are not backwards compatible") and get its deploy
rejected. Read `api-schema-evolution.md` for the rules you must
follow before changing such an API.
