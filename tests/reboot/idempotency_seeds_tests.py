import unittest
import uuid
from reboot.aio.idempotency import (
    Idempotency,
    IdempotencyManager,
    _merge_idempotency_seeds,
    make_derived_idempotency_key,
    make_idempotency_alias,
)
from reboot.aio.types import ServiceName, StateRef, StateTypeName
from typing import Optional


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

    @staticmethod
    def _call_idempotently(
        manager: IdempotencyManager,
        *,
        alias: Optional[str] = None,
    ) -> uuid.UUID:
        """
        Helper to test calling `IdempotentlyManager.idempotently` that
        mimics what a workflow's
        `Counter.ref('my-counter').idempotently(alias).increment(context)`
        ultimately does.
        """
        STATE_TYPE = StateTypeName("test.Counter")
        with manager.idempotently(
            state_type_name=STATE_TYPE,
            state_ref=StateRef.from_id(STATE_TYPE, "my-counter"),
            service_name=ServiceName("test.CounterMethods"),
            method="Increment",
            mutation=True,
            request=None,
            metadata=None,
            idempotency=Idempotency(alias=alias),
            aborted_type=None,
        ) as key:
            assert key is not None
            return key

    def test_idempotently_without_alias_under_different_seeds_does_not_collide(
        self,
    ) -> None:
        # Two `idempotently()` calls without an alias in different
        # seed scopes to the same method should each succeed and
        # receive distinct UUIDs.
        manager = IdempotencyManager(seed=self.SEED)
        with _merge_idempotency_seeds({"variant": "first"}):
            key_1 = self._call_idempotently(manager)
        with _merge_idempotency_seeds({"variant": "second"}):
            key_2 = self._call_idempotently(manager)
        self.assertNotEqual(key_1, key_2)

    def test_idempotently_with_alias_under_different_seeds_gets_different_uuid(
        self,
    ) -> None:
        # Even with an explicit alias, two calls under distinct seed
        # scopes should derive distinct UUIDs -- otherwise the seeds
        # aren't really defining a "new scope".
        manager = IdempotencyManager(seed=self.SEED)
        with _merge_idempotency_seeds({"variant": "first"}):
            key_1 = self._call_idempotently(manager, alias="tag")
        with _merge_idempotency_seeds({"variant": "second"}):
            key_2 = self._call_idempotently(manager, alias="tag")
        self.assertNotEqual(key_1, key_2)

    def test_idempotently_without_alias_under_same_seed_still_collides(
        self,
    ) -> None:
        # Within a single seed scope, `idempotently()` is still
        # "once per `(state_ref, method)`". A second call must still
        # raise `ValueError`, because the user supplied no way to
        # distinguish the calls.
        manager = IdempotencyManager(seed=self.SEED)
        with _merge_idempotency_seeds({"variant": "first"}):
            self._call_idempotently(manager)
            with self.assertRaises(ValueError) as error:
                self._call_idempotently(manager)
        self.assertIn(
            "more than once using the same context", str(error.exception)
        )

    def test_idempotently_with_alias_under_same_seed_returns_same_uuid(
        self,
    ) -> None:
        # Within a single seed scope, the same alias should produce
        # the same UUID on repeat calls (so legit retry / replay
        # patterns get back the same idempotency key as the original
        # call).
        manager = IdempotencyManager(seed=self.SEED)
        with _merge_idempotency_seeds({"variant": "first"}):
            key_1 = self._call_idempotently(manager, alias="tag")
            key_2 = self._call_idempotently(manager, alias="tag")
        self.assertEqual(key_1, key_2)

    def test_idempotent_state_id_is_seed_scoped(self) -> None:
        # `generate_idempotent_state_id` derives a state ID from
        # `(seed, alias)`, used by constructors like
        # `Counter.idempotently("create").create(context)` to pick a
        # deterministic ID for the new state. It must fold in the
        # active idempotency seeds for consistency with
        # `idempotently()`'s seed-aware idempotency key, otherwise the
        # state ID collides across seed scopes while the idempotency
        # key differs.
        manager = IdempotencyManager(seed=self.SEED)
        with _merge_idempotency_seeds({"variant": "first"}):
            state_id_1 = manager.generate_idempotent_state_id(
                state_type_name=StateTypeName("test.Counter"),
                service_name=ServiceName("test.CounterMethods"),
                method="Create",
                idempotency=Idempotency(alias="create"),
            )
        with _merge_idempotency_seeds({"variant": "second"}):
            state_id_2 = manager.generate_idempotent_state_id(
                state_type_name=StateTypeName("test.Counter"),
                service_name=ServiceName("test.CounterMethods"),
                method="Create",
                idempotency=Idempotency(alias="create"),
            )
        self.assertNotEqual(state_id_1, state_id_2)


if __name__ == "__main__":
    unittest.main()
