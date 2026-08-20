from reboot.aio.applications import Application
from reboot.aio.auth.authorizers import allow
from reboot.aio.memoize import MemoizeServicer
from reboot.std.presence.v1.presence import presence_library
from tests.reboot.react.std.presence.test import test
from tests.reboot.react.test_against_local_envoy import (
    web_test_against_local_envoy,
)

if __name__ == '__main__':
    web_test_against_local_envoy(
        test=test,
        application=Application(
            servicers=[MemoizeServicer],
            libraries=[presence_library(authorizer=allow())],
        ),
    )
