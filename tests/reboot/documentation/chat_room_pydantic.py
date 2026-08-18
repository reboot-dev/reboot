from reboot.api import API, Field, Methods, Model, Reader, Type, Writer
from typing import Optional


class ChatRoomState(Model):
    messages: Optional[list[str]] = Field(tag=1)


class MessagesResponse(Model):
    messages: list[str] = Field(tag=1)


class SendRequest(Model):
    message: str = Field(tag=1)  # E.g. "Hello, World".


ChatRoomMethods = Methods(
    # Returns the current list of recorded messages.
    messages=Reader(
        request=None,
        response=MessagesResponse,
        description="Every message posted to the room so far.",
        mcp=None,
    ),
    # Adds a new message to the list of recorded messages.
    send=Writer(
        request=SendRequest,
        response=None,
        description="Post one message to the room.",
        mcp=None,
    ),
)

api = API(
    ChatRoom=Type(
        state=ChatRoomState,
        methods=ChatRoomMethods,
    ),
)
