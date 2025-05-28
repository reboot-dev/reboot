import { MessageType } from "@bufbuild/protobuf";
import * as errors_pb from "./errors_pb.js";

export * as protobuf_es from "@bufbuild/protobuf";
export * as auth_pb from "./auth_pb.js";
export * as errors_pb from "./errors_pb.js";
export * as react_pb from "./react_pb.js";
export * as tasks_pb from "./tasks_pb.js";

export const sleep = (seconds: number): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
};

export const randomNumberBetween = (min: number, max: number): number => {
  return Math.random() * (max - min) + min;
};

export interface BackoffOptions {
  initialBackoffSeconds?: number;
  maxBackoffSeconds?: number;
  backoffMultiplier?: number;
}

export async function retryForever<T>(
  f: () => Promise<T>,
  options?: BackoffOptions
): Promise<T> {
  const backoff = new Backoff(options);
  while (true) {
    try {
      return await f();
    } catch (e: any) {
      await backoff.wait();
    }
  }
}

export class Backoff {
  private retryAttempts = 0;

  private initialBackoffSeconds: number;
  private maxBackoffSeconds: number;
  private backoffMultiplier: number;

  constructor(options?: BackoffOptions) {
    const {
      initialBackoffSeconds = 1,
      maxBackoffSeconds = 3,
      backoffMultiplier = 2,
    } = options || {};

    this.initialBackoffSeconds = initialBackoffSeconds;
    this.maxBackoffSeconds = maxBackoffSeconds;
    this.backoffMultiplier = backoffMultiplier;
  }

  async wait() {
    // Implementation of backoff borrowed from
    // https://github.com/grpc/proposal/blob/master/A6-client-retries.md#exponential-backoff.
    const backoffSeconds = randomNumberBetween(
      0,
      Math.min(
        this.initialBackoffSeconds *
          this.backoffMultiplier ** (this.retryAttempts - 1),
        this.maxBackoffSeconds
      )
    );

    await sleep(backoffSeconds);

    this.retryAttempts += 1;
  }
}

export class Event {
  resolve: () => void;
  promise: Promise<void>;

  constructor() {
    let _resolve = () => {};
    this.promise = new Promise((resolve, _) => {
      _resolve = resolve;
    });
    this.resolve = _resolve;
  }

  async wait() {
    return await this.promise;
  }

  set() {
    this.resolve();
  }
}

// Not provided by protobuf-es, so we have a barebones implementation.
export enum StatusCode {
  OK = 0,
  CANCELLED,
  UNKNOWN,
  INVALID_ARGUMENT,
  DEADLINE_EXCEEDED,
  NOT_FOUND,
  ALREADY_EXISTS,
  PERMISSION_DENIED,
  RESOURCE_EXHAUSTED,
  FAILED_PRECONDITION,
  ABORTED,
  OUT_OF_RANGE,
  UNIMPLEMENTED,
  INTERNAL,
  UNAVAILABLE,
  DATA_LOSS,
  UNAUTHENTICATED,
}

// Not provided by protobuf-es, so we have a barebones implementation.
export class Status {
  constructor({
    code,
    message,
    details,
  }: {
    code: number;
    message?: string;
    details?: any[];
  }) {
    this.code = code;
    this.message = message;
    this.details = details ?? [];
  }

  public toJsonString(): string {
    return JSON.stringify(this);
  }

  static fromJsonString(s: string) {
    const json = JSON.parse(s);
    return this.fromJson(json);
  }

  static fromJson(json: any) {
    const code = json["code"];
    if (typeof code != "number") {
      throw new Error(
        `Expected 'code' number in JSON object '${JSON.stringify(json)}'`
      );
    }

    const message = json["message"];
    if (message !== undefined && typeof message != "string") {
      throw new Error(
        `Expected 'message' string in JSON object '${JSON.stringify(json)}'`
      );
    }

    const details = json["details"];
    if (details !== undefined && !Array.isArray(details)) {
      throw new Error(
        `Expected 'details' array in JSON object '${JSON.stringify(json)}'`
      );
    }

    return new Status({ code, message, details });
  }

  readonly code: number;
  readonly message?: string;

  // NOTE: `details` is an `any` not a `google.protobuf.Any` because
  // it contains the JSON representation of `google.protobuf.Any`
  // which are the actual messages in JSON with a special '@type'
  // property. For example, if you had a message:
  //
  //   package google.profile;
  //
  //   message Person {
  //     string first_name = 1;
  //     string last_name = 2;
  //   }
  //
  // Then you'd have the JSON object:
  //
  //   {
  //     "@type": "type.googleapis.com/google.profile.Person",
  //     "firstName": <string>,
  //     "lastName": <string>
  //   }
  readonly details: any[];
}

