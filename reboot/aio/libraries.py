from __future__ import annotations

from abc import ABC, abstractmethod
from rebootdev.aio.external import InitializeContext
from rebootdev.aio.servicers import Servicer
from typing import ClassVar


class AbstractLibrary(ABC):
    """
    Defines non-Application dependent portion of Library.
    See reboot/aio/applications.py for additional methods.
    """
    name: ClassVar[str]

    def requirements(self) -> list[str]:
        """
        Return a list of names of any additional libraries this library requires.
        """
        return []

    @abstractmethod
    def servicers(self) -> list[type[Servicer]]:
        """
        Return the list of servicers for this library.
        """
        raise NotImplementedError

    async def initialize(self, context: InitializeContext) -> None:
        """
        A function to allow libraries to run initialize steps after the
        `Application` has started.
        """
        pass
