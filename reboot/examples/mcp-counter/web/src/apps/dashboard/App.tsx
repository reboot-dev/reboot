import { useEffect, useState, type FC } from "react";
import type { App as McpApp } from "@modelcontextprotocol/ext-apps/react";
import { useCounter } from "../../../api/mcp_counter/v1/counter_rbt_react";
import css from "./App.module.css";

const COUNTER_ID = "default";

type Trend = "up" | "down" | "same";

interface HistoryEntry {
  value: number;
  trend: Trend | null;
}

interface DashboardAppProps {
  app: McpApp;
}

/**
 * Hybrid dashboard counter interface.
 * Uses MCP tools for mutations + WebSocket for reactive reads.
 */
export const DashboardApp: FC<DashboardAppProps> = ({ app }) => {
  const [isPending, setIsPending] = useState(false);
  const { useGet } = useCounter({ id: COUNTER_ID });
  const { response, isLoading } = useGet();
  const [history, setHistory] = useState<HistoryEntry[]>([]);

  const value = response?.value ?? 0;
  const currentTrend =
    history.length > 0 ? history[history.length - 1].trend : null;

  // Track history of values with trends (auto-updates via WebSocket).
  useEffect(() => {
    if (response?.value !== undefined) {
      setHistory((prev) => {
        const prevValue = prev.length > 0 ? prev[prev.length - 1].value : null;
        let trend: Trend | null = null;
        if (prevValue !== null) {
          if (response.value > prevValue) trend = "up";
          else if (response.value < prevValue) trend = "down";
          else trend = "same";
        }
        const next = [...prev, { value: response.value, trend }];
        return next.slice(-9);
      });
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

  if (isLoading && response === undefined) {
    return (
      <div className={css.container}>
        <div className={css.headerLoading}>
          <span className={css.loading}>loading...</span>
        </div>
      </div>
    );
  }

  return (
    <div className={css.container}>
      <div className={css.header}>
        <span className={css.headerTitle}>Counter Dashboard</span>
        <span className={isPending ? css.headerSyncing : css.headerStatus}>
          {isPending ? "syncing..." : "live"}
        </span>
      </div>

      <div className={css.grid}>
        <div className={css.panel}>
          <div className={css.label}>Current Value</div>
          <div
            className={`${css.value} ${
              currentTrend === "up"
                ? css.trendUp
                : currentTrend === "down"
                ? css.trendDown
                : ""
            } ${isPending ? css.pending : ""}`}
          >
            {value}
          </div>
        </div>

        <div className={css.panel}>
          <div className={css.label}>Recent Values</div>
          <div className={css.historyList}>
            {history.map((entry, i) => (
              <span
                key={i}
                className={`${css.historyItem} ${
                  entry.trend === "up"
                    ? css.historyUp
                    : entry.trend === "down"
                    ? css.historyDown
                    : ""
                } ${i === history.length - 1 ? css.current : ""}`}
              >
                {entry.value}
              </span>
            ))}
          </div>
        </div>

        <div className={css.panelFull}>
          <div className={css.label}>Controls</div>
          <div className={css.controls}>
            <button
              onClick={handleDecrement}
              disabled={isPending}
              className={css.buttonDecrement}
            >
              Decrement
            </button>
            <button
              onClick={handleIncrement}
              disabled={isPending}
              className={css.buttonIncrement}
            >
              Increment
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
