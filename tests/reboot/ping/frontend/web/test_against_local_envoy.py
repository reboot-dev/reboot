"""Top-level entry that spins up an in-memory Reboot backend with
the ping servicers and runs the browser test against it.

The test reuses the *real* SPA the backend serves at `/` (built by
`//reboot/ping:web_dist`, carried in `ping_py`'s runfiles alongside
`.rbtrc`), so we set `RBT_WEB_APP_DIST_PATH` to point the framework's
web app mount at `frontend/dist/web`. The ping app also declares
`UI(...)` methods, which `rbt dev` insists are served somehow, so
`RBT_MCP_APP_DIST_PATH` names their builds too (this test never
loads them). We drive the SPA on the `localhost` host with a
`?rebootUrl=http://127.0.0.1:...` query param, so the SPA document
and the backend it calls are cross-host — the production-style
cross-origin setup. Because the ping app is `oauth=` with no
`allowed_origins`, Envoy's credentialed CORS policy on the OAuth
server's paths trusts those loopback origins only under `rbt dev`,
so we also set `RBT_DEV=true`.
"""

import asyncio
import os
import sys
import unittest
from reboot.aio.applications import Application
from reboot.aio.auth.oauth import OAuth
from reboot.aio.auth.oauth_providers import (
    Development,
    OAuthProviderByEnvironment,
)
from reboot.aio.health_check import do_health_check
from reboot.aio.tests import Reboot
from reboot.ping.ping import (
    CounterServicer,
    PingServicer,
    PongServicer,
    UserServicer,
)
from reboot.settings import (
    ENVVAR_RBT_DEV,
    ENVVAR_RBT_MCP_APP_DIST_PATH,
    ENVVAR_RBT_WEB_APP_DIST_PATH,
)
from tests.reboot.ping.frontend.web.test import test, test_proactive_refresh
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


def _spa_url(envoy_port: int, backend_url: str) -> str:
    """The URL the browser loads the real SPA from: the backend's
    `/` on the `localhost` host, with the backend's
    `127.0.0.1` origin handed to the React provider via `?rebootUrl`.
    `localhost` and `127.0.0.1` both resolve to loopback and reach
    the same Envoy, but the browser treats them as distinct hosts, so
    the SPA document and its API origin are genuinely cross-host —
    the backend's host-scoped `rbt_session` cookie is invisible to
    the SPA's `document.cookie`."""
    query = urlencode({"rebootUrl": backend_url})
    return f'http://localhost:{envoy_port}/?{query}'


def _cors_preflight(
    *,
    url: str,
    origin: str,
) -> tuple[int, dict[str, str]]:
    """Sends a CORS preflight (`OPTIONS`) and returns the response's
    status code and its headers, lower-cased."""
    request = Request(
        url,
        method='OPTIONS',
        headers={
            'Origin': origin,
            'Access-Control-Request-Method': 'POST',
            'Access-Control-Request-Headers': 'authorization,content-type',
        },
    )
    try:
        with urlopen(request, timeout=5) as response:  # noqa: S310
            return response.status, {
                k.lower(): v for k, v in response.headers.items()
            }
    except HTTPError as e:
        return e.code, {k.lower(): v for k, v in e.headers.items()}


