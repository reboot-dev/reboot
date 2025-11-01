from __future__ import annotations

import grpc
import json
import opentelemetry.propagate
import uuid
from dataclasses import dataclass
from rebootdev.aio.call import validate_ascii
from rebootdev.aio.internals.contextvars import get_application_id
from rebootdev.aio.types import (
    ApplicationId,
    GrpcMetadata,
    ServerId,
    StateId,
    StateRef,
    StateTypeName,
)
from rebootdev.settings import MAX_BEARER_TOKEN_LENGTH
from rebootdev.time import DateTimeWithTimeZone
from typing import Any, Callable, Optional

# This code ties in with the concept of a Context. There are a lot of open
# questions about what information is carried on a context and how it is
# represented and transmitted. We believe that the Context need to contain
# information about the full call DAG, but it is currently unclear how this
# information should be encoded. Similarly, it is unclear how this information
# should be transmitted. We believe that gRPC metadata is the correct way of
# transmitting this data but the encoding of the DAG into gRPC metadata is not
# well understood.
#
# From the full call DAG information, it should be possible to obtain various
# information that is needed by the Context, such as the current safety level,
# the state that is currently being served, etc. Until we have a better idea for
# how we are a) representing these and b) encoding them into metadata headers,
# we are "cherry picking" the necessary DAG information and sticking it on
# individual headers.
#
# This small library is intended as an abstraction layer to provide the ability
# to encode and decode DAG information as grpc headers without having to care
# too much about the current implementation.

# The header that tells us what application we're targeting.
APPLICATION_ID_HEADER = 'x-reboot-application-id'
# The header that carries state reference information.
STATE_REF_HEADER = 'x-reboot-state-ref'
# The header that carries information about which server this request should
# be handled by.
SERVER_ID_HEADER = 'x-reboot-server-id'

# The id of the workflow being executed, if any.
WORKFLOW_ID_HEADER = 'x-reboot-workflow-id'

# Transaction related headers.
TRANSACTION_IDS_HEADER = 'x-reboot-transaction-ids'
TRANSACTION_COORDINATOR_STATE_TYPE_HEADER = 'x-reboot-transaction-coordinator-state-type'
TRANSACTION_COORDINATOR_STATE_REF_HEADER = 'x-reboot-transaction-coordinator-state-ref'
TRANSACTION_PARTICIPANTS_HEADER = 'x-reboot-transaction-participants'
TRANSACTION_PARTICIPANTS_TO_ABORT_HEADER = 'x-reboot-transaction-participants-to-abort'

# The header that carries the idempotency key for a mutation.
#
# TODO(benh): investigate using the proposed 'Idempotency-Key' header
# instead:
# https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header
IDEMPOTENCY_KEY_HEADER = 'x-reboot-idempotency-key'

# Used to transport a secret that identifies app-internal calls.
APP_INTERNAL_AUTHORIZATION_HEADER = 'x-reboot-app-internal'

AUTHORIZATION_HEADER = 'authorization'

COOKIE_HEADER = 'cookie'

# Headers for calling/scheduling tasks directly.
TASK_SCHEDULE = 'x-reboot-task-schedule'

# Metadata that's only used in a _trailing_ capacity (never passed in
# a request and thus we don't try and extract it).
TASK_ID_UUID = 'x-reboot-task-id-uuid'

FORWARDED_CLIENT_CERT_HEADER = 'x-forwarded-client-cert'

# OpenTelemetry W3C Trace Context header
# See: https://www.w3.org/TR/trace-context/
TRACEPARENT_HEADER = 'traceparent'
TRACESTATE_HEADER = 'tracestate'


