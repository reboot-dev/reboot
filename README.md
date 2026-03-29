<div align="center">

<img src="https://docs.reboot.dev/img/reboot-logo-green.svg"
     alt="Reboot" width="200" />

# Reboot

**Build AI Chat Apps — and full-stack web apps — with reactive, durable backends.**

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![PyPI](https://img.shields.io/pypi/v/reboot)](https://pypi.org/project/reboot/)
[![npm](https://img.shields.io/npm/v/@reboot-dev/reboot)](https://www.npmjs.com/package/@reboot-dev/reboot)
[![Discord](https://img.shields.io/badge/Discord-join-5865F2?logo=discord&logoColor=white)](https://discord.gg/cRbdcS94Nr)
[![Docs](https://img.shields.io/badge/docs-reboot.dev-green)](https://docs.reboot.dev/)

</div>

---

Reboot is a framework for building **reactive, stateful, multiplayer AI chat
apps** — visual apps that run inside ChatGPT, Claude, VS Code, Goose, and more.
It also builds full-stack web apps with reactive backends and React frontends.

With Reboot, you just write business logic — no wiring up databases, caches,
queues, or retry loops. State survives failures by default. ACID transactions
span multiple states. The React frontend stays in sync in real time. And your
backend is automatically an MCP server.

## AI Chat Apps

Build visual, interactive apps that run inside AI chat interfaces. Define a
`Session` type as an entry point and your methods automatically become tools
the AI can call:

```python
from reboot.api import (
    API, Field, Methods, Model, Reader, Tool,
    Transaction, Type, UI, Writer,
)


class CreateCounterResponse(Model):
    counter_id: str = Field(tag=1)


class UserState(Model):
    pass


class CounterState(Model):
    value: int = Field(tag=1, default=0)


class GetResponse(Model):
    value: int = Field(tag=1)


class IncrementRequest(Model):
    """Request with an amount parameter."""
    amount: int | None = Field(tag=1, default=None)


api = API(
    User=Type(
        state=UserState,
        methods=Methods(
            create_counter=Transaction(
                request=None,
                response=CreateCounterResponse,
                description="Create a new Counter.",
            ),
        ),
    ),
    Counter=Type(
        state=CounterState,
        methods=Methods(
            show_clicker=UI(
                request=None,
                path="web/ui/clicker",
                title="Counter Clicker",
                description="Interactive clicker UI.",
            ),
            create=Writer(
                request=None,
                response=None,
                factory=True,
            ),
            get=Reader(
                request=None,
                response=GetResponse,
                description="Get the current counter "
                "value.",
                mcp=Tool(),
            ),
            increment=Writer(
                request=IncrementRequest,
                response=None,
                description="Increment the counter.",
                mcp=Tool(),
            ),
        ),
    ),
)
```

### Dive in!

- [What is an AI Chat App?](https://docs.reboot.dev/ai_chat_apps/what_is)
- [Get Started (Python)](https://docs.reboot.dev/ai_chat_apps/get_started)
- [AI Chat App Examples](https://docs.reboot.dev/ai_chat_apps/examples)

## Full-stack apps

Build reactive backends with React frontends — great as a full-page extension
of your AI chat app, or as a standalone web app.

- [TypeScript Quickstart](https://docs.reboot.dev/full_stack_apps/typescript)
- [Python Quickstart](https://docs.reboot.dev/full_stack_apps/python)
- [Full-stack Examples](https://docs.reboot.dev/full_stack_apps/examples)

## Key features

**Automatic MCP server.** `Session` methods are automatically exposed as
MCP tools. Other types can opt in with `mcp=Tool()`. `UI` methods open
React apps in the AI's chat. No glue code.

**Durable state by default.** States survive process crashes, deployments, and
chaos. No external database required.

**ACID transactions across states.** `transaction` methods compose atomically
across many state instances running on different machines.

**Reactive React frontend.** Generated hooks keep your UI in sync
without manual management of WebSockets, caches, or polling.

**Method system.** Code is safer to write (and _read_) with a clear API
and methods with enforced constraints: `reader` (concurrent, read-only),
`writer` (serialized, mutating), `transaction` (ACID, cross-state),
`workflow` (long-running, durable, cancellable), `ui` (React app in AI
chat). The runtime enforces these guarantees.

**API-first, code-generated.** Define APIs using Pydantic (Python) or
Zod (TypeScript). Reboot generates type-safe client, server, and React
stubs.

## Documentation

Full documentation at [docs.reboot.dev](https://docs.reboot.dev/).

## Community

- **Discord**: [discord.gg/cRbdcS94Nr](https://discord.gg/cRbdcS94Nr) — fastest way to get help or share what you're building
- **Issues**: [github.com/reboot-dev/reboot/issues](https://github.com/reboot-dev/reboot/issues)

Contributions are welcome. Open an issue to discuss substantial changes before
sending a pull request.

## License

[Apache 2.0](LICENSE)
