import grpc
import os
import tempfile
import unittest
from ast import literal_eval
from google.protobuf.json_format import MessageToJson as JsonDump
from google.protobuf.json_format import Parse as JsonParse
from pathlib import Path
from rbt.v1alpha1.admin import export_import_pb2_grpc
from rbt.v1alpha1.errors_pb2 import PermissionDenied, StateNotConstructed
from reboot.admin import export_import_client
from reboot.aio.applications import Application
from reboot.aio.auth.authorizers import allow, deny
from reboot.aio.contexts import TransactionContext, WriterContext
from reboot.aio.external import ExternalContext
from reboot.aio.tests import Reboot
from reboot.settings import ENVVAR_SECRET_REBOOT_ADMIN_TOKEN
from reboot.ssl.localhost import LOCALHOST_CRT_DATA

# Import used in SortedMap documentation.
# isort: off
from reboot.std.collections.v1.sorted_map import SortedMap
# isort: on
from reboot.std.collections.v1.sorted_map import (
    InsertRequest,
    InvalidRangeError,
    RangeRequest,
    RangeResponse,
    ReverseRangeResponse,
    servicers,
    sorted_map_library,
)
from tests.reboot.general_rbt import General, GeneralRequest, GeneralResponse
from tests.reboot.general_servicer import GeneralServicer
from typing import Optional

TEST_SECRET_REBOOT_ADMIN_TOKEN = 'test-admin-secret'


class SortedMapConsumer(GeneralServicer):
    """An implementation of the General interface which consumes a SortedMap."""

    async def constructor_writer(
        self,
        context: WriterContext,
        state: General.State,
        request: GeneralRequest,
    ) -> GeneralResponse:
        return GeneralResponse()

    async def transaction(
        self,
        context: TransactionContext,
        state: General.State,
        request: GeneralRequest,
    ) -> GeneralResponse:
        map_id = request.content['map_id']
        insert_request = JsonParse(
            request.content['insert_request'], InsertRequest()
        )
        range_request = JsonParse(
            request.content['range_request'], RangeRequest()
        )
        abort = literal_eval(request.content.get('abort', 'False'))

        sorted_map = SortedMap.ref(map_id)

        async def call_range_request() -> RangeResponse:
            return await sorted_map.range(
                context,
                start_key=(
                    range_request.start_key
                    if range_request.HasField('start_key') else None
                ),
                end_key=(
                    range_request.end_key
                    if range_request.HasField('end_key') else None
                ),
                limit=range_request.limit,
            )

        range_response_before = await call_range_request()
        await sorted_map.insert(
            context,
            entries=dict(insert_request.entries),
        )
        range_response_after = await call_range_request()

        if abort:
            raise Exception('As you wish!')

        return GeneralResponse(
            content={
                'range_response_before': JsonDump(range_response_before),
                'range_response_after': JsonDump(range_response_after),
            }
        )


