"""Envelope encryption with a revocable wrapping key.

This library implements three-layer envelope encryption:

  root KEK  -- derived from `REBOOT_CRYPTO_ROOT_KEYS` (see `_crypto`);
               wraps wrapping-key material at rest.
  WrappingKey -- a random 256-bit key, stored wrapped under the root KEK;
               the revocable unit. Destroying it crypto-shreds every
               `Ciphertext` it wraps.
  DEK       -- a random per-value key that encrypts the plaintext; itself
               wrapped under a `WrappingKey`.

Callers select a `WrappingKey` by an arbitrary `scope` string, which is
encoded into a state id. A `KeyManager` singleton registers every
`WrappingKey` and runs a long-lived `Watch` control loop that rotates them
onto the active root key version whenever `REBOOT_CRYPTO_ROOT_KEYS` gains a
newer version.

NOTE: these servicers define no authorizer, so they get the default
app-internal-only stance (external callers are denied in production). They
are meant to be called from within the application. An application that
wants to expose any of these methods publicly must add an explicit
authorizer.
"""

import base64
import hashlib
import log.log
import reboot.application
from cryptography.exceptions import InvalidTag
from rbt.std.ciphertext.v1.ciphertext_rbt import (
    Ciphertext,
    CiphertextsRequest,
    CiphertextsResponse,
    DecryptionFailed,
    DecryptRequest,
    DecryptResponse,
    EncryptRequest,
    EncryptResponse,
    KeyManager,
    RegisterRequest,
    RegisterResponse,
    RescopeRequest,
    RescopeResponse,
    RevokeRequest,
    RevokeResponse,
    RewrapUnderRootKeyRequest,
    RewrapUnderRootKeyResponse,
    RotateRequest,
    RotateResponse,
    ScopeShredded,
    ShredRequest,
    ShredResponse,
    StatusRequest,
    StatusResponse,
    UnknownRootKeyVersion,
    UnwrapRequest,
    UnwrapResponse,
    WatchRequest,
    WatchResponse,
    WrappingKey,
    WrapRequest,
    WrapResponse,
)
from rbt.std.collections.ordered_map.v1.ordered_map_rbt import OrderedMap
from reboot.aio.applications import Library
from reboot.aio.concurrently import concurrently
from reboot.aio.contexts import (
    Context,
    ReaderContext,
    TransactionContext,
    WorkflowContext,
    WriterContext,
)
from reboot.aio.workflows import until
from reboot.crypto import root_keys
from reboot.std.ciphertext.v1 import _crypto
from reboot.std.collections.ordered_map.v1 import ordered_map
from reboot.uuidv7 import uuid7
from uuid import uuid4

logger = log.log.get_logger(__name__)

# Id of the application-wide shared `KeyManager`. Many libraries and
# modules within an application instead want their own dedicated
# `KeyManager`; pass this id only when you want to share the default one.
APP_SHARED_KEY_MANAGER_ID = "(key-manager)"

# Number of registry entries to re-wrap per rotation page.
_ROTATE_PAGE_SIZE = 256

# A non-empty marker stored as the value for index entries (the key, an
# id, is all that matters).
_PRESENT = b"\x01"


def make_associated_data(**fields: str) -> bytes:
    """Serializes a string key/value map into canonical `associated_data`
    bytes (an "encryption context", in AWS KMS terms).

    The same value must be supplied to `Decrypt` as was passed to
    `Encrypt`, byte-for-byte, so the encoding is deterministic: the keys
    are sorted, and each key and value is length-prefixed so that no
    value can be confused for a delimiter (unlike an ad-hoc `"a:b"`
    string, where `("a", "b:c")` and `("a:b", "c")` would collide). The
    TypeScript `makeAssociatedData` helper produces identical bytes, so a
    value encrypted from one language decrypts from the other; use ASCII
    keys to keep the sort order identical across languages.

        associated_data=make_associated_data(user_id="42", purpose="ssn")
    """
    parts: list[bytes] = []
    for key in sorted(fields):
        key_bytes = key.encode()
        value_bytes = fields[key].encode()
        parts.append(
            len(key_bytes).to_bytes(4, "big") + key_bytes +
            len(value_bytes).to_bytes(4, "big") + value_bytes
        )
    return b"".join(parts)


