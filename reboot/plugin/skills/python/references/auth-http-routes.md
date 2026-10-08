---
title: HTTP Routes Only a Signed-in User May Call (`require_oauth_token=True`)
impact: HIGH
impactDescription: A plain HTTP route serves whoever asks unless told otherwise. Checking the bearer by hand, or hand-writing CORS headers so a page can reach the route, gets the cookie-versus-bearer distinction wrong in ways that either lock the page out or leak the session. One keyword does it correctly, for web apps and MCP UIs alike.
tags: auth, http, route, require_oauth_token, bearer, cors, file, download, image, video, fetch, object-url
---

## HTTP Routes Only a Signed-in User May Call

Most of an application is Reboot methods, which `authorizer()` rules
guard. Some things are plain HTTP: a file the page downloads, an
image or video it shows, an export, a report. Register those on
`application.http` with `require_oauth_token=True`:

```python
from starlette.responses import FileResponse

# In `main()`, after constructing `application`:
@application.http.get("/exports/{name}", require_oauth_token=True)
async def export(name: str) -> FileResponse:
    return FileResponse(_export_path(name))
```

The route then serves only a request signed in as a user of the
application: one carrying the access JWT the built-in OAuth server
minted, as `Authorization: Bearer`, or, for a same-origin browser
navigation such as an `<a href>` the user clicks, the `rbt_session`
cookie. Anything else gets a 401 with `WWW-Authenticate: Bearer`. It
needs `Application(oauth=...)`, whose server mints that token; an
application without one refuses to start with such a route.

The route is callable from any origin, the way `/mcp` is: it answers
its own CORS preflight and replies with no credentials allowed, so a
cross-origin page can call it only with a bearer it already holds,
never with the user's cookie. That is what lets a page shown by an
MCP host, whose sandbox origin is not knowable in advance, fetch what
the route serves. Do not add `Access-Control-*` headers of your own.

To act as the signed-in user inside the handler, call Reboot methods
with `external_context(request)` (from `reboot.aio.http`): the bearer
rides along, and the methods' authorizers see `context.auth.user_id`.

**Incorrect (checking by hand):**

```python
@application.http.get("/exports/{name}")
async def export(request: Request, name: str) -> Response:
    token = request.headers.get("authorization", "").removeprefix("Bearer ")
    if not _verify(token):  # Your own JWT decoding, or a shared secret.
        return Response(status_code=401)
    return FileResponse(
        _export_path(name),
        headers={"Access-Control-Allow-Origin": "*"},  # Hand CORS.
    )
```

**Also incorrect:** `app_internal=True` to "skip auth" on a route a
page calls. That hands an app-internal context, which bypasses every
authorizer, to arbitrary callers; it is for callbacks that run only
after you have verified something yourself. See
`auth-external-api-calls.md`.

## The Page Side: Fetch with the Bearer, Show an Object URL

An `<img src>`, `<video src>` or `<a href>` carries no bearer, so a
page fetches what the route serves with the client's token and shows
it from an object URL, revoking the URL when the element goes. The
same code serves a web app and an MCP UI: in a web app the client's
`url` is the page's origin and its `bearerToken` the session's; in an
MCP UI they are the backend address the host injected and the token
the tool result delivered.

```tsx
import { useRebootClient } from "@reboot-dev/reboot-react";
import { useEffect, useState } from "react";

// The object URL of what the backend serves at `path`, fetched with
// the signed-in user's token; `undefined` until it has arrived.
const useProtectedUrl = (path: string): string | undefined => {
  const client = useRebootClient();
  const [url, setUrl] = useState<string | undefined>(undefined);
  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | undefined = undefined;
    void (async () => {
      const response = await fetch(new URL(path, client.url).toString(), {
        headers:
          client.bearerToken === undefined
            ? {}
            : { Authorization: `Bearer ${client.bearerToken}` },
      });
      if (!response.ok || cancelled) return;
      objectUrl = URL.createObjectURL(await response.blob());
      if (cancelled) {
        URL.revokeObjectURL(objectUrl);
        return;
      }
      setUrl(objectUrl);
    })();
    return () => {
      cancelled = true;
      if (objectUrl !== undefined) URL.revokeObjectURL(objectUrl);
    };
  }, [client, path]);
  return url;
};

const Export: React.FC<{ name: string }> = ({ name }) => {
  const url = useProtectedUrl(`/exports/${encodeURIComponent(name)}`);
  return url === undefined ? null : <a href={url} download={name}>Download</a>;
};
```

In a web app only, a plain same-origin `<a href="/exports/x">` works
as well, since the browser sends the session cookie on the navigation;
in an MCP UI the page is cross-origin to the backend and must fetch.
Never put the token in a query string to make a plain `src` work: it
lands in logs and referrers.
