<div align="center">

<img src="https://docs.reboot.dev/img/reboot-logo-green.svg"
     alt="Reboot" width="200" />

# Reboot

**Trust the code your agent writes.**

A full-stack framework for the AI era.

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![PyPI](https://img.shields.io/pypi/v/reboot)](https://pypi.org/project/reboot/)
[![npm](https://img.shields.io/npm/v/@reboot-dev/reboot)](https://www.npmjs.com/package/@reboot-dev/reboot)
[![Discord](https://img.shields.io/badge/Discord-join-5865F2?logo=discord&logoColor=white)](https://discord.gg/cRbdcS94Nr)
[![Docs](https://img.shields.io/badge/docs-reboot.dev-green)](https://docs.reboot.dev/)

</div>

---

Modern app development is quickly becoming AI-assisted, or entirely
vibe-coded. Can you trust these apps in production? Yes, but only if
you build on a framework that handles the hard stuff and forces AI
agents to ship clean, modular software.

Reboot solves the hard problems once, at the framework level, so
neither you nor your coding agent has to. What Rust's borrow checker
did for memory management, and React did for component-based
frontends, Reboot does for your backend: **backend safety and data
encapsulation**, enforced by the framework rather than by review.

## Try Reboot with Claude Code or Codex

Install the Reboot plugin:

```sh
curl -fsSL https://reboot.dev/install.sh | bash
```

Then describe what you want:

> Build me a todo-list app I can use from a browser and from Claude and ChatGPT

The agent proposes a design, scaffolds the project — API, backend,
frontend, sign-in, tests — and runs it. See
[Build with Claude Code](https://docs.reboot.dev/get_started/claude_code)
or [Build with Codex](https://docs.reboot.dev/get_started/codex), or
[build one by hand](https://docs.reboot.dev/get_started/python) to
see every file.

## Why a new framework?

Agents are blazingly fast, junior engineers. You cannot trust them to
build your application correctly without a rock-solid foundation to
stand on. A harness isn't enough.

- **Correct concurrency and retry safety.** Coding agents reliably
  ship bugs in these two areas. The only way to fix this is to give
  them constraints that make those bugs impossible by construction:
  every method declares its kind — `reader`, `writer`,
  `transaction`, or `workflow` — and Reboot enforces what each one may
  do.
- **Lose nothing on reboot.** Agents don't expect their code to
  crash. Until now, the fix was to build on a durable execution
  engine. Reboot goes further with **durable applications**: the
  moment a function returns, its `state` is saved. Workflows resume
  where they failed — the steps that already finished are memoized
  rather than run again — and transactions keep everything atomic. No
  database, no cache, no queue.
- **Agents are lazy.** You asked for a frontend, but what you really
  wanted was a reactive one. You wanted it to retry on an
  intermittent network failure, but instead it threw an error and
  never cleaned up its local React state. With Reboot you get these
  features, and many more, without ever having to ask.
- **Agents make code hard to review.** Even if some harness could get
  an agent to handle all of the concerns above, would you want to
  review that diff? Could you be sure it didn't introduce bugs?
  Reboot's semantics are simple enough, for humans and agents alike,
  that you can.

## What it looks like

Define your API with [Pydantic](https://docs.reboot.dev/define/pydantic)
in Python (or [Zod](https://docs.reboot.dev/define/zod) in
TypeScript). Every method declares its kind, and whether an AI may
call it:

```python
from reboot.api import API, Field, Methods, Model, Reader, Tool, Type, Writer


class AccountState(Model):
    balance: int = Field(tag=1, default=0)


class DepositRequest(Model):
    amount: int = Field(tag=1)


class BalanceResponse(Model):
    balance: int = Field(tag=1)


api = API(
    Account=Type(
        state=AccountState,
        methods=Methods(
            deposit=Writer(
                request=DepositRequest,
                response=None,
                description="Add funds to the account.",
                mcp=Tool(),
            ),
            balance=Reader(
                request=None,
                response=BalanceResponse,
                description="The account's current balance.",
                mcp=Tool(),
            ),
        ),
    ),
)
```

Implement it. `self.state` is durable: when the method returns, the
new state is saved, all of it or none of it.

```python
class AccountServicer(Account.Servicer):

    async def deposit(
        self,
        context: WriterContext,
        request: Account.DepositRequest,
    ) -> None:
        self.state.balance += request.amount

    async def balance(
        self,
        context: ReaderContext,
    ) -> Account.BalanceResponse:
        return Account.BalanceResponse(balance=self.state.balance)
```

Call it from React through generated, typed hooks. `useBalance`
re-renders whenever the balance changes, whether this user, another
user, a workflow, or an AI changed it:

```tsx
const account = useAccount({ id });
const { response } = account.useBalance();

await account.deposit({ amount: 50 });
```

The same two methods are tools for Claude, ChatGPT, or any other MCP
client, because they were declared with `mcp=Tool()`.

## One backend, many frontends

One app to serve every user — human or machine. You and your agents
can build any kind of app with Reboot:

- **Humans** reach it through a
  [web app](https://docs.reboot.dev/surfaces/web), a
  [React Native app](https://docs.reboot.dev/surfaces/react_native)
  (alpha), or an
  [AI chat app](https://docs.reboot.dev/surfaces/ai_chat) inside
  ChatGPT, Claude, or VS Code, where `UI` methods render React
  components in the conversation.
- **Agents** reach it over MCP: every method marked `mcp=Tool()` is a
  tool. An agent can also run
  [inside your app](https://docs.reboot.dev/agents), with durable,
  replay-safe model and tool calls.
- **Services** reach it from your own backend code, a script, or a
  plain HTTP request.

Signed-in users come built in. Plug in your favorite auth provider —
Google, GitHub, Auth0, Ory — and Reboot runs the OAuth server in front
of it, so a person signing in auto-constructs their `User`: the
per-user entry point the rest of your app hangs off, and the same
`User` on every surface. See
[Users and sign-in](https://docs.reboot.dev/users/overview).

## Status

Python backends are supported today. TypeScript backends and React
Native frontends are in alpha: the core of Reboot works in both
languages, but AI chat apps, `UI` methods, the built-in OAuth sign-in
flow, and durable agents are Python-only for now. More languages are
coming.

## Get started today

Reboot is open source. Run a Reboot app on your own infrastructure or
on Reboot Cloud.

- [Reboot Cloud](https://cloud.reboot.dev/) — deploy with
  `rbt cloud up`.
- [Deploy on your own](https://docs.reboot.dev/deploy_on_your_own) —
  `rbt serve` on your own machines or Kubernetes.
- [Documentation](https://docs.reboot.dev/) — start with
  [How Reboot works](https://docs.reboot.dev/concepts).
- [Examples](https://docs.reboot.dev/get_started/examples) — complete
  applications to run and take apart.

## Community

- **Discord**: [discord.gg/cRbdcS94Nr](https://discord.gg/cRbdcS94Nr) — fastest way to get help or share what you're building
- **Issues**: [github.com/reboot-dev/reboot/issues](https://github.com/reboot-dev/reboot/issues)

Contributions are welcome. Open an issue to discuss substantial changes before
sending a pull request.

## License

[Apache 2.0](LICENSE)
