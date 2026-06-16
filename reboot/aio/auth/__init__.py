from __future__ import annotations

from dataclasses import dataclass, field
from google.protobuf import json_format, struct_pb2
from rbt.v1alpha1 import auth_pb2
from typing import Any, Optional

# Names of the cookies the OAuth server sets on a browser session,
# defined in this lightweight module so they can be referenced without
# importing the OAuth server's heavy dependency chain.
#
# - `SESSION_COOKIE_NAME` carries the OAuth access-token JWT, HttpOnly,
#   as the browser's durable session. Reboot RPCs authenticate from the
#   `Authorization: Bearer` header; since a SPA can't read an HttpOnly
#   cookie, it fetches the token via `/__/oauth/whoami` and sets it as
#   that bearer itself. (MCP clients hold the token from `/token`
#   directly and don't use this cookie or `/whoami`.)
# - `REFRESH_COOKIE_NAME` carries the refresh-token JWT, scoped to
#   `/__/oauth/` so it only reaches the OAuth endpoints.
# - `PENDING_COOKIE_NAME` holds the server-side PKCE verifier between
#   `/__/oauth/start` and `/__/oauth/finish`.
SESSION_COOKIE_NAME = "rbt_session"
REFRESH_COOKIE_NAME = "rbt_refresh"
PENDING_COOKIE_NAME = "rbt_oauth_pending"


def __getattr__(name: str) -> Any:
    """Lazily re-export the OAuth token public API so
    `from reboot.aio.auth import OAuthTokenManager` works without importing
    the (heavy, cycle-prone) reboot machinery at package import time.
    """
    if name == "OAuthTokenManager":
        from rbt.std.oauth.v1.oauth_rbt import OAuthTokenManager
        return OAuthTokenManager
    if name == "OAuthTokens":
        from reboot.aio.auth.oauth_providers import OAuthTokens
        return OAuthTokens
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


@dataclass(frozen=True, kw_only=True)
class Auth:
    """Dataclass for storing auth details specific to an implementation
    (e.g., depending which identity provider you use, how you do authorization,
    etc). We include some fields that we believe are generic to simplify
    implementations such as the `user_id`.

    The Auth object is provided by the TokenVerifier and passed on the Context
    on every request.
    """
    user_id: Optional[str] = None
    properties: dict[str, Any] = field(default_factory=dict)

    def to_proto_bytes(self) -> bytes:
        # NOTE: We've discussed replacing this dataclass with protobuf, but
        # directly interacting with `google.protobuf.Struct` is awkward.
        properties = struct_pb2.Struct()
        properties.update(self.properties)
        return auth_pb2.Auth(
            user_id=self.user_id,
            properties=properties,
        ).SerializeToString()

    @classmethod
    def from_proto_bytes(cls, proto_bytes: bytes) -> Auth:
        auth = auth_pb2.Auth()
        auth.ParseFromString(proto_bytes)
        return Auth(
            user_id=auth.user_id,
            properties=json_format.MessageToDict(auth.properties),
        )
