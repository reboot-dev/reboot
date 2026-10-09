## Projects need a `.gitignore`; stray `__init__.py` files go away

The canonical project layout now includes a project-root
`.gitignore`, and the "no `__init__.py`" rule now covers the whole
project, not just `api/`.

1. If the project root has no `.gitignore`, create one covering:

   ```gitignore
   # Reboot dev-server state.
   .rbt/

   # Generated code; recreated by `rbt generate`.
   backend/api/
   frontend/api/

   # Secrets.
   .env

   # Python virtual environment and caches.
   .venv/
   __pycache__/
   *.py[cod]
   .mypy_cache/
   .pytest_cache/

   # Frontend dependencies and build output (projects with a
   # frontend).
   node_modules/
   frontend/dist/
   ```

   If the project has a `.gitignore` that lacks some of these
   entries, add the missing ones. Adjust the generated-code paths to
   match the `generate --python=`/`generate --react=` output
   directories in `.rbtrc` if they differ.

2. If generated code is tracked by git (`git ls-files backend/api frontend/api` prints anything), untrack it:
   `git rm -r --cached backend/api frontend/api`.

3. Delete any hand-written `__init__.py` under `api/` or `backend/`
   (`find api backend -name __init__.py`). They are unnecessary —
   `.mypy.ini`'s `explicit_package_bases` and the `PYTHONPATH` that
   `rbt` sets up resolve imports without them — and inside `api/`
   they confuse `rbt generate`'s package detection.
