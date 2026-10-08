"""How the dashboard signs its callers in: whoever reaches its OAuth
server is the developer, and every RPC needs the token that says so.

The dashboard is for whoever is at the machine it runs on. Its OAuth
server answers only under loopback names (`OAuth(hosts=...)`), so a
browser or an MCP host on this machine signs in with no questions
asked, while nothing arriving through the dashboard's tunnel, under
the tunnel's name, can. And every RPC has to carry the access token
that sign-in minted, so the tunnel reaches nothing without one.
"""
import rbt.v1alpha1.errors_pb2
from reboot.aio.auth.oauth_providers import (
    ExchangeResult,
    OAuthProvider,
    OAuthProviderSelector,
    UserId,
)
from reboot.aio.auth.token_verifiers import TokenVerifier, VerifyTokenResult
from reboot.aio.contexts import ReaderContext
from typing import Optional
from urllib.parse import urlencode

# The one user of a dashboard.
DEVELOPER = 'developer'


class Developer(OAuthProvider):
    """An identity provider that identifies everyone as the developer,
    with no page to visit: its authorization URL is the OAuth server's
    own callback, code in hand."""

    def authorization_url(self, state: str, redirect_uri: str) -> str:
        return f'{redirect_uri}?{urlencode({"code": DEVELOPER, "state": state})}'

    async def exchange_code(
        self,
        code: str,
        redirect_uri: str,
    ) -> ExchangeResult:
        if code != DEVELOPER:
            # Only `authorization_url` produces the code; the OAuth
            # server turns anything else into `access_denied`.
            raise ValueError(f'Unknown code: {code!r}')
        return ExchangeResult(user_id=UserId(DEVELOPER), tokens=None)


class DeveloperSelector(OAuthProviderSelector):
    """The dashboard's provider is `Developer` in every environment."""

    def _select(self) -> OAuthProvider:
        return Developer()


class RequireToken(TokenVerifier):
    """Refuses a call that carries no access token.

    Composed after the OAuth server's verifier, which accepts the
    tokens it minted and has no opinion on anything else; so what
    reaches this is a call with no token, or one of some other
    shape, and neither gets past the authorizers. The application's
    own calls (its `initialize`, its watchers) carry its caller ID
    and need no token.
    """

    async def verify_token(
        self,
        context: ReaderContext,
        token: Optional[str],
    ) -> VerifyTokenResult:
        if context.app_internal:
            return None
        return rbt.v1alpha1.errors_pb2.Unauthenticated(
            message='Sign in to the dashboard first.'
        )
