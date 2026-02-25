import {
  assert,
  auth_pb,
  check_bufbuild_protobuf_library,
  errors_pb,
  IdempotencyOptions,
  nodejs_pb,
  parse,
  protobuf_es,
  stringify,
  tasks_pb,
  toCamelCase,
} from "@reboot-dev/reboot-api";
import type { StandardSchemaV1 } from "@standard-schema/spec";
import * as http from "http";
import { AddressInfo } from "net";
import { AsyncLocalStorage } from "node:async_hooks";
import { fork } from "node:child_process";
import { createRequire } from "node:module";
import toobusy from "toobusy-js";
import { v5 as uuidv5 } from "uuid";
import { z } from "zod/v4";
import * as reboot_native from "./reboot_native.cjs";
// Express is a cjs module so we need to separately import the namespace and
// and the function that returns an application, which have the same name.
// Additionally alias the namespaced types so they do not conflict with other
// types in this file.
import {
  Application as ExpressApplication,
  NextFunction as ExpressNextFunction,
  Request as ExpressRequest,
  Response as ExpressResponse,
} from "express";
import { ensureError } from "./utils/errors.js";
import { ensurePythonVenv } from "./venv.js";

check_bufbuild_protobuf_library(protobuf_es.Message);

const require = createRequire(import.meta.url);
const express = require("express");

export { reboot_native };

export * from "./utils/index.js";

const startedInstances: number[] = [];

if (process != null) {
  const checkForStartedInstances = () => {
    if (startedInstances.length > 0) {
      console.warn(
        `${startedInstances.length} Reboot instance(s) still running on exit which may keep your process from exiting. Did you forget to run \`rbt.stop()\`?`
      );
    }
  };

  process.on("exit", (code) => {
    checkForStartedInstances();
  });

  const checkIfNoOtherListenersAndIfSoExit = (signal, code: number) => {
    // Check if there is only one listener for this signal which would
    // imply just us and if so then we need to perform the _default_
    // act of calling `process.exit()`.
    if (process.listeners(signal).length === 1) {
      process.exit(code);
    }
  };

  process.on("SIGTERM", () => {
    checkForStartedInstances();

    // NOTE: empirical testing shows that a Node.js process that
    // exits due to a SIGTERM will exit with a code of 143.
    checkIfNoOtherListenersAndIfSoExit("SIGTERM", 143);
  });

  process.on("SIGINT", () => {
    checkForStartedInstances();

    // NOTE: empirical testing shows that a Node.js process that
    // exits due to a SIGINT will exit with a code of 130.
    checkIfNoOtherListenersAndIfSoExit("SIGINT", 130);
  });

  process.on("unhandledRejection", (reason, promise) => {
    // We install a slightly quieter unhandled-rejection handler because the
    // native portion of Reboot renders useful error messages before raising.
    console.error("Exiting:", reason);
    checkIfNoOtherListenersAndIfSoExit("unhandledRejection", 1);
  });
}

type ApplicationRevision = {
  applicationId: string;
};

export class Reboot {
  // When this instance was created, used for warning when forgetting to call `stop()`.
  private timestamp: number;

  #external;
  constructor() {
    this.timestamp = Date.now();

    // TODO(benh): consider lazily creating `this.#external` in
    // `start` to match deletion in `stop`.
    this.#external = reboot_native.Reboot_constructor();
  }

  createExternalContext(
    name: string,
    options?: {
      idempotencySeed?: string;
      bearerToken?: string;
      appInternal?: boolean;
    }
  ): ExternalContext {
    if (options?.bearerToken && options?.appInternal) {
      throw new Error(
        "At most one of `bearerToken` and `appInternal` may be set."
      );
    }
    return reboot_native.Reboot_createExternalContext(
      this.#external,
      ExternalContext.fromNativeExternal,
      name,
      options?.idempotencySeed,
      options?.bearerToken,
      options?.appInternal
    );
  }

