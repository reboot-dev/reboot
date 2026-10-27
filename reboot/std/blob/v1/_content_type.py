"""How a blob's declared content type is served back to a browser."""

# Content types a browser renders without the bytes being able to act
# as the application: images and media decode to pixels or samples,
# and plain text renders as text. A PDF is rendered by a viewer that
# runs any script it contains in its own context rather than the
# page's.
#
# `image/svg+xml` is deliberately absent. An SVG is a document, it may
# script, and a browser runs that script in the origin that served it.
_RENDERABLE_CONTENT_TYPES = frozenset(
    {
        "audio/aac",
        "audio/mpeg",
        "audio/ogg",
        "audio/wav",
        "audio/webm",
        "application/pdf",
        "image/avif",
        "image/bmp",
        "image/gif",
        "image/jpeg",
        "image/png",
        "image/webp",
        "text/plain",
        "video/mp4",
        "video/ogg",
        "video/webm",
    }
)

# What anything else is served as.
_DOWNLOAD_CONTENT_TYPE = "application/octet-stream"


def download_response_overrides(content_type: str) -> dict[str, str]:
    """The `response-*` query parameters a download URL carries, which
    S3 answers with as the response's headers.

    A blob's declared type is whatever its uploader claimed, and the
    bytes may come back on the application's own origin, so a claimed
    `text/html` would render as a same-origin document with the
    reader's session -- able to call the application as them. Only
    types that cannot carry script are served as declared; everything
    else is served as an opaque download, whatever it claims to be.
    """
    declared = content_type.split(";")[0].strip().lower()
    if declared in _RENDERABLE_CONTENT_TYPES:
        # The normalized type, not what was declared: everything
        # after the first `;` was never looked at, and this value
        # goes into a response header verbatim -- parameters, and
        # anything an uploader put after them, included.
        return {"response-content-type": declared}
    return {
        "response-content-type": _DOWNLOAD_CONTENT_TYPE,
        # Downloaded rather than rendered, so nothing this blob
        # contains is interpreted on the application's origin.
        "response-content-disposition": "attachment",
    }
