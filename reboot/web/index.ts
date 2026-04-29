import { Message, MessageType, PartialMessage } from "@bufbuild/protobuf";
import {
  Aborted,
  Backoff,
  Event,
  Status,
  assert,
  check_bufbuild_protobuf_library,
  errors_pb,
  react_pb,
  retryForever,
  stateIdToRef,
} from "@reboot-dev/reboot-api";
import { v7 as uuidv7 } from "uuid";

check_bufbuild_protobuf_library(Message);

// When running in Node.js (e.g., during testing or SSR), handle SIGPIPE
// to prevent process crashes when writing to closed sockets. This can occur
// when a server is shutting down during a connection attempt. In browsers,
// SIGPIPE doesn't exist so this is a no-op.
if (typeof process !== "undefined" && process.on) {
  // Check if a handler is already installed to avoid conflicts.
  const existingListeners = process.listenerCount("SIGPIPE");
  if (existingListeners === 0) {
    process.on("SIGPIPE", () => {
      // Ignore SIGPIPE - let the underlying fetch fail with a retryable
      // error instead of crashing the process.
    });
  }
}

export {
  OfflineCacheStorageType,
  calcSha256,
  isOfflineCacheInitialized,
  offlineCache,
} from "./offline_cache.js";

export type ResponseOrStatus<ResponseType> =
  | {
      response: ResponseType;
      status?: undefined;
    }
  | {
      response?: undefined;
      status: Status;
    };

export type ResponseOrAborted<ResponseType, AbortedType> =
  | {
      response: ResponseType;
      aborted?: undefined;
    }
  | {
      response?: undefined;
      aborted: AbortedType;
    };

export class Deferred<T> {
  _promise: Promise<T>;
  _deferredFn: () => Promise<T>;
  _resolve: any;
  _reject: any;

  constructor(deferredFn: () => Promise<T>) {
    this._deferredFn = deferredFn;
    this._resolve = (_result: T) => {};
    this._reject = (_e: unknown) => {};
    this._promise = new Promise<T>((resolve, reject) => {
      this._resolve = resolve;
      this._reject = reject;
    });
  }

  start() {
    this._deferredFn()
      .then((result: T) => this._resolve(result))
      .catch((e: unknown) => this._reject(e));
  }

  get promise() {
    return this._promise;
  }
}

interface AbortedType<A extends Aborted> {
  new (...args: any[]): A;
  fromStatus(status: Status): A;
}

export async function httpCall<
  RequestType extends Message<RequestType>,
  ResponseType extends Message<ResponseType>,
  A extends Aborted,
  AT extends AbortedType<A>
