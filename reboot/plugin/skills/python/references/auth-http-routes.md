---
title: HTTP Routes Only a Signed-in User May Call (`require_oauth_token=True`)
impact: HIGH
impactDescription: A plain HTTP route serves every request. Checking the bearer yourself, or writing CORS headers yourself so a page can reach the route, gets the cookie-versus-bearer distinction wrong. One keyword does it correctly, for both web apps and MCP UIs.
tags: auth, http, route, require_oauth_token, bearer, cors, file, download, image, video, fetch, object-url
---

## HTTP Routes Only a Signed-in User May Call

Reboot methods are authorized by `authorizer()` rules. A plain HTTP
route (a file the page downloads, an image or video it shows, an
export) is authorized by `require_oauth_token=True`:

```python
from starlette.responses import FileResponse

# In `main()`, after constructing `application`:
@application.http.get("/exports/{name}", require_oauth_token=True)
async def export(name: str) -> FileResponse:
    return FileResponse(_export_path(name))
```

The route then serves only a request signed in as a user of the
application: one carrying the access JWT the built-in OAuth server
minted as `Authorization: Bearer`, or, from a page the application
serves itself, the `rbt_session` cookie the browser sends on its own.
Anything else gets a 401. It needs `Application(oauth=...)`; an
application without one refuses to start with such a route.

The route is callable from any origin, the way `/mcp` is: it answers
its own CORS preflight with no credentials allowed, so a cross-origin
page can call it only with a bearer it already holds, never with the
user's cookie, which is what lets a page in an MCP host's sandbox
fetch from it. Do not add `Access-Control-*` headers of your own, do
not check the bearer yourself, and do not use `app_internal=True` to
skip auth: that gives every caller an app-internal context, which
bypasses every authorizer.

To act as the signed-in user inside the handler, call Reboot methods
with `external_context(request)` (from `reboot.aio.http`): the bearer
is forwarded, and the methods' authorizers see `context.auth.user_id`.

## The Page Side

**Same origin: use the cookie.** A page the application serves
itself, a web app at the application's own address, needs no code:
`<img src="/exports/chart.png">`, `<video src="...">` and
`<a href="/exports/report.csv">` work as they are, because the
browser sends the session cookie with them. They stream, cache and
download the way the browser does, which a fetch cannot match for a
video.

**Cross-origin: the bearer is the only way.** An MCP UI runs in the
host's sandbox, and a web app on another origin never had this
application's cookie. The page's only credential is the client's
bearer, and an `<img src>`, `<video src>` or `<a href>` cannot carry a
header, so fetch with the bearer and show an object URL, revoking it
when the element unmounts. Never put the token in a query string: it
is written to logs and sent as a referrer.

A fetch can fail three ways, and the status tells them apart:

- **401: the access token has expired.** The route sends
  `WWW-Authenticate: Bearer error="invalid_token"` with it, and only
  ever about the token in the `Authorization` header. Get a fresh one
  from `useRefreshBearerToken()` (from `@reboot-dev/reboot-react`),
  which refreshes the session the way the generated hooks do when a
  call answers 401, coalescing concurrent callers, and in an MCP
  host asks the host; fetch once more with it.
- **No fresh token: the session is over, or the refresh failed.**
  `useRefreshBearerToken()` resolves to `undefined` in both cases.
  When the refresh token has expired too, the OAuth server answered
  the refresh with 401 and the provider is now signed out: a page
  with a sign-in shows it (`useUser()` has no user). When the refresh could
  not reach the application, nothing is known about the session.
  The page need not tell the two apart: wait and fetch again, and if
  the session is over, the provider has moved the page on before
  then. So a 401 from the route is always the access token, and
  signed out is the provider's state after a refresh.
- **A network error, or a 5xx: nothing is known about the token.**
  Wait and fetch again with the same token, for as long as the
  element is shown.

```tsx
const client = useRebootClient();
const refreshBearerToken = useRefreshBearerToken();

const RETRY_MS = 2_000;
const pause = () => new Promise((resolve) => setTimeout(resolve, RETRY_MS));

// Resolves to the recording, trying again until it has it; the
// caller stops waiting when its element unmounts.
const fetchRecording = async (
  token: string | undefined,
  refreshed = false
): Promise<Blob> => {
  let response: Response;
  try {
    response = await fetch(new URL(path, client.url).toString(), {
      headers: token === undefined ? {} : { Authorization: `Bearer ${token}` },
    });
  } catch {
    await pause(); // Unreachable: the same token, again.
    return fetchRecording(token, refreshed);
  }
  if (response.status === 401 && !refreshed) {
    // The access token expired; once with a fresh one.
    const fresh =
      refreshBearerToken === null ? undefined : await refreshBearerToken();
    if (fresh === undefined) {
      // The session is over, or the refresh failed; the provider
      // shows the sign-in if it is the former.
      await pause();
      return fetchRecording(token);
    }
    return fetchRecording(fresh, true);
  }
  if (response.status >= 500) {
    await pause();
    return fetchRecording(token, refreshed);
  }
  if (!response.ok) throw new Error(`${response.status} for ${path}`);
  return response.blob();
};

const url = URL.createObjectURL(await fetchRecording(client.bearerToken)); // Revoke when done.
```
