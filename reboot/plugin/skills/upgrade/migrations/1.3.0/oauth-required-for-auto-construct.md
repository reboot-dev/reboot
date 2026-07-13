## Auto-construct state types now require `oauth=`

An `Application` with `User`-typed auto-construct servicers (state
types constructed on demand for a signed-in user) used to start even
when it configured no `Application(oauth=...)`: it came up silently
and simply never constructed those states, since a user is only ever
identified through the OAuth sign-in flow. It now fails fast at
startup — in serving pods and Reboot Cloud config pods alike — with
an error explaining that `oauth=` is required.

A custom `Application(token_verifier=...)` does not satisfy this
requirement: it authenticates incoming requests but never triggers
auto-construction, so it can't stand in for `oauth=`.

If any `Application(...)` in your app passes auto-construct servicers
(e.g. a `User`-typed servicer) but no `oauth=`, add an OAuth
provider:

```python
Application(
    servicers=[UserServicer, ...],
    oauth=OAuthProviderByEnvironment(dev=..., prod=...),
)
```
