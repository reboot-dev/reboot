import os
import pydantic_ai.models
import unittest
from pydantic_ai.providers.anthropic import AnthropicProvider
from reboot.agents.pydantic_ai import Agent
from unittest import mock

# A model name in the `KnownModelName` shortcut form, as the skill
# tells applications to write it.
ANTHROPIC_MODEL = "anthropic:claude-sonnet-4-6"


class AnthropicProviderTest(unittest.TestCase):
    """Constructs the Anthropic provider against the `anthropic` SDK
    the lock resolves for the pinned `pydantic-ai-slim`. Construction
    is where a mismatched pair fails: `pydantic-ai-slim` 1.x hands the
    SDK an `httpx` client, and SDK releases from 1.0 on are built on
    `httpx2` and reject it with "Invalid `http_client` argument". The
    check needs no network access and no valid key.
    """

    def setUp(self) -> None:
        patcher = mock.patch.dict(
            os.environ, {"ANTHROPIC_API_KEY": "not-a-real-key"}
        )
        patcher.start()
        self.addCleanup(patcher.stop)

    def test_provider_constructs(self) -> None:
        AnthropicProvider()

    def test_agent_construction_infers_model(self) -> None:
        # Without `defer_model_check`, the model is resolved when the
        # agent is constructed.
        agent = Agent(ANTHROPIC_MODEL, name="analyst")
        assert isinstance(agent.model, pydantic_ai.models.Model)
        self.assertEqual(agent.model.system, "anthropic")

    def test_deferred_model_infers_at_run(self) -> None:
        # With `defer_model_check=True` the model string is only
        # resolved when the agent runs, so exercise the wrapping step
        # the run path uses.
        agent = Agent(ANTHROPIC_MODEL, name="analyst", defer_model_check=True)
        model = agent._wrap_model_or_default(None)
        assert model is not None
        self.assertEqual(model.system, "anthropic")

    def test_infer_model(self) -> None:
        model = pydantic_ai.models.infer_model(ANTHROPIC_MODEL)
        self.assertEqual(model.system, "anthropic")


if __name__ == "__main__":
    unittest.main()
