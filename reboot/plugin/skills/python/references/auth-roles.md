---
title: A Staff Roster with Roles
impact: MEDIUM
impactDescription: Staff apps that put roles on User, trust unverified addresses or make the first sign-in the admin let people promote themselves or take another person's role
tags: auth, roles, roster, staff, team, invitation, admin, email_verified, predicate
---

## A Staff Roster with Roles

Read this when staff sign in and what each may do depends on their
role. Writing predicates and per-method rules is
[`auth-custom-predicates.md`](auth-custom-predicates.md); getting the
signed-in person's email into the app is
[`auth-claims.md`](auth-claims.md). This file is the shape on top of
them: where roles live, how a predicate asks for one, how people are
invited before they arrive, and who the first admin is.

## One Roster Owns Every Role

A singleton roster type (here `Team`) holds the members and their
roles, the open invitations, and the aliases that tie an invitation
to the person who accepted it. No method on `User` writes a role, so
nobody can promote themselves. `User` keeps only what the provider
delivered (`email`, `email_verified`, `name`).

```python
class Member(Model):
    user_id: str = Field(tag=1, default="")
    role: str = Field(tag=2, default="")  # "manager" | "host" | "server"


class Invitation(Model):
    email: str = Field(tag=1, default="")  # lower-cased
    role: str = Field(tag=2, default="")


class OwnerAlias(Model):
    owner_id: str = Field(tag=1, default="")  # "invited:<email>"
    user_id: str = Field(tag=2, default="")


class TeamState(Model):
    members: list[Member] = Field(tag=1, default_factory=list)
    invitations: list[Invitation] = Field(tag=2, default_factory=list)
    aliases: list[OwnerAlias] = Field(tag=3, default_factory=list)
```

Give the roster two readers, named for who asks: `my_role` answers the
caller (the UI shows what they may do) and `role_of(user_id)` answers
a predicate. One app-internal writer, `register`, is called from
`User.set_claims` on every sign-in. `invite` and `set_role` are for
managers only.

## Two Gates: Access, Then Role

