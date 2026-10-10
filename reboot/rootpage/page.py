"""The page at `/` of a Reboot application, its assets under
`/__/rootpage/`, and the install wizard's `/__/probe`.
"""
import os
import reboot.application
from log.log import get_logger
from reboot.templates.tools import render_template_path
from starlette.requests import Request  # type: ignore[import]
from starlette.responses import (  # type: ignore[import]
    FileResponse,
    HTMLResponse,
    Response,
)

logger = get_logger(__name__)

# Asset files served under `/__/rootpage/{file}`, with their
# `Content-Type` headers. Anything not in this map is a 404, so we
# don't hand out arbitrary files from the package directory.
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

# Browsers may request these but we don't ship them; a 404 without
# the warning keeps logs quiet.
KNOWN_ABSENT_FILENAMES = {
    "bundle.css.map",
    "favicon.ico",
}


async def root_page_asset(request: Request) -> Response:
    """The handler for `GET /__/rootpage/{file}`: one of the root
    page's assets, byte-for-byte off disk."""
    file = request.path_params["file"]
    if file in KNOWN_ABSENT_FILENAMES:
        return Response(status_code=404)
    content_type = CONTENT_TYPE_BY_FILE.get(file)
    if content_type is None:
        logger.warning(f"Request for unexpected file: '{file}'")
        return Response(status_code=404)
    return FileResponse(
        os.path.join(os.path.dirname(__file__), file),
        media_type=content_type,
    )


async def probe(request: Request) -> Response:
    """The handler for `GET /__/probe`: the install wizard fetches it
    through the user's tunnel and only checks the HTTP status, so an
    empty 200 is all it needs."""
    return Response(status_code=200)


async def root_page(request: Request) -> Response:
    """The handler for `GET /`: Reboot's own root page, which walks the
    user through adding this application to an MCP client."""
    return HTMLResponse(
        render_template_path(
            os.path.join(os.path.dirname(__file__), "index.html.j2"),
            {"application_id": reboot.application.ref().state_id},
        )
    )
