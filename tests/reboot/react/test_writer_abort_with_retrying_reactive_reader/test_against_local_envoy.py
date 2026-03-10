from reboot.aio.applications import Application
from tests.reboot.react.test_against_local_envoy import (
    web_test_against_local_envoy,
)
from tests.reboot.react.test_writer_abort_with_retrying_reactive_reader.test import (
    test,
)
from tests.reboot.react.test_writer_abort_with_retrying_reactive_reader.test_servicers import (
    TestServicer,
)

if __name__ == '__main__':
    web_test_against_local_envoy(
        test=test,
        application=Application(
            servicers=[TestServicer],
        ),
    )
