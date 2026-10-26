import os
import unittest
from reboot.ssl.roots import (
    ENVVAR_GRPC_DEFAULT_SSL_ROOTS_FILE_PATH,
    public_root_certificates,
)


class TestPublicRootCertificates(unittest.TestCase):

    def setUp(self) -> None:
        self._original = os.environ.pop(
            ENVVAR_GRPC_DEFAULT_SSL_ROOTS_FILE_PATH, None
        )

    def tearDown(self) -> None:
        if self._original is None:
            os.environ.pop(ENVVAR_GRPC_DEFAULT_SSL_ROOTS_FILE_PATH, None)
        else:
            os.environ[ENVVAR_GRPC_DEFAULT_SSL_ROOTS_FILE_PATH
                      ] = self._original

    def test_excludes_compromised_emsign_root(self) -> None:
        roots = public_root_certificates()
        assert roots is not None
        self.assertIn(b"-----BEGIN CERTIFICATE-----", roots)
        # The intermediates under this root had their keys compromised
        # (GHSA-6q48-6c7w-9gw2); the unaffected emSign roots remain.
        self.assertNotIn(b"emSign ECC Root CA - G3", roots)
        self.assertIn(b"emSign Root CA - G1", roots)

    def test_defers_to_grpc_roots_file_path(self) -> None:
        os.environ[ENVVAR_GRPC_DEFAULT_SSL_ROOTS_FILE_PATH] = "/roots.pem"
        self.assertIsNone(public_root_certificates())


if __name__ == '__main__':
    unittest.main()
