# python

> **Note:** `CLAUDE.md` is a symlink to this file.

## Overview

Reboot Python framework for building transactional microservices with proto-defined APIs and durable actor state. Use this skill when writing Python code for a Reboot application, defining `.proto` APIs with reader/writer/transaction methods, implementing Servicers, calling actor refs across services, scheduling work, or testing Reboot applications with the `Reboot()` test harness.

## Structure

```
python/
  SKILL.md       # Main skill file - read this first
  AGENTS.md      # This navigation guide
  CLAUDE.md      # Symlink to AGENTS.md
  references/    # Detailed reference files
```

## Usage

1. Read `SKILL.md` for the main skill instructions
2. Browse `references/` for detailed documentation on specific topics
3. Reference files are loaded on-demand - read only what you need

## Reference Categories

| Priority | Category   | Impact     | Prefix        |
| -------- | ---------- | ---------- | ------------- |
| 1        | Lifecycle  | CRITICAL   | `lifecycle-`  |
| 2        | API        | CRITICAL   | `api-`        |
| 3        | Servicer   | HIGH       | `servicer-`   |
| 4        | Workflow   | HIGH       | `workflow-`   |
| 5        | Stdlib     | HIGH       | `stdlib-`     |
| 6        | State      | HIGH       | `state-`      |
| 7        | Auth       | HIGH       | `auth-`       |
| 8        | RPC        | MEDIUM     | `rpc-`        |
| 9        | Scheduling | MEDIUM     | `scheduling-` |
| 10       | Testing    | LOW-MEDIUM | `testing-`    |
| 11       | Patterns   | LOW-MEDIUM | `patterns-`   |

Reference files are named `{prefix}-{topic}.md` (e.g., `workflow-at-most-once.md`).

## Available References

**Lifecycle** (`lifecycle-`):

- `references/lifecycle-project-setup.md`
- `references/lifecycle-rbtrc.md`
- `references/lifecycle-application-entry.md`
- `references/lifecycle-initialize-hook.md`

**API** (`api-`):

- `references/api-proto-basics.md`
- `references/api-pydantic.md`
- `references/api-state-message.md`
- `references/api-methods.md`
- `references/api-errors.md`

**Servicer** (`servicer-`):

- `references/servicer-reader.md`
- `references/servicer-writer.md`
- `references/servicer-transaction.md`
- `references/servicer-constructor.md`
- `references/servicer-authorizer.md`

**Workflow** (`workflow-`):

- `references/workflow-method.md`
- `references/workflow-loop.md`
- `references/workflow-at-most-once.md`
- `references/workflow-at-least-once.md`
- `references/workflow-until.md`
- `references/workflow-until-changes.md`
- `references/workflow-idempotency-scopes.md`
- `references/workflow-state-write.md`

**Stdlib** (`stdlib-`):

- `references/stdlib-sorted-map.md`
- `references/stdlib-ordered-map.md`
- `references/stdlib-queue.md`
- `references/stdlib-pubsub.md`
- `references/stdlib-presence.md`
- `references/stdlib-item.md`

**State** (`state-`):

- `references/state-scalar-fields.md`
- `references/state-collections.md`
- `references/state-nested-messages.md`

**Auth** (`auth-`):

- `references/auth-allow-deny.md`
- `references/auth-allow-if.md`
- `references/auth-built-in-predicates.md`
- `references/auth-custom-predicates.md`

**RPC** (`rpc-`):

- `references/rpc-refs.md`
- `references/rpc-calls.md`
- `references/rpc-constructor-calls.md`
- `references/rpc-forall.md`

**Scheduling** (`scheduling-`):

- `references/scheduling-basic.md`
- `references/scheduling-recurring.md`

**Testing** (`testing-`):

- `references/testing-harness.md`
- `references/testing-external-context.md`

**Patterns** (`patterns-`):

- `references/patterns-error-handling.md`
- `references/patterns-idempotency.md`
- `references/patterns-common-gotchas.md`

---

_46 reference files across 11 categories_