class TestCase(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self) -> None:
        os.environ[ENVVAR_SECRET_REBOOT_ADMIN_TOKEN
                  ] = TEST_SECRET_REBOOT_ADMIN_TOKEN

        self.rbt = Reboot()
        await self.rbt.start()

    async def asyncTearDown(self) -> None:
        await self.rbt.stop()

    def map(
        self,
        *,
        name: Optional[str] = None,
        app_internal: bool = True,
    ) -> tuple[SortedMap.WeakReference, ExternalContext]:
        context = self.rbt.create_external_context(
            name=f"test-{self.id()}",
            app_internal=app_internal,
        )
        return SortedMap.ref(
            name if name is not None else self.id(),
        ), context

    async def assert_range(
        self,
        expected: dict[str, bytes],
        map_ref: SortedMap.WeakReference,
        context: ExternalContext,
        *,
        start: Optional[str] = None,
        end: Optional[str] = None,
        limit: int = 128,
    ) -> None:
        range_response = await map_ref.range(
            context, start_key=start, end_key=end, limit=limit
        )
        self.assert_range_response(expected, range_response)

    async def assert_rev_range(
        self,
        expected: dict[str, bytes],
        map_ref: SortedMap.WeakReference,
        context: ExternalContext,
        *,
        start: Optional[str] = None,
        end: Optional[str] = None,
        limit: int = 128,
    ) -> None:
        brange_response = await map_ref.reverse_range(
            context, start_key=start, end_key=end, limit=limit
        )
        self.assert_rev_range_response(expected, brange_response)

    def assert_range_response(
        self,
        expected: dict[str, bytes],
        range_response: RangeResponse,
    ) -> None:
        # NOTE: Python dicts preserve order, but protobuf `map`s do not.
        self.assertEqual(
            list(expected.items()),
            [(e.key, e.value) for e in range_response.entries],
        )

    def assert_rev_range_response(
        self,
        expected: dict[str, bytes],
        brange_response: ReverseRangeResponse,
    ) -> None:
        # NOTE: Python dicts preserve order, but protobuf `map`s do not.
        self.assertEqual(
            list(expected.items()),
            [(e.key, e.value) for e in brange_response.entries],
        )

    async def test_auth(self) -> None:
        await self.rbt.up(
            Application(
                servicers=[SortedMapConsumer],
                libraries=[sorted_map_library()],
            ),
            local_envoy=True,
            local_envoy_tls=True,  # For TLS/SSL test coverage.
        )
        m, workflow = self.map(app_internal=False)
        with self.assertRaises(SortedMap.InsertAborted) as aborted:
            await m.insert(
                workflow,
                entries={"a": b"1"},
            )
        # TODO: we'd prefer for this to be an `Unauthenticated` error,
        #       but there are snags that prevent that; see discussion at
        #         https://github.com/reboot-dev/mono/pull/4601#issuecomment-2989091840
        self.assertEqual(type(aborted.exception.error), PermissionDenied)

    async def test_basic(self) -> None:
        await self.rbt.up(
            Application(
                servicers=[SortedMapConsumer],
                libraries=[sorted_map_library()],
            ),
            local_envoy=True,
            local_envoy_tls=True,  # For TLS/SSL test coverage.
        )
        sorted_map, context = self.map()
        full = {"b": b"1"}

        await sorted_map.insert(
            context,
            entries=full,
        )

        await self.assert_range(full, sorted_map, context)
        await self.assert_range(full, sorted_map, context, start="b")
        await self.assert_range(full, sorted_map, context, start="b", end="c")
        await self.assert_range(full, sorted_map, context, start="a")

        await self.assert_rev_range(full, sorted_map, context)
        await self.assert_rev_range(full, sorted_map, context, start="b")
        await self.assert_rev_range(
            full, sorted_map, context, start="b", end="a"
        )
        await self.assert_rev_range(full, sorted_map, context, start="c")

        await self.assert_range({}, sorted_map, context, end="b")
        await self.assert_range({}, sorted_map, context, start="c")

        await self.assert_rev_range({}, sorted_map, context, end="b")
        await self.assert_rev_range({}, sorted_map, context, start="a")

        get_response = await sorted_map.get(context, key="b")
        self.assertEqual(b"1", get_response.value)
        get_response = await sorted_map.get(context, key="c")
        self.assertFalse(get_response.HasField('value'))

        # Test `reactively().range`.
        async for range_response in sorted_map.reactively().range(
            context, limit=1
        ):
            self.assert_range_response(full, range_response)
            break
        else:
            raise AssertionError("No responses returned by reactively().range")

        await sorted_map.remove(
            context,
            keys=["b"],
        )

        await self.assert_range({}, sorted_map, context)
        await self.assert_rev_range({}, sorted_map, context)

        get_response = await sorted_map.get(context, key="b")
        self.assertFalse(get_response.HasField('value'))

    async def test_empty_create(self) -> None:
        await self.rbt.up(
            Application(
                servicers=[SortedMapConsumer],
                libraries=[sorted_map_library()],
            ),
            local_envoy=True,
            local_envoy_tls=True,  # For TLS/SSL test coverage.
        )
        # Test that creating an empty SortedMap immediately results in a working
        # `Range` call. See https://github.com/reboot-dev/mono/issues/4228.
        sorted_map, context = self.map()

        await sorted_map.insert(context, entries={})

        await self.assert_range({}, sorted_map, context)

    async def test_limit_zero(self) -> None:
        await self.rbt.up(
            Application(
                servicers=[SortedMapConsumer],
                libraries=[sorted_map_library()],
            ),
            local_envoy=True,
            local_envoy_tls=True,  # For TLS/SSL test coverage.
        )
        sorted_map, context = self.map()
        await sorted_map.insert(
            context,
            entries={"a": b"1"},
        )
        with self.assertRaises(SortedMap.RangeAborted) as aborted:
            await self.assert_range({}, sorted_map, context, limit=0)
        self.assertEqual(type(aborted.exception.error), InvalidRangeError)
        self.assertIn(
            "Range requires a non-zero `limit` value.", str(aborted.exception)
        )
        # The same error should also appear when using the reactive API.
        with self.assertRaises(SortedMap.RangeAborted) as aborted:
            async for range_response in sorted_map.reactively().range(
                context,
                limit=0,
            ):
                break
        self.assertEqual(type(aborted.exception.error), InvalidRangeError)
        self.assertIn(
            "Range requires a non-zero `limit` value.", str(aborted.exception)
        )

    async def test_limit_zero_reverse(self) -> None:
        await self.rbt.up(
            Application(
                servicers=[SortedMapConsumer],
                libraries=[sorted_map_library()],
            ),
            local_envoy=True,
            local_envoy_tls=True,  # For TLS/SSL test coverage.
        )
        sorted_map, context = self.map()
        await sorted_map.insert(
            context,
            entries={"a": b"1"},
        )

        with self.assertRaises(SortedMap.ReverseRangeAborted) as aborted:
            await self.assert_rev_range({}, sorted_map, context, limit=0)
        self.assertEqual(type(aborted.exception.error), InvalidRangeError)
        self.assertIn(
            "ReverseRange requires a non-zero `limit` value.",
            str(aborted.exception)
        )

    async def test_end_before_start(self) -> None:
        await self.rbt.up(
            Application(
                servicers=[SortedMapConsumer],
                libraries=[sorted_map_library()],
            ),
            local_envoy=True,
            local_envoy_tls=True,  # For TLS/SSL test coverage.
        )
        sorted_map, context = self.map()
        await sorted_map.insert(
            context,
            entries={},
        )

        with self.assertRaises(SortedMap.RangeAborted) as aborted:
            await sorted_map.range(
                context, start_key="foo", end_key="foo", limit=1
            )
        self.assertEqual(type(aborted.exception.error), InvalidRangeError)
        self.assertIn(
            "Range requires `end_key` to be larger than `start_key`; got "
            "start_key='foo' and end_key='foo'",
            str(aborted.exception.error.message)
        )

    async def test_end_after_start(self) -> None:
        await self.rbt.up(
            Application(
                servicers=[SortedMapConsumer],
                libraries=[sorted_map_library()],
            ),
            local_envoy=True,
            local_envoy_tls=True,  # For TLS/SSL test coverage.
        )
        sorted_map, context = self.map()
        await sorted_map.insert(
            context,
            entries={},
        )

        with self.assertRaises(SortedMap.ReverseRangeAborted) as aborted:
            await sorted_map.reverse_range(
                context, start_key="foo", end_key="foo", limit=1
            )
        self.assertEqual(type(aborted.exception.error), InvalidRangeError)
        self.assertIn(
            "ReverseRange requires `end_key` to be smaller than `start_key`; got "
            "start_key='foo' and end_key='foo'",
            str(aborted.exception.error.message)
        )

    async def test_paging(self) -> None:
        await self.rbt.up(
            Application(
                servicers=[SortedMapConsumer],
                libraries=[sorted_map_library()],
            ),
            local_envoy=True,
            local_envoy_tls=True,  # For TLS/SSL test coverage.
        )
        sorted_map, context = self.map()

        full = {f"{i:02}": str(i).encode() for i in range(11)}
        reverse = {key: full[key] for key in reversed(full)}

        await sorted_map.insert(
            context,
            entries=full,
        )

        await self.assert_range(full, sorted_map, context)
        await self.assert_rev_range(reverse, sorted_map, context)

        await self.assert_range(
            dict(list(full.items())[:5]),
            sorted_map,
            context,
            end="05",
        )
        await self.assert_range(
            dict(list(full.items())[5:]),
            sorted_map,
            context,
            start="05",
        )

        await self.assert_rev_range(
            dict(list(reverse.items())[:5]),
            sorted_map,
            context,
            end="05",
        )
        await self.assert_rev_range(
            dict(list(reverse.items())[5:]),
            sorted_map,
            context,
            start="05",
        )

    async def test_range_without_write(self) -> None:
        """Test making a range query on an unwritten SortedMap"""
        await self.rbt.up(
            Application(
                libraries=[sorted_map_library()],
            ),
            local_envoy=True,
            local_envoy_tls=True,  # For TLS/SSL test coverage.
        )
        sorted_map, context = self.map()

        # TODO(rebootdev/reboot#67): This should not raise with StateNotConstructed.
        with self.assertRaises(SortedMap.RangeAborted) as aborted:
            await sorted_map.range(context, limit=1)

        self.assertEqual(type(aborted.exception.error), StateNotConstructed)

    async def test_insert_overwrite(self) -> None:
        "Test that inserting replaces the previous value associated with the key, if any."
        await self.rbt.up(
            Application(
                servicers=[SortedMapConsumer],
                libraries=[sorted_map_library()],
            ),
            local_envoy=True,
            local_envoy_tls=True,  # For TLS/SSL test coverage.
        )
        sorted_map, context = self.map()

        await sorted_map.insert(
            context,
            entries={
                "k1": b"abc",
                "k2": b"def",
            },
        )
        await sorted_map.insert(
            context,
            entries={
                "k2": b"def2",
                "k3": b"xyz",
            },
        )

        await self.assert_range(
            {
                "k1": b"abc",
                "k2": b"def2",
                "k3": b"xyz",
            }, sorted_map, context
        )

    async def test_remove_no_op(self) -> None:
        "Test that removing a non-existent key is a no-op."
        await self.rbt.up(
            Application(
                servicers=[SortedMapConsumer],
                libraries=[sorted_map_library()],
            ),
            local_envoy=True,
            local_envoy_tls=True,  # For TLS/SSL test coverage.
        )
        sorted_map, context = self.map()

        await sorted_map.insert(
            context,
            entries={
                "a": b"1",
                "b": b"2"
            },
        )

        await sorted_map.remove(
            context,
            keys=["a", "c"],
        )

        await self.assert_range({"b": b"2"}, sorted_map, context)

    async def test_transaction_basic(self) -> None:
        "Test that we can read our writes inside a transaction, as well as existing writes."
        await self.rbt.up(
            Application(
                servicers=[SortedMapConsumer],
                libraries=[sorted_map_library()],
            ),
            local_envoy=True,
            local_envoy_tls=True,  # For TLS/SSL test coverage.
        )

        sorted_map, context = self.map()
        consumer, _ = await General.ConstructorWriter(context)

        expected_entries_before = {"2": b""}
        expected_entries_after = {"1": b"", "2": b"", "3": b""}

        # Insert one key outside of a transaction.
        await sorted_map.insert(context, entries={"2": b""})
        # And two more inside the transaction.
        range_start_key = "1"
        range_end_key = None
        range_limit = 128
        txn_response = await consumer.Transaction(
            context,
            content={
                "map_id":
                    sorted_map.state_id,
                "insert_request":
                    JsonDump(InsertRequest(entries={
                        "1": b"",
                        "3": b""
                    })),
                "range_request":
                    JsonDump(
                        RangeRequest(
                            start_key=range_start_key,
                            end_key=range_end_key,
                            limit=range_limit,
                        )
                    ),
            },
        )

        # Then confirm that the read inside the transaction sees the same data as outside.
        await self.assert_range(
            expected_entries_after,
            sorted_map,
            context,
            start=range_start_key,
            end=range_end_key,
            limit=range_limit,
        )
        self.assert_range_response(
            expected_entries_before,
            JsonParse(
                txn_response.content['range_response_before'], RangeResponse()
            ),
        )
        self.assert_range_response(
            expected_entries_after,
            JsonParse(
                txn_response.content['range_response_after'], RangeResponse()
            ),
        )

    async def test_transaction_abort(self) -> None:
        "Test that a transaction that aborts does not persist changes."
        await self.rbt.up(
            Application(
                servicers=[SortedMapConsumer],
                libraries=[sorted_map_library()],
            ),
            local_envoy=True,
            local_envoy_tls=True,  # For TLS/SSL test coverage.
        )

        sorted_map, context = self.map()
        consumer, _ = await General.ConstructorWriter(context)

        expected_entries_before = {"2": b""}

        # Insert one key outside of a transaction.
        await sorted_map.insert(context, entries=expected_entries_before)
        # And two more inside the transaction.
        range_start_key = "1"
        range_end_key = None
        range_limit = 128
        with self.assertRaises(Exception) as exc:
            await consumer.Transaction(
                context,
                content={
                    "map_id":
                        sorted_map.state_id,
                    "insert_request":
                        JsonDump(InsertRequest(entries={
                            "1": b"",
                            "3": b""
                        })),
                    "range_request":
                        JsonDump(
                            RangeRequest(
                                start_key=range_start_key,
                                end_key=range_end_key,
                                limit=range_limit,
                            )
                        ),
                    "abort":
                        "True",
                },
            )
        self.assertIn("As you wish!", str(exc.exception))

        # Then confirm that the insert inside the transaction was not persisted.
        await self.assert_range(
            expected_entries_before,
            sorted_map,
            context,
            start=range_start_key,
            end=range_end_key,
            limit=range_limit,
        )

    async def test_export_import(self) -> None:
        """Tests import/export of sorted maps.

        This is tested here rather than in `export_import_tests.py` because `SortedMap`
        will hopefully be our only special snowflake. See #2983.
        """
        await self.rbt.up(
            Application(
                servicers=[SortedMapConsumer],
                libraries=[sorted_map_library()],
            ),
            local_envoy=True,
            local_envoy_tls=True,  # For TLS/SSL test coverage.
        )
        sorted_map, context = self.map()

        full = {"a": b"1", "b": b"2"}
        await sorted_map.insert(
            context,
            entries=full,
        )
        await self.assert_range(full, sorted_map, context)

        export_import_stub = export_import_pb2_grpc.ExportImportStub(
            grpc.aio.secure_channel(
                self.rbt.localhost_direct_endpoint(),
                grpc.ssl_channel_credentials(
                    root_certificates=LOCALHOST_CRT_DATA,
                ),
            ),
        )

        with tempfile.TemporaryDirectory() as d:
            # Export into a temporary directory.
            directory = Path(d)
            await export_import_client.do_export(
                export_import_stub,
                directory,
                admin_token=TEST_SECRET_REBOOT_ADMIN_TOKEN,
            )

            # Delete all entries and confirm empty.
            await sorted_map.remove(context, keys=list(full.keys()))
            await self.assert_range({}, sorted_map, context)

            # Restore from the export.
            await export_import_client.do_import(
                export_import_stub,
                directory,
                admin_token=TEST_SECRET_REBOOT_ADMIN_TOKEN,
            )

            # Confirm full.
            await self.assert_range(full, sorted_map, context)

    async def test_overriding_auth(self) -> None:
        """
        Override library authorization.
        """
        authorizer = SortedMap.Authorizer(
            insert=allow(),
            get=deny(),
        )
        await self.rbt.up(
            Application(
                servicers=[SortedMapConsumer],
                libraries=[sorted_map_library(authorizer)],
            ),
            local_envoy=True,
            local_envoy_tls=True,  # For TLS/SSL test coverage.
        )

        # Expect to be able to insert even with `app_internal=False`.
        context = self.rbt.create_external_context(
            name=f"test-{self.id()}-external",
            app_internal=False,
        )
        sorted_map = SortedMap.ref(self.id())
        await sorted_map.insert(
            context,
            entries={"a": b"1"},
        )

        # Expect to not be able to get even with `app_internal=True`.
        context = self.rbt.create_external_context(
            name=f"test-{self.id()}-internal",
            app_internal=True,
        )
        sorted_map = SortedMap.ref(self.id())
        with self.assertRaises(SortedMap.GetAborted) as aborted:
            await sorted_map.get(context, key="a")

        # TODO: we'd prefer for this to be an `Unauthenticated` error,
        #       but there are snags that prevent that; see discussion at
        #         https://github.com/reboot-dev/mono/pull/4601#issuecomment-2989091840
        self.assertEqual(type(aborted.exception.error), PermissionDenied)

    async def test_servicers_back_compat(self) -> None:
        """
        Test that we can start up `Application` with its `servicers()`.
        """
        await self.rbt.up(
            Application(servicers=[SortedMapConsumer] + servicers()),
            local_envoy=True,
            local_envoy_tls=True,  # For TLS/SSL test coverage.
        )

        sorted_map, context = self.map()
        full = {"b": b"1"}

        await sorted_map.insert(
            context,
            entries=full,
        )

        get_response = await sorted_map.get(context, key="b")
        self.assertEqual(b"1", get_response.value)


if __name__ == '__main__':
    unittest.main()
