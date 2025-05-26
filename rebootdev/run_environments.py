import os
from contextlib import asynccontextmanager
from enum import Enum
from rebootdev.settings import (
    ENVVAR_NODEJS_CONSENSUS,
    ENVVAR_RBT_DEV,
    ENVVAR_RBT_PARTITIONS,
    ENVVAR_RBT_SERVE,
    ENVVAR_REBOOT_CLOUD_VERSION,
    ENVVAR_REBOOT_NODEJS,
)
from typing import Optional


class RunEnvironment(Enum):
    """Known run environments."""
    RBT_DEV = 1
    RBT_SERVE = 2
    RBT_CLOUD = 3


class InvalidRunEnvironment(RuntimeError):
    """Exception for when run environment cannot be determined."""
    pass


def detect_run_environment() -> RunEnvironment:
    """Internal helper to determine what run environment we are in."""
    # NOTE: ordering matters here as we may have multiple environment
    # variables set but some take precedence to others.
    if os.environ.get(ENVVAR_REBOOT_CLOUD_VERSION) is not None:
        # This environment variable is only set by the Cloud's controller, so we
        # must be on the Cloud. NOTE that it is NOT sufficient to look for
        # environment variables set by Kubernetes - it is possible to run `rbt
        # serve` on Kubernetes without being in the Cloud.
        return RunEnvironment.RBT_CLOUD
    elif os.environ.get(ENVVAR_RBT_DEV, 'false').lower() == 'true':
        return RunEnvironment.RBT_DEV
    elif os.environ.get(ENVVAR_RBT_SERVE, 'false').lower() == 'true':
        return RunEnvironment.RBT_SERVE

    raise InvalidRunEnvironment()


def within_nodejs_consensus():
    """Internal helper to determine if we're within a Node.js _consensus_.

    NOTE: THIS DOESN'T TELL US IF WE'RE RUNNING FROM WITHIN
    NODE.JS, JUST IF WE'RE IN A NODE.JS CONSENSUS!

    """
    return os.environ.get(ENVVAR_NODEJS_CONSENSUS, 'false').lower() == 'true'


def on_cloud() -> bool:
    """Helper for checking if we are running in a 'rbt cloud'
    cluster."""
    try:
        return detect_run_environment() == RunEnvironment.RBT_CLOUD
    except InvalidRunEnvironment:
        return False


def running_rbt_dev() -> bool:
    """Helper for checking if we are running via `rbt dev`."""

    try:
        return detect_run_environment() == RunEnvironment.RBT_DEV
    except InvalidRunEnvironment:
        return False


def running_rbt_serve() -> bool:
    """Helper for checking if we are running via `rbt serve`."""

    try:
        return detect_run_environment() == RunEnvironment.RBT_SERVE
    except InvalidRunEnvironment:
        return False


def in_nodejs() -> bool:
    """Helper for checking if we are running in Node.js."""

    return os.environ.get(ENVVAR_REBOOT_NODEJS, 'false').lower() == 'true'


@asynccontextmanager
async def fake_rbt_dev_environment():
    """Temporarily sets the run environment to resemble a valid `rbt dev`"""

    previous_rbt_dev_value = os.environ.get(ENVVAR_RBT_DEV)
    previous_rbt_partitions_value = os.environ.get(ENVVAR_RBT_PARTITIONS)
    os.environ[ENVVAR_RBT_DEV] = 'true'
    os.environ[ENVVAR_RBT_PARTITIONS] = '1'

    try:
        yield
    finally:

        def reset(envvar_name: str, previous_value: Optional[str]):
            if previous_value is None:
                del os.environ[envvar_name]
            else:
                os.environ[envvar_name] = previous_value

        reset(ENVVAR_RBT_DEV, previous_rbt_dev_value)
        reset(ENVVAR_RBT_PARTITIONS, previous_rbt_partitions_value)
