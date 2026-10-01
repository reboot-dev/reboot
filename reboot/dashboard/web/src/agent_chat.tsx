import {
  type FC,
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

const CONFIG_PATH = "/dashboard/agent-bridge-config";

type Config =
  | { enabled: false }
  | { enabled: true; relay_url: string };

type Message = {
  role: "assistant" | "user";
  text: string;
};

type ApprovalRequest = {
  requestId: string;
  command?: string;
  choices: string[];
};

type RelayEvent = {
  type: string;
  text?: string;
  message?: string;
  request_id?: string;
  command?: string;
  choices?: string[];
};

/** An optional, relay-backed session panel. The relay—not the dashboard—
 * owns agent credentials, authorization, provider sessions, and protocol
 * translation. Browser messages are deliberately semantic rather than
 * provider-shaped: the browser cannot select a provider session or invoke
 * provider RPC methods. */
export const AgentChat: FC = () => {
  const socket = useRef<WebSocket | undefined>(undefined);
  const [config, setConfig] = useState<Config | undefined>();
  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string>();
  const [approval, setApproval] = useState<ApprovalRequest>();
  const [sending, setSending] = useState(false);
  const [reconnect, setReconnect] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void fetch(CONFIG_PATH)
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Could not load agent bridge configuration (${response.status})`);
        }
        return (await response.json()) as Config;
      })
      .then((loaded) => {
        if (!cancelled) setConfig(loaded);
      })
      .catch((reason: unknown) => {
        if (!cancelled) setError(String(reason));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (config === undefined || !config.enabled) return;

    const connection = new WebSocket(config.relay_url);
    socket.current = connection;
    connection.onopen = () => {
      setConnected(true);
      setError(undefined);
    };
    connection.onmessage = (event: MessageEvent<string>) => {
      let message: RelayEvent;
      try {
        message = JSON.parse(event.data) as RelayEvent;
      } catch {
        setError("The agent relay sent an invalid message.");
        return;
      }
      if (message.type === "message.delta" && message.text !== undefined) {
        setMessages((current) => {
          const last = current[current.length - 1];
          return last?.role === "assistant"
            ? [...current.slice(0, -1), { role: "assistant", text: last.text + message.text }]
            : [...current, { role: "assistant", text: message.text }];
        });
      } else if (message.type === "message.complete" && message.text !== undefined) {
        setMessages((current: Message[]) => {
          const last = current[current.length - 1];
          return last?.role === "assistant"
            ? [...current.slice(0, -1), { role: "assistant", text: message.text }]
            : [...current, { role: "assistant", text: message.text }];
        });
      } else if (message.type === "turn.complete") {
        setSending(false);
      } else if (message.type === "approval.request" && message.request_id !== undefined) {
        setApproval({
          requestId: message.request_id,
          command: message.command,
          choices: message.choices ?? ["deny"],
        });
      } else if (message.type === "error") {
        setSending(false);
        setError(message.message ?? "The agent relay reported an error.");
      }
    };
    connection.onerror = () => setError("Could not connect to the agent relay.");
    connection.onclose = () => {
      setConnected(false);
      setSending(false);
    };
    return () => connection.close();
  }, [config, reconnect]);

  const submit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const text = draft.trim();
      if (
        text.length === 0 ||
        sending ||
        socket.current?.readyState !== WebSocket.OPEN
      ) {
        return;
      }
      setMessages((current) => [...current, { role: "user", text }]);
      setSending(true);
      socket.current.send(JSON.stringify({ type: "prompt", text }));
      setDraft("");
    },
    [draft, sending]
  );

  const respondToApproval = useCallback((choice: string) => {
    if (approval === undefined || socket.current?.readyState !== WebSocket.OPEN) return;
    socket.current.send(
      JSON.stringify({ type: "approval.respond", request_id: approval.requestId, choice })
    );
    setApproval(undefined);
  }, [approval]);

  if (config === undefined || !config.enabled) return null;

  return (
    <aside className="agent-chat" aria-label="Agent session">
      <header className="agent-chat-header">
        <strong>Agent</strong>
        <span className={connected ? "agent-chat-live" : "agent-chat-offline"}>
          {connected ? "connected" : "connecting…"}
        </span>
        {!connected && (
          <button onClick={() => setReconnect((current) => current + 1)} type="button">
            Retry
          </button>
        )}
      </header>
      <div className="agent-chat-transcript" aria-live="polite">
        {messages.map((message, index) => (
          <p className={`agent-chat-message agent-chat-${message.role}`} key={index}>
            {message.text}
          </p>
        ))}
      </div>
      {error !== undefined && <p className="agent-chat-error">{error}</p>}
      {approval !== undefined && (
        <section className="agent-chat-approval" aria-label="Terminal command approval">
          <strong>Approve terminal command?</strong>
          {approval.command !== undefined && <pre>{approval.command}</pre>}
          <div>
            {approval.choices.map((choice) => (
              <button key={choice} onClick={() => respondToApproval(choice)} type="button">
                {choice}
              </button>
            ))}
          </div>
        </section>
      )}
      <form className="agent-chat-form" onSubmit={submit}>
        <textarea
          aria-label="Message agent"
          disabled={!connected || sending}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Message the attached agent session"
          value={draft}
        />
        <button disabled={!connected || sending || draft.trim().length === 0} type="submit">
          Send
        </button>
      </form>
    </aside>
  );
};