  async start() {
    await reboot_native.Reboot_start(this.#external);

    startedInstances.push(this.timestamp);
  }

  async stop() {
    // TODO(benh): delete `this.#external` so it doesn't leak
    // and then find all places that uses `this.#external` and
    // make sure their usage is valid.
    await reboot_native.Reboot_stop(this.#external);

    const indexOfTimestamp = startedInstances.indexOf(this.timestamp);
    if (indexOfTimestamp !== -1) {
      startedInstances.splice(indexOfTimestamp, 1);
    }
  }

  async up(
    application: Application,
    options?: { localEnvoy?: boolean; localEnvoyPort?: number }
  ): Promise<ApplicationRevision> {
    // TODO(benh): determine module and file name so that we can
    // namespace if we have more than one implementation of servicers.
    return await reboot_native.Reboot_up(
      this.#external,
      application.__external,
      options?.localEnvoy,
      options?.localEnvoyPort
    );
  }

  async down() {
    await reboot_native.Reboot_down(this.#external);
  }

  url(): string {
    return reboot_native.Reboot_url(this.#external);
  }
}

export class ExternalContext {
  #external;

  constructor(
    args:
      | {
          name: string;
          url?: string;
          bearerToken?: string;
          idempotencySeed?: string;
          idempotencyRequired?: boolean;
          idempotencyRequiredReason?: string;
        }
      | { external: any }
  ) {
    if ("external" in args) {
      this.#external = args.external;
    } else {
      if (!args.url || !args.url.startsWith("http")) {
        throw new Error(
          "`ExternalContext` must be constructed with a `url` " +
            "including an explicit 'http' or 'https' protocol"
        );
      }
      this.#external = reboot_native.ExternalContext_constructor(
        args.name,
        args.url,
        args.bearerToken,
        args.idempotencySeed,
        args.idempotencyRequired,
        args.idempotencyRequiredReason
      );
    }
  }

  static fromNativeExternal(external) {
    return new ExternalContext({ external });
  }

  get __external() {
    return this.#external;
  }

  async generateIdempotentStateId(
    stateType: string,
    serviceName: string,
    method: string,
    idempotency: IdempotencyOptions
  ): Promise<string> {
    return reboot_native.Context_generateIdempotentStateId(
      this.#external,
      stateType,
      serviceName,
      method,
      idempotency
    );
  }
}

export class InitializeContext extends ExternalContext {
  static fromNativeExternal(external) {
    return new InitializeContext({ external });
  }
}

const contextStorage = new AsyncLocalStorage<{
  context: Context;
  withinUntil: boolean;
  withinLoop: boolean;
  loopIteration?: number;
}>();

export function getContext(): Context {
  const store = contextStorage.getStore();
  if (!store) {
    throw new Error(
      "`getContext` may only be called within a `Servicer` method."
    );
  }
  return store.context;
}

export function isWithinUntil(): boolean {
  const store = contextStorage.getStore();
  if (!store) {
    throw new Error(
      "`isWithinUntil` may only be called within a `Servicer` method."
    );
  }
  return store.withinUntil;
}

export function isWithinLoop(): boolean {
  const store = contextStorage.getStore();
  if (!store) {
    throw new Error(
      "`isWithinLoop` may only be called within a `Servicer` method."
    );
  }
  return store.withinLoop;
}

export function getLoopIteration(): number {
  const store = contextStorage.getStore();
  if (!store) {
    throw new Error(
      "`getLoopIteration` may only be called within a `Servicer` method."
    );
  }
  return store.loopIteration;
}

export async function runWithContext<T>(
  context: Context,
  callback: () => T
): Promise<T> {
  return await contextStorage.run(
    {
      context,
      withinLoop: false,
      withinUntil: false,
    },
    callback
  );
}

export class Context {
  #external;
  readonly cancelled: Promise<void>;
  static #isInternalConstructing = false;
  readonly stateId: string;
  readonly method: string;
  readonly stateTypeName: string;
  readonly callerBearerToken: string | null;
  readonly cookie: string | null;
  readonly appInternal: boolean;
  readonly auth: Auth | null;
  readonly workflowId: string | null;

  constructor({
    external,
    stateId,
    method,
    stateTypeName,
    callerBearerToken,
    cookie,
    appInternal,
    auth,
    workflowId,
    cancelled,
  }: {
    external: any;
    stateId: string;
    method: string;
    stateTypeName: string;
    callerBearerToken: string | null;
    cookie: string | null;
    appInternal: boolean;
    auth: Auth | null;
    workflowId: string | null;
    cancelled: Promise<void>;
  }) {
    if (!Context.#isInternalConstructing) {
      throw new TypeError("Context is not publicly constructable");
    }
    Context.#isInternalConstructing = false;
    this.#external = external;
    this.stateId = stateId;
    // Since we are passing a 'method' from Python, it will contain the
    // Python-style method name, so we have to convert it there.
    this.method = toCamelCase(method);
    this.stateTypeName = stateTypeName;
    this.callerBearerToken = callerBearerToken;
    this.cookie = cookie;
    this.appInternal = appInternal;
    this.auth = auth;
    this.workflowId = workflowId;
    this.cancelled = cancelled;
  }

  static fromNativeExternal({ kind, ...options }) {
    Context.#isInternalConstructing = true;
    if (kind === "reader") {
      return new ReaderContext(options);
    } else if (kind === "writer") {
      return new WriterContext(options);
    } else if (kind === "transaction") {
      return new TransactionContext(options);
    } else if (kind === "workflow") {
      return new WorkflowContext(options);
    }
    throw new Error("Unknown method kind");
  }

  get __external() {
    return this.#external;
  }

  async generateIdempotentStateId(
    stateType: string,
    serviceName: string,
    method: string,
    idempotency: IdempotencyOptions
  ) {
    return reboot_native.Context_generateIdempotentStateId(
      this.#external,
      stateType,
      serviceName,
      method,
      idempotency
    );
  }
}

export class ReaderContext extends Context {
  // Property helps `tsc` not treat a `ReaderContext` as any other
  // context type that structurally looks equivalent.
  #kind = "reader";

  constructor(options) {
    super(options);
  }
}

export class WriterContext extends Context {
  // Property helps `tsc` not treat a `WriterContext` as any other
  // context type that structurally looks equivalent.
  #kind = "writer";

  constructor(options) {
    super(options);
  }

  // Set whether or not you'd like the underlying storage layer
  // to use `fsync` (or equivalent) to persist the writer's effects.
  //
  // While a writer with `sync = false` may survive a process crash
  // (although those semantics may be changed later), it may not
  // survive a machine crash.
  //
  // NOTE: these semantics are only considered when:
  //   1. The writer is _not_ a constructor (implicitly or explicitly).
  //   2. The writer is _not_ scheduling any tasks.
  //   3. The writer is _not_ within a transaction.
  //   4. The writer is _not_ running as a task.
  set sync(sync: boolean) {
    // TODO: optimize this so that we don't block the event loop.
    reboot_native.WriterContext_set_sync(this.__external, sync);
  }
}

export class TransactionContext extends Context {
  // Property helps `tsc` not treat a `TransactionContext` as any other
  // context type that structurally looks equivalent.
  #kind = "transaction";

  constructor(options) {
    super(options);
  }
  // TODO: implement transaction specific properties/methods.
}

export type Interval = {
  ms?: number;
  secs?: number;
  mins?: number;
  hours?: number;
  days?: number;
};

export class WorkflowContext extends Context {
  // Property helps `tsc` not treat a `WorkflowContext` as any other
  // context type that structurally looks equivalent.
  #kind = "workflow";

  constructor(options) {
    super(options);
  }

  // TODO: implement workflow specific properties/methods.

  public makeIdempotencyKey({
    alias,
    perWorkflow,
  }: {
    alias: string;
    perWorkflow?: boolean;
  }): string {
    assert(this.workflowId !== null);

    if (!perWorkflow) {
      const store = contextStorage.getStore();
      assert(store !== undefined);
      if (store.withinLoop) {
        alias += ` (iteration #${store.loopIteration})`;
      }
    }

    return uuidv5(alias, this.workflowId);
  }

  async *loop(
    alias: string,
    { interval }: { interval?: Interval } = {}
  ): AsyncGenerator<number, void, unknown> {
    const iterate = await reboot_native.WorkflowContext_loop(
      this.__external,
      alias
    );

    const ms =
      (interval &&
        (interval?.ms || 0) +
          (interval?.secs * 1000 || 0) +
          (interval?.mins * 60 * 1000 || 0) +
          (interval?.hours * 60 * 60 * 1000 || 0) +
          (interval?.days * 24 * 60 * 60 * 1000 || 0)) ||
      0;

    const store = contextStorage.getStore();
    assert(store !== undefined);
    store.withinLoop = true;

    let iteration: number | null = null;
    try {
      while (true) {
        iteration = await iterate(true);
        if (iteration === null) {
          return;
        }
        store.loopIteration = iteration;
        yield iteration;

        if (ms > 0) {
          await new Promise((resolve) => setTimeout(resolve, ms));
        }
      }
    } finally {
      if (iteration !== null) {
        await iterate(false);
      }
      store.withinLoop = false;
      delete store.loopIteration;
    }
  }
}

// Helper for clearing a specific field of a protobuf-es message.
export function clearField(field, target) {
  const localName = field.localName;
  const implicitPresence = !field.opt && !field.req;
  if (field.repeated) {
    target[localName] = [];
  } else if (field.oneof) {
    target[field.oneof.localName] = { case: undefined };
  } else {
    switch (field.kind) {
      case "map":
        target[localName] = {};
        break;
      case "enum":
        target[localName] = implicitPresence ? field.T.values[0].no : undefined;
        break;
      case "scalar":
        target[localName] = implicitPresence
          ? protobuf_es.codegenInfo.scalarDefaultValue(field.T, field.L)
          : undefined;
        break;
      case "message":
        target[localName] = undefined;
        break;
    }
  }
}

// Helper for clearing all the fields of a protobuf-es message.
export function clearFields(target) {
  for (let field of target.getType().fields.byNumber()) {
    clearField(field, target);
  }
}

export abstract class Servicer<T> {}

export type NativeServicer = {
  nativeServicerModule: string;
};

// Either a user defined factory function for a `Servicer`, or a `NativeServicer`
// provided by the `reboot.std` or `reboot.thirdparty` modules.
export type ServicerFactory = { new (): Servicer<any> } | NativeServicer;

/**
 * Class storing auth specific details specific to an implementation
 * (e.g., depending which identity provider you use, how you do authorization,
 * etc). We include some fields that we believe are generic to simplify
 * implementations such as the user id.
 *
 * The Auth object is provided by the TokenVerifier and passed on the context
 * on every request.
 */
export class Auth {
  userId?: string;
  properties: protobuf_es.JsonValue;

  constructor(options?: {
    userId?: string;
    properties?: protobuf_es.JsonValue;
  }) {
    this.userId = options?.userId;
    this.properties = options?.properties ?? {};
  }

  toProtoBytes(): Uint8Array {
    const auth = new auth_pb.Auth({
      userId: this.userId,
      properties: protobuf_es.Struct.fromJson(this.properties),
    });

    return auth.toBinary();
  }

  static fromProtoBytes(bytes: Uint8Array): Auth {
    const auth = auth_pb.Auth.fromBinary(bytes);

    return new Auth({
      userId: auth.userId,
      properties: auth.properties.toJson(),
    });
  }
}

/**
 * Abstract base class for token verifiers.
 *
 * A token verifier is used to verify the authenticity of the `Authorization
 * Bearer` token when passed and optionally extract token metadata.
 */
export abstract class TokenVerifier {
  /**
   * Verifies the token and returns an `Auth` if the token implies the
   * caller is authenticated. Returning `null` implies the caller is not
   * authenticated, however, it is up to an `Authorizer` to decide that or
   * not.
   *
   * :param context: A reader context to enable calling other services.
   * :param token: The token to verify.
   *
   * Returns:
   *   `Auth` information if the token is valid, null otherwise.
   */
  abstract verifyToken(
    context: ReaderContext,
    token?: string
  ): Promise<Auth | null>;

  async _verifyToken(
    external: any,
    cancelled: Promise<void>,
    bytesCall: Uint8Array
  ): Promise<Uint8Array | null> {
    const call = nodejs_pb.VerifyTokenCall.fromBinary(bytesCall);

    const context = Context.fromNativeExternal({
      external,
      kind: "reader",
      stateId: call.context.stateId,
      method: call.context.method,
      stateTypeName: call.context.stateTypeName,
      callerBearerToken: call.context.callerBearerToken,
      cookie: call.context.cookie,
      appInternal: call.context.appInternal,
      auth: null,
      workflowId:
        call.context.workflowId !== undefined ? call.context.workflowId : null,
      cancelled,
    }) as ReaderContext;

    const auth = await this.verifyToken(context, call.token);
    if (!auth) {
      return null;
    }
    return auth.toProtoBytes();
  }
}

// A value of `False` will be translated into a `PermissionDenied` error.
export type AuthorizerDecision =
  | errors_pb.Unauthenticated
  | errors_pb.PermissionDenied
  | errors_pb.Ok;

/**
 * Abstract base class for general Servicer Authorizers.
 *
 * A Servicer's authorizer is used to determine whether a given call to a
 * Servicer's methods should be allowed or not.
 */
export abstract class Authorizer<StateType, RequestTypes> {
  /**
   * Determine whether a call to the method @methodName should be allowed.
   *
   * :param methodName: The name of the method being called.
   * :param context: A reader context to enable calling other services.
   * :param state: The state where and when available.
   * :param request: The request object to the servicer method being called.
   *
   * Returns:
   *         `errors_pb.Ok()` if the call should be allowed,
   *         `errors_pb.Unauthenticated()` or
   *         `errors_pb.PermissionDenied()` otherwise.
   */
  abstract authorize(
    methodName: string,
    context: ReaderContext,
    state?: StateType,
    request?: RequestTypes
  ): Promise<AuthorizerDecision>;

  abstract _authorize(
    external: any,
    cancelled: Promise<void>,
    bytesCall: Uint8Array
  ): Promise<Uint8Array>;
}

export type AuthorizerCallable<StateType, RequestType> = (args: {
  context: ReaderContext;
  state?: StateType;
  request?: RequestType;
}) => Promise<AuthorizerDecision> | AuthorizerDecision;

export abstract class AuthorizerRule<StateType, RequestType> {
  abstract execute(args: {
    context: ReaderContext;
    state?: StateType;
    request?: RequestType;
  }): Promise<AuthorizerDecision>;
}

export function deny(): AuthorizerRule<any, any> {
  return new (class extends AuthorizerRule<any, any> {
    async execute(args) {
      return new errors_pb.PermissionDenied();
    }
  })();
}

export function allow(): AuthorizerRule<any, any> {
  return new (class extends AuthorizerRule<any, any> {
    async execute(args) {
      return new errors_pb.Ok();
    }
  })();
}

export function allowIf<StateType, RequestType>(args: {
  all: AuthorizerCallable<StateType, RequestType>[];
  any?: never;
}): AuthorizerRule<StateType, RequestType>;

export function allowIf<StateType, RequestType>(args: {
  all?: never;
  any: AuthorizerCallable<StateType, RequestType>[];
}): AuthorizerRule<StateType, RequestType>;

export function allowIf<StateType, RequestType>(args: {
  all?: AuthorizerCallable<StateType, RequestType>[];
  any?: AuthorizerCallable<StateType, RequestType>[];
}): AuthorizerRule<StateType, RequestType> {
  const all = args.all;
  const any = args.any;

  if (
    (all === undefined && any === undefined) ||
    (all !== undefined && any !== undefined)
  ) {
    throw new Error("Exactly one of `all` or `any` must be passed");
  }

  const callables = all ?? any;

  return new (class extends AuthorizerRule<StateType, RequestType> {
    async execute({ context, state, request }) {
      // NOTE: we invoke each authorizer callable **one at a time**
      // instead of concurrently so that:
      //
      // (1) We support dependency semantics for `all`, i.e.,
      //     callable's later can assume earlier callables did not
      //     return `Unauthenticated` or `PermissionDenied`.
      //
      // (2) We support short-circuiting`, i.e., cheaper authorizer
      //     callables can be listed first so more expensive ones
      //     aren't executed unless necessary.
      //
      // PLEASE KEEP SEMANTICS IN SYNC WITH PYTHON.

      // Remember if we had any `PermissionDenied` for `any` so that
      // we return that instead of `Unauthenticated`.
      let denied = false;

      for (const callable of callables) {
        const decision = await callable({ context, state, request });

        if (decision instanceof errors_pb.Ok) {
          if (all !== undefined) {
            // All callables must return `Ok`, keep checking.
            continue;
          } else {
            // Only needed one `Ok` and we got it, short-circuit.
            return decision;
          }
        } else if (decision instanceof errors_pb.Unauthenticated) {
          if (all !== undefined) {
            // All callables must return `Ok`, short-circuit.
            return decision;
          } else {
            // Just need one `Ok`, keep checking.
            continue;
          }
        } else if (decision instanceof errors_pb.PermissionDenied) {
          if (all !== undefined) {
            // All callables must return `Ok`, short-circuit.
            return decision;
          } else {
            // Remember that we got at least one `PermissionDenied` so
            // we can return it later.
            denied = true;
            // Only need one `Ok`, keep checking.
            continue;
          }
        }
      }

      // If this was `all`, then they must have all been `Ok`!
      if (all !== undefined) {
        // TODO: assert !denied
        return new errors_pb.Ok();
      }

      // Must be `any`, check if we got a `PermissionDenied` otherwise
      // return `Unauthenticated`.
      if (denied) {
        return new errors_pb.PermissionDenied();
      } else {
        return new errors_pb.Unauthenticated();
      }
    }
  })();
}

export function hasVerifiedToken({
  context,
}: {
  context: ReaderContext;
  state?: any;
  request?: any;
}) {
  if (!context.auth) {
    return new errors_pb.Unauthenticated();
  }
  return new errors_pb.Ok();
}

export function isAppInternal({
  context,
}: {
  context: ReaderContext;
  state?: any;
  request?: any;
}) {
  if (context.appInternal) {
    return new errors_pb.Ok();
  }
  return new errors_pb.PermissionDenied();
}

export type NativeLibrary = {
  nativeLibraryModule: string;
  nativeLibraryFunction: string;
  authorizer?: Authorizer<unknown, unknown>;
};

export type TypeScriptLibrary = {
  name: string;
  servicers: () => ServicerFactory[];
  requirements?: () => string[];
  preRun?: (application: Application) => Promise<void>;
  initialize?: (context: InitializeContext) => Promise<void>;
};
export type Library = TypeScriptLibrary | NativeLibrary;

/**
 * Prepares libraries for conversion. Wraps `initialize` method for better
 * error handling.
 *
 * @param library Library to be prepared
 * @returns
 */
function prepareLibrary(library: Library) {
  // Skip Python libraries and libraries without an initialize.
  if (
    (library as NativeLibrary).nativeLibraryModule !== undefined ||
    (library as TypeScriptLibrary).initialize === undefined
  ) {
    return library;
  }

  return {
    ...library,
    initialize: async (context: InitializeContext) => {
      try {
        await (library as TypeScriptLibrary).initialize(context);
      } catch (e) {
        // Ensure we have an `Error` and then `console.error()` it
        // so that developers see a stack trace of what is going
        // on.
        const error = ensureError(e);
        // Write an empty message which includes a newline to make
        // it easier to identify the stack trace.
        console.error("");
        console.error(error);
        console.error("");
        throw error;
      }
    },
  };
}

export class Application {
  #servicers?: ServicerFactory[];
  #libraries?: Library[];
  #tokenVerifier?: TokenVerifier;
  #express: ExpressApplication;
  #http: Application.Http;
  #servers: Map<string, http.Server>;
  #createExternalContext?: (args: {
    name: string;
    bearerToken?: string;
  }) => Promise<ExternalContext>;
  #external;

  constructor({
    servicers,
    libraries,
    initialize,
    initializeBearerToken,
    tokenVerifier,
  }: {
    servicers?: ServicerFactory[];
    libraries?: Library[];
    initialize?: (context: InitializeContext) => Promise<void>;
    initializeBearerToken?: string;
    tokenVerifier?: TokenVerifier;
  }) {
    this.#servicers = servicers || [];
    this.#libraries = libraries || [];
    this.#tokenVerifier = tokenVerifier;

    this.#express = express();
    // We assume that our users will want these middleware.
    // TODO: expose `.use()` to allow users to add their own middleware.
    this.#express.use(express.json());
    this.#express.use(express.urlencoded({ extended: true }));

    this.#express.disable("x-powered-by");

    this.#http = new Application.Http(
      this.#express,
      async (args: { name: string; bearerToken?: string }) => {
        return await this.#createExternalContext(args);
      }
    );

    this.#servers = new Map<string, http.Server>();

    this.#external = reboot_native.Application_constructor(
      (external, kind: string) => {
        if (kind === "external") {
          return ExternalContext.fromNativeExternal(external);
        }
        assert(kind === "initialize");
        return InitializeContext.fromNativeExternal(external);
      },
      this.#servicers,
      {
        start: async (
          serverId: string,
          port: number | null,
          createExternalContext: (args: {
            name: string;
            bearerToken?: string;
          }) => Promise<ExternalContext>
        ) => {
          // Store `createExternalContext` function before listening
          // so we don't attempt to serve any traffic and try and use
          // an `undefined` function.
          this.#createExternalContext = createExternalContext;

          let server;

          [server, port] = await new Promise((resolve, reject) => {
            const server = this.#express.listen(port ?? 0, (error?: Error) => {
              if (error) {
                reject(error);
              } else {
                // We requested a port so we should have an
                // `AddressInfo` not a string representing a file
                // descriptor path for a pipe or socket, etc.
                const address: string | AddressInfo = server.address();
                assert(typeof address !== "string");
                resolve([server, (address as AddressInfo).port]);
              }
            });
          });

          this.#servers.set(serverId, server);

          return port;
        },
        stop: async (serverId: string) => {
          const server = this.#servers.get(serverId);
          if (server !== undefined) {
            await new Promise<void>((resolve, reject) => {
              server.close((err) => {
                if (err) {
                  reject(err);
                } else {
                  resolve();
                }
              });
            });
            this.#servers.delete(serverId);
          }
        },
      },
      async (context: InitializeContext) => {
        if (initialize !== undefined) {
          try {
            await initialize(context);
          } catch (e) {
            // Ensure we have an `Error` and then `console.error()` it
            // so that developers see a stack trace of what is going
            // on.
            const error = ensureError(e);
            // Write an empty message which includes a newline to make
            // it easier to identify the stack trace.
            console.error("");
            console.error(error);
            console.error("");
            throw error;
          }
        }
      },
      initializeBearerToken,
      tokenVerifier,
      this.#libraries.map(prepareLibrary)
    );
  }

  get servicers() {
    return this.#servicers;
  }

  get libraries() {
    return this.#libraries;
  }

  get tokenVerifier() {
    return this.#tokenVerifier;
  }

  get http() {
    return this.#http;
  }

  async run() {
    if (process.env.REBOOT_ENABLE_EVENT_LOOP_LAG_MONITORING === "true") {
      toobusy.onLag((lag) => {
        console.log(`Node.js event loop lag detected! Latency: ${lag}ms.
          This may indicate a blocking operation on the main thread
          (e.g., CPU-intensive task). If you are not running such tasks,
          please report this issue to the maintainers.`);
      });
    }

    // Get all the TypeScript libraries and sort them by name.
    const tsLibraries = this.#libraries
      .filter(
        (library) =>
          (library as NativeLibrary).nativeLibraryModule === undefined
      )
      .map((library) => library as TypeScriptLibrary)
      .sort((a, b) => (a.name > b.name ? 1 : b.name > a.name ? -1 : 0));

    // Execute pre-run for TypeScript libraries.
    // Python's NodeApplication responsible for running Python libraries.
    for (const library of tsLibraries) {
      if (library.preRun) {
        library.preRun(this);
      }
    }

    return await reboot_native.Application_run(this.#external);
  }

  get __external() {
    return this.#external;
  }
}

