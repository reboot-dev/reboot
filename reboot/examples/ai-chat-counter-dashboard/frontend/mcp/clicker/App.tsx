import { useState, type FC } from "react";
import {
  type UseCounterApi,
  useCounter,
} from "@api/ai_chat_counter/v1/counter_rbt_react";
import css from "./App.module.css";

export const ClickerApp: FC = () => {
  const { counter, isLoading } = useCounter();

  if (isLoading) {
    return <div>loading...</div>;
  }

  if (counter === undefined) {
    console.error("No default Counter id was available; cannot render.");
    return <div>An error occurred, sorry about that!</div>;
  }

  return <Clicker counter={counter} />;
};

const Clicker: FC<{ counter: UseCounterApi }> = ({ counter }) => {
  const [isPending, setIsPending] = useState(false);
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
