import unittest
from rbt.thirdparty.mailgun.v1.mailgun_rbt import Message
from reboot.aio.applications import Application
from reboot.aio.secrets import MockSecretSource, Secrets
from reboot.aio.tests import Reboot
from reboot.thirdparty import mailgun
from reboot.thirdparty.mailgun import MAILGUN_API_KEY_SECRET_NAME
from reboot.thirdparty.mailgun.servicers import MockMessageServicer

# Any arbitrary mailgun API key works for the `MockMessageServicer`.
MAILGUN_API_KEY = 'S3CR3T!'


class TestCase(unittest.IsolatedAsyncioTestCase):

    async def asyncSetUp(self) -> None:
        Secrets.set_secret_source(
            MockSecretSource(
                {
                    MAILGUN_API_KEY_SECRET_NAME: MAILGUN_API_KEY.encode(),
                }
            )
        )
        self.rbt = Reboot()
        await self.rbt.start()

    async def asyncTearDown(self) -> None:
        await self.rbt.stop()

    async def test_emailer(self) -> None:
        # Turn off the message send delay so the test runs faster.
        mailgun.MAILGUN_EVENT_API_CONSISTENCY_DELAY_SEC = 0

        await self.rbt.up(
            Application(servicers=[MockMessageServicer]),
        )

        context = self.rbt.create_external_context(
            name=f"test-{self.id()}",
            bearer_token=MAILGUN_API_KEY,
        )

        _, send_response = await Message.Send(
            context,
            recipient="team@reboot.dev",
            sender="hipsterstore@reboot.dev",
            domain="reboot.dev",
            subject="jonathan",
            text="jonathan",
        )

        await Message.SendWorkflowTask.retrieve(
            context,
            task_id=send_response.task_id,
        )

        await MockMessageServicer.emails_sent_sema.acquire()
        self.assertEqual(1, len(MockMessageServicer.emails_sent))
        MockMessageServicer.emails_sent.clear()

        _, send_response = await Message.Send(
            context,
            recipient="team@reboot.dev",
            sender="hipsterstore@reboot.dev",
            domain="reboot.dev",
            subject="jonathan",
            text="jonathan",
        )

        await Message.SendWorkflowTask.retrieve(
            context,
            task_id=send_response.task_id,
        )

        # NOTE: Effect validation has run both `Send` and `SendTask` twice, but
        # we received one email: that confirms that the methods are idempotent.
        await MockMessageServicer.emails_sent_sema.acquire()
        self.assertEqual(1, len(MockMessageServicer.emails_sent))
        MockMessageServicer.emails_sent.clear()


if __name__ == '__main__':
    unittest.main()
