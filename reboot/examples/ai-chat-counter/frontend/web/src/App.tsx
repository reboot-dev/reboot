// frontend/web/src/App.tsx
import {
  type UseCounterApi,
  useCounter,
} from "@api/ai_chat_counter/v1/counter_rbt_react";
import { useState, type FC } from "react";

// Read an initial counter ID from the `?counter=<id>` query param so a
// counter can be shared via URL; the input below can also override it.
const initialCounterId = (): string =>
  new URLSearchParams(window.location.search).get("counter") ?? "";

export const App: FC = () => {
  const [counterId, setCounterId] = useState(initialCounterId);
  const [draft, setDraft] = useState(counterId);

  return (
    <main className="shell">
      {counterId.length === 0 ? (
        <section className="card">
          <h2>Open a counter</h2>
          <form
            className="create-row"
            onSubmit={(event) => {
              event.preventDefault();
              setCounterId(draft.trim());
            }}
          >
            <input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="counter ID"
            />
            <button type="submit">Open</button>
          </form>
        </section>
      ) : (
        <CounterView key={counterId} counterId={counterId} />
      )}
    </main>
  );
};

const CounterView: FC<{ counterId: string }> = ({ counterId }) => {
  // The generated zod hook returns the `UseCounterApi` directly; reads
  // are exposed as nested `use*` hooks and writes as plain methods.
  const counter: UseCounterApi = useCounter({ id: counterId });
  const { response: valueResponse, isLoading } = counter.useGet();
  const { response: descriptionResponse } = counter.useDescription();
  const [pending, setPending] = useState(false);

  // Show a muted placeholder until the description loads rather than
  // flashing the "(no description)" fallback first.
  const descriptionLoading = descriptionResponse === undefined;

  const handleIncrement = async () => {
    setPending(true);
    try {
      await counter.increment({ amount: 1 });
    } finally {
      setPending(false);
    }
  };

  return (
    <section className="card counter-detail">
      <p
        className={
          "counter-detail-description" + (descriptionLoading ? " muted" : "")
        }
      >
        {descriptionLoading
          ? "Loading…"
          : descriptionResponse?.description || "(no description)"}
      </p>
      <div className="counter-detail-value">
        {isLoading && valueResponse === undefined
          ? "…"
          : valueResponse?.value ?? 0}
      </div>
      <button onClick={handleIncrement} disabled={pending}>
        {pending ? "Incrementing…" : "Increment"}
      </button>
    </section>
  );
};
