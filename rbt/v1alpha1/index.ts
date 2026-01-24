import * as protobuf_es from "@bufbuild/protobuf";
import { z } from "zod/v4";
import * as errors_pb from "./errors_pb.js";

export * as protobuf_es from "@bufbuild/protobuf";
export * as auth_pb from "./auth_pb.js";
export * as errors_pb from "./errors_pb.js";
export * as nodejs_pb from "./nodejs_pb.js";
export * as react_pb from "./react_pb.js";
export * as tasks_pb from "./tasks_pb.js";

let protobufVersionChecked = false;

function ensureProtobufVersionChecked() {
  if (protobufVersionChecked) {
    return;
  }
  // Check if this looks like v2 by looking for v2-specific APIs.
  // In v2, there's typically a 'create' function on message types
  // and different schema/reflection APIs.
  const hasProto3 = "proto3" in protobuf_es;
  const hasCodegenInfo = "codegenInfo" in protobuf_es;

  if (!hasProto3 || !hasCodegenInfo) {
    throw new Error(
      `It looks like you might have '@bufbuild/protobuf' V2 installed. ` +
        `Reboot requires '@bufbuild/protobuf' V1. ` +
        `Please downgrade to a V1 version (e.g., 1.10.1).`
    );
  }
  protobufVersionChecked = true;
}

ensureProtobufVersionChecked();

export function check_bufbuild_protobuf_library(protobuf_es_message: any) {
  if (protobuf_es_message !== protobuf_es.Message) {
    throw new Error(
      `It looks like you have multiple versions of '@bufbuild/protobuf' ` +
        `installed. Reboot requires '@bufbuild/protobuf' V1. Please ` +
        `ensure that there is only one version in your node_modules.`
    );
  }
}

export const requestSchema = z.union([
  z.instanceof(z.ZodObject),
  z.record(z.string(), z.instanceof(z.ZodType)),
]);

export type Request = z.infer<typeof requestSchema>;

export const responseSchema = z.union([
  z.instanceof(z.ZodObject),
  z.record(z.string(), z.instanceof(z.ZodType)),
  z.instanceof(z.ZodVoid),
]);

export type Response = z.infer<typeof responseSchema>;

export const errorsSchema = z.union([
  z.tuple([z.instanceof(z.ZodObject)], z.instanceof(z.ZodObject)),
  z.instanceof(z.ZodDiscriminatedUnion),
]);

export type Errors = z.infer<typeof errorsSchema>;

export const constructibleMethodSchema = z.object({
  kind: z.literal(["writer", "transaction"]),
  factory: z.object({}).optional(),
  request: requestSchema,
  response: responseSchema,
  errors: errorsSchema.optional(),
});

export const notConstructibleMethodSchema = z.object({
  kind: z.literal(["reader", "workflow"]),
  request: requestSchema,
  response: responseSchema,
  errors: errorsSchema.optional(),
});

export const methodsSchema = z.record(
  z.string(),
  z.discriminatedUnion("kind", [
    constructibleMethodSchema,
    notConstructibleMethodSchema,
  ])
);

export type Reader<
  RequestType extends Request,
  ResponseType extends Response,
  ErrorsType extends Errors | undefined
> = {
  kind: "reader";
  request: RequestType;
  response: ResponseType;
  errors?: ErrorsType;
};

export type Writer<
  RequestType extends Request,
  ResponseType extends Response,
  ErrorsType extends Errors | undefined
> = {
  kind: "writer";
  request: RequestType;
  response: ResponseType;
  errors?: ErrorsType;
  factory?: {};
};

export type Transaction<
  RequestType extends Request,
  ResponseType extends Response,
  ErrorsType extends Errors | undefined
> = {
  kind: "transaction";
  request: RequestType;
  response: ResponseType;
  errors?: ErrorsType;
  factory?: {};
};

export type Workflow<
  RequestType extends Request,
  ResponseType extends Response,
  ErrorsType extends Errors | undefined