def _digest_id(prefix: str, *parts: str) -> str:
    """Hashes `parts` into a valid, collision-resistant Reboot state id.
    Each part is length-prefixed so that no concatenation of one set of
    parts can collide with another (e.g. `("a", "b")` vs `("ab", "")`)."""
    encoded = b"".join(
        len(part.encode()).to_bytes(4, "big") + part.encode() for part in parts
    )
    digest = hashlib.sha256(encoded).digest()
    return prefix + base64.urlsafe_b64encode(digest).decode().rstrip("=")


def _wrapping_key_id(key_manager_id: str, scope: str) -> str:
    """The valid Reboot state id of the (internal) `WrappingKey` that
    protects `scope` within `key_manager_id`. Deterministic and
    collision-resistant (SHA-256); incorporating the manager id keeps each
    manager's keyspace disjoint, so two managers can use the same `scope`
    without sharing a wrapping key.

    `WrappingKey` is an implementation detail: callers shred a scope via
    `KeyManager.ref(key_manager_id).shred(context, scope=...)`, not by
    addressing the wrapping key directly.
    """
    return _digest_id("wk-", key_manager_id, scope)


def _key_manager_registry_id(key_manager_id: str) -> str:
    """The id of the `OrderedMap` registry holding `key_manager_id`'s
    wrapping keys. One registry per manager, so each manager's rotation
    sweep pages only its own keys."""
    return _digest_id("key-manager-registry-", key_manager_id)


def _consumer(key_manager_id: str) -> str:
    """The `Application` root-key-usage consumer id for a `KeyManager`.
    Namespaced by the library so a manager id can't collide with another
    library's consumer, and unique per manager so each is retired
    independently (a root version is retire-able only once *every*
    consumer releases it)."""
    return f"{CIPHERTEXT_LIBRARY_NAME}:{key_manager_id}"


def _material_associated_data(
    wrapping_key_id: str,
    root_key_version: int,
) -> bytes:
    """AAD binding stored wrapping-key material to its key id and the root
    key version it is wrapped under."""
    return f"{wrapping_key_id}|v{root_key_version}".encode()


def _dek_associated_data(wrapping_key_id: str) -> bytes:
    """AAD binding a wrapped DEK to its wrapping key. Deliberately excludes
    the caller's `associated_data` so that re-wrapping a DEK onto another
    key needs neither the plaintext nor that context."""
    return wrapping_key_id.encode()


def _open_material(
    state: WrappingKey.State,
    wrapping_key_id: str,
) -> bytes:
    """Unwraps and returns a wrapping key's raw material, deriving the root
    KEK for the version it was wrapped under. Raises
    `_crypto.UnknownRootKeyVersion` if that version is no longer configured."""
    return _crypto.decrypt(
        key=_crypto.kek(state.root_key_version),
        blob=state.wrapped_key_material,
        associated_data=_material_associated_data(
            wrapping_key_id, state.root_key_version
        ),
    )


