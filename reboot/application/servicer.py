import aiohttp
import asyncio
import rbt.v1alpha1.errors_pb2
from log.log import get_logger
from rbt.v1alpha1.application.application_rbt import (
    Application,
    GetRequest,
    GetResponse,
    InitializeRequest,
    InitializeResponse,
    RecordConnectionRequest,
    RecordConnectionResponse,
    WatchTunnelsRequest,
    WatchTunnelsResponse,
)
from reboot.aio.auth.authorizers import allow, allow_if, is_app_internal
from reboot.aio.contexts import ReaderContext, WorkflowContext, WriterContext
from reboot.run_environments import running_rbt_dev
from typing import Optional

logger = get_logger(__name__)

# ngrok's local management API will run on the default port 4040. We
# only ever read from `/api/tunnels`.
_NGROK_TUNNELS_URL = "http://localhost:4040/api/tunnels"

# cloudflared's local management endpoint, exposed when the user
# passes `--metrics localhost:4040`. For quick tunnels (`--url ...`)
# it returns `{"hostname": "<random>.trycloudflare.com"}`.
_CLOUDFLARED_QUICKTUNNEL_URL = "http://localhost:4040/quicktunnel"

# How long to wait between polling for tunnels, in seconds. Tight
# enough that the wizard feels alive when the user starts a tunnel,
# but loose enough that we're not pounding the local APIs while the
# app is otherwise idle.
_TUNNEL_POLL_INTERVAL_SECONDS = 5

# Per-request timeout for tunnel-provider probes. Short because both
# providers run locally; if the socket doesn't accept in 2s the
# provider probably isn't there.
_TUNNEL_FETCH_TIMEOUT = aiohttp.ClientTimeout(total=2)


async def _fetch_ngrok_public_url(port: int) -> Optional[str]:
    """Ask ngrok which tunnel (if any) is forwarding to our local
    port and return its `public_url`. Returns `None` on any failure
    (ngrok not running, request error, no matching tunnel, JSON
    didn't have the expected shape, etc.).
    """
    addr = f"http://localhost:{port}"
    try:
        async with aiohttp.ClientSession(
            timeout=_TUNNEL_FETCH_TIMEOUT
        ) as session:
            async with session.get(_NGROK_TUNNELS_URL) as response:
                if response.status != 200:
                    return None
                body = await response.json()
    except (aiohttp.ClientError, asyncio.TimeoutError, ValueError):
        return None
    tunnels = body.get("tunnels") if isinstance(body, dict) else None
    if not isinstance(tunnels, list):
        return None
    for tunnel in tunnels:
        if not isinstance(tunnel, dict):
            continue
        config = tunnel.get("config", {})
        if isinstance(config, dict) and config.get("addr") == addr:
            public_url = tunnel.get("public_url")
            return public_url if isinstance(public_url, str) else None
    return None


async def _fetch_cloudflared_public_url() -> Optional[str]:
    """Ask cloudflared's metrics endpoint for the current quick
    tunnel's hostname and return it as `https://<hostname>`. Returns
    `None` on any failure (cloudflared not running with `--metrics`,
    not a quick tunnel, request error, etc.). Unlike the ngrok probe
    we can't filter by local port — cloudflared's `/quicktunnel`
    only exposes the public hostname, not the forwarded address — so
    we trust whatever it reports.
    """
    try:
        async with aiohttp.ClientSession(
            timeout=_TUNNEL_FETCH_TIMEOUT
        ) as session:
            async with session.get(_CLOUDFLARED_QUICKTUNNEL_URL) as response:
                if response.status != 200:
                    return None
                # `content_type=None` skips aiohttp's strict
                # `application/json` check; cloudflared serves the
                # response as `text/plain`, which would otherwise
                # raise `ContentTypeError`.
                body = await response.json(content_type=None)
    except (aiohttp.ClientError, asyncio.TimeoutError, ValueError):
        return None
    hostname = body.get("hostname") if isinstance(body, dict) else None
    if not isinstance(hostname, str) or not hostname:
        return None
    return f"https://{hostname}"


def _is_running_rbt_dev(*, context, **kwargs):
    """Authorizer callable that allows only when the process is being
    served by `rbt dev`.
    """
    if running_rbt_dev():
        return rbt.v1alpha1.errors_pb2.Ok()
    return rbt.v1alpha1.errors_pb2.PermissionDenied()


