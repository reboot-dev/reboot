"""The CRUD scenarios in `wiki_crud.feature`, run with a librarian
model that refuses to be called: these scenarios never add a
transcript, so a librarian call is a bug, and the stand-in turns it
into a clear failure instead of a real Anthropic request."""

import pytest
from pydantic_ai.messages import ModelMessage, ModelResponse
from pydantic_ai.models.function import AgentInfo, FunctionModel
from reboot.aio.applications import Application
from reboot.bdd import scenarios
from servicers import wiki as wiki_module
from servicers.wiki import (
    PageServicer,
    TranscriptServicer,
    UserServicer,
    WikiServicer,
)
from typing import Iterator


@pytest.fixture
def application() -> Application:
    return Application(
        servicers=[
            UserServicer,
            WikiServicer,
            PageServicer,
            TranscriptServicer,
        ],
    )


@pytest.fixture(autouse=True)
def librarian_model() -> Iterator[None]:
    """Swaps the librarian's model, for the scenario's duration, for
    one that refuses to be called."""

    def refuse(
        messages: list[ModelMessage],
        info: AgentInfo,
    ) -> ModelResponse:
        raise AssertionError(
            "Librarian invoked in a scenario that should not trigger "
            "ingestion."
        )

    original = wiki_module.librarian.wrapped.model
    wiki_module.librarian.wrapped.model = FunctionModel(refuse)
    yield
    wiki_module.librarian.wrapped.model = original


scenarios('wiki_crud.feature')
