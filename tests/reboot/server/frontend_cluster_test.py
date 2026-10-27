"""How Envoy reaches the frontend's dev server (`--frontend-url`), an
upstream: on a plain `http://localhost:<port>` as before, and over
TLS by name for a dev server behind the portless proxy,
`https://<name>.localhost`."""
import os
import reboot.portless
import tempfile
import unittest
from pathlib import Path
from reboot.routing.envoy_config import (
    _upstream_cluster,
    _upstream_error_filters,
    _upstream_routes,
)
from reboot.routing.frontend import frontend_upstreams
from reboot.settings import ENVVAR_RBT_PORTLESS_NAME, LocalEnvoyMode
from unittest.mock import patch


class FrontendClusterTest(unittest.TestCase):

    def test_plain_dev_server(self) -> None:
        os.environ.pop(ENVVAR_RBT_PORTLESS_NAME, None)
        [frontend] = frontend_upstreams('http://localhost:5173', web_app=False)
        self.assertEqual((frontend.port, frontend.tls), (5173, False))

        cluster = _upstream_cluster(LocalEnvoyMode.EXECUTABLE, frontend)
        self.assertEqual(cluster.name, 'upstream-frontend')
        self.assertFalse(cluster.HasField('transport_socket'))
        endpoint = cluster.load_assignment.endpoints[0].lb_endpoints[
            0].endpoint.address.socket_address
        self.assertEqual(
            (endpoint.address, endpoint.port_value), ('localhost', 5173)
        )

        # The path goes through as it is, asked for by the name the
        # browser used.
        [route] = _upstream_routes([frontend], catch_all=False)
        self.assertEqual(route.route.prefix_rewrite, '')
        self.assertEqual(route.route.host_rewrite_literal, '')

        # The dev server's own error page, naming the URL it was
        # looked for at.
        [error_filter] = _upstream_error_filters([frontend])
        self.assertIn(
            b'http://localhost:5173', error_filter.typed_config.value
        )

    def test_named_dev_server_behind_portless(self) -> None:
        with patch.dict(os.environ, {ENVVAR_RBT_PORTLESS_NAME: 'bank'}):
            os.environ.pop('PORTLESS_PORT', None)
            [frontend
            ] = frontend_upstreams('https://bank.localhost', web_app=False)
            # Reached at loopback, on the proxy's port since the URL
            # names none, by name over TLS.
            self.assertEqual((frontend.port, frontend.tls), (443, True))

            cluster = _upstream_cluster(LocalEnvoyMode.EXECUTABLE, frontend)
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
            [route] = _upstream_routes([frontend], catch_all=False)
            self.assertEqual(
                route.route.host_rewrite_literal, 'bank.localhost'
            )

    def test_proxy_port_can_move(self) -> None:
        with patch.dict(os.environ, {'PORTLESS_PORT': '1355'}):
            [frontend
            ] = frontend_upstreams('https://bank.localhost', web_app=False)
            self.assertEqual(frontend.port, 1355)

    def test_serving_the_web_app_is_a_second_upstream_on_the_root(
        self,
    ) -> None:
        os.environ.pop(ENVVAR_RBT_PORTLESS_NAME, None)
        [frontend,
         web_app] = frontend_upstreams('http://localhost:5173', web_app=True)
        self.assertEqual(
            (frontend.prefix, web_app.prefix), ('/__/frontend/', '/')
        )
        self.assertEqual(web_app.port, frontend.port)
        self.assertNotEqual(web_app.name, frontend.name)

    def test_a_dev_server_elsewhere_is_refused(self) -> None:
        with self.assertRaises(ValueError) as raised:
            frontend_upstreams('http://frontend:5173', web_app=False)
        self.assertIn('on this machine', str(raised.exception))

    def test_portless_ca_is_trusted_only_under_portless(self) -> None:
        """The CA portless keeps is trusted for the dev server only when
        the application runs under portless, not because the file is
        there."""
        with tempfile.TemporaryDirectory() as directory:
            ca = Path(directory) / 'ca.pem'
            ca.write_text('not really a certificate')
            [frontend] = frontend_upstreams(
                'https://frontend-bank.localhost',
                web_app=False,
            )
            with patch.object(reboot.portless, 'CA_PATH', ca), patch.dict(
                os.environ,
                {},
            ):
                os.environ.pop(ENVVAR_RBT_PORTLESS_NAME, None)
                cluster = _upstream_cluster(
                    LocalEnvoyMode.EXECUTABLE, frontend
                )
                self.assertNotIn(
                    str(ca).encode(),
                    cluster.transport_socket.typed_config.value,
                )

                os.environ[ENVVAR_RBT_PORTLESS_NAME] = 'bank'
                cluster = _upstream_cluster(
                    LocalEnvoyMode.EXECUTABLE, frontend
                )
                self.assertIn(
                    str(ca).encode(),
                    cluster.transport_socket.typed_config.value,
                )


if __name__ == '__main__':
    unittest.main()