> = {
  kind: "workflow";
  request: RequestType;
  response: ResponseType;
  errors?: ErrorsType;
};

export function reader<
  RequestType extends Request,
  ResponseType extends Response,
  ErrorsType extends Errors | undefined
>({
  request,
  response,
  errors,
}: {
  request: RequestType;
  response: ResponseType;
  errors?: ErrorsType;
}): Reader<RequestType, ResponseType, ErrorsType> {
  return {
    kind: "reader" as const,
    request,
    response,
    errors,
  };
}

export function writer<
  RequestType extends Request,
  ResponseType extends Response,
  ErrorsType extends Errors | undefined
>({
  request,
  response,
  errors,
  factory,
}: {
  request: RequestType;
  response: ResponseType;
  errors?: ErrorsType;
  factory?: {};
}): Writer<RequestType, ResponseType, ErrorsType> {
  return {
    kind: "writer" as const,
    request,
    response,
    errors,
    factory,
  };
}

export function transaction<
  RequestType extends Request,
  ResponseType extends Response,
  ErrorsType extends Errors | undefined
>({
  request,
  response,
  errors,
  factory,
}: {
  request: RequestType;
  response: ResponseType;
  errors?: ErrorsType;
  factory?: {};
}): Transaction<RequestType, ResponseType, ErrorsType> {
  return {
    kind: "transaction" as const,
    request,
    response,
    errors,
    factory,
  };
}

export function workflow<
  RequestType extends Request,
  ResponseType extends Response,
  ErrorsType extends Errors | undefined
>({
  request,
  response,
  errors,
}: {
  request: RequestType;
  response: ResponseType;
  errors?: ErrorsType;
}): Workflow<RequestType, ResponseType, ErrorsType> {
  return {
    kind: "workflow" as const,
    request,
    response,
    errors,
  };
}

export const stateSchema = z.union([
  z.instanceof(z.ZodObject),
  z.record(z.string(), z.instanceof(z.ZodType)),
]);

export const typeSchema = z.object({
  state: stateSchema,
  methods: methodsSchema,
});

// We are using this helper function to raise an exception if the assertion
// fails because console.assert does not do this and we can't use
// `assert` from Node.js because it is not available in the browser.
export function assert(
  condition: boolean,
  message: string = "Assertion failed"
): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

export function typeIs<T>(t: any, predicate: (t: any) => t is T): t is T {
  return predicate(t);
}

export const sleep = ({ ms }: { ms: number }): Promise<void> => {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

  private hasLoggedWait = false;
  // It is safe to initialize to 0 because the first log will always happen
  // and then we will set the proper timestamp.
  private lastWaitLogMs: number = 0;

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

  async wait({
    log,
    logIntervalMs = 60 /* seconds */ * 1000,
  }: {
    log?: string;
    logIntervalMs?: number;
  } = {}) {
    if (log !== undefined) {
      const now = Date.now();
      if (!this.hasLoggedWait) {
        this.hasLoggedWait = true;
        this.lastWaitLogMs = now;

        console.warn(log);
      } else if (now - this.lastWaitLogMs >= logIntervalMs) {
        this.lastWaitLogMs = now;

        console.warn(log);
      }
    }

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

    await sleep({ ms: backoffSeconds * 1000 });

    this.retryAttempts += 1;
  }

  // There is no need to have an interval between `reset` logs
  // because `reset` should be called when there are no more retries
  // happening and it shouldn't be spammy.
  reset({ log }: { log?: string } = {}) {
    if (log !== undefined && this.hasLoggedWait) {
      console.info(log);
    }

    this.retryAttempts = 0;
    this.hasLoggedWait = false;
    this.lastWaitLogMs = 0;
  }
}

export class Event {
  resolved: boolean;
  resolve: () => void;
  promise: Promise<void>;

  constructor() {
    let _resolve = () => {};
    this.promise = new Promise((resolve, _) => {
      _resolve = resolve;
    });
    this.resolve = _resolve;
    this.resolved = false;
  }

