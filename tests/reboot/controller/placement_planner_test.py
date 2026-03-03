import asyncio
import grpc
import multiprocessing
import reboot.controller.shards
import unittest
import unittest.mock
from google.protobuf.descriptor_pb2 import FileDescriptorSet
from multiprocessing import forkserver
from rbt.v1alpha1 import (
    application_config_pb2,
    placement_planner_pb2,
    placement_planner_pb2_grpc,
)
from rbt.v1alpha1.database_pb2 import ShardInfo
from reboot.aio.types import (
    ApplicationId,
    RevisionNumber,
    ServerId,
    ServiceName,
    StateRef,
    StateTypeName,
)
from reboot.controller.application_config import (
    ApplicationConfig,
    LocalApplicationConfig,
)
from reboot.controller.application_config_trackers import (
    LocalApplicationConfigTracker,
)
from reboot.controller.placement_planner import PlacementPlanner
from reboot.controller.server_managers import FakeServerManager
from reboot.controller.servers import ServerSpec
from tests.reboot.settings import REBOOT_VERSION_BEFORE_SHARDED_DATABASE
from tests.reboot.test_helpers import get_descriptor_set

APPLICATION_ID = ApplicationId('some-app-id')
REVISION_NUMBER = RevisionNumber(7)
STATE_TYPE_1 = StateTypeName('StateTypeName1')
SERVICE_NAME_1 = ServiceName('ServiceName1Methods')
SERVICE_1_ACTOR_ID = StateRef.from_id(STATE_TYPE_1, 'N/A')
STATE_TYPE_2 = StateTypeName('StateTypeName2')
SERVICE_NAME_2 = ServiceName('ServiceName2Methods')
SERVICE_2_ACTOR_ID = StateRef.from_id(STATE_TYPE_2, 'N/A')

# In our tests we'll reduce the number of shards to just 4.
SHARD_0_ID = "s000000000"
SHARD_0_FIRST_KEY = b""
SHARD_1_ID = "s000000001"
SHARD_1_FIRST_KEY = b"\x40"
SHARD_2_ID = "s000000002"
SHARD_2_FIRST_KEY = b"\x80"
SHARD_3_ID = "s000000003"
SHARD_3_FIRST_KEY = b"\xC0"

# For use in single-server applications.
ONLY_SERVER_ID = APPLICATION_ID + "-c000000"
ONLY_SERVER_HOST = FakeServerManager.hostname_for_server(ONLY_SERVER_ID)
ONLY_SERVER_PORT = FakeServerManager.first_port()

# For use in multi-server applications.
FIRST_SERVER_ID = APPLICATION_ID + "-c000000"
FIRST_SERVER_HOST = FakeServerManager.hostname_for_server(FIRST_SERVER_ID)
FIRST_SERVER_PORT = FakeServerManager.first_port()
SECOND_SERVER_ID = APPLICATION_ID + "-c000001"
SECOND_SERVER_HOST = FakeServerManager.hostname_for_server(SECOND_SERVER_ID)
SECOND_SERVER_PORT = FakeServerManager.first_port() + 1

CONTAINER_IMAGE_NAME = 'container_image_name'


