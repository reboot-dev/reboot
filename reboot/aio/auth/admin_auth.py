import grpc
import os
import rbt.v1alpha1.admin.auth_pb2 as admin_auth_pb2
import rbt.v1alpha1.admin.auth_pb2_grpc as admin_auth_pb2_grpc
from log.log import get_logger
from reboot.aio.secrets import SecretNotFoundException, Secrets
from reboot.controller.settings import ENVVAR_REBOOT_ADMIN_AUTH_URL
from rebootdev.aio.headers import AUTHORIZATION_HEADER
from rebootdev.run_environments import running_rbt_dev
from rebootdev.settings import ADMIN_SECRET_NAME
from typing import Optional

logger = get_logger(__name__)


def auth_metadata_from_metadata(
    grpc_context: grpc.aio.ServicerContext
) -> tuple:
    """Helper to extract only the authorization metadata from a gRPC context.

    The context might and will contain other metadata that we should be careful
    with blindly duplicating, such as our own routing headers but also request
    id headers.
    """
    for key, value in grpc_context.invocation_metadata():
        if key == AUTHORIZATION_HEADER:
            return ((key, value),)
    return ()


class AdminAuthMixin:
    """Mixin that is used to provide a helper for checking that a request
    contains the necessary admin credentials.

    We use a mixin over a free standing function to avoid a global `Secrets` object.
    """

    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.__secrets = Secrets()

    async def ensure_admin_auth_or_fail(
        self,
        grpc_context: grpc.aio.ServicerContext,
    ) -> None:
        """Ensure that the request contains the necessary admin credentials.

        If the request does not contain the necessary credentials, the request
        is aborted; an exception is raised and propagated.
        """
        if running_rbt_dev():
            # In rbt dev mode, no admin secret needs to be specified - all calls
            # are assumed to be from the admin (and any specified secret is
            # ignored).
            return

        bearer_token: str
        try:
            metadata: dict[str, str] = dict(grpc_context.invocation_metadata())
            bearer_token = metadata[AUTHORIZATION_HEADER].removeprefix(
                'Bearer '
            )
        except KeyError:
            await grpc_context.abort(
                code=grpc.StatusCode.UNAUTHENTICATED,
                details='Missing bearer token',
            )
            # mypy doesn't have type information for grpc, and so doesn't know
            # that `abort` never returns.
            raise AssertionError
        except Exception as e:
            logger.error(
                "Unknown `%s` while extracting bearer token: %s",
                type(e),
                e,
            )
            raise

        admin_secret: str
        try:
            admin_secret = (await
                            self.__secrets.get(ADMIN_SECRET_NAME)).decode()

            if bearer_token == admin_secret:
                # The provided bearer token matches the configured admin secret.
                # This is sufficient to authorize the request.
                return

            logger.info(
                "An admin access request was made, but the provided "
                "bearer token did not match the configured admin secret"
            )

            await grpc_context.abort(
                code=grpc.StatusCode.UNAUTHENTICATED,
                details='Bearer token does not match the admin secret',
            )

            raise AssertionError  # For `mypy`.

        except SecretNotFoundException:
            logger.debug(
                "Admin secret '%s' not found. "
                "Going to check if an external admin auth application "
                "is configured.",
                ADMIN_SECRET_NAME,
            )

        # If an external application is configured as being responsible for
        # admin auth, delegate to it.
        admin_auth_url: Optional[str] = os.environ.get(
            ENVVAR_REBOOT_ADMIN_AUTH_URL
        )
        if admin_auth_url is not None:
            if admin_auth_url.startswith('http://'):
                admin_auth_endpoint = admin_auth_url.removeprefix('http://')
                channel = grpc.aio.insecure_channel(admin_auth_endpoint)
            elif admin_auth_url.startswith('https://'):
                admin_auth_endpoint = admin_auth_url.removeprefix('https://')
                channel = grpc.aio.secure_channel(
                    admin_auth_endpoint, grpc.ssl_channel_credentials()
                )
            else:
                raise ValueError(
                    f"Invalid value for {ENVVAR_REBOOT_ADMIN_AUTH_URL}: "
                    f"must start with 'http://' or 'https://'"
                )
            stub = admin_auth_pb2_grpc.AuthStub(channel)
            try:
                response = await stub.IsAdmin(
                    admin_auth_pb2.IsAdminRequest(bearer_token=bearer_token),
                )
                if response.is_admin:
                    # TODO(rjh): log this to some sort of audit log.
                    logger.debug(
                        f"Authorized user '{response.user_id}' as being an "
                        "admin of this application"
                    )
                    return

            except grpc.aio.AioRpcError as e:
                # TODO(rjh): log this to some sort of audit log.
                logger.info(
                    "An admin access request was made, but the provided bearer "
                    f"token did not match a known admin: {e.debug_error_string()}"
                )
                await grpc_context.abort(
                    code=e.code(),
                    details=e.details(),
                )
                # mypy doesn't have type information for grpc, and so doesn't
                # know that `abort` never returns.
                raise

            # TODO(rjh): log this to some sort of audit log.
            logger.info(
                "An admin access request was made, but the requesting user "
                "is not an admin for this application"
            )
            await grpc_context.abort(
                code=grpc.StatusCode.PERMISSION_DENIED,
                details=
                'The user identified by the bearer token is not an admin',
            )
            # mypy doesn't have type information for grpc, and so doesn't know
            # that `abort` never returns.
            raise AssertionError

        # TODO: Add a link to the documentation on how to configure an
        # admin secret.
        # https://github.com/reboot-dev/mono/issues/4577
        logger.warning(
            "No admin secret configured, and no external admin auth "
            "application configured. Admin API is disabled."
        )
