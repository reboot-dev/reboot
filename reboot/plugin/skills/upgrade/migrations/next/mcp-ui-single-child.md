## `RebootClientProvider` must wrap exactly one element in MCP UIs

Reboot now auto-injects the AI-supplied UI request props (from
`UI(request=<Model>)` declarations) onto the single child element of
`RebootClientProvider`, using `React.cloneElement`. As a result, in an
MCP UI, `RebootClientProvider` must wrap exactly one React element —
your UI App component. A misconfigured tree now throws at render time
with a message explaining the fix.

In each UI's `main.tsx` (typically under a `frontend/mcp/<name>/` directory),
find any `RebootClientProvider` that wraps more than one child, a
fragment (`<>...</>`), an array, or a non-element child, e.g.:

```tsx
<RebootClientProvider>
  <Header />
  <App />
</RebootClientProvider>
```

Wrap those children in a single parent component and render that one
component instead:

```tsx
<RebootClientProvider>
  <AppShell />
</RebootClientProvider>
```

where `AppShell` is a component you define that renders `<Header />`
and `<App />`. UIs that already render a single component need no
changes.
