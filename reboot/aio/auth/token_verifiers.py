import rbt.v1alpha1.errors_pb2
from abc import ABC, abstractmethod
from reboot.aio.auth import Auth
from reboot.aio.contexts import ReaderContext
from typing import Optional, Union

# Return type for `TokenVerifier.verify_token`:
#   - `Auth`: caller is authenticated.
#   - `None`: no opinion (defer to Authorizer).
#   - `Unauthenticated`: definitively reject the request.
VerifyTokenResult = Union[
    Auth,
    None,
    rbt.v1alpha1.errors_pb2.Unauthenticated,
]


class TokenVerifier(ABC):
    """Abstract base class for token verifiers.

    A token verifier is used to verify the authenticity of the `Authorization
    Bearer` token when passed and optionally extract token metadata. It can
    also observe any other headers present on the given ReaderContext.
    """

    @abstractmethod
    async def verify_token(
        self,
        context: ReaderContext,
        token: Optional[str],
    ) -> VerifyTokenResult:
        """Verify the bearer token.

        Returns:
            * `Auth` if the token is valid and the caller is
              authenticated.
            * `None` if there is no opinion (e.g. no token was
              provided). The `Authorizer` will decide whether to allow
              or reject the request.
            * `Unauthenticated` to definitively reject the request,
              bypassing the `Authorizer`. Use this when it is clear the
              caller intended to authenticate but failed (e.g. an
              expired token).
        """
        raise NotImplementedError()
