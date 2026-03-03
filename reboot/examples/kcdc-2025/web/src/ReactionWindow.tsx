import { Separator } from "@/components/ui/separator";
import { FC, useState } from "react";
import { useUser } from "./api/chat/v1/user_rbt_react";

const PAGE_SIZE = 40;

const dateFromUUIDv7 = (uuid: string): Date => {
  // Split the UUID into its components.
  const parts = uuid.split("-");

  // The second part of the UUID contains the high bits of the
  // timestamp (48 bits in total).
  const highBitsHex = parts[0] + parts[1].slice(0, 4);

  // Convert the high bits from hex to decimal. The UUIDv7 timestamp
  // is the number of milliseconds since Unix epoch (January 1, 1970).
  const timestampInMilliseconds = parseInt(highBitsHex, 16);

  return new Date(timestampInMilliseconds);
};

const ReactionsWindow: FC<{}> = () => {
  const username = localStorage.getItem("username");

  const [limit, setLimit] = useState(40);
  const { useMessagesReactions } = useUser({ id: username });

  const { response } = useMessagesReactions({ limit });

  const reactions = (response && response.reactions) || {};

  const handleScroll = (e: React.UIEvent<HTMLElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.target as HTMLElement;
    const position = Math.ceil(
      (scrollTop / (scrollHeight - clientHeight)) * 100
    );

    if (position === 100) {
      setLimit((limit) => limit + PAGE_SIZE);
    }
  };

  return (
    <div onScroll={handleScroll} className="relative h-screen overflow-y-auto">
      {Object.keys(reactions)
        .sort()
        .reverse()
        .map((id) => {
          return (
            <div key={id}>
              <div className="p-4">
                {reactions[id].user} reacted with {reactions[id].unicode} to
                your message <i>"{reactions[id].snippet}"</i> at{" "}
                {dateFromUUIDv7(id).toLocaleString()}
              </div>
              <Separator />
            </div>
          );
        })}
    </div>
  );
};

export default ReactionsWindow;
