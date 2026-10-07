import { describe, expect, it } from "vitest";
import { react_pb } from "@reboot-dev/reboot-api";
import { AppBridgeTransport } from "@reboot-dev/reboot-react";

const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
const decode = (text: string) =>
  Uint8Array.from(atob(text), (c) => c.charCodeAt(0));

// Faults are injected at the host boundary, while the actual client transport
// handles multiplexing, cursors, queues, timeouts, and generated proto frames.
class Host {
  frames: any[] = [];
  polls = 0;
  peak = 0;
  wake?: () => void;
  attempts: string[] = [];
  effects = new Set<string>();
  drop = true;
  reset = false;
  sessions = new Set<string>();

  call = async ({ name, arguments: args }: any, options: any): Promise<any> => {
    if (name === "reboot_internal_mutate") {
      const request = react_pb.MutateRequest.fromBinary(decode(args.payload));
      this.attempts.push(request.idempotencyKey);
      this.effects.add(request.idempotencyKey);
      if (this.drop) {
        this.drop = false;
        throw new Error("reply lost after commit");
      }
      return {
        structuredContent: {
          payload: encode(
            new react_pb.MutateResponse({
              responseOrStatus: {
                case: "response",
                value: new Uint8Array([1]),
              },
            }).toBinary()
          ),
        },
      };
    }
    this.sessions.add(args.session_id);
    if (args.operation === "open") {
      this.frames.push({
        sequence: this.frames.length + 1,
        queryId: args.query_id,
        payload: encode(
          new react_pb.QueryResponse({
            responseOrStatus: { case: "response", value: new Uint8Array([7]) },
          }).toBinary()
        ),
      });
      this.wake?.();
      return { structuredContent: { opened: true } };
    }
    if (args.operation === "close")
      return { structuredContent: { closed: true } };
    this.polls++;
    this.peak = Math.max(this.polls, this.peak);
    try {
      if (
        !this.reset &&
        !this.frames.some((frame) => frame.sequence > args.cursor)
      ) {
        await new Promise<void>((resolve, reject) => {
          const abort = () => {
            reject(new Error("closed"));
          };
          options.signal.addEventListener("abort", abort, { once: true });
          this.wake = () => {
            options.signal.removeEventListener("abort", abort);
            resolve();
          };
        });
      }
      if (this.reset) {
        this.reset = false;
        return { structuredContent: { reset: true } };
      }
      return {
        structuredContent: {
          events: this.frames.filter((frame) => frame.sequence > args.cursor),
        },
      };
    } finally {
      this.polls--;
    }
  };
}

describe("actual AppBridge transport", () => {
  it("multiplexes three readers while keeping only one poll in flight", async () => {
    const host = new Host();
    const bridge = new AppBridgeTransport(host.call);
    const controller = new AbortController();
    const readers = Array.from({ length: 3 }, (_, i) =>
      bridge.query(
        "Test",
        String(i),
        new react_pb.QueryRequest({ method: "Get" }),
        controller.signal
      )
    );
    try {
      const initial = await Promise.all(readers.map((reader) => reader.next()));
      expect(
        initial.every(
          (result) => result.value?.responseOrStatus.case === "response"
        )
      ).toBe(true);
      expect(host.peak).toBe(1);
      expect(host.sessions.size).toBe(1);
    } finally {
      bridge.close();
      await Promise.all(readers.map((reader) => reader.return(undefined)));
    }
  });

  it("retries an uncertain mutation with the same key before sending the next actor write", async () => {
    const host = new Host();
    const bridge = new AppBridgeTransport(host.call);
    try {
      await Promise.all([
        bridge.mutate(
          "Account",
          "a",
          new react_pb.MutateRequest({
            method: "Write",
            idempotencyKey: "first",
          })
        ),
        bridge.mutate(
          "Account",
          "b",
          new react_pb.MutateRequest({
            method: "Write",
            idempotencyKey: "second",
          })
        ),
      ]);
      expect(host.attempts).toEqual(["first", "first", "second"]);
      expect(host.effects.size).toBe(2);
    } finally {
      bridge.close();
    }
  });

  it("signals subscription loss so generated hooks can flush writes and reconnect", async () => {
    const host = new Host();
    const bridge = new AppBridgeTransport(host.call);
    const reader = bridge.query(
      "Test",
      "a",
      new react_pb.QueryRequest({ method: "Get" }),
      new AbortController().signal
    );
    try {
      await reader.next();
      const next = reader.next();
      const rejection = expect(next).rejects.toThrow("expired");
      host.reset = true;
      host.wake?.();
      await rejection;
      const replacement = bridge.query(
        "Test",
        "a",
        new react_pb.QueryRequest({ method: "Get" }),
        new AbortController().signal
      );
      await replacement.next();
      expect(host.sessions.size).toBe(2);
      await replacement.return(undefined);
    } finally {
      bridge.close();
    }
  });
});
