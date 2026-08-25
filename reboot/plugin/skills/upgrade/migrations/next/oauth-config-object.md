## OAuth options moved into an `OAuth` object

`Application(...)` no longer accepts `oauth=<selector>`,
`allowed_origins=[...]`, or `native_redirect_uris=[...]` as three
separate parameters. They are now fields of a single `OAuth` object,
still passed as `oauth=`. `native_redirect_uris` is renamed to
`skip_consent_for_redirect_uris`, which is what it has always done:
list the redirect URIs whose clients sign a user in without a consent
screen.

Passing any of the three to `Application(...)` now raises
`TypeError`, so an application that uses them will not start until
this is applied.

Find the call sites:

```sh
grep -rn "oauth=\|allowed_origins=\|native_redirect_uris=" backend/
```

An `Application(...)` that passes none of the three needs no change.

### 1. Add the import

In every file that constructs an `Application(...)` with any of the
three:

```python
from reboot.aio.auth.oauth import OAuth
```

### 2. Move the three options inside `oauth=OAuth(...)`

Wrap the old `oauth=` value as `provider=`, move `allowed_origins=`
across unchanged, and move `native_redirect_uris=` across under its
new name.

Before:

```python
Application(
    servicers=[...],
    oauth=OAuthProviderByEnvironment(
        dev=Development(),
        prod=Google(...),
    ),
    allowed_origins=["https://app.example.com"],
    native_redirect_uris=["myapp://redirect"],
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
        skip_consent_for_redirect_uris=["myapp://redirect"],
    ),
)
```

An application that passed only `oauth=` moves only that one field:
`oauth=OAuth(provider=<the old value>)`.

### 3. Stop if `allowed_origins` appears without `oauth=`

`allowed_origins` now requires a provider beside it, so an
application that restricted its origins while authenticating with
`token_verifier=` alone has no direct translation.

Do **not** resolve this by deleting `allowed_origins`: that silently
widens the application back to permissive CORS, which is a change to
who may make credentialed browser requests to the backend. Do not
invent a provider either.

Report it to the developer instead, quoting the call site, and let
them choose between adopting an OAuth provider and accepting
permissive CORS.
