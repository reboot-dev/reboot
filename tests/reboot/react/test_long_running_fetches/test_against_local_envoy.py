from reboot.aio.applications import Application
from tests.reboot.greeter_servicers import MyGreeterServicer
from tests.reboot.react.test_against_local_envoy import (
    web_test_against_local_envoy,
)
from tests.reboot.react.test_long_running_fetches.test import test

if __name__ == '__main__':
    web_test_against_local_envoy(
        test=test,
        application=Application(
            servicers=[MyGreeterServicer],
        ),
    )
