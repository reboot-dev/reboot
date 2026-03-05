<div align="center">

<img src="https://docs.reboot.dev/img/reboot-logo-green.svg"
     alt="Reboot" width="200" />

# Reboot

**Reactive, durable backends — built from code, not configuration.**

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![PyPI](https://img.shields.io/pypi/v/reboot)](https://pypi.org/project/reboot/)
[![npm](https://img.shields.io/npm/v/@reboot-dev/reboot)](https://www.npmjs.com/package/@reboot-dev/reboot)
[![Discord](https://img.shields.io/badge/Discord-join-5865F2?logo=discord&logoColor=white)](https://discord.gg/cRbdcS94Nr)
[![Docs](https://img.shields.io/badge/docs-reboot.dev-green)](https://docs.reboot.dev/)

</div>

---

Reboot is a framework for building **reactive backends out of durable data
structures** that safely compose into scalable distributed systems. With
Reboot, you just write business logic — no wiring up databases, caches,
queues, or retry loops.

State survives failures by default. ACID transactions span multiple states.
The React frontend stays in sync in real time. And your backend is
automatically an MCP server.

## Installation

**Python**

```sh
pip install reboot
```

**TypeScript / Node.js**

```sh
npm install @reboot-dev/reboot
```

Both packages include the `rbt` CLI.

## MCP — your backend is the server

Annotate methods with `mcp=McpOptions(...)` and Reboot auto-generates MCP
tools and resources directly from your API definition. No separate MCP server,
no glue code.

**API definition**

```python
from reboot.api import (
    API, Field, McpApp, McpOptions, Methods,
    Model, Reader, Transaction, Type, Writer,
)

class TodoListState(Model):
    uncompleted: list[str] = Field(tag=1, default_factory=list)

TodoListMethods = Methods(
    add=Transaction(
        request=TodoListAddRequest,
        response=TodoListAddResponse,
        mcp=McpOptions(
            tool=True,
            name="add_todo",
            title="Add Todo",
            description="Add a new Todo to the list.",
        ),
    ),
    complete=Transaction(
        request=TodoListCompleteRequest,
        response=None,
        mcp=McpOptions(
            tool=True,
            name="complete_todo",
            description="Mark a Todo as completed.",
        ),
    ),
    get_uncompleted=Reader(
        request=None,
        response=TodoListGetUncompletedResponse,
        mcp=McpOptions(
            tool=True,
            resource=True,         # also exposed as an MCP resource
            name="get_uncompleted_todos",
            description="Get all uncompleted Todos.",
        ),
    ),
)

api = API(
    TodoList=Type(
        state=TodoListState,
        methods=TodoListMethods,
        mcp_apps=[
            McpApp(
                name="todo_list",
                title="Todo List",
                description="Interactive todo list UI with drag and drop.",
            ),
        ],
    ),
)
```

**Application entry point**

```python
from reboot.experimental.mcp import Application

async def main() -> None:
    application = Application(
        servicers=[TodoServicer, TodoListServicer],
    )
    await application.run()
```

That's it. `rbt dev run` starts a server that speaks both the Reboot protocol
and MCP — connect any MCP client (Claude Desktop, Cursor, MCPJam) and the
tools are ready.

The example also includes a **background research workflow** powered by Claude:
annotate a method with `Workflow` and Reboot durably executes it, surviving
restarts and crashes.

## A taste of Reboot

**Python — API definition**
([`bank-pydantic/api/bank/v1/pydantic/account.py`](reboot/examples/bank-pydantic/api/bank/v1/pydantic/account.py))

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
    balance=Reader(request=None, response=BalanceResponse),
    deposit=Writer(request=DepositRequest, response=None),
    withdraw=Writer(
        request=WithdrawRequest,
        response=None,
        errors=[OverdraftError],
    ),
)

api = API(
    Account=Type(
        state=AccountState,
        methods=AccountMethods,
    ),
)
```

**Python — servicer**
([`bank-pydantic/backend/src/account_servicer.py`](reboot/examples/bank-pydantic/backend/src/account_servicer.py))

```python
from bank.v1.pydantic.account import OverdraftError
from bank.v1.pydantic.account_rbt import Account
from reboot.aio.auth.authorizers import allow
from reboot.aio.contexts import ReaderContext, WriterContext

class AccountServicer(Account.Servicer):

    def authorizer(self):
        return allow()

    async def balance(
        self,
        context: ReaderContext,
    ) -> Account.BalanceResponse:
        return Account.BalanceResponse(amount=self.state.balance)

    async def deposit(
        self,
        context: WriterContext,
        request: Account.DepositRequest,
    ) -> None:
        self.state.balance += request.amount

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

**Python — ACID transaction across two states**
([`bank-pydantic/backend/src/bank_servicer.py`](reboot/examples/bank-pydantic/backend/src/bank_servicer.py))

```python
async def transfer(
    self,
    context: TransactionContext,
    request: Bank.TransferRequest,
) -> None:
    from_account = Account.ref(request.from_account_id)
    to_account = Account.ref(request.to_account_id)

    await from_account.withdraw(context, amount=request.amount)
    await to_account.deposit(context, amount=request.amount)
```

If anything fails — crash, network error, or the overdraft check — both
operations roll back automatically.

**React frontend — no polling, no WebSocket boilerplate**
([`bank-zod/web/src/App.tsx`](reboot/examples/bank-zod/web/src/App.tsx))

```tsx
import { useBank } from "../../api/bank/v1/bank_rbt_react";

const bank = useBank({ id: "reboot-bank" });
const { response } = bank.useAccountBalances();

bank.transfer({ fromAccountId, toAccountId, amount: 100 });
```

TypeScript users can define schemas with **Zod** instead of Pydantic — same
runtime guarantees, same generated hooks. See the
[`bank-zod`](reboot/examples/bank-zod/) example.

## Running locally

```sh
rbt dev run
```

`rbt dev run` generates code, starts your app, and watches for changes.

## Key features

**MCP server, automatically.** Annotate any method with `mcp=McpOptions(...)`
and it becomes an MCP tool or resource. No separate server, no glue code.

**Durable state by default.** States survive process crashes, deployments, and
chaos. No external database required for development.

**ACID transactions across states.** `TransactionContext` methods compose
atomically across many state instances running on different machines.

**Reactive React frontend.** Generated hooks keep your UI in sync without
polling, WebSockets, or manual cache management.

**Method type system.** `reader` (concurrent, read-only), `writer`
(serialized, mutating), `transaction` (ACID, cross-state), `workflow`
(long-running, durable, cancellable). The runtime enforces these guarantees.

**Schema-first, code-generated.** Define schemas using Pydantic (Python) or
Zod (TypeScript). Reboot generates type-safe client, server, and React stubs.

**Standard library included.** Sorted maps, ordered maps, queues, pub/sub,
and presence tracking — distributed data structures you use like local objects.

## Get started

### Quickstarts

- [TypeScript quickstart](https://docs.reboot.dev/get_started/typescript_backend)
- [Python quickstart](https://docs.reboot.dev/get_started/python_backend)
- [Exposed examples](https://docs.reboot.dev/get_started/examples/)

## Deployment

**Reboot Cloud** (recommended) — fully managed, horizontally scaled:

```sh
rbt cloud up
```

**Self-hosted** — deploy with `rbt serve run` on your own infrastructure:

```sh
rbt serve run
```

For Kubernetes, use the official Helm chart:

```sh
helm repo add reboot-dev https://reboot-dev.github.io/helm-charts
helm install my-release reboot-dev/reboot -f my-values.yaml
```

## Documentation

Full documentation at [docs.reboot.dev](https://docs.reboot.dev/).

## Community

- **Discord**: [discord.gg/cRbdcS94Nr](https://discord.gg/cRbdcS94Nr) — fastest way to get help or share what you're building
- **Issues**: [github.com/reboot-dev/reboot/issues](https://github.com/reboot-dev/reboot/issues)

Contributions are welcome. Open an issue to discuss substantial changes before
sending a pull request.

## License

[Apache 2.0](LICENSE)
