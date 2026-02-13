"""HTML providers for MCP App UI resources."""

import re
from pathlib import Path

# Project root for locating web build artifacts.
PROJECT_ROOT = Path(__file__).parent.parent.parent


def _inject_reboot_url(html: str, reboot_url: str) -> str:
    """Inject Reboot URL into HTML for remote access.

    Adds a script tag that sets window.REBOOT_URL before app loads.
    This allows MCP Apps to connect to Reboot when loaded remotely
    (e.g., in MCPJam where window.location.origin is null).
    """
    script = f'<script>window.REBOOT_URL="{reboot_url}";</script>'
    # Insert after <head> tag.
    return re.sub(r'(<head[^>]*>)', rf'\1\n    {script}', html, count=1)


def _build_not_found_html(title: str, app_name: str) -> str:
    """Generate fallback HTML when a build artifact is not found."""
    return f'''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title}</title>
    <style>
        body {{
            font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
            background: #1a1a2e;
            min-height: 100vh;
            margin: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            color: #eee;
        }}
        .container {{ text-align: center; padding: 2rem; }}
        h1 {{ color: #4ade80; }}
        code {{
            background: #0f0f1a;
            padding: 0.25rem 0.5rem;
            border-radius: 4px;
            color: #fbbf24;
        }}
    </style>
</head>
<body>
    <div class="container">
        <h1>{title}</h1>
        <p>The React app needs to be built first.</p>
        <p>Run: <code>cd web && npm install && npm run build</code></p>
    </div>
</body>
</html>'''


def get_app_html(app_name: str, reboot_url: str | None = None) -> str:
    """Load built HTML for an app, or return fallback if not found.

    Args:
        app_name: Name of the app (e.g., "clicker", "dashboard").
        reboot_url: Optional Reboot server URL to inject into HTML.
            When provided, allows MCP Apps to connect to Reboot
            even when loaded from a different origin (e.g., MCPJam).

    Returns:
        HTML content for the app.
    """
    dist_path = (
        PROJECT_ROOT / "web" / "dist" / "src" / "apps" / app_name /
        "index.html"
    )

    if dist_path.exists():
        html = dist_path.read_text()
        if reboot_url:
            html = _inject_reboot_url(html, reboot_url)
        return html

    title = f"Counter {app_name.title()}"
    return _build_not_found_html(title, app_name)
