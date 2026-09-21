"""The digest of what an API file declares."""
import hashlib
from rbt.v1alpha1.api import api_pb2


def api_digest(api: api_pb2.API) -> str:
    """Returns the hex SHA-256 of what an API file declares, as Reboot
    describes it: the `API` it is read into, serialized
    deterministically. `rbt generate` records it in what it writes,
    and the dashboard compares, which is what says whether generated
    code came from the API the dashboard is showing.

    Of the `API` rather than of the file, whether the file is pydantic
    or a `.proto`: a change the `API` does not describe is one the
    digest does not notice, and each form the grammar gains is one
    more it does."""
    return hashlib.sha256(api.SerializeToString(deterministic=True)
                         ).hexdigest()
