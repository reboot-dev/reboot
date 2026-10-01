---
title: Use Zero-Value Defaults for Scalar State Fields
impact: MEDIUM
impactDescription: Non-zero defaults are rejected at import time
tags: state, scalar, fields, defaults, secret, token, password, credential, api-key, oauth, pii, encryption, ciphertext
---

## Use Zero-Value Defaults for Scalar State Fields

> **Stop before typing `str` for a secret.** If a field holds a
> password, API key, session token, or PII, do **not** store it as a
> plain `str`/`bytes` scalar — that is plaintext at rest. Encrypt it
> with the `Ciphertext` stdlib type and store the returned `state_id`
> (a `str`) instead. **OAuth access/refresh tokens are a special case:
> use the purpose-built `OAuthTokenManager` (`stdlib-oauth-tokens.md`),
> not `Ciphertext` directly.** See "Never Store Secrets in Plain Scalar
> Fields" below and `stdlib-ciphertext.md`.

> **Critical:** every scalar `Field(tag=N)` needs an explicit
> zero-value default (`""`, `0`, `0.0`, `False`). Non-zero defaults
> raise `UserPydanticError` at import time. Set non-zero domain
> defaults inside the constructor method (`if context.constructor: ...`).

State is a pydantic `Model`. Each field needs an explicit
zero-value default — see `api-pydantic.md` for the full rule.

**Incorrect (trying to declare a non-zero default on the Field):**

```python
class AccountState(Model):
    balance: int = Field(tag=1, default=100)  # rejected at import
```

```text
reboot.api.UserPydanticError: Field `balance` in model `AccountState`
uses `default` with an unsupported value. Supported default value
for `int` is `0`.
```

**Correct (zero default on the Field, real value applied in the constructor):**

```python
class AccountState(Model):
    name: str = Field(tag=1, default="")
    balance: int = Field(tag=2, default=0)
```

```python
async def open(
    self, context: WriterContext, request: Account.OpenRequest,
) -> None:
    if context.constructor:
        self.state.name = request.name
        self.state.balance = 100  # initial balance applied here
```

## Common Scalar Defaults

| Type           | Default                |
| -------------- | ---------------------- |
| `int`          | `0`                    |
| `float`        | `0.0`                  |
| `bool`         | `False`                |
| `str`          | `""`                   |
| `bytes`        | `b""`                  |
| `list[T]`      | `default_factory=list` |
| `dict[str, T]` | `default_factory=dict` |

## Read Without Mutation Inside Readers

Reading scalar fields inside a reader is always allowed:

```python
async def balance(
    self, context: ReaderContext,
) -> Account.BalanceResponse:
    return Account.BalanceResponse(amount=self.state.balance)
```

Trying to assign (`self.state.balance = ...`) inside a reader raises at
runtime. Mutate inside writers/transactions only.

## Never Store Secrets in Plain Scalar Fields

A `str`/`bytes` scalar field is **plaintext at rest** — anyone with the
database (e.g. a leaked backup) can read it. Secrets must never land in
a scalar field. This includes passwords, API keys, session tokens, and
PII. The reflex "it's just a string, give it a `str` field" is exactly
the trap.

Instead, encrypt the value with the `Ciphertext` stdlib type (envelope
encryption + per-scope crypto-shredding) and store the returned
`state_id` — itself a harmless `str` — on your state. Decrypt on demand.
Full method surface, library registration, and `associated_data` rules
are in `stdlib-ciphertext.md`. If the secret is an **API key the user
provides** for calling an external service that doesn't expose OAuth,
the end-to-end capture-and-call recipe is `auth-external-api-calls.md`
(Path C). A key the **developer** holds for the whole application (your
Stripe key, your OpenAI key) doesn't belong in state at all — deliver
it as an application secret via environment variables
(`lifecycle-secrets.md`).

**OAuth tokens are the exception:** for access/refresh tokens obtained
through an `OAuthProvider`, don't reach for `Ciphertext` by hand — use
the purpose-built `OAuthTokenManager`, which wraps `Ciphertext` plus a
`user_id -> ciphertext_id` index, a per-service key manager, and
per-user crypto-shred scope for you. With `store_tokens=True` the OAuth
server stores them automatically and you just `fetch`. See
`stdlib-oauth-tokens.md`. The rest of this section is about every
_other_ secret/PII field.

**Incorrect (an API key sitting in plaintext):**

```python
class IntegrationState(Model):
    api_key: str = Field(tag=1, default="")  # plaintext at rest!
```

**Correct (store the `Ciphertext` id; the secret is encrypted):**

```python
class IntegrationState(Model):
    # ID of the `Ciphertext` actor holding the encrypted API key.
    api_key_id: str = Field(tag=1, default="")
```

```python
ciphertext, _ = await Ciphertext.encrypt(
    context,
    plaintext=raw_api_key.encode(),
    associated_data=make_associated_data(tenant_id=tenant_id, purpose="api-key"),
    scope=f"tenant:{tenant_id}",  # crypto-shred unit for right-to-erasure
    key_manager_id=APP_SHARED_KEY_MANAGER_ID,
)
self.state.api_key_id = ciphertext.state_id
```
