// web/ui/clicker/App.tsx
import { useCounter } from "@api/ai_chat_counter/v1/counter_rbt_react";
import { useState, type FC } from "react";
import css from "./App.module.css";

export const ClickerApp: FC = () => {
  const [isPending, setIsPending] = useState(false);
  const counter = useCounter();
  const { response, isLoading } = counter.useGet();

  const value = response?.value ?? 0;

  const handleIncrement = async () => {
    setIsPending(true);
    try {
      await counter.increment({ amount: 1 });
    } finally {
      setIsPending(false);
    }
  };

  if (isLoading && response === undefined) {
    return <div>loading...</div>;
  }

  return (
    <div className={css.container}>
      <span className={css.value}>{value}</span>
      <button
        onClick={handleIncrement}
        disabled={isPending}
        className={css.button}
      >
        +
      </button>
    </div>
  );
};
