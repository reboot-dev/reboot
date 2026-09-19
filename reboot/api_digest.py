"""The digest of what an API file declares: what says whether
generated code came from the file as it is. `rbt generate` records it
in what it writes, and the dashboard compares."""
import hashlib
from rbt.v1alpha1.api import api_pb2


def api_digest(api: api_pb2.API) -> str:
    """Returns the hex SHA-256 of what a pydantic API file declares,
    serialized deterministically."""
    return hashlib.sha256(api.SerializeToString(deterministic=True)
                         ).hexdigest()
