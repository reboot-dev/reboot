from __future__ import annotations

import uuid
from dataclasses import dataclass
from rebootdev.aio.idempotency import Idempotency
from rebootdev.aio.types import (
    GrpcMetadata,
    InvalidBearerTokenError,
    InvalidIdempotencyKeyError,
)
from rebootdev.aio.types import InvalidStateRefError as InvalidStateRefError
from rebootdev.aio.types import validate_ascii
from rebootdev.settings import (
    MAX_BEARER_TOKEN_LENGTH,
    MAX_IDEMPOTENCY_KEY_LENGTH,
)
from typing import Optional


@dataclass(kw_only=True, frozen=True)
class Options:
    """Options for RPCs."""
    idempotency_key: Optional[uuid.UUID] = None
    idempotency_alias: Optional[str] = None
    generate_idempotency: bool = False
    metadata: Optional[GrpcMetadata] = None
    bearer_token: Optional[str] = None

    def __post_init__(self):
        validate_ascii(
            self.idempotency_key,
            'idempotency_key',
            MAX_IDEMPOTENCY_KEY_LENGTH,
            error_type=InvalidIdempotencyKeyError,
            illegal_characters='\n',
        )
        validate_ascii(
            self.bearer_token,
            'bearer_token',
            MAX_BEARER_TOKEN_LENGTH,
            error_type=InvalidBearerTokenError,
            illegal_characters='\n',
        )

        if sum(
            (
                self.idempotency_alias is not None, self.idempotency_key
                is not None, self.generate_idempotency
            )
        ) > 1:
            raise TypeError(
                "options: only one of 'idempotency_key', 'idempotency_alias', "
                "or 'generate_idempotency' should be set"
            )

    @property
    def idempotency(self) -> Optional[Idempotency]:
        if self.idempotency_key or self.idempotency_alias:
            return Idempotency(
                key=self.idempotency_key, alias=self.idempotency_alias
            )
        elif self.generate_idempotency:
            return Idempotency()
        return None


class MixedContextsError(ValueError):
    pass
