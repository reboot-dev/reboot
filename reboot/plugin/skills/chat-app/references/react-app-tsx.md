---
title: React App.tsx — Generated Hooks and Component Patterns
impact: HIGH
impactDescription: The generated `use<Type>()` hook returns reader subscriptions and mutation functions; both go directly to the Reboot backend. Reboot snake_case Python field names become camelCase in TypeScript. Each `App.tsx` lives next to a CSS module and consumes the per-UI props passed via `UI(request=...)`.
tags: react, app-tsx, hooks, useType, css-module, snake-camel, app-tsx-example, composing-reader, pagination, ordered-map, multi-actor
---

## React App.tsx — Generated Hooks and Component Patterns

`web/ui/<ui-name>/App.tsx` is the React component for one UI. The
generated `use<Type>()` hook returns reader subscriptions and
mutation functions:

```tsx
import { useCounter } from "@api/<pkg>/v1/<name>_rbt_react";

// useCounter() connects to the Counter state instance.
const counter = useCounter();

// Reader (WebSocket subscription, auto-updates):
const { response, isLoading } = counter.useGet();
const value = response?.value ?? 0;

// Writer (direct call to Reboot backend):
await counter.increment({ amount: 1 });
```

For list state, the same pattern applies — use the generated hook for
the application type and call its methods:

```tsx
// Python from_index -> TypeScript fromIndex (camelCase).
await myType.reorderItem({ fromIndex: 0, toIndex: 1 });
await myType.addItem({ text: "New item" });
```

## Actor ID Resolution: Zero-Arg `use<Type>()` for UIs on the Type

For a `UI()` declared on an application `Type` (e.g.
`Person.show=UI(...)`, `Counter.show_clicker=UI(...)`), call the
generated `use<Type>()` hook with **no arguments**:

```tsx
// Counter.show_clicker=UI(...) → `useCounter()` auto-resolves.
const counter = useCounter();

// Person.show=UI(...) → `usePerson()` auto-resolves.
const person = usePerson();
```

The hook reads the actor ID from `toolData.ids["<pkg>.<Type>"]`,
which the framework populates from the MCP tool call's target.
That target is the state ID the AI passes when invoking the
generated `<type>_<method>` tool — so the React UI always
materializes for exactly the entity the AI asked about. No
props plumbing, no risk of cross-wiring entity IDs.

For UIs declared on `User`, or any component that needs to talk
to a different entity than the tool-call target, pass an
explicit `{id: ...}`:

```tsx
// Reading a related Person whose ID came from the current
// Person's relationships list.
const relatedPerson = usePerson({ id: relationship.otherPersonId });
```

If you need direct access to the tool-call inputs (e.g. for a
follow-up read or to follow a navigation chain to another
entity of the same Type), `useMcpToolData()` from
`@reboot-dev/reboot-react` returns the raw `{ids, ...}` object
the framework received.

## Naming Convention: snake_case → camelCase

The generated React bindings convert Python snake_case field names
to TypeScript camelCase. Python `from_index` becomes TypeScript
`fromIndex`. Same for every snake_case field name on every Request
or Response Model.

## Generated React Imports

```tsx
import {
  type DashboardConfig,
  useCounter,
} from "@api/<pkg>/v1/<name>_rbt_react";
```

- The hook is `use<TypeName>()` — `useCounter()`, `useInventory()`,
  etc.
- The import path is `@api/<pkg>/v1/<name>_rbt_react` (the
  `@api/*` alias is set up by `vite.config.ts`).
- Frontend Request/Response types are Zod-validated; the same
  `<MethodPascalCase>Request`/`<MethodPascalCase>Response` rule
  applies on the TypeScript side.

## Full Counter `App.tsx` Example

```tsx
import { useEffect, useRef, useState, type FC } from "react";
import { useCounter } from "@api/ai_chat_counter/v1/counter_rbt_react";
import css from "./App.module.css";

export const ClickerApp: FC = () => {
  const [isPending, setIsPending] = useState(false);
  const counter = useCounter();
  const { response, isLoading } = counter.useGet();

  const prevValueRef = useRef<number | null>(null);
  const [trend, setTrend] = useState<"up" | "down" | "same" | null>(null);

  const value = response?.value ?? 0;

  useEffect(() => {
    if (response?.value !== undefined) {
      if (prevValueRef.current !== null) {
        if (response.value > prevValueRef.current) {
          setTrend("up");
        } else if (response.value < prevValueRef.current) {
          setTrend("down");
        } else {
          setTrend("same");
        }
      }
      prevValueRef.current = response.value;
    }
  }, [response?.value]);

  const handleIncrement = async () => {
    setIsPending(true);
    try {
      await counter.increment({ amount: 1 });
    } finally {
      setIsPending(false);
    }
  };

  const handleDecrement = async () => {
    setIsPending(true);
    try {
      await counter.decrement({ amount: 1 });
    } finally {
      setIsPending(false);
    }
  };

  const trendIcon = trend === "up" ? "↑" : trend === "down" ? "↓" : "→";
  const trendClass =
    trend === "up" ? css.trendUp : trend === "down" ? css.trendDown : "";

  if (isLoading && response === undefined) {
    return (
      <div className={css.container}>
        <div className={css.loading}>loading...</div>
      </div>
    );
  }

  return (
    <div className={css.container}>
      <div className={css.row}>
        <button
          onClick={handleDecrement}
          disabled={isPending}
          className={css.buttonDecrement}
        >
          −
        </button>
        <div className={css.valueGroup}>
          <div
            className={`${css.counter} ${trendClass} ${
              isPending ? css.pending : ""
            }`}
          >
            {value}
          </div>
          {trend && (
            <span className={`${css.trend} ${trendClass}`}>{trendIcon}</span>
          )}
        </div>
        <button
          onClick={handleIncrement}
          disabled={isPending}
          className={css.buttonIncrement}
        >
          +
        </button>
      </div>
      <span className={`${css.syncStatus} ${isPending ? css.visible : ""}`}>
        syncing...
      </span>
    </div>
  );
};
```

