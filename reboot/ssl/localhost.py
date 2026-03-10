import os

# Load the self-signed certificate for `localhost`. It supports all of the
# following hostnames:
# - localhost
# - localhost.direct
# - *.localhost.direct
# - 127.0.0.1
LOCALHOST_CRT = os.path.join(os.path.dirname(__file__), 'localhost.crt')
if not os.path.isfile(LOCALHOST_CRT):
    raise FileNotFoundError("Expected file at path "
                            f"'{LOCALHOST_CRT}'")
with open(LOCALHOST_CRT, 'rb') as f:
    LOCALHOST_CRT_DATA = f.read()

LOCALHOST_KEY = os.path.join(os.path.dirname(__file__), 'localhost.key')
if not os.path.isfile(LOCALHOST_KEY):
    raise FileNotFoundError("Expected file at path "
                            f"'{LOCALHOST_KEY}'")


def is_localhost(url_or_endpoint: str) -> bool:
    url_or_endpoint = url_or_endpoint.removeprefix(
        "https://"
    )  # Ignore protocol.
    url_or_endpoint = url_or_endpoint.split(":")[0]  # Ignore port.
    return (
        url_or_endpoint == "localhost" or url_or_endpoint == "127.0.0.1" or
        url_or_endpoint == "localhost.direct" or
        url_or_endpoint.endswith(".localhost.direct")
    )