export namespace Application {
  export namespace Http {
    export type Path = string | RegExp | (string | RegExp)[];

    export type ReqResHandler = (
      context: ExternalContext,
      req: ExpressRequest,
      res: ExpressResponse
    ) => any;

    export type ReqResNextHandler = (
      context: ExternalContext,
      req: ExpressRequest,
      res: ExpressResponse,
      next: ExpressNextFunction
    ) => any;

    export type ErrReqResNextHandler = (
      context: ExternalContext,
      err: any,
      req: ExpressRequest,
      res: ExpressResponse,
      next: ExpressNextFunction
    ) => any;

    export type Handler =
      | ReqResHandler
      | ReqResNextHandler
      | ErrReqResNextHandler;
  }

  export class Http {
    #express: ExpressApplication;
    #createExternalContext: (args: {
      name: string;
      bearerToken?: string;
    }) => Promise<ExternalContext>;

    constructor(
      express: ExpressApplication,
      createExternalContext: (args: {
        name: string;
        bearerToken?: string;
      }) => Promise<ExternalContext>
    ) {
      this.#express = express;
      this.#createExternalContext = createExternalContext;
    }

    private add(
      method: "GET" | "POST",
      path: Http.Path,
      handlers: Http.Handler[]
    ) {
      const methods = {
        GET: (path, ...handlers) => this.#express.get(path, ...handlers),
        POST: (path, ...handlers) => this.#express.post(path, ...handlers),
      };

      const createExternalContext = (name: string, authorization?: string) => {
        let bearerToken = undefined;

        if (authorization !== undefined) {
          const parts = authorization.split(" ");
          if (parts.length === 2 && parts[0].toLowerCase() === "bearer") {
            bearerToken = parts[1];
          }
        }

        return this.#createExternalContext({
          name,
          bearerToken,
        });
      };

      methods[method](
        path,
        ...handlers.map((handler) => {
          // Express allows for three different kinds of handlers, a
          // "normal" handler that takes two args, `req` and `res`, a
          // "middleware" handler that takes three args, `req`, `res`,
          // and `next`, and an "error" handler that takes four args
          // `err`, `req`, `res`, and `next`. To the best of our
          // understanding they determine what arguments to pass to
          // handlers based on how many arguments the handler takes,
          // and so that is exactly what we do below as well, except
          // accounting for an extra first arg for the
          // `ExternalContext`.
          switch (handler.length) {
            // (context, req, res) => ...
            case 3:
              return async (req, res) => {
                const context = await createExternalContext(
                  `HTTP ${method} '${req.path}'`,
                  req.header("Authorization")
                );
                // @ts-ignore
                handler(context, req, res);
              };

            // (context, req, res, next) => ...
            case 4:
              return async (req, res, next) => {
                const context = await createExternalContext(
                  `HTTP ${method} '${req.path}'`,
                  req.header("Authorization")
                );
                // @ts-ignore
                handler(context, req, res, next);
              };

            // (context, err, req, res, next) => ...
            case 5:
              return async (err, req, res, next) => {
                const context = await createExternalContext(
                  `HTTP ${method} '${req.path}'`,
                  req.header("Authorization")
                );
                handler(context, err, req, res, next);
              };

            default:
              throw new Error(
                `HTTP ${method} handler for '${path}' has unexpected ` +
                  `number of arguments`
              );
          }
        })
      );
    }

    get(path: Http.Path, ...handlers: Http.Handler[]) {
      this.add("GET", path, handlers);
    }

    post(path: Http.Path, ...handlers: Http.Handler[]) {
      this.add("POST", path, handlers);
    }
  }
}

