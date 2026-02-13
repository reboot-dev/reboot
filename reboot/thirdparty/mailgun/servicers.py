import aiohttp
import asyncio
import log.log
import os
import rebootdev.aio.auth.token_verifiers
import uuid
from abc import abstractmethod
from datetime import timedelta
from rbt.thirdparty.mailgun.v1.mailgun_rbt import (
    Message,
    SendRequest,
    SendResponse,
    SendWorkflowRequest,
    SendWorkflowResponse,
)
from rbt.v1alpha1.errors_pb2 import (
    DeadlineExceeded,
    Ok,
    PermissionDenied,
    Unauthenticated,
)
from reboot.aio.secrets import (
    EnvironmentSecretSource,
    SecretNotFoundException,
    Secrets,
)
from reboot.thirdparty.mailgun.settings import (
    MAILGUN_API_KEY_SECRET_NAME,
    MAILGUN_EVENT_API_CONSISTENCY_DELAY_SEC,
)
from rebootdev.aio.auth import Auth
from rebootdev.aio.auth.authorizers import Authorizer, allow_if
from rebootdev.aio.call import Options
from rebootdev.aio.contexts import (
    ReaderContext,
    WorkflowContext,
    WriterContext,
)
from rebootdev.run_environments import on_cloud
from rebootdev.time import DateTimeWithTimeZone
from typing import ClassVar, Optional

logger = log.log.get_logger(__name__)

IDEMPOTENCY_KEY_USER_VARIABLE = "idempotency_message_key"
MAILGUN_API_BASE_ADDRESS_ENV_NAME = "MAILGUN_API_BASE_ADDRESS"

# If no API base address is injected for testing, use this one (the address for
# the real Mailgun API).
MAILGUN_API_BASE_ADDRESS = "https://api.mailgun.net"

# A "tag" used to ensure that the mailgun API key was correctly
# verified.
MAILGUN_API_KEY_VERIFIED = 'MAILGUN_API_KEY_VERIFIED'


class MailgunAPIError(RuntimeError):
    pass


