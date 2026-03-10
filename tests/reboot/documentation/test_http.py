import aiohttp
import unittest
from fastapi import FastAPI, Request  # type: ignore[import]
from reboot.aio.applications import Application
from reboot.aio.external import ExternalContext
from reboot.aio.http import InjectExternalContext
from reboot.aio.tests import Reboot
from tests.reboot.greeter_rbt import Greeter
from tests.reboot.greeter_servicers import MyGreeterServicer

application = Application(servicers=[MyGreeterServicer])


@application.http.get("/hello_world")
def hello_world():
    return {"message": "Hello, world!"}


@application.http.post("/hello_greeter")
async def hello_greeter(
    request: Request,
    context: ExternalContext = InjectExternalContext,
):
    body = await request.json()
    greeter, _ = await Greeter.create(
        context,
        title=body['title'],
        name=body['name'],
        adjective=body['adjective'],
    )

    response = await greeter.greet(context, name="You")

    return {"message": response.message}


fastapi = FastAPI()


@fastapi.get("/{message}")
async def mount(message: str):
    return {"message": message}


def factory(_):
    return fastapi


application.http.mount("/mount", factory=factory)


class TestSomething(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self) -> None:
        self.rbt = Reboot()
        await self.rbt.start()

    async def asyncTearDown(self) -> None:
        await self.rbt.stop()

    async def test_http_new(self) -> None:

        await self.rbt.up(
            application,
            local_envoy=True,
        )

        # Make sure we can access the HTTP endpoint more than once.
        for _ in range(5):
            async with aiohttp.ClientSession() as session:
                async with session.request(
                    'GET',
                    self.rbt.url() + "/hello_world",
                ) as get:
                    self.assertEqual(get.status, 200)
                    self.assertEqual(
                        await get.json(), {"message": "Hello, world!"}
                    )

        # Make sure we can access the HTTP endpoint more than once.
        for _ in range(5):
            async with aiohttp.ClientSession() as session:
                async with session.request(
                    'POST',
                    self.rbt.url() + "/hello_greeter",
                    json={
                        "name": "Reboot",
                        "title": "Dr",
                        "adjective": "best doctor ever",
                    },
                ) as post:
                    self.assertEqual(post.status, 200)
                    self.assertEqual(
                        await post.json(),
                        {
                            "message":
                                "Hi You, I am Dr Reboot the best doctor ever",
                        },
                    )

        # Make sure we can also access the mount.
        async with aiohttp.ClientSession() as session:
            async with session.request(
                'GET',
                self.rbt.url() + "/mount/H3110",
            ) as get:
                self.assertEqual(get.status, 200)
                self.assertEqual(await get.json(), {"message": "H3110"})


if __name__ == '__main__':
    unittest.main()
