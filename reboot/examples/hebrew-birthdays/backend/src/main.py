import asyncio
from example_prompts import example_prompts
from person_servicer import PersonServicer
from reboot.aio.applications import Application
from reboot.aio.auth.oauth import OAuth
from reboot.aio.auth.oauth_providers import (
    Development,
    OAuthProviderByEnvironment,
)
from reboot.std.collections.ordered_map.v1.ordered_map import (
    ordered_map_library,
)
from user_servicer import UserServicer


async def main():
    await Application(
        title="Hebrew Birthdays",
        description=(
            "Keeps track of the Hebrew birthdays of the people you care "
            "about, and tells you when each one falls on the Gregorian "
            "calendar this year."
        ),
        servicers=[PersonServicer, UserServicer],
        # The `User` type is auto-constructed per authenticated user,
        # which requires an OAuth provider to identify users; the web
        # app, the mobile app, and the MCP frontend all sign in
        # through it, and share one `User` per person.
        oauth=OAuth(
            provider=OAuthProviderByEnvironment(
                dev=Development(),
                # TODO: set a real provider (e.g. `Google(...)`) before
                # production; `prod=None` makes a production deployment
                # fail to start until one is chosen.
                prod=None,
            ),
            # The redirect URI of our own mobile app (see
            # `frontend/mobile/`), whose users Reboot signs in without
            # a consent screen. Expo's development redirect URI skips
            # consent automatically under `rbt dev run`, so this entry
            # is what a standalone build needs.
            skip_consent_for_redirect_uris=[
                "hebrewbirthdays://redirect",
            ],
        ),
        # Each user's list of people is an `OrderedMap`.
        libraries=[ordered_map_library()],
        example_prompts=example_prompts,
    ).run()


if __name__ == '__main__':
    asyncio.run(main())