  async wait() {
    return await this.promise;
  }

  set() {
    if (!this.resolved) {
      this.resolved = true;
      this.resolve();
    }
  }

  isSet() {
    return this.resolved;
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

export type EnsureZodObject<T> = T extends z.ZodObject<any>
  ? T
  : T extends z.ZodVoid
  ? T // ZodVoid is a special case, since it doesn't extend ZodObject.
  : T extends Record<string, z.ZodType>
  ? z.ZodObject<T>
  : never;

export const ZOD_ERRORS = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("StateAlreadyConstructed"),
  }),
  z.object({
    type: z.literal("StateNotConstructed"),
    requiresConstructor: z.boolean().optional().meta({ tag: 1 }),
  }),
  z.object({
    type: z.literal("UnknownService"),
  }),
  z.object({
    type: z.literal("InvalidMethod"),
  }),
  z.object({
    type: z.literal("UnknownTask"),
  }),
  z.object({
    type: z.literal("TransactionParticipantFailedToPrepare"),
  }),
  z.object({
    type: z.literal("TransactionParticipantFailedToCommit"),
  }),
  z.object({
    type: z.literal("Cancelled"),
  }),
  z.object({
    type: z.literal("Unknown"),
  }),
  z.object({
    type: z.literal("InvalidArgument"),
  }),
  z.object({
    type: z.literal("DeadlineExceeded"),
  }),
  z.object({
    type: z.literal("NotFound"),
  }),
  z.object({
    type: z.literal("AlreadyExists"),
  }),
  z.object({
    type: z.literal("PermissionDenied"),
  }),
  z.object({
    type: z.literal("ResourceExhausted"),
  }),
  z.object({
    type: z.literal("FailedPrecondition"),
  }),
  z.object({
    type: z.literal("Aborted"),
  }),
  z.object({
    type: z.literal("OutOfRange"),
  }),
  z.object({
    type: z.literal("Unimplemented"),
  }),
  z.object({
    type: z.literal("Internal"),
  }),
  z.object({
    type: z.literal("Unavailable"),
  }),
  z.object({
    type: z.literal("DataLoss"),
  }),
  z.object({
    type: z.literal("Unauthenticated"),
  }),
]);

export const ZOD_ERROR_NAMES = ZOD_ERRORS.options.map(
  (error) => error.shape.type.value
);

// Helper types for converting from a generated message type, e.g.,
// `Foo`, to an instance of `Foo`. We could use `InstanceType`
// but then we'd need to constrain `ErrorType` with something like
// `new (...args: any) => any` and instead since we know it needs
// to be a `protobuf_es.MessageType` we infer the actual instance type from
// that instead.
export type InstanceTypeForErrorType<ErrorType> =
  ErrorType extends protobuf_es.MessageType<infer Error> ? Error : never;

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
  ErrorTypes extends readonly [...protobuf_es.MessageType<any>[]]
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

export function errorFromZodError(
  error: z.infer<typeof ZOD_ERRORS>
): GrpcError | RebootError {
  switch (error.type) {
    case "Cancelled":
      return new errors_pb.Cancelled();
    case "Unknown":
      return new errors_pb.Unknown();
    case "InvalidArgument":
      return new errors_pb.InvalidArgument();
    case "DeadlineExceeded":
      return new errors_pb.DeadlineExceeded();
    case "NotFound":
      return new errors_pb.NotFound();
    case "AlreadyExists":
      return new errors_pb.AlreadyExists();
    case "PermissionDenied":
      return new errors_pb.PermissionDenied();
    case "ResourceExhausted":
      return new errors_pb.ResourceExhausted();
    case "FailedPrecondition":
      return new errors_pb.FailedPrecondition();
    case "Aborted":
      return new errors_pb.Aborted();
    case "OutOfRange":
      return new errors_pb.OutOfRange();
    case "Unimplemented":
      return new errors_pb.Unimplemented();
    case "Internal":
      return new errors_pb.Internal();
    case "Unavailable":
      return new errors_pb.Unavailable();
    case "DataLoss":
      return new errors_pb.DataLoss();
    case "Unauthenticated":
      return new errors_pb.Unauthenticated();
    case "StateAlreadyConstructed":
      return new errors_pb.StateAlreadyConstructed();
    case "StateNotConstructed":
      return new errors_pb.StateNotConstructed({
        requiresConstructor: error.requiresConstructor,
      });
    case "UnknownService":
      return new errors_pb.UnknownService();
    case "InvalidMethod":
      return new errors_pb.InvalidMethod();
    case "UnknownTask":
      return new errors_pb.UnknownTask();
    case "TransactionParticipantFailedToPrepare":
      return new errors_pb.TransactionParticipantFailedToPrepare();
    case "TransactionParticipantFailedToCommit":
      return new errors_pb.TransactionParticipantFailedToCommit();
  }
}

