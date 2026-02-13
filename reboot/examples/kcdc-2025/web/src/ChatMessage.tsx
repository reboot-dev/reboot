import { Button } from "@/components/ui/button";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useMessage } from "./api/chat/v1/message_rbt_react";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { BookmarkIcon, ChatBubbleIcon, FaceIcon } from "@radix-ui/react-icons";
import EmojiPicker, { EmojiClickData } from "emoji-picker-react";
import { FC } from "react";
import Reaction from "./Reaction";

const Spinner = () => (
  <svg
    aria-hidden="true"
    className="w-8 h-8 text-gray-200 animate-spin dark:text-gray-600 fill-blue-600 absolute top-0 right-0 m-2"
    viewBox="0 0 100 101"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M100 50.5908C100 78.2051 77.6142 100.591 50 100.591C22.3858 100.591 0 78.2051 0 50.5908C0 22.9766 22.3858 0.59082 50 0.59082C77.6142 0.59082 100 22.9766 100 50.5908ZM9.08144 50.5908C9.08144 73.1895 27.4013 91.5094 50 91.5094C72.5987 91.5094 90.9186 73.1895 90.9186 50.5908C90.9186 27.9921 72.5987 9.67226 50 9.67226C27.4013 9.67226 9.08144 27.9921 9.08144 50.5908Z"
      fill="currentColor"
    />
    <path
      d="M93.9676 39.0409C96.393 38.4038 97.8624 35.9116 97.0079 33.5539C95.2932 28.8227 92.871 24.3692 89.8167 20.348C85.8452 15.1192 80.8826 10.7238 75.2124 7.41289C69.5422 4.10194 63.2754 1.94025 56.7698 1.05124C51.7666 0.367541 46.6976 0.446843 41.7345 1.27873C39.2613 1.69328 37.813 4.19778 38.4501 6.62326C39.0873 9.04874 41.5694 10.4717 44.0505 10.1071C47.8511 9.54855 51.7191 9.52689 55.5402 10.0491C60.8642 10.7766 65.9928 12.5457 70.6331 15.2552C75.2735 17.9648 79.3347 21.5619 82.5849 25.841C84.9175 28.9121 86.7997 32.2913 88.1811 35.8758C89.083 38.2158 91.5421 39.6781 93.9676 39.0409Z"
      fill="currentFill"
    />
  </svg>
);

const ChatMessage: FC<{
  timestamp: string;
  id: string;
  username: string;
  message: string;
  name: string;
  reactions: any;
  pending?: boolean;
}> = ({
  timestamp,
  id,
  message,
  name,
  reactions,
  username,
  pending = false,
}) => {
  const { addReaction } = useMessage({ id });

  const handleThumbsUp = () => {
    addReaction({ unicode: "👍", user: username });
  };

  const handleEmojiSelection = (emojiData: EmojiClickData) => {
    addReaction({ unicode: emojiData.emoji, user: username });
  };

  return (
    <HoverCard openDelay={10} closeDelay={10}>
      <div className="relative flex flex-col mb-4">
        {/* TODO: insert date in the separator. */}
        <Separator />
        <HoverCardTrigger>
          <div className="text-sm w-fit ml-4">
            {name} {!pending && new Date(Number(timestamp)).toLocaleString()}
          </div>
          <div className="inset-0 w-fit rounded-r-[6px] rounded-bl-[6px] p-2 text-sm mx-4 text-left">
            {message}
          </div>
        </HoverCardTrigger>
        <div className="flex ml-4 mt-2">
          {Object.entries(reactions)
            .sort((left, right) => {
              return left[0].localeCompare(right[0]);
            })
            .map(([reaction, { users }]) => (
              <Reaction
                reaction={[reaction, Object.keys(users).length]}
                messageId={id}
                key={id + reaction}
                className="mr-1 p-1"
                active={username in users}
                users={users}
                username={username}
              />
            ))}
        </div>
        {pending && <Spinner />}
      </div>
      <HoverCardContent
        align="end"
        side="top"
        sideOffset={-48}
        alignOffset={1}
        className="shadow-none p-0 mr-2 w-44"
      >
        <div className="flex flex-col justify-end">
          <Popover>
            <TooltipProvider>
              <div className="flex justify-between">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      className="border-0"
                      onClick={handleThumbsUp}
                    >
                      👍
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>+1</p>
                  </TooltipContent>
                </Tooltip>

                <Tooltip>
                  <TooltipTrigger asChild>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        size="icon"
                        className="border-0"
                      >
                        <FaceIcon />
                      </Button>
                    </PopoverTrigger>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Add reaction</p>
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      className="border-0"
                      disabled
                    >
                      <ChatBubbleIcon />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Reply in thread</p>
                  </TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      className="border-0"
                      disabled
                    >
                      <BookmarkIcon />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>Save for later</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            </TooltipProvider>
            <PopoverContent className="w-fit border-none p-0 mr-2">
              <EmojiPicker onEmojiClick={handleEmojiSelection} />
            </PopoverContent>
          </Popover>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
};

export default ChatMessage;
