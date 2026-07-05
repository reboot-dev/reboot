from chat_room.v1.chat_room_rbt import (
    AttachmentTooLarge,
    ChatRoom,
    Message,
    MessagesRequest,
    MessagesResponse,
    SendRequest,
    SendResponse,
)
from rbt.std.blobs.v1.blobs_rbt import Blob
from reboot.aio.auth.authorizers import allow
from reboot.aio.contexts import ReaderContext, TransactionContext

# The chat room refuses attachments larger than this.
MAX_ATTACHMENT_BYTES = 300 * 1024 * 1024


class ChatRoomServicer(ChatRoom.Servicer):

    def authorizer(self):
        return allow()

    async def messages(
        self,
        context: ReaderContext,
        request: MessagesRequest,
    ) -> MessagesResponse:
        return MessagesResponse(messages=self.state.messages)

    async def send(
        self,
        context: TransactionContext,
        request: SendRequest,
    ) -> SendResponse:
        # Create a `Blob` for every requested attachment. This is the
        # application-mediated step where attachment policy is
        # enforced; the blobs' random ids then act as upload/download
        # capabilities. This example has no end-user authentication,
        # so `uploader_id` is left empty: anyone who knows a blob's id
        # may upload into it. `downloader_ids` is likewise omitted, so
        # anyone who knows a blob's id may download it too.
        attachment_blob_ids = []
        for attachment in request.attachments:
            if attachment.size_bytes > MAX_ATTACHMENT_BYTES:
                raise ChatRoom.SendAborted(
                    AttachmentTooLarge(max_size_bytes=MAX_ATTACHMENT_BYTES)
                )
            blob, _ = await Blob.create(
                context,
                content_type=attachment.content_type,
                size=attachment.size_bytes,
                max_size=MAX_ATTACHMENT_BYTES,
            )
            attachment_blob_ids.append(blob.state_id)

        # The message is published immediately: participants see it
        # (and can watch its attachments' upload progress) before the
        # bytes have been uploaded.
        self.state.messages.append(
            Message(
                text=request.message,
                attachment_blob_ids=attachment_blob_ids,
            )
        )
        return SendResponse(attachment_blob_ids=attachment_blob_ids)
