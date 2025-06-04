import uuid
from contextlib import contextmanager
from dataclasses import dataclass
from google.protobuf.message import Message
from rebootdev.aio.aborted import Aborted
from rebootdev.aio.exceptions import InputError
from rebootdev.aio.types import (
    GrpcMetadata,
    InvalidIdempotencyKeyError,
    ServiceName,
    StateId,
    StateRef,
    StateTypeName,
    validate_ascii,
)
from rebootdev.settings import DOCS_BASE_URL, MAX_IDEMPOTENCY_KEY_LENGTH
from typing import Iterator, Optional


class IdempotencyRequiredError(InputError):
    pass


class IdempotencyUncertainError(RuntimeError):
    pass


class Idempotency:
    """Describes how to perform a mutation idempotently, either by using a
    human readable alias, e.g., 'Charge credit card', and letting the
    system generate a key, or by explicitly providing the key.
    """

    def __init__(
        self,
        *,
        alias: Optional[str] = None,
        key: Optional[uuid.UUID | str] = None,
    ):
        """Constructs an idempotency instance. At most one of 'alias' or
        'key' should be specified. If neither is specified, a idempotency
        key will be `generated`.

        :param alias: human readable alias, e.g., 'Charge credit
        card', that _must_ be unique within the lifetime of the
        current context.

        :param key: idempotency key. It might accept a string which is forwarded
            from the Typescript code, but will try convert it to a UUID.
        """
        if alias is not None and key is not None:
            raise ValueError(
                'At most one of the positional argument `alias` '
                'or the keyword argument `key` should be specified; '
                f'see {DOCS_BASE_URL}/learn/idempotency '
                'for more information'
            )
        self._key: Optional[uuid.UUID] = None

        if key is not None:
            validate_ascii(
                key,
                'key',
                MAX_IDEMPOTENCY_KEY_LENGTH,
                illegal_characters='\n',
                error_type=InvalidIdempotencyKeyError,
            )

            if isinstance(key, str):
                try:
                    self._key = uuid.UUID(key)
                except ValueError as e:
                    raise InvalidIdempotencyKeyError(str(e))
            else:
                self._key = key

        self._alias = alias

    @property
    def alias(self) -> Optional[str]:
        """Returns the alias or None."""
        return self._alias

    @property
    def key(self) -> Optional[uuid.UUID]:
        """Returns the key or None."""
        return self._key

    @property
    def generate(self) -> bool:
        """Returns whether or not to generate idempotency."""
        return self._key is None and self._alias is None


