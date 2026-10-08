"""How the dashboard application authenticates its callers: by the
one credential `rbt dashboard` minted for this launch, which its
gateway gives everything it forwards. There is no one to sign in; the
dashboard is for whoever is at this machine.
"""
import secrets
from rbt.v1alpha1.errors_pb2 import Unauthenticated
from reboot.aio.auth import Auth
from reboot.aio.auth.token_verifiers import TokenVerifier, VerifyTokenResult
from reboot.aio.contexts import ReaderContext


class DashboardTokenVerifier(TokenVerifier):

    def __init__(self, token: str):
        self._token = token

    async def verify_token(
        self,
        context: ReaderContext,
        token: str | None,
    ) -> VerifyTokenResult:
        # The application's own calls, such as its watchers and its
        # `initialize`, carry its caller ID, which Envoy's public
        # listener strips from anything arriving from outside.
        if context.app_internal:
            return None
        if token is not None and secrets.compare_digest(
            token.encode(), self._token.encode()
        ):
            return Auth(user_id='dashboard-developer')
        return Unauthenticated(message='Dashboard credential required')
