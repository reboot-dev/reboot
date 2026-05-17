---
title: Use `at_most_once` for Non-Retryable Work
impact: HIGH
impactDescription: Side effects that must not repeat (charges, emails) require at_most_once
tags: workflow, at_most_once, memoize, side-effects, non-idempotent
---

## Use `at_most_once` for Non-Retryable Work

> **Critical:** if `callable` raises, the alias is **poisoned forever** —
> every retry raises `AtMostOnceFailedBeforeCompleting`. Surface failures
> as return values, never exceptions. Alias must be stable across replays.
> If the callable returns anything other than `None`, its **return type
> must be discoverable** — either annotate the callable
> (`async def fn() -> Result:`) or pass `type=Result` to `at_most_once`.
> Lambdas without `type=` fail at runtime with a `TypeError` that
> immediately poisons the alias.

`at_most_once(alias, context, callable)` runs `callable` and memoizes its
result. On replay (after a restart), the memoized value is returned and
`callable` is **not** invoked again. Use it for side effects that must not
repeat — billing, sending email, generating an LLM response, calling an
external API that isn't idempotent.

If `callable` raises before completing, every subsequent attempt of the
same alias raises `AtMostOnceFailedBeforeCompleting` forever — that is the
"at most once" guarantee. Surface failures as **return values**, not
exceptions, when you need to keep going.

**Incorrect (raising from inside `at_most_once` to signal a logical
failure):**

```python
async def maybe_charge():
    if amount <= 0:
        raise ValueError("must charge a positive amount")  # poisons the alias
    return await charge_card(amount)

# Subsequent replays raise AtMostOnceFailedBeforeCompleting forever.
result = await at_most_once("Charge", context, maybe_charge)
```

**Correct (LLM-call memoization pattern):**

```python
from reboot.aio.workflows import at_most_once


async def generate() -> ChatbotResponse:
    return await llm.ainvoke([
        {"role": "system", "content": request.prompt},
        {"role": "user", "content": f"Latest messages: {to_json(messages)}"},
    ])


# Generate at most once: even on workflow replay, the LLM is hit once.
response = await at_most_once("Generate", context, generate)
```

## Idempotency Alias Must Be Stable Within the Workflow

The alias (`"Generate"` above) is the memoization key. Two calls with the
same alias inside the same workflow are the same call. Pick stable names
that describe the work; don't include dynamic values like timestamps or
UUIDs.

## Surface Failures as Return Values

Since raising poisons the alias, write callables that capture failure as
data:

```python
async def attempt_charge() -> ChargeResult:
    try:
        result = await charge_card(amount)
        return ChargeResult(ok=True, charge_id=result.id)
    except CardDeclined as e:
        return ChargeResult(ok=False, reason=str(e))


outcome = await at_most_once("Charge", context, attempt_charge)
if not outcome.ok:
    # ... handle the decline; another attempt is up to the workflow ...
```

## The Callable's Return Type Must Be Discoverable

`at_most_once` introspects the callable to know what type to
memoize. If the callable returns anything other than `None`, it
needs **either** a return annotation **or** the explicit `type=`
kwarg:

```python
# OK — return annotation makes the result type discoverable.
async def attempt_charge() -> ChargeResult:
    ...

await at_most_once("Charge", context, attempt_charge)

# OK — explicit `type=` kwarg.
await at_most_once(
    "Charge", context, lambda: _charge_card(amount),
    type=ChargeResult,
)

# REJECTED — lambdas can't carry return annotations,
# and no `type=` was passed.
await at_most_once(
    "Charge", context, lambda: _charge_card(amount),
)
```

The lambda case fails at runtime with:

```text
TypeError: Result of type '<X>' from callable passed to
'at_most_once' is not `None` but no `type=` argument was passed
and no return annotation was found on the callable; either
annotate the callable's return type or pass `type=` explicitly.
```

When the failure happens **inside** an `at_most_once`'s callable
during the framework's memoize step, it propagates as an
exception → poisons the alias → every retry raises
`AtMostOnceFailedBeforeCompleting`. Workflow gets stuck. So this
is doubly important: a missing annotation doesn't just produce a
nice error, it permanently breaks the workflow's progress.

**Prefer nested `async def` with explicit return annotation** —
it's clearer and the annotation propagates everywhere it's
needed.

## When to Pick `at_most_once` Over `at_least_once`

| Property                         | `at_most_once`    | `at_least_once` |
| -------------------------------- | ----------------- | --------------- |
| Side effect that must not repeat | ✓                 | ✗               |
| Idempotent operation             | safe but wasteful | ✓               |
| Retries on transient failure     | ✗                 | ✓               |
| Failure poisons the alias        | ✓                 | ✗               |

If unsure: lean `at_least_once` and make the operation idempotent.
