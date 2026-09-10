# Annotate every Python parameter and return type

Give every parameter of every Python function and method a type
annotation, and every function a return type — including `self`-less
helpers, nested functions, and parameters whose type feels obvious
from the name. Leaving one off because `mypy` doesn't demand it is
not a reason to leave it off.

**Why:** `mypy` only checks a function's body once its signature is
annotated, so a single un-annotated parameter silently switches off
checking for everything that flows through it. An annotation is also
the cheapest documentation a reader gets: `stub` says nothing,
`stub: react_pb2_grpc.ReactStub` says where to look next.

**How to apply:** When writing or editing a `def`, annotate all of
its parameters and its return type in the same edit. When a
parameter's type is a generated protobuf message or gRPC stub, name
that type rather than falling back to `Any` — import it if the module
doesn't already. `self` and `cls` need no annotation, and neither do
`*args`/`**kwargs` when they are forwarded verbatim to an already
typed callee.
