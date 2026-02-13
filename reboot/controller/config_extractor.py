import os
from google.protobuf import json_format
from rbt.v1alpha1 import placement_planner_pb2
from reboot.controller.application_config import (
    ApplicationConfig,
    LocalApplicationConfig,
    application_config_spec_from_routables,
)
from reboot.controller.settings import ENVVAR_REBOOT_REPLICA_CONFIG
from rebootdev.aio.servicers import Serviceable
from rebootdev.aio.types import ApplicationId
from typing import Optional


class LocalConfigExtractor:

    def __init__(self, application_id: ApplicationId):
        self._application_id = application_id

        replica_config_json = os.environ.get(ENVVAR_REBOOT_REPLICA_CONFIG)
        if replica_config_json is None:
            # The replica config is only required to be set when there
            # are multiple replicas; in cases where there is only a
            # single replica (e.g. `rbt dev run`) the environment
            # variable may remain unset. Therefore, this situation means
            # there is only one replica (namely: this process).
            self._replicas = 1
        else:
            replica_config = placement_planner_pb2.ReplicaConfig()
            json_format.Parse(replica_config_json, replica_config)
            self._replicas = len(replica_config.replicas)

    def config_from_serviceables(
        self,
        serviceables: list[Serviceable],
        servers: Optional[int],
    ) -> ApplicationConfig:
        spec = application_config_spec_from_routables(
            routables=serviceables,
            replicas=self._replicas,
            servers=servers,
        )
        return LocalApplicationConfig(
            application_id=self._application_id,
            spec=spec,
        )
