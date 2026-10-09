## `_auto_construct` was renamed to `_authenticated`

The generated static method
`<StateType>._auto_construct(context, state_id)` on auto-construct
state types (and on their servicers) is now
`<StateType>._authenticated(context, state_id, claims=None)`. It
still constructs the state idempotently; the new optional `claims`
parameter is delivered by the framework and is not something callers
need to pass.

If any file calls `._auto_construct(`, rename the call to
`._authenticated(`. Arguments are unchanged.

If any servicer class defines its own `_auto_construct` method,
rename the definition to `_authenticated` and add a trailing optional
`claims: Mapping[str, Any] | None = None` parameter, or the framework
will no longer invoke it.