class PingStandaloneSpaTest(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self):
        # Run the backend as `rbt dev` so Envoy's CORS filter trusts
        # the loopback origins the SPA is driven from (`localhost` /
        # `127.0.0.1`), and so `RBT_WEB_APP_DIST_PATH` serves the built
        # SPA at `/` from the backend's own HTTP server (with
        # `RBT_MCP_APP_DIST_PATH` naming the MCP App builds, which an
        # application with `UI(...)` methods must be told how to
        # serve). All must be set before the cluster comes up so the
        # servers inherit them.
        os.environ[ENVVAR_RBT_DEV] = "true"
        os.environ[ENVVAR_RBT_MCP_APP_DIST_PATH] = "frontend/dist/mcp"
        os.environ[ENVVAR_RBT_WEB_APP_DIST_PATH] = "frontend/dist/web"
        self.rbt = Reboot()
        await self.rbt.start()

    async def asyncTearDown(self):
        await self.rbt.stop()

    async def test_signin_create_increment_e2e(self):
        # Short access-token TTL on the dev OAuth provider would
        # otherwise force a refresh mid-test; this end-to-end is
        # tight enough that 5 minutes is plenty of headroom, but
        # it's still a non-default value so the test doesn't
        # accidentally pretend a 24h-default-TTL bug is fine.
        dev_oauth = Development(access_token_ttl_seconds=300)
        application = Application(
            servicers=[
                PingServicer,
                PongServicer,
                UserServicer,
                CounterServicer,
            ],
            oauth=OAuth(
                provider=OAuthProviderByEnvironment(
                    dev=dev_oauth,
                    prod=dev_oauth,
                )
            ),
        )

        await self.rbt.up(application, local_envoy=True)

        backend_url = f'http://127.0.0.1:{self.rbt.envoy_port()}'
        await do_health_check(application_url=backend_url)

        # A preflight to the OAuth server's paths from an untrusted
        # origin must fail: the credentialed CORS policy is all that
        # keeps a third-party page in a signed-in user's browser from
        # reading the access JWT off `/__/oauth/whoami`. Envoy rejects
        # by not intercepting the preflight, which then reaches the
        # OAuth server; it has no `OPTIONS` handler for `/whoami`, so
        # the answer is 405. The e2e flow below is the positive
        # control: the SPA could not sign in cross-origin unless CORS
        # echoed its origin.
        evil_status, _ = await asyncio.to_thread(
            _cors_preflight,
            url=f'{backend_url}/__/oauth/whoami',
            origin='http://evil.example',
        )
        self.assertEqual(
            evil_status,
            405,
            msg=(
                "Envoy CORS appears to be allowing preflights from "
                "untrusted origins; a browser would then let an "
                "attacker exfiltrate the access JWT from /whoami. "
                "See the docstring on "
                "`Application(allowed_origins=...)`."
            ),
        )

        # Every other path answers any origin, including the opaque
        # `null` an MCP host's sandbox presents, without credentials:
        # a page there can call RPCs with a bearer it holds, and the
        # browser hides from it any response to a request it sent
        # with the cookie.
        # A well-formed state reference: the routing filter rejects a
        # malformed one with a 400 before the CORS filter answers the
        # preflight.
        for origin in ('http://evil.example', 'null'):
            rpc_status, rpc_headers = await asyncio.to_thread(
                _cors_preflight,
                url=(
                    f'{backend_url}/__/reboot/rpc/reboot.ping.Counter:x'
                    '/reboot.ping.CounterMethods/Get'
                ),
                origin=origin,
            )
            self.assertEqual(rpc_status, 200, msg=rpc_headers)
            self.assertEqual(
                rpc_headers.get('access-control-allow-origin'), origin
            )
            self.assertNotIn(
                'access-control-allow-credentials',
                rpc_headers,
                msg=(
                    "RPCs must never allow credentials from an "
                    "untrusted origin; the session cookie would then "
                    "authenticate a third-party page's requests."
                ),
            )
            self.assertIn(
                'authorization',
                rpc_headers.get('access-control-allow-headers', '').lower(),
            )

        await test(spa_url=_spa_url(self.rbt.envoy_port(), backend_url))

    async def test_proactive_refresh_renews_bearer_before_ttl_e2e(self):
        """End-to-end proof that the React provider's proactive-
        refresh timer keeps a SPA's access JWT current past the
        configured TTL. Uses a short 10-second TTL so the test
        runs in well under 30 seconds; in production the default
        is 24 hours.

        Runs in its own application/process (separate from the
        sign-in/create/increment test) so the two tests don't
        share auto-construct state.
        """
        # Short enough that we can prove proactive refresh
        # without a multi-minute test runtime, comfortably longer
        # than `REFRESH_MARGIN_MS / 1000 = 5 s` plus the setup
        # slack (sign-in flow takes ~1-2 s).
        ttl = 10
        dev_oauth = Development(access_token_ttl_seconds=ttl)
        application = Application(
            servicers=[
                PingServicer,
                PongServicer,
                UserServicer,
                CounterServicer,
            ],
            oauth=OAuth(
                provider=OAuthProviderByEnvironment(
                    dev=dev_oauth,
                    prod=dev_oauth,
                )
            ),
        )

        await self.rbt.up(application, local_envoy=True)

        backend_url = f'http://127.0.0.1:{self.rbt.envoy_port()}'
        await do_health_check(application_url=backend_url)

        await test_proactive_refresh(
            spa_url=_spa_url(self.rbt.envoy_port(), backend_url),
            access_token_ttl_seconds=ttl,
        )


# `unittest` test discovery picks classes off the module being run,
# so make sure the test class is here — paralleling the pattern in
# `tests/reboot/react/test_against_local_envoy.web_test_against_local_envoy`.
if __name__ == '__main__':
    unittest.main(module=sys.modules[__name__])
