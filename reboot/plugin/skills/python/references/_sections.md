# Section Definitions

This file defines the rule categories for Reboot Python best practices. Rules are automatically assigned to sections based on their filename prefix.

---

## 1. Lifecycle (lifecycle)

**Impact:** CRITICAL
**Description:** Project setup, `.rbtrc` configuration, the `Application(...)` entry point, and the `initialize` hook. Foundation for every Reboot application.

## 2. API (api)

**Impact:** CRITICAL
**Description:** Pydantic API definition — state models, reader/writer/transaction method factories, the `factory=True` constructor option, and typed error models. The pydantic API file is the source of truth; everything else is generated from it.

## 3. Servicer (servicer)

**Impact:** HIGH
**Description:** Implementing the generated `Servicer` base class. One reference per context type (reader, writer, transaction), plus constructor handling and authorizers. Workflow methods get their own category.

## 4. Workflow (workflow)

**Impact:** HIGH
**Description:** Durable, long-running, restartable methods. One reference per primitive (`at_most_once`, `at_least_once`, `until`, `until_changes`), plus iteration via `context.loop`, state mutation via `ref().write(context, fn)`, and idempotency-scope selection (`PER_WORKFLOW`, `PER_ITERATION`, `ALWAYS`).

## 5. Stdlib (stdlib)

**Impact:** HIGH
**Description:** First-class stdlib state types shipped with Reboot — `SortedMap`, `OrderedMap`, `Queue`, `Topic` (PubSub), `Presence`, and the `Item` value envelope. One reference per type with method surface and library registration.

## 6. State (state)

**Impact:** HIGH
**Description:** Modeling state with scalar fields, collections (`list[T]` / `dict[str, T]`, `SortedMap`), and nested `Model`s. Default-value rules and access patterns.

## 7. Auth (auth)

**Impact:** HIGH
**Description:** Authorizer composition: `allow()` / `deny()`, `allow_if(all=...)` / `allow_if(any=...)`, the built-in predicates (`has_verified_token`, `is_app_internal`, `state_id_is_user_id`), and writing custom predicates.

## 8. RPC (rpc)

**Impact:** MEDIUM
**Description:** Calling actors via `Service.ref(id)` and `await ref.method(context, ...)`. Constructor calls (`Service.create`), fan-out via `Service.forall(ids).method(context)`, and the kwargs-not-Request convention.

## 9. Scheduling (scheduling)

**Impact:** MEDIUM
**Description:** Deferred work via `ref.schedule(when=timedelta(...)).method(context)` and recurring schedules driven from inside writer methods.

## 10. Testing (testing)

**Impact:** LOW-MEDIUM
**Description:** The `Reboot()` test harness, `rbt.up(Application(...))`, and `create_external_context` for issuing calls in tests.

## 11. Patterns (patterns)

**Impact:** LOW-MEDIUM
**Description:** Cross-cutting patterns and anti-patterns: raising typed errors, idempotency strategies, and the most common Reboot Python gotchas.
