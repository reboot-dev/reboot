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
        generated: bool = False,
    ):
        """Constructs an idempotency instance. At most one of 'alias' or
        'key' should be specified. If neither is specified, a idempotency
        key will be `generated`.

        :param alias: human readable alias, e.g., 'Charge credit
        card', that _must_ be unique within the lifetime of the
        current context.

        :param key: idempotency key. It might accept a string which is forwarded
            from the Typescript code, but will try convert it to a UUID.

        :param generated: whether or not something has already
            generated the alias or key.
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

        self._generated = generated

    @property
    def alias(self) -> Optional[str]:
        """Returns the alias or None."""
        return self._alias

    @property
    def key(self) -> Optional[uuid.UUID]:
        """Returns the key or None."""
        return self._key

    @property
    def generated(self) -> bool:
        """Returns whether or not a key or alias has already been generated."""
        return self._generated

    @property
    def per_workflow(self) -> bool:
        """Returns whether this is from `.per_workflow()`."""
        # TODO: pass along this intent rather than deducing it here,
        # which technically we could get wrong if someone passes
        # `generated` incorrectly.
        return self._key is None and not self._generated

    @property
    def per_iteration(self) -> bool:
        """Returns whether this is from `.per_iteration()`."""
        # TODO: pass along this intent rather than deducing it here,
        # which technically we could get wrong if someone passes
        # `generated` incorrectly.
        return self._alias is not None and self._generated

    @property
    def always(self) -> bool:
        """Returns whether this is from `.always()`."""
        # TODO: pass along this intent rather than deducing it here,
        # which technically we could get wrong if someone passes
        # `generated` incorrectly.
        return self._key is not None and self._generated

    @property
    def generate(self) -> bool:
        """Returns whether or not to generate idempotency."""
        return self._key is None and self._alias is None


@dataclass(kw_only=True)
class RPC:
    # Identifiers of the RPC being performed.
    state_type_name: StateTypeName
    state_ref: StateRef

    # Method identifiers, or none if this is for an inline writer.
    service_name: Optional[ServiceName]
    method: Optional[str]
    mutation: bool

    # Request of the RPC being performed, or none if this is
    # for an inline writer.
    request: Optional[Message]

    # Serialized request of the RPC being performed
    # (optionally, lazily computed in the event it is never
    # necessary so we don't always pay for serialization).
    serialized_request: Optional[bytes]

    # Metadata of the RPC being performed.
    metadata: Optional[GrpcMetadata]


@dataclass(kw_only=True, frozen=True)
class Checkpoint:
    """Captures all `IdempotencyManager` instance variables for
    checkpoint/restore functionality."""
    aliases: dict[tuple[StateRef, str], uuid.UUID]
    rpcs: dict[uuid.UUID, RPC]
    mutations_without_idempotency: bool
    uncertain_mutation: bool
    uncertain_mutation_state_type_name: Optional[StateTypeName]
    uncertain_mutation_state_ref: Optional[StateRef]
    uncertain_mutation_service_name: Optional[ServiceName]
    uncertain_mutation_method: Optional[str]


class IdempotencyManager:

    # Map from (state_ref, alias) to a generated UUID for an idempotency key.
    _aliases: dict[tuple[StateRef, str], uuid.UUID]

    # Map from idempotency key to its RPC.
    _rpcs: dict[uuid.UUID, RPC]

    # We need to track whether or not any mutations without idempotency
    # have been made so that we know whether or not to toggle
    # uncertainty if a mutation fails. Not that the mutation that
    # fails might in fact be an idempotent mutation, but attempting to
    # perform a mutation without idempotency _after_ a mutation has
    # failed may be due to a user doing a manual retry which may cause
    # an additional undesired mutation.
    _mutations_without_idempotency: bool

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
        self._rpcs = {}
        self._mutations_without_idempotency = False
        self._uncertain_mutation = False
        self._uncertain_mutation_state_type_name = None
        self._uncertain_mutation_state_ref = None
        self._uncertain_mutation_service_name = None
        self._uncertain_mutation_method = None

    def checkpoint(self):
        return Checkpoint(
            aliases=self._aliases.copy(),
            rpcs=self._rpcs.copy(),
            mutations_without_idempotency=self._mutations_without_idempotency,
            uncertain_mutation=self._uncertain_mutation,
            uncertain_mutation_state_type_name=self.
            _uncertain_mutation_state_type_name,
            uncertain_mutation_state_ref=self._uncertain_mutation_state_ref,
            uncertain_mutation_service_name=self.
            _uncertain_mutation_service_name,
            uncertain_mutation_method=self._uncertain_mutation_method,
        )

    def restore(self, checkpoint: Checkpoint):
        self._aliases = checkpoint.aliases
        self._rpcs = checkpoint.rpcs
        self._mutations_without_idempotency = checkpoint.mutations_without_idempotency
        self._uncertain_mutation = checkpoint.uncertain_mutation
        self._uncertain_mutation_state_type_name = checkpoint.uncertain_mutation_state_type_name
        self._uncertain_mutation_state_ref = checkpoint.uncertain_mutation_state_ref
        self._uncertain_mutation_service_name = checkpoint.uncertain_mutation_service_name
        self._uncertain_mutation_method = checkpoint.uncertain_mutation_method

    @contextmanager
    def idempotently(
        self,
        *,
        state_type_name: StateTypeName,
        state_ref: StateRef,
        service_name: Optional[ServiceName],
        method: Optional[str],
        mutation: bool,
        request: Optional[Message],
        metadata: Optional[GrpcMetadata],
        idempotency: Optional[Idempotency],
        aborted_type: Optional[type[Aborted]],
    ) -> Iterator[Optional[uuid.UUID]]:
        """Ensures that either all RPCs are performed idempotently or
        raises in the face of uncertainty about a mutation to avoid a
        possible undesired mutation."""
        if idempotency is None:
            if self._required:
                assert self._required_reason is not None
                raise IdempotencyRequiredError(self._required_reason)

            if mutation:
                self._mutations_without_idempotency = True

        if self._uncertain_mutation and mutation:
            assert self._uncertain_mutation_state_type_name is not None
            assert self._uncertain_mutation_state_ref is not None
            uncertain_mutation_name = self._rpc_name(
                self._uncertain_mutation_state_type_name,
                self._uncertain_mutation_service_name,
                self._uncertain_mutation_method,
                True,
            )
            raise IdempotencyUncertainError(
                "Because we don't know if the mutation from calling "
                f"{uncertain_mutation_name} of state "
                f"'{self._uncertain_mutation_state_ref.id}' failed or "
                "succeeded AND you've made some NON-IDEMPOTENT mutations we can't "
                "reliably determine whether or not the call to "
                f"{self._rpc_name(state_type_name, service_name, method, True)} "
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
                    mutation=mutation,
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
            # code that we're wrapping (an RPC to `service`)
            # failed. If this is a mutation we need to determine if
            # this failure might mean that we are uncertain if a
            # mutation occurred or not on the server.
            if not mutation:
                raise

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
            if self._mutations_without_idempotency:
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

    def _rpc_name(
        self,
        state_type_name: StateTypeName,
        service_name: Optional[ServiceName],
        method: Optional[str],
        mutation: bool,
    ):
        if method is None:
            return f"inline {'writer' if mutation else 'reader'} of '{state_type_name}'"
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
        mutation: bool,
        request: Optional[Message],
        metadata: Optional[GrpcMetadata],
        idempotency: Idempotency,
    ) -> uuid.UUID:
        idempotency_key = self._get_or_create_idempotency_key(
            state_type_name=state_type_name,
            state_ref=state_ref,
            service_name=service_name,
            method=method,
            mutation=mutation,
            idempotency=idempotency,
        )

        if idempotency_key not in self._rpcs:
            self._rpcs[idempotency_key] = RPC(
                state_type_name=state_type_name,
                state_ref=state_ref,
                service_name=service_name,
                method=method,
                mutation=mutation,
                request=request,
                serialized_request=None,
                metadata=metadata,
            )
            return idempotency_key

        rpc = self._rpcs[idempotency_key]

        # If we're seeing an RPC that maps to this idempotency key
        # _again_ and the idempotency _key_ was generated that means
        # someone has made more than one empty `.idempotently()` (or
        # `.per_workflow()` or `.per_iteration()` and we need
        # to error out asking them to explicitly use an idempotency
        # alias or key.
        #
        # NOTE: we distinguish when we need to "generate", i.e.,
        # `idempotency.generate` is true, from when idempotency has
        # already been "generated", i.e., `idempotency.generated` is
        # true. We need to "generate" idempotency from calls to
        # `.idempotently()`, `.per_workflow()` where no key or alias
        # is passed. We have "generated" idempotency in the following
        # two cases:
        #
        # (1) Calling `.always()`, where we generate an idempotency
        #     key for each call.
        #
        # (2) Calling `.per_iteration()` specifically without
        #     any alias where we create an alias based on the current
        #     iteration number.
        #
        # We want to raise an error about (2) but we don't care about
        # (1), and so the invariant here is (2) only creates an
        # `idempotency.alias` not an `idempotency.key` so we can
        # distinguish between the two.
        if idempotency.generate or (
            idempotency.generated and idempotency.key is None
        ):
            raise ValueError(
                "To call "
                f"{self._rpc_name(state_type_name, service_name, method, mutation)} "
                f"of '{state_ref.id}' more than once using the same context an "
                "idempotency alias or key must be specified"
            )

        if (
            rpc.state_type_name != state_type_name or
            rpc.state_ref != state_ref or rpc.method != method
        ):
            raise ValueError(
                "Idempotency key for "
                f"{self._rpc_name(state_type_name, service_name, method, mutation)} "
                f"of state '{state_ref.id}' is being reused _unsafely_; you can "
                "not reuse an idempotency key that was previously used for "
                f"{self._rpc_name(rpc.state_type_name, rpc.service_name, rpc.method, rpc.mutation)} "
                f"of state '{rpc.state_ref.id}'"
            )

        if (
            (rpc.request is None and request is not None) or
            (rpc.request is not None and request is None)
        ):
            raise ValueError(
                "Idempotency key for "
                f"{self._rpc_name(state_type_name, service_name, method, mutation)} "
                f"of state '{state_ref.id}' is being reused _unsafely_; you can "
                "not reuse an idempotency key with a different request"
            )
        elif rpc.request is not None:
            assert request is not None

            if rpc.serialized_request is None:
                rpc.serialized_request = rpc.request.SerializeToString(
                    deterministic=True,
                )

            if rpc.serialized_request != request.SerializeToString(
                deterministic=True,
            ):
                raise ValueError(
                    "Idempotency key for "
                    f"{self._rpc_name(state_type_name, service_name, method, mutation)} "
                    f"of state '{state_ref.id}' is being reused _unsafely_; you can "
                    "not reuse an idempotency key with a different request"
                )

        if rpc.metadata != metadata:
            raise ValueError(
                "Idempotency key for "
                f"{self._rpc_name(state_type_name, service_name, method, mutation)} "
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
        mutation: bool,
        idempotency: Idempotency,
    ) -> uuid.UUID:
        if idempotency.key is not None:
            return idempotency.key

        alias = (
            f'{self._rpc_name(state_type_name, service_name, method, mutation)}'
            f'@{state_ref.id}'
        )

        if idempotency.alias is not None:
            alias += f": {idempotency.alias}"

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
            f'{self._rpc_name(state_type_name, service_name, method, True)}'
        )

        return str(uuid.uuid5(self._seed, alias))
