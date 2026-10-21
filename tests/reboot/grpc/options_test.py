import unittest
from reboot.grpc.options import (
    NO_HTTP_PROXY_OPTIONS,
    http_proxy_options,
    is_loopback_target,
)


class IsLoopbackTargetTest(unittest.TestCase):

    def test_loopback_targets(self) -> None:
        for target in [
            'localhost:9991',
            'LOCALHOST:9991',
            'app.localhost:9991',
            '127.0.0.1:9991',
            '127.1.2.3:9991',
            '0.0.0.0:9991',
            '[::1]:9991',
            '[::]:9991',
            'dev.localhost.direct:9991',
            'localhost.direct:9991',
            'http://localhost:9991',
            'https://dev.localhost.direct:9991',
            'http://[::1]:9991',
            'dns:///localhost:9991',
            'localhost',
        ]:
            with self.subTest(target=target):
                self.assertTrue(is_loopback_target(target))

    def test_remote_targets(self) -> None:
        for target in [
            'example.com:443',
            'https://example.com',
            'http://10.0.0.1:9991',
            'my-app.reboot.cloud:443',
            # Not `localhost`, only named like it.
            'localhost.example.com:9991',
            'notlocalhost:9991',
            'dns:///example.com:443',
            'reboot-server.default.svc.cluster.local:9991',
            '[::1',
            '',
        ]:
            with self.subTest(target=target):
                self.assertFalse(is_loopback_target(target))

    def test_http_proxy_options(self) -> None:
        self.assertEqual(
            http_proxy_options('localhost:9991'),
            NO_HTTP_PROXY_OPTIONS,
        )
        self.assertEqual(http_proxy_options('example.com:443'), [])


if __name__ == '__main__':
    unittest.main()
