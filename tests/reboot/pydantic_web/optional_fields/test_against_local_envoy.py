from reboot.aio.applications import Application
from tests.reboot.pydantic_web.optional_fields.servicer import TestServicer
from tests.reboot.pydantic_web.optional_fields.test import test
from tests.reboot.react.test_against_local_envoy import (
    web_test_against_local_envoy,
)

if __name__ == '__main__':
    web_test_against_local_envoy(
        test=test,
        application=Application(
            servicers=[TestServicer],
        ),
    )
