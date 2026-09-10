// The developer's running application, which the models page reads
// for a type's instances and nothing else on the dashboard does.
// Everything here is a live stream: the application pushes a new
// answer whenever what it answered about changes, and a stream that
// drops is reconnected with backoff until the page leaves.
import {
  type JsonValue,
  type Message,
  type MessageType,
  Struct,
} from "@bufbuild/protobuf";
import { Backoff, Status } from "@reboot-dev/reboot-api";
import { grpcServerStream } from "@reboot-dev/reboot-web";
import { useCallback, useEffect, useState } from "react";
import {
  GetStateRequest,
  GetStateResponse,
  GetStateTypesRequest,
  GetStateTypesResponse,
  ListStatesRequest,
  ListStatesResponse,
} from "../../../../rbt/v1alpha1/inspect/inspect_pb";
import { APPLICATION_PATH } from "./constants";

// Where the application serves, `http://localhost:9991`, which the
// dashboard application learned from the `.rbtrc` and serves at
// `APPLICATION_PATH`. `undefined` until it has been read.
export const useApplicationUrl = (): string | undefined => {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    let cancelled = false;
    fetch(APPLICATION_PATH)
      .then((response) => response.json())
      .then(({ url }: { url: string }) => {
        if (!cancelled) {
          setUrl(url);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return url;
};

// The state ref the application routes a request by, in the
// `x-reboot-state-ref` header: the type, a colon, and the id with
// each `/` escaped to `\`, as `_state_id_encode` in
// `reboot/aio/types.py` spells it.
export const stateRefOf = (stateType: string, stateId: string): string =>
  `${stateType}:${stateId.replace(/\//g, "\\")}`;

// What one call to the application yields: an answer, a status the
// application aborted with, or that the application could not be
// reached at all. The last is the one the page has to say something
// about, since it means `rbt dev run` is not running.
export type Event<ResponseType> =
  | { response: ResponseType }
  | { status: Status }
  | { unreachable: true };

// Calls a streaming RPC of the application and yields what it answers,
// reconnecting when the connection drops or cannot be made. A status
// ends the stream: the application answered, and will answer the
// same way again.
//
// Written here rather than with `grpcInfiniteStream`, which retries
// forever and only logs a connection it could not make; the page
// needs to hear about that.
export async function* applicationStream<
  RequestType extends Message<RequestType>,
  ResponseType extends Message<ResponseType>
>({
  url,
  method,
  request,
  responseType,
  stateRef,
  signal,
}: {
  url: string;
  method: string;
  request: RequestType;
  responseType: MessageType<ResponseType>;
  stateRef?: string;
  signal: AbortSignal;
}): AsyncGenerator<Event<ResponseType>, void, unknown> {
  const headers = new Headers();
  headers.set("Content-Type", "application/json");
  // Under `rbt dev run` the application takes any bearer token as the
  // admin's; it only has to be there.
  headers.set("Authorization", "Bearer dev");
  if (stateRef !== undefined) {
    headers.set("x-reboot-state-ref", stateRef);
  }

  const backoff = new Backoff();

  while (!signal.aborted) {
    try {
      const responses = await grpcServerStream({
        endpoint: `${url}/${method}`,
        method: "POST",
        headers,
        request,
        responseType,
        signal,
      });
      for await (const response of responses) {
        backoff.reset();
        yield { response };
      }
      // The application closed a stream it never closes: it is
      // restarting, and is unreachable until it is back.
    } catch (e: unknown) {
      if (signal.aborted) {
        return;
      }
      if (e instanceof Status) {
        yield { status: e };
        return;
      }
    }
    yield { unreachable: true };
    await backoff.wait();
  }
}

// What a page knows of one stream: the answer so far, folded from
// every response by `fold`; whether the application can be reached;
// and the status it aborted with, if it did.
export interface Streamed<T> {
  value: T | undefined;
  unreachable: boolean;
  status: Status | undefined;
  // Drops the backoff and reconnects now.
  retry: () => void;
}

// Holds one stream of the application open for as long as the
// component is mounted, folding each response into the value with
// `fold`, which must be pure: it runs against whatever the previous
// value was when the response arrives. `url` undefined means the
// application's address is not known yet, and nothing is called.
export const useApplicationStream = <
  RequestType extends Message<RequestType>,
  ResponseType extends Message<ResponseType>,
  T
>({
  url,
  method,
  request,
  responseType,
  stateRef,
  fold,
  dependencies,
}: {
  url: string | undefined;
  method: string;
  request: RequestType;
  responseType: MessageType<ResponseType>;
  stateRef?: string;
  fold: (previous: T | undefined, response: ResponseType) => T | undefined;
  // What the request was built from, so a new one starts a new
  // stream.
  dependencies: readonly unknown[];
}): Streamed<T> => {
  const [value, setValue] = useState<T>();
  const [unreachable, setUnreachable] = useState(false);
  const [status, setStatus] = useState<Status>();
  const [attempt, setAttempt] = useState(0);

  const retry = useCallback((): void => setAttempt((n) => n + 1), []);

  useEffect(() => {
    if (url === undefined) {
      return;
    }
    const controller = new AbortController();
    (async () => {
      for await (const event of applicationStream({
        url,
        method,
        request,
        responseType,
        stateRef,
        signal: controller.signal,
      })) {
        if ("response" in event) {
          const { response } = event;
          setValue((previous) => fold(previous, response));
          setUnreachable(false);
          setStatus(undefined);
        } else if ("status" in event) {
          setStatus(event.status);
        } else {
          setUnreachable(true);
        }
      }
    })();
    return () => {
      controller.abort();
      setValue(undefined);
      setUnreachable(false);
      setStatus(undefined);
    };
    // `request` is rebuilt every render; `dependencies` is what it
    // was built from.
  }, [url, method, stateRef, attempt, ...dependencies]);

  return { value, unreachable, status, retry };
};

const INSPECT = "rbt.v1alpha1.inspect.Inspect";

// The state types the application serves, sorted, except the ones
// internal to Reboot, which the application leaves out itself.
export const useStateTypes = (url: string | undefined): Streamed<string[]> =>
  useApplicationStream({
    url,
    method: `${INSPECT}/GetStateTypes`,
    request: new GetStateTypesRequest(),
    responseType: GetStateTypesResponse,
    fold: (_, response) => response.stateTypes.slice().sort(),
    dependencies: [],
  });

// A browser holds at most six connections to one host over plain
// HTTP, and every stream here is one of them for as long as it is
// open. The page keeps its streams well under that.

// The ids of one type's states, sorted, live. Nothing is read while
// no type is chosen.
export const useStateIds = (
  url: string | undefined,
  stateType: string | undefined
): Streamed<string[]> =>
  useApplicationStream({
    url: stateType === undefined ? undefined : url,
    method: `${INSPECT}/ListStates`,
    request: new ListStatesRequest({ stateType: stateType ?? "" }),
    responseType: ListStatesResponse,
    fold: (_, response) =>
      response.stateInfos.map((info) => info.stateId).sort(),
    dependencies: [stateType],
  });

// One state's data as JSON, which the application sends as a
// `Struct` in chunks: the chunks so far, and the JSON once the last
// of them has arrived. A state that does not exist is an empty
// object.
interface Chunked {
  chunks: Uint8Array[];
  json: JsonValue | undefined;
}

export const foldChunk = (
  previous: Chunked | undefined,
  response: GetStateResponse
): Chunked => {
  const chunks = [...(previous?.chunks ?? []), response.data];
  if (response.chunk < response.total - 1) {
    return { chunks, json: previous?.json };
  }
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return { chunks: [], json: Struct.fromBinary(bytes).toJson() };
};

export const useStateData = (
  url: string | undefined,
  stateType: string,
  stateId: string
): Streamed<JsonValue> => {
  const { value, ...rest } = useApplicationStream({
    url,
    method: `${INSPECT}/GetState`,
    // The header names the state; the request carries nothing.
    request: new GetStateRequest(),
    responseType: GetStateResponse,
    stateRef: stateRefOf(stateType, stateId),
    fold: foldChunk,
    dependencies: [stateType, stateId],
  });
  return { value: value?.json, ...rest };
};
