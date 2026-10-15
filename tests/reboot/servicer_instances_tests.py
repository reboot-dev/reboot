import unittest
from reboot.aio.applications import Application
from reboot.aio.contexts import ReaderContext
from reboot.aio.tests import Reboot
from tests.reboot import greeter_rbt
from tests.reboot.greeter_rbt import Greeter
from tests.reboot.greeter_servicers import MyGreeterServicer

GREETER_ID = 'greeter'


class GreeterA(MyGreeterServicer):

    async def Greet(
        self,
        context: ReaderContext,
        request: greeter_rbt.GreetRequest,
    ) -> greeter_rbt.GreetResponse:
        return greeter_rbt.GreetResponse(message='A')


class GreeterB(MyGreeterServicer):

    async def Greet(
        self,
        context: ReaderContext,
        request: greeter_rbt.GreetRequest,
    ) -> greeter_rbt.GreetResponse:
        return greeter_rbt.GreetResponse(message='B')


class ServicerInstancesTest(unittest.IsolatedAsyncioTestCase):

    async def test_each_server_has_its_own_servicer_instances(self):
        """Two `Reboot`s in one process, each registering a different
        servicer class for the same state type: the second serves a
        state id the first already served with its own class, not with
        the instance the first created."""
        for servicer, message in ((GreeterA, 'A'), (GreeterB, 'B')):
            rbt = Reboot()
            await rbt.start()
            await rbt.up(Application(servicers=[servicer]))
            try:
                context = rbt.create_external_context(
                    name=f'{self.id()}-{message}',
                )
                greeter, _ = await Greeter.Create(
                    context,
                    GREETER_ID,
                    title='Dr',
                    name='Jonathan',
                    adjective='best',
                )
                response = await greeter.Greet(context, name='Riley')
                self.assertEqual(response.message, message)
            finally:
                await rbt.stop()


if __name__ == '__main__':
    unittest.main()
