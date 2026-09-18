import {
  type FC,
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { v4 as uuidv4 } from "uuid";

const CONFIG_PATH = "/dashboard/agent-bridge-config";
const SESSION_STORAGE_KEY = "reboot.dashboard.agent-bridge.session-id";

type Config =
  | { enabled: false }
  | { enabled: true; relay_url: string };

type Message = {
  role: "assistant" | "user";
  text: string;
};

type RelayEvent = {
  type: string;
  session_id?: string;
  text?: string;
  message?: string;
};

function storedSessionId(): string | undefined {
  try {
    return localStorage.getItem(SESSION_STORAGE_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

function storeSessionId(sessionId: string): void {
  try {
    localStorage.setItem(SESSION_STORAGE_KEY, sessionId);
  } catch {
    // Private browsing may disable storage. The relay session still
    // works for the current page lifetime.
  }
}

/** An optional, relay-backed session panel. The relay—not the dashboard—
 * owns agent credentials, authorization, and provider-specific protocol. */
export const AgentChat: FC = () => {
  const socket = useRef<WebSocket | undefined>(undefined);
  const sessionId = useRef<string | undefined>(storedSessionId());
  const [config, setConfig] = useState<Config | undefined>();
  const [connected, setConnected] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string>();
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
      connection.send(
        JSON.stringify({ type: "session.resume", session_id: sessionId.current })
      );
    };
    connection.onmessage = (event: MessageEvent<string>) => {
      let message: RelayEvent;
      try {
        message = JSON.parse(event.data) as RelayEvent;
      } catch {
        setError("The agent relay sent an invalid message.");
        return;
      }
      if (message.type === "session.ready" && message.session_id !== undefined) {
        sessionId.current = message.session_id;
        storeSessionId(message.session_id);
      } else if (message.type === "message.delta" && message.text !== undefined) {
        setMessages((current) => {
          const last = current[current.length - 1];
          return last?.role === "assistant"
            ? [...current.slice(0, -1), { role: "assistant", text: last.text + message.text }]
            : [...current, { role: "assistant", text: message.text }];
        });
      } else if (message.type === "error") {
        setError(message.message ?? "The agent relay reported an error.");
      }
    };
    connection.onerror = () => setError("Could not connect to the agent relay.");
    connection.onclose = () => setConnected(false);
    return () => connection.close();
  }, [config, reconnect]);

  const submit = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const text = draft.trim();
      if (text.length === 0 || socket.current?.readyState !== WebSocket.OPEN) return;
      setMessages((current) => [...current, { role: "user", text }]);
      socket.current.send(
        JSON.stringify({
          type: "prompt.submit",
          session_id: sessionId.current,
          text,
          request_id: uuidv4(),
        })
      );
      setDraft("");
    },
    [draft]
  );

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
      <form className="agent-chat-form" onSubmit={submit}>
        <textarea
          aria-label="Message agent"
          disabled={!connected}
          onChange={(event) => setDraft(event.target.value)}
          placeholder="Message the attached agent session"
          value={draft}
        />
        <button disabled={!connected || draft.trim().length === 0} type="submit">
          Send
        </button>
      </form>
    </aside>
  );
};
