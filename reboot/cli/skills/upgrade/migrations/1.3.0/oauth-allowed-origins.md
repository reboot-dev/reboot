## `Application(oauth=...)` requires `allowed_origins=[...]` in production

Applies only to applications that pass `oauth=...` to `Application(...)`
(applications using `token_verifier=...`, or neither, need no change).

Reboot backends used to serve permissive CORS (any origin). An
`oauth=...` application now serves an exact-match CORS allow-list
instead, and outside `rbt dev run` its `Application(...)` construction
fails unless `allowed_origins` is set explicitly:

- If the application has a browser frontend on its own origin (e.g. a
  CDN-hosted SPA), list that origin:
  `Application(..., oauth=..., allowed_origins=["https://app.example.com"])`.
- If browsers only ever reach the backend same-origin (or not at all,
  e.g. MCP-only), pass an explicit empty list:
  `Application(..., oauth=..., allowed_origins=[])`.

Under `rbt dev run` nothing is required: `http://localhost(:*)?` and
`http://127.0.0.1(:*)?` are allowed automatically, so local frontend
dev servers keep working.

The allow-list applies everywhere the application serves traffic,
including Reboot Cloud / Kubernetes deployments: the platform's
per-application CORS policy is generated from `allowed_origins`.
