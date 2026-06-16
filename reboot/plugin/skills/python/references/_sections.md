# Section Definitions

This file defines the rule categories for Reboot Python best practices. Rules are automatically assigned to sections based on their filename prefix.

---

## 1. Lifecycle (lifecycle)

**Impact:** CRITICAL
**Description:** Project setup, `.rbtrc` configuration, the `Application(...)` entry point, and the `initialize` hook. Foundation for every Reboot application.

## 2. API (api)

**Impact:** CRITICAL
**Description:** Pydantic API definition — state models, reader/writer/transaction method factories, the `factory=True` constructor option, and typed error models. The pydantic API file is the source of truth; everything else is generated from it. Also covers schema evolution: the rules to follow when changing the API of an application that has persisted state or has been deployed.

## 3. Servicer (servicer)

**Impact:** HIGH
**Description:** Implementing the generated `Servicer` base class. One reference per context type (reader, writer, transaction, workflow), plus constructor handling and authorizers. `servicer-workflow.md` is the single, comprehensive workflow reference: declaration shape, the call-classification model that routes each call to the right primitive (scope chain `.per_workflow(alias)` / `.per_iteration(alias)` / `.always()` for Reboot-internal calls; `at_least_once` as the default for external calls, with `at_most_once` for non-retryable ones), `context.loop` iteration, inline state mutation via `ref().<scope>.write(context, fn)`, `until` / `until_changes` reactive waiting, and the declared-vs-undeclared exception exit rule.

## 4. Agent (agent)

**Impact:** HIGH
**Description:** Backend LLM calls and AI agents via the durable `reboot.agents.pydantic_ai.Agent` — a replay-safe wrapper over `pydantic_ai.Agent` that memoizes every model and tool call. Constructing and running the agent inside a `WorkflowContext`, and giving it tools with `@agent.tool` / `@agent.tool_plain`.

## 5. Stdlib (stdlib)

**Impact:** HIGH
**Description:** First-class stdlib state types shipped with Reboot — `OrderedMap`, `Queue`, `Topic` (PubSub), `Presence`, the `Item` value envelope, and `Ciphertext` (envelope encryption / crypto-shredding). One reference per type with method surface and library registration.

## 6. Crypto (crypto)

**Impact:** HIGH
**Description:** Reboot's managed cryptographic root keys (`REBOOT_CRYPTO_ROOT_KEYS`) and HKDF key derivation (`reboot.crypto.root_keys.derive_key`) for building your own key-deriving library/feature — including the rotation control loop and the `Application.use_root_key_version` / `disuse_root_key_version` usage markers. For ready-made encryption-at-rest + crypto-shredding, use the `Ciphertext` stdlib library instead.

## 7. State (state)

**Impact:** HIGH
**Description:** Modeling state with scalar fields, collections (`list[T]` / `dict[str, T]`, `OrderedMap`), and nested `Model`s. Default-value rules and access patterns.

## 8. Auth (auth)

**Impact:** HIGH
**Description:** Authorizer composition: `allow()` / `deny()`, `allow_if(all=...)` / `allow_if(any=...)`, the built-in predicates (`has_verified_token`, `is_app_internal`, `state_id_is_user_id`), and writing custom predicates. Also the host-agnostic recipe for acting as the user at an external service — capturing a provider's OAuth tokens via your own endpoints (or, for a service that only issues API keys, encrypting the key with `Ciphertext`), storing OAuth tokens in an `OAuthTokenManager`, and calling the API inside a `Workflow` (`auth-external-api-calls.md`).

## 9. RPC (rpc)

**Impact:** MEDIUM
**Description:** Calling actors via `Service.ref(id)` and `await ref.method(context, ...)`. Constructor calls (`Service.create`), fan-out via `Service.forall(ids).method(context)`, and the kwargs-not-Request convention.

## 10. Scheduling (scheduling)

**Impact:** MEDIUM
**Description:** Deferred work via `ref.schedule(when=...).method(context)` — `when=` takes a `timedelta` (relative) or an absolute timezone-aware `datetime`. Recurring / "cron" jobs are built by self-rescheduling from inside a writer method (at an absolute wall-clock time for true cron), optionally dispatching a `Workflow` per run for the durable work.

## 11. Testing (testing)

**Impact:** LOW-MEDIUM
**Description:** The `Reboot()` test harness, `rbt.up(Application(...))`, and `create_external_context` for issuing calls in tests.

## 12. Patterns (patterns)

**Impact:** LOW-MEDIUM
**Description:** Cross-cutting patterns and anti-patterns: raising typed errors, idempotency strategies, and the most common Reboot Python gotchas.
