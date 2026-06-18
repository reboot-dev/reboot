from __future__ import annotations

import json
import unittest
from rbt.v1alpha1 import database_pb2
from reboot.aio.contexts import Participants
from reboot.aio.headers import (
    TRANSACTION_PARTICIPANTS_HEADER,
    TRANSACTION_PARTICIPANTS_READ_ONLY_HEADER,
    TRANSACTION_PARTICIPANTS_TO_ABORT_HEADER,
)
from reboot.aio.types import StateRef, StateTypeName

ACCOUNT = StateTypeName('tests.Account')
BANK = StateTypeName('tests.Bank')


class ParticipantsBasicTest(unittest.TestCase):

    def test_add_default_is_exclusive(self) -> None:
        participants = Participants()
        ref = StateRef.from_id(ACCOUNT, 'a')
        participants.add(ACCOUNT, ref)
        # Exclusive committer: in `should_commit`, not in `read_only`.
        self.assertIn((ACCOUNT, ref), list(participants.should_commit()))
        self.assertEqual(list(participants.read_only()), [])
        # `should_prepare(skip_read_only=True)` still includes it
        # because it's exclusive.
        self.assertIn(
            (ACCOUNT, ref),
            list(participants.should_prepare(skip_read_only=True)),
        )

    def test_add_read_only_marks_read_only(self) -> None:
        participants = Participants()
        ref = StateRef.from_id(ACCOUNT, 'a')
        participants.add(ACCOUNT, ref, read_only=True)
        # Read-only iterator yields it; `should_commit` does NOT
        # (the two sets are disjoint in memory now).
        self.assertIn((ACCOUNT, ref), list(participants.read_only()))
        self.assertEqual(list(participants.should_commit()), [])
        # `should_prepare(skip_read_only=True)` excludes it.
        self.assertEqual(
            list(participants.should_prepare(skip_read_only=True)), []
        )

    def test_add_promotes_read_only_to_commit(self) -> None:
        """An entry initially added read-only and later re-added
        with the default (`read_only=False`) — e.g., when the lock
        upgrades shared→exclusive or an idempotent mutation is
        recorded — moves from `_read_only` to `_should_commit`."""
        participants = Participants()
        ref = StateRef.from_id(ACCOUNT, 'a')
        participants.add(ACCOUNT, ref, read_only=True)
        self.assertEqual(list(participants.read_only()), [(ACCOUNT, ref)])
        self.assertEqual(list(participants.should_commit()), [])
        participants.add(ACCOUNT, ref)
        self.assertEqual(list(participants.read_only()), [])
        self.assertIn((ACCOUNT, ref), list(participants.should_commit()))


class ParticipantsUnionTest(unittest.TestCase):

    def test_union_takes_max_mode(self) -> None:
        """Same participant reported as read in one sub-call and
        exclusive in another → final mode is exclusive."""
        ref = StateRef.from_id(ACCOUNT, 'a')

        read_side = Participants()
        read_side.add(ACCOUNT, ref, read_only=True)

        write_side = Participants()
        write_side.add(ACCOUNT, ref, read_only=False)

        # Union order shouldn't matter.
        merged_a = Participants()
        merged_a.union(read_side)
        merged_a.union(write_side)
        self.assertEqual(list(merged_a.read_only()), [])

        merged_b = Participants()
        merged_b.union(write_side)
        merged_b.union(read_side)
        self.assertEqual(list(merged_b.read_only()), [])

    def test_union_of_two_read_stays_read(self) -> None:
        ref = StateRef.from_id(ACCOUNT, 'a')

        a = Participants()
        a.add(ACCOUNT, ref, read_only=True)
        b = Participants()
        b.add(ACCOUNT, ref, read_only=True)

        merged = Participants()
        merged.union(a)
        merged.union(b)
        self.assertEqual(list(merged.read_only()), [(ACCOUNT, ref)])


