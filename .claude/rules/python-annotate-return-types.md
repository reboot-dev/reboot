---
paths:
  - "**/*.py"
---

# Annotate every function's return type

Every Python function and method you write or touch gets a return
type annotation, `-> None` included, wherever one can be written. The
same goes for parameters: annotate them unless the type genuinely
cannot be named. Generated gRPC servicer methods are no exception —
annotate `request` with its message type and the method with its
response type.

**Why:** A missing return annotation makes `mypy` treat the function
as returning `Any`, which silently switches off type checking for
everything the result flows into. It also leaves the reader to
reconstruct from the body what a method hands back — a method named
`_caller` that returned an `ExternalContext` went unnoticed in review
until someone asked.

**How to apply:** Before committing, scan the diff for `def` lines
without `->`. When a function returns nothing, write `-> None`. When
the natural return type needs an import (a `_pb2` message, an
`Optional[...]`), add the import rather than leaving the annotation
off. The only acceptable omission is a signature whose type cannot be
expressed without a `# type: ignore`, and that deserves a comment.
