import { useState, type FC } from "react";
import { useCounter, usePing } from "../../../ping_api_zod_rbt_react";
import css from "./App.module.css";

/**
 * Compact pinger widget showing both Ping and Counter values.
 *
 * Demonstrates that multiple state types can have implied state IDs at
 * the same time: `usePing()` gets its state ID from the customer's
 * parameter to the tool call, `useCounter()` gets it from the MCP
 * session.
 */
export const PingerApp: FC = () => {
  const [isPending, setIsPending] = useState(false);

  const ping = usePing();
  const counter = useCounter();

  const { response: pingResponse, isLoading: pingLoading } = ping.useNumPings();
  const { response: counterResponse, isLoading: counterLoading } =
    counter.useValue();

  const pingCount = pingResponse?.numPings ?? 0;
  const counterCount = counterResponse?.value ?? 0;

  const handleClick = async () => {
    setIsPending(true);
    try {
      await Promise.all([ping.doPing(), counter.increment()]);
    } finally {
      setIsPending(false);
    }
  };

  if (
    pingLoading ||
    pingResponse === undefined ||
    counterLoading ||
    counterResponse === undefined
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
        {pingCount} / {counterCount}
      </div>
      <button onClick={handleClick} disabled={isPending} className={css.button}>
        {isPending ? "Pinging..." : "Ping + Click!"}
      </button>
    </div>
  );
};
