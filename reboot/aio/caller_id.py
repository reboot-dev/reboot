import base64
from dataclasses import dataclass
from reboot.aio.auth import Auth
from reboot.aio.types import ApplicationId, SpaceId
from reboot.naming import ensure_valid_application_id, ensure_valid_space_id
from typing import Optional

SPACE_ID_KEY = "space_id"
APPLICATION_ID_KEY = "application_id"
AUTH_KEY = "auth"


@dataclass
class CallerID:
    """
    Identifies the calling application in a request.
    """

    application_id: ApplicationId
    space_id: Optional[SpaceId] = None

    # The `Auth` of the caller on whose behalf the application is
    # calling, i.e., the `context.auth` of the calling method. A callee
    # only honors it when `application_id` is its own, i.e., on an
    # app-internal call, which is what makes it trustworthy.
    auth: Optional[Auth] = None

    def __str__(self) -> str:
        """
        The string representation of this CallerID.

        Caller ID strings have the form:
          "[space_id={space_id},]application_id={application_id}[,auth={auth}]"

        where `auth` is a base64 encoded `rbt.v1alpha1.Auth`. This
        format allows for future expansion by adding more key/value
        pairs.
        """
        return (
            (
                f"{SPACE_ID_KEY}={self.space_id},"
                if self.space_id is not None else ""
            ) + f"{APPLICATION_ID_KEY}={self.application_id}" + (
                f",{AUTH_KEY}="
                f"{base64.b64encode(self.auth.to_proto_bytes()).decode()}"
                if self.auth is not None else ""
            )
        )

    @classmethod
    def parse(cls, caller_id: str) -> "CallerID":
        """Parse a caller ID string into a CallerID object."""
        caller_id_parts = caller_id.split(",")

        # Currently, application caller IDs are always of the form
        # `[space_id={space_id},]application_id={application_id}`, but
        # we politely ignore any unknown key/value pairs for forwards
        # compatibility with possible future expansion (e.g.
        # organization ID, cluster ID, library ID, ...?).
        values: dict[str, str] = {}
        for part in caller_id_parts:
            if part == "":
                continue
            key_value = part.split("=", 1)
            if len(key_value) != 2:
                raise ValueError(f"Invalid caller ID part: '{part}'")
            key, value = key_value
            values[key] = value

        space_id_str = values.get(SPACE_ID_KEY)
        application_id_str = values.get(APPLICATION_ID_KEY)
        auth_str = values.get(AUTH_KEY)
        if application_id_str is None:
            raise ValueError("Missing application ID in caller ID")

        return cls(
            space_id=ensure_valid_space_id(space_id_str)
            if space_id_str is not None else None,
            application_id=ensure_valid_application_id(application_id_str),
            auth=Auth.from_proto_bytes(
                base64.b64decode(auth_str, validate=True)
            ) if auth_str is not None else None,
        )
