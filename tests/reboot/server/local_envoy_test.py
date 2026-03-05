import aiohttp
import asyncio
import grpc.aio
import h2.config
import h2.connection
import h2.events
import json
import os
import random
import socket
import string
import unittest
from google.protobuf.struct_pb2 import Struct
from reboot.aio.applications import Application
from reboot.aio.auth.authorizers import allow
from reboot.aio.contexts import ReaderContext, WriterContext
from reboot.aio.external import ExternalContext
from reboot.aio.headers import SERVER_ID_HEADER
from reboot.aio.interceptors import LegacyGrpcContext
from reboot.aio.tests import Reboot
from reboot.aio.types import StateRef
from reboot.settings import ENVVAR_LOCAL_ENVOY_DEBUG
from reboot.ssl.localhost import LOCALHOST_CRT_DATA
from tests.reboot.general_pb2_grpc import (
    LegacyGeneralServicer,
    LegacyGeneralStub,
)
from tests.reboot.general_servicer import (
    General,
    GeneralRequest,
    GeneralResponse,
    GeneralServicer,
)


class IdentifierServicer(GeneralServicer):
    """
    An implementation of `General` that always returns the ID stored in the
    servicer object doing the talking, which acts as a unique ID that identifies
    the server (user code doesn't have the actual server ID available).
    This allows the calling test to determine whether it's talking to the same
    server across different calls. If there were routing mistakes that would
    cause split-brain scenarios, this would be a good way to detect them.

    Also echos back the headers it gets on the request, so that the caller can
    inspect the modifications made to those headers along the request path.
    """

    def __init__(self):
        super().__init__()
        self._myid = str(random.randint(0, 100000000000))

    def authorizer(self):
        return allow()

    async def ConstructorWriter(
        self,
        context: WriterContext,
        state: General.State,
        request: GeneralRequest,
    ) -> GeneralResponse:
        content = state.content
        # Report this servicer's unique ID (i.e. roughly: what server is
        # answering?).
        content["id"] = self._myid
        # Echo back the server header seen on the request.
        content[SERVER_ID_HEADER] = context._headers.server_id
        return GeneralResponse(content=content)

    async def Reader(
        self,
        context: ReaderContext,
        state: General.State,
        request: GeneralRequest,
    ) -> GeneralResponse:
        content = Struct()
        # Report this servicer's unique ID (i.e. rougly: what server is
        # answering?).
        content["id"] = self._myid
        # Echo back the server header seen on the request.
        content[SERVER_ID_HEADER] = context._headers.server_id
        return GeneralResponse(content=content)


class LegacyIdentifierServicer(LegacyGeneralServicer):
    """
    Ditto to `IdentifierServicer`, but as a legacy gRPC servicer.
    """

    def __init__(self):
        super().__init__()
        self._myid = str(random.randint(0, 100000000000))

    async def LegacyCall(
        self,
        request: GeneralRequest,
        context: LegacyGrpcContext,
    ) -> GeneralResponse:
        content = Struct()
        # Report this servicer's unique ID (i.e. rougly: what server is
        # answering?).
        content["id"] = self._myid
        # Echo back the server header seen on the request.
        content[SERVER_ID_HEADER] = next(
            h[1]
            for h in context.invocation_metadata()
            if h[0] == SERVER_ID_HEADER
        )
        return GeneralResponse(content=content)


