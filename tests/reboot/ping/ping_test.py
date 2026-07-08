import httpx
import json
import os
import time
import unittest
from mcp.client.session import ClientSession
from mcp.client.streamable_http import streamable_http_client
from rbt.v1alpha1.errors_pb2 import PermissionDenied, Unauthenticated
from reboot.aio.applications import Application
from reboot.aio.tests import Reboot
from reboot.ping.ping import (
    CounterServicer,
    PingServicer,
    PongServicer,
    UserServicer,
)
from reboot.ping.ping_api_rbt import Counter, Ping, Pong, User, UserAuthorizer


class PingTest(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self):
        self.rbt = Reboot()
        await self.rbt.start()

    async def asyncTearDown(self):
        await self.rbt.stop()

    async def test_ping_periodically(self):
        await self.rbt.up(
            Application(servicers=[PingServicer, PongServicer]),
        )

        # The servicers admit signed-in users and trusted app code;
        # this test is about the periodic-ping mechanics, so call as
        # the latter.
        context = self.rbt.create_external_context(
            name=f"test-{self.id()}",
            app_internal=True,
        )

        ping = Ping.ref("my-ping")

        num_pings = 3

        response = await ping.do_ping_periodically(
            context,
            num_pings=num_pings,
            # Use a short period to make the test run fast.
            period_seconds=0.1,
        )
        self.assertEqual(response.num_pings, num_pings)

        # Verify that the pong was also called the same number
        # of times.
        pong = Pong.ref("my-ping")
        pong_response = await pong.num_pongs(context)
        self.assertEqual(pong_response.num_pongs, num_pings)

    async def test_counter(self):
        await self.rbt.up(Application(servicers=[CounterServicer]))

        # Counter methods admit the recorded owner or trusted app code;
        # this test is about the counter mechanics, so call as the
        # latter (recording an arbitrary owner ID on `create`).
        context = self.rbt.create_external_context(
            name=f"test-{self.id()}",
            app_internal=True,
        )

        counter, _ = await Counter.create(
            context, description="test counter", owner_id="test-owner"
        )

        response = await counter.increment(context)
        self.assertEqual(response.value, 1)

        response = await counter.increment(context)
        self.assertEqual(response.value, 2)

        value_response = await counter.value(context)
        self.assertEqual(value_response.value, 2)

    async def test_counter_over_mcp(self):
        await self.rbt.up(
            Application(
                servicers=[UserServicer, CounterServicer],
            ),
        )

        mcp_url = self.rbt.http_localhost_url("/mcp")
        access_token = await self.rbt.make_valid_oauth_access_token()

        async with httpx.AsyncClient(
            headers={
                "Authorization": f"Bearer {access_token}",
            },
            follow_redirects=True,
        ) as http_client:
            async with streamable_http_client(
                mcp_url,
                http_client=http_client,
            ) as (
                read_stream,
                write_stream,
                _,
            ):
                async with ClientSession(
                    read_stream,
                    write_stream,
                ) as session:
                    await session.initialize()

                    # Verify tools are listed.
                    tools = await session.list_tools()
                    tool_names = [t.name for t in tools.tools]
                    self.assertIn("create_counter", tool_names)
                    self.assertIn("whoami", tool_names)
                    self.assertIn("counter_increment", tool_names)
                    self.assertIn("counter_value", tool_names)

                    # Create a counter via the User tool.
                    result = await session.call_tool(
                        "create_counter",
                        {"request": {
                            "description": "test counter"
                        }},
                    )
                    data = json.loads(result.content[0].text)
                    counter_id = data["counter_id"]

                    # Increment twice, passing the counter
                    # ID.
                    await session.call_tool(
                        "counter_increment",
                        {"counter_id": counter_id},
                    )
                    await session.call_tool(
                        "counter_increment",
                        {"counter_id": counter_id},
                    )

                    # Read value via tool and verify count.
                    result = await session.call_tool(
                        "counter_value",
                        {"counter_id": counter_id},
                    )
                    data = json.loads(result.content[0].text)
                    self.assertEqual(data["value"], 2)

                    # Verify list_counters returns the
                    # counter we created.
                    result = await session.call_tool("list_counters", {})
                    data = json.loads(result.content[0].text)
                    self.assertEqual(len(data["counters"]), 1)
                    counter0 = data["counters"][0]
                    self.assertEqual(
                        counter0["counter_id"],
                        counter_id,
                    )
                    self.assertEqual(
                        counter0["description"],
                        "test counter",
                    )

    async def test_whoami_with_default_oauth(self):
        """Verify that the default OAuth provider populates user_id,
        and that unauthenticated requests get a 401."""
        await self.rbt.up(
            Application(
                servicers=[UserServicer, CounterServicer],
            ),
        )

        mcp_url = self.rbt.http_localhost_url("/mcp")

        # Step 0: connecting without a bearer token should
        # get HTTP 401, telling the client to authenticate.
        async with httpx.AsyncClient(
            follow_redirects=True,
        ) as client:
            response = await client.post(
                mcp_url,
                json={
                    "jsonrpc": "2.0",
                    "method": "initialize",
                    "id": 1,
                },
                headers={
                    "Content-Type": "application/json",
                    "Accept": "application/json, text/event-stream",
                },
            )
        self.assertEqual(response.status_code, 401)

        # With a valid bearer token, whoami should return
        # the user_id from the JWT.
        access_token = await self.rbt.make_valid_oauth_access_token()

        async with httpx.AsyncClient(
            headers={
                "Authorization": f"Bearer {access_token}",
            },
            follow_redirects=True,
        ) as http_client:
            async with streamable_http_client(
                mcp_url,
                http_client=http_client,
            ) as (read_stream, write_stream, _):
                async with ClientSession(
                    read_stream,
                    write_stream,
                ) as session:
                    await session.initialize()

                    result = await session.call_tool("whoami", {})
                    data = json.loads(result.content[0].text)
                    self.assertIn("user_id", data)
                    # The default test user from
                    # `make_bearer_token`.
                    self.assertEqual(data["user_id"], "test-user")

    async def test_claims_transcribed_into_user_state(self):
        """
        Sign-in claims reach the `User` servicer: ping's `set_claims`
        transcribes the `email` identity claim into state, `whoami`
        surfaces it, and a later sign-in with a changed email keeps it
        fresh — every sign-in delivers, so an A -> B -> A email change
        ends at A.
        """
        await self.rbt.up(
            Application(
                servicers=[UserServicer, CounterServicer],
            ),
        )

        user_id = "claims-user"
        token = await self.rbt.make_valid_oauth_access_token(
            user_id=user_id,
            claims={"email": "first@example.com"},
        )
        context = self.rbt.create_external_context(
            name=f"test-{self.id()}",
            bearer_token=token,
        )
        response = await User.ref(user_id).whoami(context)
        self.assertEqual(response.email, "first@example.com")

        # Sign in again with a changed email; the delivery reaches
        # `set_claims` again rather than being deduplicated away.
        await self.rbt.make_valid_oauth_access_token(
            user_id=user_id,
            claims={"email": "second@example.com"},
        )
        response = await User.ref(user_id).whoami(context)
        self.assertEqual(response.email, "second@example.com")

        # A third sign-in going back to the first email converges on
        # it: every sign-in delivers, so an A -> B -> A email change
        # ends at A rather than being mistaken for a replay of the
        # first delivery.
        await self.rbt.make_valid_oauth_access_token(
            user_id=user_id,
            claims={"email": "first@example.com"},
        )
        response = await User.ref(user_id).whoami(context)
        self.assertEqual(response.email, "first@example.com")

    async def test_ui_tool_ids_mapping(self):
        await self.rbt.up(
            Application(
                servicers=[
                    UserServicer, CounterServicer, PingServicer, PongServicer
                ],
            ),
        )

        mcp_url = self.rbt.http_localhost_url("/mcp")
        access_token = await self.rbt.make_valid_oauth_access_token()

        async with httpx.AsyncClient(
            headers={
                "Authorization": f"Bearer {access_token}",
            },
            follow_redirects=True,
        ) as http_client:
            async with streamable_http_client(
                mcp_url,
                http_client=http_client,
            ) as (
                read_stream,
                write_stream,
                _,
            ):
                async with ClientSession(
                    read_stream,
                    write_stream,
                ) as session:
                    await session.initialize()

                    tools = await session.list_tools()
                    tool_names = [t.name for t in tools.tools]
                    self.assertIn("ping_show_pinger", tool_names)
                    self.assertIn("counter_show_clicker", tool_names)

                    # The `show_pinger` UI tool should return an
                    # `ids` mapping that includes the Ping ID
                    # (passed explicitly) and all auto-construct
                    # IDs (Session and User).
                    result = await session.call_tool(
                        "ping_show_pinger",
                        {"ping_id": "my-ping"},
                    )
                    data = json.loads(result.content[0].text)
                    ids = data["ids"]
                    self.assertEqual(
                        ids["reboot.ping.Ping"],
                        "my-ping",
                    )
                    user_id = ids["reboot.ping.User"]
                    self.assertIsInstance(user_id, str)
                    self.assertGreater(len(user_id), 0)

                    # Create a counter so we can show its clicker.
                    result = await session.call_tool(
                        "create_counter",
                        {"request": {
                            "description": "test counter"
                        }},
                    )
                    data = json.loads(result.content[0].text)
                    counter_id = data["counter_id"]

                    # The `counter_show_clicker` UI tool should
                    # return an `ids` mapping with the Counter ID.
                    # `counter_show_clicker` declares
                    # `request=ShowClickerProps`, so we need to pass a
                    # `primary_color`.
                    result = await session.call_tool(
                        "counter_show_clicker",
                        {
                            "counter_id": counter_id,
                            "request": {
                                "primary_color": "green"
                            },
                        },
                    )
                    data = json.loads(result.content[0].text)
                    ids = data["ids"]
                    self.assertEqual(ids["reboot.ping.Counter"], counter_id)

    async def test_ui_tool_request_echo(self):
        """Verify the `UI(request=<Model>)` round-trip.

        Three things to check:

        1. `tools/list` exposes `counter_show_clicker` with a
           nested `request` parameter in its `inputSchema`,
           and that nested schema's `properties` contains
           `primary_color` (the snake_case Pydantic field
           name — protobuf and Pydantic both use snake_case
           on the wire to the AI).
        2. Calling the tool with
           `{counter_id, request: {primary_color: "green"}}`
           succeeds and returns the validated request under a
           top-level `request` key in the result, so
           `McpConnector.ontoolresult` will spread it into
           tool-data context.
        3. The echoed result is camelCased (`primary_color`
           lands as `primaryColor`) so the protobuf-es
           generated TypeScript field name on the React side
           matches at runtime. This is the casing path tested
           by `camelize_request_payload` in `reboot/mcp/ui.py`.
        """
        await self.rbt.up(
            Application(
                servicers=[
                    UserServicer, CounterServicer, PingServicer, PongServicer
                ],
            ),
        )

        mcp_url = self.rbt.http_localhost_url("/mcp")
        access_token = await self.rbt.make_valid_oauth_access_token()

        async with httpx.AsyncClient(
            headers={"Authorization": f"Bearer {access_token}"},
            follow_redirects=True,
        ) as http_client:
            async with streamable_http_client(
                mcp_url, http_client=http_client
            ) as (read_stream, write_stream, _):
                async with ClientSession(read_stream, write_stream) as session:
                    await session.initialize()

                    # (1) Schema: `counter_show_clicker` must expose
                    # `request` as a parameter, and `request`'s
                    # nested schema must declare `primary_color`.
                    tools = await session.list_tools()
                    show_clicker = next(
                        t for t in tools.tools
                        if t.name == "counter_show_clicker"
                    )
                    properties = (
                        show_clicker.inputSchema.get("properties", {})
                    )
                    self.assertIn(
                        "request",
                        properties,
                        f"`counter_show_clicker.inputSchema` should "
                        f"expose a `request` parameter, got "
                        f"properties: {list(properties.keys())}",
                    )
                    # The `request` schema is a `$ref` into `$defs`
                    # (Pydantic's default), so resolve it.
                    request_schema = properties["request"]
                    if "$ref" in request_schema:
                        ref = request_schema["$ref"]
                        # e.g., '#/$defs/ShowClickerProps'.
                        def_name = ref.rsplit("/", 1)[-1]
                        request_schema = (
                            show_clicker.inputSchema.get("$defs",
                                                         {}).get(def_name, {})
                        )
                    self.assertIn(
                        "primary_color",
                        request_schema.get("properties", {}),
                        f"`request` schema for `counter_show_clicker` "
                        f"should declare `primary_color`, got "
                        f"{request_schema}",
                    )

                    # Create a counter so we can show its clicker.
                    create_result = await session.call_tool(
                        "create_counter",
                        {"request": {
                            "description": "test counter"
                        }},
                    )
                    counter_id = json.loads(create_result.content[0].text
                                           )["counter_id"]

                    # (2) and (3): invoke with a request and verify
                    # the echoed payload is camelCased.
                    result = await session.call_tool(
                        "counter_show_clicker",
                        {
                            "counter_id": counter_id,
                            "request": {
                                "primary_color": "green"
                            },
                        },
                    )
                    data = json.loads(result.content[0].text)
                    self.assertIn(
                        "request",
                        data,
                        f"UI tool result should echo `request` so "
                        f"React's `McpConnector` can inject it as "
                        f"props, got keys: {list(data.keys())}",
                    )
                    echoed = data["request"]
                    self.assertEqual(
                        echoed,
                        {"primaryColor": "green"},
                        f"Echoed request should be camelCased "
                        f"(`primary_color` → `primaryColor`), got "
                        f"{echoed}",
                    )

                    # A UI tool with `request=None`
                    # (`ping_show_pinger`) should NOT include a
                    # `request` key in its result — the auto-
                    # injection in `McpConnector` keys off that
                    # field, and a stray `null` would clone the
                    # child with `null` props.
                    no_request_result = await session.call_tool(
                        "ping_show_pinger",
                        {"ping_id": "my-ping"},
                    )
                    no_request_data = json.loads(
                        no_request_result.content[0].text
                    )
                    self.assertNotIn(
                        "request",
                        no_request_data,
                        f"`UI(request=None)` tools must not echo a "
                        f"`request` key, got keys: "
                        f"{list(no_request_data.keys())}",
                    )

    async def test_ui_resource_metadata(self):
        """Verify UI resources include CSP metadata.

        The `_patch_read_resource` in `factories.py` injects
        dynamic CSP metadata (set by `ui_html()`) into the MCP
        `resources/read` response. This tells ext-apps hosts
        which origins to allow in the sandbox iframe's CSP.
        """
        # Point the frontend paths at the built dist the way
        # `rbt serve` does (see `ping_py_bin`'s env) so the clicker
        # UI resolves to the real `frontend/dist/mcp/clicker/
        # index.html` rather than the "build not found" placeholder.
        # Without this the UI resolves to a non-existent source path
        # and the test would silently exercise the placeholder.
        os.environ["RBT_FRONTEND_DIST_PATH"] = "frontend/dist"
        os.environ["RBT_FRONTEND_ROOT_PATH"] = "frontend"
        self.addCleanup(os.environ.pop, "RBT_FRONTEND_DIST_PATH", None)
        self.addCleanup(os.environ.pop, "RBT_FRONTEND_ROOT_PATH", None)

        await self.rbt.up(
            Application(
                servicers=[
                    PingServicer,
                    PongServicer,
                    UserServicer,
                    CounterServicer,
                ],
            ),
        )

        mcp_url = self.rbt.http_localhost_url("/mcp")
        access_token = await self.rbt.make_valid_oauth_access_token()

        async with httpx.AsyncClient(
            headers={
                "Authorization": f"Bearer {access_token}",
            },
            follow_redirects=True,
        ) as http_client:
            async with streamable_http_client(
                mcp_url,
                http_client=http_client,
            ) as (
                read_stream,
                write_stream,
                _,
            ):
                async with ClientSession(
                    read_stream,
                    write_stream,
                ) as session:
                    await session.initialize()

                    # UI resources use URI templates (e.g.,
                    # `ui://counter/{ui}/{cache_bust}`), so they
                    # appear in `list_resource_templates`, not
                    # `list_resources`.
                    templates = (await session.list_resource_templates())
                    template_uris = [
                        str(t.uriTemplate) for t in templates.resourceTemplates
                    ]
                    self.assertTrue(
                        any("ui://" in uri for uri in template_uris),
                        f"Expected ui:// resource templates, "
                        f"got: {template_uris}",
                    )

                    # Fetch the URI from the `show_clicker` tool's
                    # `_meta.ui.resourceUri` the way a real host
                    # (ChatGPT, Claude) does. The URI carries a
                    # 12-char content-hash cache-bust segment so
                    # hosts that cache `resources/read` keyed on
                    # the URI see a fresh URI when the build
                    # changes.
                    tools_result = await session.list_tools()
                    show_tool = next(
                        (
                            t for t in tools_result.tools
                            if t.name == "counter_show_clicker"
                        ),
                        None,
                    )
                    self.assertIsNotNone(
                        show_tool,
                        f"Expected a counter_show_clicker tool, got: "
                        f"{[t.name for t in tools_result.tools]}",
                    )
                    assert show_tool is not None  # For mypy.
                    self.assertIsNotNone(
                        show_tool.meta,
                        "Expected `_meta` on counter_show_clicker tool",
                    )
                    assert show_tool.meta is not None  # For mypy.
                    resource_uri = show_tool.meta["ui"]["resourceUri"]
                    self.assertRegex(
                        resource_uri,
                        r"^ui://counter/show_clicker/[0-9a-f]{12}$",
                        f"Expected cache-busted URI "
                        f"`ui://counter/show_clicker/<12 hex>`, "
                        f"got: {resource_uri}",
                    )

                    # Read the clicker UI resource via the URI the
                    # tool meta advertises.
                    result = await session.read_resource(resource_uri)
                    self.assertEqual(len(result.contents), 1)

                    content = result.contents[0]

                    # Should be HTML.
                    self.assertIn("text/html", content.mimeType or "")

                    # Must be the real built clicker UI, not the
                    # "build not found" placeholder — otherwise a
                    # dist-resolution regression would pass unnoticed,
                    # since the placeholder is also `text/html` with
                    # the same injected CSP metadata.
                    html = getattr(content, "text", "") or ""
                    self.assertNotIn(
                        "needs to be built first",
                        html,
                        "Served the build-not-found placeholder "
                        "instead of the real built clicker UI.",
                    )

                    # Verify CSP metadata was injected.
                    self.assertIsNotNone(
                        content.meta,
                        "Expected `_meta` with CSP metadata on resource content",
                    )
                    ui_meta = content.meta.get("ui", {})
                    csp = ui_meta.get("csp", {})
                    self.assertIn("connectDomains", csp)
                    self.assertIn("frameDomains", csp)
                    # Domains should contain the Reboot server URL and
                    # Reboot websocket URL.
                    self.assertEqual(len(csp["connectDomains"]), 2)

    async def test_mcp_no_tools_returns_501(self):
        # An application with only PongServicer (which has
        # no MCP tools) should return 501 when an MCP
        # client connects.
        await self.rbt.up(
            Application(
                servicers=[PongServicer],
            ),
        )

        mcp_url = self.rbt.http_localhost_url("/mcp")

        async with httpx.AsyncClient(
            follow_redirects=True,
        ) as client:
            response = await client.post(
                mcp_url,
                json={
                    "jsonrpc": "2.0",
                    "method": "initialize",
                    "id": 1,
                },
                headers={
                    "Content-Type": "application/json",
                },
            )

        self.assertEqual(response.status_code, 501)
        body = response.json()
        self.assertEqual(body["error"], "no_mcp_tools")

    async def test_mcp_expired_token_returns_401(self):
        await self.rbt.up(
            Application(
                servicers=[UserServicer, CounterServicer],
            ),
        )

        mcp_url = self.rbt.http_localhost_url("/mcp")
        valid_token = await self.rbt.make_valid_oauth_access_token()

        mcp_init_body = {
            "jsonrpc": "2.0",
            "method": "initialize",
            "id": 1,
            "params":
                {
                    "protocolVersion": "2025-03-26",
                    "capabilities": {},
                    "clientInfo": {
                        "name": "test",
                        "version": "1.0",
                    },
                },
        }

        mcp_headers = {
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
        }

        # A valid (non-expired) token should be accepted.
        valid_token = await self.rbt.make_valid_oauth_access_token()

        async with httpx.AsyncClient(
            follow_redirects=True,
        ) as client:
            response = await client.post(
                mcp_url,
                json=mcp_init_body,
                headers={
                    **mcp_headers,
                    "Authorization": f"Bearer {valid_token}",
                },
            )
        self.assertEqual(response.status_code, 200)

        # An expired token should get HTTP 401.
        expired_token = self.rbt.make_jwt(
            type="access",
            sub="test-user",
            aud="reboot-mcp",
            exp=int(time.time()) - 10,
        )

        async with httpx.AsyncClient(
            follow_redirects=True,
        ) as client:
            response = await client.post(
                mcp_url,
                json=mcp_init_body,
                headers={
                    **mcp_headers,
                    "Authorization": f"Bearer {expired_token}",
                },
            )
        self.assertEqual(response.status_code, 401)
        # `invalid_token` is the standard error code for expired or
        # invalid bearer tokens per RFC 6750 Section 3.1.
        self.assertIn(
            "invalid_token",
            response.headers.get("www-authenticate", ""),
        )

    async def test_user_auto_constructed(self):
        """Verify User state is auto-constructed from the JWT sub claim."""
        await self.rbt.up(
            Application(
                servicers=[UserServicer, CounterServicer],
            ),
        )

        mcp_url = self.rbt.http_localhost_url("/mcp")
        user_id = "test-user-for-auto-construct"
        access_token = await self.rbt.make_valid_oauth_access_token(
            user_id=user_id
        )

        # Connect twice with the same user ID (different MCP sessions).
        # The first session should auto-construct `User`. The second
        # should silently skip creation and still work.
        for i in range(2):
            async with httpx.AsyncClient(
                headers={
                    "Authorization": f"Bearer {access_token}",
                },
                follow_redirects=True,
            ) as http_client:
                async with streamable_http_client(
                    mcp_url,
                    http_client=http_client,
                ) as (
                    read_stream,
                    write_stream,
                    _,
                ):
                    async with ClientSession(
                        read_stream,
                        write_stream,
                    ) as session:
                        await session.initialize()

                        # The `whoami` tool is on the auto-constructed
                        # `User` state type. Being able to call it
                        # proves that a `User` exists.
                        result = await session.call_tool("whoami", {})
                        data = json.loads(result.content[0].text)
                        self.assertEqual(data["user_id"], user_id)

    async def test_refresh_token_produces_valid_access_token(self):
        await self.rbt.up(
            Application(
                servicers=[UserServicer, CounterServicer],
            ),
        )

        token_url = self.rbt.http_localhost_url("/__/oauth/token")
        mcp_url = self.rbt.http_localhost_url("/mcp")

        # Mint an expired access token and a valid refresh
        # token, as if the client had previously
        # authenticated and the access token has since
        # expired.
        client_id = self.rbt.make_jwt(
            type="client",
            redirect_uris=["http://localhost/callback"],
            exp=int(time.time()) + 3600,
        )

        expired_access_token = self.rbt.make_jwt(
            type="access",
            sub="test-user",
            aud="reboot-mcp",
            exp=int(time.time()) - 10,
        )

        refresh_token = self.rbt.make_jwt(
            type="refresh",
            sub="test-user",
            client_id=client_id,
            exp=int(time.time()) + 30 * 24 * 3600,
        )

        async with httpx.AsyncClient(
            follow_redirects=True,
        ) as client:
            # The expired access token should be rejected.
            mcp_headers = {
                "Content-Type": "application/json",
                "Accept": "application/json, text/event-stream",
            }
            response = await client.post(
                mcp_url,
                json={
                    "jsonrpc": "2.0",
                    "method": "initialize",
                    "id": 1,
                    "params":
                        {
                            "protocolVersion": "2025-03-26",
                            "capabilities": {},
                            "clientInfo": {
                                "name": "test",
                                "version": "1.0",
                            },
                        },
                },
                headers={
                    **mcp_headers,
                    "Authorization":
                        f"Bearer {expired_access_token}",
                },
            )
            self.assertEqual(response.status_code, 401)

            # Use the refresh token to get new tokens.
            response = await client.post(
                token_url,
                data={
                    "grant_type": "refresh_token",
                    "refresh_token": refresh_token,
                    "client_id": client_id,
                },
            )
            self.assertEqual(response.status_code, 200)
            token_data = response.json()

            new_access_token = token_data["access_token"]
            new_refresh_token = token_data["refresh_token"]

            # The response should include both tokens.
            self.assertIsInstance(new_access_token, str)
            self.assertIsInstance(new_refresh_token, str)
            self.assertEqual(token_data["token_type"], "bearer")
            self.assertIn("expires_in", token_data)

            # The new refresh token should differ from the
            # old one (token rotation).
            self.assertNotEqual(new_refresh_token, refresh_token)

            # The new access token should be accepted by
            # the MCP endpoint.
            response = await client.post(
                mcp_url,
                json={
                    "jsonrpc": "2.0",
                    "method": "initialize",
                    "id": 1,
                    "params":
                        {
                            "protocolVersion": "2025-03-26",
                            "capabilities": {},
                            "clientInfo": {
                                "name": "test",
                                "version": "1.0",
                            },
                        },
                },
                headers={
                    **mcp_headers,
                    "Authorization":
                        f"Bearer {new_access_token}",
                },
            )
            self.assertEqual(response.status_code, 200)

    async def test_user_default_auth(self):
        """
        Verify User default auth: owner and app-internal are allowed;
        wrong user gets PermissionDenied; unauthenticated gets
        Unauthenticated.
        """
        await self.rbt.up(
            Application(
                servicers=[UserServicer, CounterServicer],
            ),
        )

        owner_id = "owner-user"
        other_id = "other-user"

        # Once we have valid OAuth tokens, Reboot guarantees that the
        # corresponding `User` states have been created.

        # Owner can call their own User's methods.
        owner_context = await self.rbt.create_external_context_as(
            name=f"test-{self.id()}-owner",
            user_id=owner_id,
        )
        response = await User.ref(owner_id).whoami(owner_context)
        self.assertEqual(response.user_id, owner_id)

        # A different user gets PermissionDenied.
        other_context = await self.rbt.create_external_context_as(
            name=f"test-{self.id()}-other",
            user_id=other_id,
        )
        with self.assertRaises(User.WhoamiAborted) as aborted:
            await User.ref(owner_id).whoami(other_context)
        self.assertIsInstance(aborted.exception.error, PermissionDenied)

        # No token at all gets Unauthenticated.
        noauth_context = self.rbt.create_external_context(
            name=f"test-{self.id()}-noauth",
        )
        with self.assertRaises(User.WhoamiAborted) as aborted:
            await User.ref(owner_id).whoami(noauth_context)
        self.assertIsInstance(aborted.exception.error, Unauthenticated)

    async def test_user_generated_authorizer_default(self):
        """Test the generated `UserAuthorizer` default rule.

        There are _two_ kinds of default authorizers: the
        `DefaultAuthorizer` that's used when a developer specifies no
        authorizer at all, and the default implementation of the methods
        on the generated `YourTypeAuthorizer` base class that are active
        when the developer chooses a custom authorizer but doesn't
        implement all the methods. This test tests the second case, for
        `User`.

        The generated `UserAuthorizer` defaults to
        `allow_if(any=[state_id_is_user_id, is_app_internal])`. This
        test verifies that rule by using a servicer that explicitly
        returns `UserAuthorizer()`.
        """

        # A servicer that uses the generated authorizer with its default
        # rule (rather than relying on `DefaultAuthorizer`).
        class UserWithGeneratedAuth(UserServicer):

            def authorizer(self):
                return UserAuthorizer()

        await self.rbt.up(
            Application(
                servicers=[UserWithGeneratedAuth, CounterServicer],
            ),
        )

        owner_id = "gen-auth-owner"
        other_id = "gen-auth-other"

        # Once we have valid OAuth tokens, Reboot guarantees that both
        # `User` states have been created.

        # Owner can call their own User.
        owner_context = await self.rbt.create_external_context_as(
            name=f"test-{self.id()}-owner",
            user_id=owner_id,
        )
        response = await User.ref(owner_id).whoami(owner_context)
        self.assertEqual(response.user_id, owner_id)

        # Different user gets PermissionDenied.
        other_context = await self.rbt.create_external_context_as(
            name=f"test-{self.id()}-other",
            user_id=other_id,
        )
        with self.assertRaises(User.WhoamiAborted) as aborted:
            await User.ref(owner_id).whoami(other_context)
        self.assertIsInstance(aborted.exception.error, PermissionDenied)

        # No token: `state_id_is_user_id` returns Unauthenticated,
        # `is_app_internal` returns PermissionDenied. With `any=`, the
        # presence of at least one PermissionDenied means the final
        # result is PermissionDenied (not Unauthenticated).
        noauth_context = self.rbt.create_external_context(
            name=f"test-{self.id()}-noauth",
        )
        with self.assertRaises(User.WhoamiAborted) as aborted:
            await User.ref(owner_id).whoami(noauth_context)
        self.assertIsInstance(aborted.exception.error, PermissionDenied)


if __name__ == '__main__':
    unittest.main(verbosity=2)