// Helper types for converting from a generated message type, e.g.,
// `Foo`, to an instance of `Foo`. We could use `InstanceType`
// but then we'd need to constrain `ErrorType` with something like
// `new (...args: any) => any` and instead since we know it needs
// to be a `MessageType` we infer the actual instance type from
// that instead.
export type InstanceTypeForErrorType<ErrorType> = ErrorType extends MessageType<
  infer Error
>
  ? Error
  : never;

export type InstanceTypeForErrorTypes<ErrorTypes extends readonly [...any[]]> =
  ErrorTypes extends readonly [infer Head, ...infer Tail]
    ? [InstanceTypeForErrorType<Head>, ...InstanceTypeForErrorTypes<Tail>]
    : [];

export const GRPC_ERROR_TYPES = [
  errors_pb.Cancelled,
  errors_pb.Unknown,
  errors_pb.InvalidArgument,
  errors_pb.DeadlineExceeded,
  errors_pb.NotFound,
  errors_pb.AlreadyExists,
  errors_pb.PermissionDenied,
  errors_pb.ResourceExhausted,
  errors_pb.FailedPrecondition,
  errors_pb.Aborted,
  errors_pb.OutOfRange,
  errors_pb.Unimplemented,
  errors_pb.Internal,
  errors_pb.Unavailable,
  errors_pb.DataLoss,
  errors_pb.Unauthenticated,
] as const; // Need `as const` to ensure TypeScript infers this as a tuple!

export const REBOOT_ERROR_TYPES = [
  // NOTE: also add any new errors into
  // `rebootdev/templates/reboot_react.ts.j2`.
  errors_pb.StateAlreadyConstructed,
  errors_pb.StateNotConstructed,
  errors_pb.TransactionParticipantFailedToPrepare,
  errors_pb.TransactionParticipantFailedToCommit,
  errors_pb.UnknownService,
  errors_pb.UnknownTask,
] as const; // Need `as const` to ensure TypeScript infers this as a tuple!

export type GrpcError = InstanceTypeForErrorTypes<
  typeof GRPC_ERROR_TYPES
>[number];

export type RebootError = InstanceTypeForErrorTypes<
  typeof REBOOT_ERROR_TYPES
>[number];

export function grpcStatusCodeFromError<ErrorType>(
  error: ErrorType
): StatusCode | undefined {
  if (error instanceof errors_pb.Cancelled) {
    return StatusCode.CANCELLED;
  }

  if (error instanceof errors_pb.Unknown) {
    return StatusCode.UNKNOWN;
  }

  if (error instanceof errors_pb.InvalidArgument) {
    return StatusCode.INVALID_ARGUMENT;
  }

  if (error instanceof errors_pb.DeadlineExceeded) {
    return StatusCode.DEADLINE_EXCEEDED;
  }

  if (error instanceof errors_pb.NotFound) {
    return StatusCode.NOT_FOUND;
  }

  if (error instanceof errors_pb.AlreadyExists) {
    return StatusCode.ALREADY_EXISTS;
  }

  if (error instanceof errors_pb.PermissionDenied) {
    return StatusCode.PERMISSION_DENIED;
  }

  if (error instanceof errors_pb.ResourceExhausted) {
    return StatusCode.RESOURCE_EXHAUSTED;
  }

  if (error instanceof errors_pb.FailedPrecondition) {
    return StatusCode.FAILED_PRECONDITION;
  }

  if (error instanceof errors_pb.Aborted) {
    return StatusCode.ABORTED;
  }

  if (error instanceof errors_pb.OutOfRange) {
    return StatusCode.OUT_OF_RANGE;
  }

  if (error instanceof errors_pb.Unimplemented) {
    return StatusCode.UNIMPLEMENTED;
  }

  if (error instanceof errors_pb.Internal) {
    return StatusCode.INTERNAL;
  }

  if (error instanceof errors_pb.Unavailable) {
    return StatusCode.UNAVAILABLE;
  }

  if (error instanceof errors_pb.DataLoss) {
    return StatusCode.DATA_LOSS;
  }

  if (error instanceof errors_pb.Unauthenticated) {
    return StatusCode.UNAUTHENTICATED;
  }

  return undefined;
}

// Helper that tries to construct an error type from the `details` of
// a `Status` from an array of possible `errorTypes`.
//
// Returns the union of the types in the `ErrorsTypes` tuple. We get
// the union type by getting the type of indexing into the union at
// any arbitrary `number`, which must be all possible types in the
// tuple, thus the union.
export function errorFromGoogleRpcStatusDetails<
  ErrorTypes extends readonly [...MessageType<any>[]]