export function zodErrorFromError(
  error: protobuf_es.Message
): z.infer<typeof ZOD_ERRORS> {
  if (error instanceof errors_pb.Cancelled) {
    return { type: "Cancelled" };
  } else if (error instanceof errors_pb.Unknown) {
    return { type: "Unknown" };
  } else if (error instanceof errors_pb.InvalidArgument) {
    return { type: "InvalidArgument" };
  } else if (error instanceof errors_pb.DeadlineExceeded) {
    return { type: "DeadlineExceeded" };
  } else if (error instanceof errors_pb.NotFound) {
    return { type: "NotFound" };
  } else if (error instanceof errors_pb.AlreadyExists) {
    return { type: "AlreadyExists" };
  } else if (error instanceof errors_pb.PermissionDenied) {
    return { type: "PermissionDenied" };
  } else if (error instanceof errors_pb.ResourceExhausted) {
    return { type: "ResourceExhausted" };
  } else if (error instanceof errors_pb.FailedPrecondition) {
    return { type: "FailedPrecondition" };
  } else if (error instanceof errors_pb.Aborted) {
    return { type: "Aborted" };
  } else if (error instanceof errors_pb.OutOfRange) {
    return { type: "OutOfRange" };
  } else if (error instanceof errors_pb.Unimplemented) {
    return { type: "Unimplemented" };
  } else if (error instanceof errors_pb.Internal) {
    return { type: "Internal" };
  } else if (error instanceof errors_pb.Unavailable) {
    return { type: "Unavailable" };
  } else if (error instanceof errors_pb.DataLoss) {
    return { type: "DataLoss" };
  } else if (error instanceof errors_pb.Unauthenticated) {
    return { type: "Unauthenticated" };
  } else if (error instanceof errors_pb.StateAlreadyConstructed) {
    return { type: "StateAlreadyConstructed" };
  } else if (error instanceof errors_pb.StateNotConstructed) {
    return {
      type: "StateNotConstructed",
      requiresConstructor: error.requiresConstructor,
    };
  } else if (error instanceof errors_pb.UnknownService) {
    return { type: "UnknownService" };
  } else if (error instanceof errors_pb.InvalidMethod) {
    return { type: "InvalidMethod" };
  } else if (error instanceof errors_pb.UnknownTask) {
    return { type: "UnknownTask" };
  } else if (error instanceof errors_pb.TransactionParticipantFailedToPrepare) {
    return { type: "TransactionParticipantFailedToPrepare" };
  } else if (error instanceof errors_pb.TransactionParticipantFailedToCommit) {
    return { type: "TransactionParticipantFailedToCommit" };
  }
  throw new Error(`Unknown error type '${error.getType().typeName}'`);
}

export abstract class Aborted extends Error {
  abstract toStatus(): Status;
}

export type IdempotencyOptions =
  | {
      alias?: string;
      key?: undefined;
      eachIteration?: boolean;
      generated?: boolean;
    }
  | {
      alias?: undefined;
      key: string;
      eachIteration?: undefined;
      generated?: boolean;
    };

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

