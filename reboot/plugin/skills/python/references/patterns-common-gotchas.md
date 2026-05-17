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

### 3. No `__init__.py` in `api/`

Hand-written `__init__.py` files in `api/` confuse `rbt generate`'s
package detection.

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
proto method needs to be `writer` or `transaction`.

### 8. Cross-Actor Calls Need a Transaction

A `writer` can only mutate one actor (its own). Cross-actor work or
external side effects belong in a method marked `transaction: {}`.

### 9. `initialize` Runs on Every Restart

It's idempotent only if **you** make it so. Use `Service.create` and
`context.constructor` to gate set-once work.

### 10. Don't Hand-Edit `*_rbt.py`

Any change you make to a generated file is overwritten the next time `rbt generate` runs (which `rbt dev run` does on file change). Edit the proto
instead.

### 11. State Defaults Are Proto3 Zero-Values

You cannot declare `[default = X]` in proto3. To seed non-zero state, do
it in a constructor method using `context.constructor`.

### 12. Register Stdlib Libraries

`SortedMap` requires `libraries=[sorted_map_library()]` in the
`Application(...)` call. Forgetting it gives a runtime error about
unknown actor type.

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

### 15. Pydantic Codegen Doesn't Support `list[<Model>]`

Lists of nested `Model` subclasses are silently dropped by the current
codegen. Encode collections of records as `list[str]` (e.g. JSON) until
the codegen catches up. `list[str]`, `list[int]`, `list[float]`,
`list[bool]`, `dict[str, str]` are fine.

### 16. `self.state_id` Doesn't Exist; Use `self.ref().state_id`

Inside a Servicer (writer/reader/transaction), get the actor's ID via
`self.ref().state_id`. Inside a workflow `@classmethod`, use
`context.state_id`. Plain `self.state_id` raises `AttributeError: 'XServicer' object has no attribute 'state_id'`.

### 17. Generated Request/Response Names Come From the Method Name

`<Type>.<MethodPascalCase>Request` and
`<Type>.<MethodPascalCase>Response` — the source class names you
passed to `request=`/`response=` are **internal**. A method
`create_checkers_game` is always exposed as
`User.CreateCheckersGameRequest`/`Response`, regardless of source
name. Mismatching the method PascalCase raises `AttributeError: type object '<Type>' has no attribute '<WrongName>'`. See
`api-pydantic.md` for the full rule.

### 18. `Workflow(...)` Needs `mcp=` Just Like the Other Factories

Easy to miss because workflows are rarely AI-callable. Missing it:

```text
1 validation error for Workflow
mcp
  Field required [type=missing, input_value=...]
```

Set `mcp=None` for non-tool workflows.

### 19. Inline Writer Parameter Must Be Named `state`

The runtime calls the writer as `writer(state=typed_state)`. Renaming
the parameter raises `TypeError: ... got an unexpected keyword argument 'state'`. Always:

```python
async def fn(state):
    state.x += 1
await Service.ref().write(context, fn)
```
