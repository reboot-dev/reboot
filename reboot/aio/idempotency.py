import pickle
import uuid
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass
from datetime import datetime, timedelta
from google.protobuf.message import Message
from reboot.aio.aborted import Aborted
from reboot.aio.exceptions import InputError
from reboot.aio.types import (
    GrpcMetadata,
    InvalidIdempotencyKeyError,
    ServiceName,
    StateId,
    StateRef,
    StateTypeName,
    validate_ascii,
)
from reboot.settings import DOCS_BASE_URL, MAX_IDEMPOTENCY_KEY_LENGTH
from typing import Any, Iterator, Literal, Optional, TypeAlias
from uuid7 import create as uuid7  # type: ignore[import]

# NOTE: we're not using an enum because the values that can be
# used in `at_most_once` and `at_least_once` are different than
# `until`.
ALWAYS: Literal["ALWAYS"] = "ALWAYS"
PER_WORKFLOW: Literal["PER_WORKFLOW"] = "PER_WORKFLOW"
PER_ITERATION: Literal["PER_ITERATION"] = "PER_ITERATION"

How: TypeAlias = (
    Literal["ALWAYS"] | Literal["PER_WORKFLOW"] | Literal["PER_ITERATION"]
)

# Stable UUID for deterministically combining the stringified version
# of `idempotency_seeds(...)`.
_REBOOT_IDEMPOTENCY_SEEDS_NAMESPACE: uuid.UUID = uuid.uuid5(
    uuid.NAMESPACE_DNS, "idempotency_seeds.reboot.dev"
)

# Holds the currently-merged idempotency seeds for any active
# `idempotency_seeds(...)` block. Needed so nested blocks can compose
# with inner-overrides-outer semantics.
_idempotency_seeds: ContextVar[Optional[dict[str, Any]]] = ContextVar(
    "Idempotency seeds (if any) to use for generating idempotency keys",
    default=None,
)

# Holds the precomputed UUID derived from the idempotency
# seeds. Consumers (e.g., `memoize`, `_idempotency_key`) read this
# directly so they don't have to recompute the UUID on every memoized
# / idempotent call.
_idempotency_seeds_uuid: ContextVar[Optional[uuid.UUID]] = ContextVar(
    "UUID representing the idempotency seeds (if any)",
    default=None,
)


def make_idempotency_alias(
    base: Optional[str],
    iteration: Optional[int],
) -> Optional[str]:
    """
    Make an idempotency alias string from an optional base alias and an
    optional control-loop `iteration`.
    """
    if base is None and iteration is None:
        return None
    alias = base if base is not None else "-"
    if iteration is not None:
        return f"{alias} (iteration #{iteration})"
    return alias


@contextmanager
def _merge_idempotency_seeds(entries: dict[str, Any]) -> Iterator[None]:
    """Internal context manager used by
    `WorkflowContext.idempotency_seeds(...)`. Not part of the
    public API -- callers should always reach it through a
    seed-bearing context (today only `WorkflowContext`).

    Push key=value entries that scope every `Idempotency`-keyed
    call inside the `with` block.

    All of the values in `entries` must be pickleable and their
    pickled represenation should not _ever_ change, otherwise we may
    generate different idempotency keys from these seeds.

    Every consumer of `Idempotency` -- `at_least_once`,
    `at_most_once`, `until`, idempotent method calls, inline writer
    idempotency -- routes through the same
    `make_derived_idempotency_key` helper, so a single seeds block
    scopes all of them uniformly.

    Nested `with` blocks merge with inner-overrides-outer semantics:
    inner entries shadow outer entries on matching keys, and the outer
    state is restored on exit.

    NOTE: entering a seeds block perturbs every idempotency key
    derived inside it. Any in-flight memoized iteration or
    outstanding idempotency key whose key was derived without the
    seeds will *not* match the new seeded key; those calls will
    re-execute. This is the expected behaviour -- if you add
    seeds, you've defined a new scope.
    """
    idempotency_seeds = _idempotency_seeds.get() or {}
    merged = {**idempotency_seeds, **entries}
    idempotency_seeds_uuid = uuid.uuid5(
        _REBOOT_IDEMPOTENCY_SEEDS_NAMESPACE,
        # We're pinning to `protocol=4` so the derived UUID stays
        # stable across Python upgrades that might change
        # `pickle.DEFAULT_PROTOCOL`.
        pickle.dumps(sorted(merged.items()), protocol=4).hex(),
    )
    previous_idempotency_seeds = _idempotency_seeds.set(merged)
    previous_idempotency_seeds_uuid = _idempotency_seeds_uuid.set(
        idempotency_seeds_uuid
    )
    try:
        yield
    finally:
        _idempotency_seeds_uuid.reset(previous_idempotency_seeds_uuid)
        _idempotency_seeds.reset(previous_idempotency_seeds)


