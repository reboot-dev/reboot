import type { App as McpApp } from "@modelcontextprotocol/ext-apps/react";
import { useEffect, useRef, useState, type FC } from "react";
import { useCounter } from "../../../api/mcp_counter/v1/counter_rbt_react";
import css from "./App.module.css";

const COUNTER_ID = "default";

interface ClickerAppProps {
  app: McpApp;
}

/**
 * Compact clicker widget with trend indicator.
 * Uses MCP tools for mutations + WebSocket for reactive reads.
 * Designed to work alongside dashboard for side-by-side demos.
 */
export const ClickerApp: FC<ClickerAppProps> = ({ app }) => {
  const [isPending, setIsPending] = useState(false);
  const [pulseResult, setPulseResult] = useState<string | null>(null);
  const { useGet } = useCounter({ id: COUNTER_ID });
  const { response, isLoading } = useGet();
  const prevValueRef = useRef<number | null>(null);
  const [trend, setTrend] = useState<"up" | "down" | "same" | null>(null);

  const value = response?.value ?? 0;

  // Track trend based on value changes (reacts to any source).
  useEffect(() => {
    if (response?.value !== undefined) {
      if (prevValueRef.current !== null) {
        if (response.value > prevValueRef.current) {
          setTrend("up");
        } else if (response.value < prevValueRef.current) {
          setTrend("down");
        } else {
          setTrend("same");
        }
      }
      prevValueRef.current = response.value;
    }
  }, [response?.value]);

  const handleIncrement = async () => {
    setIsPending(true);
    try {
      await app.callServerTool({
        name: "increment_counter",
        arguments: {},
      });
    } finally {
      setIsPending(false);
    }
  };

  const handleDecrement = async () => {
    setIsPending(true);
    try {
      await app.callServerTool({
        name: "decrement_counter",
        arguments: {},
      });
    } finally {
      setIsPending(false);
    }
  };

  // Pulse: Signal agent by adding a message to the conversation.
  // 1. callServerTool fetches value privately (agent doesn't see)
  // 2. sendMessage adds to conversation (agent sees as "user" message)
  const pulse = async () => {
    setIsPending(true);
    setPulseResult(null);
    try {
      // Fetch value privately
      const result = await app.callServerTool({
        name: "get_counter",
        arguments: {},
      });

      // Extract text from result
      const text =
        result.content?.[0]?.type === "text"
          ? (result.content[0] as { type: "text"; text: string }).text
          : JSON.stringify(result);

      // Add to conversation so agent sees it
      await app.sendMessage({
        role: "user",
        content: [{ type: "text", text: `[Counter pulse: ${text}]` }],
      });

      setPulseResult(`Sent to agent: ${text}`);
    } catch (err) {
      setPulseResult(`Error: ${err}`);
    } finally {
      setIsPending(false);
    }
  };

  const trendIcon = trend === "up" ? "↑" : trend === "down" ? "↓" : "→";
  const trendClass =
    trend === "up" ? css.trendUp : trend === "down" ? css.trendDown : "";

  if (isLoading && response === undefined) {
    return (
      <div className={css.container}>
        <div className={css.loading}>loading...</div>
      </div>
    );
  }

  return (
    <div className={css.container}>
      <div className={css.row}>
        <button
          onClick={handleDecrement}
          disabled={isPending}
          className={css.buttonDecrement}
        >
          −
        </button>
        <div className={css.valueGroup}>
          <div
            className={`${css.counter} ${trendClass} ${
              isPending ? css.pending : ""
            }`}
          >
            {value}
          </div>
          {trend && (
            <span className={`${css.trend} ${trendClass}`}>{trendIcon}</span>
          )}
        </div>
        <button
          onClick={handleIncrement}
          disabled={isPending}
          className={css.buttonIncrement}
        >
          +
        </button>
      </div>
      <span className={`${css.syncStatus} ${isPending ? css.visible : ""}`}>
        syncing...
      </span>
      <button onClick={pulse} disabled={isPending} className={css.pulseButton}>
        Show and tell the AI Agent!
      </button>
      {pulseResult && <pre className={css.pulseResult}>{pulseResult}</pre>}
    </div>
  );
};
