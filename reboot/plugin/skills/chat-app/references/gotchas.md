---
title: MCP Chat App–Specific Gotchas
impact: CRITICAL
impactDescription: The trip list specific to the MCP-Chat-App layer. Every entry is a real failure mode the chat-app codegen, runtime, or build surfaces — most are caught at startup or at codegen rather than at write time, so they look like runtime errors but are static schema problems.
tags: gotchas, traps, errors, mcp, ui, factory, workflow, ref, schedule, optional, react, vite, snake-camel
---

## MCP Chat App–Specific Gotchas

For the rest of the trip-list — `.rbtrc` line-based, no `__init__.py`
in `api/`, pydantic Field zero-default rule, `self.ref().state_id`
not `self.state_id`, kwargs not Request wrappers, generated import
paths, `Service.create(context, id)` semantics, register-all-Servicers
— see `python/references/patterns-common-gotchas.md` and
the per-topic references.

The list below is what's specific to the MCP-Chat-App layer:

1. **React bindings use camelCase.** Python `from_index` becomes
   TypeScript `fromIndex`; same for every snake_case field name.

2. **Every method requires explicit `mcp=`.** Use `mcp=Tool()` to
   expose a method as an AI-callable tool (required on all types,
   including `User`). Use `mcp=None` to hide it from the AI.

3. **Application types need `factory=True`** on their `create`
   Writer method. (Underlying mechanic: see
   `python/references/servicer-constructor.md`.)

4. **`npm install` before second `rbt generate`** — React bindings
   need `node_modules` to exist when `rbt generate` produces them.

5. **Generated React hook:** `use<TypeName>()` — e.g. `useCounter()`,
   `useInventory()`.

6. **Generated React import path:**
   `@api/<pkg>/v1/<name>_rbt_react`.

7. **Use `--default-config=hmr`** in `.rbtrc` (not `--default=hmr`).

8. **`UI(path="frontend/mcp/<name>")`** — path is relative to project
   root.

9. **`UI(request=<ConfigType>)`** passes config as React component
   props. `UI(request=None)` passes no props. `request=<Model>` is
   for **free-form configuration** (a personalisation string, a
   dashboard hint) — never for entity IDs. A UI about one specific
   entity belongs on that entity's `Type` with `request=None`; the
   tool-call target becomes the actor ID automatically, and the
   generated `use<Type>()` hook resolves it with no arguments. See
   "UI Placement" in `api-method-types.md`. Putting
   `show_person=UI(request=ShowPersonProps(person_id: str))` on
   `User` is the canonical wrong shape — it surfaces in MCPJam as
   a tool with a leaky entity-ID input, forces props plumbing, and
   de-co-locates the UI from every other per-entity method.

10. **Frontend request/response types are Zod** — generated from
    the Python Models.

11. **Inside a Workflow classmethod, `cls` is the BaseServicer, not
    the state class.** To call methods on the running instance, use
    the state class imported from `<name>_rbt`:
    `await MyType.ref().some_method(context)`. A no-arg `.ref()`
    inside a Workflow picks up `state_id` from `WorkflowContext`
    automatically. **Do NOT write `cls.ref()`** — it fails with
    `TypeError: <YourType>BaseServicer.ref() missing 1 required positional argument: 'self'`,
    because `ref` on the BaseServicer is an instance method, not the
    state-class factory. `self.ref()` is also wrong — there's no
    `self` in a classmethod.

12. **Workflows must be scheduled, not awaited, from a
    `TransactionContext`/`WriterContext`/`ReaderContext`.** Only
    `ExternalContext` and `WorkflowContext` can `await` a workflow
    directly. From a transaction that kicks off a workflow on a
    state it just created, use `.schedule()`:
    `await MyType.ref(id).schedule().autoplay(context)`. Writing
    `await MyType.ref(id).autoplay(context)` from a transaction
    raises `TypeError: ... '<Method>' is a workflow and must be scheduled from a 'TransactionContext' via `await [...].schedule([...]).<Method>(context, [...])``. See `servicer-patterns.md` for the full pattern.

13. **Nested `Model` fields can't take `default_factory` or
    `default`.** Two related rules — both raise `UserPydanticError`
    at startup, not at field-construction time, so they look like
    runtime errors but are static schema problems:

    - `default_factory=` is only supported for `list` and `dict`.
      `Field(tag=N, default_factory=MyModel)` raises
      `Field <X> in model <Y> uses default_factory which is not supported for type <T>. Only list, dict types can have a default_factory currently.`
    - A non-Optional `Model`-typed field also can't take `default=`,
      even with an instance: `Field <X> in model <Y> is a non-optional Model type and cannot have a default value. Use Optional for Model types with empty default.`

    The fix is to declare the field optional and construct lazily —
    `preferences: Optional[UserPreferences] = Field(tag=N, default=None)`
    — then materialize it inside the factory `create` method when the
    parent state is first written. Full pattern in
    `api-state-shapes.md`.

