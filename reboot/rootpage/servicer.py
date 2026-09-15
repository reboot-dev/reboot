import grpc
import html
import json
import os
import reboot.application
from google.api.httpbody_pb2 import HttpBody
from log.log import get_logger
from pathlib import Path
from rbt.v1alpha1.rootpage import rootpage_pb2_grpc
from rbt.v1alpha1.rootpage.rootpage_pb2 import (
    ProbeRequest,
    ProbeResponse,
    RootPageRequest,
)
from reboot.templates.tools import render_template_path
from typing import Optional

logger = get_logger(__name__)

# Asset files this servicer is willing to serve under
# `/__/rootpage/{file}`, with their `Content-Type` headers. Anything
# not in this map returns 404 so we don't accidentally hand out
# arbitrary files from the package directory. The root `/` HTML is
# handled separately at the top of `RootPage`, not via this map.
CONTENT_TYPE_BY_FILE = {
    "bundle.js": "text/javascript",
    "bundle.js.map": "application/json",
    "bundle.css": "text/css",
    "reboot-logo.svg": "image/svg+xml",
    "reboot-logo-green.svg": "image/svg+xml",
    "decorative-shapes.svg": "image/svg+xml",
    "add-app-chatgpt.mp4": "video/mp4",
    "add-app-claude.mp4": "video/mp4",
    "favicon.svg": "image/svg+xml",
}

# Browser may request these but we don't ship them; suppress the
# 404 warning to keep logs quiet.
KNOWN_ABSENT_FILENAMES = [
    "bundle.css.map",
    "favicon.ico",
]


class RootPageServicer(rootpage_pb2_grpc.RootPageServicer):

    def __init__(self, *, root: Optional[str]):
        # The path `/` forwards to, when the application gave one.
        self._root = root

    def add_to_server(self, server: grpc.aio.Server) -> None:
        rootpage_pb2_grpc.add_RootPageServicer_to_server(self, server)

    async def Probe(
        self,
        request: ProbeRequest,
        grpc_context: grpc.aio.ServicerContext,
    ) -> ProbeResponse:
        # The wizard fetches this through the user's tunnel and only
        # checks the HTTP status, so an empty response that transcodes
        # to a 200 is all we need.
        return ProbeResponse()

    async def RootPage(
        self,
        request: RootPageRequest,
        grpc_context: grpc.aio.ServicerContext,
    ) -> HttpBody:
        # `GET /` arrives with `file=""`; everything served under
        # `/__/rootpage/{file=**}` arrives with `file` set to the
        # subpath.
        if not request.file and self._root is not None:
            # Served through the gRPC-JSON transcoder, which can only
            # turn a gRPC status into an error, never a redirect, so
            # the browser is forwarded by the page instead, which is
            # left blank so nothing flashes. `location.replace` keeps
            # the fragment, e.g. `/#/models`, and leaves `/` out of
            # the history; the meta refresh is for a browser without
            # JavaScript.
            root = html.escape(self._root, quote=True)
            # Escaped so the path cannot close the `<script>`.
            script_root = json.dumps(self._root).replace('<', '\\u003c')
            return HttpBody(
                content_type="text/html; charset=utf-8",
                data=(
                    '<!DOCTYPE html>'
                    '<html><head><meta charset="utf-8">'
                    f'<script>location.replace({script_root} + '
                    'location.search + location.hash);</script>'
                    '<noscript>'
                    f'<meta http-equiv="refresh" content="0; url={root}">'
                    '</noscript>'
                    '</head><body></body></html>'
                ).encode(),
            )

        if not request.file:
            # Render the Jinja template in `index.html.j2` so we can
            # inject the singleton `Application` state ID.
            rendered = render_template_path(
                os.path.join(os.path.dirname(__file__), "index.html.j2"),
                {"application_id": reboot.application.ref().state_id},
            )
            return HttpBody(
                content_type="text/html; charset=utf-8",
                data=rendered.encode(),
            )

        file = request.file

        if file in KNOWN_ABSENT_FILENAMES:
            await grpc_context.abort(grpc.StatusCode.NOT_FOUND)
            raise RuntimeError("This code is unreachable")

        if file not in CONTENT_TYPE_BY_FILE:
            logger.warning(f"Request for unexpected file: '{file}'")
            await grpc_context.abort(grpc.StatusCode.NOT_FOUND)
            raise RuntimeError("This code is unreachable")

        # Assets served byte-for-byte off disk.
        path = Path(os.path.join(os.path.dirname(__file__), file))
        return HttpBody(
            content_type=f"{CONTENT_TYPE_BY_FILE[file]}; charset=utf-8",
            data=path.read_bytes(),
        )
