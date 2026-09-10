from __future__ import annotations

from abc import ABC, abstractmethod
from reboot.aio.external import InitializeContext
from reboot.aio.servicers import Servicer
from typing import ClassVar, Sequence


class AbstractLibrary(ABC):
    """
    Defines non-Application dependent portion of Library.
    See reboot/aio/applications.py for additional methods.
    """
    name: ClassVar[str]

    def requirements(self) -> Sequence[str]:
        """
        Return a list of names of any additional libraries this library requires.
        """
        return []

    @abstractmethod
    def servicers(self) -> Sequence[type[Servicer]]:
        """
        Return the list of servicers for this library.
        """
        raise NotImplementedError

    def legacy_grpc_servicers(self) -> Sequence[type]:
        """
        Return the list of plain gRPC servicers for this library, for a
        library that offers an interface predating Reboot or shared
        with something that does not speak Reboot.
        """
        return []

    async def initialize(self, context: InitializeContext) -> None:
        """
        A function to allow libraries to run initialize steps after the
        `Application` has started.
        """
        pass
