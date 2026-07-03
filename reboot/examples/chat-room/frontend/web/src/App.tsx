import { FC, useState } from "react";
import css from "./App.module.css";
import { useChatRoom } from "./api/chat_room/v1/chat_room_rbt_react";
// We can choose any id we want because the state will be constructed when we
// make the first .writer call.
const STATE_MACHINE_ID = "reboot-chat-room";

const Message: FC<{ text: string }> = ({ text }) => {
  return <div className={css.message}>{text}</div>;
};

const PendingMessage: FC<{ text: string; isLoading: boolean }> = ({
  text,
  isLoading,
}) => {
  return (
    <div
      className={
        isLoading
          ? `${css.message} ${css.pendingMessageIsLoading}`
          : `${css.message} ${css.pendingMessage}`
      }
    >
      {text}
    </div>
  );
};

const App = () => {
  // State of the input component.
  const [message, setMessage] = useState("Hello, Reboot!");

  const { useMessages, send } = useChatRoom({ id: STATE_MACHINE_ID });
  const { response } = useMessages();

  const handleClick = async () => {
    const { aborted } = await send({ message: message });
    if (aborted !== undefined) {
      console.warn(aborted.error.getType());
      console.warn(aborted.message);
    }

    setMessage("");
  };

  return (
    <div className={css.messages}>
      <input
        type="text"
        className={css.textInput}
        onChange={(e) => setMessage(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && message !== "") {
            handleClick();
          }
        }}
        value={message}
        placeholder="Your message here..."
      />
      <button
        className={message === "" ? css.buttonDisabled : css.buttonEnabled}
        onClick={handleClick}
        disabled={message === ""}
      >
        Send
      </button>
      {(response !== undefined &&
        response.messages.length > 0 &&
        response.messages.map((message: string) => (
          <Message text={message} key={message} />
        ))) ||
        (response !== undefined && response.messages.length === 0 && (
          <p className={css.informationText}>No messages yet!</p>
        ))}
      {/*
        Optimistically render each send. Each pending mutation on
        `send.pending` will be removed when `response` has
        been received that includes the mutation's updates so you
        don't have to worry about mutators racing with readers!
        */}
      {send.pending.map(({ request: { message }, isLoading }) => (
        <PendingMessage text={message} isLoading={isLoading} key={message} />
      ))}
      {/*
        If we're loading our first response, show the user a loading message,
        so that they don't just see an empty screen.
      */}
      {response === undefined && (
        <p className={css.informationText}>Loading...</p>
      )}
    </div>
  );
};

export default App;
