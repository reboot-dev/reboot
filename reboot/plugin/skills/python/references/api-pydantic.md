---
title: Define APIs in Pydantic (alternative to `.proto`)
impact: CRITICAL
impactDescription: Pydantic-defined APIs let you stay in Python end-to-end; same generation flow, different source
tags: pydantic, api, Model, Methods, Reader, Writer, Transaction, factory
---

## Define APIs in Pydantic (alternative to `.proto`)

> **Critical:**
>
> 1. Every `Field(tag=N)` needs an explicit default. Missing defaults
>    → `AttributeError` at first access (codegen uses
>    `model_construct()` which skips undeclared defaults).
> 2. `default=` **must be the type's zero value** (`""`, `0`, `0.0`,
>    `False`, empty list/dict). Non-zero defaults raise
>    `UserPydanticError` at import. Set domain defaults inside the
>    constructor or a `start`-style writer, not on the Field.
> 3. `list[<Model>]` and `dict[str, <Model>]` are **silently dropped**
>    by the codegen — encode records as `list[str]` (JSON) instead.

Reboot accepts API definitions in **either** `.proto` files or pydantic
`.py` files. Both feed the same `rbt generate` flow and produce the same
`<name>_rbt.py` import surface; the choice is purely about whether you
prefer staying in Python or in proto.

Use the pydantic form when the project is Python-only and you'd rather
avoid maintaining proto + protobuf tooling. The bank-pydantic example is
the canonical reference.

**Incorrect (mixing pydantic decls with stray hand-written `Servicer`
attributes):**

```python
# DON'T — Methods is the binding from name to method type; don't add
# attributes outside it.
from reboot.api import API, Field, Methods, Model, Writer

class AccountState(Model):
    balance: float = Field(tag=1)

class DepositRequest(Model):
    amount: float = Field(tag=1)

# Free-floating, never wired up:
deposit_request = DepositRequest
```

