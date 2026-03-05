import { useState, type FC } from "react";
import { useChat, usePing } from "../../../ping_api_zod_rbt_react";
import css from "./App.module.css";

/**
 * Compact pinger widget showing both Ping and Chat counters.
 *
 * Demonstrates that multiple state types can have implied state IDs at
 * the same time: `usePing()` gets its state ID from the customer's
 * parameter to the tool call, `useChat()` gets it from the MCP session.
 */
export const PingerApp: FC = () => {
  const [isPending, setIsPending] = useState(false);

  const ping = usePing();
  const chat = useChat();

  const { response: pingResponse, isLoading: pingLoading } = ping.useNumPings();
  const { response: chatResponse, isLoading: chatLoading } =
    chat.useCounterValue();

  const pingCount = pingResponse?.numPings ?? 0;
  const chatCount = chatResponse?.counterValue ?? 0;

  const handleClick = async () => {
    setIsPending(true);
    try {
      await Promise.all([ping.doPing(), chat.counterIncrement()]);
    } finally {
      setIsPending(false);
    }
  };

  if (
    pingLoading ||
    pingResponse === undefined ||
    chatLoading ||
    chatResponse === undefined
  ) {
    return (
      <div className={css.container}>
        <div style={{ opacity: 0.5 }}>Loading...</div>
      </div>
    );
  }

  return (
    <div className={css.container}>
      <div className={css.counter}>
        {pingCount} / {chatCount}
      </div>
      <button onClick={handleClick} disabled={isPending} className={css.button}>
        {isPending ? "Pinging..." : "Ping + Click!"}
      </button>
    </div>
  );
};
