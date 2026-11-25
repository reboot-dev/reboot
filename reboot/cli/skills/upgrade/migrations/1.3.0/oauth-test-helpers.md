## `TokenVerifierForTest` has been removed

The test harness no longer needs a stub verifier: it always supplies
a test OAuth provider (a real `oauth=...` app, or an auto-supplied
one when the app under test passes no `oauth=`), and that OAuth
server's verifier mints and verifies impersonation tokens on its
own. So if any test constructs `TokenVerifierForTest()` (from
`reboot.aio.tests`, passed as `Application(token_verifier=...)` to
stand in for a production identity-provider verifier), delete the
substitution — keep `token_verifier=<your production verifier>`
exactly as it is in production.

To impersonate a user, use
`await rbt.create_external_context_as(name, user_id)` (or, when a
raw token string is needed — e.g. for an `Authorization:` header —
`await rbt.make_valid_oauth_access_token(user_id=...)`). The
impersonated user's `User` state is auto-constructed as a side
effect of minting the token, so an explicit `_auto_construct` call
for that user can be dropped too.

Before:

```python
from reboot.aio.tests import TokenVerifierForTest
# ...
Application(
    servicers=[...],
    token_verifier=TokenVerifierForTest(),
)
# ...
context = self.rbt.create_external_context(
    name=f"test-{self.id()}",
    bearer_token=self.rbt.make_valid_oauth_access_token(user_id="alice"),
)
```

After:

```python
# ...
Application(
    servicers=[...],
    token_verifier=<your production verifier>,
)
# ...
context = await self.rbt.create_external_context_as(
    name=f"test-{self.id()}",
    user_id="alice",
)
```

## `oauth=` is no longer needed in tests

The test harness now always backs the application under test with a
test OAuth provider, so a test that passed
`oauth=OAuthProviderForTest(Anonymous())` (or `Development()`) only to
give impersonation something to mint against can drop that argument —
and its now-unused imports — entirely. Keep an explicit `oauth=` only
in a test that exercises an OAuth sign-in flow itself (e.g. of a
custom `OAuthProvider`).

## `Reboot.make_valid_oauth_access_token()` is now `async`

If any test still calls `make_valid_oauth_access_token(` on a `Reboot`
instance, `await` the call (and make the surrounding test method
`async` if it isn't already). The method now mints the token through
the application's OAuth server, so it returns a coroutine.

Before:

```python
bearer_token=self.rbt.make_valid_oauth_access_token(user_id="alice")
```

After:

```python
bearer_token=await self.rbt.make_valid_oauth_access_token(user_id="alice")
```

A call site left un-awaited silently passes a coroutine where a `str`
is expected — typically surfacing later as an opaque "token is not a
string" or JWT-decode error rather than an obvious async/sync
mismatch.

## Prefer `create_external_context_as` for impersonation

The common case — building an `ExternalContext` authenticated as a
user — now has a one-call helper:
`await rbt.create_external_context_as(name, user_id)`. It mints the
OAuth access token and hands it to `create_external_context` for you,
so prefer it over spelling the two out by hand. Reach for
`make_valid_oauth_access_token` directly only when you need the raw
token (e.g. to set an `Authorization:` header).

Before:

```python
self.context = self.rbt.create_external_context(
    name=f"test-{self.id()}",
    bearer_token=await self.rbt.make_valid_oauth_access_token(
        user_id="alice",
    ),
)
```

After:

```python
self.context = await self.rbt.create_external_context_as(
    name=f"test-{self.id()}",
    user_id="alice",
)
```