class ParticipantsGrpcMetadataTest(unittest.TestCase):

    def test_legacy_roundtrip_omits_deprecated_headers(self) -> None:
        """Tests that deprecated headers are treated correctly."""
        participants = Participants()
        write_ref = StateRef.from_id(ACCOUNT, 'writer')
        read_ref = StateRef.from_id(ACCOUNT, 'reader')
        participants.add(ACCOUNT, write_ref, read_only=False)
        participants.add(ACCOUNT, read_ref, read_only=True)

        metadata = participants.to_grpc_metadata()
        keys = [k for (k, _) in metadata]
        self.assertIn(TRANSACTION_PARTICIPANTS_HEADER, keys)
        # We never emit the to-abort header anymore.
        self.assertNotIn(TRANSACTION_PARTICIPANTS_TO_ABORT_HEADER, keys)
        self.assertNotIn(TRANSACTION_PARTICIPANTS_READ_ONLY_HEADER, keys)
        # The main header carries BOTH the write and read-only refs
        # — the receiver wouldn't have the read-only header to
        # disambiguate.
        commit_payload = next(
            json.loads(v)
            for (k, v) in metadata
            if k == TRANSACTION_PARTICIPANTS_HEADER
        )
        self.assertEqual(
            set(commit_payload[ACCOUNT]),
            {write_ref.to_str(), read_ref.to_str()},
        )

        # Round-trip through `from_grpc_metadata`: a receiver parsing
        # this legacy form (no read-only header) sees both refs as
        # exclusive committers (in-memory `_read_only` ends up
        # empty). That's the same safe degradation an old server that
        # hasn't upgraded would do.
        restored = Participants.from_grpc_metadata(metadata)
        self.assertEqual(
            set(restored.should_commit()),
            {(ACCOUNT, write_ref), (ACCOUNT, read_ref)},
        )
        self.assertEqual(list(restored.read_only()), [])

    def test_to_abort_header_flags_rolling_upgrade_abort(self) -> None:
        """Rolling-upgrade compatibility: a header from an old server is not
        recorded as a participant; it only sets `saw_legacy_to_abort`
        so the stub merging the metadata can abort the transaction
        with a retryable `Unavailable`. We never emit this header
        ourselves.
        """
        old_ref = StateRef.from_id(ACCOUNT, 'old')
        metadata = (
            (
                TRANSACTION_PARTICIPANTS_TO_ABORT_HEADER,
                json.dumps({ACCOUNT: [old_ref.to_str()]}),
            ),
        )
        restored = Participants.from_grpc_metadata(metadata)
        self.assertTrue(restored.saw_legacy_to_abort)
        self.assertEqual(list(restored.should_commit()), [])
        self.assertEqual(list(restored.read_only()), [])

    def test_legacy_metadata_without_read_header_treats_all_as_write(
        self,
    ) -> None:
        """An old participant that doesn't emit the read header
        should be interpreted as 'all participants are exclusive'.
        """
        ref = StateRef.from_id(ACCOUNT, 'a')
        metadata = (
            (
                TRANSACTION_PARTICIPANTS_HEADER,
                json.dumps({ACCOUNT: [ref.to_str()]}),
            ),
        )
        restored = Participants.from_grpc_metadata(metadata)
        self.assertEqual(list(restored.read_only()), [])
        self.assertEqual(list(restored.should_commit()), [(ACCOUNT, ref)])

    def test_read_only_aware_emission_does_not_duplicate_read_only(
        self,
    ) -> None:
        """With `read_only_aware=True` the main participants header
        carries only the entries that need commit; the read-only
        header carries the rest. No duplication on the wire."""
        participants = Participants()
        write_ref = StateRef.from_id(ACCOUNT, 'writer')
        read_ref = StateRef.from_id(ACCOUNT, 'reader')
        participants.add(ACCOUNT, write_ref, read_only=False)
        participants.add(ACCOUNT, read_ref, read_only=True)

        metadata = participants.to_grpc_metadata(read_only_aware=True)

        should_commit_payload = next(
            json.loads(v)
            for (k, v) in metadata
            if k == TRANSACTION_PARTICIPANTS_HEADER
        )
        read_only_payload = next(
            json.loads(v)
            for (k, v) in metadata
            if k == TRANSACTION_PARTICIPANTS_READ_ONLY_HEADER
        )
        self.assertEqual(
            should_commit_payload, {ACCOUNT: [write_ref.to_str()]}
        )
        self.assertEqual(read_only_payload, {ACCOUNT: [read_ref.to_str()]})

    def test_from_grpc_metadata_recovers_read_only_aware_shape(
        self,
    ) -> None:
        """Deserialization recognizes a read-only entry that
        appears only in the read-only header (read-only-aware /
        disjoint shape) — it lands in `_read_only`, distinct from
        `_should_commit`."""
        write_ref = StateRef.from_id(ACCOUNT, 'writer')
        read_ref = StateRef.from_id(ACCOUNT, 'reader')

        participants = Participants()
        participants.add(ACCOUNT, write_ref, read_only=False)
        participants.add(ACCOUNT, read_ref, read_only=True)

        metadata = participants.to_grpc_metadata(read_only_aware=True)

        restored = Participants.from_grpc_metadata(metadata)
        self.assertEqual(
            set(restored.should_commit()),
            {(ACCOUNT, write_ref)},
        )
        self.assertEqual(list(restored.read_only()), [(ACCOUNT, read_ref)])


