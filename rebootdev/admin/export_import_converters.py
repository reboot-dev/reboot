from dataclasses import dataclass, field
from google.protobuf import json_format, struct_pb2
from google.protobuf.message import Message
from rebootdev.aio.types import StateTypeName
from rebootdev.consensus.sidecar import SORTED_MAP_ENTRY_TYPE_NAME
from typing import Iterable, TypeAlias

StoredBytes: TypeAlias = bytes


@dataclass
class ExportImportItemConverters:
    """Handles converting state types between bytes and what we store in
    `export_import_pb2.ExportImportItem` using a registry of state types.

    Almost all states are protobuf messages, but we additionally have a
    special cased state type for SortedMap (see #2983) which should not
    interact with this class.
    """
    state_types_by_name: dict[StateTypeName,
                              type[Message]] = field(default_factory=dict)

    def add(
        self, state_type: StateTypeName, message_type: type[Message]
    ) -> None:
        self.state_types_by_name[state_type] = message_type

    @property
    def state_types(self) -> Iterable[StateTypeName]:
        return self.state_types_by_name.keys()

    def state_from_struct(
        self,
        state: struct_pb2.Struct,
        state_type: StateTypeName,
    ) -> Message:
        return json_format.ParseDict(
            json_format.MessageToDict(
                state,
                preserving_proto_field_name=True,
            ),
            self.get_message(state_type),
        )

    def state_to_struct(
        self,
        state: StoredBytes,
        state_type: StateTypeName,
    ) -> struct_pb2.Struct:
        # TODO: Because the message used in this case does not leave this
        # class, we could reuse proto messages to reduce allocation.
        message = self.get_message(state_type)
        message.ParseFromString(state)

        # Convert to Struct.
        return json_format.ParseDict(
            json_format.MessageToDict(
                message,
                preserving_proto_field_name=True,
            ),
            struct_pb2.Struct(),
        )

    def get_message(self, state_type: StateTypeName) -> Message:
        """Return a message instance for the given state type.

        Raises an error if the type is unrecognized, or not represented by a
        proto message.
        """
        message_type = self.state_types_by_name.get(state_type)
        if message_type is not None:
            return message_type()

        if state_type == SORTED_MAP_ENTRY_TYPE_NAME:
            raise ValueError(
                f"State type {state_type} is not represented by "
                "a protobuf Message."
            )

        raise ValueError(f"Unrecognized state type: {state_type}")
