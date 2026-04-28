import unittest
import uuid
from reboot.aio.idempotency import (
    _merge_idempotency_seeds,
    make_derived_idempotency_key,
    make_idempotency_alias,
)


class IdempotencyKeyTestCase(unittest.TestCase):

    SEED = uuid.UUID(int=0xCAFEBABE_CAFEBABE_CAFEBABE_CAFEBABE)

    def test_no_seeds_matches_uuid5(self) -> None:
        self.assertEqual(
            make_derived_idempotency_key(self.SEED, "foo"),
            uuid.uuid5(self.SEED, "foo"),
        )

    def test_seeds_active_changes_key(self) -> None:
        baseline = make_derived_idempotency_key(self.SEED, "foo")
        with _merge_idempotency_seeds({"a": 1}):
            scoped = make_derived_idempotency_key(self.SEED, "foo")
        self.assertNotEqual(baseline, scoped)

    def test_distinct_seeds_distinct_keys(self) -> None:
        with _merge_idempotency_seeds({"a": 1}):
            scoped1 = make_derived_idempotency_key(self.SEED, "foo")
        with _merge_idempotency_seeds({"a": 2}):
            scoped2 = make_derived_idempotency_key(self.SEED, "foo")
        self.assertNotEqual(scoped1, scoped2)

    def test_sorted_key_invariance(self) -> None:
        # Reordering entries does not change the seed UUID.
        with _merge_idempotency_seeds({"a": 1, "b": 2}):
            ordered = make_derived_idempotency_key(self.SEED, "foo")
        with _merge_idempotency_seeds({"b": 2, "a": 1}):
            reordered = make_derived_idempotency_key(self.SEED, "foo")
        self.assertEqual(ordered, reordered)

    def test_nested_override(self) -> None:
        # Inner shadows outer on matching keys.
        with _merge_idempotency_seeds({"a": 1, "b": 2}):
            with _merge_idempotency_seeds({"a": 9}):
                inner = make_derived_idempotency_key(self.SEED, "foo")
            outer = make_derived_idempotency_key(self.SEED, "foo")
        self.assertNotEqual(outer, inner)
        # Once inner exits we're back to outer's seed.
        with _merge_idempotency_seeds({"a": 1, "b": 2}):
            outer_again = make_derived_idempotency_key(self.SEED, "foo")
        self.assertEqual(outer, outer_again)

    def test_nested_accumulation(self) -> None:
        # Disjoint keys accumulate; outer key alone produces a
        # different UUID than outer + inner combined.
        with _merge_idempotency_seeds({"a": 1}):
            outer = make_derived_idempotency_key(self.SEED, "foo")
            with _merge_idempotency_seeds({"b": 2}):
                inner = make_derived_idempotency_key(self.SEED, "foo")
        self.assertNotEqual(outer, inner)

    def test_exception_safety(self) -> None:
        baseline = make_derived_idempotency_key(self.SEED, "foo")
        try:
            with _merge_idempotency_seeds({"a": 1}):
                raise RuntimeError("Boom!")
        except RuntimeError:
            pass
        # `ContextVar` restored -- back to baseline.
        self.assertEqual(
            make_derived_idempotency_key(self.SEED, "foo"),
            baseline,
        )

    def test_iteration_in_alias_changes_key(self) -> None:
        # The iteration suffix is part of the alias string the helper
        # hashes, so different iterations produce different UUIDs even
        # with the same seeds active.
        with _merge_idempotency_seeds({"a": 1}):
            alias_iteration_3 = make_idempotency_alias("foo", 3)
            assert alias_iteration_3 is not None
            alias_iteration_4 = make_idempotency_alias("foo", 4)
            assert alias_iteration_4 is not None
            self.assertNotEqual(
                make_derived_idempotency_key(
                    self.SEED,
                    alias_iteration_3,
                ),
                make_derived_idempotency_key(
                    self.SEED,
                    alias_iteration_4,
                ),
            )

    def test_non_string_values_in_seeds(self) -> None:
        workflow_id = uuid.UUID(int=0xABCDEF)
        with _merge_idempotency_seeds({"workflow_id": workflow_id}):
            scoped = make_derived_idempotency_key(self.SEED, "foo")
        self.assertNotEqual(scoped, uuid.uuid5(self.SEED, "foo"))


if __name__ == "__main__":
    unittest.main()