export async function retryReactivelyUntil(
  context: WorkflowContext,
  condition: () => Promise<boolean>
): Promise<void>;

export async function retryReactivelyUntil<T>(
  context: WorkflowContext,
  condition: () => Promise<false | T>
): Promise<T>;

export async function retryReactivelyUntil<T>(
  context: WorkflowContext,
  condition: () => Promise<boolean | T>
): Promise<void | T> {
  let t: T | undefined = undefined;

  await reboot_native.retry_reactively_until(
    context.__external,
    AsyncLocalStorage.bind(async () => {
      const store = contextStorage.getStore();
      assert(store !== undefined);
      store.withinUntil = true;
      try {
        const result = await condition();
        if (typeof result === "boolean") {
          return result;
        } else {
          t = result;
          return true;
        }
      } catch (e) {
        const error = ensureError(e);
        console.error(error);
        throw error;
      } finally {
        store.withinUntil = false;
      }
    })
  );

  return t;
}

// NOTE: we're not using an enum because the values that can be used in
// `atMostOnce` and `atLeastOnce` are different than `until`.
export const ALWAYS = "ALWAYS" as const;
export const PER_WORKFLOW = "PER_WORKFLOW" as const;
export const PER_ITERATION = "PER_ITERATION" as const;

export type How = "ALWAYS" | "PER_WORKFLOW" | "PER_ITERATION";

