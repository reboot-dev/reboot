## Python `reactively()` reads yield `(response, aborted)` pairs

`Type.ref(id).reactively().<reader>(context)` used to yield bare
responses and to raise the method's `<Type>.<Method>Aborted` when the
backend answered the read with an error (a declared error raised by
the reader, a denied `authorizer()`, `StateNotConstructed`, ...),
which ended the read. It now yields a `(response, aborted)` pair for
every answer and never raises: for a response, `aborted` is `None`;
for an error, `response` is `None` and `aborted` is the method's
`<Type>.<Method>Aborted`. An error does not end the read: the
subscription stays open and yields again once the state changes.
Failed connections are still retried with backoff without yielding
anything.

Find every use of such a read. Match only the opening parenthesis,
since a formatter may have split the call across lines:

    grep -rn "\.reactively(" --include=*.py

Unpack the pair in every `async for` over one. Before:

```python
async for response in cart.reactively().get(context):
    render(response)
```

After:

```python
async for response, aborted in cart.reactively().get(context):
    if aborted is not None:
        # Decide: `continue` to wait for the state to change, `break`
        # to stop reading, or `raise aborted`.
        continue
    render(response)
```

Also:

- Code that caught the `Aborted` around the loop (`try: async for ... except Type.MethodAborted:`) must handle `aborted` inside the loop
  instead; the `except` is now unreachable.
- Code that pulls items with `anext(...)` gets the pair too:
  `response, aborted = await anext(subscription)`.
- A reader whose response type is empty yields `(None, None)` on
  success, so check `aborted`, not `response`, for those.
