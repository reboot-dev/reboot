from reboot.aio.servicers import Serviceable
from reboot.aio.types import ApplicationId
from reboot.controller.application_config import (
    ApplicationConfig,
    LocalApplicationConfig,
    application_config_spec_from_routables,
)
from reboot.controller.replicas import num_replicas
from typing import Optional


class LocalConfigExtractor:

    def __init__(self, application_id: ApplicationId):
        self._application_id = application_id
        self._replicas = num_replicas()

    def config_from_serviceables(
        self,
        serviceables: list[Serviceable],
        servers: Optional[int],
        allowed_origins: Optional[list[str]],
    ) -> ApplicationConfig:
        spec = application_config_spec_from_routables(
            routables=serviceables,
            replicas=self._replicas,
            servers=servers,
            allowed_origins=allowed_origins,
        )
        return LocalApplicationConfig(
            application_id=self._application_id,
            spec=spec,
        )