**Correct (matches the [`reboot-bank-pydantic`](https://github.com/reboot-dev/reboot-bank-pydantic) example, `api/bank/v1/pydantic/account.py`):**

```python
from reboot.api import API, Field, Methods, Model, Reader, Type, Writer


class AccountState(Model):
    balance: float = Field(tag=1)


class BalanceResponse(Model):
    amount: float = Field(tag=1)


class DepositRequest(Model):
    amount: float = Field(tag=1)


class WithdrawRequest(Model):
    amount: float = Field(tag=1)


class OverdraftError(Model):
    amount: float = Field(tag=1)


AccountMethods = Methods(
    balance=Reader(
        request=None,
        response=BalanceResponse,
        mcp=None,
    ),
    deposit=Writer(
        request=DepositRequest,
        response=None,
        mcp=None,
    ),
    withdraw=Writer(
        request=WithdrawRequest,
        response=None,
        errors=[OverdraftError],
        mcp=None,
    ),
    open=Writer(
        request=None,
        response=None,
        factory=True,
        mcp=None,
    ),
    interest=Writer(
        request=None,
        response=None,
        mcp=None,
    ),
)


api = API(
    Account=Type(
        state=AccountState,
        methods=AccountMethods,
    ),
)
```

## Mapping from Pydantic to Proto

| Proto                                            | Pydantic                                 |
| ------------------------------------------------ | ---------------------------------------- |
| `message <Name>`                                 | `class <Name>(Model)`                    |
| `<type> <field> = N;`                            | `<field>: <type> = Field(tag=N)`         |
| `option (rbt.v1alpha1.state) = {};`              | `Type(state=<NameState>, methods=...)`   |
| `option (rbt.v1alpha1.method).reader = {};`      | `Reader(request=..., response=...)`      |
| `option (rbt.v1alpha1.method).writer = {};`      | `Writer(request=..., response=...)`      |
| `option (rbt.v1alpha1.method).transaction = {};` | `Transaction(request=..., response=...)` |
| `option (rbt.v1alpha1.method).workflow = {};`    | `Workflow(request=..., response=...)`    |
| `constructor: {}`                                | `factory=True`                           |
| `errors: ["X"]`                                  | `errors=[X]`                             |

### `factory=True` Only Works on `Writer` and `Transaction`

`factory=True` is **only supported on `Writer` and
`Transaction`** — those are the proto-level method types whose
options carry a `constructor` field. `Reader` and `Workflow`
options don't, and `rbt generate` rejects the proto with:

```text
Error while parsing option value for "method": Message type
"rbt.v1alpha1.WorkflowMethodOptions" has no field named "constructor".
```

(Pydantic's `factory: bool` on the base class is permissive at
type-check time but the proto codegen rejects the bad shape.)

```python
# OK
open=Writer(... factory=True ...),       # Account.Open(ctx, id, ...)
place=Transaction(... factory=True ...), # Order.Place(ctx, id, ...)

# REJECTED by `rbt generate`
hello=Workflow(... factory=True ...),    # codegen error
get=Reader(... factory=True ...),        # codegen error
```

To kick off a workflow on actor creation, make the factory a
`Writer(factory=True)` or `Transaction(factory=True)` and have
its body call `self.ref().schedule().<workflow_name>(context, ...)`. See `workflow-method.md` for the full pattern.

Calling `<Type>.<MethodPascalCase>(ctx, <state-id>, **kwargs)`
both creates the actor AND runs the factory method. Don't try
to call factory methods through `<Type>.ref(<id>).<method>(...)`
— the actor doesn't exist yet.

### Every Method Factory Takes a Required `mcp=` Argument

`Reader`, `Writer`, `Transaction`, **and `Workflow`** all require an
explicit `mcp=` kwarg. The MCP-Apps integration uses it to control
tool exposure; in non-MCP projects (or for methods you don't want
exposed as tools) the right value is `mcp=None`. Omitting it raises
at codegen:

```text
1 validation error for Workflow
mcp
  Field required [type=missing, input_value=...]
```

```python
# All four factories — same shape:
balance=Reader(request=None, response=BalanceResponse, mcp=None),
deposit=Writer(request=DepositRequest, response=None, mcp=None),
transfer=Transaction(request=TransferRequest, response=None, mcp=None),
autoplay=Workflow(request=None, response=None, mcp=None),
```

Workflows in particular get caught by this — they're rarely
tool-callable directly, so the `mcp=` argument is easy to forget.

## Field Tags Are Required

`Field(tag=N)` corresponds to proto field numbers. They're required on
every field and must be unique within a `Model`.

## Every Field Needs an Explicit Default

The codegen builds the **initial** state with
`<Type>.State.model_construct()`, which in pydantic v2 skips fields that
don't declare a default. The resulting model object then raises
`AttributeError` the first time you read or write that field — typically
inside the constructor method, before any value has been set.

**Incorrect (no defaults — startup explodes on first access):**

```python
class GameState(Model):
    board: str = Field(tag=1)            # AttributeError on access
    turn: str = Field(tag=2)
    history: list[str] = Field(tag=3)
```

```text
AttributeError: 'GameState' object has no attribute 'history'
```

**Correct (every Field carries a default):**

```python
class GameState(Model):
    board: str = Field(tag=1, default="")
    turn: str = Field(tag=2, default="")
    history: list[str] = Field(tag=3, default_factory=list)
    score: int = Field(tag=4, default=0)
    paused: bool = Field(tag=5, default=False)
```

Use `default=<zero>` for scalar fields (`""`, `0`, `False`) and
`default_factory=list` / `default_factory=dict` for collections. This
applies to **state** Models, **request/response** Models, and **error**
Models — anywhere `model_construct` may run.

### `default=` Must Be the Type's Zero Value

The codegen mirrors proto3: the only legal `default=` is the field
type's **zero value**. Non-zero defaults raise
`reboot.api.UserPydanticError: Field 'X' in model 'Y' uses 'default' with an unsupported value. Supported default value for <type> is <zero>.`

**Incorrect (non-zero defaults are rejected at import time):**

```python
class CheckersState(Model):
    turn: str = Field(tag=1, default="r")          # rejected
    move_delay_seconds: float = Field(tag=2, default=1.0)  # rejected
    max_players: int = Field(tag=3, default=2)     # rejected
```

```text
reboot.api.UserPydanticError: Field `turn` in model `CheckersState` uses
`default` with an unsupported value. Supported default value for `str`
is ``.
```

**Correct (zero default in the API, real value set in the constructor):**

```python
class CheckersState(Model):
    turn: str = Field(tag=1, default="")
    move_delay_seconds: float = Field(tag=2, default=0.0)
    max_players: int = Field(tag=3, default=0)
```

Apply the real domain defaults inside the constructor method, gated on
`context.constructor` (or unconditionally inside `start`-style reset
methods):

```python
DEFAULT_MOVE_DELAY = 1.0


async def start(
    self, context: WriterContext, request: Checkers.StartRequest,
) -> None:
    self.state.turn = "r"
    self.state.move_delay_seconds = (
        request.move_delay_seconds
        if request.move_delay_seconds > 0.0
        else DEFAULT_MOVE_DELAY
    )
    ...
```

Same idea for an explicit constructor (see `servicer-constructor.md`):

```python
async def open(
    self, context: WriterContext, request: OpenRequest,
) -> None:
    if context.constructor:
        self.state.turn = "r"
        self.state.move_delay_seconds = DEFAULT_MOVE_DELAY
```

**Why this rule exists**: Reboot's API definition compiles to a
protobuf schema, and the protobuf schema has nowhere to store a
per-field default value. A non-zero `default=` on the pydantic Field
has no representation in the generated schema and would silently never
take effect — so the codegen rejects it eagerly with a clear error
rather than letting you wonder later why your declared default didn't
show up. Set domain defaults at write time (in the constructor or a
reset writer) instead.

## `list[<Model>]` Is Not Yet Supported

Current pydantic codegen (as of `reboot==1.0.4`) silently **drops**
fields whose type is a list of nested `Model` subclasses. The field
won't appear on the generated state object and reads/writes will raise
`AttributeError`. Until the codegen supports it, encode nested-record
collections yourself.

**Incorrect (list of nested Models is dropped):**

```python
class Move(Model):
    from_row: int = Field(tag=1, default=0)
    to_row: int = Field(tag=2, default=0)


class GameState(Model):
    history: list[Move] = Field(tag=1, default_factory=list)  # dropped
```

**Correct (encode each entry as a string or scalar):**

```python
class GameState(Model):
    # JSON-encoded move records, capped to the last N entries.
    history: list[str] = Field(tag=1, default_factory=list)


# In the servicer:
import json

state.history.append(json.dumps({
    "from_row": step.from_row,
    "to_row": step.to_row,
    ...
}))
```

`list[str]`, `list[int]`, `list[float]`, `list[bool]`, `dict[str, str]`
all work; `list[<Model>]` and `dict[str, <Model>]` do not.

## State Class Is a Separate `Model`

State is a plain `Model` class. Bind it to its method set and a public
type name via `Type(state=<NameState>, methods=<NameMethods>)` inside an
`API(...)` block. The generated module exports `<Name>` (e.g. `Account`)
with `<Name>.Servicer`, `<Name>.ref(id)`, and request/response messages
nested as attributes (`Account.BalanceResponse`, `Account.DepositRequest`,
etc.).

### Generated Request/Response Names Come From the **Method Name**

The codegen names the nested attributes after the **method name** in
PascalCase, with `Request` / `Response` appended — **not** after the
source class name you bound. The canonical access path is always:

```
<Type>.<MethodPascalCase>Request
<Type>.<MethodPascalCase>Response
```

So a method `create_checkers_game` on `User` exposes
`User.CreateCheckersGameRequest` and `User.CreateCheckersGameResponse`,
**regardless** of what you named the source `Model` class you passed
to `request=` / `response=`.

**Incorrect (assuming the source class name is what gets exposed, or
guessing the method PascalCase):**

```python
# API:
class CreateCheckersGameResponse(Model):
    game_id: str = Field(tag=1, default="")

api = API(
    User=Type(
        methods=Methods(
            create_checkers_game=Transaction(
                request=None,
                response=CreateCheckersGameResponse,
                mcp=Tool(),
            ),
        ),
        ...
    ),
)

# Servicer:
async def create_checkers_game(
    self, context: TransactionContext,
) -> User.CreateGameResponse:        # WRONG — method is create_checkers_game
    ...
    return User.CreateGameResponse(   # WRONG — same
        game_id=game.state_id,
    )
```

```text
AttributeError: type object 'User' has no attribute 'CreateGameResponse'
```

**Correct (method-derived name, not source-class-derived):**

```python
async def create_checkers_game(
    self, context: TransactionContext,
) -> User.CreateCheckersGameResponse:
    ...
    return User.CreateCheckersGameResponse(
        game_id=game.state_id,
    )
```

The source class name (`CreateCheckersGameResponse`,
`SomethingElseEntirely`, etc.) is just an internal binding. What
shows up at runtime is `<Type>.<MethodPascalCase>{Request,Response}`.

## Servicer Methods Use Nested Request/Response Names

Pydantic-style Servicers reference request/response classes through the
generated `<Name>` namespace, and methods that have `request=None` /
`response=None` simply skip the corresponding parameter or return value.
Pattern from [`reboot-bank-pydantic`](https://github.com/reboot-dev/reboot-bank-pydantic), `backend/src/account_servicer.py`:

```python
from bank.v1.pydantic.account import OverdraftError
from bank.v1.pydantic.account_rbt import Account
from reboot.aio.contexts import ReaderContext, WriterContext


class AccountServicer(Account.Servicer):

    async def balance(
        self,
        context: ReaderContext,
    ) -> Account.BalanceResponse:
        return Account.BalanceResponse(amount=self.state.balance)

    async def withdraw(
        self,
        context: WriterContext,
        request: Account.WithdrawRequest,
    ) -> None:
        self.state.balance -= request.amount
        if self.state.balance < 0:
            raise Account.WithdrawAborted(
                OverdraftError(amount=-self.state.balance)
            )
```

## `.rbtrc` Is the Same

`generate api/` finds both `.proto` and `.py` API definition files; the
rest of `.rbtrc` is identical to a proto-based project (see
`lifecycle-rbtrc.md`).