async function memoize<Schema extends StandardSchemaV1>(
  idempotencyAliasOrTuple:
    | string
    | [string, "ALWAYS" | "PER_WORKFLOW" | "PER_ITERATION"],
  context: WorkflowContext,
  callable: () => Promise<StandardSchemaV1.InferInput<Schema>>,
  {
    schema,
    atMostOnce,
    until = false,
  }: {
    schema?: Schema;
    atMostOnce: boolean;
    until?: boolean;
  }
): Promise<void | StandardSchemaV1.InferOutput<Schema>> {
  assert(atMostOnce !== undefined);

  if (
    !(
      typeof idempotencyAliasOrTuple === "string" ||
      (Array.isArray(idempotencyAliasOrTuple) &&
        idempotencyAliasOrTuple.length === 2)
    )
  ) {
    throw new TypeError(
      `Expecting either a 'string' or a tuple for first argument passed to '${
        atMostOnce ? "atMostOnce" : until ? "until" : "atLeastOnce"
      }'`
    );
  }

  const result = await reboot_native.memoize(
    context.__external,
    typeof idempotencyAliasOrTuple === "string"
      ? [idempotencyAliasOrTuple as string, PER_ITERATION]
      : idempotencyAliasOrTuple,
    // Bind with async local storage so we can check things like
    // `isWithinLoop`, etc.
    AsyncLocalStorage.bind(async () => {
      try {
        const t = await callable();

        if (t !== undefined) {
          // Fail early if the developer forgot to pass `schema`.
          if (schema === undefined) {
            throw new Error(
              `Expecting 'schema' as you are returning a value from the function passed to '${
                atMostOnce ? "atMostOnce" : until ? "until" : "atLeastOnce"
              }'`
            );
          }

          let validate = schema["~standard"].validate(t);
          if (validate instanceof Promise) {
            validate = await validate;
          }

          // If the `issues` field exists, the validation failed.
          if (validate.issues) {
            throw new Error(
              `Failed to validate result of function passed to '${
                atMostOnce ? "atMostOnce" : until ? "until" : "atLeastOnce"
              }': ${JSON.stringify(validate.issues, null, 2)}`
            );
          }

          // We use `stringify` from `@reboot-dev/reboot-api` because
          // it can handle `BigInt` and `Uint8Array` which are common
          // types from protobuf.
          //
          // NOTE: to differentiate `callable` returning `void` (or
          // explicitly `undefined`) from `stringify` returning
          // an empty string we use `{ value: t }`.
          const result = { value: t };
          return stringify(result);
        } else {
          // Fail early if the developer thinks that they have some
          // value that they want to validate but we got `undefined`.
          if (schema !== undefined) {
            throw new Error(
              `Not expecting 'schema' as you are returning 'void' (or explicitly 'undefined') from the function passed to '${
                atMostOnce ? "atMostOnce" : until ? "until" : "atLeastOnce"
              }' ; did you mean to return a value (or if you want to explicitly return the absence of a value use 'null')`
            );
          }

          // NOTE: using the empty string to represent a `callable`
          // returning `void` (or explicitly `undefined`).
          return "";
        }
      } catch (e) {
        const error = ensureError(e);
        // We handle printing the exception for `until` in
        // `retryReactivelyUntil`.
        if (!until) {
          console.error(error);
        }
        throw error;
      }
    }),
    atMostOnce,
    until
  );

  // NOTE: we parse and validate `value` every time (even the first
  // time, even though we validate above). These semantics are the
  // same as Python (although Python uses the `type` keyword argument
  // instead of the `parse` and `validate` properties we use here).

  assert(result !== undefined);

  if (result !== "") {
    // We use `parse` from `@reboot-dev/reboot-api` because it can
    // handle `BigInt` and `Uint8Array` which are common types from
    // protobuf.
    const { value } = parse(result);

    if (schema === undefined) {
      throw new Error(
        `Expecting 'schema' as we have already memoized a result for the function passed to '${
          atMostOnce ? "atMostOnce" : until ? "until" : "atLeastOnce"
        }' has the code been updated to remove a previously existing 'schema'`
      );
    }

    let validate = schema["~standard"].validate(value);
    if (validate instanceof Promise) {
      validate = await validate;
    }

    // If the `issues` field exists, the validation failed.
    if (validate.issues) {
      throw new Error(
        `Failed to validate result of function passed to '${
          atMostOnce ? "atMostOnce" : until ? "until" : "atLeastOnce"
        }': ${JSON.stringify(validate.issues, null, 2)}`
      );
    }

    return (validate as any).value as StandardSchemaV1.InferOutput<Schema>;
  }

  // Otherwise `callable` must have returned void (or explicitly
  // `undefined`), fall through.
}

