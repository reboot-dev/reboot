from tests.reboot.greeter_main import application
from tests.reboot.react.test_against_local_envoy import (
    web_test_against_local_envoy,
)
from tests.reboot.react.test_http_fallback.test import test

if __name__ == '__main__':
    web_test_against_local_envoy(
        test=test,
        application=application,
        # We're passing a bearer token here to validate that it gets
        # correctly added to the `ExternalContext` we inject in the
        # HTTP handler.
        bearer_token='S3CR3T!',
    )
