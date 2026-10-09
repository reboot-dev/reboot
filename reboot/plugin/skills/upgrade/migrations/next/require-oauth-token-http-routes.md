## HTTP routes that checked a bearer by hand use `require_oauth_token=True`

`application.http.get(path, require_oauth_token=True)` (and `post`)
now serves a route only to a request signed in as a user of the
application: the access JWT the built-in OAuth server minted, as
`Authorization: Bearer`, or the `rbt_session` cookie on a same-origin
browser navigation. Anything else gets a 401. The route also answers
its own CORS preflight, allowing any origin with no credentials, so a
page in an MCP host's sandbox can fetch it with the bearer it holds.
Before, a route that needed this had to do it itself, and any
application that did should delete that code and use the keyword.

Find candidates in the backend:

    grep -rn 'headers.get("authorization")\|headers\["authorization"\]\|jwt.decode(\|Access-Control-Allow' --include=*.py backend/

and look for an HTTP route (a function registered with
`application.http.get(...)` / `.post(...)`) that reads the
`Authorization` header, decodes or compares a token, returns a 401
itself, sets `Access-Control-*` headers, or registers an `OPTIONS`
route for a preflight. Also look for a route registered
`app_internal=True` that serves files or data to the page: that
bypasses every authorizer and is not an authentication check at all.

For each such route:

1. Add `require_oauth_token=True` to its registration.
2. Delete the hand-written bearer check, the 401 it returned, any
   `Access-Control-*` headers it set, and the `OPTIONS` route that
   answered its preflight. Delete `app_internal=True` if it was
   there for this reason.
3. If the handler needs the user, call Reboot methods with
   `external_context(request)` (from `reboot.aio.http`): the bearer
   rides along and authorizers see `context.auth.user_id`.

The application must have `Application(oauth=...)`; a route with
`require_oauth_token=True` and no OAuth server refuses to start.

On the page side, find an `<img src>`, `<video src>` or `<a href>`
that points at such a route, or a URL that carries a token in its
query string:

    grep -rn 'src={\|href={\|token=' --include=*.tsx web/src/

and replace it with a fetch carrying the client's bearer, shown from
an object URL; the hook for it is in
`python/references/auth-http-routes.md`. In a web app a same-origin
`<a href>` may stay, since the browser sends the session cookie on
the navigation. Remove any token from a query string.
