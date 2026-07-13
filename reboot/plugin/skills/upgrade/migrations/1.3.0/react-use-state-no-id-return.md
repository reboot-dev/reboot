## A no-id generated state hook now returns `{ <state>, isLoading }`, and the UI renders immediately

A generated state hook such as `useUser()` / `useCounter()` called
**without** an explicit `{ id }` — relying on the default id from the
MCP host's tool input (MCP apps) or the signed-in session (web apps) —
now returns `{ <stateLowerCamel>, isLoading }` instead of the handle
directly. The handle is `undefined` until a default id resolves, and
`isLoading` is `true` until then. Calls that pass an explicit id —
`useCounter({ id })` — are unchanged and still return the handle.

This return shape is what lets the UI render right away. Neither
surface's provider blocks the subtree waiting for ids: an MCP app's
`RebootClientProvider` used to hold everything behind a built-in
"Connecting to MCP host..." placeholder until the host delivered tool
input carrying the state-id map, and a web app's provider would
similarly have to wait on `/__/oauth/whoami`; both now render your UI
immediately, and a no-id hook reports `isLoading` until the ids
arrive.

If any component calls a no-id state hook and then immediately calls
reader/mutator methods on the result, split it so the reader-calling
part only renders once the handle exists:

```tsx
// before
const counter = useCounter();
const { response } = counter.useValue();

// after
const { counter, isLoading } = useCounter();
if (isLoading) return <>{/* still resolving the default id */}</>;
if (counter === undefined) return <SignIn />;
return <CounterView counter={counter} />; // calls counter.useValue()
```

For the same reason, in MCP apps `useMcpApp()` can now return `null` on
early renders (the MCP host connection is still being established), so
code that previously assumed a non-null `app` — e.g. an unguarded
`app.sendMessage(...)` — needs a null check (`app?.sendMessage(...)`).
