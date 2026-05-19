---
title: React App.tsx — Generated Hooks and Component Patterns
impact: HIGH
impactDescription: The generated `use<Type>()` hook returns reader subscriptions and mutation functions; both go directly to the Reboot backend. Reboot snake_case Python field names become camelCase in TypeScript. Each `App.tsx` lives next to a CSS module and consumes the per-UI props passed via `UI(request=...)`.
tags: react, app-tsx, hooks, useType, css-module, snake-camel, app-tsx-example
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
