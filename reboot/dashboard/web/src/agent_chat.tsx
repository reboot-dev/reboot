import { useRebootClient } from "@reboot-dev/reboot-react";
import { useEffect, useRef, useState } from "react";
import type { JSX } from "react";
import { IN_MCP_HOST } from "./constants";

type Option = { optionId: string; name: string; kind: string };
type ToolContent = { type: string; path?: string; oldText?: string; newText?: string; content?: { type: string; text?: string } };
type Tool = { toolCallId: string; title?: string; status?: string; content?: ToolContent[]; rawInput?: unknown };
type Permission = { request: string; toolCall: Tool; options: Option[] };
type Event = { type: string; channel?: string; cwd?: string; canResume?: boolean; message?: string; stopReason?: string; request?: string; toolCall?: Tool; options?: Option[]; update?: Tool & { sessionUpdate: string; content?: any; entries?: unknown } };

/** Text-only ACP v1 client. Commands, cwd and provider sessions stay server-owned. */
export function AgentChat(): JSX.Element | null {
  const client = useRebootClient();
  const token = useRef(client.bearerToken);
  token.current = client.bearerToken;
  const stream = useRef<AbortController | undefined>(undefined);
  const channel = useRef<string | undefined>(undefined);
  const [providers, setProviders] = useState<string[]>([]);
  const [provider, setProvider] = useState("");
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [resume, setResume] = useState(false);
  const [cwd, setCwd] = useState("");
  const [draft, setDraft] = useState("");
  const [text, setText] = useState("");
  const [tools, setTools] = useState<Record<string, Tool>>({});
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("Disconnected");
  const request = (path: string, value?: unknown, signal?: AbortSignal) => fetch(
    new URL(`/__/dashboard/acp/${path}`, client.url), {
      method: "POST", signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token.current}` },
      body: value === undefined ? undefined : JSON.stringify(value),
    });

  useEffect(() => {
    if (IN_MCP_HOST || client.bearerToken === undefined) return;
    const abort = new AbortController();
    void request("config", undefined, abort.signal).then(async response => {
      if (!response.ok) return;
      const config = await response.json();
      if (!abort.signal.aborted && config.enabled) {
        setProviders(config.providers);
        setProvider(current => config.providers.includes(current) ? current : config.providers[0]);
      }
    }).catch(() => {});
    return () => abort.abort();
  }, [client.url, client.bearerToken]);

  // A refreshed OAuth token changes future requests, not the current stream.
  useEffect(() => () => { stream.current?.abort(); }, [client.url]);

  const action = async (value: object) => {
    const response = await request("action", { ...value, channel: channel.current });
    if (!response.ok) throw new Error(`Agent action refused (${response.status})`);
  };
  const onEvent = (event: Event) => {
    if (event.type === "ready") {
      channel.current = event.channel; setConnected(true); setConnecting(false);
      setCwd(event.cwd ?? ""); setResume(event.canResume === true); setStatus("Ready");
    } else if (event.type === "update" && event.update) {
      const update = event.update;
      if (["agent_message_chunk", "user_message_chunk"].includes(update.sessionUpdate) && update.content?.type === "text") {
        setText(current => (current + update.content.text).slice(-200000));
      } else if (["tool_call", "tool_call_update"].includes(update.sessionUpdate)) {
        setTools(current => ({ ...current, [update.toolCallId]: { ...current[update.toolCallId], ...update } }));
      } else if (update.sessionUpdate === "plan") {
        setStatus(JSON.stringify(update.entries));
      }
    } else if (event.type === "permission") {
      setPermissions(current => [...current, event as Permission]);
    } else if (event.type === "permissions_cleared") {
      setPermissions([]);
    } else if (event.type === "complete") {
      setBusy(false); setStatus(`Stopped: ${event.stopReason}`);
    } else if (event.type === "error") {
      setBusy(false); setError(event.message ?? "Agent failed");
    }
  };
  const connect = async (load: boolean) => {
    stream.current?.abort();
    const abort = new AbortController(); stream.current = abort;
    setConnecting(true); setError(""); setText(""); setTools({}); setPermissions([]);
    try {
      const response = await request("connect", { provider, resume: load }, abort.signal);
      if (!response.ok || !response.body) throw new Error(`Connection refused (${response.status})`);
      const reader = response.body.getReader(); const decoder = new TextDecoder(); let buffered = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffered += decoder.decode(value, { stream: true });
        if (buffered.length > 4 * 1024 * 1024) throw new Error("Agent frame too large");
        let end: number;
        while ((end = buffered.indexOf("\n")) >= 0) {
          onEvent(JSON.parse(buffered.slice(0, end))); buffered = buffered.slice(end + 1);
        }
      }
    } catch (reason) {
      if (!abort.signal.aborted) setError(String(reason));
    } finally {
      if (stream.current === abort) {
        channel.current = undefined; setConnected(false); setConnecting(false); setBusy(false); setPermissions([]); setStatus("Disconnected");
      }
    }
  };
  if (providers.length === 0 || IN_MCP_HOST) return null;
  return <aside className="agent-chat" aria-label="Local coding agent">
    <header><strong>Local coding agent</strong> <span role="status">{status}</span></header>
    <p>Edits your application checkout. Not sandboxed by Reboot. Provider permissions apply.</p>
    <select aria-label="Agent provider" disabled={connected || connecting} value={provider} onChange={e => { setProvider(e.target.value); setResume(false); }}>
      {providers.map(name => <option key={name}>{name}</option>)}
    </select>
    <button disabled={connected || connecting} onClick={() => void connect(false)}>New session</button>
    <button disabled={connected || connecting || !resume} onClick={() => void connect(true)}>Resume last session</button>
    <button disabled={!connected && !connecting} onClick={() => stream.current?.abort()}>Disconnect</button>
    <small>{cwd}</small>
    {error && <p role="alert">{error}</p>}
    <pre className="agent-chat-transcript" aria-live="polite">{text}</pre>
    {Object.values<Tool>(tools).map(tool => <details key={tool.toolCallId} open={tool.status !== "completed"}>
      <summary>{tool.title ?? tool.toolCallId} — {tool.status ?? "pending"}</summary>
      {tool.content?.map((content, index) => content.type === "diff"
        ? <section key={index}><strong>{content.path}</strong><pre aria-label="Before edit">{content.oldText ?? "(new file)"}</pre><pre aria-label="After edit">{content.newText}</pre></section>
        : <pre key={index}>{content.content?.text ?? JSON.stringify(content)}</pre>)}
    </details>)}
    {permissions.map(permission => <section className="agent-chat-approval" key={permission.request} aria-label="Agent permission request">
      <strong>{permission.toolCall.title ?? "Permission requested"}</strong>
      <pre>{JSON.stringify(permission.toolCall, null, 2)}</pre>
      {permission.options.map(option => <button key={option.optionId} onClick={() => {
        void action({ type: "permission", request: permission.request, option: option.optionId }).then(() => setPermissions(current => current.filter(p => p.request !== permission.request))).catch(reason => setError(String(reason)));
      }}>{option.name} ({option.kind})</button>)}
    </section>)}
    <form onSubmit={event => {
      event.preventDefault(); const prompt = draft.trim(); if (!prompt || busy) return;
      setBusy(true); setText(current => current + `\nYou: ${prompt}\n`); setDraft(""); setError("");
      void action({ type: "prompt", text: prompt }).catch(reason => { setBusy(false); setError(String(reason)); });
    }}>
      <textarea aria-label="Message agent" value={draft} maxLength={32000} disabled={!connected || busy} onChange={e => setDraft(e.target.value)} />
      <button disabled={!connected || busy || !draft.trim()}>Send</button>
      <button type="button" disabled={!connected || !busy} onClick={() => { setStatus("Cancelling…"); void action({ type: "cancel" }).catch(reason => setError(String(reason))); }}>Cancel turn</button>
    </form>
  </aside>;
}
