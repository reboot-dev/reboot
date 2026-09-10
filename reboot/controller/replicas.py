"""How this application is replicated, per `REBOOT_REPLICA_CONFIG`."""

import os
from google.protobuf import json_format
from rbt.v1alpha1 import placement_planner_pb2
from reboot.controller.settings import ENVVAR_REBOOT_REPLICA_CONFIG
from typing import Optional


def replica_config() -> Optional[placement_planner_pb2.ReplicaConfig]:
    """The `ReplicaConfig` this application runs under, or `None` when
    `REBOOT_REPLICA_CONFIG` is unset, which is how a single-replica run
    (e.g. `rbt dev run`) is configured."""
    replica_config_json = os.environ.get(ENVVAR_REBOOT_REPLICA_CONFIG)
    if replica_config_json is None:
        return None
    config = placement_planner_pb2.ReplicaConfig()
    json_format.Parse(
        replica_config_json,
        config,
        # For forwards-compatibility with newer fields.
        ignore_unknown_fields=True,
    )
    return config


def num_replicas() -> int:
    """How many replicas this application runs across; one when no
    `REBOOT_REPLICA_CONFIG` is set."""
    config = replica_config()
    return 1 if config is None else len(config.replicas)
