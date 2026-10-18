## HTTP routes that checked a bearer themselves use `require_oauth_token=True`

`application.http.get(path, require_oauth_token=True)` (and `post`)
serves a route only to a request signed in as a user of the
application, by the access JWT as `Authorization: Bearer`; Envoy's
CORS policy lets any origin call it without credentials. Delete the
code a route
had for this. Find candidates:

    grep -rn 'headers.get("authorization")\|jwt.decode(\|Access-Control-Allow' --include=*.py backend/

For each route found, and for any route registered `app_internal=True`
only to serve files to the page: add `require_oauth_token=True`,
delete your own bearer check and its 401, any
`Access-Control-*` headers and `OPTIONS` route, and `app_internal=True`.
Call Reboot methods with `external_context(request)` if the handler
needs the user. The application must have `Application(oauth=...)`.
The path cannot be a template (`/files/{name}`), since a request is
matched to the route by its exact path: take the value as a query
parameter instead, `/files?name=`.

On the page side: an `<img src>`, `<video src>` or `<a href>`
pointing at such a route carries no bearer, and the session cookie
does not reach the route, so replace it with a signed URL obtained
with the client's bearer (see `python/references/auth-http-routes.md`).
Remove any token from a query string.
