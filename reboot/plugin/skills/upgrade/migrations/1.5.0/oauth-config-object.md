## OAuth options moved into an `OAuth` object

`Application(...)` no longer accepts `oauth=<selector>` and
`allowed_origins=[...]` as two separate parameters. They are now
fields of a single `OAuth` object, still passed as `oauth=`.

Passing either one directly to `Application(...)` now raises
`TypeError`, so an application that uses them will not start until
this is applied.

Find the call sites:

```sh
grep -rn "oauth=\|allowed_origins=" backend/
```

An `Application(...)` that passes neither needs no change.

### 1. Add the import

In every file that constructs an `Application(...)` with either:

```python
from reboot.aio.auth.oauth import OAuth
```

### 2. Move both options inside `oauth=OAuth(...)`

Wrap the old `oauth=` value as `provider=` and move
`allowed_origins=` across unchanged.

Before:

```python
Application(
    servicers=[...],
    oauth=OAuthProviderByEnvironment(
        dev=Development(),
        prod=Google(...),
    ),
    allowed_origins=["https://app.example.com"],
)
```

After:

```python
Application(
    servicers=[...],
    oauth=OAuth(
        provider=OAuthProviderByEnvironment(
            dev=Development(),
            prod=Google(...),
        ),
        allowed_origins=["https://app.example.com"],
    ),
)
```

An application that passed only `oauth=` moves only that one field:
`oauth=OAuth(provider=<the old value>)`.

### 3. Stop if `allowed_origins` appears without `oauth=`

`allowed_origins` now requires a provider beside it, so an
application that restricted its origins while authenticating with
`token_verifier=` alone has no direct translation.

Do **not** resolve this by deleting `allowed_origins`: on its own it
still narrowed the CORS allow-list Envoy serves, so dropping it
widens the application back to accepting credentialed browser
requests from any origin. Do not invent a provider either.

Report it to the developer instead, quoting the call site, and let
them choose between adopting an OAuth provider and accepting
permissive CORS.