export const toSnakeCase = (s: string): string => {
  return s
    .replace(/([A-Z])/g, "_$1")
    .toLowerCase()
    .replace(/^_/, "");
};

export const toPascalCase = (s: string): string => {
  return (s.includes("_") ? s : toSnakeCase(s))
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join("");
};

export const toCamelCase = (s: string): string => {
  const pascal = toPascalCase(s);
  return pascal.charAt(0).toLowerCase() + pascal.slice(1);
};

export function validate<T>(
  what: string,
  schema: z.ZodObject | z.ZodVoid | Record<string, z.ZodType>,
  input: T
) {
  if (!(schema instanceof z.ZodType)) {
    return validate(what, z.strictObject(schema), input);
  }

  const { success, error, data } = schema.safeParse(input);

  if (!success) {
    console.warn(`\nFailed to validate '${what}':\n${z.prettifyError(error)}`);
    throw new Error(`Failed to validate '${what}'`);
  }

  return data;
}

export function zodToProtoJson<T>(
  schema: z.ZodType | Record<string, z.ZodType>,
  input: T
): any {
  assert(
    schema instanceof z.ZodVoid || input !== undefined,
    "zodToProtoJson: `input` must be defined unless `schema` is ZodVoid"
  );

  if (!(schema instanceof z.ZodType)) {
    return zodToProtoJson(z.strictObject(schema), input);
  } else if (schema instanceof z.ZodPipe) {
    const meta = schema.meta();
    assert(
      meta !== undefined && meta !== null,
      "zodToProtoJson: ZodPipe `schema` must have `meta`"
    );
    const schemaWithMeta = (schema.in as z.ZodType).meta(meta);
    return zodToProtoJson(schemaWithMeta, input);
  } else if (schema instanceof z.ZodOptional) {
    const meta = schema.meta();
    assert(
      meta !== undefined && meta !== null,
      "zodToProtoJson: ZodOptional `schema` must have `meta`"
    );
    const schemaWithMeta = (schema._zod.def.innerType as z.ZodType).meta(meta);
    return zodToProtoJson(schemaWithMeta, input);
  } else if (schema instanceof z.ZodDefault) {
    const meta = schema.meta();
    assert(
      meta !== undefined && meta !== null,
      "zodToProtoJson: ZodDefault `schema` must have `meta`"
    );
    const schemaWithMeta = (schema._zod.def.innerType as z.ZodType).meta(meta);
    return zodToProtoJson(schemaWithMeta, input);
  } else if (schema._zod.def.type === "string") {
    return input;
  } else if (schema instanceof z.ZodNumber) {
    return input;
  } else if (schema instanceof z.ZodBigInt) {
    return input;
  } else if (schema instanceof z.ZodBoolean) {
    return input;
  } else if (schema instanceof z.ZodLiteral) {
    assert(
      typeof input === "string",
      "zodToProtoJson: ZodLiteral `input` must be a string"
    );
    // Since we need to prepend the field name to the actual `enum`
    // value name in Protobuf schema, we need to return the index
    // of the value here instead of the value itself.
    return schema._zod.def.values.indexOf(input);
  } else if (schema instanceof z.ZodRecord) {
    assert(
      typeof input === "object",
      "zodToProtoJson: ZodRecord `input` must be an object"
    );
    // Need to _add_ the extra level of indirection we use to encode a
    // record.
    const output: { record: Record<string, any> } = { record: {} };
    for (const property in input) {
      // Drop all `undefined` properties as they are technically not
      // valid JSON and can't be encoded/decoded via protobuf.
      if (input[property] === undefined) {
        continue;
      }
      output.record[property] = zodToProtoJson(
        schema.valueType as z.ZodType,
        input[property]
      );
    }
    return output;
  } else if (schema instanceof z.ZodArray) {
    assert(
      Array.isArray(input),
      "zodToProtoJson: ZodArray `input` must be an array"
    );
    return {
      items: input.map((item) =>
        zodToProtoJson(schema.element as z.ZodType, item)
      ),
    };
  } else if (schema instanceof z.ZodObject) {
    assert(
      typeof input === "object" && input !== null,
      "zodToProtoJson: ZodObject `input` must be a non-null object"
    );
    const shape = schema.shape;
    const output: Record<string, any> = {};
    for (const property in input) {
      assert(
        property in schema.shape,
        `zodToProtoJson: \`property\` '${property}' not found in ZodObject \`shape\``
      );
      // Drop all `undefined` properties as they are technically not
      // valid JSON and can't be encoded/decoded via protobuf.
      if (input[property] === undefined) {
        continue;
      }
      output[property] = zodToProtoJson(shape[property], input[property]);
    }
    return output;
  } else if (schema instanceof z.ZodDiscriminatedUnion) {
    const discriminator = schema._zod.def.discriminator;
    assert(
      typeof discriminator === "string",
      "zodToProtoJson: ZodDiscriminatedUnion `discriminator` must be a string"
    );
    assert(
      typeIs(input, (input): input is T & { [key: string]: any } => {
        return typeof input === "object" && discriminator in input;
      }),
      "zodToProtoJson: ZodDiscriminatedUnion `input` must be an object with `discriminator` property"
    );

    for (const option of schema.options as z.ZodObject[]) {
      assert(
        discriminator in option.shape,
        "zodToProtoJson: `discriminator` must be present in ZodDiscriminatedUnion option `shape`"
      );
      if (
        option.shape[discriminator]._zod.def.values[0] === input[discriminator]
      ) {
        const output: Record<string, any> = {};
        const value = zodToProtoJson(option, input);
        delete value[discriminator];

        output[toCamelCase(input[discriminator])] = value;

        return output;
      }
    }
    throw new Error(`Invalid discriminated union`);
  } else if (schema instanceof z.ZodVoid) {
    assert(
      input === undefined,
      "zodToProtoJson: ZodVoid `input` must be undefined"
    );
    // Need this to be `google.protobuf.Empty`.
    return {};
  } else if (schema instanceof z.ZodCustom) {
    // Currently we expect a custom schema to only be to alias a
    // protobuf type that is otherwise well defined and does not
    // require any conversion.
    const meta = schema.meta();
    assert(
      meta !== undefined && meta !== null && "protobuf" in meta,
      "zodToProtoJson: ZodCustom `schema` must have `meta` with 'protobuf' property"
    );
    return input;
  } else if (
    schema instanceof z.ZodLazy &&
    schema._zod.def.getter?.toString() ===
      (z.json() as z.ZodType as z.ZodLazy)._zod.def.getter.toString()
  ) {
    // NOTE: we are using `JSON.stringify()` here because we (a) want
    // to ensure that this is in fact a valid JSON object but also
    // because (b) @bufbuild/protobuf can not handle any object that
    // has properties with `undefined` as a value.
    return JSON.parse(JSON.stringify(input));
  } else {
    throw new Error(`Unexpected schema type '${schema._zod.def.type}'`);
  }
}

