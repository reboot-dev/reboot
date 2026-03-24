import grpc
import json
import tempfile
import unittest
import uuid
from collections import defaultdict
from dataclasses import dataclass
from log.log import get_logger
from pathlib import Path
from rbt.v1alpha1 import tasks_pb2, tasks_pb2_grpc
from rbt.v1alpha1.admin import export_import_pb2_grpc
from reboot.admin import export_import_client
from reboot.aio.applications import Application
from reboot.aio.external import ExternalContext
from reboot.aio.headers import AUTHORIZATION_HEADER
from reboot.aio.secrets import MockSecretSource, Secrets
from reboot.aio.tests import Reboot
from reboot.aio.types import StateRef, StateTypeName
from reboot.settings import ADMIN_SECRET_NAME
from reboot.ssl.localhost import LOCALHOST_CRT_DATA
from tests.reboot.echo_rbt import Echo
from tests.reboot.echo_servicers import MyEchoServicer
from typing import Any, Optional

logger = get_logger(__name__)

TEST_ADMIN_SECRET = 'test-admin-secret'


@dataclass
class ExpectedExportImportItems:
    state: Optional[dict[str, Any]] = None
    task_count: int = 0
    idempotent_mutation_count: int = 0


class ExportImportTestCase(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self) -> None:
        Secrets.set_secret_source(
            MockSecretSource({ADMIN_SECRET_NAME: TEST_ADMIN_SECRET.encode()})
        )

        self.maxDiff = None
        self.rbt: Optional[Reboot] = None

    async def asyncTearDown(self) -> None:
        if self.rbt is not None:
            await self.rbt.stop()
            self.rbt = None

    async def start(
        self, *, servers: int
    ) -> tuple[ExternalContext, export_import_pb2_grpc.ExportImportStub]:
        assert self.rbt is None
        self.rbt = Reboot()
        await self.rbt.start()
        await self.rbt.up(
            Application(servicers=[MyEchoServicer]),
            local_envoy=True,
            local_envoy_tls=True,  # For SSL/TLS test coverage.
            servers=servers,
        )

        context = self.rbt.create_external_context(name=self.id())
        channel = grpc.aio.secure_channel(
            self.rbt.localhost_direct_endpoint(),
            grpc.ssl_channel_credentials(
                root_certificates=LOCALHOST_CRT_DATA,
            )
        )
        stub = export_import_pb2_grpc.ExportImportStub(channel)
        return context, stub

    async def stop(self) -> None:
        assert self.rbt is not None
        await self.rbt.stop()
        self.rbt = None

    def _assert_contents(
        self,
        directory: Path,
        expected: dict[StateTypeName, dict[StateRef,
                                           ExpectedExportImportItems]],
    ) -> None:
        actual: dict[StateTypeName,
                     dict[StateRef, ExpectedExportImportItems]] = defaultdict(
                         lambda: defaultdict(ExpectedExportImportItems)
                     )
        for path in directory.iterdir():
            for line in path.read_text().splitlines():
                item = json.loads(line)
                state_type_name = StateTypeName(item['state_type'])
                state_ref = StateRef(item['state_ref'])

                expected_export_import_items = actual[state_type_name][
                    state_ref]
                if item.get('state') is not None:
                    self.assertIsNone(expected_export_import_items.state)
                    expected_export_import_items.state = item['state']
                elif item.get('task') is not None:
                    expected_export_import_items.task_count += 1
                else:
                    assert item.get('idempotent_mutation') is not None
                    expected_export_import_items.idempotent_mutation_count += 1

        state_type_name = StateTypeName('tests.reboot.Echo')
        actual_content = actual.get(state_type_name, {})
        expected_content = expected.get(state_type_name, {})
        self.assertEqual(
            actual, expected, f"\n\n{actual_content}\n\n{expected_content}"
        )

    async def _do_test(self, *, servers: int) -> None:
        # Start an application with one name.
        context, stub = await self.start(servers=servers)

        # When there are no states, we expect that `export` creates empty files.
        with tempfile.TemporaryDirectory() as d:
            directory = Path(d)
            await export_import_client.do_export(
                stub,
                directory,
                admin_token=TEST_ADMIN_SECRET,
            )
            self.assertTrue(any(directory.iterdir()))
            self._assert_contents(directory, {})

        # When we create states, we expect them all to show up in `export`.
        messages_by_state_ref = {
            StateRef.from_id(StateTypeName('tests.reboot.Echo'), state_id):
                f'Hello, {state_id}' for state_id in ["a", "b", "c", "d", "e"]
        }
        idempotency_keys = []
        task_ids = []
        for state_ref, message in messages_by_state_ref.items():
            echo = Echo.ref(state_ref.id)
            # Create a state with idempotently.
            idempotency_key = uuid.uuid4()
            idempotency_keys.append(idempotency_key)
            response = await echo.idempotently(
                key=idempotency_key
            ).Reply(context, message=message)
            self.assertEqual(message, response.message)
            # Then additionally spawn a task that will run forever.
            task = await echo.spawn().Hanging(context)
            task_ids.append(task.task_id)

        # `export` immediately shows the expected states.
        export_directory = tempfile.TemporaryDirectory()
        directory = Path(export_directory.name)
        await export_import_client.do_export(
            stub, directory, admin_token=TEST_ADMIN_SECRET
        )
        self._assert_contents(
            directory,
            {
                StateTypeName('tests.reboot.Echo'):
                    {
                        state_ref:
                            ExpectedExportImportItems(
                                {'messages': [message]},
                                task_count=1,
                                # Two idempotent mutations:
                                # 1. The call to `Reply`.
                                # 2. The spawning of `Hanging`.
                                idempotent_mutation_count=2,
                            )
                        for state_ref, message in messages_by_state_ref.items()
                    },
            },
        )

        # Take the application down, re-launch it with, and confirm that
        # it is empty.
        await self.stop()
        context, stub = await self.start(servers=servers)
        with self.assertRaises(Exception) as exc:
            await Echo.ref(
                list(messages_by_state_ref.keys())[0].id,
            ).Replay(context)
        self.assertIn("StateNotConstructed", str(exc.exception))

        # Then import the previously exported data, and validate that it is
        # accessible.
        await export_import_client.do_import(
            stub,
            directory,
            admin_token=TEST_ADMIN_SECRET,
        )
        for (state_ref, message), idempotency_key, task_id in zip(
            messages_by_state_ref.items(), idempotency_keys, task_ids
        ):
            echo = Echo.ref(state_ref.id)
            # Our state should be valid.
            response = await echo.Replay(context)
            self.assertEqual([message], response.messages)

            # Our idempotent mutation should prevent re-calling.
            response = await echo.idempotently(
                key=idempotency_key
            ).Reply(context, message=message)
            self.assertEqual(message, response.message)
            response = await echo.Replay(context)
            self.assertEqual([message], response.messages)

            # And our task should still be pending.
            channel = context.channel_manager.get_channel_to_state(
                StateTypeName(task_id.state_type),
                StateRef(task_id.state_ref),
            )
            tasks_stub = tasks_pb2_grpc.TasksStub(channel)
            list_tasks_response = await tasks_stub.ListTasks(
                tasks_pb2.ListTasksRequest(),
                metadata=(
                    (AUTHORIZATION_HEADER, f'Bearer {TEST_ADMIN_SECRET}'),
                ),
            )

            self.assertTrue(
                any(
                    task_id == task.task_id
                    for task in list_tasks_response.tasks
                )
            )

    async def test_single_server(self) -> None:
        await self._do_test(servers=1)

    async def test_multiple_servers(self) -> None:
        await self._do_test(servers=4)


if __name__ == '__main__':
    unittest.main()
