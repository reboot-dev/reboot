import certifi
import functools
import os
from typing import Optional

# gRPC's own environment variable naming a PEM file of root
# certificates to use in place of the ones bundled with `grpcio`.
ENVVAR_GRPC_DEFAULT_SSL_ROOTS_FILE_PATH = "GRPC_DEFAULT_SSL_ROOTS_FILE_PATH"


@functools.cache
def _certifi_root_certificates() -> bytes:
    with open(certifi.where(), 'rb') as f:
        return f.read()


def public_root_certificates() -> Optional[bytes]:
    """The root certificates to verify a publicly trusted server
    against, for `grpc.ssl_channel_credentials(root_certificates=...)`.

    These are certifi's, which are kept current with revocations of root
    CAs, unlike the copy `grpcio` bundles that is frozen at its release:
    the `grpcio` we use (as of the time of writing this comment, 1.64.3)
    still trusts the compromised `emSign ECC Root CA - G3`. Returns
    `None`, i.e., gRPC's default, when
    `GRPC_DEFAULT_SSL_ROOTS_FILE_PATH` names a bundle of the user's own.
    """
    if os.environ.get(ENVVAR_GRPC_DEFAULT_SSL_ROOTS_FILE_PATH):
        return None
    return _certifi_root_certificates()