>({
  url,
  method,
  stateRef,
  requestType,
  responseType,
  abortedType,
  request,
  idempotencyKey,
  options,
  bearerToken,
}: {
  url: string;
  method: string;
  stateRef: string;
  requestType: MessageType<RequestType>;
  responseType: MessageType<ResponseType>;
  abortedType: AT;
  request: RequestType;
  idempotencyKey: string;
  options?: {
    signal?: AbortSignal;
  };
  bearerToken?: () => Promise<string | undefined>;
}): Promise<ResponseType> {
  if (!(request instanceof requestType)) {
    throw new TypeError("'request' is not of type 'requestType'");
  }

  const headers = new Headers();
  headers.set("Content-Type", "application/json");
  headers.set("x-reboot-idempotency-key", idempotencyKey);

  if (bearerToken !== undefined) {
    const token = await bearerToken();
    if (token !== undefined) {
      headers.set("Authorization", `Bearer ${token}`);
    }
  }

  // Fetch with retry, using a backoff, i.e., if we get disconnected.
  const { response, aborted } = await (async () => {
    const backoff = new Backoff();

    while (true) {
      try {
        // Invariant here is that we use the '/package.service.method' path and
        // HTTP 'POST' method (we need 'POST' because we send an HTTP body).
        //
        // See also 'reboot/helpers.py'.
        const response = await guardedFetch(
          new Request(`${url}/__/reboot/rpc/${stateRef}/${method}`, {
            method: "POST",
            headers,
            // Tell browser to pass cookies, even cross-origin.
            // TODO: Enable when the backend supports CORS.
            // credentials: "include",
            body: request.toJsonString(),
          }),
          options
        );

        // Since it is a 'fetch', we could get a retryable error, but
        // it won't throw an exception, so we have to check the
        // response status code and retry it.
        // - 502 (Bad Gateway): Proxy can't reach the backend.
        // - 503 (Unavailable): Server is temporarily unavailable.
        // - 499 (Cancelled): Request was cancelled, often because the
        //   server is shutting down. This is retryable.
        if (
          response.status === 502 ||
          response.status === 503 ||
          response.status === 499
        ) {
          if (response.headers.get("content-type") === "application/json") {
            const status = Status.fromJson(await response.json());
            const aborted = abortedType.fromStatus(status);
            // Log the error later in the 'catch' block.
            throw aborted;
          } else {
            const aborted = new abortedType(new errors_pb.Unknown(), {
              message: `Unknown error with HTTP status ${response.status}`,
            });
            throw aborted;
          }
        }
        backoff.reset({ log: `[Reboot] Call to \`${method}\` succeeded` });
        return { response };
      } catch (e: unknown) {
        if (options?.signal?.aborted) {
          const aborted = new abortedType(new errors_pb.Aborted(), {
            message:
              e instanceof Error
                ? `${e}`
                : `Unknown error: ${JSON.stringify(e)}`,
          });

          return { aborted };
        } else if (e instanceof Error) {
          console.error(e);
        } else {
          console.error(`Unknown error: ${JSON.stringify(e)}`);
        }
      }

      await backoff.wait({
        log: `[Reboot] Retrying call to \`${method}\` with backoff ...`,
      });
    }
  })();

  if (!response) {
    if (aborted) throw aborted;
    throw new Error("Unexpected: response and aborted both undefined");
  }

  if (!response.ok) {
    if (response.headers.get("content-type") === "application/json") {
      const status = Status.fromJson(await response.json());

      const aborted = abortedType.fromStatus(status);

      console.warn(`'${method}' aborted with ${aborted.message}`);

      throw aborted;
    } else {
      const aborted = new abortedType(new errors_pb.Unknown(), {
        message: `Unknown error with HTTP status ${response.status}`,
      });

      throw aborted;
    }
  } else {
    return responseType.fromJson(await response.json());
  }
}

export function reactively<
  RequestType extends Message<RequestType>,
  ResponseType extends Message<ResponseType>
