import hashlib
import rebootdev.aio.types
import string
from base64 import b32encode
from rebootdev.settings import CLOUD_APPLICATION_ID
from typing import TypeAlias

# The ID of the user that's used when an application is running locally, i.e.
# in a unit test or in `rbt dev run`.
LOCAL_USER_ID = 'local'

# A human-readable and recognizable prefix that we use for all Kubernetes
# namespaces that form a Reboot Space. This ensures that all such namespaces
# are grouped together when using e.g. `kubectl get namespaces`.
SPACE_NAMESPACE_PREFIX = "reboot-space-"

# Reboot space IDs take the form `[single-letter-prefix][suffix]`. How long is
# that suffix expected to be? Keeping these shorter is better for human
# readability of logs and dashboards. With a base32-encoded string of length 10,
# even with a million deployed apps in the cluster we'd have a collision
# probability of <0.1%.
SPACE_ID_SUFFIX_LENGTH = 10

# Ditto for application IDs.
APPLICATION_ID_SUFFIX_LENGTH = 10

QualifiedSpaceName = str  # "[user_id]/[space_name]".
QualifiedApplicationName = str  # "[qualified_space_name]/[application_name]".
UserId = str
SpaceName = str
ApplicationName = str
SecretName = str

# A space ID starts with "s" (for recognizability), followed by 32 alphanumeric
# lowercase characters. The format is chosen so that:
#   * It is safe for use in hostname labels.
#   * It is short enough that we can add prefixes and _still_ be safe for use in
#     hostname labels.
SpaceId: TypeAlias = rebootdev.aio.types.SpaceId
# An application ID has the same format as a space ID, but starts with "a".
ApplicationId: TypeAlias = rebootdev.aio.types.ApplicationId
# A server ID has (for alpha) the same format as an application ID.
# TODO: this may change when we have multiple servers per application.
ServerId: TypeAlias = rebootdev.aio.types.ServerId
# A shard represents a section of logical keyspace in the database.
# There may be many of them. Shard IDs are unique within an application.
ShardId: TypeAlias = rebootdev.aio.types.ShardId


def get_service_account_name_for_application(
    application_id: ApplicationId
) -> str:
    return application_id


def get_namespace_for_space(space_id: SpaceId) -> str:
    if not is_valid_space_id(space_id):
        raise ValueError(f"The given space ID, '{space_id}', is not valid.")
    # The space ID is guaranteed to be 33 characters long, so we can safely add
    # our prefix while remaining within the 63-character limit for hostname
    # labels.
    return f"{SPACE_NAMESPACE_PREFIX}{space_id}"


def get_space_from_namespace(namespace: str) -> SpaceId:
    if not namespace.startswith(SPACE_NAMESPACE_PREFIX):
        raise ValueError(
            f"The given namespace, '{namespace}', is not a Reboot Space "
            "namespace"
        )
    space_id: SpaceId = namespace.removeprefix(SPACE_NAMESPACE_PREFIX)
    if not is_valid_space_id(space_id):
        raise ValueError(
            f"The given namespace, '{namespace}', is not a valid Reboot "
            "Space namespace"
        )
    return space_id


def _base32_hash(s: str, truncate_length: int) -> str:
    # An ID's biggest component is the base32-encoding of a (160-bit) SHA1 hash,
    # which means that portion is always 32 characters long.
    #
    # The hash is base32-encoded to make sure it is domain-name-label-safe (=
    # strictly alphanumeric, case-insensitive). Base32 is slightly more
    # space-efficient than hex.
    #
    # The hash is converted to lowercase, to permit it to be used in Kubernetes
    # object and namespace names.
    sha1 = hashlib.sha1(s.encode("utf-8")).digest()
    return b32encode(sha1).decode("utf-8").lower()[0:truncate_length]


def get_encoded_secret_name(secret_name: SecretName) -> str:
    """User secrets are stored with hashed names to allow for secret names which would
    otherwise be illegal in kubernetes (for example: underscores).
    """
    return _base32_hash(secret_name, truncate_length=32)


def _is_valid_id_suffix(id_suffix: str) -> bool:
    return all(
        # NOTE: `str.islower` fails for strings containing only digits, so
        # we directly compose the two valid classes.
        c in string.digits or c in string.ascii_lowercase for c in id_suffix
    )


def is_valid_space_id(space_id: SpaceId) -> bool:
    return (
        space_id.startswith("s") and
        len(space_id) == 1 + SPACE_ID_SUFFIX_LENGTH and
        _is_valid_id_suffix(space_id[1:])
    )


def get_space_id(qualified_space_name: QualifiedSpaceName) -> SpaceId:
    """
    Produces a space ID for a given qualified space name.

    TODO: During Alpha, we avoid space management bookkeeping by deriving the
    space ID directly from the qualified space name. In the longer term, space
    IDs will NOT be derived from the qualified space name, so that spaces can be
    renamed while keeping their IDs stable.
    """
    # Space IDs start with an "s".
    result = f"s{_base32_hash(qualified_space_name, SPACE_ID_SUFFIX_LENGTH)}"
    # Including the "s" prefix the space ID is 33 characters, which is plenty
    # short enough to function as a domain name label (max 63 characters).
    assert is_valid_space_id(result)
    return result