class _AbstractMessageServicer(Message.singleton.Servicer):

    _secrets: Secrets

    def __init__(self):
        super().__init__()

        # TODO: We are currently checking for kubernetes as proxy for checking
        # for cloud, and checking for `EnvironmentSecretSource` to confirm that
        # this is not the cloud-app (which uses a different source).
        _AbstractMessageServicer._secrets = Secrets()
        if on_cloud() and isinstance(
            _AbstractMessageServicer._secrets.secret_source,
            EnvironmentSecretSource,
        ):
            logger.warning("Secrets are not yet supported on the cloud!")

    def token_verifier(
        self,
    ) -> Optional[rebootdev.aio.auth.token_verifiers.TokenVerifier]:

        class TokenVerifier(rebootdev.aio.auth.token_verifiers.TokenVerifier):

            def __init__(self, secrets: Secrets):
                self._secrets = secrets

            async def verify_token(
                self,
                context: ReaderContext,
                token: Optional[str],
            ) -> Optional[Auth]:

                try:
                    api_key = await self._secrets.get(
                        MAILGUN_API_KEY_SECRET_NAME
                    )

                    if token == api_key.decode():
                        return Auth(
                            # No user ID, the secret _is_ the mailgun API key.
                            user_id=None,
                            properties={MAILGUN_API_KEY_VERIFIED: True},
                        )
                    else:
                        return None
                except SecretNotFoundException:
                    logger.critical(
                        "Failed to verify token, missing secret "
                        f"'{MAILGUN_API_KEY_SECRET_NAME}'"
                    )
                    return None

        return TokenVerifier(self._secrets)

    def authorizer(self):

        def has_api_key_been_verified(
            *,
            context: ReaderContext,
            **kwargs,
        ) -> Authorizer.Decision:
            if context.auth is None:
                return Unauthenticated()

            # Invariant: our token verifier is verifying that we have
            # the correct API key, which is sufficient for
            # authorization, so all we need to do here is ensure that
            # we don't introduce a bug where a different token
            # verifier gets used. We do that by looking for a specific
            # property set by the token verifier.
            if MAILGUN_API_KEY_VERIFIED in context.auth.properties:
                return Ok()

            return PermissionDenied()

        return allow_if(all=[has_api_key_been_verified])

    async def Send(
        self,
        context: WriterContext,
        state: Message.State,
        request: SendRequest,
    ) -> SendResponse:
        # Validate that we have exactly one of 'text' or 'html'
        # _before_ scheduling a task otherwise that task will never be
        # able to complete.
        body_type: Optional[str] = request.WhichOneof('body')

        if body_type is None:
            raise ValueError(
                "Exactly one of 'text' or 'html' should be specified"
            )

        # Generate an idempotency key to associate with the sending of this
        # message.
        state.idempotency_key = str(uuid.uuid4())

        # GetCurrentTime() updates the Timestamp on which it is called in-place.
        state.initial_send_time.GetCurrentTime()

        task_id = await self.ref().schedule().SendWorkflow(
            context,
            # Use the caller's bearer token to schedule the workflow.
            #
            # TODO(rjh, stuhood): replace this with app-internal auth, once it's
            #                     easier to compose multiple forms of
            #                     authentication.
            Options(bearer_token=context.caller_bearer_token),
            send_request=request,
        )

        return SendResponse(task_id=task_id)

    @classmethod
    async def SendWorkflow(
        cls,
        context: WorkflowContext,
        request: SendWorkflowRequest,
    ) -> SendWorkflowResponse:
        state = await Message.ref().read(context)

        # Mailgun retains detailed event data for one day for free accounts and
        # up to 30 days for paid accounts based on subscription plan.
        # Since detailed event data is necessary for checking if an email has
        # already been sent, we cannot guarantee idempotency after more than a
        # day.
        #
        # Since we don't know if we're a free account or a paid
        # account, we conservatively bail out of this task if it's
        # been more than 24 hours since it first ran, to avoid
        # potentially sending this email twice.
        if (
            DateTimeWithTimeZone.now()
            > DateTimeWithTimeZone.from_protobuf_timestamp(
                state.initial_send_time
            ) + timedelta(hours=24)
        ):
            # Need to explicitly abort otherwise task will run forever.
            raise Message.SendWorkflowAborted(
                DeadlineExceeded(),
                message=
                "Could not confirm within 24 hours that the message was sent; Mailgun may or may not have sent the message, so we will not attempt to send it again",
            )

        body_type: Optional[str] = request.send_request.WhichOneof('body')

        assert body_type is not None

        body: Optional[str] = getattr(request.send_request, body_type)

        assert body is not None

        await cls.send_email_idempotently(
            api_base_address=os.getenv(
                MAILGUN_API_BASE_ADDRESS_ENV_NAME, MAILGUN_API_BASE_ADDRESS
            ),
            sender=request.send_request.sender,
            recipient=request.send_request.recipient,
            subject=request.send_request.subject,
            domain=request.send_request.domain,
            idempotency_key=state.idempotency_key,
            body=body,
            body_type=body_type,
        )

        async def update_accepted_time(state):
            # Update accepted time to _now_, so when debugging we can see
            # when the message was accepted by mailgun (or if it has not
            # yet been accepted).
            #
            # `GetCurrentTime()` updates the `Timestamp` on which it is
            # called in-place.
            state.accepted_time.GetCurrentTime()

        await Message.ref().idempotently("Update accepted time").write(
            context,
            update_accepted_time,
        )

        return SendWorkflowResponse()

    @classmethod
    @abstractmethod
    async def send_email(
        cls,
        *,
        api_base_address: str,
        sender: str,
        recipient: str,
        subject: str,
        domain: str,
        idempotency_key: str,
        body: str,
        body_type: str,
    ):
        pass

    @classmethod
    @abstractmethod
    async def is_email_with_idempotency_key_sent_to_recipient(
        cls,
        *,
        api_base_address: str,
        recipient: str,
        domain: str,
        idempotency_key: str,
    ) -> bool:
        pass

    @classmethod
    async def send_email_idempotently(
        cls,
        *,
        api_base_address: str,
        sender: str,
        recipient: str,
        subject: str,
        domain: str,
        idempotency_key: str,
        body: str,
        body_type: str,
    ):
        # After our delay for eventual consistency (see comment on constant
        # declaration), we assume that the endpoint has fully caught up. If it
        # does not have evidence that the email has already been sent, we send
        # it now.
        await asyncio.sleep(MAILGUN_EVENT_API_CONSISTENCY_DELAY_SEC)

        if (
            not await cls.is_email_with_idempotency_key_sent_to_recipient(
                api_base_address=api_base_address,
                recipient=recipient,
                domain=domain,
                idempotency_key=idempotency_key,
            )
        ):
            await cls.send_email(
                api_base_address=api_base_address,
                sender=sender,
                recipient=recipient,
                subject=subject,
                domain=domain,
                body=body,
                body_type=body_type,
                idempotency_key=idempotency_key,
            )


