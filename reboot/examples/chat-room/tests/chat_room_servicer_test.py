"""The chat room's tests: the Gherkin scenarios in
`chat_room.feature`."""

import pytest
from chat_room_servicer import ChatRoomServicer
from reboot.aio.applications import Application
from reboot.bdd import scenarios


@pytest.fixture
def application() -> Application:
    return Application(servicers=[ChatRoomServicer])


scenarios('chat_room.feature')
