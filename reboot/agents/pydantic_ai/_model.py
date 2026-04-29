from __future__ import annotations

import pydantic_ai
from ._run import _current_run_step, _require_workflow_context
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pydantic_ai._run_context import RunContext
from pydantic_ai.messages import ModelMessage, ModelResponse
from pydantic_ai.models import ModelRequestParameters, StreamedResponse
from pydantic_ai.models.wrapper import CompletedStreamedResponse, WrapperModel
from pydantic_ai.settings import ModelSettings
from reboot.aio.workflows import at_least_once
from typing import Any

# NOTE: this file is using the `T | None` style for optional types
# instead of `Optional[T]` because that is how pydantic_ai does it and
# a lot of the code here is copied from their repository and we'd like
# to keep it consistent as we update it and keep it in sync with the
# upstream pydantic_ai library.


class _Model(WrapperModel):
    """An internal `pydantic_ai.models.Model` wrapper -- never
    exposed to users; the Reboot `Agent` constructs and installs
    one per run -- that runs every
    `request()` through Reboot's `at_least_once`, so that
    previously-completed model calls return their cached
    `ModelResponse` on workflow replay instead of re-hitting the
    provider.

    `request_stream()` is also memoized: the stream is fully
    consumed inside the memoized block and only the final
    `ModelResponse` is cached. On replay the context manager yields
    a `CompletedStreamedResponse` backed by the cached response;
    iterating it returns the cached response in a single batch
    rather than token-by-token -- live streaming is fundamentally
    incompatible with deterministic replay.
    """

    def __init__(self, wrapped: pydantic_ai.models.Model) -> None:
        super().__init__(wrapped)

    @staticmethod
    def _make_alias() -> str:
        # NOTE: alias must match between `request` and
        # `request_stream` so that a programmer switching between
        # `Agent.run` / `Agent.iter` and `Agent.run_stream` /
        # `Agent.run_stream_events` on replay still gets any
        # memoized `ModelResponse` instead of re-calling the
        # provider.
        return f"Model request for step #{_current_run_step()}"

    async def request(
        self,
        messages: list[ModelMessage],
        model_settings: ModelSettings | None,
        model_request_parameters: ModelRequestParameters,
    ) -> ModelResponse:
        context = _require_workflow_context()

        async def call() -> ModelResponse:
            return await self.wrapped.request(
                messages,
                model_settings,
                model_request_parameters,
            )

        return await at_least_once(
            self._make_alias(),
            context,
            call,
        )

    @asynccontextmanager
    async def request_stream(
        self,
        messages: list[ModelMessage],
        model_settings: ModelSettings | None,
        model_request_parameters: ModelRequestParameters,
        run_context: RunContext[Any] | None = None,
    ) -> AsyncIterator[StreamedResponse]:
        context = _require_workflow_context()

        async def call() -> ModelResponse:
            async with self.wrapped.request_stream(
                messages,
                model_settings,
                model_request_parameters,
                run_context,
            ) as stream:
                # Drain the stream so the provider finishes producing
                # and we can memoize a completed response.
                async for _ in stream:
                    pass
                return stream.get()

        response = await at_least_once(
            self._make_alias(),
            context,
            call,
        )

        yield CompletedStreamedResponse(
            model_request_parameters=model_request_parameters,
            response=response,
        )
