---
title: HTTP Routes Only a Signed-in User May Call (`require_oauth_token=True`)
impact: HIGH
impactDescription: A plain HTTP route serves every request. One keyword makes it serve only a request carrying the application's access token; CORS is answered for you, and no cookie reaches the route. This works for both web apps and MCP Apps.
tags: auth, http, route, require_oauth_token, bearer, cors, file, download, image, video, fetch, object-url
---

## HTTP Routes Only a Signed-in User May Call

Reboot methods are authorized by `authorizer()` rules. A plain HTTP
route (a file the page downloads, an image or video it shows, an
export) is authorized by `require_oauth_token=True`:

```python
from starlette.responses import FileResponse

# In `main()`, after constructing `application`:
@application.http.get("/exports", require_oauth_token=True)
async def export(name: str) -> FileResponse:
    return FileResponse(_export_path(name))
```

A request is matched to the route by its exact path, so the path
cannot be a template (`/exports/{name}` is refused at registration);
take the name as a query parameter, `/exports?name=report.csv`.

The route then serves only a request signed in as a user of the
application: one carrying the access JWT the built-in OAuth server
minted as `Authorization: Bearer`. Anything else gets a 401. The
session cookie never reaches the route: it is scoped to `/__/oauth/`,
and a `Cookie` header is removed from every other path, and a
`Set-Cookie` header from every other response. It needs
`Application(oauth=...)`; an
application without one refuses to start with such a route.

The route is callable from any origin, the way `/mcp` is: Envoy's
CORS policy answers any origin without credentials on every path but
the OAuth server's, so a cross-origin page can call the route only
with a bearer it already holds, never with the user's cookie, which
is what lets a page in an MCP host's sandbox fetch from it. Do not
add `Access-Control-*` headers of your own, do not check the bearer
yourself, and do not use `app_internal=True` to skip auth: that gives
every caller an app-internal context, which bypasses every
authorizer.

To act as the signed-in user inside the handler, call Reboot methods
with `external_context(request)` (from `reboot.aio.http`): it carries
the token the route accepted, and the methods' authorizers see
`context.auth.user_id`.

## The Page Side

**No `<img src>` straight at the route.** An `<img>`, `<video>` or
`<a href>` sends no bearer, and the session cookie does not reach the
route, so this holds for a page the application serves itself too.

**Media: obtain a signed URL with the bearer.** MCP hosts
can block both `blob:` and `data:` media sources. Fetch data with the
bearer as usual, but give `<img>` and `<video>` a short-lived HTTPS URL
on an origin declared in `resourceDomains`. An authenticated signing
route must authorize access to the specific file before issuing its
URL. The media route verifies a signature binding that file and its
expiry, using a dedicated derived key, and retains file-path restrictions.
The URL grants anyone holding it access until expiry; avoid logging it.
Never put the application's access token in the URL.

The dashboard uses `/recordings/sign?path=...`, returning `{url, expires}`
with a one-hour lifetime. Resolve its relative URL against `client.url`,
not the sandbox origin. Request it when opening a recording, and once
more when the element reports a load error, which an expired URL
causes; a recording that fails twice stays blank. Media can then use
range requests without first downloading the entire file into a Blob.

The following retry rules apply to the authenticated signing request;
a 401 from the media route instead means its signed URL is invalid or
expired and needs to be obtained again.

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
): Promise<{ url: string; expires: number }> => {
  let response: Response;
  try {
    response = await fetch(
      new URL(
        `/recordings/sign?${new URLSearchParams({ path })}`,
        client.url
      ).toString(),
      {
        headers:
          token === undefined ? {} : { Authorization: `Bearer ${token}` },
      }
    );
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
  return response.json();
};

const signed = await fetchRecording(client.bearerToken);
const url = new URL(signed.url, client.url).toString(); // <video src={url}>
```
