## Presence Library: Change in API, Change in default authorization

This is the one migration note for changes in the presence library.

### `presence.servicers()` deprecated in favor of `presence_library()`

Instead of adding `presence.servicers()` in the list of `servicers`
passed to `Application`, either include `presence_library()` (for Python) or
`presenceLibrary()` (for Typescript) in the list of `libraries`
passed to `Application`.

In Python, `presence_library()` is imported from `reboot.std.presence.v1.presence`.

In Typescript, `presenceLibrary()` is imported from `"@reboot-dev/reboot-std/presence/v1"`.

### Change in default authorization.

Previously, the default authorization for servicers in the presence library was
to allow all calls. The default has now changed to allow calls that are internal
(`is_app_internal()`) or has a token verified by a `TokenVerifier`
()`has_verified_token()`).

The best way to address this change is to introduce a `TokenVerifier` when
starting up your Reboot `Application`.

To allow for anonymous presence, the recommendation is to have the
`TokenVerifier` present an anonymous `Auth()` object. Alternatively, the
`authorizer`s for the presence library by passing instantiating in Python with
`presence_library(authorizer=allow())` or in Typescript with
`presenceLibrary({ authorizer: allow() })`.

Presence servicers can be individually configured by passing
`presence_authorizer`, `subscriber_authorizer`, and `mouse_position_authorizer`
in Python, or `presenceAuthorizer`, `subscriberAuthorizer`, and
`mousePositionAuthorizer` in Typescript.
