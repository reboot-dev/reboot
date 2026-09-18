## Reactive readers no longer retry errors the backend answered with

A React reactive reader hook (`useFoo({ id }).useBar()`) used to
retry every failure with a 1-3 second backoff, including errors the
backend answered the read with: a declared error raised by the
reader, a denied `authorizer()`, `StateNotConstructed`, an unexpected
exception raised by the reader (`Unknown`), and so on. Now only
transport failures (`Unavailable`, `Cancelled`, a dropped connection)
are retried, and those no longer show up as `aborted` while the
reader reconnects. An error the backend answered with is final: it
surfaces as `aborted` with `isLoading` `false`, and the reader reads
again only once a mutation on the same state made through the same
client has completed (e.g. a constructor after
`StateNotConstructed`), or when the component renders with a
different `id`, request, or bearer token.

Look for reader methods whose declared error is expected to clear
because of writes by _other_ clients or by the backend, e.g. a reader
that raises `NoWinnerYet` until some other player ends the game.
Those readers no longer pick up the change by polling, so rewrite
them to return the condition in their response (e.g. a `winner` field
that is empty until there is one) instead of raising it; a reader
that returns a response gets updated on every state change, since
the stream stays open.

Separately, look for components that mount a reader on a state that
_another_ client or the backend constructs later: `StateNotConstructed`
is raised before the reader runs, so the reader's response cannot
help there. Either construct the state through this client before
reading it (an idempotent constructor, or any writer for a state
without an explicit constructor), or mount the reader only once the
application knows the state exists, e.g. by reading a state that does
exist and lists it, so that the hook is rendered with the `id` after
construction.

## `reactively()` reads from `@reboot-dev/reboot-web` throw final errors

The non-React web client's `Type.ref(id).reactively().<reader>(context)`
generator used to retry every failure silently, so a declared error,
a denied `authorizer()`, `StateNotConstructed`, or an unexpected
exception raised by the reader left the `for await` loop waiting
forever with nothing to catch. Now only
transport failures (`Unavailable`, `Cancelled`, a dropped connection)
are retried; any other error ends the generator by throwing the
method's `<Type><Method>Aborted`, the same error the unary call
throws.

Look for `for await` loops over such a generator that are not inside
a `try`, in particular ones run without `await` (a fire-and-forget
`bind(...)` call): they now reject with the `Aborted` instead of
staying silent. Wrap the loop in `try { ... } catch (e) { ... }` and
handle the error, e.g. show it and subscribe again once the state has
been constructed.