>({
  url,
  state,
  method,
  id,
  requestType,
  responseType,
  request,
  signal,
  bearerToken,
  websockets = false,
}: {
  url: string;
  state: string;
  method: string;
  id: string;
  requestType: MessageType<RequestType>;
  responseType: MessageType<ResponseType>;
  request?: RequestType;
  signal?: AbortSignal;
  bearerToken?: () => Promise<string | undefined>;
  websockets: boolean;
}): [
  AsyncGenerator<ResponseType, void, unknown>,
  (newRequest: PartialMessage<RequestType>) => void
] {
  if (request !== undefined) {
    if (!(request instanceof requestType)) {
      throw new TypeError("'request' is not of type 'requestType'");
    }
  }

  // Track whether or not we've got the first request or are still
  // waiting for it.
  const firstRequest = new Event();

  if (request !== undefined) {
    firstRequest.set();
  }

  // We need a separate `AbortController` so we can abort `responses`
  // if/when we get a new request via `setRequest`.
  let responsesAbortController = new AbortController();

  if (signal !== undefined) {
    signal.addEventListener("abort", () => {
      responsesAbortController.abort();
    });
  }

  const setRequest = (partialRequest: PartialMessage<RequestType>) => {
    const isFirstRequest = request === undefined;

    request =
      partialRequest instanceof requestType
        ? partialRequest
        : new requestType(partialRequest);

    if (isFirstRequest) {
      firstRequest.set();
    } else {
      // Otherwise abort current `responses` so that we'll restart
      // with the new request.
      responsesAbortController.abort();

      responsesAbortController = new AbortController();
    }
  };

  async function* responses(): AsyncGenerator<ResponseType, void, unknown> {
    // Wait for either the first request or an abort.
    await Promise.race([
      firstRequest.wait(),
      new Promise<void>((resolve) => {
        if (signal !== undefined) {
          signal.addEventListener("abort", () => {
            resolve();
          });
        }
      }),
    ]);

    const backoff = new Backoff();

    assert(request !== undefined);

    while (signal === undefined || !signal.aborted) {
      try {
        const queryRequest = new react_pb.QueryRequest({
          method,
          request: request.toBinary(),
          ...((bearerToken !== undefined && {
            bearerToken: await bearerToken(),
          }) ||
            {}),
        });

        const stateRef = stateIdToRef(state, id);

        const queryResponses = reactiveReader({
          endpoint: `${url}/__/reboot/rpc/${stateRef}`,
          request: queryRequest,
          signal: responsesAbortController.signal,
          websockets,
        });

        for await (const queryResponse of queryResponses) {
          backoff.reset({ log: `[Reboot] Call to \`${method}\` succeeded` });
          if (queryResponse.responseOrStatus.case === "response") {
            const response = responseType.fromBinary(
              queryResponse.responseOrStatus.value
            );
            yield response;
          }
        }
      } catch (e) {
        if (signal === undefined || !signal.aborted) {
          await backoff.wait({
            log: `[Reboot] Retrying call to \`${method}\` with backoff ...`,
          });
        }
      }
    }
  }

  return [responses(), setRequest];
}

export async function* reactiveReader({
  endpoint,
  request,
  signal,
  websockets = false,
}: {
  endpoint: string;
  request: react_pb.QueryRequest;
  signal: AbortSignal;
  websockets: boolean;
}): AsyncGenerator<react_pb.QueryResponse, void, unknown> {
  const url = new URL(`${endpoint}/rbt.v1alpha1.React/Query`);
  if (url.protocol === "https:" && !websockets) {
    const headers = new Headers();

    if (request.bearerToken !== undefined) {
      headers.set("Authorization", `Bearer ${request.bearerToken}`);
    }

    yield* grpcServerStream({
      endpoint: url.toString(),
      method: "POST",
      headers,
      request,
      responseType: react_pb.QueryResponse,
      signal,
    });
  } else {
    // TODO: while technically we could `await
    // grpcWebsocketServerStream(...)` doing so will leak websockets
    // because it is possible that `signal` will be set to a different
    // reference and not get triggered. We should fix this by making
    // sure that `signal` is immutable.
    const responses = grpcWebsocketServerStream({
      url,
      request,
      // We use an "empty" QueryRequest as a heartbeat on the channel.
      heartbeatRequest: new react_pb.QueryRequest(),
      responseType: react_pb.QueryResponse,
      signal,
    });
    for await (const response of responses) {
      if (response.responseOrStatus.case == "status") {
        responses.return();
        throw Status.fromJsonString(response.responseOrStatus.value);
      }
      yield response;
    }
  }
}

// While it is hard to find specific documentation for concrete
// websocket limits, it looks like ~200 is a safe number to bet on
// (Firefox seems to have this limit, while Chrome is at 255, and
// Safari is unknown).
const WEBSOCKET_LIMIT =
  // TODO: figure out a better way to detect that this is Chrome.
  // @ts-ignore: `window.navigator.vendor` is deprecated.
  // Check that window is defined. We might be on the server if in e.g. Next.js.
  typeof window !== "undefined" && window.navigator.vendor === "Google Inc."
    ? 255
    : 200;

export class WebSockets {
  // Count of all websockets that have been created.
  count: number;

  connectionAbortControllers: { [key: string]: AbortController };

  constructor() {
    this.count = 0;
    this.connectionAbortControllers = {};
  }