## `web/ui/<ui-name>/App.module.css`

```css
.container {
  background: var(--color-bg);
  color: var(--color-text);
  font-family: var(--font-mono);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 24px 20px 16px;
  gap: 12px;
}

.row {
  display: flex;
  align-items: center;
  gap: 12px;
}

.valueGroup {
  display: flex;
  align-items: baseline;
  gap: 4px;
  min-width: 80px;
  justify-content: center;
}

.counter {
  font-size: 36px;
  font-weight: bold;
  color: var(--color-text);
  transition: color 0.15s ease, opacity 0.15s ease;
}

.counter.pending {
  opacity: 0.7;
}

.counter.trendUp {
  color: var(--color-green);
  text-shadow: 0 0 12px rgba(74, 222, 128, 0.25);
}

.counter.trendDown {
  color: var(--color-pink);
  text-shadow: 0 0 12px rgba(244, 114, 182, 0.25);
}

.trend {
  font-size: 18px;
  font-weight: bold;
  transition: color 0.15s ease;
}

.trendUp {
  color: var(--color-green);
}

.trendDown {
  color: var(--color-pink);
}

.button {
  width: 40px;
  height: 40px;
  font-size: 20px;
  font-family: var(--font-mono);
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
  display: flex;
  align-items: center;
  justify-content: center;
}

.button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.buttonIncrement {
  composes: button;
  background: var(--color-green);
  color: var(--color-bg-dark);
}

.buttonDecrement {
  composes: button;
  background: var(--color-pink);
  color: var(--color-bg-dark);
}

.syncStatus {
  color: var(--color-yellow);
  font-size: 11px;
  height: 14px;
  opacity: 0;
  transition: opacity 0.15s ease;
}

.syncStatus.visible {
  opacity: 1;
}

.loading {
  color: var(--color-text-muted);
  font-size: 12px;
}
```

Adapt the CSS module to your app's needs. The CSS variables from
`index.css` provide consistent theming.

## Reading Across Many Actors — the Composing Reader

The Counter example above is the single-actor case: one
`use<Type>()` hook, one actor, one live feed. It does **not**
generalize to a collection that has been correctly decomposed —
each item its own state `Type`, indexed by an `OrderedMap` on the
parent (Shape C in `python/references/state-collections.md`).
There each item is a separate actor, and there is no
`use<Item>()` call that renders the whole list at once.

The wrong fix is to flatten the model back into `list[Item]` on
one actor so the dashboard regains a single subscription — see
"When Correct Decomposition Fights the UI" in
[`SKILL.md`](../SKILL.md). The right fix keeps the decomposition
and gives the front-door type a **composing reader**: the UI
still has exactly one subscription, and the fan-out across item
actors happens server-side.

### Backend: a composing `Reader` on the front-door type

The reader ranges the parent's `OrderedMap` for one page of IDs,
reads each item actor, and returns a page of hydrated objects
plus a cursor for the next page:

```python
# `Item` is the per-item state `Type`. `items_index_id` is the
# `OrderedMap` ID — a field on the parent's state, allocated once in
# the parent's constructor. Never synthesize the map ID inline from
# `self.ref().state_id` or `context.state_id` — see "Relationships
# Between State Types" in `python/references/state-collections.md`.
async def dashboard(
    self,
    context: ReaderContext,
    request: User.DashboardRequest,
) -> User.DashboardResponse:
    page = await OrderedMap.ref(self.state.items_index_id).range(
        context, start_key=request.cursor, limit=32,
    )
    items = []
    for entry in page.entries:
        item_id = entry.bytes.decode()
        # A Reader may call other Readers — the fan-out is
        # server-side. See `python/references/servicer-reader.md`.
        view = await Item.ref(item_id).get(context)
        items.append(
            User.DashboardItem(
                item_id=item_id,
                title=view.title,
                status=view.status,
            )
        )
    return User.DashboardResponse(
        items=items,
        next_cursor=(page.entries[-1].key if page.entries else ""),
    )
```

Declare it `mcp=None` — it feeds the UI, not the AI. The
`OrderedMap` `range` / cursor mechanics (including the inclusive
`start_key` caveat) are in
`python/references/stdlib-ordered-map.md`, and the Shape C
example in `python/references/state-collections.md` shows the
parent allocating and writing the index.

### Frontend: one subscription, cursor pagination

The UI keeps a single `use<FrontDoorType>()` subscription — the
same shape as the Counter example — and pages by cursor:

```tsx
import { useState, type FC } from "react";
import { useUser } from "@api/<pkg>/v1/<name>_rbt_react";

export const Dashboard: FC = () => {
  const user = useUser();
  const [cursor, setCursor] = useState("");

  // One reader subscription. The composing reader fans out across
  // the item actors server-side, so the UI still sees one live
  // feed — no per-item hooks.
  const { response, isLoading } = user.useDashboard({ cursor });

  const items = response?.items ?? [];
  const nextCursor = response?.nextCursor ?? "";

  if (isLoading && response === undefined) {
    return <div>loading...</div>;
  }

  return (
    <div>
      {items.map((item) => (
        <div key={item.itemId}>
          {item.title} — {item.status}
        </div>
      ))}
      {nextCursor && (
        <button onClick={() => setCursor(nextCursor)}>Load more</button>
      )}
    </div>
  );
};
```

`setCursor(nextCursor)` advances the subscription to the next
page. To render an ever-growing list rather than one page at a
time, accumulate `response.items` into component state on each
change instead of rendering `response.items` directly.