>(
  status: Status,
  errorTypes: ErrorTypes
): InstanceTypeForErrorTypes<ErrorTypes>[number] | undefined {
  for (const detail of status.details) {
    const typeUrl = detail["@type"];

    if (typeof typeUrl !== "string" || typeUrl === "") {
      console.error(
        `Cannot decode google.protobuf.Any from JSON: '@type' is empty`
      );
      return undefined;
    }

    if (!typeUrl.length) {
      console.error(`Invalid google.protobuf.Any '@type': ${typeUrl}`);
      return undefined;
    }

    const slash = typeUrl.lastIndexOf("/");
    const typeName = slash >= 0 ? typeUrl.substring(slash + 1) : typeUrl;

    if (!typeName.length) {
      console.error(`Invalid google.protobuf.Any '@type': ${typeUrl}`);
      return undefined;
    }

    for (const errorType of errorTypes) {
      if (typeName === errorType.typeName) {
        const copy = Object.assign({}, detail);
        delete copy["@type"];
        return errorType.fromJson(copy);
      }
    }
  }

  return undefined;
}

export function errorFromGoogleRpcStatusCode(status: Status): GrpcError {
  if (status.code == StatusCode.CANCELLED) {
    return new errors_pb.Cancelled();
  }

  if (status.code == StatusCode.UNKNOWN) {
    return new errors_pb.Unknown();
  }

  if (status.code == StatusCode.INVALID_ARGUMENT) {
    return new errors_pb.InvalidArgument();
  }

  if (status.code == StatusCode.DEADLINE_EXCEEDED) {
    return new errors_pb.DeadlineExceeded();
  }

  if (status.code == StatusCode.NOT_FOUND) {
    return new errors_pb.NotFound();
  }

  if (status.code == StatusCode.ALREADY_EXISTS) {
    return new errors_pb.AlreadyExists();
  }

  if (status.code == StatusCode.PERMISSION_DENIED) {
    return new errors_pb.PermissionDenied();
  }

  if (status.code == StatusCode.RESOURCE_EXHAUSTED) {
    return new errors_pb.ResourceExhausted();
  }

  if (status.code == StatusCode.FAILED_PRECONDITION) {
    return new errors_pb.FailedPrecondition();
  }

  if (status.code == StatusCode.ABORTED) {
    return new errors_pb.Aborted();
  }

  if (status.code == StatusCode.OUT_OF_RANGE) {
    return new errors_pb.OutOfRange();
  }

  if (status.code == StatusCode.UNIMPLEMENTED) {
    return new errors_pb.Unimplemented();
  }

  if (status.code == StatusCode.INTERNAL) {
    return new errors_pb.Internal();
  }

  if (status.code == StatusCode.UNAVAILABLE) {
    return new errors_pb.Unavailable();
  }

  if (status.code == StatusCode.DATA_LOSS) {
    return new errors_pb.DataLoss();
  }

  if (status.code == StatusCode.UNAUTHENTICATED) {
    return new errors_pb.Unauthenticated();
  }

  return new errors_pb.Unknown();
}

export abstract class Aborted extends Error {
  abstract toStatus(): Status;
}

export type IdempotencyOptions =
  | { alias?: string; key?: undefined; eachIteration?: boolean }
  | { alias?: undefined; key: string; eachIteration?: undefined };

export type ScheduleOptions = { when: Date };

export type CallOptions = {
  idempotency?: IdempotencyOptions;
  schedule?: ScheduleOptions;
  bearerToken?: string;
};

type StateId = string;
type StateRef = string;
type StateTypeName = string;

// Corresponds to encodings in `rebootdev.aio.types`.
export function stateIdToRef(stateType: StateTypeName, id: StateId): StateRef {
  // This is the earliest time we can validate the state ID given to us by the
  // user; do it now, so that any stack trace is as short as possible.
  validateASCII(id, "state ID", 1, 128);

  const escapedKey = id.replace(/\//g, "\\");

  // Need to encode backslashes, because the TypeScript built-in 'URL'
  // class will escape back any backslashes to forward slashes.
  // We can't escape a forward slash with '%2F' currently, because we
  // use forward slashes in the collocations.
  // See more at public/rebootdev/aio/types.py.
  const encoded = escapedKey.replace(/\\/g, "%5C");
  return `${stateType}:${encoded}`;
}

// Helper function to validate an ASCII string.
function validateASCII(
  s: string,
  fieldDescription: string,
  lengthMin: number = 0,
  lengthMax?: number
) {
  if (s.length < lengthMin) {
    throw new Error(
      `${fieldDescription} must have a length of at least ${lengthMin}; given value had length '${s.length}'`
    );
  }

  if (lengthMax !== undefined && s.length > lengthMax) {
    throw new Error(
      `${fieldDescription} must have a length of at most ${lengthMax}; given value had length '${s.length}'`
    );
  }

  // NOTE: not using a regular expression because it gives a
  // "Unexpected control character(s) in regular expression"
  // error that we don't want to print out to our users.
  for (let i = 0; i < s.length; i++) {
    if (s.charCodeAt(i) > 127) {
      throw new Error(
        `${fieldDescription} must be ASCII; given value '${s}' is not ASCII`
      );
    }
  }
}