export type AtMostLeastOnceTupleType = [
  string,
  "PER_WORKFLOW" | "PER_ITERATION"
];

export async function atMostOnce(
  idempotencyAliasOrTuple: string | AtMostLeastOnceTupleType,
  context: WorkflowContext,
  callable: () => Promise<void>,
  options?: { schema?: undefined }
): Promise<void>;

export async function atMostOnce<Schema extends StandardSchemaV1>(
  idempotencyAliasOrTuple: string | AtMostLeastOnceTupleType,
  context: WorkflowContext,
  callable: () => Promise<StandardSchemaV1.InferInput<Schema>>,
  options: { schema: Schema }
): Promise<StandardSchemaV1.InferOutput<Schema>>;

export async function atMostOnce<Schema extends StandardSchemaV1>(
  idempotencyAliasOrTuple: string | AtMostLeastOnceTupleType,
  context: WorkflowContext,
  callable: () => Promise<StandardSchemaV1.InferInput<Schema>>,
  options: { schema?: Schema } = {}
): Promise<void | StandardSchemaV1.InferOutput<Schema>> {
  try {
    return await memoize(idempotencyAliasOrTuple, context, callable, {
      ...options,
      atMostOnce: true,
    });
  } catch (e) {
    console.log(
      "Caught exception within `atMostOnce` which will now forever " +
        "more throw `AtMostOnceFailedBeforeCompleting`; " +
        "to propagate failures return a value instead!"
    );
    throw e;
  }
}