  // Helper for setting up a long-lived HTTP/2 connection that
  // websockets can use as defined by RFC 8441
  // (https://datatracker.ietf.org/doc/html/rfc8441) and implemented
  // by all of the top browsers.
  //
  connect(endpoint: string, stateRef: string) {
    // HTTP/2 requires TLS so if we're not connecting with `https:` then we're
    // not using HTTP/2 so there is no need to create this long-lived connection.
    const url = new URL(endpoint);
    if (url.protocol !== "https:") {
      return;
    }

    const abortController = new AbortController();

    this.connectionAbortControllers[endpoint + stateRef] = abortController;

    retryForever(async () => {
      const headers = new Headers();
      headers.set("Content-Type", "application/json");
      headers.append("Connection", "keep-alive");

      // NOTE: we use `fetch()` not `guardedFetch()`
      // because if there are only mutations than a disconnect will
      // cause us to show a warning when using `rbt dev` but we won't
      // ever remove the warning because the fetch to
      // `WebSocketsConnection` waits indefinitely.
      await fetch(
        new Request(
          `${endpoint}/__/reboot/rpc/${stateRef}/rbt.v1alpha1.React/WebSocketsConnection`,
          {
            method: "POST",
            headers,
            body: new react_pb.WebSocketsConnectionRequest().toJsonString(),
          }
        ),
        { signal: abortController.signal }
      ).catch((error: unknown) => {
        // Retry forever unless we were aborted.
        if (!abortController.signal.aborted) {
          throw error;
        }
      });
    });
  }

  disconnect(endpoint: string, stateRef: string) {
    // No need to do anything if we never made a connection in `connect()` because
    // we're not using TLS.
    const url = new URL(endpoint);
    if (url.protocol !== "https:") {
      return;
    }

    this.connectionAbortControllers[endpoint + stateRef].abort();
  }

  create(url: URL) {
    // NOTE: if we're using TLS then all of our websockets should use
    // the existing HTTP/2 connection set up by calling
    // `rbt.v1alpha1.React/WebSocketsConnection` in `connect()`.
    if (url.protocol === "wss:") {
      return new WebSocket(url);
    }

    const websocket = new WebSocket(url);

    this.count += 1;

    websocket.addEventListener("error", () => {
      if (this.count > WEBSOCKET_LIMIT) {
        console.warn(
          `You have over ${WEBSOCKET_LIMIT} websockets, which is more ` +
            "than supported on some browsers. This may be the reason one " +
            "of the websockets we created had an error, and thus some your " +
            "calls (specifically reactive readers or mutations) will never " +
            "make it to your Reboot application (even though we keep retrying). " +
            "You can solve this by using HTTP/2 which allows an unlimited " +
            "number of concurrent streams. Reboot uses HTTP/2 by default " +
            "when you use TLS. You should definitely use TLS when you deploy " +
            "your application in the cloud, but you can also use TLS when " +
            "running `rbt dev`, please see the documentation for how to do so."
        );
      }
    });

    websocket.addEventListener("close", () => {
      this.count -= 1;
    });

    return websocket;
  }
}

export const websockets = new WebSockets();

// Helper async generator that conforms to the gRPC JSON transcoder
// protocol, i.e., yields JSON responses or throws a `Status` if
// the request failed or throws an `Error` if another error occurred.
export async function* grpcServerStream<
  RequestType extends Message<RequestType>,
  ResponseType extends Message<ResponseType>
