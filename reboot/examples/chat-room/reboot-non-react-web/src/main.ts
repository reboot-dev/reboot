import { WebContext } from "@reboot-dev/reboot-web";
import { ChatRoom } from "../../web/src/api/chat_room/v1/chat_room_rbt_web";

const root = document.getElementById("messages");
const button = document.getElementById("button");

const context = new WebContext({
  url: "http://localhost:9991",
});
const chatRoom = ChatRoom.ref("reboot-chat-room");

button!.addEventListener("click", async () => {
  const inputElement = document.getElementById("input") as HTMLInputElement;
  await handleClick(inputElement);
});

async function handleClick(element: HTMLInputElement) {
  const message = element.value;
  if (message === "") {
    return;
  }

  await chatRoom.send(context, {
    message: message,
  });

  element.value = "";
}

async function bindToElement(
  element: HTMLElement,
  generator: AsyncGenerator<ChatRoom.MessagesResponse>
) {
  for await (const response of generator) {
    element.innerHTML = `${response.messages
      .map((msg: string) => `<div class="message">${msg}</div>`)
      .join("")}`;
  }
}

const [responses] = await chatRoom.reactively().messages(context);

bindToElement(root!, responses);

console.log("Chat Room Reboot Web example is running!");