export async function atMostOncePerWorkflow(
  idempotencyAlias: string,
  context: WorkflowContext,
  callable: () => Promise<void>,
  options?: { schema?: undefined }
): Promise<void>;

export async function atMostOncePerWorkflow<Schema extends StandardSchemaV1>(
  idempotencyAlias: string,
  context: WorkflowContext,
  callable: () => Promise<StandardSchemaV1.InferInput<Schema>>,
  options: { schema: Schema }
): Promise<StandardSchemaV1.InferOutput<Schema>>;

export async function atMostOncePerWorkflow<Schema extends StandardSchemaV1>(
  idempotencyAlias: string,
  context: WorkflowContext,
  callable: () => Promise<StandardSchemaV1.InferInput<Schema>>,
  options: { schema?: Schema } = {}
): Promise<void | StandardSchemaV1.InferOutput<Schema>> {
  return atMostOnce(
    [idempotencyAlias, PER_WORKFLOW],
    context,
    callable as any,
    options as any
  );
}

export async function atLeastOnce(
  idempotencyAliasOrTuple: string | AtMostLeastOnceTupleType,
  context: WorkflowContext,
  callable: () => Promise<void>,
  options?: { schema?: undefined }
): Promise<void>;

export async function atLeastOnce<Schema extends StandardSchemaV1>(
  idempotencyAliasOrTuple: string | AtMostLeastOnceTupleType,
  context: WorkflowContext,
  callable: () => Promise<StandardSchemaV1.InferInput<Schema>>,
  options: { schema: Schema }
): Promise<StandardSchemaV1.InferOutput<Schema>>;

export async function atLeastOnce<Schema extends StandardSchemaV1>(
  idempotencyAliasOrTuple: string | AtMostLeastOnceTupleType,
  context: WorkflowContext,
  callable: () => Promise<StandardSchemaV1.InferInput<Schema>>,
  options: { schema?: Schema } = {}
): Promise<void | StandardSchemaV1.InferOutput<Schema>> {
  return memoize(idempotencyAliasOrTuple, context, callable, {
    ...options,
    atMostOnce: false,
  });
}

export async function atLeastOncePerWorkflow(
  idempotencyAlias: string,
  context: WorkflowContext,
  callable: () => Promise<void>,
  options?: { schema?: undefined }
): Promise<void>;

export async function atLeastOncePerWorkflow<Schema extends StandardSchemaV1>(
  idempotencyAlias: string,
  context: WorkflowContext,
  callable: () => Promise<StandardSchemaV1.InferInput<Schema>>,
  options: { schema: Schema }
): Promise<StandardSchemaV1.InferOutput<Schema>>;

export async function atLeastOncePerWorkflow<Schema extends StandardSchemaV1>(
  idempotencyAlias: string,
  context: WorkflowContext,
  callable: () => Promise<StandardSchemaV1.InferInput<Schema>>,
  options: { schema?: Schema } = {}
): Promise<void | StandardSchemaV1.InferOutput<Schema>> {
  return await atLeastOnce(
    [idempotencyAlias, PER_WORKFLOW],
    context,
    callable as any,
    options as any
  );
}

export type UntilTupleType = [
  string,
  "ALWAYS" | "PER_WORKFLOW" | "PER_ITERATION"
];

export async function until(
  idempotencyAliasOrTuple: string | UntilTupleType,
  context: WorkflowContext,
  callable: () => Promise<boolean>,
  options?: { schema?: undefined }
): Promise<void>;

