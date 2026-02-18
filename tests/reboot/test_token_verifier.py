import jwt
from log.log import get_logger
from reboot.aio.auth import Auth
from reboot.aio.auth.token_verifiers import TokenVerifier
from reboot.aio.contexts import ReaderContext
from typing import Any, Optional

logger = get_logger(__name__)


class TestTokenVerifier(TokenVerifier):
    """Test token verifier that uses a self-signed JWT for authentication.
    """

    # Using that class variable to test the 'context.method' property.
    method: Optional[str] = None

    def __init__(self, *, secret: str):
        self._secret = secret

    async def verify_token(
        self,
        context: ReaderContext,
        token: Optional[str],
    ) -> Optional[Auth]:
        """Decode self-signed JWT and return Auth.

        The token must contain the `sub` claim. This claim is assumed to hold
        the user id.
        """
        assert token == context.caller_bearer_token

        if self.method:
            assert context.method == self.method, (
                f'Expected method {self.method}, got {context.method}'
            )

        try:
            decoded = jwt.decode(
                token,
                self._secret,
                algorithms=["HS256"],
            )
            return Auth(
                user_id=decoded['sub'],
                properties=decoded,
            )
        except (jwt.exceptions.DecodeError, KeyError) as e:
            logger.debug(
                f"An error occurred while decoding the token: {e}",
            )
            logger.debug(
                f"The token that was attempted to be decoded was: '{token}'",
            )
            return None

    @staticmethod
    def create_test_token(payload: dict[str, Any], secret: str) -> str:
        """Helper to generate a self-signed JWT with the given secret and payload.
        """
        return jwt.encode(
            payload,
            secret,
            algorithm="HS256",
        )