>({
  endpoint,
  method,
  headers,
  request,
  responseType,
  signal,
}: {
  endpoint: string;
  method: string;
  headers: Headers;
  request: RequestType;
  responseType: MessageType<ResponseType>;
  signal: AbortSignal;
}): AsyncGenerator<ResponseType, void, unknown> {
  // Ensure we're speaking JSON.
  headers.set("Content-Type", "application/json");

  // Keep the connection alive as long as server is sending data.
  headers.append("Connection", "keep-alive");

  const response = await guardedFetch(
    new Request(endpoint, {
      method,
      headers,
      body: request.toJsonString(),
    }),
    { signal }
  );

  if (!response.ok) {
    if (response.headers.get("content-type") === "application/json") {
      throw Status.fromJson(await response.json());
    }

    throw new Error(`Unknown error with HTTP status ${response.status}`);
  }

  if (response.body === null) {
    throw new Error("Unable to read body of response");
  }

  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();

  if (reader === undefined) {
    throw new Error("Not able to instantiate reader on response body");
  }

  let accumulated = "";

  while (true) {
    const { value, done } = await reader.read();

    if (done) {
      break;
    }

    accumulated += value.trim();

    if (accumulated.startsWith(",")) {
      accumulated = accumulated.substring(1);
    }

    if (!accumulated.startsWith("[")) {
      accumulated = "[" + accumulated;
    }

    if (!accumulated.endsWith("]")) {
      accumulated = accumulated + "]";
    }

    try {
      // We may receive more than one response, and we need to yield
      // each one separately.
      for (const json of JSON.parse(accumulated)) {
        yield responseType.fromJson(json);
      }
      accumulated = "";
    } catch (e) {
      // It's possible that we've only received part of the data
      // necessary to parse and more is on the way. In that case, we
      // drop the ']' that we added to the end and loop back up to
      // keep receiving.
      if (e instanceof SyntaxError) {
        accumulated = accumulated.substring(0, accumulated.length - 1);
        continue;
      } else {
        throw e;
      }
    }
  }
}

// Helper async generator that yields responses of type `ResponseType`
// or a `Status` if the request failed.
//
// TODO(benh): support `ResponseOrAborted` rather than `ResponsOrStatus`.
export async function* grpcInfiniteStream<
  RequestType extends Message<RequestType>,
  ResponseType extends Message<ResponseType>
>({
  endpoint,
  method,
  headers,
  request,
  responseType,
  signal,
}: {
  endpoint: string;
  method: string;
  headers: Headers;
  request: RequestType;
  responseType: MessageType<ResponseType>;
  signal: AbortSignal;
}): AsyncGenerator<ResponseOrStatus<ResponseType>, void, unknown> {
  const backoff = new Backoff();

  while (true) {
    try {
      const responses = await grpcServerStream({
        endpoint,
        method,
        headers,
        request,
        responseType,
        signal,
      });

      for await (const response of responses) {
        backoff.reset({ log: `[Reboot] Call to \`${method}\` succeeded` });
        yield { response };
      }

      throw new Error("Not expecting infinite stream to ever be done");
    } catch (e: unknown) {
      if (signal.aborted) {
        // TODO(benh): propagate the exception or just end the stream
        // since we aborted?
        return;
      } else if (e instanceof Status) {
        yield { status: e };
      } else if (e instanceof Error) {
        console.error(e.message);
      } else {
        console.error(`Unknown error: ${JSON.stringify(e)}`);
      }
    }

    await backoff.wait({
      log: `[Reboot] Retrying call to \`${method}\` with backoff ...`,
    });
  }
}

export async function* grpcWebsocketServerStream<
  RequestType extends Message<RequestType>,
  ResponseType extends Message<ResponseType>
