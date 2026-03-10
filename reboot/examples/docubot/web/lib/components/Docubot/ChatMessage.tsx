import { FC } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

const ChatMessage: FC<{
  message: string;
  name: string;
  isOwnMessage?: boolean;
}> = ({ message, name, isOwnMessage = false }) => {
  return (
    <div
      className={`m-2 relative flex flex-col mb-4 ${
        isOwnMessage ? "items-end" : "items-start"
      }`}
    >
      <div
        className={`text-sm w-fit ${
          isOwnMessage ? "mr-4" : "ml-4"
        } text-gray-400`}
      >
        {name}
      </div>
      <div
        className={`inset-0 bg-gray-100 w-fit ${
          isOwnMessage ? "rounded-l-[6px]" : "rounded-r-[6px]"
        }  ${
          isOwnMessage ? "rounded-br-[6px]" : "rounded-bl-[6px]"
        } p-2 text-sm ${isOwnMessage ? "mr-4" : "ml-4"} text-left`}
      >
        <Markdown remarkPlugins={[remarkGfm]}>{message}</Markdown>
      </div>
    </div>
  );
};

export default ChatMessage;