class TestPlacementPlanner(unittest.IsolatedAsyncioTestCase):

    # The file descriptor set can't be loaded until the process is ready to fork
    # processes, so we load it only once we're setting up the test class.
    FILE_DESCRIPTOR_SET: FileDescriptorSet
    SINGLE_SERVER_APPLICATION_CONFIG: ApplicationConfig
    SINGLE_SERVER_EXPECTED_SERVERS: dict[ServerId, ServerSpec]
    SINGLE_SERVER_EXPECTED_PLAN_WITH_SERVERS: placement_planner_pb2.ListenForPlanResponse
    TWO_SERVERS_APPLICATION_CONFIG: ApplicationConfig
    TWO_SERVERS_EXPECTED_SERVERS: dict[ServerId, ServerSpec]

    @classmethod
    def setUpClass(cls):
        # To keep the number of shards reasonable per test, we reduce it
        # here.
        original_num_shards = reboot.controller.shards.NUM_SHARDS
        reboot.controller.shards.NUM_SHARDS = 4
        cls.addClassCleanup(
            setattr,
            reboot.controller.shards,
            'NUM_SHARDS',
            original_num_shards,
        )

        # We aren't testing validation here, so we don't need a Reboot service
        # for our FileDescriptorSet - we just need something that will serialize
        # and deserialize correctly.
        #
        # Do this only once at the module level, and synchronously, because the
        # following method will block for ~1.5 seconds (!).
        cls.FILE_DESCRIPTOR_SET = get_descriptor_set(
            'rbt.v1alpha1.application_config_pb2'
        )

        cls.SINGLE_SERVER_APPLICATION_CONFIG = LocalApplicationConfig(
            # Lack of namespace implies that we are looking at local routing.
            # ISSUE(https://github.com/reboot-dev/mono/issues/1451): Expand
            # or add to placement_planner_test.py to cover the non-local case.
            application_id=APPLICATION_ID,
            spec=application_config_pb2.ApplicationConfig.Spec(
                revision_number=REVISION_NUMBER,
                reboot_version=REBOOT_VERSION_BEFORE_SHARDED_DATABASE,
                file_descriptor_set=cls.FILE_DESCRIPTOR_SET.SerializeToString(
                ),
                container_image_name=CONTAINER_IMAGE_NAME,
                service_names=[SERVICE_NAME_1, SERVICE_NAME_2],
                states=[
                    application_config_pb2.ApplicationConfig.Spec.State(
                        state_type_full_name=STATE_TYPE_1,
                        service_full_names=[SERVICE_NAME_1],
                    ),
                    application_config_pb2.ApplicationConfig.Spec.State(
                        state_type_full_name=STATE_TYPE_2,
                        service_full_names=[SERVICE_NAME_2],
                    ),
                ],
                replicas=1,
                servers=1,
            )
        )

        cls.SINGLE_SERVER_EXPECTED_SERVERS = {
            ONLY_SERVER_ID:
                ServerSpec(
                    id=ONLY_SERVER_ID,
                    replica_index=0,
                    shards=[
                        ShardInfo(
                            shard_id=SHARD_0_ID,
                            shard_first_key=SHARD_0_FIRST_KEY
                        ),
                        ShardInfo(
                            shard_id=SHARD_1_ID,
                            shard_first_key=SHARD_1_FIRST_KEY
                        ),
                        ShardInfo(
                            shard_id=SHARD_2_ID,
                            shard_first_key=SHARD_2_FIRST_KEY
                        ),
                        ShardInfo(
                            shard_id=SHARD_3_ID,
                            shard_first_key=SHARD_3_FIRST_KEY
                        ),
                    ],
                    container_image_name=CONTAINER_IMAGE_NAME,
                    service_names=[SERVICE_NAME_1, SERVICE_NAME_2],
                    file_descriptor_set=cls.FILE_DESCRIPTOR_SET,
                    application_id=APPLICATION_ID,
                    revision_number=REVISION_NUMBER,
                    reboot_version=REBOOT_VERSION_BEFORE_SHARDED_DATABASE,
                )
        }

        cls.SINGLE_SERVER_EXPECTED_PLAN_WITH_SERVERS = placement_planner_pb2.ListenForPlanResponse(
            plan=placement_planner_pb2.Plan(
                applications=[
                    placement_planner_pb2.Plan.Application(
                        id=APPLICATION_ID,
                        services=[
                            placement_planner_pb2.Plan.Application.Service(
                                full_name=SERVICE_NAME_1,
                                state_type_full_name=STATE_TYPE_1,
                            ),
                            placement_planner_pb2.Plan.Application.Service(
                                full_name=SERVICE_NAME_2,
                                state_type_full_name=STATE_TYPE_2,
                            )
                        ],
                        shards=[
                            placement_planner_pb2.Plan.Application.Shard(
                                id=SHARD_0_ID,
                                server_id=ONLY_SERVER_ID,
                                range=placement_planner_pb2.Plan.Application.
                                Shard.KeyRange(first_key=SHARD_0_FIRST_KEY),
                            ),
                            placement_planner_pb2.Plan.Application.Shard(
                                id=SHARD_1_ID,
                                server_id=ONLY_SERVER_ID,
                                range=placement_planner_pb2.Plan.Application.
                                Shard.KeyRange(first_key=SHARD_1_FIRST_KEY),
                            ),
                            placement_planner_pb2.Plan.Application.Shard(
                                id=SHARD_2_ID,
                                server_id=ONLY_SERVER_ID,
                                range=placement_planner_pb2.Plan.Application.
                                Shard.KeyRange(first_key=SHARD_2_FIRST_KEY),
                            ),
                            placement_planner_pb2.Plan.Application.Shard(
                                id=SHARD_3_ID,
                                server_id=ONLY_SERVER_ID,
                                range=placement_planner_pb2.Plan.Application.
                                Shard.KeyRange(first_key=SHARD_3_FIRST_KEY),
                            ),
                        ],
                    ),
                ],
            ),
            servers=[
                placement_planner_pb2.Server(
                    id=ONLY_SERVER_ID,
                    application_id=APPLICATION_ID,
                    revision_number=REVISION_NUMBER,
                    address=placement_planner_pb2.Server.Address(
                        host=ONLY_SERVER_HOST,
                        port=ONLY_SERVER_PORT,
                    ),
                    file_descriptor_set=cls.FILE_DESCRIPTOR_SET,
                    reboot_version=REBOOT_VERSION_BEFORE_SHARDED_DATABASE,
                ),
            ],
        )

        cls.TWO_SERVERS_APPLICATION_CONFIG = LocalApplicationConfig(
            # Lack of namespace implies that we are looking at local routing.
            # ISSUE(https://github.com/reboot-dev/mono/issues/1451): Expand
            # or add to placement_planner_test.py to cover the non-local case.
            application_id=APPLICATION_ID,
            spec=application_config_pb2.ApplicationConfig.Spec(
                revision_number=REVISION_NUMBER,
                reboot_version=REBOOT_VERSION_BEFORE_SHARDED_DATABASE,
                file_descriptor_set=cls.FILE_DESCRIPTOR_SET.SerializeToString(
                ),
                container_image_name=CONTAINER_IMAGE_NAME,
                service_names=[SERVICE_NAME_1, SERVICE_NAME_2],
                states=[
                    application_config_pb2.ApplicationConfig.Spec.State(
                        state_type_full_name=STATE_TYPE_1,
                        service_full_names=[SERVICE_NAME_1],
                    ),
                    application_config_pb2.ApplicationConfig.Spec.State(
                        state_type_full_name=STATE_TYPE_2,
                        service_full_names=[SERVICE_NAME_2],
                    ),
                ],
                replicas=1,
                servers=2,
            )
        )

        cls.TWO_SERVERS_EXPECTED_SERVERS = {
            FIRST_SERVER_ID:
                ServerSpec(
                    id=FIRST_SERVER_ID,
                    replica_index=0,
                    shards=[
                        ShardInfo(
                            shard_id=SHARD_0_ID,
                            shard_first_key=SHARD_0_FIRST_KEY
                        ),
                        ShardInfo(
                            shard_id=SHARD_2_ID,
                            shard_first_key=SHARD_2_FIRST_KEY
                        ),
                    ],
                    container_image_name=CONTAINER_IMAGE_NAME,
                    service_names=[SERVICE_NAME_1, SERVICE_NAME_2],
                    file_descriptor_set=cls.FILE_DESCRIPTOR_SET,
                    application_id=APPLICATION_ID,
                    revision_number=REVISION_NUMBER,
                    reboot_version=REBOOT_VERSION_BEFORE_SHARDED_DATABASE,
                ),
            SECOND_SERVER_ID:
                ServerSpec(
                    id=SECOND_SERVER_ID,
                    replica_index=0,
                    shards=[
                        ShardInfo(
                            shard_id=SHARD_1_ID,
                            shard_first_key=SHARD_1_FIRST_KEY
                        ),
                        ShardInfo(
                            shard_id=SHARD_3_ID,
                            shard_first_key=SHARD_3_FIRST_KEY
                        ),
                    ],
                    container_image_name=CONTAINER_IMAGE_NAME,
                    service_names=[SERVICE_NAME_1, SERVICE_NAME_2],
                    file_descriptor_set=cls.FILE_DESCRIPTOR_SET,
                    application_id=APPLICATION_ID,
                    revision_number=REVISION_NUMBER,
                    reboot_version=REBOOT_VERSION_BEFORE_SHARDED_DATABASE,
                ),
        }

    async def asyncSetUp(self) -> None:
        self.maxDiff = None

        # Mock time_ns (which we use to generate plan version) so that our Plans
        # are fully predictable.
        self.current_version = 1
        self.time_patch = unittest.mock.patch(
            'time.time_ns',
            unittest.mock.MagicMock(return_value=self.current_version)
        )
        self.time_mock = self.time_patch.start()

        self.server_manager = FakeServerManager()
        self.application_config_tracker = LocalApplicationConfigTracker()

        self.placement_planner = PlacementPlanner(
            self.application_config_tracker,
            self.server_manager,
            '0.0.0.0:0',
        )
        await self.placement_planner.start()

    def _advance_time(self):
        # Whenever we make a new plan, we need to set the patched time
        # value to something later than the previous one - otherwise, the
        # PlanMaker will detect that time is not moving sequentially and throw
        # an error.
        self.current_version += 1
        self.time_mock.return_value = self.current_version

    async def add_application_config(
        self,
        application_config: ApplicationConfig,
        advance_time: bool = True,
    ):
        if advance_time:
            self._advance_time()
        await self.application_config_tracker.add_config(application_config)

    def tearDown(self):
        self.time_patch.stop()

    async def asyncTearDown(self):
        await self.placement_planner.stop()

    def with_expected_version(
        self,
        response: placement_planner_pb2.ListenForPlanResponse,
    ):
        versioned_response = placement_planner_pb2.ListenForPlanResponse()
        versioned_response.CopyFrom(response)
        # We generate the expected plan before the new plan-making is
        # triggered, so we expect the version to be one higher than the
        # current version.
        versioned_response.plan.version = self.current_version + 1
        return versioned_response

    #################### TESTS ####################

    async def test_basic(self):
        """Test that initial PlacementPlanner creation includes initial plan
        generation."""
        await self.add_application_config(
            self.SINGLE_SERVER_APPLICATION_CONFIG
        )
        # Verify that the server manager was called.
        self.assertEqual(1, len(self.server_manager.servers))
        only_server = next(iter(self.server_manager.servers.values()))
        self.assertEqual(
            4,
            len(only_server.shards),
            only_server.shards,
        )
        self.assertEqual(
            self.server_manager.servers, self.SINGLE_SERVER_EXPECTED_SERVERS
        )

    async def test_basic_two_replicas(self):
        """Test that initial PlacementPlanner creation includes initial plan
        generation."""
        await self.add_application_config(self.TWO_SERVERS_APPLICATION_CONFIG)
        # Verify that the server manager was called.
        self.assertEqual(
            self.server_manager.servers, self.TWO_SERVERS_EXPECTED_SERVERS
        )

    async def test_make_plan_fails_with_duplicate_timestamp(self):
        """Test that plan creation will fail if we get non-sequential timestamps
        (in this case, the same timestamp twice in a row) when trying to use
        the current time."""
        with self.assertRaises(RuntimeError):
            await self.add_application_config(
                self.SINGLE_SERVER_APPLICATION_CONFIG,
                advance_time=False,
            )

    async def test_serves_plan_with_servers(self):
        """Test that plan listeners are notified when a new plan is created,
        and that the PlacementPlanner creates and cleans up listener queues
        correctly as listeners enter and exit."""

        # Set up 2 plan listener tasks so that something is listening for new
        # plans and checking that they match the expected response. The first
        # (initial) plan is expected to be empty.
        expected_response = placement_planner_pb2.ListenForPlanResponse(
            plan=placement_planner_pb2.Plan(version=1),
        )

        async def plan_listener(expected_response_count: int):
            async with grpc.aio.insecure_channel(
                f'127.0.0.1:{self.placement_planner.port()}'
            ) as channel:
                stub = placement_planner_pb2_grpc.PlacementPlannerStub(channel)
                request = placement_planner_pb2.ListenForPlanRequest()
                response_count = 0
                async for response in stub.ListenForPlan(request):
                    self.assertEqual(
                        response, expected_response,
                        f"expected:\n---\n{str(expected_response)}\n---\ngot:\n---\n{str(response)}---"
                    )
                    response_count += 1
                    if response_count == expected_response_count:
                        break

        # Start 2 different listeners that will listen for different numbers of
        # plans.
        plan_listener_tasks = [
            asyncio.create_task(plan_listener(1)),
            asyncio.create_task(plan_listener(2))
        ]
        # Yield the event loop to give the listeners a chance to start up.
        await asyncio.sleep(0.1)

        # The server should have 2 listeners registered with pubsub queues.
        self.assertEqual(len(self.placement_planner.listener_queues), 2)

        # The first listener should exit after the initial plan is served.
        await plan_listener_tasks[0]

        # Now create a new plan.
        expected_response = self.with_expected_version(
            self.SINGLE_SERVER_EXPECTED_PLAN_WITH_SERVERS
        )
        await self.add_application_config(
            self.SINGLE_SERVER_APPLICATION_CONFIG
        )

        # The second listener has seen 2 plans and should now exit.
        await plan_listener_tasks[1]

        # TODO(rjh): consider ways of reliably testing that listeners get
        #            cleaned up when callers close their connection.

    async def test_redundant_servicers(self):
        """Test correct behavior if the service name is reused within an
        application.
        """
        serialized_file_descriptor_set = self.FILE_DESCRIPTOR_SET.SerializeToString(
        )

        await self.add_application_config(
            LocalApplicationConfig(
                # Lack of namespace implies that we are looking at local routing.
                # ISSUE(https://github.com/reboot-dev/mono/issues/1451): Expand
                # or add to placement_planner_test.py to cover the non-local case.
                application_id=ApplicationId(APPLICATION_ID + '-first'),
                spec=application_config_pb2.ApplicationConfig.Spec(
                    revision_number=REVISION_NUMBER,
                    file_descriptor_set=serialized_file_descriptor_set,
                    container_image_name=CONTAINER_IMAGE_NAME,
                    service_names=[
                        # Add Service name multiple times for the purpose of
                        # the test.
                        SERVICE_NAME_1,
                        SERVICE_NAME_1,
                        SERVICE_NAME_1,
                        SERVICE_NAME_1,
                        SERVICE_NAME_1,
                    ],
                    states=[
                        application_config_pb2.ApplicationConfig.Spec.State(
                            state_type_full_name=STATE_TYPE_1,
                            service_full_names=[
                                # Add Service name multiple times for the purpose of
                                # the test.
                                SERVICE_NAME_1,
                                SERVICE_NAME_1,
                                SERVICE_NAME_1,
                                SERVICE_NAME_1,
                                SERVICE_NAME_1,
                            ],
                        ),
                    ],
                    replicas=1,  # Irrelevant to this test.
                    servers=1,  # Irrelevant to this test.
                )
            )
        )

        # Verify that the current plan only contains the service once.
        assert self.placement_planner.current_plan_with_servers is not None
        plan: placement_planner_pb2.Plan = self.placement_planner.current_plan_with_servers.plan

        self.assertEqual(len(plan.applications), 1)
        self.assertEqual(len(plan.applications[0].services), 1)

    async def test_add_multiple_configs_with_same_servicers(self):
        """Test that we can run the same service in different applications."""

        serialized_file_descriptor_set = self.FILE_DESCRIPTOR_SET.SerializeToString(
        )

        await self.add_application_config(
            LocalApplicationConfig(
                application_id=ApplicationId(APPLICATION_ID + '-first'),
                spec=application_config_pb2.ApplicationConfig.Spec(
                    revision_number=REVISION_NUMBER,
                    file_descriptor_set=serialized_file_descriptor_set,
                    container_image_name=CONTAINER_IMAGE_NAME,
                    service_names=[SERVICE_NAME_1, SERVICE_NAME_2],
                    states=[
                        application_config_pb2.ApplicationConfig.Spec.State(
                            state_type_full_name=STATE_TYPE_1,
                            service_full_names=[SERVICE_NAME_1],
                        ),
                        application_config_pb2.ApplicationConfig.Spec.State(
                            state_type_full_name=STATE_TYPE_2,
                            service_full_names=[SERVICE_NAME_2],
                        ),
                    ],
                    replicas=1,  # Irrelevant to this test.
                    servers=1,  # Irrelevant to this test.
                ),
            )
        )

        # Add a second application config with the same servicer. This should
        # work now, as two different applications are allowed to run the same
        # servicers.
        await self.add_application_config(
            LocalApplicationConfig(
                application_id=ApplicationId(APPLICATION_ID + '-second'),
                spec=application_config_pb2.ApplicationConfig.Spec(
                    revision_number=REVISION_NUMBER,
                    file_descriptor_set=serialized_file_descriptor_set,
                    container_image_name=CONTAINER_IMAGE_NAME + '-second',
                    service_names=[SERVICE_NAME_1],
                    states=[
                        application_config_pb2.ApplicationConfig.Spec.State(
                            state_type_full_name=STATE_TYPE_1,
                            service_full_names=[SERVICE_NAME_1],
                        ),
                    ],
                    replicas=1,  # Irrelevant to this test.
                    servers=1,  # Irrelevant to this test.
                )
            ),
        )

        # Verify that the current plan contains three service plans, two for the
        # first application and one for the second.
        assert self.placement_planner.current_plan_with_servers is not None
        plan: placement_planner_pb2.Plan = self.placement_planner.current_plan_with_servers.plan

        # We should have 2 applications, with one and two services.
        self.assertEqual(
            {
                APPLICATION_ID + "-first": [SERVICE_NAME_1, SERVICE_NAME_2],
                APPLICATION_ID + "-second": [SERVICE_NAME_1],
            },
            {
                application.id:
                    [service.full_name for service in application.services]
                for application in plan.applications
            },
        )


if __name__ == '__main__':
    # `get_descriptor_set` might import multiple pb2 modules that define
    # variants of the same proto service (`echo_original_pb2` and
    # `echo_replay_deleted_pb2`). Python's protobuf adds all pb2
    # imports to a single global descriptor pool, so importing both
    # in the same process would cause descriptor conflicts. We use
    # `multiprocessing` (via `get_descriptor_set()`) to import each
    # pb2 in an isolated subprocess.
    #
    # The `forkserver` start method must be initialized early,
    # before any other threads are started, to avoid issues with
    # forking after threads have started.
    # See https://bugs.python.org/issue43285.
    multiprocessing.set_start_method('forkserver')
    forkserver.ensure_running()
    unittest.main()
