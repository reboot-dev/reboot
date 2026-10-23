## `--frontend-url` is the default under `--portless`, and `RBT_APPLICATION_VARIANT` varies the name

Nothing is required: an application set up by 1.7.0 keeps working as
it is. These two edits bring it to the current shape, and the second
is what lets the frontend follow `RBT_APPLICATION_VARIANT`, the
environment variable that gives a checkout, a git worktree or a
branch its own variant of the application (`<app>-<variant>`, for the
state directory and every portless name; see the run skill's
"Branches and worktrees").

1. **`.rbtrc`:** delete the line

   ```
   dev run:portless --frontend-url=https://frontend-<app>.localhost
   ```

   Under `--portless`, `rbt dev run` expects the dev server at
   `https://frontend-<app>.localhost` without being told. Keep the
   `dev run:ports --frontend-url=http://localhost:5173` line: plain
   ports have no default.

2. **`frontend/package.json`:** in the `dev:portless` script, change

   ```json
   "dev:portless": "portless frontend-<app> vite",
   ```

   to, exactly so,

   ```json
   "dev:portless": "portless frontend-<app>${RBT_APPLICATION_VARIANT:+-$RBT_APPLICATION_VARIANT} vite",
   ```

   `<app>` stays the `.rbtrc`'s `--application-name`. The shell
   expands the `${...}` to `-<variant>` when `RBT_APPLICATION_VARIANT`
   is set and to nothing otherwise, so without a variant the script
   runs exactly as before.
