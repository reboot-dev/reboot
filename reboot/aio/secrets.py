import os
import time
from abc import ABC, abstractmethod
from dataclasses import dataclass, replace
from pathlib import Path
from rebootdev.settings import ENVVAR_RBT_SECRETS_DIRECTORY
from typing import ClassVar, Optional


class SecretSource(ABC):

    @abstractmethod
    async def get(self, secret_name: str) -> bytes:
        """
        Get the secret value that has been stored for the given secret_name.

        Raises `SecretNotFoundException` if there is no secret with the given name.
        """
        raise NotImplementedError()


class Secrets:
    """Provides Reboot applications access to secrets."""

    _static_secret_source: ClassVar[Optional[SecretSource]] = None

    def __init__(self):
        super().__init__()

        self._secret_cache: dict[str, _CachedSecret] = dict()
        self._secret_source: SecretSource

        if Secrets._static_secret_source is not None:
            self._secret_source = Secrets._static_secret_source
            return

        secrets_directory = os.environ.get(ENVVAR_RBT_SECRETS_DIRECTORY)
        if secrets_directory is not None:
            self._secret_source = DirectorySecretSource(
                Path(secrets_directory)
            )
        else:
            self._secret_source = EnvironmentSecretSource()

    @classmethod
    def set_secret_source(cls, secret_source: Optional[SecretSource]) -> None:
        """Allows for overriding the default source of secrets, such as in unit tests.

        After a call to this method, all constructed `Secrets` instances will use the
        given SecretSource, rather than accessing the Reboot Cloud.
        """
        cls._static_secret_source = secret_source

    @property
    def secret_source(self) -> SecretSource:
        return self._secret_source

    async def get(self, secret_name: str, *, ttl_secs: float = 15.0) -> bytes:
        """Get the secret value that has been stored for the given secret_name.

        If less than `ttl_secs` has elapsed since the last request for a secret, a cached value
        may be returned to reduce traffic to the underlying source of secrets. Because the number
        of secrets per application is expected to be static, the internal cache does not support
        eviction.

        Raises `SecretNotFoundException` if there is no secret with the given name.
        """
        # TODO: Should eventually allow for watching the secret value without polling.
        now = time.time()
        cached_secret = self._secret_cache.get(secret_name)
        if cached_secret and cached_secret.cached_at + ttl_secs > now:
            return cached_secret.value

        value = await self._secret_source.get(secret_name)

        # TODO: It is possible for multiple threads to race to put a value in the cache.
        self._secret_cache[secret_name] = _CachedSecret(value, cached_at=now)
        return value

    def adjust_entry_age_for_tests(
        self, secret_name: str, *, age_delta: float
    ) -> None:
        entry = self._secret_cache[secret_name]
        self._secret_cache[secret_name] = replace(
            entry, cached_at=entry.cached_at + age_delta
        )


class SecretNotFoundException(Exception):
    pass


@dataclass(frozen=True)
class DirectorySecretSource(SecretSource):
    directory: Path

    async def get(self, secret_name: str) -> bytes:
        path = self.directory / secret_name
        if not path.exists():
            raise SecretNotFoundException(
                f"No secret is stored for {secret_name=} (at `{path}`)."
            )
        return path.read_bytes()


class EnvironmentSecretSource(SecretSource):
    ENVIRONMENT_VARIABLE_PREFIX = "RBT_SECRET_"

    async def get(self, secret_name: str) -> bytes:
        environment_variable_name = f"{self.ENVIRONMENT_VARIABLE_PREFIX}{secret_name.upper().replace('-', '_')}"

        value = os.environ.get(environment_variable_name)
        if value is None:
            raise SecretNotFoundException(
                f"No environment variable was set for {secret_name=}; "
                f"expected `{environment_variable_name}` to be set"
            )
        return value.encode()


@dataclass(frozen=True)
class MockSecretSource(SecretSource):
    secrets: dict[str, bytes]

    async def get(self, secret_name: str) -> bytes:
        value = self.secrets.get(secret_name)
        if value is None:
            raise SecretNotFoundException(
                f"No mock secret was stored for {secret_name=}."
            )
        return value


@dataclass(frozen=True)
class _CachedSecret:
    value: bytes
    cached_at: float
