"""On macOS a server that listens on `LOCAL_LISTEN_ADDRESS` is not handed
a port that an IPv4 socket already holds, which one that listens on
every interface is."""

import grpc
import socket
import sys
import unittest
from reboot.settings import (
    EVERY_LOCAL_NETWORK_ADDRESS,
    LOCAL_LISTEN_ADDRESS,
    ONLY_LOCALHOST_NETWORK_ADDRESS,
)


def _hold_ipv4(port: int) -> socket.socket:
    """An IPv4 listener on `port`, the way an Envoy orphaned by a
    killed run holds one."""
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.bind((EVERY_LOCAL_NETWORK_ADDRESS, port))
    s.listen(1)
    return s


def _next_ephemeral_port() -> int:
    """The port the kernel's sequential allocator will hand out next."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind((EVERY_LOCAL_NETWORK_ADDRESS, 0))
        return s.getsockname()[1] + 1


class ListenAddressTest(unittest.TestCase):

    def test_where_local_servers_listen(self) -> None:
        if sys.platform == 'darwin':
            self.assertEqual(LOCAL_LISTEN_ADDRESS, ONLY_LOCALHOST_NETWORK_ADDRESS)
        else:
            self.assertEqual(LOCAL_LISTEN_ADDRESS, EVERY_LOCAL_NETWORK_ADDRESS)

    @unittest.skipUnless(sys.platform == 'darwin', 'the IPv6 allocator gap is macOS')
    def test_a_local_server_is_not_given_a_port_ipv4_sockets_hold(self) -> None:
        # IPv4 listeners on the next few ports, where the allocator is
        # about to look.
        start = _next_ephemeral_port()
        holders = []
        for i in range(6):
            try:
                holders.append(_hold_ipv4(start + i))
            except OSError:
                pass
        held = {h.getsockname()[1] for h in holders}
        self.assertGreaterEqual(len(held), 3)
        try:
            # The premise: on every interface, gRPC asked for any port
            # is handed one of them. If this kernel no longer does
            # that, there is nothing here to guard against.
            wildcard = grpc.aio.server()
            if wildcard.add_insecure_port(
                f'{EVERY_LOCAL_NETWORK_ADDRESS}:0'
            ) not in held:
                self.skipTest('this kernel skips ports IPv4 sockets hold')

            for _ in range(3):
                server = grpc.aio.server()
                port = server.add_insecure_port(f'{LOCAL_LISTEN_ADDRESS}:0')
                self.assertNotEqual(port, 0)
                self.assertNotIn(port, held)
        finally:
            for h in holders:
                h.close()


if __name__ == '__main__':
    unittest.main()
