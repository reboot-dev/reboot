from __future__ import annotations

import base64
import hashlib
import uuid
from dataclasses import dataclass
from rebootdev.settings import MAX_ACTOR_ID_LENGTH, MIN_ACTOR_ID_LENGTH
from typing import Any, NewType, Optional, TypeAlias

# Collection of types used throughout our code with more meaningful names than
# the underlying python types.

StateId: TypeAlias = str
SpaceId = str  # TODO(rjh): This should be a NewType, like `ApplicationId`.
ApplicationId = NewType("ApplicationId", str)
RevisionNumber = NewType("RevisionNumber", int)
ServiceName = NewType("ServiceName", str)
StateTypeName = NewType("StateTypeName", str)  # Note: fully-qualified!
StateTypeTag = NewType("StateTypeTag", str)
ShardId = str
PartitionId = str
ConsensusId = str
GrpcMetadata = tuple[tuple[str, str], ...]
RoutableAddress = str
KubernetesNamespace = str

# A "config run" is an execution of a config pod. Think of it as being a config
# pod ID without tying ourselves to such config runs always happening in a
# Kubernetes pod.
ConfigRunId = NewType("ConfigRunId", str)


@dataclass(frozen=True)
class StateRef:
    r"""An StateRef is the globally unique id of a state machine, and acts as the
    partitioning key to assign state machines to consensuses.

    An StateRef is a `/`-separated compound id, with `\` disallowed (because it
    is used to encode `/` in a way that is simple to decode).

    Each component in the StateRef is tagged with a hash of its type, to prevent
    collisions between ids when states are colocated. See `_state_type_tag`.

    An example state ref for a `com.example.Parent` named `parent`, with a
    colocated `com.example.Child` named `child` is:
      `AEyp_5wmAiADZg:parent/AAcExYZDHb-mAw:child`

    An state ref may also be specified (in a limited number of locations, for
    efficiency) using human readable state names:
      `com.example.Parent:parent/com.example.Child:child`
    """

    ref: str

    @classmethod
    def is_state_ref(cls, candidate: str) -> bool:
        if not isinstance(candidate, str):
            return False
        last_id_start_idx = candidate.rfind('/') + 1
        state_tag_end = last_id_start_idx + _STATE_TYPE_TAG_LENGTH
        if (
            len(candidate) < state_tag_end + 1 or
            candidate[state_tag_end] != ':'
        ):
            return False
        state_type_tag_str = candidate[last_id_start_idx:state_tag_end] + '=='
        try:
            state_type_tag = base64.urlsafe_b64decode(
                state_type_tag_str.encode()
            )
        except Exception:
            return False
        return state_type_tag[0] == 0

    @classmethod
    def from_maybe_readable(cls, candidate: str) -> StateRef:
        # NOTE: there is a Lua equivalent of this function in
        # `compute_header_x_reboot_consensus_id.lua.j2`; we MUST keep them in
        # sync for our routing logic to work.
        if cls.is_state_ref(candidate):
            return StateRef(candidate)
        result = []
        readable = False
        for component in candidate.split('/'):
            component_pieces = component.split(':', maxsplit=2)
            if len(component_pieces) != 2:
                raise ValueError(
                    f"Invalid state reference component `{component}` in "
                    f"`{candidate}`: must contain either an encoded state type "
                    "or state type string, separated from an id by a `:`. "
                    "If your state ID contains slashes (`/`), remember to "
                    "replace them with their escape character: a backslash "
                    "(`\\`)."
                )
            # NB: We do not use `from_id` in this case, because the id
            # component is assumed to already be encoded.
            state_type_tag = state_type_tag_for_name(
                StateTypeName(component_pieces[0])
            )
            if state_type_tag != component_pieces[0]:
                readable = True
            state_id = component_pieces[1]
            result.append(f"{state_type_tag}:{state_id}")
        if len(result) == 0:
            raise ValueError("Cannot create empty StateRef.")
        ref = '/'.join(result)
        if readable:
            return ReadableStateRef(ref=ref, readable_ref=candidate)
        return StateRef(ref)

    @classmethod
    def from_id(cls, state_type: StateTypeName, state_id: StateId) -> StateRef:
        validate_ascii(
            state_id,
            'state_id',
            MAX_ACTOR_ID_LENGTH,
            length_min=MIN_ACTOR_ID_LENGTH,
            illegal_characters="\0\n\\",
            error_type=InvalidStateRefError,
        )
        return StateRef(
            f"{state_type_tag_for_name(state_type)}:{_state_id_encode(state_id)}"
        )

    def components(self) -> list[StateRef]:
        """Returns the component StateRefs in an StateRef.

        If the id is not compound, will return a list of length 1.
        """
        return [StateRef(component) for component in self.ref.split('/')]

    @staticmethod
    def _last_component(ref: str) -> str:
        # If we don't find a slash, then the id isn't compound and this
        # will return -1. Regardless: we'll add one below to either skip the
        # slash, or to start from the 0-th position.
        last_component_start_idx = ref.rfind('/')
        return ref[last_component_start_idx + 1:]

    def matches_state_type(self, state_type: StateTypeName) -> bool:
        expected_tag = state_type_tag_for_name(state_type)
        return self.state_type_tag == expected_tag

    @property
    def id(self) -> StateId:
        last_component = self._last_component(self.ref)
        return _state_id_decode(last_component[_STATE_TYPE_TAG_LENGTH + 1:])

    @property
    def state_type_tag(self) -> StateTypeTag:
        last_component = self._last_component(self.ref)
        tag = StateTypeTag(last_component.split(':')[0])
        assert len(tag) == _STATE_TYPE_TAG_LENGTH

        return tag

    @property
    def state_type(self) -> StateTypeName | StateTypeTag:
        return self.state_type_tag

    def colocate(
        self,
        colocated_state_type: StateTypeName,
        colocated_state_id: StateId,
    ) -> StateRef:
        colocated_id = StateRef.from_id(
            colocated_state_type,
            colocated_state_id,
        )
        return StateRef(f"{self}/{colocated_id}")

    def to_str(self) -> str:
        return self.ref

    def to_friendly_str(self) -> str:
        # The best we can do, if we're not a ReadableStateRef, is to return the
        # encoded ref.
        return self.to_str()

    def __str__(self) -> str:
        return self.to_str()

    def __eq__(self, other) -> bool:
        """
        State refs are equal if their encoded strings are equal.

        Unlike the default `dataclasses.eq` implementation, this does not
        require that `other` is exactly the same type as `self`; it can be a
        subclass.
        """
        if not isinstance(other, StateRef):
            return False
        return self.ref == other.ref