14. **`.per_workflow()` is implicit; don't write it.** Inside a
    workflow, `MyType.ref().read(context)` and
    `MyType.ref().write(context, fn)` already pick the right
    semantics: `.always()` inside an `until` block,
    `.per_iteration()` inside a `context.loop`, and `.per_workflow()`
    everywhere else. Only reach for an explicit `.per_iteration()`
    (override the default to per-iteration when _not_ inside a loop)
    or `.always()` (re-run every time). A plain
    `MyType.ref().per_workflow().some_method(context)` adds nothing
    beyond `MyType.ref().some_method(context)`.

15. **`.read(context)` only works on the workflow's own no-argument
    `MyType.ref()`.** Inside a workflow,
    `MyType.ref().read(context)` reads the workflow's own state via
    the no-argument `ref()` (picks up `state_id` from
    `WorkflowContext`). A foreign read like
    `OtherType.ref(other_id).read(context)` raises
    `RuntimeError: read() is currently only supported within workflows` —
    the constraint isn't actually "must be inside a workflow" (you
    are) but "must be the workflow's own no-argument ref." For
    cross-state reads, call a Reader method on the target type. The
    same rule applies to inline `.write(context, fn)`.

    ```python
    # GOOD — workflow's own state.
    state = await MyType.ref().read(context)

    # GOOD — cross-state read via a Reader method.
    response = await User.ref(user_id).get_history(context)

    # BAD — raises the "only supported within workflows" RuntimeError
    # despite being inside one. Use a Reader.
    # user_state = await User.ref(user_id).read(context)
    ```

16. **Generated request/response names come from the method name,
    not the source class name.** Bound source classes (whatever you
    pass to `request=`/`response=`) get exposed on the `Type` as
    `<Type>.<MethodPascalCase>Request` /
    `<Type>.<MethodPascalCase>Response`. A method
    `create_checkers_game` is always
    `User.CreateCheckersGameRequest` /
    `User.CreateCheckersGameResponse`, even if you named your
    `Model` class something else. Mismatching the method PascalCase
    raises `AttributeError: type object '<Type>' has no attribute '<WrongName>'`.
    (The full rule is in
    `python/references/api-pydantic.md`.)

17. **`Workflow(...)` requires `mcp=`, just like every other method
    factory.** Easy to miss because workflows are usually internal
    rather than AI-callable — `mcp=None` is the typical value, but
    omitting `mcp=` entirely raises at codegen with
    `1 validation error for Workflow / mcp / Field required`.

18. **Inline writer parameter must be named `state`.** The runtime
    calls the writer callback as `writer(state=typed_state)`, so
    `async def make_move(s):` raises
    `TypeError: ... got an unexpected keyword argument 'state'`.
    Always use `async def fn(state): ...`. (See
    `python/references/servicer-workflow.md`.)

19. **`frontend/dist/mcp/<name>/index.html` is the right location** for
    the built MCP UI — that's where the MCP server's
    `_resolve_dist_path` looks. The `vite.config.ts` shipped with
    this skill produces it correctly out of the box: the
    `RBT_BUILD_TARGET=mcp:<name>` build roots itself at `mcp/<name>/`,
    so its `index.html` lands at the nested path while
    `viteSingleFile` inlines the JS/CSS. If you see
    `Web artifact 'frontend/dist/mcp/<name>/index.html' is missing`, run
    `cd frontend && npm run build` — do **not** rewrite the Vite config
    to emit a flat `dist/<name>.html`; that breaks discovery.

20. **LLM / model API calls go in a `Workflow`, never a
    `Transaction`.** Chat apps routinely call a model (to summarize,
    rank, classify, generate). Reboot **retries transactions**, so a
    model call inside one is billed multiple times for a single
    logical request — and a transaction has no memoization to prevent
    it. Put the call in a `Workflow` and use the Reboot `Agent`
    (`reboot.agents.pydantic_ai.Agent`) — it wraps every model and
    tool call in `at_least_once` for you, so a workflow replay
    returns the cached response instead of re-billing the provider.
    Expose any on-demand "do it now" tool as a `Writer`/`Transaction`
    that only **schedules** the workflow
    (`await self.ref().schedule().<workflow_method>(context)`) —
    never one that makes the model call itself. Full rationale in
    `python/references/servicer-transaction.md` (§External Side
    Effects: Transaction or Workflow?),
    `python/references/servicer-workflow.md`, and
    `python/references/agent-pydantic-ai.md`.

21. **Don't add `generate --react-extensions` to `.rbtrc`.** This is
    a Python-backend app that generates the React client on its own
    into `web/api/`. Vite — plus `tsc` under the
    `moduleResolution: "bundler"` the scaffolded tsconfigs use —
    resolves the generated client's relative imports without explicit
    `.js` extensions, so the flag buys nothing here. The two cases
    where a project _does_ need it both require something this skill
    never produces: a webpack/`ts-loader` bundler (this skill uses
    Vite), or a `--nodejs`/`--web` target sharing the React output
    directory and forcing matching extensions (a Python backend has
    no Node.js client). Adding the flag anyway also breaks a future
    `--mobile` (React Native) client — `rbt generate` rejects
    `--react-extensions` with `--mobile`, because Metro can't resolve
    the `.js`-suffixed imports back to their `.ts` sources.
