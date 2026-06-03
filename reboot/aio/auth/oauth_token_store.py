"""Encrypted storage for identity-provider OAuth tokens.

When an `OAuthProvider` is configured with `store_tokens=True`, the OAuth
server captures the provider's access/refresh tokens during the code
exchange and persists them here, encrypted, so that application code can
later call the provider's API on the user's behalf (via the
`oauth_tokens` helper).

Storage model. `Ciphertext.encrypt` is a *constructor* — it allocates a
fresh state id on every call and can't be re-constructed at a fixed id —
so we keep a mutable `user_id -> ciphertext_id` pointer in a single
`OrderedMap` (mounted by the `ciphertext` library), and the ciphertext
itself holds the JSON-encoded `IdpTokens`. Each user's tokens are
encrypted under a per-user `scope`, so a user's tokens can be
crypto-shredded by shredding that scope.

Both the `OrderedMap` and `Ciphertext` servicers are app-internal only,
so callers must pass an app-internal context.
"""

from __future__ import annotations

import json
import rbt.v1alpha1.errors_pb2
from dataclasses import asdict, replace
from rbt.std.ciphertext.v1.ciphertext_rbt import Ciphertext
from rbt.std.collections.ordered_map.v1.ordered_map_rbt import OrderedMap
from reboot.aio.auth.oauth_providers import IdpTokens
from reboot.aio.contexts import (
    ReaderContext,
    TransactionContext,
    WorkflowContext,
    WriterContext,
)
from reboot.aio.external import ExternalContext
from typing import Optional, Union

# A context that can issue reads (every context can).
ReadableContext = Union[
    ReaderContext,
    WriterContext,
    TransactionContext,
    WorkflowContext,
    ExternalContext,
]

# A context that can issue the transactional writes the store needs
# (`Ciphertext.encrypt` is a constructor and `OrderedMap.insert` a
# transaction). In practice this is always the OAuth server's
# app-internal `ExternalContext`.
WritableContext = Union[
    TransactionContext,
    WorkflowContext,
    ExternalContext,
]

# Fixed id of the singleton `OrderedMap` holding the `user_id ->
# ciphertext_id` pointers.
_TOKEN_MAP_ID = "(reboot-oauth-idp-tokens)"


def _scope(user_id: str) -> str:
    """The crypto-shred scope for a user's stored tokens.

    Deliberately namespaced (and distinct from any scope the
    application uses for its own ciphertexts), so the tokens get their
    own wrapping key: the app shredding its own per-user scope never
    destroys these tokens, and shredding this scope never destroys the
    app's data. To erase a user's stored provider tokens, shred this
    exact scope.
    """
    return f"oauth-idp-tokens:{user_id}"


def _associated_data(user_id: str) -> bytes:
    """The AES-GCM associated data binding a ciphertext to the user it
    belongs to: authenticated (not stored), so `decrypt` only succeeds
    when given the same `user_id` used at `encrypt`.
    """
    # Imported lazily: the `ciphertext` module pulls in
    # `reboot.aio.applications`, which (transitively) depends back on
    # this module, so a top-level import would be a Bazel cycle. By the
    # time tokens are stored/read the module is already loaded (the app
    # mounted `ciphertext_library()`), so this is just a dict lookup.
    from reboot.std.ciphertext.v1.ciphertext import make_associated_data
    return make_associated_data(purpose="oauth-idp-tokens", user_id=user_id)


async def store_idp_tokens(
    context: WritableContext,
    *,
    user_id: str,
    tokens: IdpTokens,
) -> None:
    """Encrypt and persist `tokens` for `user_id`, replacing any
    previously stored tokens.

    Tokens are encrypted under a dedicated, per-user `scope` (see
    `_scope`) that does not overlap with the application's own
    ciphertexts. The previous ciphertext (if any) is left orphaned
    rather than deleted; it stays unreadable without the pointer and is
    reclaimed when this user's token scope is shredded.

    If `tokens` has no `refresh_token` but one was previously stored,
    the existing refresh token is carried forward — some providers
    (e.g. Google) only return a refresh token on the first consent, so a
    later sign-in would otherwise drop it.
    """
    if tokens.refresh_token is None:
        existing = await oauth_tokens(context, user_id)
        if existing is not None and existing.refresh_token is not None:
            tokens = replace(tokens, refresh_token=existing.refresh_token)
    # `key_manager_id` is left empty so the `Ciphertext` servicer uses
    # its default key manager.
    ciphertext, _ = await Ciphertext.encrypt(
        context,
        plaintext=json.dumps(asdict(tokens)).encode(),
        associated_data=_associated_data(user_id),
        scope=_scope(user_id),
    )
    await OrderedMap.ref(_TOKEN_MAP_ID).insert(
        context,
        key=user_id,
        bytes=ciphertext.state_id.encode(),
    )


async def oauth_tokens(
    context: ReadableContext,
    user_id: str,
) -> Optional[IdpTokens]:
    """Return the stored identity-provider tokens for `user_id`, or
    `None` if none are stored.

    This is the public way for application code to obtain a user's
    provider tokens (e.g. to call the Google or GitHub API on their
    behalf). Requires an app-internal context.
    """
    try:
        found = await OrderedMap.ref(_TOKEN_MAP_ID
                                    ).search(context, key=user_id)
    except OrderedMap.SearchAborted as aborted:
        # The token map is created lazily by the first `store_idp_tokens`;
        # searching before anything was ever stored hits an unconstructed
        # map. That just means "no tokens for anyone yet".
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
            associated_data=_associated_data(user_id),
        )
    except Ciphertext.DecryptAborted:
        # The ciphertext can't be decrypted — most commonly because the
        # user's token scope was crypto-shredded (e.g. as part of erasing
        # the user). Treat that as "no tokens stored" rather than an
        # error so callers don't have to special-case erasure.
        return None
    return IdpTokens(**json.loads(response.plaintext))