def make_derived_idempotency_key(seed: uuid.UUID, alias: str) -> uuid.UUID:
    """
    Derive a `uuid5` from `(seed, alias)`, folding the
    currently-active (if any) `idempotency_seeds(...)` UUID into the
    seed first when one is in scope.
    """
    idempotency_seeds_uuid = _idempotency_seeds_uuid.get()
    if idempotency_seeds_uuid is not None:
        seed = uuid.uuid5(seed, str(idempotency_seeds_uuid))
    return uuid.uuid5(seed, alias)


def make_expiring_idempotency_key(
    when: timedelta = timedelta(days=7),
) -> uuid.UUID:
    """
    Helper that makes an expiring idempotency key, which by default
    expires after 7 days.
    """
    return uuid7(datetime.now() + when)


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
        how: Optional[How] = None,
        iteration: Optional[int] = None,
    ):
        """Constructs an idempotency instance. At most one of
        'alias' or 'key' should be specified. If neither is
        specified, an idempotency key will be generated.

        :param alias: human readable alias, e.g., 'Charge credit
        card', that _must_ be unique within the lifetime of the
        current context.

        :param key: idempotency key. It might accept a string which
            is forwarded from the Typescript code, but will try
            convert it to a UUID.

        :param how: how idempotency is applied — one of
            `PER_WORKFLOW`, `PER_ITERATION`, or `ALWAYS`,
            or `None` when not within a workflow.

        :param iteration: current iteration number when `how`
            is `PER_ITERATION`, used to scope the idempotency
            key to the current loop iteration.
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

        self._how = how
        self._iteration = iteration

    @property
    def alias(self) -> Optional[str]:
        """Returns the alias, scoped by iteration and any active
        `alias_metadata(...)` block. See `make_idempotency_alias` for
        the composition rules.
        """
        return make_idempotency_alias(self._alias, self._iteration)

    @property
    def key(self) -> Optional[uuid.UUID]:
        """Returns the key or None."""
        return self._key

    @property
    def how(self) -> Optional[How]:
        """Returns how idempotency is applied, or `None` if not
        within a workflow."""
        return self._how

    @property
    def per_workflow(self) -> bool:
        """Returns whether this is from `.per_workflow()`."""
        return self._how == PER_WORKFLOW

    @property
    def per_iteration(self) -> bool:
        """Returns whether this is from `.per_iteration()`."""
        return self._how == PER_ITERATION

    @property
    def always(self) -> bool:
        """Returns whether this is from `.always()`."""
        return self._how == ALWAYS

    @property
    def iteration(self) -> Optional[int]:
        """Returns the iteration number, if any."""
        return self._iteration

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
    aliases: dict[tuple[StateRef, str, Optional[uuid.UUID]], uuid.UUID]
    rpcs: dict[uuid.UUID, RPC]
    mutations_without_idempotency: bool
    uncertain_mutation: bool
    uncertain_mutation_state_type_name: Optional[StateTypeName]
    uncertain_mutation_state_ref: Optional[StateRef]
    uncertain_mutation_service_name: Optional[ServiceName]
    uncertain_mutation_method: Optional[str]


class IdempotencyManager:

    # Map from (state_ref, alias, idempotency_seeds_uuid) to a generated
    # UUID for an idempotency key. The third tuple element is the active
    # `_idempotency_seeds_uuid` (or `None` if no `idempotency_seeds(...)`
    # block is active) so two calls under the same `(state_ref, alias)`
    # but in different seed scopes get distinct slots -- otherwise
    # the first call would "claim" the slot for the lifetime of the
    # manager and subsequent calls in different scopes would receive the
    # first call's UUID, defeating the "new scope" semantics that
    # `idempotency_seeds(...)` promises.
    _aliases: dict[tuple[StateRef, str, Optional[uuid.UUID]], uuid.UUID]

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
        # _again_ and the user didn't provide an explicit alias or
        # key, that means someone has called the same method more
        # than once without distinguishing the calls. Error out
        # asking them to explicitly use an idempotency alias or
        # key.
        #
        # `generate` is True when the user didn't provide an alias or
        # key, which covers bare `.idempotently()`, `.per_workflow()`,
        # or `.per_iteration()` calls.
        #
        # `.always()` has an explicit key so `generate` is
        # False. `.per_iteration("alias")` has an explicit
        # alias so `generate` is also False.
        if idempotency.generate:
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

        # Include the idempotency seeds (if any) in the key so calls
        # in different seed scopes don't collide. The seeds are also
        # folded into the cached UUID's value below (via
        # `make_derived_idempotency_key`), but if we don't also use
        # the seeds in the key then we may get a false collision and
        # short-circuit thinking we already have an idempotency key
        # when we don't.
        key = (state_ref, alias, _idempotency_seeds_uuid.get())

        if key not in self._aliases:
            if self._seed is None:
                # If we don't have a seed then we expect that this
                # idempotency key is only used for retries as part of
                # the current code that is running _right now_, and
                # thus the idempotency key should expire. This may
                # happen, for example, in a transaction where a
                # developer is explicitly trying to make a call
                # `.idempotently()`, or from an external context for
                # similar reasons. While we never expect a transaction
                # to run for longer than 7 days, it's not totally out
                # of the question that an external context might
                # run for so long, but in that case we should tell
                # developers to use a seed. In fact, we might want to
                # consider dropping support for `.idempotently()` with
                # an `ExternalContext` unless using a seed. We'll
                # still retry each mutation with an idempotency key
                # that we generated just before making the call (see
                # 'stubs.py'), but then we won't give people the false
                # believe that because they called `.idempotently()`
                # it'll be safe "forever".
                #
                # Invariant: idempotency seeds can only be added via
                # `WorkflowContext.idempotency_seeds(...)`, and a
                # `WorkflowContext` always has a `_seed`, so if we're
                # in the no-seed branch, we shouldn't have any extra
                # idempotency seeds. We're asserting this so that if
                # `_merge_idempotency_seeds()` gets called on its own
                # in a place where it should not we catch the bug.
                assert _idempotency_seeds.get() is None
                self._aliases[key] = make_expiring_idempotency_key()
            else:
                self._aliases[key] = make_derived_idempotency_key(
                    self._seed, alias
                )

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
            # Need to use `make_derived_idempotency_key` so the active
            # idempotency seeds (if any) are folded into the seed.
            # That keeps the generated state ID scoped consistently
            # with any per-RPC idempotency keys produced by
            # `_get_or_create_idempotency_key`.
            return str(
                make_derived_idempotency_key(self._seed, str(idempotency.key))
            )

        alias = (
            idempotency.alias if idempotency.alias is not None else
            f'{self._rpc_name(state_type_name, service_name, method, True)}'
        )

        # Need to use `make_derived_idempotency_key` so the active
        # idempotency seeds (if any) are folded into the seed. That
        # keeps the generated state ID scoped consistently with any
        # per-RPC idempotency keys produced by
        # `_get_or_create_idempotency_key`.
        return str(make_derived_idempotency_key(self._seed, alias))
