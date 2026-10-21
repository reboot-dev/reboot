"""The origin a request arrived at, as the requester saw it."""

from starlette.requests import Request


def origin_from_request(request: Request) -> str:
    """
    Derive the server's origin (`scheme://host`) from request headers.

    Respects `X-Forwarded-Proto` and `X-Forwarded-Host` when behind a
    reverse proxy.
    """
    scheme = request.headers.get(
        "x-forwarded-proto",
        request.url.scheme,
    )
    host = request.headers.get(
        "x-forwarded-host",
        request.headers.get("host", "localhost"),
    )
    return f"{scheme}://{host}"
