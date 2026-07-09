// frontend/web/src/App.tsx
import {
  type UseCounterApi,
  type UseUserApi,
  useCounter,
} from "@api/ai_chat_counter/v1/counter_rbt_react";
import { useState, type FC } from "react";

interface AppProps {
  user: UseUserApi;
  onSignOut: () => void;
}

// Read an initial counter ID from the `?counter=<id>` query param so a
// counter can be shared via URL — the MCP clicker's "Open in web app"
// button deep-links here; picking a counter from the list below also
// opens it.
const initialCounterId = (): string =>
  new URLSearchParams(window.location.search).get("counter") ?? "";

export const App: FC<AppProps> = ({ user, onSignOut }) => {
  const [counterId, setCounterId] = useState(initialCounterId);

  return (
    <main className="shell">
      <header className="header">
        <h1>Chat Counter</h1>
        <div className="identity">
          <code>{user.state_id}</code>
          <button className="ghost" onClick={onSignOut}>
            Sign out
          </button>
        </div>
      </header>

      {counterId.length === 0 ? (
        <CounterList user={user} onOpen={setCounterId} />
      ) : (
        <>
          <button
            className="ghost back"
            onClick={() => {
              // Drop any `?counter=<id>` from the URL so a reload
              // stays on the list.
              window.history.replaceState(null, "", window.location.pathname);
              setCounterId("");
            }}
          >
            ← All counters
          </button>
          <CounterView key={counterId} counterId={counterId} />
        </>
      )}
    </main>
  );
};

// Landing view: create a counter, and open one of the signed-in
// user's own counters (read reactively via `User.list_counters`).
const CounterList: FC<{ user: UseUserApi; onOpen: (id: string) => void }> = ({
  user,
  onOpen,
}) => {
  const { response: listResponse, isLoading } = user.useListCounters();
  const [description, setDescription] = useState("");
  const [pending, setPending] = useState(false);

  const handleCreate = async () => {
    if (description.trim().length === 0) return;
    setPending(true);
    try {
      await user.createCounter({ description });
      setDescription("");
    } finally {
      setPending(false);
    }
  };

  const counters = listResponse?.counters ?? [];
  const showLoading = isLoading && listResponse === undefined;

  return (
    <>
      <section className="card">
        <h2>Create counter</h2>
        <form
          className="create-row"
          onSubmit={(event) => {
            event.preventDefault();
            void handleCreate();
          }}
        >
          <input
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            placeholder="What does this counter count?"
          />
          <button type="submit" disabled={pending}>
            Create
          </button>
        </form>
      </section>

      <section className="card">
        <h2>Your counters</h2>
        {showLoading ? (
          <p className="empty">Loading…</p>
        ) : counters.length === 0 ? (
          <p className="empty">No counters yet — create one above.</p>
        ) : (
          <ul className="counters">
            {counters.map((counter) => (
              <li key={counter.counterId} className="counter">
                <button
                  className="counter-open"
                  onClick={() => onOpen(counter.counterId)}
                >
                  <span className="counter-description">
                    {counter.description}
                  </span>
                  <code className="counter-id">{counter.counterId}</code>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
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