class IdempotencyManager:

    @dataclass(kw_only=True)
    class Mutation:
        # Identifiers of the mutation being performed.
        state_type_name: StateTypeName
        state_ref: StateRef

        # Method identifiers, or none if this is for an inline writer.
        service_name: Optional[ServiceName]
        method: Optional[str]

        # Request of the mutation being performed, or none if this is
        # for an inline writer.
        request: Optional[Message]

        # Serialized request of the mutation being performed
        # (optionally, lazily computed in the event it is never
        # necessary so we don't always pay for serialization).
        serialized_request: Optional[bytes]

        # Metadata of the mutation being performed.
        metadata: Optional[GrpcMetadata]

        # Whether or not idempotency for this mutation was generated.
        idempotency_generated: bool

    # Map from (state_ref, alias) to a generated UUID for an idempotency key.
    _aliases: dict[tuple[StateRef, str], uuid.UUID]

    # Map from idempotency key to its mutation.
    _mutations: dict[uuid.UUID, Mutation]

    # We need to track whether or not any RPCs without idempotency
    # have been made so that we know whether or not to toggle
    # uncertainty if a mutation fails. Not that the mutation that
    # fails might in fact be an idempotent mutation, but attempting to
    # perform a mutation without idempotency _after_ a mutation has
    # failed may be due to a user doing a manual retry which may cause
    # an additional undesired mutation.
    _rpcs_without_idempotency: bool

    # Whether or not a mutation's success or failure is uncertain.
    _uncertain_mutation: bool

    # The state, service, and method of the mutation that is uncertain.
    _uncertain_mutation_state_type_name: Optional[StateTypeName]
    _uncertain_mutation_state_ref: Optional[StateRef]
    _uncertain_mutation_service_name: Optional[ServiceName]
    _uncertain_mutation_method: Optional[str]

    def __init__(
        self,
        *,
        seed: Optional[uuid.UUID] = None,
        required: bool = False,
        required_reason: Optional[str] = None,
    ):
        self._seed = seed

        self._required = required
        self._required_reason = required_reason

        assert (
            (not self._required and self._required_reason is None) or
            (self._required and self._required_reason is not None)
        )

        self.reset()

    def reset(self):
        self._aliases = {}
        self._mutations = {}
        self._rpcs_without_idempotency = False
        self._uncertain_mutation = False
        self._uncertain_mutation_state_type_name = None
        self._uncertain_mutation_state_ref = None
        self._uncertain_mutation_service_name = None
        self._uncertain_mutation_method = None

    @contextmanager
    def idempotently(
        self,
        *,
        state_type_name: StateTypeName,
        state_ref: StateRef,
        service_name: Optional[ServiceName],
        method: Optional[str],
        request: Optional[Message],
        metadata: Optional[GrpcMetadata],
        idempotency: Optional[Idempotency],
        aborted_type: Optional[type[Aborted]],
    ) -> Iterator[Optional[uuid.UUID]]:
        """Ensures that either all mutations are performed idempotently or
        raises in the face of uncertainty about a mutation to avoid a
        possible undesired mutation."""
        if idempotency is None:
            if self._required:
                assert self._required_reason is not None
                raise IdempotencyRequiredError(self._required_reason)

            self._rpcs_without_idempotency = True

        if self._uncertain_mutation:
            assert self._uncertain_mutation_state_type_name is not None
            assert self._uncertain_mutation_state_ref is not None
            uncertain_mutation_name = self._mutation_name(
                self._uncertain_mutation_state_type_name,
                self._uncertain_mutation_service_name,
                self._uncertain_mutation_method,
            )
            raise IdempotencyUncertainError(
                "Because we don't know if the mutation from calling "
                f"{uncertain_mutation_name} of state "
                f"'{self._uncertain_mutation_state_ref.id}' failed or "
                "succeeded AND you've made some NON-IDEMPOTENT RPCs we can't "
                "reliably determine whether or not the call to "
                f"{self._mutation_name(state_type_name, service_name, method)} "
                f"of state '{state_ref.id}' is due to a retry which may cause "
                "an undesired mutation -- if you are trying to write your own "
                "manual retry logic you should ensure you're always using an "
                "idempotency alias (or passing an explicit idempotency key) "
                "for mutations"
            )

        try:
            if idempotency is not None:
                yield self._idempotency_key_from(
                    state_type_name=state_type_name,
                    state_ref=state_ref,
                    service_name=service_name,
                    method=method,
                    request=request,
                    metadata=metadata,
                    idempotency=idempotency,
                )
            else:
                yield None
        # TODO(benh): differentiate errors so that we only set
        # uncertainty when we are truly uncertain.
        except BaseException as exception:
            # The `yield` threw an exception, which means the user
            # code that we're wrapping (an RPC to a mutation on
            # `service`) failed. We need to determine if this failure
            # might mean that we are uncertain if a mutation occurred
            # or not on the server.
            if (
                aborted_type is not None and
                aborted_type.is_from_backend_and_safe(exception)
            ):
                # We are not uncertain because we _must_ have gotten
                # this from the backend, so just let it propagate.
                raise

            # We're uncertain whether that mutation succeeded or
            # failed (there are many ways exceptions can get thrown,
            # and not all errors can be clear on whether the RPC has
            # definitively failed on the server).
            #
            # We want to set uncertainty regardless of whether or not
            # _this_ call has an idempotency key because a user might
            # manually _retry_ another call that did not have an
            # idempotency key and accidentally perform a mutation more
            # than once.
            if self._rpcs_without_idempotency:
                assert not self._uncertain_mutation
                self._uncertain_mutation = True
                self._uncertain_mutation_state_type_name = state_type_name
                self._uncertain_mutation_state_ref = state_ref
                self._uncertain_mutation_service_name = service_name
                self._uncertain_mutation_method = method
            raise

    def acknowledge_idempotency_uncertainty(self):
        assert self._uncertain_mutation
        self._uncertain_mutation = False
        self._uncertain_mutation_state_type_name = None
        self._uncertain_mutation_state_ref = None
        self._uncertain_mutation_service_name = None
        self._uncertain_mutation_method = None

    def _mutation_name(
        self,
        state_type_name: StateTypeName,
        service_name: Optional[ServiceName],
        method: Optional[str],
    ):
        if method is None:
            return f"inline writer of '{state_type_name}'"
        else:
            assert service_name is not None
            return f"'{service_name}.{method}'"

    def _idempotency_key_from(
        self,
        *,
        state_type_name: StateTypeName,
        state_ref: StateRef,
        service_name: Optional[ServiceName],
        method: Optional[str],
        request: Optional[Message],
        metadata: Optional[GrpcMetadata],
        idempotency: Idempotency,
    ) -> uuid.UUID:
        idempotency_key = self._get_or_create_idempotency_key(
            state_type_name=state_type_name,
            state_ref=state_ref,
            service_name=service_name,
            method=method,
            idempotency=idempotency,
        )

        if idempotency_key not in self._mutations:
            self._mutations[idempotency_key] = IdempotencyManager.Mutation(
                state_type_name=state_type_name,
                state_ref=state_ref,
                service_name=service_name,
                method=method,
                request=request,
                serialized_request=None,
                metadata=metadata,
                idempotency_generated=idempotency.generate,
            )
            return idempotency_key

        mutation = self._mutations[idempotency_key]

        # If we're seeing a mutation that maps to this idempotency key
        # _again_ and the idempotency was generated that means someone
        # has made more than one empty `.idempotently()` and we need
        # to error out asking them to explicitly use an idempotency
        # alias or key.
        if mutation.idempotency_generated:
            raise ValueError(
                "To call "
                f"{self._mutation_name(state_type_name, service_name, method)} "
                f"of '{state_ref.id}' more than once using the same context an "
                "idempotency alias or key must be specified"
            )

        if (
            mutation.state_type_name != state_type_name or
            mutation.state_ref != state_ref or mutation.method != method
        ):
            raise ValueError(
                "Idempotency key for "
                f"{self._mutation_name(state_type_name, service_name, method)} "
                f"of state '{state_ref.id}' is being reused _unsafely_; you can "
                "not reuse an idempotency key that was previously used for "
                f"{self._mutation_name(mutation.state_type_name, mutation.service_name, mutation.method)} "
                f"of state '{mutation.state_ref.id}'"
            )

        if (
            (mutation.request is None and request is not None) or
            (mutation.request is not None and request is None)
        ):
            raise ValueError(
                "Idempotency key for "
                f"{self._mutation_name(state_type_name, service_name, method)} "
                f"of state '{state_ref.id}' is being reused _unsafely_; you can "
                "not reuse an idempotency key with a different request"
            )
        elif mutation.request is not None:
            assert request is not None

            if mutation.serialized_request is None:
                mutation.serialized_request = mutation.request.SerializeToString(
                    deterministic=True,
                )

            if mutation.serialized_request != request.SerializeToString(
                deterministic=True,
            ):
                raise ValueError(
                    "Idempotency key for "
                    f"{self._mutation_name(state_type_name, service_name, method)} "
                    f"of state '{state_ref.id}' is being reused _unsafely_; you can "
                    "not reuse an idempotency key with a different request"
                )

        if mutation.metadata != metadata:
            raise ValueError(
                "Idempotency key for "
                f"{self._mutation_name(state_type_name, service_name, method)} "
                f"of state '{state_ref.id}' is being reused _unsafely_; you can "
                "not reuse an idempotency key with different metadata"
            )

        return idempotency_key

    def _get_or_create_idempotency_key(
        self,
        *,
        state_type_name: StateTypeName,
        state_ref: StateRef,
        service_name: Optional[ServiceName],
        method: Optional[str],
        idempotency: Idempotency,
    ) -> uuid.UUID:
        if idempotency.key is not None:
            return idempotency.key

        alias = (
            idempotency.alias if idempotency.alias is not None else
            f'{self._mutation_name(state_type_name, service_name, method)}'
            f'@{state_ref.id}'
        )

        key = (state_ref, alias)

        if key not in self._aliases:
            if self._seed is None:
                self._aliases[key] = uuid.uuid4()
            else:
                # A version 5 UUID is a deterministic hash from a
                # "seed" UUID and some data (bytes or string, in our
                # case the string `alias`).
                self._aliases[key] = uuid.uuid5(self._seed, alias)

        return self._aliases[key]

    def generate_idempotent_state_id(
        self,
        state_type_name: StateTypeName,
        service_name: ServiceName,
        method: str,
        idempotency: Idempotency,
    ) -> StateId:
        if self._seed is None:
            # TODO: This should say something more like "outside of a
            # workflow/initialize", rather than mentioning seeds.
            raise ValueError(
                "Cannot idempotently generate an id for a state "
                f"(of type {state_type_name}) without an idempotency seed."
            )

        if idempotency.key is not None:
            # Generate a UUID based on the specified key.
            return str(uuid.uuid5(self._seed, str(idempotency.key)))

        alias = (
            idempotency.alias if idempotency.alias is not None else
            f'{self._mutation_name(state_type_name, service_name, method)}'
        )

        return str(uuid.uuid5(self._seed, alias))
