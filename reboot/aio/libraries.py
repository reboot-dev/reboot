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

    async def initialize(self, context: InitializeContext) -> None:
        """
        A function to allow libraries to run initialize steps after the
        `Application` has started.
        """
        pass
