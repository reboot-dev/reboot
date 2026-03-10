"""Test runner for nested types against local Envoy."""

from reboot.aio.applications import Application
from tests.reboot.pydantic_web.nested_types.servicer import CustomerServicer
from tests.reboot.pydantic_web.nested_types.test import test
from tests.reboot.react.test_against_local_envoy import (
    web_test_against_local_envoy,
)

if __name__ == '__main__':
    web_test_against_local_envoy(
        test=test,
        application=Application(
            servicers=[CustomerServicer],
        ),
    )