class CiphertextServicer(Ciphertext.Servicer):

    @property
    def _wrapping_key(self) -> WrappingKey.WeakReference:
        return WrappingKey.ref(self.state.wrapping_key_id)

    async def encrypt(
        self,
        context: TransactionContext,
        request: EncryptRequest,
    ) -> EncryptResponse:
        # Encrypt the plaintext under a fresh DEK, then wrap the DEK with
        # the `WrappingKey` derived from the caller's manager and scope
        # (created lazily on first use).
        key_manager_id = request.key_manager_id
        wrapping_key_id = _wrapping_key_id(key_manager_id, request.scope)
        dek = _crypto.generate_key()
        data = _crypto.encrypt(
            key=dek,
            plaintext=request.plaintext,
            associated_data=request.associated_data,
        )

        wrap = await WrappingKey.ref(wrapping_key_id).wrap(
            context,
            dek=dek,
            ciphertext_id=context.state_id,
            key_manager_id=key_manager_id,
        )

        self.state.wrapping_key_id = wrapping_key_id
        self.state.key_manager_id = key_manager_id
        self.state.wrapped_dek = wrap.wrapped_dek
        self.state.data = data
        return EncryptResponse()

    async def decrypt(
        self,
        context: ReaderContext,
        request: DecryptRequest,
    ) -> DecryptResponse:
        try:
            unwrap = await self._wrapping_key.unwrap(
                context,
                wrapped_dek=self.state.wrapped_dek,
            )
        except WrappingKey.UnwrapAborted as aborted:
            if isinstance(aborted.error, UnknownRootKeyVersion):
                raise Ciphertext.DecryptAborted(UnknownRootKeyVersion())
            raise Ciphertext.DecryptAborted(ScopeShredded())

        try:
            plaintext = _crypto.decrypt(
                key=unwrap.dek,
                blob=self.state.data,
                associated_data=request.associated_data,
            )
        except InvalidTag:
            raise Ciphertext.DecryptAborted(DecryptionFailed())

        return DecryptResponse(plaintext=plaintext)

    async def rescope(
        self,
        context: TransactionContext,
        request: RescopeRequest,
    ) -> RescopeResponse:
        # Move this ciphertext into a different scope, within the same
        # manager. Only the (tiny) wrapped DEK changes; `data` is untouched.
        key_manager_id = self.state.key_manager_id
        wrapping_key_id = _wrapping_key_id(key_manager_id, request.scope)
        try:
            unwrap = await self._wrapping_key.unwrap(
                context,
                wrapped_dek=self.state.wrapped_dek,
            )
        except WrappingKey.UnwrapAborted as aborted:
            if isinstance(aborted.error, UnknownRootKeyVersion):
                raise Ciphertext.RescopeAborted(UnknownRootKeyVersion())
            raise Ciphertext.RescopeAborted(ScopeShredded())

        wrap = await WrappingKey.ref(wrapping_key_id).wrap(
            context,
            dek=unwrap.dek,
            ciphertext_id=context.state_id,
            key_manager_id=key_manager_id,
        )

        self.state.wrapping_key_id = wrapping_key_id
        self.state.wrapped_dek = wrap.wrapped_dek
        return RescopeResponse()


