## `presence.servicers()` is gone: register `presence_library()`

`reboot.std.presence.v1.presence.servicers()` no longer exists. The
three presence servicers are registered as a library:

    grep -rn 'presence.servicers()\|presence\.v1\.presence import' --include=*.py backend/

For each `Application(...)` that added `presence.servicers()` to
`servicers=[...]`, delete it from there and add
`presence_library()` to `libraries=[...]`, importing it with
`from reboot.std.presence.v1.presence import presence_library`:

```python
# Before
servicers=[MyServicer] + presence.servicers(),

# After
servicers=[MyServicer],
libraries=[presence_library()],
```

The library's default authorizer admits a caller with a verified
token or the application itself, where `servicers()` admitted every
caller. An application whose users do not sign in (no
`Application(oauth=...)`) keeps today's behavior with
`presence_library(authorizer=allow())`, importing `allow` from
`reboot.aio.auth.authorizers`; one whose users do sign in needs
nothing more, since every call its page makes carries the user's
token.

In Node.js, `presence.servicers()` from `@reboot-dev/reboot-std/presence/v1`
is gone the same way; register `presenceLibrary()` from that package in
`libraries`:

```ts
// Before
new Application({ servicers: presence.servicers() });

// After
new Application({ libraries: [presenceLibrary()] });
```

`presenceLibrary({ authorizer })` takes an `Authorizer` for every
method of all three servicers; the default is the same as in Python.
