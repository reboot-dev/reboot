## HTTP routes that checked a bearer themselves use `require_oauth_token=True`

`application.http.get(path, require_oauth_token=True)` (and `post`)
serves a route only to a request signed in as a user of the
application, by the access JWT as `Authorization: Bearer` or by the
`rbt_session` cookie on a same-origin navigation, and answers its own
CORS preflight with any origin and no credentials. Delete the code a
route had for this. Find candidates:

    grep -rn 'headers.get("authorization")\|jwt.decode(\|Access-Control-Allow' --include=*.py backend/

For each route found, and for any route registered `app_internal=True`
only to serve files to the page: add `require_oauth_token=True`,
delete your own bearer check and its 401, any
`Access-Control-*` headers and `OPTIONS` route, and `app_internal=True`.
Call Reboot methods with `external_context(request)` if the handler
needs the user. The application must have `Application(oauth=...)`.

On the page side: in a web app the application serves itself, an
`<img src>`, `<video src>` or `<a href>` pointing at such a route
stays as it is, since the browser sends the session cookie. In an MCP
UI, or a web app on another origin, there is no cookie: replace it
with a fetch carrying the client's bearer, shown from an object URL
(see `python/references/auth-http-routes.md`). Remove any token from
a query string.
