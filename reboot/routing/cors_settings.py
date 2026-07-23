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
    WORKFLOW_ID_HEADER,
)

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

# Response headers cross-origin JavaScript is allowed to read. `etag`
# is exposed so that browser blob uploads can read each part's ETag
# from the data plane's response (see `reboot.std.blobs`).
CORS_EXPOSE_HEADERS = ('grpc-status', 'grpc-message', 'etag')

# How long a browser may cache a CORS preflight response, in seconds
# (20 days).
CORS_MAX_AGE_SECONDS = 1728000
