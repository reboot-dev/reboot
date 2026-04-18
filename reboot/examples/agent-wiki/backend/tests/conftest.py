"""Pytest bootstrap for the agent-wiki backend tests.

The `librarian` Pydantic AI agent in `servicers/wiki.py` is
constructed at module import time and eagerly instantiates
the Anthropic provider, which fails if `ANTHROPIC_API_KEY`
is unset. Our tests replace the model with a scripted
`FunctionModel` before any Anthropic request is made, but
we still need a non-empty key present at import. Provide a
placeholder here so the module loads even when the developer
has no real key in their environment — e.g., in CI.
"""
import os

os.environ.setdefault("ANTHROPIC_API_KEY", "test-placeholder")