>({
  url,
  request,
  heartbeatRequest,
  responseType,
  signal,
}: {
  url: URL;
  request: RequestType;
  heartbeatRequest: RequestType;
  responseType: MessageType<ResponseType>;
  signal: AbortSignal;
}): AsyncGenerator<ResponseType, void, unknown> {
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";

  const websocket = websockets.create(url);

  signal.addEventListener("abort", () => {
    if (websocket.readyState !== WebSocket.CLOSED) {
      websocket.close();
    }
  });

  websocket.binaryType = "arraybuffer";

  websocket.onopen = () => {
    websocket.send(request.toBinary());
  };

  const closed = new Promise<void>((resolve, reject) => {
    function sendHeartbeat() {
      if (websocket.readyState === WebSocket.OPEN) {
        // To detect dead websocket connections, we need to have outbound data in
        // our buffer (see https://github.com/reboot-dev/mono/issues/4237).
        //
        // There is no need for error handling: if this data cannot be sent, then
        // the socket will be closed automatically.
        websocket.send(heartbeatRequest.toBinary());
      }
    }
    // This interval matches the setting for non-browser clients in
    // `reboot/settings.py`.
    const heartbeatId = setInterval(sendHeartbeat, 5000);

    websocket.addEventListener("close", () => {
      // Closing the websocket happens both immediately after errors, and when
      // a request is simply done. We can't assume that the connection is
      // healthy or unhealthy; leave any warnings as they are.
      clearInterval(heartbeatId);
      resolve();
    });

    websocket.addEventListener("error", (event) => {
      // We weren't able to reach the server. Show a helpful error message to
      // developers if this persists.
      maybeScheduleLocalhostWarning({
        url: url.href,
      });
      clearInterval(heartbeatId);
      reject(
        new Error(`Unexpected error on websocket: ${JSON.stringify(event)}`)
      );
    });
  });

  try {
    do {
      // Wait for either `closed` to resolve or reject. If the latter,
      // it'll propagate the exception, if the former, we'll drop out of
      // the loop and return to the caller.
      const event = await Promise.race([
        closed,
        new Promise((resolve) => {
          websocket.addEventListener(
            "message",
            (event) => {
              resolve(event);
            },
            // Only get one message at a time!
            { once: true }
          );
        }),
      ]);

      if (
        event instanceof MessageEvent ||
        // When we use 'WebSocket' class in the backend it is not the
        // same one as the frontend has, so the event type differs as
        // well. When `closed` wins the race `event` is `undefined`.
        (event !== undefined && (event as any).data instanceof ArrayBuffer)
      ) {
        // Receiving a message demonstrates that the websocket is
        // connected; if we had a connection warning displayed we can
        // remove it.
        removeLocalhostWarning();
        yield responseType.fromBinary(new Uint8Array((event as any).data));
      }

      // If not `event instanceof Event` then `closed` must have
      // resolved in which case we'll fall out of this loop and return
      // to the caller.
    } while (websocket.readyState === WebSocket.OPEN);
  } finally {
    // Handle the case where the async generator is is not exhausted
    // and we want to make sure we close the websocket.
    if (websocket.readyState !== WebSocket.CLOSED) {
      websocket.close();
    }
  }
}

// Define a type alias that makes it more clear for each of our maps below
// what the key is: a string representing the host and port, e.g., 'foo.com:80'.
type Host = string;

// A map that has the host as the key and the number of outstanding fetches
// for that host as the value.
const totalOutstandingFetches = new Map<Host, number>();

// A map that has the host as the key and the number of long-running
// outstanding fetches for that host as the value.
const totalLongRunningOutstandingFetches = new Map<Host, number>();

// The time in milliseconds that a fetch should be considered long running.
const fetchTimeout = 3000;

// The threshold for the total number of long-running outstanding fetches that
// the user can have before triggering an alert.
const totalLongRunningOutstandingFetchesThreshold = 4;

// A set of hosts that we have already warned the user about.
// We will wait until the number of long-running outstanding fetches for a host
// returns below the threshold before warning the user again.
const haveConsoleWarned = new Set<Host>();

