"""Notify the user when a newer Reboot release is available.

`rbt` queries PyPI for the latest released `reboot` version at most
once per `CHECK_INTERVAL_SECONDS` (the result is cached on disk) and
prints a one-line notice to stderr when this `rbt` is older. The
notice is how both humans and coding agents discover that an upgrade
(and possibly migration steps) exist: the Reboot plugin's `upgrade`
skill and the docs page referenced below both key off of it, so keep
it in sync with what they describe.

The check is best-effort: any failure (no network, a PyPI outage, an
unreadable cache file) silently skips the notice. Setting
`REBOOT_NO_VERSION_CHECK` (to any non-empty value) disables the
check, as does the `CI` environment variable.
"""

import json
import os
import pydantic
import reboot.cli.common.terminal as terminal
import time
import urllib.request
from pathlib import Path
from reboot.settings import ENVVAR_REBOOT_NO_VERSION_CHECK
from reboot.version import REBOOT_VERSION
from reboot.versioning import version_less_than
from typing import Optional

PYPI_JSON_URL = 'https://pypi.org/pypi/reboot/json'

# How long a fetched "latest version" stays fresh before we ask PyPI
# again. Fetch failures are cached for this long too, so an offline
# machine pays the fetch timeout at most once per interval.
CHECK_INTERVAL_SECONDS = 24 * 60 * 60

FETCH_TIMEOUT_SECONDS = 2


class _Cache(pydantic.BaseModel):
    """The schema of the JSON in `_cache_file()`."""
    # When PyPI was last asked, in seconds since the epoch.
    checked_at: float
    # The latest released version PyPI reported, or `None` when that
    # fetch failed.
    latest: Optional[str]


def _cache_file() -> Path:
    # A single per-user cache file, shared between every `rbt`
    # installation on the machine (the plugin's pinned `rbt`, a
    # project venv's, a global one, ...). That's fine: the cache
    # stores only the latest *released* version — a global fact that
    # is the same for every installation — and each `rbt` compares it
    # against its own baked-in version when deciding whether to print
    # the notice.
    cache_home = os.environ.get('XDG_CACHE_HOME') or str(
        Path.home() / '.cache'
    )
    return Path(cache_home) / 'reboot' / 'latest-version-check.json'


def _fetch_latest_version() -> Optional[str]:
    with urllib.request.urlopen(
        PYPI_JSON_URL, timeout=FETCH_TIMEOUT_SECONDS
    ) as response:
        version = json.load(response)['info']['version']
        return version if isinstance(version, str) else None


def _latest_version() -> Optional[str]:
    """Returns the latest released Reboot version, from the on-disk
    cache when it is fresh, otherwise by asking PyPI. Returns `None`
    when the latest version is (currently) unknowable."""
    cache_file = _cache_file()
    cached: Optional[_Cache] = None
    try:
        cached = _Cache.model_validate_json(
            cache_file.read_text(encoding='utf-8')
        )
    except Exception:
        # Deliberate catch-all: a missing, unreadable, or corrupt
        # cache file (or an unforeseen filesystem error) must never
        # break `rbt`; we just behave as if there were no cache.
        pass

    latest = cached.latest if cached is not None else None
    if (
        cached is not None and
        time.time() - cached.checked_at < CHECK_INTERVAL_SECONDS
    ):
        return latest

    try:
        latest = _fetch_latest_version()
    except Exception:
        # Deliberate catch-all: no network failure (DNS, timeout,
        # TLS, a PyPI outage or schema change, ...) should ever break
        # `rbt`. Keep any previously cached value; a stale answer is
        # more useful than none. The cache write below records a
        # fresh `checked_at` for this failed fetch too, so the next
        # attempt is a full `CHECK_INTERVAL_SECONDS` away: we ask
        # PyPI at most once per interval, because when PyPI is
        # struggling the last thing it needs is every `rbt` start in
        # the world retrying against it, and upgrade notices are not
        # urgent enough to warrant more.
        pass

    try:
        cache_file.parent.mkdir(parents=True, exist_ok=True)
        temporary = cache_file.with_name(cache_file.name + '.tmp')
        temporary.write_text(
            _Cache(
                checked_at=time.time(),
                latest=latest,
            ).model_dump_json(),
            encoding='utf-8',
        )
        # Atomic, so concurrent `rbt` invocations never observe a
        # partially written cache file.
        os.replace(temporary, cache_file)
    except Exception:
        # Deliberate catch-all: failing to write the cache (e.g. a
        # read-only home directory) only costs us a re-fetch next
        # time; it must never break `rbt`.
        pass

    return latest


def check_for_newer_version() -> None:
    """Print a notice to stderr when a newer Reboot release exists."""
    if os.environ.get(ENVVAR_REBOOT_NO_VERSION_CHECK):
        return
    # Skip the check in CI: the notice is aimed at a human (or their
    # coding agent) who can act on it, while in CI it would just be
    # noise in logs nobody reads — and a nondeterministic network
    # fetch in every CI job adds flakiness and load on PyPI.
    if os.environ.get('CI'):
        return

    try:
        latest = _latest_version()
        if latest is None or not version_less_than(REBOOT_VERSION, latest):
            return
    except Exception:
        # Deliberate catch-all: the notice is best-effort and must
        # never break `rbt`. Includes `ValueError` from
        # `version_less_than`, e.g. if PyPI ever reports a version
        # shape we don't understand.
        return

    # The Reboot plugin's `upgrade` skill and the docs page tell
    # users and agents to expect this message; keep it in sync with
    # what they describe.
    message = (
        f"A newer Reboot ({latest}) is available; this `rbt` is "
        f"{REBOOT_VERSION}. Coding agents: run the Reboot `upgrade` skill to "
        "upgrade this application. Humans: see https://docs.reboot.dev/upgrade."
    )
    # To stderr, so the notice never pollutes stdout that may be
    # piped or parsed.
    terminal.warn(message, stderr=True)
