from reboot.controller.application_config import ApplicationConfig
from reboot.naming import ApplicationId
from typing import Awaitable, Callable


class ApplicationConfigTracker:

    def __init__(self):
        # All callbacks registered with this tracker, to be called on any
        # ApplicationConfig event.
        self.config_change_callbacks: list[Callable[[], Awaitable[None]]] = []

    async def get_application_configs(
        self
    ) -> dict[ApplicationId, ApplicationConfig]:
        """Return a map of application ID to ApplicationConfig."""
        raise NotImplementedError()

    def on_configs_change(self, callback: Callable[[], Awaitable[None]]):
        """Store a callback function to invoke whenever an application config is
        added, updated, or deleted.

        We expect our callbacks to be async functions with no params.
        """
        self.config_change_callbacks.append(callback)


class LocalApplicationConfigTracker(ApplicationConfigTracker):

    def __init__(self):
        super().__init__()
        # Mapping of application ID to full ApplicationConfig.
        self.configs: dict[ApplicationId, ApplicationConfig] = {}

    async def refresh(self) -> None:
        for callback in self.config_change_callbacks:
            await callback()

    async def add_config(self, config: ApplicationConfig) -> None:
        self.configs[config.application_id()] = config
        for callback in self.config_change_callbacks:
            await callback()

    async def delete_config(self, config: ApplicationConfig) -> None:
        self.configs.pop(config.application_id(), None)
        for callback in self.config_change_callbacks:
            await callback()

    async def delete_all_configs(self) -> None:
        self.configs = {}
        for callback in self.config_change_callbacks:
            await callback()

    async def get_application_configs(
        self
    ) -> dict[ApplicationId, ApplicationConfig]:
        return self.configs