class WrappingKeyServicer(WrappingKey.Servicer):

    @property
    def _ciphertext_index(self) -> OrderedMap.WeakReference:
        return OrderedMap.ref(self.state.ciphertext_index_id)

    async def wrap(
        self,
        context: TransactionContext,
        request: WrapRequest,
    ) -> WrapResponse:
        # Refuse to wrap into a shredded (revoked) key.
        if self.state.status == WrappingKey.State.REVOKED:
            raise WrappingKey.WrapAborted(ScopeShredded())

        wrapping_key_id = context.state_id
        active_version = root_keys.active_version()

        if not self.state.HasField("wrapped_key_material"):
            # First use: generate material, wrap it under the active root
            # key, register the key with the `KeyManager` (recording the
            # UUIDv7 it was registered under), and create its index.
            material = _crypto.generate_key()
            self.state.wrapped_key_material = _crypto.encrypt(
                key=_crypto.kek(active_version),
                plaintext=material,
                associated_data=_material_associated_data(
                    wrapping_key_id, active_version
                ),
            )
            self.state.root_key_version = active_version
            self.state.ciphertext_index_id = str(uuid4())
            register = await KeyManager.ref(request.key_manager_id).register(
                context,
                wrapping_key_id=wrapping_key_id,
                root_key_version=active_version,
            )
            self.state.key_manager_id = request.key_manager_id
            self.state.key_manager_key = register.uuid
        else:
            try:
                material = _open_material(self.state, wrapping_key_id)
            except _crypto.UnknownRootKeyVersion:
                raise WrappingKey.WrapAborted(UnknownRootKeyVersion())
            # Opportunistically migrate this key forward to the active root
            # key version so old versions can eventually be retired.
            if self.state.root_key_version != active_version:
                self.state.wrapped_key_material = _crypto.encrypt(
                    key=_crypto.kek(active_version),
                    plaintext=material,
                    associated_data=_material_associated_data(
                        wrapping_key_id,
                        active_version,
                    ),
                )
                self.state.root_key_version = active_version

        wrapped_dek = _crypto.encrypt(
            key=material,
            plaintext=request.dek,
            associated_data=_dek_associated_data(wrapping_key_id),
        )

        await self._ciphertext_index.insert(
            context,
            key=request.ciphertext_id,
            bytes=_PRESENT,
        )

        return WrapResponse(wrapped_dek=wrapped_dek)

    async def unwrap(
        self,
        context: ReaderContext,
        request: UnwrapRequest,
    ) -> UnwrapResponse:
        if (
            self.state.status == WrappingKey.State.REVOKED or
            not self.state.HasField("wrapped_key_material")
        ):
            raise WrappingKey.UnwrapAborted(ScopeShredded())

        try:
            material = _open_material(self.state, context.state_id)
        except _crypto.UnknownRootKeyVersion:
            raise WrappingKey.UnwrapAborted(UnknownRootKeyVersion())

        dek = _crypto.decrypt(
            key=material,
            blob=request.wrapped_dek,
            associated_data=_dek_associated_data(context.state_id),
        )
        return UnwrapResponse(dek=dek)

    async def revoke(
        self,
        context: WriterContext,
        request: RevokeRequest,
    ) -> RevokeResponse:
        # Crypto-shred: destroy the key material. Idempotent.
        self.state.status = WrappingKey.State.REVOKED
        self.state.ClearField("wrapped_key_material")
        return RevokeResponse()

    async def rewrap_under_root_key(
        self,
        context: WriterContext,
        request: RewrapUnderRootKeyRequest,
    ) -> RewrapUnderRootKeyResponse:
        # No-op for revoked or never-used keys.
        if (
            self.state.status == WrappingKey.State.REVOKED or
            not self.state.HasField("wrapped_key_material")
        ):
            return RewrapUnderRootKeyResponse()

        active_version = root_keys.active_version()
        if self.state.root_key_version == active_version:
            return RewrapUnderRootKeyResponse()

        try:
            material = _open_material(self.state, context.state_id)
        except _crypto.UnknownRootKeyVersion:
            raise WrappingKey.RewrapUnderRootKeyAborted(
                UnknownRootKeyVersion()
            )

        self.state.wrapped_key_material = _crypto.encrypt(
            key=_crypto.kek(active_version),
            plaintext=material,
            associated_data=_material_associated_data(
                context.state_id, active_version
            ),
        )
        self.state.root_key_version = active_version
        return RewrapUnderRootKeyResponse()

    async def ciphertexts(
        self,
        context: ReaderContext,
        request: CiphertextsRequest,
    ) -> CiphertextsResponse:
        if not self.state.HasField("ciphertext_index_id"):
            return CiphertextsResponse(ciphertext_ids=[])

        resuming = request.HasField("start_after")
        response = await self._ciphertext_index.range(
            context,
            start_key=request.start_after if resuming else None,
            limit=request.limit + 1 if resuming else request.limit,
        )
        entries = response.entries
        if resuming and entries and entries[0].key == request.start_after:
            entries = entries[1:]
        ciphertext_ids = [entry.key for entry in entries][:request.limit]
        return CiphertextsResponse(ciphertext_ids=ciphertext_ids)


