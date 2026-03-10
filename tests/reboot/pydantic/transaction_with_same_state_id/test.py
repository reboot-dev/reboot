import unittest
from reboot.aio.applications import Application
from reboot.aio.tests import Reboot
from tests.reboot.pydantic.transaction_with_same_state_id.servicer import (
    SHARED_STATE_ID,
    MainTestServicer,
    SecondaryTestServicer,
)
from tests.reboot.pydantic.transaction_with_same_state_id.servicer_api import (
    GetDataResponse,
)
from tests.reboot.pydantic.transaction_with_same_state_id.servicer_api_rbt import (
    MainTest,
)


class RebootTestCase(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self) -> None:
        self.rbt = Reboot()
        await self.rbt.start()

    async def asyncTearDown(self) -> None:
        await self.rbt.stop()

    async def test_reader_and_writer_in_transaction(self) -> None:
        """`Reader` and `Writer` in `Transaction`."""
        await self.rbt.up(
            Application(servicers=[MainTestServicer, SecondaryTestServicer]),
            servers=1,
        )

        context = self.rbt.create_external_context(name=self.id())

        main_test = MainTest.ref(SHARED_STATE_ID)

        await main_test.transaction(
            context,
            main_test_data="main data",
            secondary_test_data=["secondary", "data"],
        )

        data = await main_test.get_data(context)

        expected_data = GetDataResponse(
            main_test_data="main data",
            secondary_test_data=["secondary", "data"],
        )

        self.assertEqual(data, expected_data)


if __name__ == '__main__':
    unittest.main(verbosity=2)
