"""Services on the application's own loopback that the application
forwards a path prefix each to, so that a browser reaches them on
the application's origin."""

from dataclasses import dataclass


# TODO: support `ext_authz`-style external authorization, so that the
# application decides who may call an upstream before a request is
# forwarded. Today whoever can reach the application can reach every
# upstream on its prefix, and a service that must not be open to
# everyone has to protect itself (an object store by honouring only
# signed URLs).
@dataclass(frozen=True)
class Upstream:
    """A service on the application's own loopback that the application
    forwards one path prefix to: a request for `{prefix}{rest}` is
    sent to `port` as `{prefix_rewrite}{rest}`, carrying
    `host_rewrite` as its `Host` header. A browser then reaches the
    service on the application's origin, by whatever name it reached
    the application by, with no second port to expose and no CORS to
    configure. For a service shipped alongside the application: an
    object store a library runs, say, or a search index in the same
    container."""
    # Names the upstream; unique within an application.
    name: str
    # The path prefix the application's clients use, e.g. a library's
    # proto package: `/rbt.std.blob.v1/`.
    prefix: str
    # The loopback port the service listens on.
    port: int
    # What `prefix` becomes on the way there; `/` drops it.
    prefix_rewrite: str = "/"
    # The `Host` header the service receives; empty leaves the one the
    # client sent. A signed URL's signature covers this header, so an
    # object store is sent the host its URLs were signed for.
    host_rewrite: str = ""
    # Whether the service is reached over TLS. Its certificate is not
    # validated: on the loopback there is nothing to validate it
    # against, and a service shipped alongside the application is
    # the application's own. The name in `host_rewrite`, if any, is
    # sent as the SNI.
    tls: bool = False
    # Whether the service speaks HTTP/2 (e.g. gRPC) rather than
    # HTTP/1.1.
    http2: bool = False
