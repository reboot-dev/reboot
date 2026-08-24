## OAuth options moved into an `OAuth` object

`Application(...)` no longer accepts `oauth=<selector>`,
`allowed_origins=[...]`, or `native_redirect_uris=[...]` as three
separate parameters. They are now fields of a single `OAuth` object,
still passed as `oauth=`. `native_redirect_uris` is renamed to
`skip_consent_for_redirect_uris`, which is what it has always done:
list the redirect URIs whose clients sign a user in without a consent
screen.

In every file that constructs `Application(...)` with any of those
three parameters:

1. Add the import:

   ```python
   from reboot.aio.auth.oauth import OAuth
   ```

2. Wrap the `oauth=` value in `OAuth(provider=...)` and move
   `allowed_origins=` and `native_redirect_uris=` inside it, renaming
   the latter.

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

An `Application(...)` passing none of the three needs no change.

Note that `allowed_origins` now requires an OAuth provider beside it:
an application that passed `allowed_origins=[...]` with no `oauth=`
must now pass `oauth=OAuth(provider=..., allowed_origins=[...])`.