function trackFetch(url: URL) {
  // We will not track fetches to HTTPS endpoints.
  if (url.protocol === "https:") {
    return { completeFetch: () => {} };
  }

  const status = { isLongRunning: false };
  const host = url.host;
  const timeoutId = setTimeout(() => {
    // If the timeout is reached, we will consider the fetch long running.
    status.isLongRunning = true;

    const fetches = totalLongRunningOutstandingFetches.get(host) || 0;

    // Increment the total number of long-running outstanding fetches to the host.
    totalLongRunningOutstandingFetches.set(host, fetches + 1);

    if (
      fetches + 1 >= totalLongRunningOutstandingFetchesThreshold &&
      !haveConsoleWarned.has(host)
    ) {
      console.warn(
        `Reboot is currently making ${totalOutstandingFetches.get(
          host
        )} outstanding ` +
          `HTTP fetches calling your reader methods, of which it appears as though ` +
          `${totalLongRunningOutstandingFetches.get(
            host
          )} are either long-running or ` +
          `queued because your browser limits the total number of simultaneous connections ` +
          `to the same host (${host}). You can solve this by ensuring you use HTTP/2 which ` +
          `requires TLS. See https://docs.reboot.dev/tools/cli/#bring-your-own-certificate-with-rbt-dev-run ` +
          `for details on how to use TLS with 'rbt dev' (which works similarly for 'rbt serve').`
      );

      haveConsoleWarned.add(host);
    }
  }, fetchTimeout);

  // Increment the total number of outstanding fetches to the host.
  totalOutstandingFetches.set(
    host,
    (totalOutstandingFetches.get(host) || 0) + 1
  );

  return {
    // Called after a fetch is complete to properly update the global maps.
    completeFetch: () => {
      clearTimeout(timeoutId);

      if (status.isLongRunning) {
        const fetches = totalLongRunningOutstandingFetches.get(host) || 0;

        assert(fetches > 0);
        if (fetches === 1) {
          totalLongRunningOutstandingFetches.delete(host);
        } else {
          totalLongRunningOutstandingFetches.set(host, fetches - 1);
        }

        if (fetches - 1 < totalLongRunningOutstandingFetchesThreshold) {
          haveConsoleWarned.delete(host);
        }
      }

      const fetches = totalOutstandingFetches.get(host) || 0;
      assert(fetches > 0);
      if (fetches === 1) {
        totalOutstandingFetches.delete(host);
      } else {
        totalOutstandingFetches.set(host, fetches - 1);
      }
    },
  };
}

const warningIds: { [key: string]: string } = {};
const ignoredWarningIds: Set<string> = new Set();
const pendingWarningIds: { [key: string]: ReturnType<typeof setTimeout> } = {};

function renderWarnings() {
  const html = document.documentElement;

  // Remove previously rendered warnings so that we compute the proper
  // offsets for layout.
  //
  // TODO(benh): put all of these in a containing `div` so we can just
  // remove it instead?
  for (const warningId in warningIds) {
    const warningElement = document.getElementById(warningId);
    if (warningElement !== null) {
      html.removeChild(warningElement);
    }
  }

  let warningsShown = 0;

  for (const warningId in warningIds) {
    if (ignoredWarningIds.has(warningId)) {
      continue;
    }

    const warningElement = document.createElement("div");
    warningElement.setAttribute("id", warningId);

    // Positioning: left-top corner but place each warning to the right of the previous.
    const messageWidth = 300;
    const leftOffset = warningsShown * messageWidth;
    // More positioning: add a little margin, hover above ~everything (z-index).
    // Looks: red border, white background.
    // Content: text, slightly padded.
    warningElement.style.cssText = `position:absolute;top:0px;left:${leftOffset}px;margin:4px;width:500px;z-index:100000;
    border:3px solid red;border-radius:4px;background-color:white;
    padding:4px;font-family:sans-serif`;

    const closeButton = document.createElement("button");
    closeButton.innerHTML = "Don't show this message again";
    closeButton.style.marginTop = "18px";
    closeButton.addEventListener("click", () => {
      ignoredWarningIds.add(warningId);
      renderWarnings();
    });

    warningElement.innerHTML = "⚠ " + warningIds[warningId];
    warningElement.appendChild(closeButton);
    html.appendChild(warningElement);
    warningsShown++;
  }
}

function scheduleWarning({
  messageHtml,
  id,
  delay_secs,
}: {
  messageHtml: string;
  id: string;
  delay_secs: number;
}) {
  if (id in pendingWarningIds) {
    return;
  }

  pendingWarningIds[id] = setTimeout(() => {
    addWarning({ messageHtml, id });
    delete pendingWarningIds[id];
  }, delay_secs * 1000);
}

function addWarning({ messageHtml, id }: { messageHtml: string; id: string }) {
  console.warn(messageHtml);
  warningIds[id] = messageHtml;
  renderWarnings();
}