class ApplicationServicer(Application.Servicer):

    def authorizer(self):
        return Application.Authorizer(
            # `get` is public so the application's root page can be
            # served without authentication.
            get=allow(),
            # `initialize` is called by the application's `initialize`
            # which is an app-internal context (in dev *and* prod), so
            # gate it on `is_app_internal`.
            initialize=allow_if(all=[is_app_internal]),
            # Record connection is only done in dev.
            record_connection=allow_if(all=[_is_running_rbt_dev]),
        )

    async def initialize(
        self,
        context: WriterContext,
        request: InitializeRequest,
    ) -> InitializeResponse:
        self.state.title = request.title
        # Mirror presence: a developer who didn't pass `description=`
        # leaves it unset rather than storing an empty string.
        if request.HasField("description"):
            self.state.description = request.description
        else:
            self.state.ClearField("description")
        self.state.mcp = request.mcp
        # Replace the example prompts wholesale so we have the each
        # latest on each boot.
        del self.state.example_prompts[:]
        self.state.example_prompts.extend(request.example_prompts)
        # Store the port so `watch_tunnels` can read the latest (it
        # may change across re-inits, e.g. a different `rbt dev`
        # port).
        self.state.port = request.port
        # Schedule the tunnel-watcher exactly once, and only in dev —
        # there are only local ngrok/cloudflared providers to poll in
        # dev. `initialize` is called on every restart to synchronize
        # the latest application's values, so we have a flag to make
        # sure we only schedule it once.
        if running_rbt_dev() and not self.state.watch_tunnels_scheduled:
            await self.ref().schedule().watch_tunnels(context)
            self.state.watch_tunnels_scheduled = True
        return InitializeResponse()

    async def get(
        self,
        context: ReaderContext,
        request: GetRequest,
    ) -> GetResponse:
        # Return only the the fields that are safe to expose to an
        # unauthenticated caller.
        dev = running_rbt_dev()
        return GetResponse(
            title=self.state.title,
            description=(
                self.state.description
                if self.state.HasField("description") else None
            ),
            ngrok_public_url=(
                self.state.ngrok_public_url
                if dev and self.state.HasField("ngrok_public_url") else None
            ),
            cloudflared_public_url=(
                self.state.cloudflared_public_url if dev and
                self.state.HasField("cloudflared_public_url") else None
            ),
            connections=self.state.connections if dev else [],
            example_prompts=self.state.example_prompts,
            mcp=self.state.mcp,
            dev=dev,
        )

    async def record_connection(
        self,
        context: WriterContext,
        request: RecordConnectionRequest,
    ) -> RecordConnectionResponse:
        # `forwarded_host` and `user_agent` are both required — the
        # caller only records a complete (host, user-agent) pair.
        # Find (or create) the entry for this host, then dedupe-
        # append the user-agent. The list stays insertion-ordered; we
        # don't expect many distinct user agents per host in practice
        # (one per chat client that's ever called through), so a
        # linear scan is fine.
        for connection in self.state.connections:
            if connection.forwarded_host == request.forwarded_host:
                if request.user_agent not in connection.user_agents:
                    connection.user_agents.append(request.user_agent)
                return RecordConnectionResponse()
        connection = self.state.connections.add(
            forwarded_host=request.forwarded_host,
        )
        connection.user_agents.append(request.user_agent)
        return RecordConnectionResponse()

    @classmethod
    async def watch_tunnels(
        cls,
        context: WorkflowContext,
        request: WatchTunnelsRequest,
    ) -> WatchTunnelsResponse:
        # NOTE: we deliberately don't use `context.loop` or memoize
        # the fetches: there's nothing here we need to replay
        # deterministically — we just want the latest tunnel URLs in
        # the state — so a `while`/`sleep` is clearer.
        while True:
            # Read the port fresh each iteration (`.always()`, so we
            # don't reuse a memoized value) since a re-`Initialize`
            # may have changed it.
            state = await Application.ref().always().read(context)
            port = state.port

            ngrok_public_url = await _fetch_ngrok_public_url(port)
            cloudflared_public_url = await _fetch_cloudflared_public_url()

            async def write(state: Application.State) -> None:
                # Always record the latest values, mirroring presence
                # (an unset URL clears a provider that lost its
                # tunnel).
                if ngrok_public_url is not None:
                    state.ngrok_public_url = ngrok_public_url
                else:
                    state.ClearField("ngrok_public_url")
                if cloudflared_public_url is not None:
                    state.cloudflared_public_url = cloudflared_public_url
                else:
                    state.ClearField("cloudflared_public_url")

            # We always want to record the latest values.
            await Application.ref().always().write(context, write)

            await asyncio.sleep(_TUNNEL_POLL_INTERVAL_SECONDS)
