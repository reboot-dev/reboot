// NOTE NOTE NOTE NOTE NOTE
//
// This file seems wildly out of date and inaccurate. It is not clear
// that it is being used by type checkers and we should either get rid
// of it or bring it up to date.

import { IdempotencyOptions } from "@reboot-dev/reboot-api";

import {
  Context,
  ExternalContext,
  Servicer,
  TokenVerifier,
  TransactionContext,
  WorkflowContext,
} from "./index.js";

// The Nodejs addon API does not expose TypeScript types so we alias
// our C++ `Napi::External` type to `NapiExternal` to make it more
// self-documenting, even though it is just an `any` .
type NapiExternal = any;

interface Service_constructorProps {
  protoPackageDirectory: string;
  rbtModule: string;
  nodeAdaptor: string;
  id: string;
}

interface Service_callProps {
  external: NapiExternal;
  kind: string;
  method: string;
  requestModule: string;
  requestType: string;
  context: Context | ExternalContext;
  jsonRequest: string;
}

interface Task_awaitProps {
  context: Context | ExternalContext;
  rbtModule: string;
  stateName: string;
  method: string;
  jsonTaskId: string;
}

export namespace rbt_native {
  function Service_constructor(props: Service_constructorProps): NapiExternal;
  function Service_call(props: Service_callProps): string;
  function Task_await(props: Task_awaitProps): string;
  function ExternalContext_constructor(
    name: string,
    url: string,
    bearerToken: string,
    idempotencySeed: string,
    idempotencyRequired: boolean,
    idempotencyRequiredReason: string
  ): NapiExternal;
  function Application_constructor(
    servicers: { new (): Servicer<any> }[],
    initialize?: (context: ExternalContext) => Promise<void>,
    tokenVerifier?: TokenVerifier
  ): NapiExternal;
  function Application_run();
  function Reboot_constructor(): NapiExternal;
  function Reboot_createExternalContext(
    external: NapiExternal,
    name: string,
    externalContextFromNativeInstance: ExternalContext
  ): ExternalContext;
  // This will be an ApplicationConfig proto, not a number.
  function Reboot_up(external: NapiExternal, servicers: any): number;
  // This will take an ApplicationConfig proto.
  function Reboot_down(external: NapiExternal): void;
  function Context_stateId(external: NapiExternal): string;
  function Context_callerBearerToken(external: NapiExternal): string;
  function Context_iteration(external: NapiExternal): number;
  function Context_cookie(external: NapiExternal): string;
  function Context_appInternal(external: NapiExternal): boolean;
  function Context_generateIdempotentStateId(
    external: NapiExternal,
    state_type: string,
    method: string,
    idempotency: IdempotencyOptions
  ): Promise<string>;
  function WriterContext_set_sync(external: NapiExternal, sync: boolean): void;
  function retry_reactively_until(
    external: NapiExternal,
    condition: () => Promise<boolean>
  ): Promise<void>;
  function memoize(
    external: NapiExternal,
    idempotencyAlias: string,
    callable: () => Promise<string>,
    atMostOnce: boolean
  ): Promise<string>;
  function Servicer_read(
    external: NapiExternal,
    context: WorkflowContext
  ): string;
  function Servicer_write(
    external: NapiExternal,
    context: TransactionContext | WorkflowContext,
    writer: (state: any) => Promise<any>,
    json_options: string
  ): string;
  function importPy(module: string, base64_gzip_py: string): void;
  function initialize(callback: (args: any) => any, context: Context);
}
