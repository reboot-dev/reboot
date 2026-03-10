"use client";
import { FC } from "react";
import { useCounter } from "../../api/counter/v1/counter_rbt_react";
import { COUNTER_IDS } from "../../constants";

const TakeableCounter: FC<{ id: string; initialCount: number }> = ({
  id,
  initialCount,
}) => {
  const { useCount, increment, take } = useCounter({ id });
  const { response } = useCount();

  return (
    <TakeableCounterView
      count={response ? response.count : initialCount}
      onIncrement={() => increment()}
      onTake={() =>
        take({
          takerId: id,
          takenIds: COUNTER_IDS.filter((counterId: string) => counterId !== id),
        })
      }
    />
  );
};

export default TakeableCounter;

export const TakeableCounterView: FC<{
  count: number;
  onIncrement: () => void;
  onTake: () => void;
}> = ({ count, onIncrement, onTake }) => {
  return (
    <div
      style={{
        border: "1px solid black",
        padding: "8px",
        display: "inline-block",
        margin: "8px",
      }}
    >
      <div
        style={{
          textAlign: "center",
        }}
      >
        {count ? count : 0}
      </div>
      <div>
        <button
          style={{
            margin: "2px",
            background: "transparent",
            border: "1px solid black",
          }}
          onClick={onTake}
        >
          take
        </button>
        <button
          style={{
            margin: "2px",
            background: "transparent",
            border: "1px solid black",
          }}
          onClick={onIncrement}
        >
          +
        </button>
      </div>
    </div>
  );
};
