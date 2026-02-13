import { ReaderContext, WriterContext, allow } from "@reboot-dev/reboot";
import { ChatRoom } from "../../api/chat_room/v1/chat_room_rbt.js";

export class ChatRoomServicer extends ChatRoom.Servicer {
  authorizer() {
    return allow();
  }

  async messages(
    context: ReaderContext,
    request: ChatRoom.MessagesRequest
  ): Promise<ChatRoom.PartialMessagesResponse> {
    return { messages: this.state.messages };
  }

  async send(
    context: WriterContext,
    request: ChatRoom.SendRequest
  ): Promise<ChatRoom.PartialSendResponse> {
    this.state.messages.push(request.message);
    return {};
  }
}