export function protoToZod<T>(
  schema: z.ZodType | Record<string, z.ZodType>,
  input: T
): any {
  assert(input !== undefined, "protoToZod: `input` must be defined");

  if (!(schema instanceof z.ZodType)) {
    return protoToZod(z.strictObject(schema), input);
  } else if (schema instanceof z.ZodPipe) {
    const meta = schema.meta();
    assert(
      meta !== undefined && meta !== null,
      "protoToZod: ZodPipe `schema` must have `meta`"
    );
    const schemaWithMeta = (schema.in as z.ZodType).meta(meta);
    return protoToZod(schemaWithMeta, input);
  } else if (schema instanceof z.ZodOptional) {
    const meta = schema.meta();
    assert(
      meta !== undefined && meta !== null,
      "protoToZod: ZodOptional `schema` must have `meta`"
    );
    const schemaWithMeta = (schema._zod.def.innerType as z.ZodType).meta(meta);
    return protoToZod(schemaWithMeta, input);
  } else if (schema instanceof z.ZodDefault) {
    const meta = schema.meta();
    assert(
      meta !== undefined && meta !== null,
      "protoToZod: ZodDefault `schema` must have `meta`"
    );
    const schemaWithMeta = (schema._zod.def.innerType as z.ZodType).meta(meta);
    return protoToZod(schemaWithMeta, input);
  } else if (schema._zod.def.type === "string") {
    return input;
  } else if (schema instanceof z.ZodNumber) {
    return input;
  } else if (schema instanceof z.ZodBigInt) {
    return input;
  } else if (schema instanceof z.ZodBoolean) {
    return input;
  } else if (schema instanceof z.ZodLiteral) {
    assert(
      typeof input === "number",
      "protoToZod: ZodLiteral `input` must be a number (enum index)"
    );
    // We're relying on the fact that `schema._zod.def.values` is ordered
    // based on what was originally passed in.
    return schema._zod.def.values[input];
  } else if (schema instanceof z.ZodRecord) {
    assert(
      input instanceof protobuf_es.Message,
      "protoToZod: ZodRecord `input` must be a protobuf Message"
    );
    // Need to _remove_ the extra level of indirection we use to
    // encode a record.
    assert(
      input !== null && input !== undefined && "record" in input,
      "protoToZod: ZodRecord `input` must have a `record` property"
    );
    const record = (input as { record: Record<string, any> }).record;
    const output: Record<string, any> = {};
    for (const property in record as any) {
      // Drop all `undefined` properties as they are technically not
      // valid JSON and can't be encoded/decoded via protobuf.
      if (record[property] === undefined) {
        continue;
      }
      output[property] = protoToZod(
        schema.valueType as z.ZodType,
        record[property]
      );
    }
    return output;
  } else if (schema instanceof z.ZodArray) {
    assert(
      typeIs(input, (input): input is T & { items: any[] } => {
        return (
          input instanceof protobuf_es.Message &&
          "items" in input &&
          Array.isArray(input.items)
        );
      }),
      "protoToZod: ZodArray `input` must be a protobuf Message with `items` array"
    );

    return input.items.map((item: any) =>
      protoToZod(schema.element as z.ZodType, item)
    );
  } else if (schema instanceof z.ZodObject) {
    assert(
      typeIs(input, (input): input is T & { [key: string]: any } => {
        return input instanceof protobuf_es.Message && input !== null;
      }),
      "protoToZod: ZodObject `input` must be a protobuf Message"
    );

    const shape = schema.shape;
    const output: Record<string, any> = {};
    for (const property in input) {
      assert(
        property in shape,
        `protoToZod: \`property\` '${property}' not found in ZodObject \`shape\``
      );
      // Drop all `undefined` properties as they are technically not
      // valid JSON and can't be encoded/decoded via protobuf.
      if (input[property] === undefined) {
        continue;
      }
      output[property] = protoToZod(shape[property], input[property]);
    }
    return output;
  } else if (schema instanceof z.ZodDiscriminatedUnion) {
    const discriminator = schema._zod.def.discriminator;
    assert(
      typeof discriminator === "string",
      "protoToZod: ZodDiscriminatedUnion `discriminator` must be a string"
    );

    assert(
      typeIs(input, (input): input is T & { [key: string]: any } => {
        return (
          input instanceof protobuf_es.Message &&
          input !== null &&
          discriminator in input
        );
      }),
      "protoToZod: ZodDiscriminatedUnion `input` must be a protobuf Message with `discriminator` property"
    );

    for (const option of schema.options as z.ZodObject[]) {
      assert(
        discriminator in option.shape,
        "protoToZod: `discriminator` must be present in ZodDiscriminatedUnion option `shape`"
      );
      if (
        toCamelCase(option.shape[discriminator]._zod.def.values[0]) ===
        input[discriminator].case
      ) {
        const output = protoToZod(option, input[discriminator].value);
        output[discriminator] = option.shape[discriminator]._zod.def.values[0];
        return output;
      }
    }
    throw new Error(`Invalid discriminated union`);
  } else if (schema instanceof z.ZodVoid) {
    // This is only supported for responses.
    return undefined;
  } else if (schema instanceof z.ZodCustom) {
    // Currently we expect a custom schema to only be to alias a
    // protobuf type that is otherwise well defined and doesn't
    // require any conversion.
    assert(
      input instanceof protobuf_es.Message,
      "protoToZod: ZodCustom `input` must be a protobuf Message"
    );
    const meta = (schema as z.ZodCustom).meta();
    assert(
      meta !== undefined && "protobuf" in meta,
      "protoToZod: ZodCustom `schema` must have `meta` with 'protobuf' property"
    );
    return input;
  } else if (
    schema instanceof z.ZodLazy &&
    schema._zod.def.getter?.toString() ===
      (z.json() as z.ZodType as z.ZodLazy)._zod.def.getter.toString()
  ) {
    assert(
      input instanceof protobuf_es.Value,
      "protoToZod: ZodLazy (json) `input` must be a protobuf Value"
    );
    return input.toJson();
  } else {
    throw new Error(`Unexpected schema type '${schema._zod.def.type}'`);
  }
}

