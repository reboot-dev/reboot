#!/usr/bin/env bash
# A Reboot app with its Profile API written and nothing else: no
# servicer and no entry point yet. A profile's state id is its owner's
# user id.
set -euo pipefail
mkdir -p api/profiles/v1 backend/src
printf 'dev run --application-name=profiles\ngenerate api/ --python=backend/api/\n' > .rbtrc
cat > api/profiles/v1/profile.py <<'PY'
from reboot.api import API, Field, Methods, Model, Reader, Type, Writer


class ProfileState(Model):
    display_name: str = Field(tag=1, default="", description="The name everyone signed in sees.")
    bio: str = Field(tag=2, default="", description="A line or two the owner writes about themselves, shown to everyone signed in.")
    phone: str = Field(tag=3, default="", description="The owner's phone number. Private: only the owner may read it.")
    home_address: str = Field(tag=4, default="", description="The owner's home address. Private: only the owner may read it.")


class CardResponse(Model):
    display_name: str = Field(tag=1, default="", description="The profile's display name.")
    bio: str = Field(tag=2, default="", description="The profile's bio.")


class UpdateRequest(Model):
    display_name: str = Field(tag=1, default="", description="The new display name.")
    bio: str = Field(tag=2, default="", description="The new bio.")
    phone: str = Field(tag=3, default="", description="The new phone number.")
    home_address: str = Field(tag=4, default="", description="The new home address.")


api = API(
    Profile=Type(
        state=ProfileState,
        description="One person's profile. Its state id is the owner's user id.",
        methods=Methods(
            create=Writer(request=UpdateRequest, response=None, factory=True, description="Create the signed-in user's own profile.", mcp=None),
            card=Reader(request=None, response=CardResponse, description="The public card: display name and bio, for anyone signed in.", mcp=None),
            details=Reader(request=None, response=ProfileState, description="Everything on the profile, private fields included. Only its owner may read it.", mcp=None),
            update=Writer(request=UpdateRequest, response=None, description="Change the profile. Only its owner may.", mcp=None),
        ),
    ),
)
PY
git init -q -b main
git -c user.email=dev@example.com -c user.name=Dev add -A
git -c user.email=dev@example.com -c user.name=Dev commit -q -m "Profile API"
