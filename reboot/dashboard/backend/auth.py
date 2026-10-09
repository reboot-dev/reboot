"""How the dashboard signs its callers in: whoever reaches its OAuth
server is the developer.

The dashboard is for whoever is at the machine it runs on. Its OAuth
server answers only under loopback names (`OAuth(hosts=...)`), so a
browser or an MCP host on this machine signs in with no questions
asked, while nothing arriving through the dashboard's tunnel, under
the tunnel's name, can. Every servicer's authorizer then admits a
call with the token that sign-in minted (`has_verified_token`) and
the application's own calls (`is_app_internal`), and nothing else,
so the tunnel reaches nothing without a token.
"""
from reboot.aio.auth.oauth_providers import (
    ExchangeResult,
    OAuthProvider,
    OAuthProviderSelector,
    UserId,
)
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
