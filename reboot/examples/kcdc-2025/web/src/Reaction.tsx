import { Badge } from "@/components/ui/badge";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { FC, useState } from "react";
import { useMessage } from "./api/chat/v1/message_rbt_react";

interface ReactionProps {
  reaction: [string, number];
  users: { [user: string]: string };
  messageId: string;
  username: string;
  className?: string;
  active?: boolean;
}

const Reaction: FC<ReactionProps> = ({
  reaction: [emoji, count],
  messageId,
  users,
  username,
  active = false,
  className = "",
}) => {
  const [variant, setVariant] = useState<"secondary" | "outline">("secondary");

  const { addReaction, removeReaction } = useMessage({ id: messageId });

  const handleClick = () => {
    if (active) {
      removeReaction({ unicode: emoji, user: username });
    } else {
      addReaction({ unicode: emoji, user: username });
    }
  };

  return (
    <HoverCard>
      <HoverCardTrigger>
        <Badge
          variant={active ? "default" : variant}
          className={`w-fit cursor-pointer ${className}`}
          onMouseEnter={() => setVariant("outline")}
          onMouseLeave={() => setVariant("secondary")}
          onClick={handleClick}
        >
          {emoji} {count}
        </Badge>
      </HoverCardTrigger>
      <HoverCardContent>
        <div className="flex flex-col items-center">
          <div className="text-3xl">{emoji}</div>
          <div>{`${Object.keys(users).join(", ")} reacted with ${emoji}`}</div>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
};

export default Reaction;
