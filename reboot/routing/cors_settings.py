"""The HTTP CORS policy values — methods, request and response
headers, and preflight cache lifetime — that every Envoy fronting a
Reboot application applies, however that Envoy's configuration is
generated.
"""

from reboot.aio.headers import (
    APPLICATION_ID_HEADER,
    AUTHORIZATION_HEADER,
    IDEMPOTENCY_KEY_HEADER,
    SERVER_ID_HEADER,
    STATE_REF_HEADER,
    TRANSACTION_RETRY_AGE_HEADER,
    WORKFLOW_ID_HEADER,
)
from typing import Sequence

# HTTP methods a browser may use on cross-origin requests.
CORS_ALLOW_METHODS = ('GET', 'PUT', 'DELETE', 'POST', 'OPTIONS')

# Request headers a browser may send on cross-origin requests.
# `ngrok-skip-browser-warning` is included so HTML fetches through
# ngrok tunnels don't get the free-tier interstitial that blocks CORS
# preflight.
CORS_ALLOW_HEADERS = (
    APPLICATION_ID_HEADER,
    STATE_REF_HEADER,
    SERVER_ID_HEADER,
    IDEMPOTENCY_KEY_HEADER,
    WORKFLOW_ID_HEADER,
    TRANSACTION_RETRY_AGE_HEADER,
    'keep-alive',
    'user-agent',
    'cache-control',
    'content-type',
    'content-transfer-encoding',
    'x-accept-content-transfer-encoding',
    'x-accept-response-streaming',
    'x-user-agent',
    'grpc-timeout',
    AUTHORIZATION_HEADER,
    'ngrok-skip-browser-warning',
)

# Response headers cross-origin JavaScript is allowed to read.
CORS_EXPOSE_HEADERS = ('grpc-status', 'grpc-message')

# How long a browser may cache a CORS preflight response, in seconds
# (20 days).
CORS_MAX_AGE_SECONDS = 1728000


def permissive_cors_headers(
    *,
    methods: Sequence[str],
    headers: Sequence[str],
) -> dict[str, str]:
    """The CORS response headers for an endpoint that any origin may
    call, with no credentials: `Access-Control-Allow-Origin: *`,
    the given methods and request headers, and the preflight cache
    lifetime every Reboot CORS policy uses.

    For endpoints that authenticate by what the request carries
    itself, such as the OAuth server's public endpoints, which a
    browser-based MCP client calls from wherever it is hosted, and an
    HTTP route with `require_oauth_token=True`, which a page shown by
    an MCP host calls with the bearer it was given from a sandbox
    whose origin is not knowable in advance. Never for an endpoint a
    browser would send the session cookie to: those get Envoy's
    policy above, which echoes an exact-match origin precisely so that
    no third-party page can call them credentialed, and a `*` beside
    `Access-Control-Allow-Credentials` is what would reopen that.
    """
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': ', '.join(methods),
        'Access-Control-Allow-Headers': ', '.join(headers),
        'Access-Control-Max-Age': str(CORS_MAX_AGE_SECONDS),
    }
