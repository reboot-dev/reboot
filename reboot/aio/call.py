from __future__ import annotations

from dataclasses import dataclass
from reboot.aio.types import GrpcMetadata, InvalidBearerTokenError
from reboot.aio.types import InvalidStateRefError as InvalidStateRefError
from reboot.aio.types import validate_ascii
from reboot.settings import MAX_BEARER_TOKEN_LENGTH
from typing import Optional


@dataclass(kw_only=True, frozen=True)
class Options:
    """Options for RPCs."""
    metadata: Optional[GrpcMetadata] = None
    bearer_token: Optional[str] = None

    def __post_init__(self):
        validate_ascii(
            self.bearer_token,
            'bearer_token',
            MAX_BEARER_TOKEN_LENGTH,
            error_type=InvalidBearerTokenError,
            illegal_characters='\n',
        )


class MixedContextsError(ValueError):
    pass
