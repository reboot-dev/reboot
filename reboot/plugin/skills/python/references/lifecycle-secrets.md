---
title: Set Secrets — Env Vars in Dev, `rbt cloud secret set` in Cloud
impact: HIGH
impactDescription: Wrong delivery mechanism means either committing a secret to git (dev) or seeing `KeyError` at boot (cloud).
tags: secrets, env, environment-variables, rbt-cloud, oauth, api-key, client-secret
---

## Set Secrets — Env Vars in Dev, `rbt cloud secret set` in Cloud

> **Rule of thumb:** the application always reads secrets the same
> way — `os.environ["KEY"]`. What differs is how the value gets
> into the environment: in **`rbt dev run`** it comes from the
> `--env-file` named in `.rbtrc`; in **Reboot Cloud** it's set with
> `rbt cloud secret set`. Same name, same access path, two
> different delivery mechanisms.

Secrets in a Reboot application are always plain environment
variables at runtime. Every secret (OAuth client secret, third-party
API key, signing key, etc.) lives at some `KEY` in `os.environ` —
the application code is identical between local dev and cloud:

```python
import os

STRIPE_API_KEY = os.environ["STRIPE_API_KEY"]
```

Two delivery mechanisms put the value there:

| Where the app runs | Mechanism                                                                                                                   | Where the value lives                                |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `rbt dev run`      | A `--env-file=<path>` of `KEY=VALUE` lines named in `.rbtrc`; or `--env=KEY=VALUE` on the CLI; or an exported shell env var | A git-ignored `.env` file / launch flags / the shell |
| Reboot Cloud       | `rbt cloud secret set KEY` (reads value from the operator's shell env)                                                      | The application's secret store                       |

The two never share storage. Setting a Cloud secret does not affect
local `rbt dev run`, and exporting a shell variable does not push it
to Cloud — each environment is configured independently with the
mechanism for that environment.

## In Dev: An `--env-file` for `rbt dev run`

The recommended way to deliver secrets to `rbt dev run` is the
`--env-file` flag, configured once in `.rbtrc`. Keep every secret
as a `KEY=VALUE` line in a single `.env` file at the project root:

```sh
STRIPE_API_KEY=sk_test_...
GOOGLE_OAUTH_CLIENT_ID=...
GOOGLE_OAUTH_CLIENT_SECRET=...
```

and point `.rbtrc` at it (see `lifecycle-rbtrc.md`):

```sh
dev run --env-file=.env
```

Every `rbt dev run` then sets those variables before launching the
app, and editing the file while `rbt dev run` is running restarts
the app so updated secrets take effect right away. The file uses
standard `.env` syntax — `KEY=VALUE` lines, `#` comments, blank
lines, optional `export ` prefixes, and quoted values are all
supported. Add `.env` to `.gitignore` so the secrets are never
committed. `--env-file` is a `dev run`-only convenience — it is
not available for `rbt serve` or Reboot Cloud.

For one-off values, `--env=KEY=VALUE` (repeatable) sets a variable
on the CLI without a file; `--env=` values override anything also
set by `--env-file`. Variables exported in the launching shell are
also still inherited by `rbt dev run`.

```sh
uv run rbt dev run --env=FEATURE_FLAG=on
```

**Don't commit secrets to `.rbtrc`.** `.rbtrc` is checked into git
(see `lifecycle-rbtrc.md`). The `dev run --env-file=.env` line is
fine — it is only a path — but never put a literal
`--env=KEY=secret` line there. The `.env` file the path points at
stays git-ignored.

## In Cloud: `rbt cloud secret set KEY`

`rbt cloud secret set` writes a secret into the application's
managed secret store. If the app is already up, the Cloud backend
then rolls out a new revision on its own so the value is live as an
environment variable — the rollout happens server-side, not in the
CLI. **The platform does the rollout for you; do not run `rbt cloud up` afterward.**

```sh
# Read the values from your shell env (recommended — keeps the
# secrets out of shell history and process listings; the API key
# is read from the `REBOOT_CLOUD_API_KEY` env var automatically).
# Pass every secret in ONE command so the app rolls out just once:
export REBOOT_CLOUD_API_KEY=<your-key>
export AUTH0_DOMAIN=... AUTH0_CLIENT_ID=... AUTH0_CLIENT_SECRET=...
rbt cloud secret set \
  AUTH0_DOMAIN AUTH0_CLIENT_ID AUTH0_CLIENT_SECRET \
  --application-name=my-app \
  --organization=my-org

# Or pass `KEY=VALUE` inline (value appears in shell history —
# only do this for non-sensitive values):
rbt cloud secret set FEATURE_FLAG=on ...

# Inspect / remove (same `--application-name` / `--organization`
# args as `set`):
rbt cloud secret list ...
rbt cloud secret delete AUTH0_CLIENT_SECRET ...
```

Secrets are application-scoped. `rbt cloud secret list` prints the
names currently set; `rbt cloud secret delete NAME ...` removes one
or more.

`rbt cloud secret set` takes any number of `KEY` / `KEY=VALUE`
arguments. Setting them all in one invocation has the backend roll
out a single revision; calling it once per secret makes the backend
roll out the app once per call, so batch them. Once the command
returns, the backend's new revision is already deploying with the
secrets available as `os.environ["KEY"]` inside the app.

Names must be uppercase environment-style identifiers (letters,
digits, underscores; not starting with a digit). The prefixes
`REBOOT_*` and `RBT_*` are reserved by the platform — pick a
different name for your own secrets.

## Reading Secrets in Application Code

The same code works in both environments:

```python
import os

# Fail fast at import / startup if a required secret is missing,
# so a misconfigured deploy doesn't make it past boot:
STRIPE_API_KEY = os.environ["STRIPE_API_KEY"]

# Optional secrets with a sensible default are fine via .get():
DEBUG_MODE = os.environ.get("DEBUG_MODE", "off")
```

For OAuth provider credentials specifically, the
`Application(oauth=...)` slot expects the values as plain strings —
read them from `os.environ` and pass them in:

```python
from reboot.aio.auth.oauth_providers import Google

async def main():
    await Application(
        servicers=[UserServicer, CounterServicer],
        oauth=Google(
            client_id=os.environ["GOOGLE_OAUTH_CLIENT_ID"],
            client_secret=os.environ["GOOGLE_OAUTH_CLIENT_SECRET"],
        ),
    ).run()
```

See `auth-oauth-providers.md` (chat-app skill) for the full
provider-swap story.

## Don't

- **Don't hard-code secrets in `main.py`, servicer code, or any
  other source file.** Anything checked into git is leaked.
- **Don't put secrets in `.rbtrc`.** `.rbtrc` is checked in;
  `--env=KEY=VALUE` lines there are visible in history forever. A
  `dev run --env-file=.env` line is fine — it's only a path.
- **Don't rely on a bare `.env` being auto-loaded.** Reboot reads
  `.env` only when `rbt dev run` is given `--env-file=.env` (in
  `.rbtrc` or on the CLI); a `.env` with no `--env-file` does
  nothing.
- **Don't run `rbt cloud up` after `rbt cloud secret set`.** When
  the app is up, the Cloud backend already rolls out a new revision
  in response to the secret change; a follow-up `up` is a redundant
  second rollout.
- **Don't set secrets one per command.** Each call makes the
  backend roll out the app again; pass all the keys to a single
  `rbt cloud secret set` so it rolls out once.
- **Don't reuse `REBOOT_*` or `RBT_*` prefixes.** They're reserved
  by the platform — `rbt cloud secret set REBOOT_X` will fail.
- **Don't assume Cloud and dev share secrets.** Setting a value in
  one environment doesn't propagate to the other; configure each
  with the mechanism for that environment.