@dataclass(kw_only=True, frozen=True)
class Headers:
    """Dataclass for working with reboot metadata headers.
    """
    # NOTE: in tests when using a `ExternalContext` we might not know our
    # application ID and thus this is optional. That being said, when
    # we receive an RPC we always fill in the application ID based on
    # the asyncio context variable that has been set, and thus we know
    # that we always have an application ID when we have a `Context`.
    application_id: Optional[ApplicationId]
    state_ref: StateRef
    workflow_id: Optional[uuid.UUID] = None

    # Transaction IDs that make up the path from root and nested
    # transactions to the current transaction.
    transaction_ids: Optional[list[uuid.UUID]] = None
    transaction_coordinator_state_type: Optional[StateTypeName] = None
    transaction_coordinator_state_ref: Optional[StateRef] = None

    idempotency_key: Optional[uuid.UUID] = None

    bearer_token: Optional[str] = None

    task_schedule: Optional[DateTimeWithTimeZone] = None

    server_id: Optional[ServerId] = None

    cookie: Optional[str] = None

    # TODO(rjh,stuhood): once the new authorization model is in place we want to
    #                    use a standard `TokenVerifier`/`Authorizer` combination
    #                    in places that need to read this header, instead of
    #                    making this an official Reboot header.
    forwarded_client_cert: Optional[str] = None
    app_internal_authorization: Optional[str] = None

    # OpenTelemetry W3C Trace Context headers for manual span context
    # propagation when not using opentelemetry's automatic gRPC interceptors.
    traceparent: Optional[str] = None
    tracestate: Optional[str] = None

    def __post_init__(self):
        validate_ascii(
            self.bearer_token,
            'bearer_token',
            MAX_BEARER_TOKEN_LENGTH,
            # It is never legal to have a newline in values that may get encoded
            # into headers.
            illegal_characters='\n',
        )

        # Automatically populate OpenTelemetry tracing headers if not
        # already set and if a tracing context is present.
        if self.traceparent is None and self.tracestate is None:
            carrier: dict[str, str] = {}
            opentelemetry.propagate.inject(carrier)
            if TRACEPARENT_HEADER in carrier:
                # `__setattr__` is a workaround for this object being
                # frozen post-init.
                object.__setattr__(
                    self, 'traceparent', carrier[TRACEPARENT_HEADER]
                )
            if TRACESTATE_HEADER in carrier:
                # `__setattr__` is a workaround for this object being
                # frozen post-init.
                object.__setattr__(
                    self, 'tracestate', carrier[TRACESTATE_HEADER]
                )

    def copy_for_token_verification_and_authorization(self):
        """Returns a copy of the headers that is suitable for use when doing
        token verification or authorization.

        In particular, we drop anything related to transactions (as we
        don't want to include token verification or authorization as
        part of the transaction), the idempotency key. Some users might want to
        have access to the bearer token in their authorizers (i.e., to pass it
        to a third part service), so we keep it in the copy.
        """
        return Headers(
            application_id=self.application_id,
            server_id=self.server_id,
            state_ref=self.state_ref,
            cookie=self.cookie,
            forwarded_client_cert=self.forwarded_client_cert,
            app_internal_authorization=self.app_internal_authorization,
            bearer_token=self.bearer_token,
            traceparent=self.traceparent,
            tracestate=self.tracestate,
        )

    @classmethod
    def from_grpc_context(
        cls,
        grpc_context: grpc.aio.ServicerContext,
    ) -> Headers:
        """Convert and parse gRPC metadata from a gRPC context to `Headers`."""
        # Extract the raw gRPC metadata from gRPC context to dictionary.
        return cls.from_grpc_metadata(grpc_context.invocation_metadata())

    @classmethod
    def from_grpc_metadata(
        cls,
        metadata: GrpcMetadata,
    ) -> Headers:
        """Convert and parse gRPC metadata to `Headers`."""
        raw_headers = dict(metadata)

        def extract_maybe(
            name: str,
            *,
            required=False,
            convert: Callable[[str], Any] = lambda value: value,
        ) -> Optional[Any]:
            try:
                return convert(raw_headers[name])
            except KeyError as e:
                if required:
                    raise ValueError(f"gRPC metadata missing '{name}'") from e
                else:
                    return None

        def extract(
            name: str,
            *,
            convert: Callable[[str], Any] = lambda value: value,
        ) -> Any:
            return extract_maybe(name, required=True, convert=convert)

        # For now, we always use the application ID provided in the
        # asyncio context variable because in tests when using a
        # `ExternalContext` we don't always know the application ID (e.g.,
        # because we've done `rbt.up(...)` more than once but aren't
        # passing a `gateway` to `ExternalContext`).
        #
        # NOTE: the asyncio context variable gets set via the
        # `UseApplicationIdInterceptor` which is added to every
        # server. If we have a `grpc_context`, then we must have been
        # called through a gRPC server, with which we injected the
        # interceptor.
        application_id = get_application_id()
        assert application_id is not None

        server_id = extract_maybe(SERVER_ID_HEADER)

        # We use `from_maybe_readable` as an affordance for hand-written calls.
        state_ref = StateRef.from_maybe_readable(extract(STATE_REF_HEADER))

        workflow_id: Optional[uuid.UUID] = extract_maybe(
            WORKFLOW_ID_HEADER,
            convert=lambda value: uuid.UUID(value),
        )

        transaction_ids: Optional[list[uuid.UUID]] = extract_maybe(
            TRANSACTION_IDS_HEADER,
            convert=lambda value: [
                uuid.UUID(transaction_id)
                for transaction_id in json.loads(value)
            ],
        )

        transaction_coordinator_state_type: Optional[
            StateTypeName] = extract_maybe(
                TRANSACTION_COORDINATOR_STATE_TYPE_HEADER,
                required=transaction_ids is not None,
            )

        transaction_coordinator_state_ref_str: Optional[str] = extract_maybe(
            TRANSACTION_COORDINATOR_STATE_REF_HEADER,
            required=transaction_ids is not None,
        )
        transaction_coordinator_state_ref = (
            StateRef(transaction_coordinator_state_ref_str)
            if transaction_coordinator_state_ref_str is not None else None
        )

        idempotency_key: Optional[uuid.UUID] = extract_maybe(
            IDEMPOTENCY_KEY_HEADER,
            convert=lambda value: uuid.UUID(value),
        )

        bearer_token: Optional[str] = extract_maybe(
            AUTHORIZATION_HEADER,
            convert=lambda value: value.removeprefix('Bearer '),
        )

        task_schedule: Optional[DateTimeWithTimeZone] = extract_maybe(
            TASK_SCHEDULE,
            # If the value of the header is empty, we default to the current
            # time.
            convert=lambda value: DateTimeWithTimeZone.fromisoformat(value)
            if len(value) else DateTimeWithTimeZone.now(),
        )

        cookie: Optional[str] = extract_maybe(COOKIE_HEADER)

        forwarded_client_cert: Optional[str] = extract_maybe(
            FORWARDED_CLIENT_CERT_HEADER
        )

        app_internal_authorization: Optional[str] = extract_maybe(
            APP_INTERNAL_AUTHORIZATION_HEADER
        )

        traceparent: Optional[str] = extract_maybe(TRACEPARENT_HEADER)
        tracestate: Optional[str] = extract_maybe(TRACESTATE_HEADER)

        return cls(
            application_id=application_id,
            server_id=server_id,
            state_ref=state_ref,
            workflow_id=workflow_id,
            transaction_ids=transaction_ids,
            transaction_coordinator_state_type=
            transaction_coordinator_state_type,
            transaction_coordinator_state_ref=transaction_coordinator_state_ref,
            idempotency_key=idempotency_key,
            bearer_token=bearer_token,
            task_schedule=task_schedule,
            cookie=cookie,
            forwarded_client_cert=forwarded_client_cert,
            app_internal_authorization=app_internal_authorization,
            traceparent=traceparent,
            tracestate=tracestate,
        )

    @property
    def state_id(self) -> StateId:
        """Return the StateId."""
        return self.state_ref.id

    def to_grpc_metadata(self) -> GrpcMetadata:
        """Encode these headers as gRPC metadata."""

        def maybe_add_application_id_header() -> GrpcMetadata | tuple[()]:
            if self.application_id is not None:
                return ((APPLICATION_ID_HEADER, self.application_id),)
            return ()

        def maybe_add_server_id_header() -> GrpcMetadata | tuple[()]:
            if self.server_id is not None:
                return ((SERVER_ID_HEADER, self.server_id),)
            return ()

        def maybe_add_authorization_header() -> GrpcMetadata | tuple[()]:
            if self.bearer_token is not None:
                return (
                    (AUTHORIZATION_HEADER, f'Bearer {self.bearer_token}'),
                )
            return ()

        def maybe_add_cookie_header() -> GrpcMetadata | tuple[()]:
            if self.cookie is not None:
                return ((COOKIE_HEADER, self.cookie),)
            return ()

        def maybe_add_app_internal_authorization_header(
        ) -> GrpcMetadata | tuple[()]:
            if self.app_internal_authorization is not None:
                return (
                    (
                        APP_INTERNAL_AUTHORIZATION_HEADER,
                        self.app_internal_authorization
                    ),
                )
            return ()

        def maybe_add_workflow_headers() -> GrpcMetadata | tuple[()]:
            if self.workflow_id is not None:
                return ((WORKFLOW_ID_HEADER, str(self.workflow_id)),)
            return ()

        def maybe_add_transaction_headers() -> GrpcMetadata | tuple[()]:
            if self.transaction_ids is not None:
                assert len(self.transaction_ids) > 0
                assert self.transaction_coordinator_state_type is not None
                assert self.transaction_coordinator_state_ref is not None
                return (
                    (
                        TRANSACTION_IDS_HEADER,
                        json.dumps(
                            [
                                str(transaction_id)
                                for transaction_id in self.transaction_ids
                            ]
                        )
                    ),
                    (
                        TRANSACTION_COORDINATOR_STATE_TYPE_HEADER,
                        self.transaction_coordinator_state_type
                    ),
                    (
                        TRANSACTION_COORDINATOR_STATE_REF_HEADER,
                        self.transaction_coordinator_state_ref.to_str()
                    ),
                )
            return ()

        def maybe_add_idempotency_key_header() -> GrpcMetadata | tuple[()]:
            if self.idempotency_key is not None:
                return ((IDEMPOTENCY_KEY_HEADER, str(self.idempotency_key)),)
            return ()

        def maybe_add_opentelemetry_headers() -> GrpcMetadata | tuple[()]:
            headers: GrpcMetadata | tuple[()] = ()
            if self.traceparent is not None:
                headers += ((TRACEPARENT_HEADER, self.traceparent),)
            if self.tracestate is not None:
                headers += ((TRACESTATE_HEADER, self.tracestate),)
            return headers

        return (
            ((STATE_REF_HEADER, self.state_ref.to_str()),) +
            maybe_add_application_id_header() + maybe_add_server_id_header() +
            maybe_add_authorization_header() + maybe_add_cookie_header() +
            maybe_add_app_internal_authorization_header() +
            maybe_add_transaction_headers() + maybe_add_workflow_headers() +
            maybe_add_idempotency_key_header() +
            maybe_add_opentelemetry_headers()
        )
