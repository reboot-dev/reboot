"""How Envoy reaches the frontend's dev server (`--frontend-url`): on a
plain `http://localhost:<port>` as before, and over TLS by name for a
dev server behind the portless proxy, `https://<name>.localhost`."""
import os
import reboot.portless
import tempfile
import unittest
from pathlib import Path
from reboot.routing.envoy_config import (
    FRONTEND_CLUSTER_NAME,
    _frontend_cluster,
    _frontend_routes,
    _get_frontend_config,
)
from reboot.settings import (
    ENVVAR_RBT_DEV,
    ENVVAR_RBT_FRONTEND_URL,
    ENVVAR_RBT_PORTLESS_NAME,
    LocalEnvoyMode,
)
from unittest.mock import patch


class FrontendClusterTest(unittest.TestCase):

    def test_plain_dev_server(self) -> None:
        with patch.dict(
            os.environ,
            {
                ENVVAR_RBT_DEV: 'true',
                ENVVAR_RBT_FRONTEND_URL: 'http://localhost:5173',
            },
        ):
            config = _get_frontend_config()
            assert config is not None
            self.assertEqual(
                (config.host, config.port, config.tls),
                ('localhost', 5173, False)
            )

            cluster = _frontend_cluster(LocalEnvoyMode.EXECUTABLE)
            assert cluster is not None
            self.assertEqual(cluster.name, FRONTEND_CLUSTER_NAME)
            self.assertFalse(cluster.HasField('transport_socket'))
            endpoint = cluster.load_assignment.endpoints[0].lb_endpoints[
                0].endpoint.address.socket_address
            self.assertEqual(
                (endpoint.address, endpoint.port_value), ('localhost', 5173)
            )

            [route] = _frontend_routes()
            self.assertEqual(route.route.host_rewrite_literal, '')

    def test_named_dev_server_behind_portless(self) -> None:
        with patch.dict(
            os.environ,
            {
                ENVVAR_RBT_DEV: 'true',
                ENVVAR_RBT_FRONTEND_URL: 'https://bank.localhost',
                ENVVAR_RBT_PORTLESS_NAME: 'bank',
            },
        ):
            os.environ.pop('PORTLESS_PORT', None)
            config = _get_frontend_config()
            assert config is not None
            # The proxy's port, since the URL names none.
            self.assertEqual(
                (config.host, config.port, config.tls),
                ('bank.localhost', 443, True)
            )

            cluster = _frontend_cluster(LocalEnvoyMode.EXECUTABLE)
            assert cluster is not None
            # Reached at loopback, by name over TLS.
            endpoint = cluster.load_assignment.endpoints[0].lb_endpoints[
                0].endpoint.address.socket_address
            self.assertEqual(
                (endpoint.address, endpoint.port_value), ('localhost', 443)
            )
            self.assertEqual(
                cluster.transport_socket.name, 'envoy.transport_sockets.tls'
            )
            self.assertIn(
                b'bank.localhost', cluster.transport_socket.typed_config.value
            )

            # ...and asked for by that name, not ours.
            [route] = _frontend_routes()
            self.assertEqual(
                route.route.host_rewrite_literal, 'bank.localhost'
            )

    def test_proxy_port_can_move(self) -> None:
        with patch.dict(
            os.environ,
            {
                ENVVAR_RBT_DEV: 'true',
                ENVVAR_RBT_FRONTEND_URL: 'https://bank.localhost',
                'PORTLESS_PORT': '1355',
            },
        ):
            config = _get_frontend_config()
            assert config is not None
            self.assertEqual(config.port, 1355)

    def test_portless_ca_is_trusted_only_under_portless(self) -> None:
        """The CA portless keeps is trusted for the dev server only when
        the application runs under portless, not because the file is
        there."""
        with tempfile.TemporaryDirectory() as directory:
            ca = Path(directory) / 'ca.pem'
            ca.write_text('not really a certificate')
            with patch.object(reboot.portless, 'CA_PATH', ca), patch.dict(
                os.environ,
                {
                    ENVVAR_RBT_DEV: 'true',
                    ENVVAR_RBT_FRONTEND_URL: 'https://frontend-bank.localhost',
                },
            ):
                os.environ.pop(ENVVAR_RBT_PORTLESS_NAME, None)
                cluster = _frontend_cluster(LocalEnvoyMode.EXECUTABLE)
                assert cluster is not None
                self.assertNotIn(
                    str(ca).encode(),
                    cluster.transport_socket.typed_config.value,
                )

                os.environ[ENVVAR_RBT_PORTLESS_NAME] = 'bank'
                cluster = _frontend_cluster(LocalEnvoyMode.EXECUTABLE)
                assert cluster is not None
                self.assertIn(
                    str(ca).encode(),
                    cluster.transport_socket.typed_config.value,
                )


if __name__ == '__main__':
    unittest.main()
