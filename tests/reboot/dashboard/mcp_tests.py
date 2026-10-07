"""Exercise the dashboard's MCP resource and bridge against a real backend."""
import base64
import httpx
import json
import unittest
import uuid
from mcp.client.session import ClientSession
from mcp.client.streamable_http import streamable_http_client
from rbt.dashboard.v1.dashboard_pb2 import (
    PreferencesGetRequest,
    PreferencesGetResponse,
    PreferencesSetNavWidthRequest,
)
from rbt.v1alpha1.react_pb2 import (
    MutateRequest,
    MutateResponse,
    QueryRequest,
    QueryResponse,
)
from reboot.aio.tests import Reboot
from reboot.aio.types import StateId, StateRef, StateTypeName
from reboot.dashboard.backend.constants import DASHBOARD_ID
from reboot.dashboard.backend.main import application


def encode(message):
    return base64.b64encode(message.SerializeToString()).decode()


class McpTest(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self) -> None:
        self.rbt = Reboot()
        await self.rbt.start()
        await self.rbt.up(application(), local_envoy=True)

    async def asyncTearDown(self) -> None:
        await self.rbt.stop()

    async def test_dashboard_bridge(self) -> None:
        url = self.rbt.http_localhost_url('/mcp')
        token = await self.rbt.make_valid_oauth_access_token()
        async with httpx.AsyncClient(
            headers={'Authorization': f'Bearer {token}'},
            follow_redirects=True,
        ) as client, streamable_http_client(url, http_client=client
                                           ) as (read, write, _):
            async with ClientSession(read, write) as session:
                await session.initialize()

                async def call(name, **arguments):
                    result = await session.call_tool(name, arguments)
                    self.assertFalse(result.isError, result.content)
                    return json.loads(result.content[0].text)

                tools = {
                    tool.name: tool
                    for tool in (await session.list_tools()).tools
                }
                self.assertEqual(
                    set(tools), {
                        'dashboard_show',
                        'reboot_internal_query',
                        'reboot_internal_mutate',
                    }
                )
                for name in [
                    'reboot_internal_query', 'reboot_internal_mutate'
                ]:
                    self.assertEqual(
                        tools[name].meta['ui']['visibility'], ['app']
                    )

                state_type = StateTypeName('rbt.dashboard.v1.Preferences')
                target = dict(
                    state_type=str(state_type), state_ref=str(
                        StateRef.from_id(
                            state_type, StateId(str(uuid.uuid4()))
                        )
                    )
                )

                async def mutate(width):
                    result = await call(
                        'reboot_internal_mutate', **target, payload=encode(
                            MutateRequest(
                                method='SetNavWidth',
                                idempotency_key=str(uuid.uuid4()),
                                request=PreferencesSetNavWidthRequest(
                                    nav_width=width
                                ).SerializeToString()
                            )
                        )
                    )
                    response = MutateResponse.FromString(
                        base64.b64decode(result['payload'])
                    )
                    self.assertTrue(response.HasField('response'), response)

                await mutate(0)
                session_id, query_id = str(uuid.uuid4()), str(uuid.uuid4())

                async def query(operation, **arguments):
                    return await call(
                        'reboot_internal_query', session_id=session_id,
                        operation=operation, **arguments
                    )

                opened = await query(
                    'open', **target, query_id=query_id, payload=encode(
                        QueryRequest(
                            method='Get',
                            request=PreferencesGetRequest().SerializeToString()
                        )
                    )
                )
                self.assertTrue(opened['opened'])
                first = await query('poll', cursor=0)
                self.assertEqual(first['events'][0]['queryId'], query_id)
                # A lost poll reply is replayed until its cursor is acknowledged.
                self.assertEqual(first, await query('poll', cursor=0))
                await mutate(42)
                update = await query('poll', cursor=first['cursor'])
                frame = QueryResponse.FromString(
                    base64.b64decode(update['events'][-1]['payload'])
                )
                self.assertEqual(
                    PreferencesGetResponse.FromString(frame.response
                                                     ).nav_width, 42
                )
                await query('close')
                self.assertTrue((await query('poll'))['reset'])

                shown = await call('dashboard_show', dashboard_id=DASHBOARD_ID)
                self.assertEqual(
                    shown['ids'], {'rbt.dashboard.v1.Dashboard': DASHBOARD_ID}
                )
                uri = tools['dashboard_show'].meta['ui']['resourceUri']
                (content,) = (await session.read_resource(uri)).contents
                self.assertEqual(content.mimeType, 'text/html;profile=mcp-app')
                page = content.text
                # Do not dump the megabyte-sized HTML on assertion failure.
                self.assertFalse('needs to be built first' in page)
                self.assertTrue('<title>Reboot dashboard</title>' in page)
                self.assertTrue('<script type="module">' in page)
                self.assertFalse('<link' in page)
                self.assertTrue('window.REBOOT_MCP_UI_TITLE="show";' in page)


if __name__ == '__main__':
    unittest.main()
