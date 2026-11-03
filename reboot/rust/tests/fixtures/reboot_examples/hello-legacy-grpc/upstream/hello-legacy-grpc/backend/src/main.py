import asyncio
from deprecated_greeter_servicer import DeprecatedGreeterServicer
from hello_legacy_grpc.v1.greeter_rbt import RebootGreeter
from proxy_greeter_servicer import ProxyGreeterServicer
from reboot.aio.applications import Application
from reboot.aio.external import InitializeContext
from reboot_greeter_servicer import RebootGreeterServicer


async def initialize(context: InitializeContext):
    # Run `Initialize` on `RebootGreeter` idempotently so that it only
    # happens once.
    #
    # NOTE: we don't need to `spawn()` because we want to immediately
    # wait for it to complete (this is syntactic sugar for spawning
    # and then awaiting the returned task).
    await RebootGreeter.ref("my-greeter").initialize(context)


async def main():
    await Application(
        servicers=[RebootGreeterServicer],
        legacy_grpc_servicers=[
            DeprecatedGreeterServicer, ProxyGreeterServicer
        ],
        initialize=initialize,
    ).run()


if __name__ == '__main__':
    asyncio.run(main())
