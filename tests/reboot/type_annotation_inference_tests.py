"""Tests for the return-type-annotation inference helper that
backs `at_least_once` / `at_most_once` / `until` /
`until_changes` / `write` when the caller omits `type=`.

These tests exercise `_resolve_callable_return_type` directly --
they don't run a full workflow.
"""
import unittest
from reboot.aio.workflows import (
    _UNSET,
    _isinstance_type,
    _resolve_callable_return_type,
)
from typing import Any, Awaitable, Coroutine, Optional, Union


class ResolveCallableReturnTypeTestCase(unittest.TestCase):

    def test_explicit_type_passes_through(self) -> None:

        async def fn() -> int:
            return 1

        resolved, inferred = _resolve_callable_return_type(fn, str)
        self.assertEqual(resolved, str)
        self.assertFalse(inferred)

    def test_inferred_from_async_return_annotation(self) -> None:

        async def fn() -> int:
            return 1

        resolved, inferred = _resolve_callable_return_type(fn, _UNSET)
        self.assertEqual(resolved, int)
        self.assertTrue(inferred)

    def test_inferred_from_sync_return_annotation(self) -> None:

        def fn() -> int:
            return 1

        resolved, inferred = _resolve_callable_return_type(fn, _UNSET)
        self.assertEqual(resolved, int)
        self.assertTrue(inferred)

    def test_inferred_from_pep604_union(self) -> None:

        async def fn() -> int | str:
            return 1

        resolved, inferred = _resolve_callable_return_type(fn, _UNSET)
        # PEP 604 unions are passed through unchanged; isinstance
        # accepts them natively on Python 3.10+.
        self.assertEqual(resolved, int | str)
        self.assertTrue(inferred)
        self.assertTrue(isinstance(1, _isinstance_type(resolved)))
        self.assertTrue(isinstance("x", _isinstance_type(resolved)))
        self.assertFalse(isinstance(1.0, _isinstance_type(resolved)))

    def test_inferred_from_typing_union_passes_through(self) -> None:

        async def fn() -> Union[int, str]:
            return 1

        resolved, inferred = _resolve_callable_return_type(fn, _UNSET)
        # `typing.Union[int, str]` passes through unchanged --
        # `_isinstance_type` (used by `memoize`) returns the
        # form `isinstance` accepts (a tuple, here).
        self.assertEqual(resolved, Union[int, str])
        self.assertTrue(inferred)
        self.assertTrue(isinstance(1, _isinstance_type(resolved)))
        self.assertTrue(isinstance("x", _isinstance_type(resolved)))
        self.assertFalse(isinstance(1.0, _isinstance_type(resolved)))

    def test_inferred_from_optional(self) -> None:

        async def fn() -> Optional[int]:
            return None

        resolved, inferred = _resolve_callable_return_type(fn, _UNSET)
        # `Optional[int]` == `Union[int, None]`; passes through
        # unchanged.
        self.assertEqual(resolved, Optional[int])
        self.assertTrue(inferred)
        self.assertTrue(isinstance(1, _isinstance_type(resolved)))
        self.assertTrue(isinstance(None, _isinstance_type(resolved)))

    def test_inferred_returns_default_when_no_annotation(self) -> None:

        async def fn():
            return None

        resolved, inferred = _resolve_callable_return_type(fn, _UNSET)
        self.assertEqual(resolved, type(None))
        self.assertTrue(inferred)

    def test_inferred_returns_supplied_default(self) -> None:
        # `until` family uses `default=bool`.
        async def fn():
            return False

        resolved, inferred = _resolve_callable_return_type(
            fn, _UNSET, default=bool
        )
        self.assertEqual(resolved, bool)
        self.assertTrue(inferred)

    def test_inferred_unwraps_explicit_coroutine_annotation(self) -> None:

        async def fn() -> Coroutine[Any, Any, int]:  # type: ignore[misc]
            return 1  # type: ignore[return-value]

        resolved, inferred = _resolve_callable_return_type(fn, _UNSET)
        self.assertEqual(resolved, int)
        self.assertTrue(inferred)

    def test_inferred_unwraps_explicit_awaitable_annotation(self) -> None:

        async def fn() -> Awaitable[int]:  # type: ignore[misc]
            return 1  # type: ignore[return-value]

        resolved, inferred = _resolve_callable_return_type(fn, _UNSET)
        self.assertEqual(resolved, int)
        self.assertTrue(inferred)

    def test_inferred_strips_parameterized_generic_to_origin(self) -> None:

        async def fn() -> dict[str, int]:
            return {}

        resolved, inferred = _resolve_callable_return_type(fn, _UNSET)
        # Parameterized generics aren't accepted by `isinstance`,
        # so the helper strips down to the origin type.
        self.assertEqual(resolved, dict)
        self.assertTrue(inferred)
        self.assertTrue(isinstance({}, resolved))

    def test_inferred_any_becomes_object(self) -> None:

        async def fn() -> Any:
            return 1

        resolved, inferred = _resolve_callable_return_type(fn, _UNSET)
        # `typing.Any` isn't a runtime type; `object` accepts
        # anything, which is what `Any` semantically means.
        self.assertEqual(resolved, object)
        self.assertTrue(inferred)
        self.assertTrue(isinstance(1, resolved))
        self.assertTrue(isinstance("x", resolved))

    def test_inferred_none_annotation_becomes_NoneType(self) -> None:

        async def fn() -> None:
            return None

        resolved, inferred = _resolve_callable_return_type(fn, _UNSET)
        self.assertEqual(resolved, type(None))
        self.assertTrue(inferred)


if __name__ == "__main__":
    unittest.main()