export async function until<Schema extends StandardSchemaV1>(
  idempotencyAliasOrTuple: string | UntilTupleType,
  context: WorkflowContext,
  callable: () => Promise<false | StandardSchemaV1.InferInput<Schema>>,
  options: { schema: Schema }
): Promise<StandardSchemaV1.InferOutput<Schema>>;

export async function until<Schema extends StandardSchemaV1>(
  idempotencyAliasOrTuple: string | UntilTupleType,
  context: WorkflowContext,
  callable: () => Promise<boolean | StandardSchemaV1.InferInput<Schema>>,
  options: { schema?: Schema } = {}
): Promise<void | StandardSchemaV1.InferOutput<Schema>> {
  // TODO(benh): figure out how to not use `as` type assertions here
  // to appease the TypeScript compiler which otherwise isn't happy
  // with passing on these types.
  const converge = () => {
    return retryReactivelyUntil(context, callable as () => Promise<boolean>);
  };

  // TODO: should we not memoize if passed `ALWAYS`? There still might
  // be value in having a "paper trail" of what happened ...

  return memoize(idempotencyAliasOrTuple, context, converge, {
    ...options,
    atMostOnce: false,
    until: true,
  } as {
    schema?: Schema;
    atMostOnce: boolean;
    until?: boolean;
  });
}

export async function untilPerWorkflow(
  idempotencyAlias: string,
  context: WorkflowContext,
  callable: () => Promise<boolean>,
  options?: { schema?: undefined }
): Promise<void>;

export async function untilPerWorkflow<Schema extends StandardSchemaV1>(
  idempotencyAlias: string,
  context: WorkflowContext,
  callable: () => Promise<false | StandardSchemaV1.InferInput<Schema>>,
  options: { schema: Schema }
): Promise<StandardSchemaV1.InferOutput<Schema>>;

export async function untilPerWorkflow<Schema extends StandardSchemaV1>(
  idempotencyAlias: string,
  context: WorkflowContext,
  callable: () => Promise<boolean | StandardSchemaV1.InferInput<Schema>>,
  options: { schema?: Schema } = {}
): Promise<void | StandardSchemaV1.InferOutput<Schema>> {
  return await until(
    [idempotencyAlias, PER_WORKFLOW],
    context,
    callable as any,
    options as any
  );
}

export async function untilChanges<Schema extends StandardSchemaV1>(
  idempotencyAlias: string,
  context: WorkflowContext,
  callable: () => Promise<StandardSchemaV1.InferInput<Schema>>,
  {
    equals,
    schema,
  }: {
    equals: (
      previous: StandardSchemaV1.InferOutput<Schema>,
      current: StandardSchemaV1.InferOutput<Schema>
    ) => boolean;
    schema: Schema;
  }
): Promise<StandardSchemaV1.InferOutput<Schema>> {
  const iteration = getLoopIteration();

  if (iteration === undefined) {
    throw new Error("Waiting for changes must be done _within_ a control loop");
  }

  if (equals === undefined) {
    // TODO: don't make `equals` required, instead use one of the
    // various libraries that does deep equality.
    throw new Error("Missing 'equals' option");
  }

  let previous: StandardSchemaV1.InferOutput<Schema> | null = null;

  if (iteration > 0) {
    // Get the previous memoized result!
    previous = (await untilPerWorkflow(
      `${idempotencyAlias} #${iteration - 1}`,
      context,
      (async () => {
        throw new Error(`Missing memoized value for '${idempotencyAlias}'`);
      }) as any,
      { schema }
    )) as StandardSchemaV1.InferOutput<Schema>;
  }

  // Wait until previous result does not equal current result.
  return (await untilPerWorkflow(
    `${idempotencyAlias} #${iteration}`,
    context,
    (async (): Promise<false | StandardSchemaV1.InferInput<Schema>> => {
      const current = await callable();
      if (iteration === 0) {
        return current;
      }
      assert(previous !== null);
      if (!equals(previous, current)) {
        return current;
      }
      return false;
    }) as any,
    { schema }
  )) as StandardSchemaV1.InferOutput<Schema>;
}

const launchSubprocessServer = (base64_args: string) => {
  // Create a child process via `fork` (which does not mean `fork` as
  // in POSIX fork/clone) that uses the exact same module that was
  // used to start the initial application, however we set some env
  // vars in order to trigger the child process to run as a
  // server subprocess.
  const subprocess = fork(process.argv[1], {
    env: {
      ...process.env,
      // Pass over the server args in an env var.
      REBOOT_NODEJS_SERVER: "true",
      REBOOT_NODEJS_SERVER_BASE64_ARGS: base64_args,
    },
  });

  return subprocess.pid;
};

const callback = (...args) => {
  console.log(new Date(), ...args);
};

ensurePythonVenv();

reboot_native.initialize(callback, launchSubprocessServer);

// TODO: move these into @reboot-dev/reboot-api and also generate them
// via plugin, perhaps via a new plugin which emits the Zod schemas
// for all protobuf messages, which might be easier after we've moved
// to protobuf-es v2 which has more natural TypeScript types.

function protobufToZodSchema<T extends protobuf_es.Message<T>>(
  type: protobuf_es.MessageType<T>
) {
  return z
    .custom<protobuf_es.PartialMessage<T>>((t: any) => {
      // TODO: replace this with `protobuf_es.isMessage` after upgrading
      // '@bufbuild/protobuf'.
      if (t instanceof type) {
        return true;
      }

      if (typeof t === "object" && "getType" in t) {
        if (typeof t.getType === "function") {
          const actualType = t.getType();
          if (typeof actualType === "function" && "typeName" in actualType) {
            return actualType.typeName === type.typeName;
          }
        }
      }

      try {
        type.fromJson(t);
        return true;
      } catch (e) {
        return false;
      }
    })
    .meta({ protobuf: type.typeName });
}

export const zod = {
  tasks: {
    TaskId: protobufToZodSchema(tasks_pb.TaskId),
  },

  bytes: z
    .custom<Uint8Array>((array) => {
      return array instanceof Uint8Array;
    })
    .meta({ protobuf: "bytes" }),
};