class LocalEnvoyTestCase(unittest.IsolatedAsyncioTestCase):

    async def test_server_filter(self):
        # Output debug information from our local Envoy, so that if this
        # test fails we have all necessary debug logs available.
        os.environ[ENVVAR_LOCAL_ENVOY_DEBUG] = 'true'

        rbt = Reboot()
        await rbt.start()
        self.addAsyncCleanup(rbt.stop)

        revision = await rbt.up(
            Application(
                servicers=[IdentifierServicer],
                legacy_grpc_servicers=[LegacyIdentifierServicer],
            ),
            local_envoy=True,
            local_envoy_tls=True,  # For SSL/TLS test coverage.
            servers=2,
        )
        endpoint = rbt.localhost_direct_endpoint()

        # If we manually set an `x-reboot-server-id` header, it is obeyed.
        channel = grpc.aio.secure_channel(
            endpoint,
            grpc.ssl_channel_credentials(
                root_certificates=LOCALHOST_CRT_DATA,
            )
        )
        stub = LegacyGeneralStub(channel)
        seen_ids = set()
        headers = (
            (SERVER_ID_HEADER, f'{revision.config.application_id()}-c000000'),
        )
        for i in range(30):
            response = await stub.LegacyCall(
                GeneralRequest(), metadata=headers
            )
            server_id = response.content[SERVER_ID_HEADER]
            seen_ids.add((response.content["id"], server_id))
        self.assertEqual(
            1, len(seen_ids),
            "pre-set server header is not being obeyed: multiple servicers are "
            "answering requests for server 'c000000'"
        )

        # Requests for (currently) unknown servers are rejected with a
        # retryable error code.
        with self.assertRaises(grpc.aio.AioRpcError) as e:
            headers = ((SERVER_ID_HEADER, 'my-illegal-server'),)
            response = await stub.LegacyCall(
                GeneralRequest(), metadata=headers
            )
        self.assertEqual(grpc.StatusCode.UNAVAILABLE, e.exception.code())
        self.assertEqual(
            "Unknown server 'my-illegal-server'", str(e.exception.details())
        )

        # Legacy gRPC calls without a server header are routed randomly, so
        # the same call when repeated can/should go to any servers.
        channel = grpc.aio.secure_channel(
            endpoint,
            grpc.ssl_channel_credentials(root_certificates=LOCALHOST_CRT_DATA)
        )
        stub = LegacyGeneralStub(channel)
        seen_ids = set()
        for i in range(30):
            response = await stub.LegacyCall(GeneralRequest())
            server_id = response.content[SERVER_ID_HEADER]
            seen_ids.add((response.content["id"], server_id))
        self.assertNotEqual(
            1, len(seen_ids),
            "random load balancing is not working: odds of 30 random choices "
            "randomly hitting just one server are 1 in 1 trillion"
        )
        self.assertEqual(
            2, len(seen_ids),
            "Envoy's choice of server is not being obeyed: multiple "
            "servicers are serving requests with the same server header"
        )

        # Reboot calls are routed deterministically, so the same call should
        # always go to the same server.
        context = ExternalContext(
            name='test_server_filter',
            url=f"https://{endpoint}",
        )
        await General.ConstructorWriter(context, 'foo')
        seen_ids = set()
        for i in range(30):
            response = await General.ref('foo').Reader(context)
            seen_ids.add(response.content["id"])
        self.assertEqual(1, len(seen_ids))

        # When talking to many different actors, we should see the load spread
        # across all servers.
        seen_ids = set()
        for state_id in string.ascii_lowercase:
            _, response = await General.ConstructorWriter(context, state_id)
            server_id = response.content[SERVER_ID_HEADER]
            seen_ids.add((response.content["id"], server_id))
        self.assertEqual(
            2, len(seen_ids),
            "Envoy's choice of server is not being obeyed; multiple "
            "servicers are serving requests with the same server header"
        )

        # When talking to the same states again, we should go to the same
        # servers again - also when using HTTP calls with human-readable
        # state refs.
        for state_id in string.ascii_lowercase:
            async with aiohttp.ClientSession() as session:
                async with session.request(
                    "POST",
                    f"https://{endpoint}/tests.reboot.GeneralMethods/Reader",
                    headers={
                        'x-reboot-state-ref':
                            'tests.reboot.General:' + state_id,
                    },
                    ssl=False,  # Disables SSL verification; self-signed cert.
                ) as response:
                    self.assertEqual(response.status, 200)
                    self.assertEqual(
                        response.headers['content-type'], 'application/json'
                    )
                    response_json = await response.json()
                    id_server_pair = (
                        response_json['content']['id'],
                        response_json['content'][SERVER_ID_HEADER]
                    )
                    self.assertIn(
                        id_server_pair, seen_ids,
                        "Envoy is not consistently choosing the same server "
                        "for the same state ref"
                    )

        # Sending a request with an illegal state ref should result in a helpful
        # error message.
        async with aiohttp.ClientSession() as session:
            async with session.request(
                "POST",
                f"https://{endpoint}/tests.reboot.GeneralMethods/Reader",
                headers={
                    'x-reboot-state-ref': 'this-is-not-a-state-ref',
                },
                ssl=False,  # Disables SSL verification; self-signed cert.
            ) as response:
                self.assertEqual(response.status, 400)
                self.assertEqual(
                    response.headers['content-type'], 'text/plain'
                )
                response_text = await response.text()
                self.assertIn(
                    "Invalid state reference component "
                    "'this-is-not-a-state-ref': must contain exactly one ':'. "
                    "If your state ID contains slashes ('/'), remember to "
                    "replace them with their escape character: a backslash "
                    "('\\').",
                    response_text,
                )

    async def test_mangled_path_filter(self):
        # Output debug information from our local Envoy, so that if this
        # test fails we have all necessary debug logs available.
        os.environ[ENVVAR_LOCAL_ENVOY_DEBUG] = 'true'

        rbt = Reboot()
        await rbt.start()
        self.addAsyncCleanup(rbt.stop)

        await rbt.up(
            Application(servicers=[IdentifierServicer]),
            local_envoy=True,
            local_envoy_tls=False,  # For plain HTTP test coverage.
            servers=2,
        )
        url = rbt.url()

        context = ExternalContext(name='test_mangled_path_filter', url=url)

        # Run the following 30 times to demonstrate that the right server is
        # reached, and not just by accident.
        for i in range(30):
            state_id = f"foo-{i}"

            general, construct_response = await General.ConstructorWriter(
                context,
                state_id,
            )

            # If we make an HTTP request to the designated HTTP RPC endpoint using
            # the agreed-upon mangling of the path, the necessary headers are
            # synthesized from the path.
            #
            # To address the state type, we SHOULD be able to use a readable version
            # of the state type tag (e.g. `tests.reboot.General:foo`). However, those
            # are getting routed to the wrong server, so we have to convert them
            # into the encoded version before we send the request.
            # ISSUE(https://github.com/reboot-dev/mono/issues/3627).
            state_ref = StateRef.from_maybe_readable(
                f"tests.reboot.General:{state_id}"
            )
            uri = (
                f"{url}/__/reboot/rpc/"
                f"{state_ref.to_str()}/tests.reboot.GeneralMethods/Reader"
            )

            async with aiohttp.ClientSession() as session:
                async with session.request(
                    "POST",
                    uri,
                    ssl=False,  # Disables SSL verification; self-signed cert.
                ) as response:
                    self.assertEqual(response.status, 200)
                    self.assertEqual(
                        response.headers['content-type'], 'application/json'
                    )
                    expect_response = {
                        "content":
                            {
                                "id":
                                    construct_response.content["id"],
                                SERVER_ID_HEADER:
                                    construct_response.
                                    content[SERVER_ID_HEADER],
                            }
                    }
                    self.assertEqual(await response.json(), expect_response)

    async def test_remove_json_trailers_filter(self):
        """
        Tests that JSON responses don't get trailers.

        Regression test for https://github.com/reboot-dev/mono/issues/4833.
        """
        # Output debug information from our local Envoy, so that if this
        # test fails we have all necessary debug logs available.
        os.environ[ENVVAR_LOCAL_ENVOY_DEBUG] = 'true'

        rbt = Reboot()
        await rbt.start()
        self.addAsyncCleanup(rbt.stop)

        await rbt.up(
            Application(servicers=[IdentifierServicer]),
            local_envoy=True,
            # In almost all development and production cases our Envoys
            # do NOT terminate TLS (in `rbt dev` we don't use TLS, in
            # Reboot Cloud it's AWS that does the TLS termination).
            # Check that the filters work in that case too.
            local_envoy_tls=False,
            servers=1,
        )
        context = ExternalContext(
            name='test_remove_json_trailers_filter',
            url=rbt.url(),
        )

        # Create a state to test with.
        await General.ConstructorWriter(context, 'test_state')

        # Use h2 library to make a low-level HTTP/2 request
        # that can distinguish between headers and trailers.
        # This allows us to verify that the
        # 'remove_json_trailers' Envoy filter actually removes
        # HTTP/2 trailer frames.
        endpoint = rbt.url().removeprefix("http://")
        host, port = endpoint.split(':')

        def h2_request():
            """Run blocking socket operations in a
            separate thread to avoid blocking the event
            loop."""
            # Establish connection.
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.connect((host, int(port)))

            # Initialize HTTP/2 connection.
            config = h2.config.H2Configuration(client_side=True)
            conn = h2.connection.H2Connection(config=config)
            conn.initiate_connection()
            sock.sendall(conn.data_to_send())

            # Send request headers.
            h2_headers = [
                (':method', 'POST'),
                (
                    ':path',
                    '/tests.reboot.GeneralMethods/Reader',
                ),
                (':authority', endpoint),
                (':scheme', 'http'),
                ('content-type', 'application/json'),
                (
                    'x-reboot-state-ref',
                    'tests.reboot.General:test_state',
                ),
            ]

            stream_id = conn.get_next_available_stream_id()
            conn.send_headers(stream_id, h2_headers)
            # No body for this request.
            conn.end_stream(stream_id)
            sock.sendall(conn.data_to_send())

            # Receive and process response.
            response_complete = False
            resp_headers = {}
            resp_trailers = {}
            resp_data = b''

            while not response_complete:
                data = sock.recv(1024)
                if not data:
                    break

                events = conn.receive_data(data)
                for event in events:
                    if isinstance(event, h2.events.ResponseReceived):
                        resp_headers = dict(event.headers)
                    elif isinstance(event, h2.events.DataReceived):
                        resp_data += event.data
                    elif isinstance(event, h2.events.TrailersReceived):
                        resp_trailers = dict(event.headers)
                    elif isinstance(event, h2.events.StreamEnded):
                        response_complete = True

            sock.close()
            return resp_headers, resp_trailers, resp_data

        # We execute the blocking socket operations in a separate
        # thread to not block the event loop.
        response_headers, response_trailers, response_data = (
            await asyncio.to_thread(h2_request)
        )

        # Verify response (h2 returns headers as bytes).
        self.assertEqual(response_headers.get(b':status'), b'200')
        self.assertEqual(
            response_headers.get(b'content-type'),
            b'application/json',
        )

        # This is the key test: verify that NO trailers
        # were received. The 'remove_json_trailers' filter
        # should have removed them completely.
        self.assertEqual(
            len(response_trailers),
            0,
            "Expected no HTTP/2 trailers, but received: "
            f"{response_trailers}",
        )

        # Verify we get valid JSON response.
        response_json = json.loads(response_data.decode('utf-8'))
        self.assertIn('content', response_json)
        self.assertIn('id', response_json['content'])

    async def test_trusted_port(self):
        """
        Tests that our local envoy is also reachable on a trusted port.
        """
        # Output debug information from our local Envoy, so that if this
        # test fails we have all necessary debug logs available.
        os.environ[ENVVAR_LOCAL_ENVOY_DEBUG] = 'true'

        rbt = Reboot()
        await rbt.start()
        self.addAsyncCleanup(rbt.stop)

        await rbt.up(
            Application(
                servicers=[IdentifierServicer],
                legacy_grpc_servicers=[LegacyIdentifierServicer],
            ),
            local_envoy=True,
            # Request TLS just to show that even then the socket does
            # NOT use it.
            local_envoy_tls=True,
        )

        endpoint = f"localhost:{rbt.envoy_trusted_port()}"
        # Note: not using a secure channel, i.e. no TLS.
        channel = grpc.aio.insecure_channel(endpoint)
        stub = LegacyGeneralStub(channel)

        response = await stub.LegacyCall(GeneralRequest())
        server_id = response.content[SERVER_ID_HEADER]
        self.assertNotEqual("", server_id)
