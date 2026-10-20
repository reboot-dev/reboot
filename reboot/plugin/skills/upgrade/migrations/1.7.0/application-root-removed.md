## `Application(root=...)` is gone

`Application(root="/some/path/")`, which made `/` redirect to a path
on the application instead of showing Reboot's own page, no longer
exists. An application that serves its web app at `/` passes
`--web-app-dist-path` instead (see the `--web-app-dist-path` note). One that
wants `/` to redirect somewhere registers the route itself; the
application's own routes take precedence over Reboot's page:

```python
from starlette.responses import RedirectResponse

@application.http.get("/")
async def root() -> RedirectResponse:
    return RedirectResponse("/some/path/", status_code=307)
```

Find any use with `grep -rn "root=" backend/` on the `Application(`
call and replace it with one of the two.
