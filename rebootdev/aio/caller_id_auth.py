import rbt.v1alpha1.errors_pb2
from log.log import get_logger
from rebootdev.aio.auth import Auth, token_verifiers
from rebootdev.aio.auth.authorizers import Authorizer
from rebootdev.aio.caller_id import APPLICATION_ID_KEY, SPACE_ID_KEY
from rebootdev.aio.contexts import ReaderContext
from rebootdev.aio.types import ApplicationId, SpaceId
from typing import Optional

logger = get_logger(__name__)


class TokenVerifier(token_verifiers.TokenVerifier):

    async def verify_token(
        self,
        context: ReaderContext,
        token: Optional[str],
    ) -> Optional[Auth]:
        caller_id = context._headers.caller_id

        if caller_id is None:
            return None

        return Auth(
            # No user ID; the caller isn't authenticated as a human but
            # as a service.
            user_id=None,
            properties={
                SPACE_ID_KEY: caller_id.space_id,
                APPLICATION_ID_KEY: caller_id.application_id,
            },
        )


def is_from_permitted_applications_by_space(
    # The "*" space ID means "all spaces", the "*" application ID
    # means "all applications in the space".
    permitted_applications_by_space: dict[SpaceId, set[ApplicationId]],
):
    """
    Returns an authorizer callable that allows requests by certain
    applications.
    """

    def authorizer(
        *,
        context: ReaderContext,
        **kwargs,
    ) -> Authorizer.Decision:
        if context.auth is None:
            return rbt.v1alpha1.errors_pb2.Unauthenticated()

        space_id = context.auth.properties.get(SPACE_ID_KEY)
        application_id = context.auth.properties.get(APPLICATION_ID_KEY)
        if space_id is None or application_id is None:
            return rbt.v1alpha1.errors_pb2.Unauthenticated()

        for candidate_space_id in [space_id, "*"]:
            permitted_applications = permitted_applications_by_space.get(
                candidate_space_id
            )
            if permitted_applications is None:
                continue
            if (
                application_id in permitted_applications or
                "*" in permitted_applications
            ):
                return rbt.v1alpha1.errors_pb2.Ok()

        return rbt.v1alpha1.errors_pb2.PermissionDenied()

    return authorizer


class FakeTokenVerifier(token_verifiers.TokenVerifier):

    def __init__(self, space_id: SpaceId, application_id: ApplicationId):
        self._space_id = space_id
        self._application_id = application_id

    async def verify_token(
        self,
        context: ReaderContext,
        token: Optional[str],
    ) -> Optional[Auth]:
        return Auth(
            user_id=None,
            properties={
                SPACE_ID_KEY: self._space_id,
                APPLICATION_ID_KEY: self._application_id,
            },
        )
