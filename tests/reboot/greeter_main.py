#!/usr/bin/env python3
"""
This is a main function for a container hosting only the `Greeter` servicer.
"""
import asyncio
from reboot.aio.applications import Application
from reboot.aio.external import ExternalContext
from reboot.aio.http import InjectExternalContext
from tests.reboot.greeter_servicers import MyGreeterServicer

application = Application(servicers=[MyGreeterServicer])


@application.http.get("/hello_world")
def hello_world():
    return {"message": "Hello, world!"}


@application.http.post("/inject_external_context")
def inject_external_context(
    context: ExternalContext = InjectExternalContext,
):
    return {
        "message": f"Hello, {context.name}!",
        "bearerToken": context.bearer_token,
    }


async def main():
    await application.run()


if __name__ == '__main__':
    asyncio.run(main())