function removeWarning({ id }: { id: string }) {
  if (id in pendingWarningIds) {
    clearTimeout(pendingWarningIds[id]);
    delete pendingWarningIds[id];
  }
  if (id in warningIds) {
    delete warningIds[id];

    const warningElement = document.getElementById(id);

    if (warningElement !== null) {
      const html = document.documentElement;
      html.removeChild(warningElement);
    }

    renderWarnings();
  }
}

const localhostWarningId = "localhostWarning";

function removeLocalhostWarning() {
  removeWarning({ id: localhostWarningId });
}

function maybeScheduleLocalhostWarning({ url }: { url: string }) {
  if (
    // Only show the warning for localhost (development).
    !(url.includes("localhost") || url.includes("127.0.0.1")) ||
    // Only show the warning if it's not already scheduled or active.
    localhostWarningId in pendingWarningIds ||
    localhostWarningId in warningIds
  ) {
    return;
  }

  const endpoint = url.split("/")[2]; // e.g. "localhost:9991"
  const warningText = `<b>Trouble connecting...</b><br/>
  <br/>
  Looks like we couldn't connect to '${endpoint}'. This may be due to one
  of the following reasons:<br/>
  <li>Your backend application is not running.</li>
  <li>Your backend application is running, but not on 127.0.0.1.</li>
  <li>Your backend application is running, but on a different port.</li>
  <br/>
  (This message will only appear during local development)
  `;
  scheduleWarning({
    messageHtml: warningText,
    id: localhostWarningId,
    // User feedback says that showing the a warning message immediately on
    // connection errors is too aggressive - for example, Chaos Monkey may
    // be restarting the application, and everything is fine. However, if
    // after 10 seconds we still can't talk to the application, then we can
    // assume that something is wrong.
    delay_secs: 10,
  });
}

export async function guardedFetch(request: Request, options?: RequestInit) {
  // If not in development mode, just fetch.
  if (process.env.NODE_ENV !== "development") {
    return fetch(request, options);
  }

  const { completeFetch } = trackFetch(new URL(request.url));

  try {
    const response = await fetch(request, options);

    // If no exception was thrown while doing a fetch, then we must be able to
    // reach the server, so if we previously had displayed a warning stop
    // displaying it now.
    //
    // Likely what has happened is the server we are trying to fetch from
    // restarted.
    removeLocalhostWarning();

    return response;
  } catch (error) {
    if (!options?.signal?.aborted) {
      // The fetch failed due to some network error. Tell the developer, if this
      // situation persists.
      maybeScheduleLocalhostWarning({ url: request.url });
    }
    throw error;
  } finally {
    completeFetch();
  }
}

export class WebContext {
  readonly url: string;
  // Use websockets when connecting over HTTPS instead of gRPC.
  readonly websockets: boolean;
  bearerToken?: () => Promise<string | undefined>;

  constructor(
    args:
      | string
      | {
          url: string;
          websockets?: boolean;
          bearerToken?: (() => Promise<string | undefined>) | string;
        }
  ) {
    if (typeof args === "string") {
      this.url = args;
      this.websockets = false;
      this.bearerToken = undefined;
    } else {
      this.url = args.url;
      this.websockets = args.websockets ?? false;
      this.bearerToken =
        args.bearerToken !== undefined
          ? typeof args.bearerToken === "string"
            ? async () => args.bearerToken as string
            : args.bearerToken
          : undefined;
    }
  }

  setBearerToken(bearerToken?: (() => Promise<string | undefined>) | string) {
    if (typeof bearerToken === "string") {
      // Convert string tokens to async functions for backward
      // compatibility.
      this.bearerToken = async () => bearerToken;
    } else {
      this.bearerToken = bearerToken;
    }
  }
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Helper that makes an expiring idempotency key, which by default
 * expires after 7 days.
 */
export function makeExpiringIdempotencyKey({
  when = Date.now() + SEVEN_DAYS_MS,
}: {
  when?: number;
} = {}) {
  return uuidv7({ msecs: when });
}
