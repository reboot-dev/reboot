from contextlib import asynccontextmanager
from dataclasses import dataclass
from google.protobuf.descriptor_pb2 import FileDescriptorSet
from log.log import get_logger
from rbt.v1alpha1 import application_metadata_pb2
from reboot.controller.application_config import ApplicationConfig
from rebootdev.aio.types import ApplicationId
from rebootdev.server.database import DatabaseClient
from rebootdev.server.service_descriptor_validator import (
    validate_descriptor_sets_are_backwards_compatible,
)
from typing import AsyncIterator

logger = get_logger(__name__)


@dataclass(frozen=True)
class ApplicationMetadata:
    """Manages per-Application metadata, which is stored outside of per-server state management."""

    # The ApplicationId that metadata is being stored for.
    application_id: ApplicationId
    # The address at which to call the sidecar for persistence
    # operations.
    database_address: str

    @asynccontextmanager
    async def _metadata(
        self
    ) -> AsyncIterator[application_metadata_pb2.ApplicationMetadata]:
        """
        A context manager for application metadata.

        Yields the current metadata, which can be modified in place. On
        exit, the updated metadata is persisted.
        """
        sidecar_client = DatabaseClient(self.database_address)
        metadata = await sidecar_client.get_application_metadata()
        if metadata is None:
            # No metadata exists yet, create an empty one.
            metadata = application_metadata_pb2.ApplicationMetadata()

        yield metadata

        # Store the updated metadata back in the sidecar.
        await sidecar_client.store_application_metadata(metadata)

    async def validate_schema_backwards_compatibility(
        self, config: ApplicationConfig
    ) -> None:
        file_descriptor_set = FileDescriptorSet()
        file_descriptor_set.ParseFromString(config.spec.file_descriptor_set)
        async with self._metadata() as metadata:
            if metadata.HasField('file_descriptor_set'):
                validate_descriptor_sets_are_backwards_compatible(
                    metadata.file_descriptor_set,
                    file_descriptor_set,
                )
            metadata.file_descriptor_set.CopyFrom(file_descriptor_set)
