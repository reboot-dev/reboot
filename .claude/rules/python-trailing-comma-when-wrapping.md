# End a wrapped definition or call with a trailing comma

Whenever the parameters of a function or method definition, or the
arguments of a function or method call, are wrapped onto their own
lines, put a comma after the last one:

```python
def _check_initial(
    *,
    state: statechart_pb2.Statechart.State,
    hierarchical_state_name: str,
) -> list[str]:
    ...


problems.append(
    f"{subject} has more than one state named '{name}'",
)
```

A definition or call that fits on one line has no trailing comma.

**Why:** With the comma, adding a parameter or an argument is a
one-line diff that leaves the line before it alone, and the formatter
keeps each parameter or argument on its own line rather than packing
them back together.

**How to apply:** Any time the closing `)` of a definition or call is
on a later line than its last parameter or argument, that parameter
or argument ends with a comma — also when there is only one of them,
such as `self` or a single multi-line string. The one exception is a
call whose only argument is an unparenthesized generator expression,
where Python does not allow the comma.
