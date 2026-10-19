"""The sign-in `rbt login` keeps for a person: the tokens the Reboot
Cloud's authorization server issued them, in a file only they can
read, refreshed when they expire."""

import json
import os
import time
from dataclasses import asdict, dataclass
from pathlib import Path
from reboot.aio.auth.oauth_client import (
    OAuthClient,
    OAuthClientError,
    discover,
)
from typing import Any, Optional

# The Reboot Cloud a sign-in is to unless a command is told another.
DEFAULT_REBOOT_CLOUD_URL = "https://cloud.prod1.rbt.cloud"

# A token about to expire is refreshed before use, so that a command
# that takes a while does not run into its expiry.
_REFRESH_AHEAD_SECONDS = 60


@dataclass(frozen=True)
class Credentials:
    """A person's sign-in to one Reboot Cloud: who they are there, the
    tokens that prove it, and the client `rbt` registered to get
    them, which refreshing them needs."""
    user_id: str
    access_token: str
    refresh_token: str
    # Unix time the access token expires at.
    expires_at: int
    client_id: str

    @property
    def expired(self) -> bool:
        return time.time() >= self.expires_at - _REFRESH_AHEAD_SECONDS


def credentials_path() -> Path:
    """Where the sign-ins live: `$XDG_CONFIG_HOME/reboot/credentials.json`
    (`~/.config/reboot/credentials.json` by default), one entry per
    Cloud URL."""
    config_home = os.environ.get('XDG_CONFIG_HOME') or str(
        Path.home() / '.config'
    )
    return Path(config_home) / 'reboot' / 'credentials.json'


def _read() -> dict[str, Any]:
    try:
        with open(credentials_path()) as file:
            contents = json.load(file)
    except (FileNotFoundError, json.JSONDecodeError):
        return {}
    return contents if isinstance(contents, dict) else {}


def _write(contents: dict[str, Any]) -> None:
    path = credentials_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    # Written under a mode only the owner can read, from the first
    # byte: the file holds tokens that are the person.
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(descriptor, 'w') as file:
        json.dump(contents, file, indent=2)
    os.chmod(path, 0o600)


def _key(cloud_url: str) -> str:
    return cloud_url.rstrip('/')


def load(cloud_url: str) -> Optional[Credentials]:
    """The sign-in kept for `cloud_url`, if any; it may have expired."""
    entry = _read().get(_key(cloud_url))
    if not isinstance(entry, dict):
        return None
    try:
        return Credentials(
            user_id=str(entry['user_id']),
            access_token=str(entry['access_token']),
            refresh_token=str(entry['refresh_token']),
            expires_at=int(entry['expires_at']),
            client_id=str(entry['client_id']),
        )
    except (KeyError, TypeError, ValueError):
        return None


def save(cloud_url: str, credentials: Credentials) -> None:
    """Keep `credentials` as the sign-in for `cloud_url`."""
    contents = _read()
    contents[_key(cloud_url)] = asdict(credentials)
    _write(contents)


def delete(cloud_url: str) -> bool:
    """Forget the sign-in for `cloud_url`; whether there was one."""
    contents = _read()
    if contents.pop(_key(cloud_url), None) is None:
        return False
    _write(contents)
    return True


async def fresh(cloud_url: str) -> Optional[Credentials]:
    """The sign-in for `cloud_url` with an access token good for at
    least a minute, refreshed and kept if it had expired, or `None`
    when there is no sign-in or it can no longer be refreshed (the
    person signs in again)."""
    credentials = load(cloud_url)
    if credentials is None:
        return None
    if not credentials.expired:
        return credentials
    try:
        metadata = await discover(cloud_url)
        tokens = await OAuthClient(
            authorization_endpoint=metadata.authorization_endpoint,
            token_endpoint=metadata.token_endpoint,
            client_id=credentials.client_id,
        ).refresh(refresh_token=credentials.refresh_token)
    except OAuthClientError:
        return None
    credentials = Credentials(
        user_id=credentials.user_id,
        access_token=str(tokens['access_token']),
        refresh_token=str(
            tokens.get('refresh_token', credentials.refresh_token)
        ),
        expires_at=int(time.time()) + int(tokens.get('expires_in', 0)),
        client_id=credentials.client_id,
    )
    save(cloud_url, credentials)
    return credentials
