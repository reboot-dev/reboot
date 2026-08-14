import unittest
from google.protobuf.message import Message
from rbt.v1alpha1.errors_pb2 import (
    Aborted,
    AlreadyExists,
    DataLoss,
    FailedPrecondition,
    InvalidArgument,
    NotFound,
    OutOfRange,
    StateAlreadyConstructed,
    StateNotConstructed,
    TransactionParticipantFailedToCommit,
    TransactionShouldRetryWithoutBackoff,
    Unavailable,
    Unknown,
)
from reboot.aio.aborted import SystemAborted
from reboot.api import Model


class DeclaresNothingAborted(SystemAborted):
    """Stands in for a generated per-method `Aborted` type whose method
    declares no errors of its own."""

    @classmethod
    def is_declared_error(cls, error: Message | Model) -> bool:
        return False


class AbortedClassificationTest(unittest.TestCase):
    """
    Tests how `Aborted` classifies errors, in particular the
    distinction between an error that lets a transaction commit and one
    that only tells us definitively whether a mutation happened.
    """

    def test_transaction_should_retry_is_from_backend(self):
        # A participant raises this when it joins a transaction that
        # started before the participant last recovered, i.e., before
        # it ran any of the transaction's code, so we know definitively
        # that no mutation happened.
        aborted = SystemAborted(TransactionShouldRetryWithoutBackoff())

        self.assertTrue(
            DeclaresNothingAborted.is_from_backend(aborted),
        )

        # ... but the transaction still has to abort and be retried, so
        # it must not be considered recoverable.
        self.assertFalse(
            DeclaresNothingAborted.is_from_backend_and_recoverable(aborted),
        )

    def test_construction_errors_are_recoverable(self):
        for error in (StateNotConstructed(), StateAlreadyConstructed()):
            with self.subTest(error=type(error).__name__):
                aborted = SystemAborted(error)
                self.assertTrue(
                    DeclaresNothingAborted.
                    is_from_backend_and_recoverable(aborted),
                )
                # Anything recoverable is also from the backend.
                self.assertTrue(
                    DeclaresNothingAborted.is_from_backend(aborted),
                )

    def test_user_code_only_status_codes_are_recoverable(self):
        # The gRPC library never generates these, only user code, so
        # one of them reaching us means a backend raised it and
        # persisted nothing:
        # https://grpc.io/docs/guides/status-codes/
        for error in (
            InvalidArgument(),
            NotFound(),
            AlreadyExists(),
            FailedPrecondition(),
            Aborted(),
            OutOfRange(),
            DataLoss(),
        ):
            with self.subTest(error=type(error).__name__):
                aborted = SystemAborted(error)
                self.assertTrue(
                    DeclaresNothingAborted.is_from_backend(aborted),
                )
                # Nothing about the transaction is doomed, so a
                # developer can catch one and still finish it.
                self.assertTrue(
                    DeclaresNothingAborted.
                    is_from_backend_and_recoverable(aborted),
                )

    def test_failed_to_commit_is_not_from_backend(self):
        # Raised once other participants may already have committed, so
        # it does not tell us whether a mutation happened.
        aborted = SystemAborted(TransactionParticipantFailedToCommit())

        self.assertFalse(DeclaresNothingAborted.is_from_backend(aborted))

    def test_transport_errors_are_neither(self):
        # These may be raised by a proxy or the network before or after
        # the server processed the call, so we can not know whether a
        # mutation happened.
        for error in (Unavailable(), Unknown()):
            with self.subTest(error=type(error).__name__):
                aborted = SystemAborted(error)
                self.assertFalse(
                    DeclaresNothingAborted.
                    is_from_backend_and_recoverable(aborted),
                )
                self.assertFalse(
                    DeclaresNothingAborted.is_from_backend(aborted),
                )

    def test_non_aborted_exception_is_neither(self):
        exception = RuntimeError("not an `Aborted`")

        self.assertFalse(
            DeclaresNothingAborted.is_from_backend_and_recoverable(exception),
        )
        self.assertFalse(
            DeclaresNothingAborted.is_from_backend(exception),
        )


if __name__ == '__main__':
    unittest.main()
