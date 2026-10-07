import { react_pb, Status } from "@reboot-dev/reboot-api";

export interface ReactTransport {
  query(
    stateType: string,
    stateRef: string,
    request: react_pb.QueryRequest,
    signal: AbortSignal
  ): AsyncIterable<react_pb.QueryResponse>;
  mutate(
    stateType: string,
    stateRef: string,
    request: react_pb.MutateRequest
  ): Promise<react_pb.MutateResponse>;
}

type SendToolCall = (
  params: { name: string; arguments: Record<string, unknown> },
  options?: {
    timeout?: number;
    signal?: AbortSignal;
    resetTimeoutOnProgress?: boolean;
  }
) => Promise<any>;

function encodeBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
function decodeBase64(text: string): Uint8Array {
  return Uint8Array.from(atob(text), (character) => character.charCodeAt(0));
}
const sleep = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

class Inbox {
  values: react_pb.QueryResponse[] = [];
  error: unknown;
  wake?: () => void;
  push(value: react_pb.QueryResponse) {
    if (this.values.length >= 512) {
      this.fail(new Error("Bridge reader buffer full; reconnect required"));
      return;
    }
    this.values.push(value);
    this.wake?.();
  }
  fail(error: unknown) {
    this.error = error;
    this.wake?.();
  }
}

/** One instance per MCP app, independent of token refresh and React renders. */
export class AppBridgeTransport implements ReactTransport {
  private session = crypto.randomUUID();
  private cursor = 0;
  private readers = new Map<string, Inbox>();
  private polling = false;
  private closed = false;
  private cancellation = new AbortController();
  private mutations = new Map<string, Promise<unknown>>();
  // Control messages and writes share one short-call lane. The poll has its
  // own lane, keeping this app below the observed host concurrency limit.
  private control: Promise<unknown> = Promise.resolve();

  constructor(private sendToolCall: SendToolCall) {}

  private async callServerTool(
    name: string,
    args: Record<string, unknown>,
    signal?: AbortSignal
  ) {
    const result = await this.sendToolCall(
      { name, arguments: args },
      {
        timeout: 15000,
        signal: signal ?? this.cancellation.signal,
        resetTimeoutOnProgress: false,
      }
    );
    if (result.isError) throw new Error(JSON.stringify(result.content));
    return (
      result.structuredContent ??
      JSON.parse(result.content.find((part: any) => part.type === "text").text)
    );
  }

  private enqueueToolCall<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.control.then(operation);
    this.control = result.catch(() => {});
    return result;
  }

  private resetSession(error: unknown) {
    for (const reader of this.readers.values()) reader.fail(error);
    this.readers.clear();
    this.session = crypto.randomUUID();
    this.cursor = 0;
  }

  private async pollQueries() {
    if (this.polling || this.closed) return;
    this.polling = true;
    let backoff = 100;
    try {
      while (this.readers.size && !this.closed) {
        const session = this.session;
        try {
          const result = await this.callServerTool("reboot_internal_query", {
            session_id: session,
            operation: "poll",
            cursor: this.cursor,
            wait_ms: 10000,
          });
          if (session !== this.session) continue;
          if (result.reset) {
            this.resetSession(
              new Error("Bridge subscriptions expired; reconnect required")
            );
            continue;
          }
          if (result.busy) throw new Error("Bridge poll still active");
          for (const frame of result.events) {
            if (frame.sequence <= this.cursor) continue;
            this.readers
              .get(frame.queryId)
              ?.push(
                react_pb.QueryResponse.fromBinary(decodeBase64(frame.payload))
              );
            this.cursor = frame.sequence;
          }
          backoff = 100;
          // Successful idle: immediately reissue, preserving the subscription.
        } catch (error) {
          if (this.closed) break;
          await sleep(backoff);
          backoff = Math.min(backoff * 2, 3000);
        }
      }
    } finally {
      this.polling = false;
      if (this.readers.size && !this.closed) void this.pollQueries();
    }
  }

  async *query(
    stateType: string,
    stateRef: string,
    request: react_pb.QueryRequest,
    signal: AbortSignal
  ): AsyncGenerator<react_pb.QueryResponse> {
    const id = crypto.randomUUID();
    const session = this.session;
    const inbox = new Inbox();
    const abort = () => inbox.fail(new Error("Query cancelled"));
    signal.addEventListener("abort", abort);
    this.readers.set(id, inbox);
    try {
      if (signal.aborted || this.closed) throw new Error("Query cancelled");
      const opened = await this.enqueueToolCall(() =>
        this.callServerTool("reboot_internal_query", {
          session_id: session,
          operation: "open",
          query_id: id,
          state_type: stateType,
          state_ref: stateRef,
          payload: encodeBase64(request.toBinary()),
        })
      );
      if (!opened.opened) throw new Error("Unable to open bridge subscription");
      void this.pollQueries();
      while (!signal.aborted && !this.closed) {
        if (inbox.error) throw inbox.error;
        const response = inbox.values.shift();
        if (response === undefined) {
          await new Promise<void>((resolve) => {
            inbox.wake = resolve;
          });
          inbox.wake = undefined;
          continue;
        }
        if (response.responseOrStatus.case === "status") {
          throw Status.fromJsonString(response.responseOrStatus.value);
        }
        yield response;
      }
    } finally {
      signal.removeEventListener("abort", abort);
      this.readers.delete(id);
      if (!this.closed)
        void this.enqueueToolCall(() =>
          this.callServerTool("reboot_internal_query", {
            session_id: session,
            operation: "close",
            query_id: id,
          })
        ).catch(() => {});
    }
  }

  mutate(stateType: string, stateRef: string, request: react_pb.MutateRequest) {
    // Serialize once, including the original key, before the first attempt.
    const payload = encodeBase64(request.toBinary());
    const previous = this.mutations.get(stateType) ?? Promise.resolve();
    const result = previous
      .catch(() => {})
      .then(async () => {
        let backoff = 100;
        while (!this.closed) {
          try {
            const response = await this.enqueueToolCall(() =>
              this.callServerTool("reboot_internal_mutate", {
                state_type: stateType,
                state_ref: stateRef,
                payload,
              })
            );
            if (!response.retry)
              return react_pb.MutateResponse.fromBinary(
                decodeBase64(response.payload)
              );
          } catch (error) {
            if (this.closed) throw error;
          }
          await sleep(backoff);
          backoff = Math.min(backoff * 2, 3000);
        }
        throw new Error("Bridge closed");
      });
    this.mutations.set(stateType, result);
    void result
      .finally(() => {
        if (this.mutations.get(stateType) === result)
          this.mutations.delete(stateType);
      })
      .catch(() => {});
    return result;
  }

  close() {
    this.closed = true;
    this.cancellation.abort();
    this.resetSession(new Error("Bridge closed"));
    // The server lease is the fallback when a host drops teardown messages.
  }
}
