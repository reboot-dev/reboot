from __future__ import annotations

from dataclasses import dataclass, field
from google.protobuf import json_format, struct_pb2
from rbt.v1alpha1 import auth_pb2
from typing import Any, Optional


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