def ensure_valid_application_id(application_id: str) -> ApplicationId:
    if not is_valid_application_id(application_id):
        raise ValueError(f"`{application_id}` is not a valid ApplicationId")
    return ApplicationId(application_id)


def is_valid_application_id(application_id: str) -> bool:
    return (
        application_id.startswith("a") and
        len(application_id) == 1 + APPLICATION_ID_SUFFIX_LENGTH and
        _is_valid_id_suffix(application_id[1:])
    ) or (application_id == CLOUD_APPLICATION_ID) or (
        is_facilitator_application_id(ApplicationId(application_id)) and
        is_valid_application_id(
            facilitated_application_id(ApplicationId(application_id))
        )
    )


def get_application_id(
    space_id: SpaceId,
    application_name: ApplicationName,
) -> ApplicationId:
    """Produces the application ID for a given space ID and application name."""
    # Delimit the combination of space ID and application name with a "/", since
    # that's not a legal character in either space IDs or (short, non-qualified)
    # application names. The latter invariant is ensured by
    # `parse_qualified_application_name()`.
    combined = f"{space_id}/{application_name}"
    # Application IDs start with an "a".
    result = ApplicationId(
        f"a{_base32_hash(combined, APPLICATION_ID_SUFFIX_LENGTH)}"
    )
    # Including the "a" prefix the application ID is 11 characters, which is
    # plenty short enough to function as a domain name label (max 63
    # characters).
    assert is_valid_application_id(result)
    return result


def get_local_application_id(
    application_name: ApplicationName
) -> ApplicationId:
    """
    Produces an application ID for a local application.
    """
    return get_application_id(
        get_space_id(
            qualified_space_name=f"{LOCAL_USER_ID}/{application_name}"
        ),
        application_name,
    )


class UnparsableQualifiedName(ValueError):
    pass


def parse_qualified_application_name(
    qualified_application_name: QualifiedApplicationName,
) -> tuple[QualifiedSpaceName, ApplicationName]:
    """Parses a qualified application name into its constituent parts."""
    # A qualified application name has the following form:
    #   `[user_id]/[space_name]/[application_name]`
    parts = qualified_application_name.split("/")
    if len(parts) != 3:
        raise UnparsableQualifiedName(
            f"Expected a qualified application name, but got '{qualified_application_name}'"
        )
    user_id, space_name, application_name = parts
    return (f"{user_id}/{space_name}", application_name)


def make_qualified_application_name(
    user_id: UserId,
    space_name: SpaceName,
    application_name: ApplicationName,
) -> QualifiedApplicationName:
    # TODO(rjh): for Alpha, the qualified application name always contains a
    #            user ID. Once we introduce the concept of an organization the
    #            qualified application name may also contain organization IDs.
    return f"{user_id}/{space_name}/{application_name}"


def make_qualified_application_name_from_user_id_and_application_name(
    user_id: UserId,
    application_name: ApplicationName,
):
    # If no space name has been provided, the space name is the same as the
    # application name (i.e. the application gets its own space).
    return make_qualified_application_name(
        user_id=user_id,
        space_name=application_name,
        application_name=application_name,
    )


def parse_qualified_space_name(
    qualified_space_name: QualifiedSpaceName,
) -> tuple[UserId, SpaceName]:
    """Parses a qualified space name into its constituent parts."""
    # A qualified space name has the following form:
    #   `[user_id]/[space_name]`
    parts = qualified_space_name.split("/")
    if len(parts) != 2:
        raise UnparsableQualifiedName(
            f"Expected a qualified space name, but got '{qualified_space_name}'"
        )
    return (parts[0], parts[1])


def make_facilitator_application_id(
    application_id: ApplicationId
) -> ApplicationId:
    if application_id.endswith('-facilitator'):
        raise ValueError(
            "Unexpected input: application ID already ends with '-facilitator'."
        )
    return ApplicationId(f"{application_id}-facilitator")


def is_facilitator_application_id(application_id: ApplicationId) -> bool:
    return application_id.endswith('-facilitator')


def facilitated_application_id(application_id: ApplicationId) -> ApplicationId:
    # For now, every facilitator is associated with exactly one application, and
    # we can determine the application ID from the facilitator's application ID.
    # In the future this may change, in which case we'll need to remove this
    # function.
    if not is_facilitator_application_id(application_id):
        raise ValueError(
            "Unexpected input: application ID does not end with '-facilitator'."
        )
    return ApplicationId(application_id.removesuffix('-facilitator'))


def make_server_id(
    application_id: ApplicationId, server_index: int
) -> ServerId:
    """
    Generates a server ID for a server with a given index.
    """
    # For forwards compatibility we'll use a 6-digit zero-padded index in
    # server names. That allows us to have up to 1 million servers per
    # application, which is probably enough.
    return f"{application_id}-c{server_index:06d}"


def make_shard_id(shard_index: int) -> ShardId:
    """
    Generates a shard ID for a shard with a given index.
    """
    # For forwards compatibility we'll use a 9-digit zero-padded index
    # in shard names. That allows us to have up to 1 billion shards,
    # which is probably enough.
    return f"s{shard_index:09d}"
