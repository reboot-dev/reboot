import random
import string

APIKeyId = str
APIKeySecret = str


def _make_random_uppercase_string(length: int) -> str:
    """
    Returns a random string of the given length, consisting of only uppercase
    letters.
    """
    return "".join(
        random.choice(string.ascii_uppercase) for _ in range(length)
    )


def make_api_key_secret() -> APIKeySecret:
    """Returns a string that's valid for use as a secret."""
    return _make_random_uppercase_string(length=20)


def is_secret(s: str) -> bool:
    """Checks that the given string is valid for use as a secret."""
    return len(s) == 20 and s.isalpha() and s.isupper()


def make_api_key_id() -> APIKeyId:
    """Returns a string that's suitable for use as an API key ID."""
    return _make_random_uppercase_string(length=10)


def is_api_key_id(s: str) -> bool:
    """Checks that the given string is valid for use as an API Key ID."""
    return len(s) == 10 and s.isalpha() and s.isupper()


def make_api_key_bearer_token(key_id: APIKeyId, secret: APIKeySecret) -> str:
    """Returns a bearer token for the given API key ID and secret."""
    return f"{key_id}-{secret}"


class InvalidAPIKeyBearerToken(ValueError):
    """Raised when an API key bearer token is invalid."""
    pass


def parse_api_key_bearer_token(token: str) -> tuple[str, str]:
    """Parses the given bearer token into its API key ID and secret."""
    # TODO(rjh): parse into an `APIKeyBearerToken` dataclass instead of a tuple,
    #            similar to what we do with `SecretId`?
    parts = token.split("-", maxsplit=1)
    if len(parts) != 2:
        raise InvalidAPIKeyBearerToken(f"Invalid bearer token: {token}")

    api_key_id, secret = parts
    if not is_api_key_id(api_key_id):
        raise InvalidAPIKeyBearerToken(f"Invalid API Key ID: {api_key_id}")
    if not is_secret(secret):
        raise InvalidAPIKeyBearerToken(f"Invalid secret: {secret}")

    return api_key_id, secret
