## Web `reactively()` reads end when the loop is left

A `for await` over a `Type.ref(id).reactively().<reader>(context)`
generator (`@reboot-dev/reboot-web`) used to leave the request open
when the loop was left with `break`, `return` or an exception: only
aborting an `AbortSignal` passed as `{ signal }` ended it. Leaving the
loop now ends the read and its request too, over HTTPS as it already
did over WebSockets.

Code that created an `AbortController` only to end a read it had
the answer to can drop it. Find reads that pass a signal, matching
only the opening parenthesis since a formatter may have split the
call across lines:

    grep -rn "\.reactively(" --include=*.ts --include=*.tsx --include=*.js

For each one whose signal comes from a controller aborted right after
the loop, or in a `finally` around it, and nowhere else, drop the
controller and the `try`/`finally`. Before:

```ts
const controller = new AbortController();
try {
  const [responses] = await cart
    .reactively()
    .get(context, {}, { signal: controller.signal });
  for await (const { response } of responses) {
    if (response?.items.length > 0) {
      return response;
    }
  }
} finally {
  controller.abort();
}
```

After:

```ts
const [responses] = await cart.reactively().get(context);
for await (const { response } of responses) {
  if (response?.items.length > 0) {
    return response;
  }
}
```

Keep a signal that is aborted from outside the loop, for example in a
React effect's cleanup or when a page goes away: that is still how a
read is ended by something other than the loop itself. A `signal` the
read receives from its own caller can be passed through as is.
