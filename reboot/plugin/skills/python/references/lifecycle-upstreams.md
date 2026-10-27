---
title: Forward a Path Prefix to a Service in the Container with `Upstream`
impact: MEDIUM
impactDescription: A service shipped alongside the application needs the application's origin, not a second port and CORS
tags: lifecycle, Library, Upstream, upstreams, pre_run, prefix, loopback, sidecar
---

## Forward a Path Prefix to a Service in the Container with `Upstream`

> **Critical:** an upstream is a service on the application's own
> loopback, nothing else. Reaching a service elsewhere is not what
> this is for. And nothing checks who calls it: a service that must
> not be open to everyone protects itself (signed URLs, as blobs do).

An application may ship with a service of its own that the browser
must reach: a search index, an inference server, the Silo blobs use
locally. Such a service listens on the application's loopback, and
the application forwards one path prefix of its own to it, so the
browser reaches the service on the application's origin by whatever
name it reached the application by, with no second port to expose
and no CORS to configure.

### Name It from a `Library`

A `Library` whose `pre_run` starts (or finds) the service and whose
`upstreams()` returns an `Upstream` per prefix:

```python
from reboot.aio.applications import Application, Library
from reboot.routing.upstreams import Upstream


class SearchIndexLibrary(Library):
    name = "search-index"

    def servicers(self):
        return []

    async def pre_run(self, application):
        # Called in every server process before it serves, and more
        # than once in a test that `up`s after a `down`: start the
        # service if it is not running, and remember its port.
        self._port = await start_search_index()

    def upstreams(self):
        return [
            Upstream(
                name="search-index",
                prefix="/__/search/",
                port=self._port,
                # What the prefix becomes on the way there: `/` drops
                # it, so `/__/search/query` arrives as `/query`.
                prefix_rewrite="/",
            )
        ]


await Application(
    servicers=[MyServicer],
    libraries=[SearchIndexLibrary()],
).run()
```

The browser then fetches `/__/search/query` on the application's
origin, under `rbt dev run` and on Reboot Cloud alike.

### `Upstream` Fields

| Field              | Meaning                                                                                                                                                         |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name`             | Unique among the application's upstreams.                                                                                                                       |
| `prefix`           | The path prefix the application's clients use, e.g. `/__/search/` or a proto package. `/` answers every path nothing else claimed, after the application's own. |
| `port`             | The loopback port the service listens on.                                                                                                                       |
| `prefix_rewrite`   | What `prefix` becomes on the way there; `/` drops it (the default), `None` leaves the path as it is.                                                            |
| `host_rewrite`     | The `Host` header the service receives, for one that checks it (a bucket honouring signed URLs). Empty leaves the client's.                                     |
| `tls`              | Reach the service over TLS. Its certificate is not validated; `host_rewrite`'s name is the SNI.                                                                 |
| `http2`            | The service speaks HTTP/2 (gRPC, say) rather than HTTP/1.1.                                                                                                     |
| `unreachable_html` | An HTML page to answer with in place of a bare 503 when the service cannot be reached.                                                                          |

### Rules

- **Prefixes do not overlap.** A prefix that overlaps another
  library's, or a path the application answers itself (an
  `application.http` route, `/__/frontend/`), is refused when the
  application starts. Pick a prefix of your own, under `/__/` by
  convention.
- **`pre_run` is where the port comes from.** `upstreams()` is asked
  after `pre_run`, in the process that starts the application; a
  service that picks its own port reports it there.
- **Nothing is authorized on the way in.** Whoever can reach the
  application can send requests on the prefix. Plan for the service
  to check what it is sent, or for the prefix to carry nothing
  sensitive, until the application can decide who may call an
  upstream (planned).
- **Any replica may answer on the Cloud.** A request on the prefix
  lands on whichever replica of the application; fine for a service
  that is the same in every container, not for per-container state.
- **Python only.** A `NodeApplication`'s libraries cannot name
  upstreams today.