class MessageServicer(_AbstractMessageServicer):

    def __init__(self):
        super().__init__()

    @classmethod
    async def get_api_key(cls) -> str:
        try:
            api_key = await cls._secrets.get(MAILGUN_API_KEY_SECRET_NAME)
        except SecretNotFoundException as exception:
            logger.critical(f"No secret '{MAILGUN_API_KEY_SECRET_NAME}'")
            raise RuntimeError("No API key for mailgun") from exception
        return api_key.decode()

    @classmethod
    async def send_email(
        cls,
        *,
        api_base_address: str,
        sender: str,
        recipient: str,
        subject: str,
        domain: str,
        idempotency_key: str,
        body: str,
        body_type: str,
    ):
        """
        Sends an email with the given subject and body from the sender to
        the recipient, using the Mailgun API at the given api_base_address and
        domain. Authenticates to Mailgun with the given api_key credential.

        The email body can be provided either as plain text or as HTML content.
        We add the 'idempotency_key' as a user variable on the Mailgun message
        so that we can uniquely identify this email and ensure it is only sent
        once."""
        api_key = await cls.get_api_key()

        async with aiohttp.ClientSession(
            auth=aiohttp.BasicAuth(login="api", password=api_key)
        ) as session:
            async with session.post(
                f"{api_base_address}/v3/{domain}/messages",
                data={
                    "from": sender,
                    "to": recipient,
                    "subject": subject,
                    body_type: body,
                    f"v:{IDEMPOTENCY_KEY_USER_VARIABLE}": idempotency_key,
                },
            ) as response:
                if response.status != 200:
                    raise MailgunAPIError(
                        f"Something went wrong while running POST on Mailgun API, error {response.status}"
                    )

                logger.info(
                    "Mailgun accepted email message for "
                    f"recipient '{recipient}' with idempotency key "
                    f"'{idempotency_key}'"
                )

    @classmethod
    async def is_email_with_idempotency_key_sent_to_recipient(
        cls,
        *,
        api_base_address: str,
        recipient: str,
        domain: str,
        idempotency_key: str,
    ) -> bool:
        api_key = await cls.get_api_key()

        async with aiohttp.ClientSession(
            auth=aiohttp.BasicAuth(login="api", password=api_key)
        ) as session:
            user_variables = f"{{'{IDEMPOTENCY_KEY_USER_VARIABLE}': '{idempotency_key}'}}"

            async with session.get(
                f"{api_base_address}/v3/{domain}/events",
                params={
                    "recipient": recipient,
                    "user-variables": user_variables,
                    "event": "accepted",
                },
            ) as response:
                if response.status == 200:
                    body = await response.json()
                    if (len(body['items']) != 0):
                        logger.info(
                            "Found already accepted email message for "
                            f"recipient '{recipient}' with idempotency key "
                            f"'{idempotency_key}'"
                        )
                        # Since `items` is not empty, it means that the email
                        # with this idempotency key has already been sent.
                        return True
                else:
                    raise MailgunAPIError(
                        f"Something went wrong while running GET on Mailgun API (error code {response.status})"
                    )

        return False


# Mock version for testing with no actual email sending.
class MockMessageServicer(_AbstractMessageServicer):

    # The `emails_sent` list must be a class variable for tests to be able to
    # find and read it.
    emails_sent: ClassVar[list[dict[str, str]]] = []
    emails_sent_sema: ClassVar[asyncio.Semaphore] = asyncio.Semaphore(value=0)
    # Note: we track idempotency of sent email independently from message bodies to avoid
    # callers needing to worry about races between clearing the `emails_sent` list, and
    # tasks (re)running in the background.
    _idempotency_keys: ClassVar[set[tuple[str, str]]] = set()

    def __init__(self):
        super().__init__()
        # Invariant: there is only one `MockMessageServicer` per process at any
        # one time. Reset the class variable of sent emails to be empty when a
        # new instance is created, since it represents the start of a new
        # servicer for (likely) a new test.
        MockMessageServicer.emails_sent = []
        MockMessageServicer.emails_sent_sema = asyncio.Semaphore(value=0)
        MockMessageServicer._idempotency_keys = set()

    @classmethod
    async def send_email(
        cls,
        *,
        recipient: str,
        subject: str,
        idempotency_key: str,
        **kwargs: str,
    ):
        key = (recipient, idempotency_key)
        if key in MockMessageServicer._idempotency_keys:
            return
        MockMessageServicer._idempotency_keys.add(key)

        logger.info(
            f"Pretending to send email with subject {subject} to {recipient}"
        )
        MockMessageServicer.emails_sent.append(
            dict(**kwargs, recipient=recipient, subject=subject)
        )
        MockMessageServicer.emails_sent_sema.release()

    @classmethod
    async def is_email_with_idempotency_key_sent_to_recipient(
        cls,
        *,
        api_base_address: str,
        recipient: str,
        domain: str,
        idempotency_key: str,
    ) -> bool:
        return (
            recipient, idempotency_key
        ) in MockMessageServicer._idempotency_keys