class ParticipantsSidecarTest(unittest.TestCase):

    def test_sidecar_roundtrip_with_read_only(self) -> None:
        participants = Participants()
        write_ref = StateRef.from_id(BANK, 'b')
        read_ref = StateRef.from_id(ACCOUNT, 'a')
        participants.add(BANK, write_ref, read_only=False)
        participants.add(ACCOUNT, read_ref, read_only=True)

        proto = participants.to_sidecar()
        # Read-only map carries just the reader.
        self.assertEqual(
            set(proto.read_only[ACCOUNT].state_refs),
            {read_ref.to_str()},
        )
        self.assertNotIn(BANK, proto.read_only)
        # Disjoint persistence: `should_commit` on the wire does
        # NOT include the read-only ref. This is the rollback-safety
        # property — an older binary without read-only elision
        # reading this record sees only the write entry in
        # `should_commit` and won't try to re-prepare the (elided,
        # lock-released, transaction-forgotten) read-only
        # participant.
        self.assertEqual(
            set(proto.should_commit[BANK].state_refs),
            {write_ref.to_str()},
        )
        self.assertNotIn(ACCOUNT, proto.should_commit)

        restored = Participants.from_sidecar(proto)
        # In-memory the sets stay disjoint: write goes to
        # `should_commit`, read-only goes to `read_only`.
        self.assertEqual(list(restored.read_only()), [(ACCOUNT, read_ref)])
        self.assertEqual(
            set(restored.should_commit()),
            {(BANK, write_ref)},
        )

    def test_sidecar_with_no_read_only_participants(self) -> None:
        """A transaction with only write participants persists an
        empty `read_only` map; round-trip leaves `_read_only`
        empty and every committer in `_should_commit`."""
        proto = database_pb2.Participants(
            should_commit={
                ACCOUNT:
                    database_pb2.Participants.StateRefs(
                        state_refs=['account-1', 'account-2']
                    )
            },
        )
        restored = Participants.from_sidecar(proto)
        self.assertEqual(list(restored.read_only()), [])
        self.assertEqual(
            set(restored.should_commit()),
            {
                (ACCOUNT, StateRef('account-1')),
                (ACCOUNT, StateRef('account-2')),
            },
        )


class ParticipantsShouldPrepareTest(unittest.TestCase):

    def test_should_prepare_skip_read_only_excludes_read_only(self) -> None:
        """`should_prepare(skip_read_only=True)` is what the recovery
        path uses. It includes the committers but excludes read-only
        committers (already released their locks via read-only
        elision and forgotten the transaction)."""
        participants = Participants()

        write_ref = StateRef.from_id(BANK, 'b')
        read_ref = StateRef.from_id(ACCOUNT, 'a')

        participants.add(BANK, write_ref, read_only=False)
        participants.add(ACCOUNT, read_ref, read_only=True)

        prepared = list(participants.should_prepare(skip_read_only=True))
        self.assertIn((BANK, write_ref), prepared)
        self.assertNotIn((ACCOUNT, read_ref), prepared)

    def test_should_prepare_default_includes_read_only(self) -> None:
        """Without `skip_read_only=True`, read-only participants
        are included so the initial Prepare RPC reaches them and
        triggers elision."""
        participants = Participants()
        write_ref = StateRef.from_id(BANK, 'b')
        read_ref = StateRef.from_id(ACCOUNT, 'a')
        participants.add(BANK, write_ref, read_only=False)
        participants.add(ACCOUNT, read_ref, read_only=True)

        prepared = list(participants.should_prepare())
        self.assertIn((BANK, write_ref), prepared)
        self.assertIn((ACCOUNT, read_ref), prepared)


if __name__ == "__main__":
    unittest.main()