/**
 * Convert Uint8Array to base64 string (cross-platform).
 */
function uint8ArrayToBase64(bytes: Uint8Array): string {
  // @ts-ignore
  if (typeof Buffer !== "undefined") {
    // Node.js environment.
    // @ts-ignore
    return Buffer.from(bytes).toString("base64");
  } else {
    // Browser environment.
    return btoa(String.fromCharCode(...bytes));
  }
}

/**
 * Convert base64 string to Uint8Array (cross-platform).
 */
function base64ToUint8Array(base64: string): Uint8Array {
  // @ts-ignore
  if (typeof Buffer !== "undefined") {
    // Node.js environment.
    // @ts-ignore
    return new Uint8Array(Buffer.from(base64, "base64"));
  } else {
    // Browser environment.
    return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  }
}

/**
 * Like `JSON.stringify` but with special handling for `BigInt`,
 * `Uint8Array`, primitive `string`, and `String` objects.
 *
 * @param input - The input to stringify.
 * @returns JSON string with `BigInt`, `Uint8Array`, primitive
 * `string`, and `String` objects converted to prefixed strings.
 */
export function stringify(input: any): string {
  return JSON.stringify(input, (_, value) => {
    if (typeof value === "bigint") {
      return `__BIGINT__${value.toString()}`;
    } else if (value instanceof Uint8Array) {
      return `__UINT8ARRAY__${uint8ArrayToBase64(value)}`;
    } else if (typeof value === "string") {
      return `__STRING__${value}`;
    } else if (value instanceof String) {
      return `__STRING__${value.toString()}`;
    } else {
      return value;
    }
  });
}

/**
 * Like `JSON.parse`, but expecting a string from `stringify` (see
 * above) in order to reconstruct `BigInt`, `Uint8Array`, primitive
 * `string`, and `String` objects.
 *
 * @param s - The JSON string to parse.
 * @returns The parsed result with `BigInt`, `Uint8Array`, and `string` properly
 * reconstructed.
 */
export function parse(s: string): any {
  return JSON.parse(s, (_, value) => {
    if (typeof value === "string") {
      if (value.startsWith("__BIGINT__")) {
        const bigIntStr = value.slice(10); // Remove "__BIGINT__" prefix.
        return BigInt(bigIntStr);
      } else if (value.startsWith("__UINT8ARRAY__")) {
        const base64 = value.slice(14); // Remove "__UINT8ARRAY__" prefix (14 characters).
        return base64ToUint8Array(base64);
      } else if (value.startsWith("__STRING__")) {
        return value.slice(10); // Remove "__STRING__" prefix (10 characters).
      }
    } else {
      return value;
    }
  });
}
