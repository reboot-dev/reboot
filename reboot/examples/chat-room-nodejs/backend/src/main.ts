import { Application } from "@reboot-dev/reboot";
import { ChatRoom } from "../../api/chat_room/v1/chat_room_rbt.js";
import { ChatRoomServicer } from "./chat_room_servicer.js";

const initialize = async (context) => {
  const chatRoom = ChatRoom.ref("chat-room-nodejs");
  await chatRoom.send(context, { message: "Hello, World!" });
};

new Application({
  servicers: [ChatRoomServicer],
  initialize,
}).run();