# Do not generate the `__eq__` and `__hash__` methods for this dataclass; keep
# using the ones from parent `StateRef` instead, so that `ReadableStateRef` and
# `StateRef` are interchangeable in sets and dicts.
@dataclass(frozen=True, eq=False)
class ReadableStateRef(StateRef):
    """
    When a state ref is created from a human-readable string, we store the
    human-readable string as well as the encoded string. This allows us to print
    nicer debug messages.
    """
    readable_ref: str

    def to_friendly_str(self) -> str:
        return self.readable_ref

    @property
    def state_type(self) -> StateTypeName:
        last_component = self._last_component(self.readable_ref)
        type_name = StateTypeName(last_component.split(':')[0])
        return type_name


# A cache of state type tags that have already been computed.
_state_type_tags: dict[StateTypeName, str] = {}

# The length of a state type tag: a sha1 hash, base64 encoded, with the
# trailing `=` stripped.
_STATE_TYPE_TAG_LENGTH = 14


def state_type_tag_for_name(state_type: StateTypeName) -> StateTypeTag:
    # NOTE: there is a Lua equivalent of this function in
    # `compute_header_x_reboot_consensus_id.lua.j2`; we MUST keep them in sync
    # for our routing logic to work.
    state_type_tag = _state_type_tags.get(state_type)
    if state_type_tag is None:
        state_type_bytes = bytearray(
            hashlib.sha1(state_type.encode()).digest()
        )
        state_type_bytes = state_type_bytes[0:len(state_type_bytes) // 2]
        # NOTE: The high order byte is always zeroed to allow for forwards
        # compatibly using a more compact type tag format in the future.
        state_type_bytes[0] = 0
        state_type_tag = base64.urlsafe_b64encode(state_type_bytes).decode()
        # NOTE: base64 uses trailing equal signs as padding when an input's
        # length isn't a multiple of three: since our input length is fixed,
        # we can expect to find padding.
        assert state_type_tag[-1] == '=' and state_type_tag[-2] == '='
        state_type_tag = state_type_tag[:-2]
        assert len(state_type_tag) == _STATE_TYPE_TAG_LENGTH
        _state_type_tags[state_type] = state_type_tag
    return StateTypeTag(state_type_tag)


def _state_id_encode(state_id: StateId) -> str:
    return state_id.replace("/", "\\")


def _state_id_decode(state_id_encoded: str) -> StateId:
    return state_id_encoded.replace("\\", "/")


def assert_type(
    t: Any,
    types: list[type[Any]],
    *,
    may_be_subclass: bool = True,
    error_message_supplement: Optional[str] = None,
) -> None:
    """Check that 't' is an instance of one of the expected types.

    Raises TypeError if 't' is not one of the expected types.
    """

    def check(t: Any, expected_type: Any) -> bool:
        if may_be_subclass:
            return isinstance(t, expected_type)
        else:
            return type(t) is expected_type

    if any([check(t, expected_type) for expected_type in types]):
        return

    def type_name(cls):
        return f'{cls.__module__}.{cls.__qualname__}'

    if may_be_subclass:
        raise TypeError(
            f'{type_name(type(t))} is not an instance or subclass of one of the expected '
            f'type(s): {[type_name(expected_type) for expected_type in types]}'
            f'{"; " + error_message_supplement if error_message_supplement else ""}'
        )
    else:
        raise TypeError(
            f'{type_name(type(t))} is not a non-subclass instance of one of the expected '
            f'type(s): {[type_name(expected_type) for expected_type in types]}'
            f'{"; " + error_message_supplement if error_message_supplement else ""}'
        )


def assert_not_request_type(
    t: Any,
    *,
    request_type: type[Any],
):
    if not isinstance(t, request_type):
        return

    raise TypeError(
        f"Unexpected use of request type: '{type(t)}'.\n"
        "###############################\n"
        f"In Reboot, do not pass gRPC request objects:\n"
        "  ```\n"
        "  # DO NOT DO THIS:\n"
        "  request = MyRequest(field1=value1, field2=value2)\n"
        "  my_state.MyMethod(request)\n"
        "  # ALSO DO NOT DO THIS:\n"
        "  my_state.MyMethod(context, request)\n"
        "  ```\n"
        "Instead, pass the fields of the request directly like this:\n"
        "  ```\n"
        "  my_state.MyMethod(context, field1=value1, field2=value2)\n"
        "  ```\n"
        "###############################\n"
    )


def validate_ascii(
    value: Optional[uuid.UUID] | Optional[str],
    field_name: str,
    length_max: int,
    *,
    length_min: int = 0,
    illegal_characters: str = "",
    error_type: type[ValueError] = ValueError,
) -> None:
    if value is None:
        return
    if isinstance(value, uuid.UUID):
        return
    if not isinstance(value, str):
        raise TypeError(
            f"The '{field_name}' option must be of type 'str', but got "
            f"'{type(value).__name__}'"
        )
    if len(value) > length_max:
        raise error_type(
            f"The '{field_name}' option must be at most "
            f"{length_max} characters long; the given value "
            f"is {len(value)} characters long"
        )
    if len(value) < length_min:
        raise error_type(
            f"The '{field_name}' option must be at least "
            f"{length_min} character(s) long; the given value "
            f"is {len(value)} character(s) long"
        )
    if not value.isascii():
        raise error_type(
            f"The '{field_name}' option must be an ASCII string; the "
            f"given value '{value}' is not ASCII"
        )
    found = [c for c in value if c in illegal_characters]
    if len(found) > 0:
        raise error_type(
            f"The '{field_name}' option contained illegal characters: "
            f"{found!r}. The value was: {value!r}"
        )


class InvalidStateRefError(ValueError):
    pass


class InvalidIdempotencyKeyError(ValueError):
    pass


class InvalidBearerTokenError(ValueError):
    pass
