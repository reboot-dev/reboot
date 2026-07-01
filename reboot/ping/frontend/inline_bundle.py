"""Inline esbuild's JS (and optional CSS) bundle into an HTML
template, producing a single self-contained file.

Usage:
    inline_bundle.py <html> <js> <out> [--css <css>] [--marker <marker>]

The bundle is inlined by replacing `--marker` in the HTML (default
`<!-- BUNDLE_PLACEHOLDER -->`, as the MCP UIs use) with a `<style>`
block (when `--css` is given) followed by a `<script type="module">`
block. The web SPA's HTML instead loads its entry with a real
`<script src="...">` tag so Vite's dev server can serve it directly,
so it passes that exact tag as `--marker`.

A dedicated script (rather than an inline `python3 -c`) keeps the
quoted HTML attributes intact: routed through a genrule's shell `cmd`,
inline double quotes get eaten and the replacement silently no-ops.
"""

import argparse


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("html")
    parser.add_argument("js")
    parser.add_argument("out")
    parser.add_argument("--css")
    parser.add_argument(
        "--marker",
        default="<!-- BUNDLE_PLACEHOLDER -->",
    )
    args = parser.parse_args()

    with open(args.html) as html_file:
        html = html_file.read()
    with open(args.js) as js_file:
        js = js_file.read()

    block = ""
    if args.css:
        with open(args.css) as css_file:
            block += "<style>" + css_file.read() + "</style>"
    block += '<script type="module">' + js + "</script>"

    if args.marker not in html:
        raise SystemExit(
            f"inline_bundle: marker {args.marker!r} not found in "
            f"{args.html}; nothing to replace."
        )
    out = html.replace(args.marker, block)

    with open(args.out, "w") as out_file:
        out_file.write(out)


if __name__ == "__main__":
    main()
