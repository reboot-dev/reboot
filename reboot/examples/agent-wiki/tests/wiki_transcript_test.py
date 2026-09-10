"""The scenarios in `wiki_transcript.feature`, run with a librarian
model that always answers the same thing: adding a transcript may
wake the librarian, and these scenarios don't care what it does."""

import pytest
from pydantic_ai.messages import ModelMessage, ModelResponse, TextPart
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
    one that always returns the same response."""

    def respond(
        messages: list[ModelMessage],
        info: AgentInfo,
    ) -> ModelResponse:
        return ModelResponse(parts=[TextPart(content="Librarian response")])

    original = wiki_module.librarian.wrapped.model
    wiki_module.librarian.wrapped.model = FunctionModel(respond)
    yield
    wiki_module.librarian.wrapped.model = original


scenarios('wiki_transcript.feature')