class KeyManagerServicer(KeyManager.Servicer):

    @staticmethod
    def _key_manager_registry(context: Context) -> OrderedMap.WeakReference:
        return OrderedMap.ref(_key_manager_registry_id(context.state_id))

    async def register(
        self,
        context: TransactionContext,
        request: RegisterRequest,
    ) -> RegisterResponse:
        # Register under a fresh UUIDv7 (monotonic, so inserts append to
        # the registry's right edge) and return it so the `WrappingKey`
        # can cross-reference its registry entry. The registry is this
        # manager's own, so its rotation sweep pages only its own keys.
        uuid = str(uuid7())
        await self._key_manager_registry(context).insert(
            context,
            key=uuid,
            bytes=request.wrapping_key_id.encode(),
        )
        # Start consuming this root key version the first time we see a key
        # under it. Registering means the new wrapping key's material is
        # already wrapped under this version, so recording it here — in the
        # same transaction — closes the window where the key is in use
        # before its marker exists (otherwise a retirement actor could
        # observe the version as unused and drop it). Subsequent keys under
        # an already-consumed version skip the (idempotent) `Application`
        # write, so we don't hammer the singleton on every wrap.
        if request.root_key_version not in self.state.consuming_versions:
            self.state.consuming_versions.append(request.root_key_version)
            await reboot.application.ref().use_root_key_version(
                context,
                consumer=_consumer(context.state_id),
                version=request.root_key_version,
            )
        # Make sure the rotation watcher is running.
        if not self.state.watch_started:
            await self.ref().schedule().watch(context)
            self.state.watch_started = True
        return RegisterResponse(uuid=uuid)

    async def shred(
        self,
        context: TransactionContext,
        request: ShredRequest,
    ) -> ShredResponse:
        # Crypto-shred the scope by revoking its wrapping key within this
        # manager. `WrappingKey` is an implementation detail, so callers
        # shred by `scope` here rather than addressing the key directly.
        await WrappingKey.ref(
            _wrapping_key_id(context.state_id, request.scope)
        ).revoke(context)
        return ShredResponse()

    async def status(
        self,
        context: ReaderContext,
        request: StatusRequest,
    ) -> StatusResponse:
        consuming = self.state.consuming_versions
        return StatusResponse(
            # The highest version we hold; unset before the first key.
            # Once rotation settles this is the only version we hold.
            active_version=max(consuming) if consuming else None,
            # Holding more than one version means a rotation is in flight.
            rotating=len(consuming) > 1,
        )

    @classmethod
    async def watch(
        cls,
        context: WorkflowContext,
        request: WatchRequest,
    ) -> WatchResponse:
        # A long-lived control loop for watching the env var
        # `REBOOT_CRYPTO_ROOT_KEYS` and triggering a rotation as
        # necessary.
        async for _ in context.loop("Watch"):

            async def newer_version() -> tuple[int, list[int]] | bool:
                key_manager = await KeyManager.ref().read(context)
                active_version = root_keys.active_version()

                # Rotate if we still hold any version older than the env's
                # active one — those keys need migrating forward.
                stale_versions = [
                    version for version in key_manager.consuming_versions
                    if version < active_version
                ]
                if stale_versions:
                    return active_version, stale_versions

                if any(
                    version > active_version
                    for version in key_manager.consuming_versions
                ):
                    logger.warning(
                        "`REBOOT_CRYPTO_ROOT_KEYS` active version "
                        f"v{active_version} is older than a version this "
                        "key manager already holds; waiting for a newer "
                        "version"
                    )
                return False

            active_version, stale_versions = await until(
                "Newer root key version",
                context,
                newer_version,
            )

            consumer = _consumer(context.state_id)

            # The sweep below migrates every stale key onto `active_version`.
            # Start consuming it and mark it in use *before* the sweep, so a
            # key wrapped under it while the sweep is in flight is never left
            # unmarked. Idempotent if `register` already recorded it.
            await reboot.application.ref(
            ).per_iteration("Use root key version").use_root_key_version(
                context,
                consumer=consumer,
                version=active_version,
            )

            async def start_consuming(state: KeyManager.State) -> None:
                if active_version not in state.consuming_versions:
                    state.consuming_versions.append(active_version)

            await KeyManager.ref().per_iteration(
                "Start consuming",
            ).write(context, start_consuming)

            await KeyManager.ref().per_iteration(
                f"Rotate from v{min(stale_versions)} to v{active_version}"
            ).rotate(context)

            # Every stale key is now on `active_version`. Stop consuming the
            # old versions *locally first*, then release their `Application`
            # markers — so the markers stay a conservative superset of our
            # `consuming_versions`: a version we still record as consumed is
            # never reported as unused. A retirement actor reads the markers,
            # so erring on the "still in use" side until the end is safe.
            async def stop_consuming(state: KeyManager.State) -> None:
                for version in stale_versions:
                    if version in state.consuming_versions:
                        state.consuming_versions.remove(version)

            await KeyManager.ref().per_iteration(
                "Stop consuming",
            ).write(context, stop_consuming)

            for version in stale_versions:
                await reboot.application.ref().per_iteration(
                    f"Disuse root key version v{version}"
                ).disuse_root_key_version(
                    context,
                    consumer=consumer,
                    version=version,
                )

        raise AssertionError("Unreachable")

    @classmethod
    async def rotate(
        cls,
        context: WorkflowContext,
        request: RotateRequest,
    ) -> RotateResponse:
        # Re-wrap every wrapping key registered with this manager onto the
        # active root key version. The paging cursor is persisted in
        # `rotation_cursor` so the loop is deterministic across
        # `context.loop` effect-validation re-runs and resumes correctly
        # after a restart.
        #
        # A single pass is sufficient — we never miss a wrapping key
        # registered concurrently with the sweep. Two facts combine:
        # (1) `register` uses monotonic UUIDv7 keys, so a concurrent
        # insert always lands to the right of every existing key, and
        # the sweep terminates only once `range(start_key=cursor)`
        # comes back empty — i.e. nothing remains past the cursor; and
        # (2) `Wrap` always wraps new material under the current active
        # root key version, which during this sweep is the version we
        # are rotating onto. So a key inserted while we run is already
        # on the target version: if the sweep reaches it,
        # `rewrap_under_root_key` is a no-op; if it slips in after our
        # final empty page, it needed no rotation anyway. Either way
        # nothing is left on an older version.
        registry = cls._key_manager_registry(context)
        async for _ in context.loop("Rotate"):
            key_manager = await KeyManager.ref().per_iteration(
                "Read cursor",
            ).read(context)
            cursor = (
                key_manager.rotation_cursor
                if key_manager.HasField("rotation_cursor") else None
            )

            response = await registry.range(
                context,
                start_key=cursor or None,
                limit=_ROTATE_PAGE_SIZE,
            )
            entries = response.entries
            # `Range`'s `start_key` is inclusive; drop the boundary entry.
            if cursor and entries and entries[0].key == cursor:
                entries = entries[1:]

            if not entries:

                async def finish(state: KeyManager.State) -> None:
                    state.ClearField("rotation_cursor")

                await KeyManager.ref().per_iteration(
                    "Finish rotation",
                ).write(context, finish)
                break

            # Re-wrap every key in this page concurrently.
            await concurrently(
                WrappingKey.ref(
                    entry.bytes.decode(),
                ).rewrap_under_root_key(context) for entry in entries
            )

            next_cursor = entries[-1].key

            async def advance(state: KeyManager.State) -> None:
                state.rotation_cursor = next_cursor

            await KeyManager.ref().per_iteration(
                "Advance cursor",
            ).write(context, advance)

        return RotateResponse()


CIPHERTEXT_LIBRARY_NAME = "reboot.std.ciphertext.v1.ciphertext"


class CiphertextLibrary(Library):
    name = CIPHERTEXT_LIBRARY_NAME

    def servicers(self):
        return [CiphertextServicer, WrappingKeyServicer, KeyManagerServicer]

    def requirements(self):
        return [ordered_map.ORDERED_MAP_LIBRARY_NAME]


def servicers():
    return [
        CiphertextServicer,
        WrappingKeyServicer,
        KeyManagerServicer,
    ] + ordered_map.servicers()


def ciphertext_library():
    return CiphertextLibrary()
