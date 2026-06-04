"""Encrypted storage for external identity-provider OAuth tokens.

When an `OAuthProvider` is configured with `store_tokens=True`, the OAuth
server captures the provider's access/refresh tokens during the code
exchange and persists them here, encrypted, so that application code can
later call the provider's API on the user's behalf.

An `OAuthTokenManager` holds the tokens for one external third-party
service (e.g. Google, GitHub), addressed by a state id naming that service
(use `GOOGLE` / `GITHUB`, or any string for a service without a predefined
constant). Each manager encrypts under its own dedicated `KeyManager`, so
every key for a service can be shredded together; each value is scoped to
its `user_id`, so a single user's tokens can be crypto-shredded.

Storage model. `Ciphertext.encrypt` is a *constructor* — it allocates a
fresh state id on every call and can't be re-constructed at a fixed id —
so we keep a mutable `user_id -> ciphertext_id` pointer in a per-manager
`OrderedMap` (derived from the manager's state id), and the ciphertext
itself holds the serialized `OAuthTokens`.

These servicers define no authorizer, so they get the default
app-internal-only stance; callers must pass an app-internal context.
"""

import base64
import hashlib
import rbt.v1alpha1.errors_pb2
from rbt.std.ciphertext.v1.ciphertext_rbt import Ciphertext
from rbt.std.collections.ordered_map.v1.ordered_map_rbt import OrderedMap
from rbt.std.oauth.v1.oauth_rbt import (
    FetchRequest,
    FetchResponse,
    OAuthTokenManager,
    OAuthTokens,
    StoreRequest,
    StoreResponse,
)
from reboot.aio.applications import Library
from reboot.aio.contexts import Context, ReaderContext, TransactionContext
from reboot.std.ciphertext.v1.ciphertext import (
    CIPHERTEXT_LIBRARY_NAME,
    make_associated_data,
)
from reboot.std.collections.ordered_map.v1 import ordered_map
from typing import Optional

OAUTH_LIBRARY_NAME = "reboot.std.oauth.v1.oauth"

# Canonical `OAuthTokenManager` state ids for the well-known services. An
# `OAuthProvider` stores under the matching id (see `token_service_id` in
# `reboot.aio.auth.oauth_providers`); application code reads back with the
# same constant. Any string is a valid id, so a service without a
# predefined constant just uses its own name.
GOOGLE = "google.com"
GITHUB = "github.com"


def _digest_id(prefix: str, *parts: str) -> str:
    """Hashes `parts` into a valid, collision-resistant Reboot state id.
    Each part is length-prefixed so that no concatenation of one set of
    parts can collide with another (e.g. `("a", "b")` vs `("ab", "")`)."""
    encoded = b"".join(
        len(part.encode()).to_bytes(4, "big") + part.encode() for part in parts
    )
    digest = hashlib.sha256(encoded).digest()
    return prefix + base64.urlsafe_b64encode(digest).decode().rstrip("=")


def _token_index_id(service: str) -> str:
    """The id of the `OrderedMap` holding a service's `user_id ->
    ciphertext_id` pointers. One index per manager (service)."""
    return _digest_id("oauth-token-index-", service)


def _key_manager_id(service: str) -> str:
    """The dedicated `KeyManager` a service's ciphertexts are wrapped
    under. Hashed (not a readable `library:service` string) so the id is
    always a valid, separator-free Reboot state id — `KeyManager` ids feed
    ciphertext's internal state references, which reserve `:` and `/`. The
    library-specific prefix keeps it from colliding with an application's
    own manager, and it is distinct per service so every key for a service
    can be shredded together (a future `KeyManager.shred_all`)."""
    return _digest_id("oauth-key-manager-", service)


def _associated_data(service: str, user_id: str) -> bytes:
    """AES-GCM associated data binding a ciphertext to the service and
    user it belongs to: authenticated (not stored), so `decrypt` only
    succeeds when given the same service and `user_id` used at `encrypt`."""
    return make_associated_data(
        purpose="oauth-tokens", service=service, user_id=user_id
    )


class OAuthTokenManagerServicer(OAuthTokenManager.Servicer):

    @staticmethod
    def _token_index(context: Context) -> OrderedMap.WeakReference:
        return OrderedMap.ref(_token_index_id(context.state_id))

    async def store(
        self,
        context: TransactionContext,
        request: StoreRequest,
    ) -> StoreResponse:
        # The manager's state id *is* the external service it manages.
        service = context.state_id

        # Encrypt under this service's own `KeyManager`, scoped to the user
        # so their tokens can be crypto-shredded independently. The previous
        # ciphertext (if any) is left orphaned; it stays unreadable without
        # the pointer and is reclaimed when the user's scope is shredded.
        #
        # Note: this replaces any previously stored tokens wholesale. A
        # caller that needs to carry a prior refresh token forward (some
        # providers issue one only on the first consent) must `fetch` and
        # merge first — we can't read the index here, since this same
        # transaction writes it (Reboot forbids reading and writing the
        # same state in one transaction).
        ciphertext, _ = await Ciphertext.encrypt(
            context,
            plaintext=request.tokens.SerializeToString(),
            associated_data=_associated_data(service, request.user_id),
            scope=request.user_id,
            key_manager_id=_key_manager_id(service),
        )
        await self._token_index(context).insert(
            context,
            key=request.user_id,
            bytes=ciphertext.state_id.encode(),
        )
        return StoreResponse()

    async def fetch(
        self,
        context: ReaderContext,
        request: FetchRequest,
    ) -> FetchResponse:
        tokens = await self._lookup(context, request.user_id)
        if tokens is None:
            return FetchResponse(found=False)
        return FetchResponse(found=True, tokens=tokens)

    @classmethod
    async def _lookup(
        cls,
        context: ReaderContext,
        user_id: str,
    ) -> Optional[OAuthTokens]:
        """Reads and decrypts a user's stored tokens, or returns `None` if
        none are stored (or they have been crypto-shredded)."""
        try:
            found = await cls._token_index(context
                                          ).search(context, key=user_id)
        except OrderedMap.SearchAborted as aborted:
            # The index is created lazily by the first `store`; a read
            # before anything was stored hits an unconstructed map. That
            # just means "no tokens for this user yet".
            if isinstance(
                aborted.error,
                rbt.v1alpha1.errors_pb2.StateNotConstructed,
            ):
                return None
            raise
        if not found.found:
            return None
        try:
            response = await Ciphertext.ref(found.bytes.decode()).decrypt(
                context,
                associated_data=_associated_data(context.state_id, user_id),
            )
        except Ciphertext.DecryptAborted:
            # The ciphertext can't be decrypted — most commonly because the
            # user's token scope was crypto-shredded (e.g. as part of
            # erasing the user). Treat that as "no tokens stored".
            return None
        return OAuthTokens.FromString(response.plaintext)


class OAuthLibrary(Library):
    name = OAUTH_LIBRARY_NAME

    def servicers(self):
        return [OAuthTokenManagerServicer]

    def requirements(self):
        return [CIPHERTEXT_LIBRARY_NAME, ordered_map.ORDERED_MAP_LIBRARY_NAME]


def servicers():
    return [OAuthTokenManagerServicer]


def oauth_library():
    return OAuthLibrary()