**Access** ("may you get in at all") is an allowlist of verified
addresses or domains. Check it on the caller's own `User`, which
already holds the address, so it costs no extra read. **Role** ("what
may you do") is asked of the roster, only on the methods where a role
decides.

```python
from typing import Any

import rbt.v1alpha1.errors_pb2 as errors
from reboot.aio.auth.authorizers import (
    Authorizer,
    allow_if,
    state_id_is_user_id,
)
from reboot.aio.contexts import ReaderContext


def is_on_the_team(
    *,
    context: ReaderContext,
    state: UserState | None = None,
    **kwargs: Any,
) -> Authorizer.Decision:
    # On the caller's own `User`: read the allowlist off the state.
    if context.app_internal:
        return errors.Ok()
    if context.auth is None or context.auth.user_id is None:
        return errors.Unauthenticated()
    if state is not None and state.email_verified and allowed(state.email):
        return errors.Ok()
    return errors.PermissionDenied()


def is_this_user(*, context: ReaderContext, **kwargs: Any) -> Authorizer.Decision:
    # `state_id_is_user_id` alone answers `Unauthenticated` to the
    # OAuth server's app-internal calls at sign-in, and `all=` stops there.
    if context.app_internal:
        return errors.Ok()
    return state_id_is_user_id(context=context, **kwargs)


async def is_manager(
    *,
    context: ReaderContext,
    **kwargs: Any,
) -> Authorizer.Decision:
    if context.app_internal:
        return errors.Ok()
    if context.auth is None or context.auth.user_id is None:
        return errors.Unauthenticated()
    response = await Team.ref(TEAM_ID).role_of(
        context, user_id=context.auth.user_id,
    )
    if response.role == "manager":
        return errors.Ok()
    return errors.PermissionDenied()


class UserServicer(User.Servicer):

    def authorizer(self):
        return allow_if(all=[is_this_user, is_on_the_team])


class CheckServicer(Check.Servicer):

    def authorizer(self):
        # Per method: managers void a check; `teammate()` (any member,
        # your own rule) covers every other method.
        return Check.Authorizer(
            void=allow_if(all=[is_manager]),
            _default=teammate(),
        )
```

`<Type>.Authorizer(...)` takes one rule per method, by its snake_case
or PascalCase name, and `_default=` for the rest.

Every predicate returns `Ok` for `context.app_internal` first. A
method that fans out to other actors checks its own caller; what it
calls arrives app-internal. Since 1.7.0 such a call carries the
caller's `context.auth`, but calls from `initialize`, a workflow or
the OAuth server at sign-in carry none, so a predicate that asks for a
user there would refuse the app's own calls.

On the roster type itself, a predicate reads its `state` argument, the
roster it is guarding, instead of calling `role_of` on it.

## Invitations That Keep Their Place

A manager invites by address. Records handed to the invitee before they
arrive are owned by `invited:<email>`. On arrival, `register` adopts
the invitation **only if the provider verified the address**: an
unverified address is a claim anybody can make.

```python
async def register(
    self, context: WriterContext, request: Team.RegisterRequest,
) -> None:
    email = request.email.strip().lower()
    invited = None
    if email and request.email_verified:
        invited = next(
            (i for i in self.state.invitations if i.email == email), None,
        )
    if invited is not None:
        role = invited.role
        self.state.invitations = [
            i for i in self.state.invitations if i.email != email
        ]
        self.state.aliases.append(
            OwnerAlias(owner_id=f"invited:{email}", user_id=request.user_id)
        )
    elif any(m.user_id == request.user_id for m in self.state.members):
        return
    else:
        role = DEFAULT_ROLE
    self.state.members.append(Member(user_id=request.user_id, role=role))
```

Nothing is rewritten on arrival: a reader that answers "mine" accepts
both the user id and its aliases. A removed member's aliases go with
them.

## The First Admin

Never make "the first to sign in" the admin in production. The deploy
names the starting admin through an allowlist variable
(`ADMIN_EMAILS`, or `ALLOWED_EMAILS` / `ALLOWED_EMAIL_DOMAINS`, set as
secrets, [`lifecycle-secrets.md`](lifecycle-secrets.md)), and
`main.py` refuses to start when a real provider is configured and no
allowlist is set:

```python
if os.environ.get("GOOGLE_OAUTH_CLIENT_ID") and not allowlist_configured():
    raise SystemExit(
        "GOOGLE_OAUTH_CLIENT_ID is set but no ALLOWED_EMAILS / "
        "ALLOWED_EMAIL_DOMAINS; set one so sign-in is limited to the team."
    )
```

`initialize` keys its calls the same way on every start, so a bare
call runs once in the application's life
([`lifecycle-initialize-hook.md`](lifecycle-initialize-hook.md)). A
check that must run on every start, such as repairing a roster left
with no manager, needs an alias that differs each time:

```python
await Team.ref(TEAM_ID).idempotently(f"repair at {uuid4()}").repair_admin(
    context,
)
```

Under `rbt dev run` and in tests, with no allowlist set, the first to
register can be the manager. That is a development convenience; the
refusal above is what keeps it out of production.

## Testing Roles

The built-in step `"ana" is an authenticated user` mints a token with
no claims, so `set_claims` never sees an email. A scenario about roles
needs a custom step ([`testing-features.md`](testing-features.md))
that mints the token with claims:

```python
from reboot.bdd import given, parsers
from reboot.bdd.fixtures import World


@given(parsers.parse(
    '"{user}" signs in as "{email}", verified {verified}'
))
async def _signs_in(
    world: World, user: str, email: str, verified: str,
) -> None:
    assert world.rbt is not None
    world.declare_user(
        user,
        await world.rbt.make_valid_oauth_access_token(
            user_id=user,
            claims={"email": email, "email_verified": verified == "yes"},
        ),
    )
```

`make_valid_oauth_access_token(..., claims=...)` delivers the claims
the way a real sign-in does, so the app's own `set_claims` and
`register` run. The scenarios worth writing:

```gherkin
Rule: An invited host takes the invited role, on a verified address only
  Scenario: An invitation adopted
    Given "ana" signs in as "ana@crudo.test", verified yes
    And "ana" does an `invite` with `email="ben@crudo.test"` and `role="host"` on `Team` of "team"
    When "ben" signs in as "ben@crudo.test", verified yes
    Then as "ben", `my_role` on the `Team` for "team" has `role="host"`
  Scenario: An unverified address claims nothing
    Given "ana" signs in as "ana@crudo.test", verified yes
    And "ana" does an `invite` with `email="ben@crudo.test"` and `role="host"` on `Team` of "team"
    When "mallory" signs in as "ben@crudo.test", verified no
    Then as "mallory", `my_role` on the `Team` for "team" has `role="server"`
Rule: The last manager cannot be removed
  Scenario: Ana stays
    Given "ana" signs in as "ana@crudo.test", verified yes
    When "ana" attempts a `remove_member` with `user_id="ana"` on `Team` of "team"
    Then the attempt aborts with `LastManagerError`
```

## Never

- Link a sign-in to a roster entry, an invitation or any record keyed
  by email unless `email_verified` is true. `Development()` signs in
  five made-up people whose addresses are all verified, so a missing
  check never shows in development.
- A `role` field on `User` that a method on `User` writes.
- Key the roster by `Development()` user ids; they are opaque and
  change with an expunge ([`auth-claims.md`](auth-claims.md)).
- "The first to sign in is the admin" in production, or an allowlist
  that may be empty while a real provider is configured: with
  `has_verified_token` alone, every account at the provider gets in.
- Ask the roster on every method of every type. Put the access gate on
  the caller's own `User`; ask the roster only where a role decides.

## Cost

A role check is one reader call on a singleton for each protected
call, live subscriptions included; the access gate on `User` is free.
A dozen staff put no visible load on one roster. A roster of thousands
belongs in an `OrderedMap` ([`state-collections.md`](state-collections.md)).
