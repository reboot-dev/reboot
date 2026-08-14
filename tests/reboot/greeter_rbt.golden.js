/* eslint-disable */
// @ts-nocheck
var __classPrivateFieldSet = (this && this.__classPrivateFieldSet) || function (receiver, state, value, kind, f) {
    if (kind === "m") throw new TypeError("Private method is not writable");
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a setter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot write private member to an object whose class did not declare it");
    return (kind === "a" ? f.call(receiver, value) : f ? f.value = value : state.set(receiver, value)), value;
};
var __classPrivateFieldGet = (this && this.__classPrivateFieldGet) || function (receiver, state, kind, f) {
    if (kind === "a" && !f) throw new TypeError("Private accessor was defined without a getter");
    if (typeof state === "function" ? receiver !== state || !f : !state.has(receiver)) throw new TypeError("Cannot read private member from an object whose class did not declare it");
    return kind === "m" ? f : kind === "a" ? f.call(receiver) : f ? f.value : state.get(receiver);
};
var __setFunctionName = (this && this.__setFunctionName) || function (f, name, prefix) {
    if (typeof name === "symbol") name = name.description ? "[".concat(name.description, "]") : "";
    return Object.defineProperty(f, "name", { configurable: true, value: prefix ? "".concat(prefix, " ", name) : name });
};
var _GreeterBaseServicer_external, _a, _WorkflowState_external, _external, _idempotency, _b, _external_1, _c, _d, _GreeterServicer_storage, _GreeterServicer_instances, _GreeterAuthorizer_rules, _GreeterCreateAborted_error, _GreeterCreateAborted_message, _GreeterCreateTask_context, _GreeterCreateTask_promise, _GreeterGreetAborted_error, _GreeterGreetAborted_message, _GreeterGreetTask_context, _GreeterGreetTask_promise, _GreeterSetAdjectiveAborted_error, _GreeterSetAdjectiveAborted_message, _GreeterSetAdjectiveTask_context, _GreeterSetAdjectiveTask_promise, _GreeterTransactionSetAdjectiveAborted_error, _GreeterTransactionSetAdjectiveAborted_message, _GreeterTransactionSetAdjectiveTask_context, _GreeterTransactionSetAdjectiveTask_promise, _GreeterTryToConstructContextAborted_error, _GreeterTryToConstructContextAborted_message, _GreeterTryToConstructContextTask_context, _GreeterTryToConstructContextTask_promise, _GreeterTryToConstructExternalContextAborted_error, _GreeterTryToConstructExternalContextAborted_message, _GreeterTryToConstructExternalContextTask_context, _GreeterTryToConstructExternalContextTask_promise, _GreeterTestLongRunningFetchAborted_error, _GreeterTestLongRunningFetchAborted_message, _GreeterTestLongRunningFetchTask_context, _GreeterTestLongRunningFetchTask_promise, _GreeterTestLongRunningWriterAborted_error, _GreeterTestLongRunningWriterAborted_message, _GreeterTestLongRunningWriterTask_context, _GreeterTestLongRunningWriterTask_promise, _GreeterGetWholeStateAborted_error, _GreeterGetWholeStateAborted_message, _GreeterGetWholeStateTask_context, _GreeterGetWholeStateTask_promise, _GreeterFailWithExceptionAborted_error, _GreeterFailWithExceptionAborted_message, _GreeterFailWithExceptionTask_context, _GreeterFailWithExceptionTask_promise, _GreeterFailWithAbortedAborted_error, _GreeterFailWithAbortedAborted_message, _GreeterFailWithAbortedTask_context, _GreeterFailWithAbortedTask_promise, _GreeterWorkflowAborted_error, _GreeterWorkflowAborted_message, _GreeterWorkflowTask_context, _GreeterWorkflowTask_promise, _GreeterDangerousFieldsAborted_error, _GreeterDangerousFieldsAborted_message, _GreeterDangerousFieldsTask_context, _GreeterDangerousFieldsTask_promise, _GreeterStoreRecursiveMessageAborted_error, _GreeterStoreRecursiveMessageAborted_message, _GreeterStoreRecursiveMessageTask_context, _GreeterStoreRecursiveMessageTask_promise, _GreeterReadRecursiveMessageAborted_error, _GreeterReadRecursiveMessageAborted_message, _GreeterReadRecursiveMessageTask_context, _GreeterReadRecursiveMessageTask_promise, _GreeterConstructAndStoreRecursiveMessageAborted_error, _GreeterConstructAndStoreRecursiveMessageAborted_message, _GreeterConstructAndStoreRecursiveMessageTask_context, _GreeterConstructAndStoreRecursiveMessageTask_promise, _GreeterWeakReference_external, _GreeterWeakReference_id, _GreeterWeakReference_options, _weakReference, _options, _e, _weakReference_1, _options_1, _f, _weakReference_2, _options_2, _g, _ids, _h, _idempotency_1, _j;
import { reboot_native, ensureError } from "@reboot-dev/reboot";
import { Empty } from "@bufbuild/protobuf";
import { AsyncLocalStorage } from "node:async_hooks";
// Additionally re-export all messages_and_enums from the pb module.
export { CreateRequest, CreateResponse, GreetRequest, GreetResponse, SetAdjectiveRequest, SetAdjectiveResponse, TestLongRunningFetchRequest, GetWholeStateRequest, WorkflowResponse, ErrorWithValue, RecursiveMessage, StoreRecursiveMessageRequest, StoreRecursiveMessageResponse, ReadRecursiveMessageRequest, ReadRecursiveMessageResponse, ConstructAndStoreRecursiveMessageRequest, ConstructAndStoreRecursiveMessageResponse, DangerousFieldsRequest, Time, StopwatchRequest, StopwatchResponse, MatchColorRequest, MatchColorResponse, Color, } from "./greeter_pb.js";
import { Greeter as GreeterProto, } from "./greeter_pb.js";
import * as greeter_pb from "./greeter_pb.js";
import * as uuid from "uuid";
import * as reboot from "@reboot-dev/reboot";
import { InitializeContext, WorkflowContext, } from "@reboot-dev/reboot";
import * as protobuf_es from "@bufbuild/protobuf";
import * as reboot_api from "@reboot-dev/reboot-api";
reboot_api.check_bufbuild_protobuf_library(protobuf_es.Message);
// To support writers seeing partial updates of transactions,
// and transactions seeing updates from writers, we need to store
// a reference to the latest state in an ongoing transaction.
//
// Moreover, we need to update that _reference_ after each writer
// executes within a transaction. We do that in the generated
// code, see below.
const ongoingTransactionStates = {};
// Helper to get the `ongoingTransactionStates` dictionary key.
// The key contains the state type name and the state ID to avoid
// conflicts when multiple states share the same ID, and the root
// transaction ID because several transactions may be joined to one
// state at the same time (they join it "shared", and only upgrade to
// "exclusive" once they write). Without the transaction ID they would
// share a single entry, and whichever registered last would receive
// the others' writer updates, silently losing their effects.
const ongoingTransactionStateKey = (context) => {
    return `${context.stateTypeName}/${context.stateId}/${context.transactionRootId}`;
};
// Track state IDs that are being _constructed_ in a transaction
// so that when using Zod we don't validate the initial state which
// will fail validation if there are required fields.
const statesBeingConstructed = new Set();
const ERROR_TYPES = [
    // gRPC errors.
    reboot_api.errors_pb.Cancelled,
    reboot_api.errors_pb.Unknown,
    reboot_api.errors_pb.InvalidArgument,
    reboot_api.errors_pb.DeadlineExceeded,
    reboot_api.errors_pb.NotFound,
    reboot_api.errors_pb.AlreadyExists,
    reboot_api.errors_pb.PermissionDenied,
    reboot_api.errors_pb.ResourceExhausted,
    reboot_api.errors_pb.FailedPrecondition,
    reboot_api.errors_pb.Aborted,
    reboot_api.errors_pb.OutOfRange,
    reboot_api.errors_pb.Unimplemented,
    reboot_api.errors_pb.Internal,
    reboot_api.errors_pb.Unavailable,
    reboot_api.errors_pb.DataLoss,
    reboot_api.errors_pb.Unauthenticated,
    // Reboot errors.
    //
    // NOTE: also add any new errors into `rbt/v1alpha1/index.ts`.
    reboot_api.errors_pb.StateAlreadyConstructed,
    reboot_api.errors_pb.StateNotConstructed,
    reboot_api.errors_pb.TransactionParticipantFailedToPrepare,
    reboot_api.errors_pb.TransactionParticipantFailedToCommit,
    reboot_api.errors_pb.UnknownService,
    reboot_api.errors_pb.UnknownTask,
]; // Need `as const` to ensure TypeScript infers this as a tuple!
const GreeterFromJsonString = (jsonState, options = { validate: true }) => {
    return GreeterState.fromJsonString(jsonState);
};
const GreeterFromBinary = (bytesState, options = { validate: true }) => {
    return GreeterState.fromBinary(bytesState);
};
const GreeterToProtobuf = (state, options = { validate: true }) => {
    return state instanceof GreeterState
        ? state
        : GreeterState.fromJson(state);
};
// Helper for getting the expected shape of a request, i.e., either a
// Zod shape or a protobuf instance, from a protobuf shape.
const GreeterCreateRequestFromProtobufShape = (partialRequest) => {
    // TOOD: update `protoToZod()` to actually work from
    // any objects that match the shape, not just protobuf instances,
    // and then we won't need to first call `fromJson()` here.
    const request = partialRequest instanceof greeter_pb.CreateRequest
        ? partialRequest
        : greeter_pb.CreateRequest.fromJson(partialRequest);
    return request;
};
// Helper for getting the expected shape of a request, i.e., either a
// Zod shape or a protobuf instance, from a JSON string.
const GreeterCreateRequestFromJsonString = (jsonRequest) => {
    return GreeterCreateRequestFromProtobufShape(greeter_pb.CreateRequest.fromJsonString(jsonRequest));
};
// Helper for getting the expected shape of a request, i.e., either a
// Zod shape or a protobuf instance, from binary.
const GreeterCreateRequestFromBinary = (bytesRequest) => {
    return GreeterCreateRequestFromProtobufShape(greeter_pb.CreateRequest.fromBinary(bytesRequest));
};
// Helper for getting a protobuf instance for a request from the
// expected shape, i.e., either a Zod shape or a protobuf shape.
const GreeterCreateRequestToProtobuf = (partialRequest) => {
    return partialRequest instanceof greeter_pb.CreateRequest
        ? partialRequest
        : new greeter_pb.CreateRequest(partialRequest);
};
const GreeterCreateResponseFromProtobufShape = (partialResponse) => {
    // TOOD: update `protoToZod()` to actually work from
    // any objects that match the shape, not just protobuf instances,
    // and then we won't need to first call `fromJson()` here.
    const response = partialResponse instanceof greeter_pb.CreateResponse
        ? partialResponse
        : greeter_pb.CreateResponse.fromJson(partialResponse);
    return response;
};
const GreeterCreateResponseToProtobuf = (partialResponse) => {
    return partialResponse instanceof greeter_pb.CreateResponse
        ? partialResponse
        : new greeter_pb.CreateResponse(partialResponse);
};
// Helper for getting the expected shape of a request, i.e., either a
// Zod shape or a protobuf instance, from a protobuf shape.
const GreeterGreetRequestFromProtobufShape = (partialRequest) => {
    // TOOD: update `protoToZod()` to actually work from
    // any objects that match the shape, not just protobuf instances,
    // and then we won't need to first call `fromJson()` here.
    const request = partialRequest instanceof greeter_pb.GreetRequest
        ? partialRequest
        : greeter_pb.GreetRequest.fromJson(partialRequest);
    return request;
};
// Helper for getting the expected shape of a request, i.e., either a
// Zod shape or a protobuf instance, from a JSON string.
const GreeterGreetRequestFromJsonString = (jsonRequest) => {
    return GreeterGreetRequestFromProtobufShape(greeter_pb.GreetRequest.fromJsonString(jsonRequest));
};
// Helper for getting the expected shape of a request, i.e., either a
// Zod shape or a protobuf instance, from binary.
const GreeterGreetRequestFromBinary = (bytesRequest) => {
    return GreeterGreetRequestFromProtobufShape(greeter_pb.GreetRequest.fromBinary(bytesRequest));
};
// Helper for getting a protobuf instance for a request from the
// expected shape, i.e., either a Zod shape or a protobuf shape.
const GreeterGreetRequestToProtobuf = (partialRequest) => {
    return partialRequest instanceof greeter_pb.GreetRequest
        ? partialRequest
        : new greeter_pb.GreetRequest(partialRequest);
};
const GreeterGreetResponseFromProtobufShape = (partialResponse) => {
    // TOOD: update `protoToZod()` to actually work from
    // any objects that match the shape, not just protobuf instances,
    // and then we won't need to first call `fromJson()` here.
    const response = partialResponse instanceof greeter_pb.GreetResponse
        ? partialResponse
        : greeter_pb.GreetResponse.fromJson(partialResponse);
    return response;
};
const GreeterGreetResponseToProtobuf = (partialResponse) => {
    return partialResponse instanceof greeter_pb.GreetResponse
        ? partialResponse
        : new greeter_pb.GreetResponse(partialResponse);
};
// Helper for getting the expected shape of a request, i.e., either a
// Zod shape or a protobuf instance, from a protobuf shape.
const GreeterSetAdjectiveRequestFromProtobufShape = (partialRequest) => {
    // TOOD: update `protoToZod()` to actually work from
    // any objects that match the shape, not just protobuf instances,
    // and then we won't need to first call `fromJson()` here.
    const request = partialRequest instanceof greeter_pb.SetAdjectiveRequest
        ? partialRequest
        : greeter_pb.SetAdjectiveRequest.fromJson(partialRequest);
    return request;
};
// Helper for getting the expected shape of a request, i.e., either a
// Zod shape or a protobuf instance, from a JSON string.
const GreeterSetAdjectiveRequestFromJsonString = (jsonRequest) => {
    return GreeterSetAdjectiveRequestFromProtobufShape(greeter_pb.SetAdjectiveRequest.fromJsonString(jsonRequest));
};
// Helper for getting the expected shape of a request, i.e., either a
// Zod shape or a protobuf instance, from binary.
const GreeterSetAdjectiveRequestFromBinary = (bytesRequest) => {
    return GreeterSetAdjectiveRequestFromProtobufShape(greeter_pb.SetAdjectiveRequest.fromBinary(bytesRequest));
};
// Helper for getting a protobuf instance for a request from the
// expected shape, i.e., either a Zod shape or a protobuf shape.
const GreeterSetAdjectiveRequestToProtobuf = (partialRequest) => {
    return partialRequest instanceof greeter_pb.SetAdjectiveRequest
        ? partialRequest
        : new greeter_pb.SetAdjectiveRequest(partialRequest);
};
const GreeterSetAdjectiveResponseFromProtobufShape = (partialResponse) => {
    // TOOD: update `protoToZod()` to actually work from
    // any objects that match the shape, not just protobuf instances,
    // and then we won't need to first call `fromJson()` here.
    const response = partialResponse instanceof greeter_pb.SetAdjectiveResponse
        ? partialResponse
        : greeter_pb.SetAdjectiveResponse.fromJson(partialResponse);
    return response;
};
const GreeterSetAdjectiveResponseToProtobuf = (partialResponse) => {
    return partialResponse instanceof greeter_pb.SetAdjectiveResponse
        ? partialResponse
        : new greeter_pb.SetAdjectiveResponse(partialResponse);
};
// Helper for getting the expected shape of a request, i.e., either a
// Zod shape or a protobuf instance, from a protobuf shape.
const GreeterTransactionSetAdjectiveRequestFromProtobufShape = (partialRequest) => {
    // TOOD: update `protoToZod()` to actually work from
    // any objects that match the shape, not just protobuf instances,
    // and then we won't need to first call `fromJson()` here.
    const request = partialRequest instanceof greeter_pb.SetAdjectiveRequest
        ? partialRequest
        : greeter_pb.SetAdjectiveRequest.fromJson(partialRequest);
    return request;
};
// Helper for getting the expected shape of a request, i.e., either a
// Zod shape or a protobuf instance, from a JSON string.
const GreeterTransactionSetAdjectiveRequestFromJsonString = (jsonRequest) => {
    return GreeterTransactionSetAdjectiveRequestFromProtobufShape(greeter_pb.SetAdjectiveRequest.fromJsonString(jsonRequest));
};
// Helper for getting the expected shape of a request, i.e., either a
// Zod shape or a protobuf instance, from binary.
const GreeterTransactionSetAdjectiveRequestFromBinary = (bytesRequest) => {
    return GreeterTransactionSetAdjectiveRequestFromProtobufShape(greeter_pb.SetAdjectiveRequest.fromBinary(bytesRequest));
};
// Helper for getting a protobuf instance for a request from the
// expected shape, i.e., either a Zod shape or a protobuf shape.
const GreeterTransactionSetAdjectiveRequestToProtobuf = (partialRequest) => {
    return partialRequest instanceof greeter_pb.SetAdjectiveRequest
        ? partialRequest
        : new greeter_pb.SetAdjectiveRequest(partialRequest);
};
const GreeterTransactionSetAdjectiveResponseFromProtobufShape = (partialResponse) => {
    // TOOD: update `protoToZod()` to actually work from
    // any objects that match the shape, not just protobuf instances,
    // and then we won't need to first call `fromJson()` here.
    const response = partialResponse instanceof greeter_pb.SetAdjectiveResponse
        ? partialResponse
        : greeter_pb.SetAdjectiveResponse.fromJson(partialResponse);
    return response;
};
const GreeterTransactionSetAdjectiveResponseToProtobuf = (partialResponse) => {
    return partialResponse instanceof greeter_pb.SetAdjectiveResponse
        ? partialResponse
        : new greeter_pb.SetAdjectiveResponse(partialResponse);
};
// Helper for getting the expected shape of a request, i.e., either a
// Zod shape or a protobuf instance, from a protobuf shape.
const GreeterTryToConstructContextRequestFromProtobufShape = (partialRequest) => {
    // TOOD: update `protoToZod()` to actually work from
    // any objects that match the shape, not just protobuf instances,
    // and then we won't need to first call `fromJson()` here.
    const request = partialRequest instanceof Empty
        ? partialRequest
        : Empty.fromJson(partialRequest);
    return request;
};
// Helper for getting the expected shape of a request, i.e., either a
// Zod shape or a protobuf instance, from a JSON string.
const GreeterTryToConstructContextRequestFromJsonString = (jsonRequest) => {
    return GreeterTryToConstructContextRequestFromProtobufShape(Empty.fromJsonString(jsonRequest));
};
// Helper for getting the expected shape of a request, i.e., either a
// Zod shape or a protobuf instance, from binary.
const GreeterTryToConstructContextRequestFromBinary = (bytesRequest) => {
    return GreeterTryToConstructContextRequestFromProtobufShape(Empty.fromBinary(bytesRequest));
};
// Helper for getting a protobuf instance for a request from the
// expected shape, i.e., either a Zod shape or a protobuf shape.
const GreeterTryToConstructContextRequestToProtobuf = (partialRequest) => {
    return partialRequest instanceof Empty
        ? partialRequest
        : new Empty(partialRequest);
};
const GreeterTryToConstructContextResponseFromProtobufShape = (partialResponse) => {
    // TOOD: update `protoToZod()` to actually work from
    // any objects that match the shape, not just protobuf instances,
    // and then we won't need to first call `fromJson()` here.
    const response = partialResponse instanceof Empty
        ? partialResponse
        : Empty.fromJson(partialResponse);
    return response;
};
const GreeterTryToConstructContextResponseToProtobuf = (partialResponse) => {
    return partialResponse instanceof Empty
        ? partialResponse
        : new Empty(partialResponse);
};
// Helper for getting the expected shape of a request, i.e., either a
// Zod shape or a protobuf instance, from a protobuf shape.
const GreeterTryToConstructExternalContextRequestFromProtobufShape = (partialRequest) => {
    // TOOD: update `protoToZod()` to actually work from
    // any objects that match the shape, not just protobuf instances,
    // and then we won't need to first call `fromJson()` here.
    const request = partialRequest instanceof Empty
        ? partialRequest
        : Empty.fromJson(partialRequest);
    return request;
};
// Helper for getting the expected shape of a request, i.e., either a
// Zod shape or a protobuf instance, from a JSON string.
const GreeterTryToConstructExternalContextRequestFromJsonString = (jsonRequest) => {
    return GreeterTryToConstructExternalContextRequestFromProtobufShape(Empty.fromJsonString(jsonRequest));
};
// Helper for getting the expected shape of a request, i.e., either a
// Zod shape or a protobuf instance, from binary.
const GreeterTryToConstructExternalContextRequestFromBinary = (bytesRequest) => {
    return GreeterTryToConstructExternalContextRequestFromProtobufShape(Empty.fromBinary(bytesRequest));
};
// Helper for getting a protobuf instance for a request from the
// expected shape, i.e., either a Zod shape or a protobuf shape.
const GreeterTryToConstructExternalContextRequestToProtobuf = (partialRequest) => {
    return partialRequest instanceof Empty
        ? partialRequest
        : new Empty(partialRequest);
};
const GreeterTryToConstructExternalContextResponseFromProtobufShape = (partialResponse) => {
    // TOOD: update `protoToZod()` to actually work from
    // any objects that match the shape, not just protobuf instances,
    // and then we won't need to first call `fromJson()` here.
    const response = partialResponse instanceof Empty
        ? partialResponse
        : Empty.fromJson(partialResponse);
    return response;
};
const GreeterTryToConstructExternalContextResponseToProtobuf = (partialResponse) => {
    return partialResponse instanceof Empty
        ? partialResponse
        : new Empty(partialResponse);
};
// Helper for getting the expected shape of a request, i.e., either a
// Zod shape or a protobuf instance, from a protobuf shape.
const GreeterTestLongRunningFetchRequestFromProtobufShape = (partialRequest) => {
    // TOOD: update `protoToZod()` to actually work from
    // any objects that match the shape, not just protobuf instances,
    // and then we won't need to first call `fromJson()` here.
    const request = partialRequest instanceof greeter_pb.TestLongRunningFetchRequest
        ? partialRequest
        : greeter_pb.TestLongRunningFetchRequest.fromJson(partialRequest);
    return request;
};
// Helper for getting the expected shape of a request, i.e., either a
// Zod shape or a protobuf instance, from a JSON string.
const GreeterTestLongRunningFetchRequestFromJsonString = (jsonRequest) => {
    return GreeterTestLongRunningFetchRequestFromProtobufShape(greeter_pb.TestLongRunningFetchRequest.fromJsonString(jsonRequest));
};
// Helper for getting the expected shape of a request, i.e., either a
// Zod shape or a protobuf instance, from binary.
const GreeterTestLongRunningFetchRequestFromBinary = (bytesRequest) => {
    return GreeterTestLongRunningFetchRequestFromProtobufShape(greeter_pb.TestLongRunningFetchRequest.fromBinary(bytesRequest));
};
// Helper for getting a protobuf instance for a request from the
// expected shape, i.e., either a Zod shape or a protobuf shape.
const GreeterTestLongRunningFetchRequestToProtobuf = (partialRequest) => {
    return partialRequest instanceof greeter_pb.TestLongRunningFetchRequest
        ? partialRequest
        : new greeter_pb.TestLongRunningFetchRequest(partialRequest);
};
const GreeterTestLongRunningFetchResponseFromProtobufShape = (partialResponse) => {
    // TOOD: update `protoToZod()` to actually work from
    // any objects that match the shape, not just protobuf instances,
    // and then we won't need to first call `fromJson()` here.
    const response = partialResponse instanceof Empty
        ? partialResponse
        : Empty.fromJson(partialResponse);
    return response;
};
const GreeterTestLongRunningFetchResponseToProtobuf = (partialResponse) => {
    return partialResponse instanceof Empty
        ? partialResponse
        : new Empty(partialResponse);
};
// Helper for getting the expected shape of a request, i.e., either a
// Zod shape or a protobuf instance, from a protobuf shape.
const GreeterTestLongRunningWriterRequestFromProtobufShape = (partialRequest) => {
    // TOOD: update `protoToZod()` to actually work from
    // any objects that match the shape, not just protobuf instances,
    // and then we won't need to first call `fromJson()` here.
    const request = partialRequest instanceof Empty
        ? partialRequest
        : Empty.fromJson(partialRequest);
    return request;
};
// Helper for getting the expected shape of a request, i.e., either a
// Zod shape or a protobuf instance, from a JSON string.
const GreeterTestLongRunningWriterRequestFromJsonString = (jsonRequest) => {
    return GreeterTestLongRunningWriterRequestFromProtobufShape(Empty.fromJsonString(jsonRequest));
};
// Helper for getting the expected shape of a request, i.e., either a
// Zod shape or a protobuf instance, from binary.
const GreeterTestLongRunningWriterRequestFromBinary = (bytesRequest) => {
    return GreeterTestLongRunningWriterRequestFromProtobufShape(Empty.fromBinary(bytesRequest));
};
// Helper for getting a protobuf instance for a request from the
// expected shape, i.e., either a Zod shape or a protobuf shape.
const GreeterTestLongRunningWriterRequestToProtobuf = (partialRequest) => {
    return partialRequest instanceof Empty
        ? partialRequest
        : new Empty(partialRequest);
};
const GreeterTestLongRunningWriterResponseFromProtobufShape = (partialResponse) => {
    // TOOD: update `protoToZod()` to actually work from
    // any objects that match the shape, not just protobuf instances,
    // and then we won't need to first call `fromJson()` here.
    const response = partialResponse instanceof Empty
        ? partialResponse
        : Empty.fromJson(partialResponse);
    return response;
};
const GreeterTestLongRunningWriterResponseToProtobuf = (partialResponse) => {
    return partialResponse instanceof Empty
        ? partialResponse
        : new Empty(partialResponse);
};
// Helper for getting the expected shape of a request, i.e., either a
// Zod shape or a protobuf instance, from a protobuf shape.
const GreeterGetWholeStateRequestFromProtobufShape = (partialRequest) => {
    // TOOD: update `protoToZod()` to actually work from
    // any objects that match the shape, not just protobuf instances,
    // and then we won't need to first call `fromJson()` here.
    const request = partialRequest instanceof greeter_pb.GetWholeStateRequest
        ? partialRequest
        : greeter_pb.GetWholeStateRequest.fromJson(partialRequest);
    return request;
};
// Helper for getting the expected shape of a request, i.e., either a
// Zod shape or a protobuf instance, from a JSON string.
const GreeterGetWholeStateRequestFromJsonString = (jsonRequest) => {
    return GreeterGetWholeStateRequestFromProtobufShape(greeter_pb.GetWholeStateRequest.fromJsonString(jsonRequest));
};
// Helper for getting the expected shape of a request, i.e., either a
// Zod shape or a protobuf instance, from binary.
const GreeterGetWholeStateRequestFromBinary = (bytesRequest) => {
    return GreeterGetWholeStateRequestFromProtobufShape(greeter_pb.GetWholeStateRequest.fromBinary(bytesRequest));
};
// Helper for getting a protobuf instance for a request from the
// expected shape, i.e., either a Zod shape or a protobuf shape.
const GreeterGetWholeStateRequestToProtobuf = (partialRequest) => {
    return partialRequest instanceof greeter_pb.GetWholeStateRequest
        ? partialRequest
        : new greeter_pb.GetWholeStateRequest(partialRequest);
};
const GreeterGetWholeStateResponseFromProtobufShape = (partialResponse) => {
    // TOOD: update `protoToZod()` to actually work from
    // any objects that match the shape, not just protobuf instances,
    // and then we won't need to first call `fromJson()` here.
    const response = partialResponse instanceof GreeterProto
        ? partialResponse
        : GreeterProto.fromJson(partialResponse);
    return response;
};
const GreeterGetWholeStateResponseToProtobuf = (partialResponse) => {
    return partialResponse instanceof GreeterProto
        ? partialResponse
        : new GreeterProto(partialResponse);
};
// Helper for getting the expected shape of a request, i.e., either a
// Zod shape or a protobuf instance, from a protobuf shape.
const GreeterFailWithExceptionRequestFromProtobufShape = (partialRequest) => {
    // TOOD: update `protoToZod()` to actually work from
    // any objects that match the shape, not just protobuf instances,
    // and then we won't need to first call `fromJson()` here.
    const request = partialRequest instanceof Empty
        ? partialRequest
        : Empty.fromJson(partialRequest);
    return request;
};
// Helper for getting the expected shape of a request, i.e., either a
// Zod shape or a protobuf instance, from a JSON string.
const GreeterFailWithExceptionRequestFromJsonString = (jsonRequest) => {
    return GreeterFailWithExceptionRequestFromProtobufShape(Empty.fromJsonString(jsonRequest));
};
// Helper for getting the expected shape of a request, i.e., either a
// Zod shape or a protobuf instance, from binary.
const GreeterFailWithExceptionRequestFromBinary = (bytesRequest) => {
    return GreeterFailWithExceptionRequestFromProtobufShape(Empty.fromBinary(bytesRequest));
};
// Helper for getting a protobuf instance for a request from the
// expected shape, i.e., either a Zod shape or a protobuf shape.
const GreeterFailWithExceptionRequestToProtobuf = (partialRequest) => {
    return partialRequest instanceof Empty
        ? partialRequest
        : new Empty(partialRequest);
};
const GreeterFailWithExceptionResponseFromProtobufShape = (partialResponse) => {
    // TOOD: update `protoToZod()` to actually work from
    // any objects that match the shape, not just protobuf instances,
    // and then we won't need to first call `fromJson()` here.
    const response = partialResponse instanceof Empty
        ? partialResponse
        : Empty.fromJson(partialResponse);
    return response;
};
const GreeterFailWithExceptionResponseToProtobuf = (partialResponse) => {
    return partialResponse instanceof Empty
        ? partialResponse
        : new Empty(partialResponse);
};
// Helper for getting the expected shape of a request, i.e., either a
// Zod shape or a protobuf instance, from a protobuf shape.
const GreeterFailWithAbortedRequestFromProtobufShape = (partialRequest) => {
    // TOOD: update `protoToZod()` to actually work from
    // any objects that match the shape, not just protobuf instances,
    // and then we won't need to first call `fromJson()` here.
    const request = partialRequest instanceof Empty
        ? partialRequest
        : Empty.fromJson(partialRequest);
    return request;
};
// Helper for getting the expected shape of a request, i.e., either a
// Zod shape or a protobuf instance, from a JSON string.
const GreeterFailWithAbortedRequestFromJsonString = (jsonRequest) => {
    return GreeterFailWithAbortedRequestFromProtobufShape(Empty.fromJsonString(jsonRequest));
};
// Helper for getting the expected shape of a request, i.e., either a
// Zod shape or a protobuf instance, from binary.
const GreeterFailWithAbortedRequestFromBinary = (bytesRequest) => {
    return GreeterFailWithAbortedRequestFromProtobufShape(Empty.fromBinary(bytesRequest));
};
// Helper for getting a protobuf instance for a request from the
// expected shape, i.e., either a Zod shape or a protobuf shape.
const GreeterFailWithAbortedRequestToProtobuf = (partialRequest) => {
    return partialRequest instanceof Empty
        ? partialRequest
        : new Empty(partialRequest);
};
const GreeterFailWithAbortedResponseFromProtobufShape = (partialResponse) => {
    // TOOD: update `protoToZod()` to actually work from
    // any objects that match the shape, not just protobuf instances,
    // and then we won't need to first call `fromJson()` here.
    const response = partialResponse instanceof Empty
        ? partialResponse
        : Empty.fromJson(partialResponse);
    return response;
};
const GreeterFailWithAbortedResponseToProtobuf = (partialResponse) => {
    return partialResponse instanceof Empty
        ? partialResponse
        : new Empty(partialResponse);
};
// Helper for getting the expected shape of a request, i.e., either a
// Zod shape or a protobuf instance, from a protobuf shape.
const GreeterWorkflowRequestFromProtobufShape = (partialRequest) => {
    // TOOD: update `protoToZod()` to actually work from
    // any objects that match the shape, not just protobuf instances,
    // and then we won't need to first call `fromJson()` here.
    const request = partialRequest instanceof Empty
        ? partialRequest
        : Empty.fromJson(partialRequest);
    return request;
};
// Helper for getting the expected shape of a request, i.e., either a
// Zod shape or a protobuf instance, from a JSON string.
const GreeterWorkflowRequestFromJsonString = (jsonRequest) => {
    return GreeterWorkflowRequestFromProtobufShape(Empty.fromJsonString(jsonRequest));
};
// Helper for getting the expected shape of a request, i.e., either a
// Zod shape or a protobuf instance, from binary.
const GreeterWorkflowRequestFromBinary = (bytesRequest) => {
    return GreeterWorkflowRequestFromProtobufShape(Empty.fromBinary(bytesRequest));
};
// Helper for getting a protobuf instance for a request from the
// expected shape, i.e., either a Zod shape or a protobuf shape.
const GreeterWorkflowRequestToProtobuf = (partialRequest) => {
    return partialRequest instanceof Empty
        ? partialRequest
        : new Empty(partialRequest);
};
const GreeterWorkflowResponseFromProtobufShape = (partialResponse) => {
    // TOOD: update `protoToZod()` to actually work from
    // any objects that match the shape, not just protobuf instances,
    // and then we won't need to first call `fromJson()` here.
    const response = partialResponse instanceof greeter_pb.WorkflowResponse
        ? partialResponse
        : greeter_pb.WorkflowResponse.fromJson(partialResponse);
    return response;
};
const GreeterWorkflowResponseToProtobuf = (partialResponse) => {
    return partialResponse instanceof greeter_pb.WorkflowResponse
        ? partialResponse
        : new greeter_pb.WorkflowResponse(partialResponse);
};
// Helper for getting the expected shape of a request, i.e., either a
// Zod shape or a protobuf instance, from a protobuf shape.
const GreeterDangerousFieldsRequestFromProtobufShape = (partialRequest) => {
    // TOOD: update `protoToZod()` to actually work from
    // any objects that match the shape, not just protobuf instances,
    // and then we won't need to first call `fromJson()` here.
    const request = partialRequest instanceof greeter_pb.DangerousFieldsRequest
        ? partialRequest
        : greeter_pb.DangerousFieldsRequest.fromJson(partialRequest);
    return request;
};
// Helper for getting the expected shape of a request, i.e., either a
// Zod shape or a protobuf instance, from a JSON string.
const GreeterDangerousFieldsRequestFromJsonString = (jsonRequest) => {
    return GreeterDangerousFieldsRequestFromProtobufShape(greeter_pb.DangerousFieldsRequest.fromJsonString(jsonRequest));
};
// Helper for getting the expected shape of a request, i.e., either a
// Zod shape or a protobuf instance, from binary.
const GreeterDangerousFieldsRequestFromBinary = (bytesRequest) => {
    return GreeterDangerousFieldsRequestFromProtobufShape(greeter_pb.DangerousFieldsRequest.fromBinary(bytesRequest));
};
// Helper for getting a protobuf instance for a request from the
// expected shape, i.e., either a Zod shape or a protobuf shape.
const GreeterDangerousFieldsRequestToProtobuf = (partialRequest) => {
    return partialRequest instanceof greeter_pb.DangerousFieldsRequest
        ? partialRequest
        : new greeter_pb.DangerousFieldsRequest(partialRequest);
};
const GreeterDangerousFieldsResponseFromProtobufShape = (partialResponse) => {
    // TOOD: update `protoToZod()` to actually work from
    // any objects that match the shape, not just protobuf instances,
    // and then we won't need to first call `fromJson()` here.
    const response = partialResponse instanceof Empty
        ? partialResponse
        : Empty.fromJson(partialResponse);
    return response;
};
const GreeterDangerousFieldsResponseToProtobuf = (partialResponse) => {
    return partialResponse instanceof Empty
        ? partialResponse
        : new Empty(partialResponse);
};
// Helper for getting the expected shape of a request, i.e., either a
// Zod shape or a protobuf instance, from a protobuf shape.
const GreeterStoreRecursiveMessageRequestFromProtobufShape = (partialRequest) => {
    // TOOD: update `protoToZod()` to actually work from
    // any objects that match the shape, not just protobuf instances,
    // and then we won't need to first call `fromJson()` here.
    const request = partialRequest instanceof greeter_pb.StoreRecursiveMessageRequest
        ? partialRequest
        : greeter_pb.StoreRecursiveMessageRequest.fromJson(partialRequest);
    return request;
};
// Helper for getting the expected shape of a request, i.e., either a
// Zod shape or a protobuf instance, from a JSON string.
const GreeterStoreRecursiveMessageRequestFromJsonString = (jsonRequest) => {
    return GreeterStoreRecursiveMessageRequestFromProtobufShape(greeter_pb.StoreRecursiveMessageRequest.fromJsonString(jsonRequest));
};
// Helper for getting the expected shape of a request, i.e., either a
// Zod shape or a protobuf instance, from binary.
const GreeterStoreRecursiveMessageRequestFromBinary = (bytesRequest) => {
    return GreeterStoreRecursiveMessageRequestFromProtobufShape(greeter_pb.StoreRecursiveMessageRequest.fromBinary(bytesRequest));
};
// Helper for getting a protobuf instance for a request from the
// expected shape, i.e., either a Zod shape or a protobuf shape.
const GreeterStoreRecursiveMessageRequestToProtobuf = (partialRequest) => {
    return partialRequest instanceof greeter_pb.StoreRecursiveMessageRequest
        ? partialRequest
        : new greeter_pb.StoreRecursiveMessageRequest(partialRequest);
};
const GreeterStoreRecursiveMessageResponseFromProtobufShape = (partialResponse) => {
    // TOOD: update `protoToZod()` to actually work from
    // any objects that match the shape, not just protobuf instances,
    // and then we won't need to first call `fromJson()` here.
    const response = partialResponse instanceof greeter_pb.StoreRecursiveMessageResponse
        ? partialResponse
        : greeter_pb.StoreRecursiveMessageResponse.fromJson(partialResponse);
    return response;
};
const GreeterStoreRecursiveMessageResponseToProtobuf = (partialResponse) => {
    return partialResponse instanceof greeter_pb.StoreRecursiveMessageResponse
        ? partialResponse
        : new greeter_pb.StoreRecursiveMessageResponse(partialResponse);
};
// Helper for getting the expected shape of a request, i.e., either a
// Zod shape or a protobuf instance, from a protobuf shape.
const GreeterReadRecursiveMessageRequestFromProtobufShape = (partialRequest) => {
    // TOOD: update `protoToZod()` to actually work from
    // any objects that match the shape, not just protobuf instances,
    // and then we won't need to first call `fromJson()` here.
    const request = partialRequest instanceof greeter_pb.ReadRecursiveMessageRequest
        ? partialRequest
        : greeter_pb.ReadRecursiveMessageRequest.fromJson(partialRequest);
    return request;
};
// Helper for getting the expected shape of a request, i.e., either a
// Zod shape or a protobuf instance, from a JSON string.
const GreeterReadRecursiveMessageRequestFromJsonString = (jsonRequest) => {
    return GreeterReadRecursiveMessageRequestFromProtobufShape(greeter_pb.ReadRecursiveMessageRequest.fromJsonString(jsonRequest));
};
// Helper for getting the expected shape of a request, i.e., either a
// Zod shape or a protobuf instance, from binary.
const GreeterReadRecursiveMessageRequestFromBinary = (bytesRequest) => {
    return GreeterReadRecursiveMessageRequestFromProtobufShape(greeter_pb.ReadRecursiveMessageRequest.fromBinary(bytesRequest));
};
// Helper for getting a protobuf instance for a request from the
// expected shape, i.e., either a Zod shape or a protobuf shape.
const GreeterReadRecursiveMessageRequestToProtobuf = (partialRequest) => {
    return partialRequest instanceof greeter_pb.ReadRecursiveMessageRequest
        ? partialRequest
        : new greeter_pb.ReadRecursiveMessageRequest(partialRequest);
};
const GreeterReadRecursiveMessageResponseFromProtobufShape = (partialResponse) => {
    // TOOD: update `protoToZod()` to actually work from
    // any objects that match the shape, not just protobuf instances,
    // and then we won't need to first call `fromJson()` here.
    const response = partialResponse instanceof greeter_pb.ReadRecursiveMessageResponse
        ? partialResponse
        : greeter_pb.ReadRecursiveMessageResponse.fromJson(partialResponse);
    return response;
};
const GreeterReadRecursiveMessageResponseToProtobuf = (partialResponse) => {
    return partialResponse instanceof greeter_pb.ReadRecursiveMessageResponse
        ? partialResponse
        : new greeter_pb.ReadRecursiveMessageResponse(partialResponse);
};
// Helper for getting the expected shape of a request, i.e., either a
// Zod shape or a protobuf instance, from a protobuf shape.
const GreeterConstructAndStoreRecursiveMessageRequestFromProtobufShape = (partialRequest) => {
    // TOOD: update `protoToZod()` to actually work from
    // any objects that match the shape, not just protobuf instances,
    // and then we won't need to first call `fromJson()` here.
    const request = partialRequest instanceof greeter_pb.ConstructAndStoreRecursiveMessageRequest
        ? partialRequest
        : greeter_pb.ConstructAndStoreRecursiveMessageRequest.fromJson(partialRequest);
    return request;
};
// Helper for getting the expected shape of a request, i.e., either a
// Zod shape or a protobuf instance, from a JSON string.
const GreeterConstructAndStoreRecursiveMessageRequestFromJsonString = (jsonRequest) => {
    return GreeterConstructAndStoreRecursiveMessageRequestFromProtobufShape(greeter_pb.ConstructAndStoreRecursiveMessageRequest.fromJsonString(jsonRequest));
};
// Helper for getting the expected shape of a request, i.e., either a
// Zod shape or a protobuf instance, from binary.
const GreeterConstructAndStoreRecursiveMessageRequestFromBinary = (bytesRequest) => {
    return GreeterConstructAndStoreRecursiveMessageRequestFromProtobufShape(greeter_pb.ConstructAndStoreRecursiveMessageRequest.fromBinary(bytesRequest));
};
// Helper for getting a protobuf instance for a request from the
// expected shape, i.e., either a Zod shape or a protobuf shape.
const GreeterConstructAndStoreRecursiveMessageRequestToProtobuf = (partialRequest) => {
    return partialRequest instanceof greeter_pb.ConstructAndStoreRecursiveMessageRequest
        ? partialRequest
        : new greeter_pb.ConstructAndStoreRecursiveMessageRequest(partialRequest);
};
const GreeterConstructAndStoreRecursiveMessageResponseFromProtobufShape = (partialResponse) => {
    // TOOD: update `protoToZod()` to actually work from
    // any objects that match the shape, not just protobuf instances,
    // and then we won't need to first call `fromJson()` here.
    const response = partialResponse instanceof greeter_pb.ConstructAndStoreRecursiveMessageResponse
        ? partialResponse
        : greeter_pb.ConstructAndStoreRecursiveMessageResponse.fromJson(partialResponse);
    return response;
};
const GreeterConstructAndStoreRecursiveMessageResponseToProtobuf = (partialResponse) => {
    return partialResponse instanceof greeter_pb.ConstructAndStoreRecursiveMessageResponse
        ? partialResponse
        : new greeter_pb.ConstructAndStoreRecursiveMessageResponse(partialResponse);
};
const GREETER_CREATE_ERROR_TYPES = [
    ...ERROR_TYPES,
    // Method errors.
]; // Need `as const` to ensure TypeScript infers this as a tuple!
const GREETER_GREET_ERROR_TYPES = [
    ...ERROR_TYPES,
    // Method errors.
]; // Need `as const` to ensure TypeScript infers this as a tuple!
const GREETER_SET_ADJECTIVE_ERROR_TYPES = [
    ...ERROR_TYPES,
    // Method errors.
]; // Need `as const` to ensure TypeScript infers this as a tuple!
const GREETER_TRANSACTION_SET_ADJECTIVE_ERROR_TYPES = [
    ...ERROR_TYPES,
    // Method errors.
]; // Need `as const` to ensure TypeScript infers this as a tuple!
const GREETER_TRY_TO_CONSTRUCT_CONTEXT_ERROR_TYPES = [
    ...ERROR_TYPES,
    // Method errors.
]; // Need `as const` to ensure TypeScript infers this as a tuple!
const GREETER_TRY_TO_CONSTRUCT_EXTERNAL_CONTEXT_ERROR_TYPES = [
    ...ERROR_TYPES,
    // Method errors.
]; // Need `as const` to ensure TypeScript infers this as a tuple!
const GREETER_TEST_LONG_RUNNING_FETCH_ERROR_TYPES = [
    ...ERROR_TYPES,
    // Method errors.
]; // Need `as const` to ensure TypeScript infers this as a tuple!
const GREETER_TEST_LONG_RUNNING_WRITER_ERROR_TYPES = [
    ...ERROR_TYPES,
    // Method errors.
]; // Need `as const` to ensure TypeScript infers this as a tuple!
const GREETER_GET_WHOLE_STATE_ERROR_TYPES = [
    ...ERROR_TYPES,
    // Method errors.
]; // Need `as const` to ensure TypeScript infers this as a tuple!
const GREETER_FAIL_WITH_EXCEPTION_ERROR_TYPES = [
    ...ERROR_TYPES,
    // Method errors.
]; // Need `as const` to ensure TypeScript infers this as a tuple!
const GREETER_FAIL_WITH_ABORTED_ERROR_TYPES = [
    ...ERROR_TYPES,
    // Method errors.
    greeter_pb.ErrorWithValue,
]; // Need `as const` to ensure TypeScript infers this as a tuple!
const GREETER_WORKFLOW_ERROR_TYPES = [
    ...ERROR_TYPES,
    // Method errors.
    greeter_pb.ErrorWithValue,
]; // Need `as const` to ensure TypeScript infers this as a tuple!
const GREETER_DANGEROUS_FIELDS_ERROR_TYPES = [
    ...ERROR_TYPES,
    // Method errors.
]; // Need `as const` to ensure TypeScript infers this as a tuple!
const GREETER_STORE_RECURSIVE_MESSAGE_ERROR_TYPES = [
    ...ERROR_TYPES,
    // Method errors.
]; // Need `as const` to ensure TypeScript infers this as a tuple!
const GREETER_READ_RECURSIVE_MESSAGE_ERROR_TYPES = [
    ...ERROR_TYPES,
    // Method errors.
]; // Need `as const` to ensure TypeScript infers this as a tuple!
const GREETER_CONSTRUCT_AND_STORE_RECURSIVE_MESSAGE_ERROR_TYPES = [
    ...ERROR_TYPES,
    // Method errors.
]; // Need `as const` to ensure TypeScript infers this as a tuple!
export class GreeterBaseServicer extends reboot.Servicer {
    constructor() {
        super();
        // External reference to the native `Servicer`.
        _GreeterBaseServicer_external.set(this, void 0);
        const staticWorkflow = this.constructor.workflow;
        const instanceWorkflow = this.workflow;
        if (staticWorkflow === undefined && instanceWorkflow === undefined) {
            throw new Error(`\`Greeter\` servicer is missing implementation of static \`workflow\` method.`);
        }
        else if (staticWorkflow !== undefined && instanceWorkflow !== undefined) {
            throw new Error(`\`Greeter\` servicer has both static and instance implementations of \`workflow\` method.
        \nPlease implement the static version only.`);
        }
        else if (instanceWorkflow !== undefined) {
            console.warn(`Using instance method for \`Greeter.workflow\` is deprecated and will be removed in a future version. Please use a static method instead.`);
        }
    }
    ref(options) {
        const context = reboot.getContext();
        return new Greeter.WeakReference(context.stateId, options?.bearerToken, this);
    }
    static servicer(literal) {
        return class extends GreeterSingletonServicer {
            authorizer() {
                if (literal.authorizer !== undefined) {
                    return literal.authorizer();
                }
                return super.authorizer();
            }
            async create(context, state, request) {
                const [updatedState, response] = await literal.create(context, state, request);
                Object.assign(state, updatedState);
                return response;
            }
            async greet(context, state, request) {
                return await literal.greet(context, state, request);
            }
            async setAdjective(context, state, request) {
                const [updatedState, response] = await literal.setAdjective(context, state, request);
                Object.assign(state, updatedState);
                return response;
            }
            async transactionSetAdjective(context, state, request) {
                const [updatedState, response] = await literal.transactionSetAdjective(context, state, request);
                Object.assign(state, updatedState);
                return response;
            }
            async tryToConstructContext(context, state, request) {
                return await literal.tryToConstructContext(context, state, request);
            }
            async tryToConstructExternalContext(context, state, request) {
                return await literal.tryToConstructExternalContext(context, state, request);
            }
            async testLongRunningFetch(context, state, request) {
                return await literal.testLongRunningFetch(context, state, request);
            }
            async testLongRunningWriter(context, state, request) {
                const [updatedState, response] = await literal.testLongRunningWriter(context, state, request);
                Object.assign(state, updatedState);
                return response;
            }
            async getWholeState(context, state, request) {
                return await literal.getWholeState(context, state, request);
            }
            async failWithException(context, state, request) {
                return await literal.failWithException(context, state, request);
            }
            async failWithAborted(context, state, request) {
                return await literal.failWithAborted(context, state, request);
            }
            static async workflow(context, request) {
                return await GreeterBaseServicer.__servicer__.run({ servicer: this }, async () => {
                    return await literal.workflow(context, request);
                });
            }
            async dangerousFields(context, state, request) {
                const [updatedState, response] = await literal.dangerousFields(context, state, request);
                Object.assign(state, updatedState);
                return response;
            }
            async storeRecursiveMessage(context, state, request) {
                const [updatedState, response] = await literal.storeRecursiveMessage(context, state, request);
                Object.assign(state, updatedState);
                return response;
            }
            async readRecursiveMessage(context, state, request) {
                return await literal.readRecursiveMessage(context, state, request);
            }
            async constructAndStoreRecursiveMessage(context, state, request) {
                const [updatedState, response] = await literal.constructAndStoreRecursiveMessage(context, state, request);
                Object.assign(state, updatedState);
                return response;
            }
        };
    }
    async _Create(context, bytesState, // `undefined` for a workflow.
    bytesRequest) {
        try {
            statesBeingConstructed.add(context.stateId);
            let state = GreeterFromBinary(bytesState, 
            // Don't validate if we're constructing because non-optional
            // fields that this method might be setting will be invalid.
            { validate: !(statesBeingConstructed.has(context.stateId)) });
            if (ongoingTransactionStateKey(context) in ongoingTransactionStates) {
                state = ongoingTransactionStates[ongoingTransactionStateKey(context)].clone();
            }
            const request = GreeterCreateRequestFromBinary(bytesRequest);
            let partialResponse = await reboot.runWithContext(context, () => {
                return this.__Create(context, state, request);
            });
            const response = GreeterCreateResponseToProtobuf(partialResponse);
            // TODO: it's premature to overwrite the state now given that the
            // writer might still "fail" and an error will get propagated back
            // to the ongoing transaction which will still see the effects of
            // this writer. What we should be doing instead is creating a
            // callback API that we invoke only after a writer completes
            // that lets us update the state _reference_ then.
            if (ongoingTransactionStateKey(context) in ongoingTransactionStates) {
                ongoingTransactionStates[ongoingTransactionStateKey(context)].copyFrom(state);
            }
            const result = new reboot_api.nodejs_pb.TrampolineResult();
            result.state = state.toBinary();
            result.response = response.toBinary();
            return result.toBinary();
        }
        catch (e) {
            if (e instanceof reboot_api.Aborted) {
                return reboot_api.nodejs_pb.TrampolineResult.fromJson({
                    status_json: e.toStatus().toJsonString()
                }).toBinary();
            }
            // Ensure we have an `Error` and then `console.error()` it so
            // that developers see a stack trace of what is going on.
            //
            // Only do this if it IS NOT an `Aborted` which we handle above.
            const error = ensureError(e);
            // Write an empty message which includes a newline to make it
            // easier to identify the stack trace.
            console.error("");
            console.error(error);
            console.error("");
            console.error(`Unhandled error in 'tests.reboot.Greeter.create'; propagating as 'Unknown'\n`);
            throw error;
        }
        finally {
            statesBeingConstructed.delete(context.stateId);
        }
    }
    async _Greet(context, bytesState, // `undefined` for a workflow.
    bytesRequest) {
        try {
            let state = GreeterFromBinary(bytesState, 
            // Don't validate if we're constructing because non-optional
            // fields that this method might be setting will be invalid.
            { validate: !(statesBeingConstructed.has(context.stateId)) });
            if (ongoingTransactionStateKey(context) in ongoingTransactionStates) {
                state = ongoingTransactionStates[ongoingTransactionStateKey(context)].clone();
            }
            const request = GreeterGreetRequestFromBinary(bytesRequest);
            let partialResponse = await reboot.runWithContext(context, () => {
                return this.__Greet(context, state, request);
            });
            const response = GreeterGreetResponseToProtobuf(partialResponse);
            const result = new reboot_api.nodejs_pb.TrampolineResult();
            result.response = response.toBinary();
            return result.toBinary();
        }
        catch (e) {
            if (e instanceof reboot_api.Aborted) {
                return reboot_api.nodejs_pb.TrampolineResult.fromJson({
                    status_json: e.toStatus().toJsonString()
                }).toBinary();
            }
            // Ensure we have an `Error` and then `console.error()` it so
            // that developers see a stack trace of what is going on.
            //
            // Only do this if it IS NOT an `Aborted` which we handle above.
            const error = ensureError(e);
            // Write an empty message which includes a newline to make it
            // easier to identify the stack trace.
            console.error("");
            console.error(error);
            console.error("");
            console.error(`Unhandled error in 'tests.reboot.Greeter.greet'; propagating as 'Unknown'\n`);
            throw error;
        }
        finally {
        }
    }
    async _SetAdjective(context, bytesState, // `undefined` for a workflow.
    bytesRequest) {
        try {
            let state = GreeterFromBinary(bytesState, 
            // Don't validate if we're constructing because non-optional
            // fields that this method might be setting will be invalid.
            { validate: !(statesBeingConstructed.has(context.stateId)) });
            if (ongoingTransactionStateKey(context) in ongoingTransactionStates) {
                state = ongoingTransactionStates[ongoingTransactionStateKey(context)].clone();
            }
            const request = GreeterSetAdjectiveRequestFromBinary(bytesRequest);
            let partialResponse = await reboot.runWithContext(context, () => {
                return this.__SetAdjective(context, state, request);
            });
            const response = GreeterSetAdjectiveResponseToProtobuf(partialResponse);
            // TODO: it's premature to overwrite the state now given that the
            // writer might still "fail" and an error will get propagated back
            // to the ongoing transaction which will still see the effects of
            // this writer. What we should be doing instead is creating a
            // callback API that we invoke only after a writer completes
            // that lets us update the state _reference_ then.
            if (ongoingTransactionStateKey(context) in ongoingTransactionStates) {
                ongoingTransactionStates[ongoingTransactionStateKey(context)].copyFrom(state);
            }
            const result = new reboot_api.nodejs_pb.TrampolineResult();
            result.state = state.toBinary();
            result.response = response.toBinary();
            return result.toBinary();
        }
        catch (e) {
            if (e instanceof reboot_api.Aborted) {
                return reboot_api.nodejs_pb.TrampolineResult.fromJson({
                    status_json: e.toStatus().toJsonString()
                }).toBinary();
            }
            // Ensure we have an `Error` and then `console.error()` it so
            // that developers see a stack trace of what is going on.
            //
            // Only do this if it IS NOT an `Aborted` which we handle above.
            const error = ensureError(e);
            // Write an empty message which includes a newline to make it
            // easier to identify the stack trace.
            console.error("");
            console.error(error);
            console.error("");
            console.error(`Unhandled error in 'tests.reboot.Greeter.setAdjective'; propagating as 'Unknown'\n`);
            throw error;
        }
        finally {
        }
    }
    async _TransactionSetAdjective(context, bytesState, // `undefined` for a workflow.
    bytesRequest) {
        try {
            let state = GreeterFromBinary(bytesState, 
            // Don't validate if we're constructing because non-optional
            // fields that this method might be setting will be invalid.
            { validate: !(statesBeingConstructed.has(context.stateId)) });
            // TODO: assert that there are no ongoing transactions for this state.
            //
            // The `state` should be already validated above, so we can
            // just store it here.
            ongoingTransactionStates[ongoingTransactionStateKey(context)] = state;
            const request = GreeterTransactionSetAdjectiveRequestFromBinary(bytesRequest);
            let partialResponse = await reboot.runWithContext(context, () => {
                return this.__TransactionSetAdjective(context, state, request);
            });
            const response = GreeterTransactionSetAdjectiveResponseToProtobuf(partialResponse);
            const result = new reboot_api.nodejs_pb.TrampolineResult();
            result.state = state.toBinary();
            result.response = response.toBinary();
            return result.toBinary();
        }
        catch (e) {
            if (e instanceof reboot_api.Aborted) {
                return reboot_api.nodejs_pb.TrampolineResult.fromJson({
                    status_json: e.toStatus().toJsonString()
                }).toBinary();
            }
            // Ensure we have an `Error` and then `console.error()` it so
            // that developers see a stack trace of what is going on.
            //
            // Only do this if it IS NOT an `Aborted` which we handle above.
            const error = ensureError(e);
            // Write an empty message which includes a newline to make it
            // easier to identify the stack trace.
            console.error("");
            console.error(error);
            console.error("");
            console.error(`Unhandled error in 'tests.reboot.Greeter.transactionSetAdjective'; propagating as 'Unknown'\n`);
            throw error;
        }
        finally {
            delete ongoingTransactionStates[ongoingTransactionStateKey(context)];
        }
    }
    async _TryToConstructContext(context, bytesState, // `undefined` for a workflow.
    bytesRequest) {
        try {
            let state = GreeterFromBinary(bytesState, 
            // Don't validate if we're constructing because non-optional
            // fields that this method might be setting will be invalid.
            { validate: !(statesBeingConstructed.has(context.stateId)) });
            if (ongoingTransactionStateKey(context) in ongoingTransactionStates) {
                state = ongoingTransactionStates[ongoingTransactionStateKey(context)].clone();
            }
            const request = GreeterTryToConstructContextRequestFromBinary(bytesRequest);
            let partialResponse = await reboot.runWithContext(context, () => {
                return this.__TryToConstructContext(context, state, request);
            });
            const response = GreeterTryToConstructContextResponseToProtobuf(partialResponse);
            const result = new reboot_api.nodejs_pb.TrampolineResult();
            result.response = response.toBinary();
            return result.toBinary();
        }
        catch (e) {
            if (e instanceof reboot_api.Aborted) {
                return reboot_api.nodejs_pb.TrampolineResult.fromJson({
                    status_json: e.toStatus().toJsonString()
                }).toBinary();
            }
            // Ensure we have an `Error` and then `console.error()` it so
            // that developers see a stack trace of what is going on.
            //
            // Only do this if it IS NOT an `Aborted` which we handle above.
            const error = ensureError(e);
            // Write an empty message which includes a newline to make it
            // easier to identify the stack trace.
            console.error("");
            console.error(error);
            console.error("");
            console.error(`Unhandled error in 'tests.reboot.Greeter.tryToConstructContext'; propagating as 'Unknown'\n`);
            throw error;
        }
        finally {
        }
    }
    async _TryToConstructExternalContext(context, bytesState, // `undefined` for a workflow.
    bytesRequest) {
        try {
            let state = GreeterFromBinary(bytesState, 
            // Don't validate if we're constructing because non-optional
            // fields that this method might be setting will be invalid.
            { validate: !(statesBeingConstructed.has(context.stateId)) });
            if (ongoingTransactionStateKey(context) in ongoingTransactionStates) {
                state = ongoingTransactionStates[ongoingTransactionStateKey(context)].clone();
            }
            const request = GreeterTryToConstructExternalContextRequestFromBinary(bytesRequest);
            let partialResponse = await reboot.runWithContext(context, () => {
                return this.__TryToConstructExternalContext(context, state, request);
            });
            const response = GreeterTryToConstructExternalContextResponseToProtobuf(partialResponse);
            const result = new reboot_api.nodejs_pb.TrampolineResult();
            result.response = response.toBinary();
            return result.toBinary();
        }
        catch (e) {
            if (e instanceof reboot_api.Aborted) {
                return reboot_api.nodejs_pb.TrampolineResult.fromJson({
                    status_json: e.toStatus().toJsonString()
                }).toBinary();
            }
            // Ensure we have an `Error` and then `console.error()` it so
            // that developers see a stack trace of what is going on.
            //
            // Only do this if it IS NOT an `Aborted` which we handle above.
            const error = ensureError(e);
            // Write an empty message which includes a newline to make it
            // easier to identify the stack trace.
            console.error("");
            console.error(error);
            console.error("");
            console.error(`Unhandled error in 'tests.reboot.Greeter.tryToConstructExternalContext'; propagating as 'Unknown'\n`);
            throw error;
        }
        finally {
        }
    }
    async _TestLongRunningFetch(context, bytesState, // `undefined` for a workflow.
    bytesRequest) {
        try {
            let state = GreeterFromBinary(bytesState, 
            // Don't validate if we're constructing because non-optional
            // fields that this method might be setting will be invalid.
            { validate: !(statesBeingConstructed.has(context.stateId)) });
            if (ongoingTransactionStateKey(context) in ongoingTransactionStates) {
                state = ongoingTransactionStates[ongoingTransactionStateKey(context)].clone();
            }
            const request = GreeterTestLongRunningFetchRequestFromBinary(bytesRequest);
            let partialResponse = await reboot.runWithContext(context, () => {
                return this.__TestLongRunningFetch(context, state, request);
            });
            const response = GreeterTestLongRunningFetchResponseToProtobuf(partialResponse);
            const result = new reboot_api.nodejs_pb.TrampolineResult();
            result.response = response.toBinary();
            return result.toBinary();
        }
        catch (e) {
            if (e instanceof reboot_api.Aborted) {
                return reboot_api.nodejs_pb.TrampolineResult.fromJson({
                    status_json: e.toStatus().toJsonString()
                }).toBinary();
            }
            // Ensure we have an `Error` and then `console.error()` it so
            // that developers see a stack trace of what is going on.
            //
            // Only do this if it IS NOT an `Aborted` which we handle above.
            const error = ensureError(e);
            // Write an empty message which includes a newline to make it
            // easier to identify the stack trace.
            console.error("");
            console.error(error);
            console.error("");
            console.error(`Unhandled error in 'tests.reboot.Greeter.testLongRunningFetch'; propagating as 'Unknown'\n`);
            throw error;
        }
        finally {
        }
    }
    async _TestLongRunningWriter(context, bytesState, // `undefined` for a workflow.
    bytesRequest) {
        try {
            let state = GreeterFromBinary(bytesState, 
            // Don't validate if we're constructing because non-optional
            // fields that this method might be setting will be invalid.
            { validate: !(statesBeingConstructed.has(context.stateId)) });
            if (ongoingTransactionStateKey(context) in ongoingTransactionStates) {
                state = ongoingTransactionStates[ongoingTransactionStateKey(context)].clone();
            }
            const request = GreeterTestLongRunningWriterRequestFromBinary(bytesRequest);
            let partialResponse = await reboot.runWithContext(context, () => {
                return this.__TestLongRunningWriter(context, state, request);
            });
            const response = GreeterTestLongRunningWriterResponseToProtobuf(partialResponse);
            // TODO: it's premature to overwrite the state now given that the
            // writer might still "fail" and an error will get propagated back
            // to the ongoing transaction which will still see the effects of
            // this writer. What we should be doing instead is creating a
            // callback API that we invoke only after a writer completes
            // that lets us update the state _reference_ then.
            if (ongoingTransactionStateKey(context) in ongoingTransactionStates) {
                ongoingTransactionStates[ongoingTransactionStateKey(context)].copyFrom(state);
            }
            const result = new reboot_api.nodejs_pb.TrampolineResult();
            result.state = state.toBinary();
            result.response = response.toBinary();
            return result.toBinary();
        }
        catch (e) {
            if (e instanceof reboot_api.Aborted) {
                return reboot_api.nodejs_pb.TrampolineResult.fromJson({
                    status_json: e.toStatus().toJsonString()
                }).toBinary();
            }
            // Ensure we have an `Error` and then `console.error()` it so
            // that developers see a stack trace of what is going on.
            //
            // Only do this if it IS NOT an `Aborted` which we handle above.
            const error = ensureError(e);
            // Write an empty message which includes a newline to make it
            // easier to identify the stack trace.
            console.error("");
            console.error(error);
            console.error("");
            console.error(`Unhandled error in 'tests.reboot.Greeter.testLongRunningWriter'; propagating as 'Unknown'\n`);
            throw error;
        }
        finally {
        }
    }
    async _GetWholeState(context, bytesState, // `undefined` for a workflow.
    bytesRequest) {
        try {
            let state = GreeterFromBinary(bytesState, 
            // Don't validate if we're constructing because non-optional
            // fields that this method might be setting will be invalid.
            { validate: !(statesBeingConstructed.has(context.stateId)) });
            if (ongoingTransactionStateKey(context) in ongoingTransactionStates) {
                state = ongoingTransactionStates[ongoingTransactionStateKey(context)].clone();
            }
            const request = GreeterGetWholeStateRequestFromBinary(bytesRequest);
            let partialResponse = await reboot.runWithContext(context, () => {
                return this.__GetWholeState(context, state, request);
            });
            const response = GreeterGetWholeStateResponseToProtobuf(partialResponse);
            const result = new reboot_api.nodejs_pb.TrampolineResult();
            result.response = response.toBinary();
            return result.toBinary();
        }
        catch (e) {
            if (e instanceof reboot_api.Aborted) {
                return reboot_api.nodejs_pb.TrampolineResult.fromJson({
                    status_json: e.toStatus().toJsonString()
                }).toBinary();
            }
            // Ensure we have an `Error` and then `console.error()` it so
            // that developers see a stack trace of what is going on.
            //
            // Only do this if it IS NOT an `Aborted` which we handle above.
            const error = ensureError(e);
            // Write an empty message which includes a newline to make it
            // easier to identify the stack trace.
            console.error("");
            console.error(error);
            console.error("");
            console.error(`Unhandled error in 'tests.reboot.Greeter.getWholeState'; propagating as 'Unknown'\n`);
            throw error;
        }
        finally {
        }
    }
    async _FailWithException(context, bytesState, // `undefined` for a workflow.
    bytesRequest) {
        try {
            let state = GreeterFromBinary(bytesState, 
            // Don't validate if we're constructing because non-optional
            // fields that this method might be setting will be invalid.
            { validate: !(statesBeingConstructed.has(context.stateId)) });
            if (ongoingTransactionStateKey(context) in ongoingTransactionStates) {
                state = ongoingTransactionStates[ongoingTransactionStateKey(context)].clone();
            }
            const request = GreeterFailWithExceptionRequestFromBinary(bytesRequest);
            let partialResponse = await reboot.runWithContext(context, () => {
                return this.__FailWithException(context, state, request);
            });
            const response = GreeterFailWithExceptionResponseToProtobuf(partialResponse);
            const result = new reboot_api.nodejs_pb.TrampolineResult();
            result.response = response.toBinary();
            return result.toBinary();
        }
        catch (e) {
            if (e instanceof reboot_api.Aborted) {
                return reboot_api.nodejs_pb.TrampolineResult.fromJson({
                    status_json: e.toStatus().toJsonString()
                }).toBinary();
            }
            // Ensure we have an `Error` and then `console.error()` it so
            // that developers see a stack trace of what is going on.
            //
            // Only do this if it IS NOT an `Aborted` which we handle above.
            const error = ensureError(e);
            // Write an empty message which includes a newline to make it
            // easier to identify the stack trace.
            console.error("");
            console.error(error);
            console.error("");
            console.error(`Unhandled error in 'tests.reboot.Greeter.failWithException'; propagating as 'Unknown'\n`);
            throw error;
        }
        finally {
        }
    }
    async _FailWithAborted(context, bytesState, // `undefined` for a workflow.
    bytesRequest) {
        try {
            let state = GreeterFromBinary(bytesState, 
            // Don't validate if we're constructing because non-optional
            // fields that this method might be setting will be invalid.
            { validate: !(statesBeingConstructed.has(context.stateId)) });
            if (ongoingTransactionStateKey(context) in ongoingTransactionStates) {
                state = ongoingTransactionStates[ongoingTransactionStateKey(context)].clone();
            }
            const request = GreeterFailWithAbortedRequestFromBinary(bytesRequest);
            let partialResponse = await reboot.runWithContext(context, () => {
                return this.__FailWithAborted(context, state, request);
            });
            const response = GreeterFailWithAbortedResponseToProtobuf(partialResponse);
            const result = new reboot_api.nodejs_pb.TrampolineResult();
            result.response = response.toBinary();
            return result.toBinary();
        }
        catch (e) {
            if (e instanceof reboot_api.Aborted) {
                return reboot_api.nodejs_pb.TrampolineResult.fromJson({
                    status_json: e.toStatus().toJsonString()
                }).toBinary();
            }
            // Ensure we have an `Error` and then `console.error()` it so
            // that developers see a stack trace of what is going on.
            //
            // Only do this if it IS NOT an `Aborted` which we handle above.
            const error = ensureError(e);
            // Write an empty message which includes a newline to make it
            // easier to identify the stack trace.
            console.error("");
            console.error(error);
            console.error("");
            console.error(`Unhandled error in 'tests.reboot.Greeter.failWithAborted'; propagating as 'Unknown'\n`);
            throw error;
        }
        finally {
        }
    }
    async _Workflow(context, bytesState, // `undefined` for a workflow.
    bytesRequest) {
        try {
            const request = GreeterWorkflowRequestFromBinary(bytesRequest);
            let partialResponse = await reboot.runWithContext(context, () => {
                return this.__Workflow(context, request);
            });
            const response = GreeterWorkflowResponseToProtobuf(partialResponse);
            const result = new reboot_api.nodejs_pb.TrampolineResult();
            result.response = response.toBinary();
            return result.toBinary();
        }
        catch (e) {
            if (e instanceof reboot_api.Aborted) {
                return reboot_api.nodejs_pb.TrampolineResult.fromJson({
                    status_json: e.toStatus().toJsonString()
                }).toBinary();
            }
            // Ensure we have an `Error` and then `console.error()` it so
            // that developers see a stack trace of what is going on.
            //
            // Only do this if it IS NOT an `Aborted` which we handle above.
            const error = ensureError(e);
            // Write an empty message which includes a newline to make it
            // easier to identify the stack trace.
            console.error("");
            console.error(error);
            console.error("");
            console.error(`Unhandled error in 'tests.reboot.Greeter.workflow'; propagating as 'Unknown'\n`);
            throw error;
        }
        finally {
        }
    }
    async _DangerousFields(context, bytesState, // `undefined` for a workflow.
    bytesRequest) {
        try {
            let state = GreeterFromBinary(bytesState, 
            // Don't validate if we're constructing because non-optional
            // fields that this method might be setting will be invalid.
            { validate: !(statesBeingConstructed.has(context.stateId)) });
            if (ongoingTransactionStateKey(context) in ongoingTransactionStates) {
                state = ongoingTransactionStates[ongoingTransactionStateKey(context)].clone();
            }
            const request = GreeterDangerousFieldsRequestFromBinary(bytesRequest);
            let partialResponse = await reboot.runWithContext(context, () => {
                return this.__DangerousFields(context, state, request);
            });
            const response = GreeterDangerousFieldsResponseToProtobuf(partialResponse);
            // TODO: it's premature to overwrite the state now given that the
            // writer might still "fail" and an error will get propagated back
            // to the ongoing transaction which will still see the effects of
            // this writer. What we should be doing instead is creating a
            // callback API that we invoke only after a writer completes
            // that lets us update the state _reference_ then.
            if (ongoingTransactionStateKey(context) in ongoingTransactionStates) {
                ongoingTransactionStates[ongoingTransactionStateKey(context)].copyFrom(state);
            }
            const result = new reboot_api.nodejs_pb.TrampolineResult();
            result.state = state.toBinary();
            result.response = response.toBinary();
            return result.toBinary();
        }
        catch (e) {
            if (e instanceof reboot_api.Aborted) {
                return reboot_api.nodejs_pb.TrampolineResult.fromJson({
                    status_json: e.toStatus().toJsonString()
                }).toBinary();
            }
            // Ensure we have an `Error` and then `console.error()` it so
            // that developers see a stack trace of what is going on.
            //
            // Only do this if it IS NOT an `Aborted` which we handle above.
            const error = ensureError(e);
            // Write an empty message which includes a newline to make it
            // easier to identify the stack trace.
            console.error("");
            console.error(error);
            console.error("");
            console.error(`Unhandled error in 'tests.reboot.Greeter.dangerousFields'; propagating as 'Unknown'\n`);
            throw error;
        }
        finally {
        }
    }
    async _StoreRecursiveMessage(context, bytesState, // `undefined` for a workflow.
    bytesRequest) {
        try {
            let state = GreeterFromBinary(bytesState, 
            // Don't validate if we're constructing because non-optional
            // fields that this method might be setting will be invalid.
            { validate: !(statesBeingConstructed.has(context.stateId)) });
            if (ongoingTransactionStateKey(context) in ongoingTransactionStates) {
                state = ongoingTransactionStates[ongoingTransactionStateKey(context)].clone();
            }
            const request = GreeterStoreRecursiveMessageRequestFromBinary(bytesRequest);
            let partialResponse = await reboot.runWithContext(context, () => {
                return this.__StoreRecursiveMessage(context, state, request);
            });
            const response = GreeterStoreRecursiveMessageResponseToProtobuf(partialResponse);
            // TODO: it's premature to overwrite the state now given that the
            // writer might still "fail" and an error will get propagated back
            // to the ongoing transaction which will still see the effects of
            // this writer. What we should be doing instead is creating a
            // callback API that we invoke only after a writer completes
            // that lets us update the state _reference_ then.
            if (ongoingTransactionStateKey(context) in ongoingTransactionStates) {
                ongoingTransactionStates[ongoingTransactionStateKey(context)].copyFrom(state);
            }
            const result = new reboot_api.nodejs_pb.TrampolineResult();
            result.state = state.toBinary();
            result.response = response.toBinary();
            return result.toBinary();
        }
        catch (e) {
            if (e instanceof reboot_api.Aborted) {
                return reboot_api.nodejs_pb.TrampolineResult.fromJson({
                    status_json: e.toStatus().toJsonString()
                }).toBinary();
            }
            // Ensure we have an `Error` and then `console.error()` it so
            // that developers see a stack trace of what is going on.
            //
            // Only do this if it IS NOT an `Aborted` which we handle above.
            const error = ensureError(e);
            // Write an empty message which includes a newline to make it
            // easier to identify the stack trace.
            console.error("");
            console.error(error);
            console.error("");
            console.error(`Unhandled error in 'tests.reboot.Greeter.storeRecursiveMessage'; propagating as 'Unknown'\n`);
            throw error;
        }
        finally {
        }
    }
    async _ReadRecursiveMessage(context, bytesState, // `undefined` for a workflow.
    bytesRequest) {
        try {
            let state = GreeterFromBinary(bytesState, 
            // Don't validate if we're constructing because non-optional
            // fields that this method might be setting will be invalid.
            { validate: !(statesBeingConstructed.has(context.stateId)) });
            if (ongoingTransactionStateKey(context) in ongoingTransactionStates) {
                state = ongoingTransactionStates[ongoingTransactionStateKey(context)].clone();
            }
            const request = GreeterReadRecursiveMessageRequestFromBinary(bytesRequest);
            let partialResponse = await reboot.runWithContext(context, () => {
                return this.__ReadRecursiveMessage(context, state, request);
            });
            const response = GreeterReadRecursiveMessageResponseToProtobuf(partialResponse);
            const result = new reboot_api.nodejs_pb.TrampolineResult();
            result.response = response.toBinary();
            return result.toBinary();
        }
        catch (e) {
            if (e instanceof reboot_api.Aborted) {
                return reboot_api.nodejs_pb.TrampolineResult.fromJson({
                    status_json: e.toStatus().toJsonString()
                }).toBinary();
            }
            // Ensure we have an `Error` and then `console.error()` it so
            // that developers see a stack trace of what is going on.
            //
            // Only do this if it IS NOT an `Aborted` which we handle above.
            const error = ensureError(e);
            // Write an empty message which includes a newline to make it
            // easier to identify the stack trace.
            console.error("");
            console.error(error);
            console.error("");
            console.error(`Unhandled error in 'tests.reboot.Greeter.readRecursiveMessage'; propagating as 'Unknown'\n`);
            throw error;
        }
        finally {
        }
    }
    async _ConstructAndStoreRecursiveMessage(context, bytesState, // `undefined` for a workflow.
    bytesRequest) {
        try {
            let state = GreeterFromBinary(bytesState, 
            // Don't validate if we're constructing because non-optional
            // fields that this method might be setting will be invalid.
            { validate: !(statesBeingConstructed.has(context.stateId)) });
            // TODO: assert that there are no ongoing transactions for this state.
            //
            // The `state` should be already validated above, so we can
            // just store it here.
            ongoingTransactionStates[ongoingTransactionStateKey(context)] = state;
            const request = GreeterConstructAndStoreRecursiveMessageRequestFromBinary(bytesRequest);
            let partialResponse = await reboot.runWithContext(context, () => {
                return this.__ConstructAndStoreRecursiveMessage(context, state, request);
            });
            const response = GreeterConstructAndStoreRecursiveMessageResponseToProtobuf(partialResponse);
            const result = new reboot_api.nodejs_pb.TrampolineResult();
            result.state = state.toBinary();
            result.response = response.toBinary();
            return result.toBinary();
        }
        catch (e) {
            if (e instanceof reboot_api.Aborted) {
                return reboot_api.nodejs_pb.TrampolineResult.fromJson({
                    status_json: e.toStatus().toJsonString()
                }).toBinary();
            }
            // Ensure we have an `Error` and then `console.error()` it so
            // that developers see a stack trace of what is going on.
            //
            // Only do this if it IS NOT an `Aborted` which we handle above.
            const error = ensureError(e);
            // Write an empty message which includes a newline to make it
            // easier to identify the stack trace.
            console.error("");
            console.error(error);
            console.error("");
            console.error(`Unhandled error in 'tests.reboot.Greeter.constructAndStoreRecursiveMessage'; propagating as 'Unknown'\n`);
            throw error;
        }
        finally {
            delete ongoingTransactionStates[ongoingTransactionStateKey(context)];
        }
    }
    async __dispatch(external, cancelled, bytesCall) {
        const call = reboot_api.nodejs_pb.TrampolineCall.fromBinary(bytesCall);
        const context = reboot.Context.fromNativeExternal({
            external,
            kind: reboot_api.nodejs_pb.Kind[call.kind],
            stateId: call.context.stateId,
            method: call.context.method,
            stateTypeName: call.context.stateTypeName,
            callerBearerToken: (call.context.callerBearerToken !== undefined
                ? call.context.callerBearerToken
                : null),
            cookie: (call.context.cookie !== undefined
                ? call.context.cookie
                : null),
            appInternal: call.context.appInternal,
            auth: (call.context.auth !== undefined
                ? reboot.Auth.fromProtoBytes(call.context.auth)
                : null),
            workflowId: (call.context.workflowId !== undefined
                ? call.context.workflowId
                : null),
            transactionRootId: (call.context.transactionRootId !== undefined
                ? call.context.transactionRootId
                : null),
            cancelled,
        });
        // TODO: as an optimization consider marking `context` as
        // "expired" before returning so that anyone else that tries to
        // use it will get an exception that the method for which this
        // context was valid has completed, that way we don't need to pay
        // to "interrupt" Python to let Python know that the Python
        // context instance can now be safely deleted.
        return this["_" + call.context.method](context, call.state, call.request);
    }
    __storeExternal(external) {
        __classPrivateFieldSet(this, _GreeterBaseServicer_external, external, "f");
    }
    get __external() {
        if (__classPrivateFieldGet(this, _GreeterBaseServicer_external, "f") === undefined) {
            throw new Error(`Unexpected undefined external`);
        }
        return __classPrivateFieldGet(this, _GreeterBaseServicer_external, "f");
    }
    authorizer() {
        return null;
    }
    _authorizer() {
        // Get authorizer, if any, converting from a rule if necessary.
        const authorizer = ((authorizerOrRule) => {
            if (authorizerOrRule instanceof reboot.AuthorizerRule) {
                return new GreeterAuthorizer({ _default: authorizerOrRule });
            }
            return authorizerOrRule;
        })(this.authorizer());
        return authorizer;
    }
}
_GreeterBaseServicer_external = new WeakMap();
GreeterBaseServicer.__rbtModule__ = "tests.reboot.greeter_rbt";
GreeterBaseServicer.__servicerNodeAdaptor__ = "GreeterServicerNodeAdaptor";
// Async local storage provides access to servicer for each workflow call, i.e.,
// there may be multiple workflows executing concurrently but each
// might have a different `servicer`.
GreeterBaseServicer.__servicer__ = new AsyncLocalStorage();
GreeterBaseServicer.WorkflowState = (_a = class {
        constructor(external) {
            _WorkflowState_external.set(this, void 0);
            __classPrivateFieldSet(this, _WorkflowState_external, external, "f");
        }
        async read(context) {
            return await (reboot.isWithinUntil()
                ? this.always()
                : (reboot.isWithinLoop()
                    ? this.perIteration()
                    : this.perWorkflow())).read(context);
        }
        async write(idempotencyAlias, context, writer, options = {}) {
            return await (reboot.isWithinLoop()
                ? this.perIteration(idempotencyAlias)
                : this.perWorkflow(idempotencyAlias)).write(context, writer, options);
        }
        perWorkflow(alias) {
            return new GreeterBaseServicer.WorkflowState._Idempotently(__classPrivateFieldGet(this, _WorkflowState_external, "f"), { alias, how: reboot.PER_WORKFLOW });
        }
        perIteration(alias) {
            return new GreeterBaseServicer.WorkflowState._Idempotently(__classPrivateFieldGet(this, _WorkflowState_external, "f"), { alias, how: reboot.PER_ITERATION });
        }
        always() {
            return new GreeterBaseServicer.WorkflowState._Always(__classPrivateFieldGet(this, _WorkflowState_external, "f"));
        }
    },
    _WorkflowState_external = new WeakMap(),
    __setFunctionName(_a, "WorkflowState"),
    _a._Idempotently = (_b = class {
            constructor(external, idempotency) {
                _external.set(this, void 0);
                _idempotency.set(this, void 0);
                __classPrivateFieldSet(this, _external, external, "f");
                __classPrivateFieldSet(this, _idempotency, idempotency, "f");
            }
            async read(context) {
                return GreeterFromJsonString(await reboot_native.Servicer_read(__classPrivateFieldGet(this, _external, "f"), context.__external, JSON.stringify(__classPrivateFieldGet(this, _idempotency, "f"))));
            }
            async write(context, writer, { schema } = {}) {
                const result = await reboot_native.Servicer_write(__classPrivateFieldGet(this, _external, "f"), context.__external, 
                // Bind with async local storage so we can check things like
                // `isWithinLoop`, etc.
                AsyncLocalStorage.bind(async (jsonState) => {
                    const state = GreeterFromJsonString(jsonState);
                    try {
                        const t = await writer(state);
                        // Fail early if the developer thinks that they have some value
                        // that they want to validate but we got `undefined`.
                        if (t === undefined && schema !== undefined) {
                            throw new Error("Not expecting 'schema' as you are returning 'void' (or explicitly 'undefined') from your inline writer; did you mean to return a value (or if you want to explicitly return the absence of a value use 'null')");
                        }
                        if (t !== undefined) {
                            // Fail early if the developer forgot to pass `schema`.
                            if (schema === undefined) {
                                throw new Error("Expecting 'schema' as you are returning a value from your inline writer");
                            }
                            let validate = schema["~standard"].validate(t);
                            if (validate instanceof Promise) {
                                validate = await validate;
                            }
                            // If the `issues` field exists, the validation failed.
                            if (validate.issues) {
                                throw new Error(`Failed to validate result of inline writer: ${JSON.stringify(validate.issues, null, 2)}`);
                            }
                        }
                        return JSON.stringify({
                            // NOTE: we use `stringify` from
                            // `@reboot-dev/reboot-api` because it can handle
                            // `BigInt` and `Uint8Array` which are common types
                            // from protobuf.
                            //
                            // We use the empty string to represent a
                            // `callable` returning `void` (or explicitly
                            // `undefined`).
                            //
                            // To differentiate returning `void` (or explicitly
                            // `undefined`) from `reboot_api.stringify` returning an empty
                            // string we use `{ value: t }`.
                            result: (t !== undefined && reboot_api.stringify({ value: t })) || "",
                            state: GreeterToProtobuf(state).toJson(),
                        });
                    }
                    catch (e) {
                        throw ensureError(e);
                    }
                }), JSON.stringify(__classPrivateFieldGet(this, _idempotency, "f")));
                // NOTE: we parse and validate `value` every time, even the first
                // time, so as to catch bugs where the `value` returned from
                // `callable` might not parse or be valid. We will have already
                // persisted `result`, so in the event of a bug the developer will
                // have to change the idempotency alias so that `callable` is
                // re-executed. These semantics are the same as Python (although
                // Python uses the `type` keyword argument instead of the
                // `schema` property we use here).
                reboot_api.assert(result !== undefined);
                if (result !== "") {
                    // NOTE: we use `parse` from `@reboot-dev/reboot-api`
                    // because it can handle `BigInt` and `Uint8Array` which are
                    // common types from protobuf.
                    const { value } = reboot_api.parse(result);
                    if (schema === undefined) {
                        throw new Error("Expecting 'schema' as we have already memoized a result, has " +
                            "the code been updated to remove a previously existing 'schema'");
                    }
                    let validate = schema["~standard"].validate(value);
                    if (validate instanceof Promise) {
                        validate = await validate;
                    }
                    // If the `issues` field exists, the validation failed.
                    if (validate.issues) {
                        throw new Error(`Failed to validate result of inline writer: ${JSON.stringify(validate.issues, null, 2)}`);
                    }
                    return validate.value;
                }
                // Otherwise `callable` must have returned void (or explicitly
                // `undefined`), fall through.
            }
        },
        _external = new WeakMap(),
        _idempotency = new WeakMap(),
        _b),
    _a._Always = (_c = class {
            constructor(external) {
                _external_1.set(this, void 0);
                __classPrivateFieldSet(this, _external_1, external, "f");
            }
            async read(context) {
                return new GreeterBaseServicer.WorkflowState._Idempotently(__classPrivateFieldGet(this, _external_1, "f"), { how: reboot.ALWAYS }).read(context);
            }
            async write(context, writer) {
                return new GreeterBaseServicer.WorkflowState._Idempotently(__classPrivateFieldGet(this, _external_1, "f"), { how: reboot.ALWAYS }).write(context, writer, {});
            }
        },
        _external_1 = new WeakMap(),
        _c),
    _a);
export class GreeterSingletonServicer extends GreeterBaseServicer {
    async __Create(context, state, request) {
        return await this.create(context, state, request);
    }
    async __Greet(context, state, request) {
        return await this.greet(context, state, request);
    }
    async __SetAdjective(context, state, request) {
        return await this.setAdjective(context, state, request);
    }
    async __TransactionSetAdjective(context, state, request) {
        return await this.transactionSetAdjective(context, state, request);
    }
    async __TryToConstructContext(context, state, request) {
        return await this.tryToConstructContext(context, state, request);
    }
    async __TryToConstructExternalContext(context, state, request) {
        return await this.tryToConstructExternalContext(context, state, request);
    }
    async __TestLongRunningFetch(context, state, request) {
        return await this.testLongRunningFetch(context, state, request);
    }
    async __TestLongRunningWriter(context, state, request) {
        return await this.testLongRunningWriter(context, state, request);
    }
    async __GetWholeState(context, state, request) {
        return await this.getWholeState(context, state, request);
    }
    async __FailWithException(context, state, request) {
        return await this.failWithException(context, state, request);
    }
    async __FailWithAborted(context, state, request) {
        return await this.failWithAborted(context, state, request);
    }
    async __Workflow(context, request) {
        return await GreeterBaseServicer.__servicer__.run({ servicer: this }, async () => {
            if (this.workflow !== undefined) {
                // Call the instance method (deprecated).
                return await this.workflow(context, request);
            }
            else {
                // Call the static method.
                return await this.constructor.workflow(context, request);
            }
        });
    }
    async __DangerousFields(context, state, request) {
        return await this.dangerousFields(context, state, request);
    }
    async __StoreRecursiveMessage(context, state, request) {
        return await this.storeRecursiveMessage(context, state, request);
    }
    async __ReadRecursiveMessage(context, state, request) {
        return await this.readRecursiveMessage(context, state, request);
    }
    async __ConstructAndStoreRecursiveMessage(context, state, request) {
        return await this.constructAndStoreRecursiveMessage(context, state, request);
    }
    get state() {
        return new GreeterBaseServicer.WorkflowState(this.__external);
    }
}
export class GreeterServicer extends GreeterBaseServicer {
    get state() {
        const store = __classPrivateFieldGet(_d, _d, "f", _GreeterServicer_storage).getStore();
        if (!store) {
            throw new Error("`state` property is only relevant within a `Servicer` method");
        }
        if (store.workflow) {
            throw new Error("`this.state` is not valid within a `workflow` because a `workflow `" +
                "is not _atomic_; use `await this.ref().read(context)` instead");
        }
        reboot_api.assert(store.state !== undefined);
        return store.state;
    }
    set state(state) {
        const store = __classPrivateFieldGet(_d, _d, "f", _GreeterServicer_storage).getStore();
        if (!store) {
            throw new Error("`state` property is only relevant within a `Servicer` method");
        }
        if (store.workflow) {
            throw new Error("`this.state` is not valid within a `workflow` because a `workflow `" +
                "is not _atomic_; use `await this.ref().write(...)` instead");
        }
        reboot_api.assert(store.state !== undefined);
        Object.assign(store.state, state);
    }
    async __Create(context, state, request) {
        const instances = __classPrivateFieldGet(_d, _d, "f", _GreeterServicer_instances);
        let instance = instances.get(context.stateId);
        if (instance === undefined) {
            instance = new this.constructor();
            instance.__storeExternal(this.__external);
            instances.set(context.stateId, instance);
        }
        return await __classPrivateFieldGet(_d, _d, "f", _GreeterServicer_storage).run({ state, workflow: false }, async () => {
            return await instance.create(context, request);
        });
    }
    async __Greet(context, state, request) {
        const instances = __classPrivateFieldGet(_d, _d, "f", _GreeterServicer_instances);
        let instance = instances.get(context.stateId);
        if (instance === undefined) {
            instance = new this.constructor();
            instance.__storeExternal(this.__external);
            instances.set(context.stateId, instance);
        }
        return await __classPrivateFieldGet(_d, _d, "f", _GreeterServicer_storage).run({ state, workflow: false }, async () => {
            return await instance.greet(context, request);
        });
    }
    async __SetAdjective(context, state, request) {
        const instances = __classPrivateFieldGet(_d, _d, "f", _GreeterServicer_instances);
        let instance = instances.get(context.stateId);
        if (instance === undefined) {
            instance = new this.constructor();
            instance.__storeExternal(this.__external);
            instances.set(context.stateId, instance);
        }
        return await __classPrivateFieldGet(_d, _d, "f", _GreeterServicer_storage).run({ state, workflow: false }, async () => {
            return await instance.setAdjective(context, request);
        });
    }
    async __TransactionSetAdjective(context, state, request) {
        const instances = __classPrivateFieldGet(_d, _d, "f", _GreeterServicer_instances);
        let instance = instances.get(context.stateId);
        if (instance === undefined) {
            instance = new this.constructor();
            instance.__storeExternal(this.__external);
            instances.set(context.stateId, instance);
        }
        return await __classPrivateFieldGet(_d, _d, "f", _GreeterServicer_storage).run({ state, workflow: false }, async () => {
            return await instance.transactionSetAdjective(context, request);
        });
    }
    async __TryToConstructContext(context, state, request) {
        const instances = __classPrivateFieldGet(_d, _d, "f", _GreeterServicer_instances);
        let instance = instances.get(context.stateId);
        if (instance === undefined) {
            instance = new this.constructor();
            instance.__storeExternal(this.__external);
            instances.set(context.stateId, instance);
        }
        return await __classPrivateFieldGet(_d, _d, "f", _GreeterServicer_storage).run({ state, workflow: false }, async () => {
            return await instance.tryToConstructContext(context, request);
        });
    }
    async __TryToConstructExternalContext(context, state, request) {
        const instances = __classPrivateFieldGet(_d, _d, "f", _GreeterServicer_instances);
        let instance = instances.get(context.stateId);
        if (instance === undefined) {
            instance = new this.constructor();
            instance.__storeExternal(this.__external);
            instances.set(context.stateId, instance);
        }
        return await __classPrivateFieldGet(_d, _d, "f", _GreeterServicer_storage).run({ state, workflow: false }, async () => {
            return await instance.tryToConstructExternalContext(context, request);
        });
    }
    async __TestLongRunningFetch(context, state, request) {
        const instances = __classPrivateFieldGet(_d, _d, "f", _GreeterServicer_instances);
        let instance = instances.get(context.stateId);
        if (instance === undefined) {
            instance = new this.constructor();
            instance.__storeExternal(this.__external);
            instances.set(context.stateId, instance);
        }
        return await __classPrivateFieldGet(_d, _d, "f", _GreeterServicer_storage).run({ state, workflow: false }, async () => {
            return await instance.testLongRunningFetch(context, request);
        });
    }
    async __TestLongRunningWriter(context, state, request) {
        const instances = __classPrivateFieldGet(_d, _d, "f", _GreeterServicer_instances);
        let instance = instances.get(context.stateId);
        if (instance === undefined) {
            instance = new this.constructor();
            instance.__storeExternal(this.__external);
            instances.set(context.stateId, instance);
        }
        return await __classPrivateFieldGet(_d, _d, "f", _GreeterServicer_storage).run({ state, workflow: false }, async () => {
            return await instance.testLongRunningWriter(context, request);
        });
    }
    async __GetWholeState(context, state, request) {
        const instances = __classPrivateFieldGet(_d, _d, "f", _GreeterServicer_instances);
        let instance = instances.get(context.stateId);
        if (instance === undefined) {
            instance = new this.constructor();
            instance.__storeExternal(this.__external);
            instances.set(context.stateId, instance);
        }
        return await __classPrivateFieldGet(_d, _d, "f", _GreeterServicer_storage).run({ state, workflow: false }, async () => {
            return await instance.getWholeState(context, request);
        });
    }
    async __FailWithException(context, state, request) {
        const instances = __classPrivateFieldGet(_d, _d, "f", _GreeterServicer_instances);
        let instance = instances.get(context.stateId);
        if (instance === undefined) {
            instance = new this.constructor();
            instance.__storeExternal(this.__external);
            instances.set(context.stateId, instance);
        }
        return await __classPrivateFieldGet(_d, _d, "f", _GreeterServicer_storage).run({ state, workflow: false }, async () => {
            return await instance.failWithException(context, request);
        });
    }
    async __FailWithAborted(context, state, request) {
        const instances = __classPrivateFieldGet(_d, _d, "f", _GreeterServicer_instances);
        let instance = instances.get(context.stateId);
        if (instance === undefined) {
            instance = new this.constructor();
            instance.__storeExternal(this.__external);
            instances.set(context.stateId, instance);
        }
        return await __classPrivateFieldGet(_d, _d, "f", _GreeterServicer_storage).run({ state, workflow: false }, async () => {
            return await instance.failWithAborted(context, request);
        });
    }
    async __Workflow(context, request) {
        const instances = __classPrivateFieldGet(_d, _d, "f", _GreeterServicer_instances);
        let instance = instances.get(context.stateId);
        if (instance === undefined) {
            instance = new this.constructor();
            instance.__storeExternal(this.__external);
            instances.set(context.stateId, instance);
        }
        return await __classPrivateFieldGet(_d, _d, "f", _GreeterServicer_storage).run({ workflow: true }, async () => {
            return await GreeterBaseServicer.__servicer__.run({ servicer: instance }, async () => {
                if (instance.workflow !== undefined) {
                    // Call the instance method (deprecated).
                    return await instance.workflow(context, request);
                }
                else {
                    // Call the static method.
                    return await instance.constructor.workflow(context, request);
                }
            });
        });
    }
    async __DangerousFields(context, state, request) {
        const instances = __classPrivateFieldGet(_d, _d, "f", _GreeterServicer_instances);
        let instance = instances.get(context.stateId);
        if (instance === undefined) {
            instance = new this.constructor();
            instance.__storeExternal(this.__external);
            instances.set(context.stateId, instance);
        }
        return await __classPrivateFieldGet(_d, _d, "f", _GreeterServicer_storage).run({ state, workflow: false }, async () => {
            return await instance.dangerousFields(context, request);
        });
    }
    async __StoreRecursiveMessage(context, state, request) {
        const instances = __classPrivateFieldGet(_d, _d, "f", _GreeterServicer_instances);
        let instance = instances.get(context.stateId);
        if (instance === undefined) {
            instance = new this.constructor();
            instance.__storeExternal(this.__external);
            instances.set(context.stateId, instance);
        }
        return await __classPrivateFieldGet(_d, _d, "f", _GreeterServicer_storage).run({ state, workflow: false }, async () => {
            return await instance.storeRecursiveMessage(context, request);
        });
    }
    async __ReadRecursiveMessage(context, state, request) {
        const instances = __classPrivateFieldGet(_d, _d, "f", _GreeterServicer_instances);
        let instance = instances.get(context.stateId);
        if (instance === undefined) {
            instance = new this.constructor();
            instance.__storeExternal(this.__external);
            instances.set(context.stateId, instance);
        }
        return await __classPrivateFieldGet(_d, _d, "f", _GreeterServicer_storage).run({ state, workflow: false }, async () => {
            return await instance.readRecursiveMessage(context, request);
        });
    }
    async __ConstructAndStoreRecursiveMessage(context, state, request) {
        const instances = __classPrivateFieldGet(_d, _d, "f", _GreeterServicer_instances);
        let instance = instances.get(context.stateId);
        if (instance === undefined) {
            instance = new this.constructor();
            instance.__storeExternal(this.__external);
            instances.set(context.stateId, instance);
        }
        return await __classPrivateFieldGet(_d, _d, "f", _GreeterServicer_storage).run({ state, workflow: false }, async () => {
            return await instance.constructAndStoreRecursiveMessage(context, request);
        });
    }
}
_d = GreeterServicer;
// Async local storage provides access to state for each call, i.e.,
// there may be multiple readers executing concurrently but each
// might have a different `state`.
_GreeterServicer_storage = { value: new AsyncLocalStorage() };
// An instance of the derived class for each state. We need it to be
// able to keep some private data per state servicer class, but not
// making it be implicitly `static`. For example:
//
// class MyServicer extends GreeterServicer {
//  private: myData = ...;
// }
//
// Then each `stateId` will have its own instance of `MyServicer`
// stored here.
_GreeterServicer_instances = { value: new Map() };
export class GreeterAuthorizer extends reboot.Authorizer {
    constructor(rules) {
        super();
        _GreeterAuthorizer_rules.set(this, void 0);
        __classPrivateFieldSet(this, _GreeterAuthorizer_rules, { ...rules, _default: rules?._default ?? reboot.allowIf({ all: [reboot.isAppInternal] }) }, "f");
    }
    async _authorize(external, cancelled, bytesCall) {
        const call = reboot_api.nodejs_pb.AuthorizeCall.fromBinary(bytesCall);
        const context = reboot.Context.fromNativeExternal({
            external,
            kind: "reader",
            stateId: call.context.stateId,
            method: call.context.method,
            stateTypeName: call.context.stateTypeName,
            callerBearerToken: call.context.callerBearerToken,
            cookie: call.context.cookie,
            appInternal: call.context.appInternal,
            auth: (call.context.auth !== undefined
                ? reboot.Auth.fromProtoBytes(call.context.auth)
                : null),
            workflowId: (call.context.workflowId !== undefined
                ? call.context.workflowId
                : null),
            transactionRootId: (call.context.transactionRootId !== undefined
                ? call.context.transactionRootId
                : null),
            cancelled,
        });
        const anyRequest = protobuf_es.Any.fromBinary(call.request);
        if (anyRequest.is(greeter_pb.CreateRequest)) {
            const unpackedRequest = new greeter_pb.CreateRequest();
            anyRequest.unpackTo(unpackedRequest);
            try {
                // NOTE: we are setting `state` within `try` so that any
                // possible validation errors if using Zod are logged in
                // the `catch`.
                const state = call.state && GreeterFromBinary(call.state, 
                // Don't validate if we're constructing because non-optional
                // fields that this method might be setting will be invalid.
                { validate: !(statesBeingConstructed.has(context.stateId)) });
                const request = GreeterCreateRequestFromProtobufShape(unpackedRequest);
                return protobuf_es.Any.pack(await this.authorize(call.methodName, context, state, request)).toBinary();
            }
            catch (e) {
                // Ensure we have an `Error` and then `console.error()` it so
                // that developers see a stack trace of what is going on.
                const error = ensureError(e);
                // Write an empty message which includes a newline to make it
                // easier to identify the stack trace.
                console.error("");
                console.error(error);
                console.error("");
                console.error(`Unhandled error trying to authorize 'Greeter.create'\n`);
                throw error;
            }
        }
        else if (anyRequest.is(greeter_pb.GreetRequest)) {
            const unpackedRequest = new greeter_pb.GreetRequest();
            anyRequest.unpackTo(unpackedRequest);
            try {
                // NOTE: we are setting `state` within `try` so that any
                // possible validation errors if using Zod are logged in
                // the `catch`.
                const state = call.state && GreeterFromBinary(call.state, 
                // Don't validate if we're constructing because non-optional
                // fields that this method might be setting will be invalid.
                { validate: !(statesBeingConstructed.has(context.stateId)) });
                const request = GreeterGreetRequestFromProtobufShape(unpackedRequest);
                return protobuf_es.Any.pack(await this.authorize(call.methodName, context, state, request)).toBinary();
            }
            catch (e) {
                // Ensure we have an `Error` and then `console.error()` it so
                // that developers see a stack trace of what is going on.
                const error = ensureError(e);
                // Write an empty message which includes a newline to make it
                // easier to identify the stack trace.
                console.error("");
                console.error(error);
                console.error("");
                console.error(`Unhandled error trying to authorize 'Greeter.greet'\n`);
                throw error;
            }
        }
        else if (anyRequest.is(greeter_pb.SetAdjectiveRequest)) {
            const unpackedRequest = new greeter_pb.SetAdjectiveRequest();
            anyRequest.unpackTo(unpackedRequest);
            try {
                // NOTE: we are setting `state` within `try` so that any
                // possible validation errors if using Zod are logged in
                // the `catch`.
                const state = call.state && GreeterFromBinary(call.state, 
                // Don't validate if we're constructing because non-optional
                // fields that this method might be setting will be invalid.
                { validate: !(statesBeingConstructed.has(context.stateId)) });
                const request = GreeterSetAdjectiveRequestFromProtobufShape(unpackedRequest);
                return protobuf_es.Any.pack(await this.authorize(call.methodName, context, state, request)).toBinary();
            }
            catch (e) {
                // Ensure we have an `Error` and then `console.error()` it so
                // that developers see a stack trace of what is going on.
                const error = ensureError(e);
                // Write an empty message which includes a newline to make it
                // easier to identify the stack trace.
                console.error("");
                console.error(error);
                console.error("");
                console.error(`Unhandled error trying to authorize 'Greeter.setAdjective'\n`);
                throw error;
            }
        }
        else if (anyRequest.is(greeter_pb.SetAdjectiveRequest)) {
            const unpackedRequest = new greeter_pb.SetAdjectiveRequest();
            anyRequest.unpackTo(unpackedRequest);
            try {
                // NOTE: we are setting `state` within `try` so that any
                // possible validation errors if using Zod are logged in
                // the `catch`.
                const state = call.state && GreeterFromBinary(call.state, 
                // Don't validate if we're constructing because non-optional
                // fields that this method might be setting will be invalid.
                { validate: !(statesBeingConstructed.has(context.stateId)) });
                const request = GreeterTransactionSetAdjectiveRequestFromProtobufShape(unpackedRequest);
                return protobuf_es.Any.pack(await this.authorize(call.methodName, context, state, request)).toBinary();
            }
            catch (e) {
                // Ensure we have an `Error` and then `console.error()` it so
                // that developers see a stack trace of what is going on.
                const error = ensureError(e);
                // Write an empty message which includes a newline to make it
                // easier to identify the stack trace.
                console.error("");
                console.error(error);
                console.error("");
                console.error(`Unhandled error trying to authorize 'Greeter.transactionSetAdjective'\n`);
                throw error;
            }
        }
        else if (anyRequest.is(Empty)) {
            const unpackedRequest = new Empty();
            anyRequest.unpackTo(unpackedRequest);
            try {
                // NOTE: we are setting `state` within `try` so that any
                // possible validation errors if using Zod are logged in
                // the `catch`.
                const state = call.state && GreeterFromBinary(call.state, 
                // Don't validate if we're constructing because non-optional
                // fields that this method might be setting will be invalid.
                { validate: !(statesBeingConstructed.has(context.stateId)) });
                const request = GreeterTryToConstructContextRequestFromProtobufShape(unpackedRequest);
                return protobuf_es.Any.pack(await this.authorize(call.methodName, context, state, request)).toBinary();
            }
            catch (e) {
                // Ensure we have an `Error` and then `console.error()` it so
                // that developers see a stack trace of what is going on.
                const error = ensureError(e);
                // Write an empty message which includes a newline to make it
                // easier to identify the stack trace.
                console.error("");
                console.error(error);
                console.error("");
                console.error(`Unhandled error trying to authorize 'Greeter.tryToConstructContext'\n`);
                throw error;
            }
        }
        else if (anyRequest.is(Empty)) {
            const unpackedRequest = new Empty();
            anyRequest.unpackTo(unpackedRequest);
            try {
                // NOTE: we are setting `state` within `try` so that any
                // possible validation errors if using Zod are logged in
                // the `catch`.
                const state = call.state && GreeterFromBinary(call.state, 
                // Don't validate if we're constructing because non-optional
                // fields that this method might be setting will be invalid.
                { validate: !(statesBeingConstructed.has(context.stateId)) });
                const request = GreeterTryToConstructExternalContextRequestFromProtobufShape(unpackedRequest);
                return protobuf_es.Any.pack(await this.authorize(call.methodName, context, state, request)).toBinary();
            }
            catch (e) {
                // Ensure we have an `Error` and then `console.error()` it so
                // that developers see a stack trace of what is going on.
                const error = ensureError(e);
                // Write an empty message which includes a newline to make it
                // easier to identify the stack trace.
                console.error("");
                console.error(error);
                console.error("");
                console.error(`Unhandled error trying to authorize 'Greeter.tryToConstructExternalContext'\n`);
                throw error;
            }
        }
        else if (anyRequest.is(greeter_pb.TestLongRunningFetchRequest)) {
            const unpackedRequest = new greeter_pb.TestLongRunningFetchRequest();
            anyRequest.unpackTo(unpackedRequest);
            try {
                // NOTE: we are setting `state` within `try` so that any
                // possible validation errors if using Zod are logged in
                // the `catch`.
                const state = call.state && GreeterFromBinary(call.state, 
                // Don't validate if we're constructing because non-optional
                // fields that this method might be setting will be invalid.
                { validate: !(statesBeingConstructed.has(context.stateId)) });
                const request = GreeterTestLongRunningFetchRequestFromProtobufShape(unpackedRequest);
                return protobuf_es.Any.pack(await this.authorize(call.methodName, context, state, request)).toBinary();
            }
            catch (e) {
                // Ensure we have an `Error` and then `console.error()` it so
                // that developers see a stack trace of what is going on.
                const error = ensureError(e);
                // Write an empty message which includes a newline to make it
                // easier to identify the stack trace.
                console.error("");
                console.error(error);
                console.error("");
                console.error(`Unhandled error trying to authorize 'Greeter.testLongRunningFetch'\n`);
                throw error;
            }
        }
        else if (anyRequest.is(Empty)) {
            const unpackedRequest = new Empty();
            anyRequest.unpackTo(unpackedRequest);
            try {
                // NOTE: we are setting `state` within `try` so that any
                // possible validation errors if using Zod are logged in
                // the `catch`.
                const state = call.state && GreeterFromBinary(call.state, 
                // Don't validate if we're constructing because non-optional
                // fields that this method might be setting will be invalid.
                { validate: !(statesBeingConstructed.has(context.stateId)) });
                const request = GreeterTestLongRunningWriterRequestFromProtobufShape(unpackedRequest);
                return protobuf_es.Any.pack(await this.authorize(call.methodName, context, state, request)).toBinary();
            }
            catch (e) {
                // Ensure we have an `Error` and then `console.error()` it so
                // that developers see a stack trace of what is going on.
                const error = ensureError(e);
                // Write an empty message which includes a newline to make it
                // easier to identify the stack trace.
                console.error("");
                console.error(error);
                console.error("");
                console.error(`Unhandled error trying to authorize 'Greeter.testLongRunningWriter'\n`);
                throw error;
            }
        }
        else if (anyRequest.is(greeter_pb.GetWholeStateRequest)) {
            const unpackedRequest = new greeter_pb.GetWholeStateRequest();
            anyRequest.unpackTo(unpackedRequest);
            try {
                // NOTE: we are setting `state` within `try` so that any
                // possible validation errors if using Zod are logged in
                // the `catch`.
                const state = call.state && GreeterFromBinary(call.state, 
                // Don't validate if we're constructing because non-optional
                // fields that this method might be setting will be invalid.
                { validate: !(statesBeingConstructed.has(context.stateId)) });
                const request = GreeterGetWholeStateRequestFromProtobufShape(unpackedRequest);
                return protobuf_es.Any.pack(await this.authorize(call.methodName, context, state, request)).toBinary();
            }
            catch (e) {
                // Ensure we have an `Error` and then `console.error()` it so
                // that developers see a stack trace of what is going on.
                const error = ensureError(e);
                // Write an empty message which includes a newline to make it
                // easier to identify the stack trace.
                console.error("");
                console.error(error);
                console.error("");
                console.error(`Unhandled error trying to authorize 'Greeter.getWholeState'\n`);
                throw error;
            }
        }
        else if (anyRequest.is(Empty)) {
            const unpackedRequest = new Empty();
            anyRequest.unpackTo(unpackedRequest);
            try {
                // NOTE: we are setting `state` within `try` so that any
                // possible validation errors if using Zod are logged in
                // the `catch`.
                const state = call.state && GreeterFromBinary(call.state, 
                // Don't validate if we're constructing because non-optional
                // fields that this method might be setting will be invalid.
                { validate: !(statesBeingConstructed.has(context.stateId)) });
                const request = GreeterFailWithExceptionRequestFromProtobufShape(unpackedRequest);
                return protobuf_es.Any.pack(await this.authorize(call.methodName, context, state, request)).toBinary();
            }
            catch (e) {
                // Ensure we have an `Error` and then `console.error()` it so
                // that developers see a stack trace of what is going on.
                const error = ensureError(e);
                // Write an empty message which includes a newline to make it
                // easier to identify the stack trace.
                console.error("");
                console.error(error);
                console.error("");
                console.error(`Unhandled error trying to authorize 'Greeter.failWithException'\n`);
                throw error;
            }
        }
        else if (anyRequest.is(Empty)) {
            const unpackedRequest = new Empty();
            anyRequest.unpackTo(unpackedRequest);
            try {
                // NOTE: we are setting `state` within `try` so that any
                // possible validation errors if using Zod are logged in
                // the `catch`.
                const state = call.state && GreeterFromBinary(call.state, 
                // Don't validate if we're constructing because non-optional
                // fields that this method might be setting will be invalid.
                { validate: !(statesBeingConstructed.has(context.stateId)) });
                const request = GreeterFailWithAbortedRequestFromProtobufShape(unpackedRequest);
                return protobuf_es.Any.pack(await this.authorize(call.methodName, context, state, request)).toBinary();
            }
            catch (e) {
                // Ensure we have an `Error` and then `console.error()` it so
                // that developers see a stack trace of what is going on.
                const error = ensureError(e);
                // Write an empty message which includes a newline to make it
                // easier to identify the stack trace.
                console.error("");
                console.error(error);
                console.error("");
                console.error(`Unhandled error trying to authorize 'Greeter.failWithAborted'\n`);
                throw error;
            }
        }
        else if (anyRequest.is(Empty)) {
            const unpackedRequest = new Empty();
            anyRequest.unpackTo(unpackedRequest);
            try {
                // NOTE: we are setting `state` within `try` so that any
                // possible validation errors if using Zod are logged in
                // the `catch`.
                const state = call.state && GreeterFromBinary(call.state, 
                // Don't validate if we're constructing because non-optional
                // fields that this method might be setting will be invalid.
                { validate: !(statesBeingConstructed.has(context.stateId)) });
                const request = GreeterWorkflowRequestFromProtobufShape(unpackedRequest);
                return protobuf_es.Any.pack(await this.authorize(call.methodName, context, state, request)).toBinary();
            }
            catch (e) {
                // Ensure we have an `Error` and then `console.error()` it so
                // that developers see a stack trace of what is going on.
                const error = ensureError(e);
                // Write an empty message which includes a newline to make it
                // easier to identify the stack trace.
                console.error("");
                console.error(error);
                console.error("");
                console.error(`Unhandled error trying to authorize 'Greeter.workflow'\n`);
                throw error;
            }
        }
        else if (anyRequest.is(greeter_pb.DangerousFieldsRequest)) {
            const unpackedRequest = new greeter_pb.DangerousFieldsRequest();
            anyRequest.unpackTo(unpackedRequest);
            try {
                // NOTE: we are setting `state` within `try` so that any
                // possible validation errors if using Zod are logged in
                // the `catch`.
                const state = call.state && GreeterFromBinary(call.state, 
                // Don't validate if we're constructing because non-optional
                // fields that this method might be setting will be invalid.
                { validate: !(statesBeingConstructed.has(context.stateId)) });
                const request = GreeterDangerousFieldsRequestFromProtobufShape(unpackedRequest);
                return protobuf_es.Any.pack(await this.authorize(call.methodName, context, state, request)).toBinary();
            }
            catch (e) {
                // Ensure we have an `Error` and then `console.error()` it so
                // that developers see a stack trace of what is going on.
                const error = ensureError(e);
                // Write an empty message which includes a newline to make it
                // easier to identify the stack trace.
                console.error("");
                console.error(error);
                console.error("");
                console.error(`Unhandled error trying to authorize 'Greeter.dangerousFields'\n`);
                throw error;
            }
        }
        else if (anyRequest.is(greeter_pb.StoreRecursiveMessageRequest)) {
            const unpackedRequest = new greeter_pb.StoreRecursiveMessageRequest();
            anyRequest.unpackTo(unpackedRequest);
            try {
                // NOTE: we are setting `state` within `try` so that any
                // possible validation errors if using Zod are logged in
                // the `catch`.
                const state = call.state && GreeterFromBinary(call.state, 
                // Don't validate if we're constructing because non-optional
                // fields that this method might be setting will be invalid.
                { validate: !(statesBeingConstructed.has(context.stateId)) });
                const request = GreeterStoreRecursiveMessageRequestFromProtobufShape(unpackedRequest);
                return protobuf_es.Any.pack(await this.authorize(call.methodName, context, state, request)).toBinary();
            }
            catch (e) {
                // Ensure we have an `Error` and then `console.error()` it so
                // that developers see a stack trace of what is going on.
                const error = ensureError(e);
                // Write an empty message which includes a newline to make it
                // easier to identify the stack trace.
                console.error("");
                console.error(error);
                console.error("");
                console.error(`Unhandled error trying to authorize 'Greeter.storeRecursiveMessage'\n`);
                throw error;
            }
        }
        else if (anyRequest.is(greeter_pb.ReadRecursiveMessageRequest)) {
            const unpackedRequest = new greeter_pb.ReadRecursiveMessageRequest();
            anyRequest.unpackTo(unpackedRequest);
            try {
                // NOTE: we are setting `state` within `try` so that any
                // possible validation errors if using Zod are logged in
                // the `catch`.
                const state = call.state && GreeterFromBinary(call.state, 
                // Don't validate if we're constructing because non-optional
                // fields that this method might be setting will be invalid.
                { validate: !(statesBeingConstructed.has(context.stateId)) });
                const request = GreeterReadRecursiveMessageRequestFromProtobufShape(unpackedRequest);
                return protobuf_es.Any.pack(await this.authorize(call.methodName, context, state, request)).toBinary();
            }
            catch (e) {
                // Ensure we have an `Error` and then `console.error()` it so
                // that developers see a stack trace of what is going on.
                const error = ensureError(e);
                // Write an empty message which includes a newline to make it
                // easier to identify the stack trace.
                console.error("");
                console.error(error);
                console.error("");
                console.error(`Unhandled error trying to authorize 'Greeter.readRecursiveMessage'\n`);
                throw error;
            }
        }
        else if (anyRequest.is(greeter_pb.ConstructAndStoreRecursiveMessageRequest)) {
            const unpackedRequest = new greeter_pb.ConstructAndStoreRecursiveMessageRequest();
            anyRequest.unpackTo(unpackedRequest);
            try {
                // NOTE: we are setting `state` within `try` so that any
                // possible validation errors if using Zod are logged in
                // the `catch`.
                const state = call.state && GreeterFromBinary(call.state, 
                // Don't validate if we're constructing because non-optional
                // fields that this method might be setting will be invalid.
                { validate: !(statesBeingConstructed.has(context.stateId)) });
                const request = GreeterConstructAndStoreRecursiveMessageRequestFromProtobufShape(unpackedRequest);
                return protobuf_es.Any.pack(await this.authorize(call.methodName, context, state, request)).toBinary();
            }
            catch (e) {
                // Ensure we have an `Error` and then `console.error()` it so
                // that developers see a stack trace of what is going on.
                const error = ensureError(e);
                // Write an empty message which includes a newline to make it
                // easier to identify the stack trace.
                console.error("");
                console.error(error);
                console.error("");
                console.error(`Unhandled error trying to authorize 'Greeter.constructAndStoreRecursiveMessage'\n`);
                throw error;
            }
        }
        else {
            throw new Error(`Unexpected type for ${request}: ${anyRequest.typeUrl}.`);
        }
    }
    ;
    async authorize(methodName, context, state, request) {
        if (methodName == 'tests.reboot.GreeterMethods.Create') {
            return await this.create(context, request);
        }
        else if (methodName == 'tests.reboot.GreeterMethods.Greet') {
            return await this.greet(context, state, request);
        }
        else if (methodName == 'tests.reboot.GreeterMethods.SetAdjective') {
            return await this.setAdjective(context, state, request);
        }
        else if (methodName == 'tests.reboot.GreeterMethods.TransactionSetAdjective') {
            return await this.transactionSetAdjective(context, state, request);
        }
        else if (methodName == 'tests.reboot.GreeterMethods.TryToConstructContext') {
            return await this.tryToConstructContext(context, state, request);
        }
        else if (methodName == 'tests.reboot.GreeterMethods.TryToConstructExternalContext') {
            return await this.tryToConstructExternalContext(context, state, request);
        }
        else if (methodName == 'tests.reboot.GreeterMethods.TestLongRunningFetch') {
            return await this.testLongRunningFetch(context, state, request);
        }
        else if (methodName == 'tests.reboot.GreeterMethods.TestLongRunningWriter') {
            return await this.testLongRunningWriter(context, state, request);
        }
        else if (methodName == 'tests.reboot.GreeterMethods.GetWholeState') {
            return await this.getWholeState(context, state, request);
        }
        else if (methodName == 'tests.reboot.GreeterMethods.FailWithException') {
            return await this.failWithException(context, state, request);
        }
        else if (methodName == 'tests.reboot.GreeterMethods.FailWithAborted') {
            return await this.failWithAborted(context, state, request);
        }
        else if (methodName == 'tests.reboot.GreeterMethods.Workflow') {
            return await this.workflow(context, state, request);
        }
        else if (methodName == 'tests.reboot.GreeterMethods.DangerousFields') {
            return await this.dangerousFields(context, state, request);
        }
        else if (methodName == 'tests.reboot.GreeterMethods.StoreRecursiveMessage') {
            return await this.storeRecursiveMessage(context, state, request);
        }
        else if (methodName == 'tests.reboot.GreeterMethods.ReadRecursiveMessage') {
            return await this.readRecursiveMessage(context, state, request);
        }
        else if (methodName == 'tests.reboot.GreeterMethods.ConstructAndStoreRecursiveMessage') {
            return await this.constructAndStoreRecursiveMessage(context, state, request);
        }
        else {
            return new reboot_api.errors_pb.PermissionDenied();
        }
    }
    async create(context, request) {
        return await (__classPrivateFieldGet(this, _GreeterAuthorizer_rules, "f").create ?? __classPrivateFieldGet(this, _GreeterAuthorizer_rules, "f")._default).execute({
            context,
            request: request,
        });
    }
    async greet(context, state, request) {
        return await (__classPrivateFieldGet(this, _GreeterAuthorizer_rules, "f").greet ?? __classPrivateFieldGet(this, _GreeterAuthorizer_rules, "f")._default).execute({
            context,
            state,
            request: request,
        });
    }
    async setAdjective(context, state, request) {
        return await (__classPrivateFieldGet(this, _GreeterAuthorizer_rules, "f").setAdjective ?? __classPrivateFieldGet(this, _GreeterAuthorizer_rules, "f")._default).execute({
            context,
            state,
            request: request,
        });
    }
    async transactionSetAdjective(context, state, request) {
        return await (__classPrivateFieldGet(this, _GreeterAuthorizer_rules, "f").transactionSetAdjective ?? __classPrivateFieldGet(this, _GreeterAuthorizer_rules, "f")._default).execute({
            context,
            state,
            request: request,
        });
    }
    async tryToConstructContext(context, state, request) {
        return await (__classPrivateFieldGet(this, _GreeterAuthorizer_rules, "f").tryToConstructContext ?? __classPrivateFieldGet(this, _GreeterAuthorizer_rules, "f")._default).execute({
            context,
            state,
            request: request,
        });
    }
    async tryToConstructExternalContext(context, state, request) {
        return await (__classPrivateFieldGet(this, _GreeterAuthorizer_rules, "f").tryToConstructExternalContext ?? __classPrivateFieldGet(this, _GreeterAuthorizer_rules, "f")._default).execute({
            context,
            state,
            request: request,
        });
    }
    async testLongRunningFetch(context, state, request) {
        return await (__classPrivateFieldGet(this, _GreeterAuthorizer_rules, "f").testLongRunningFetch ?? __classPrivateFieldGet(this, _GreeterAuthorizer_rules, "f")._default).execute({
            context,
            state,
            request: request,
        });
    }
    async testLongRunningWriter(context, state, request) {
        return await (__classPrivateFieldGet(this, _GreeterAuthorizer_rules, "f").testLongRunningWriter ?? __classPrivateFieldGet(this, _GreeterAuthorizer_rules, "f")._default).execute({
            context,
            state,
            request: request,
        });
    }
    async getWholeState(context, state, request) {
        return await (__classPrivateFieldGet(this, _GreeterAuthorizer_rules, "f").getWholeState ?? __classPrivateFieldGet(this, _GreeterAuthorizer_rules, "f")._default).execute({
            context,
            state,
            request: request,
        });
    }
    async failWithException(context, state, request) {
        return await (__classPrivateFieldGet(this, _GreeterAuthorizer_rules, "f").failWithException ?? __classPrivateFieldGet(this, _GreeterAuthorizer_rules, "f")._default).execute({
            context,
            state,
            request: request,
        });
    }
    async failWithAborted(context, state, request) {
        return await (__classPrivateFieldGet(this, _GreeterAuthorizer_rules, "f").failWithAborted ?? __classPrivateFieldGet(this, _GreeterAuthorizer_rules, "f")._default).execute({
            context,
            state,
            request: request,
        });
    }
    async workflow(context, state, request) {
        return await (__classPrivateFieldGet(this, _GreeterAuthorizer_rules, "f").workflow ?? __classPrivateFieldGet(this, _GreeterAuthorizer_rules, "f")._default).execute({
            context,
            state,
            request: request,
        });
    }
    async dangerousFields(context, state, request) {
        return await (__classPrivateFieldGet(this, _GreeterAuthorizer_rules, "f").dangerousFields ?? __classPrivateFieldGet(this, _GreeterAuthorizer_rules, "f")._default).execute({
            context,
            state,
            request: request,
        });
    }
    async storeRecursiveMessage(context, state, request) {
        return await (__classPrivateFieldGet(this, _GreeterAuthorizer_rules, "f").storeRecursiveMessage ?? __classPrivateFieldGet(this, _GreeterAuthorizer_rules, "f")._default).execute({
            context,
            state,
            request: request,
        });
    }
    async readRecursiveMessage(context, state, request) {
        return await (__classPrivateFieldGet(this, _GreeterAuthorizer_rules, "f").readRecursiveMessage ?? __classPrivateFieldGet(this, _GreeterAuthorizer_rules, "f")._default).execute({
            context,
            state,
            request: request,
        });
    }
    async constructAndStoreRecursiveMessage(context, state, request) {
        return await (__classPrivateFieldGet(this, _GreeterAuthorizer_rules, "f").constructAndStoreRecursiveMessage ?? __classPrivateFieldGet(this, _GreeterAuthorizer_rules, "f")._default).execute({
            context,
            state,
            request: request,
        });
    }
}
_GreeterAuthorizer_rules = new WeakMap();
export class GreeterState extends GreeterProto {
    static fromBinary(bytes, options) {
        const state = new GreeterState();
        state.fromBinary(bytes, options);
        return state;
    }
    static fromJson(jsonValue, options) {
        const state = new GreeterState();
        state.fromJson(jsonValue, options);
        return state;
    }
    static fromJsonString(jsonString, options) {
        const state = new GreeterState();
        state.fromJsonString(jsonString, options);
        return state;
    }
    clone() {
        const state = new GreeterState();
        state.copyFrom(super.clone());
        return state;
    }
    copyFrom(that) {
        // Unfortunately, protobuf-es does not have `CopyFrom` like Python
        // or C++ protobuf. Instead, protobuf-es has `fromJson` but it
        // performs a merge. Thus, we have to first clear all of the fields
        // in the message before calling `fromJson`.
        reboot.clearFields(this);
        this.fromJson(that.toJson());
    }
}
export class GreeterCreateAborted extends reboot_api.Aborted {
    static fromStatus(status) {
        let error = reboot_api.errorFromGoogleRpcStatusDetails(status, GREETER_CREATE_ERROR_TYPES);
        if (error !== undefined) {
            return new Greeter.CreateAborted(error, { message: status.message });
        }
        error = reboot_api.errorFromGoogleRpcStatusCode(status);
        // TODO(benh): also consider getting the type names from
        // `status.details` and including that in `message` to make
        // debugging easier.
        return new Greeter.CreateAborted(error, { message: status.message });
    }
    toStatus() {
        const isObject = (value) => {
            return typeof value === 'object';
        };
        const isArray = (value) => {
            return Array.isArray(value);
        };
        const error = __classPrivateFieldGet(this, _GreeterCreateAborted_error, "f").toJson();
        if (!isObject(error) || isArray(error)) {
            throw new Error("Expecting 'error' to be an object (and not an array)");
        }
        const detail = { ...error };
        detail["@type"] = `type.googleapis.com/${__classPrivateFieldGet(this, _GreeterCreateAborted_error, "f").getType().typeName}`;
        return new reboot_api.Status({
            code: this.code,
            message: __classPrivateFieldGet(this, _GreeterCreateAborted_message, "f"),
            details: [detail]
        });
    }
    constructor(error, { message } = {}) {
        super();
        _GreeterCreateAborted_error.set(this, void 0);
        _GreeterCreateAborted_message.set(this, void 0);
        // Set the name of this error for even more information!
        this.name = this.constructor.name;
        __classPrivateFieldSet(this, _GreeterCreateAborted_error, error, "f");
        let code = reboot_api.grpcStatusCodeFromError(__classPrivateFieldGet(this, _GreeterCreateAborted_error, "f"));
        if (code === undefined) {
            // Must be one of the Reboot specific errors.
            code = reboot_api.StatusCode.ABORTED;
        }
        this.code = code;
        __classPrivateFieldSet(this, _GreeterCreateAborted_message, message, "f");
    }
    toString() {
        return `${this.name}: ${this.message}`;
    }
    get message() {
        return `${__classPrivateFieldGet(this, _GreeterCreateAborted_error, "f").getType().typeName}${__classPrivateFieldGet(this, _GreeterCreateAborted_message, "f") ? ": " + __classPrivateFieldGet(this, _GreeterCreateAborted_message, "f") : ""}`;
    }
    get error() {
        reboot_api.assert(__classPrivateFieldGet(this, _GreeterCreateAborted_error, "f") instanceof protobuf_es.Message);
        return __classPrivateFieldGet(this, _GreeterCreateAborted_error, "f");
    }
}
_GreeterCreateAborted_error = new WeakMap(), _GreeterCreateAborted_message = new WeakMap();
export class GreeterCreateTask {
    constructor(context, taskId) {
        _GreeterCreateTask_context.set(this, void 0);
        _GreeterCreateTask_promise.set(this, void 0);
        this.taskId = taskId;
        __classPrivateFieldSet(this, _GreeterCreateTask_context, context, "f");
    }
    static retrieve(context, { taskId }) {
        return new GreeterCreateTask(context, taskId);
    }
    then(...args) {
        if (__classPrivateFieldGet(this, _GreeterCreateTask_promise, "f") === undefined) {
            // NOTE: we lazily create the promise because it eagerly awaits
            // the task and if the task is not meant to complete, e.g., it
            // is control loop that runs forever, this may cause tests to
            // wait forever.
            __classPrivateFieldSet(this, _GreeterCreateTask_promise, new Promise(async (resolve, reject) => {
                const json = JSON.parse(await reboot_native.Task_await({
                    context: __classPrivateFieldGet(this, _GreeterCreateTask_context, "f").__external,
                    rbtModule: "tests.reboot.greeter_rbt",
                    stateName: "Greeter",
                    method: "Create",
                    jsonTaskId: JSON.stringify(this.taskId),
                }));
                if ("status" in json) {
                    reject(Greeter
                        .CreateAborted
                        .fromStatus(reboot_api.Status.fromJson(json["status"])));
                }
                else {
                    reboot_api.assert("response" in json);
                    resolve(GreeterCreateResponseFromProtobufShape(json["response"]));
                }
            }), "f");
        }
        return __classPrivateFieldGet(this, _GreeterCreateTask_promise, "f").then(...args);
    }
}
_GreeterCreateTask_context = new WeakMap(), _GreeterCreateTask_promise = new WeakMap();
export class GreeterGreetAborted extends reboot_api.Aborted {
    static fromStatus(status) {
        let error = reboot_api.errorFromGoogleRpcStatusDetails(status, GREETER_GREET_ERROR_TYPES);
        if (error !== undefined) {
            return new Greeter.GreetAborted(error, { message: status.message });
        }
        error = reboot_api.errorFromGoogleRpcStatusCode(status);
        // TODO(benh): also consider getting the type names from
        // `status.details` and including that in `message` to make
        // debugging easier.
        return new Greeter.GreetAborted(error, { message: status.message });
    }
    toStatus() {
        const isObject = (value) => {
            return typeof value === 'object';
        };
        const isArray = (value) => {
            return Array.isArray(value);
        };
        const error = __classPrivateFieldGet(this, _GreeterGreetAborted_error, "f").toJson();
        if (!isObject(error) || isArray(error)) {
            throw new Error("Expecting 'error' to be an object (and not an array)");
        }
        const detail = { ...error };
        detail["@type"] = `type.googleapis.com/${__classPrivateFieldGet(this, _GreeterGreetAborted_error, "f").getType().typeName}`;
        return new reboot_api.Status({
            code: this.code,
            message: __classPrivateFieldGet(this, _GreeterGreetAborted_message, "f"),
            details: [detail]
        });
    }
    constructor(error, { message } = {}) {
        super();
        _GreeterGreetAborted_error.set(this, void 0);
        _GreeterGreetAborted_message.set(this, void 0);
        // Set the name of this error for even more information!
        this.name = this.constructor.name;
        __classPrivateFieldSet(this, _GreeterGreetAborted_error, error, "f");
        let code = reboot_api.grpcStatusCodeFromError(__classPrivateFieldGet(this, _GreeterGreetAborted_error, "f"));
        if (code === undefined) {
            // Must be one of the Reboot specific errors.
            code = reboot_api.StatusCode.ABORTED;
        }
        this.code = code;
        __classPrivateFieldSet(this, _GreeterGreetAborted_message, message, "f");
    }
    toString() {
        return `${this.name}: ${this.message}`;
    }
    get message() {
        return `${__classPrivateFieldGet(this, _GreeterGreetAborted_error, "f").getType().typeName}${__classPrivateFieldGet(this, _GreeterGreetAborted_message, "f") ? ": " + __classPrivateFieldGet(this, _GreeterGreetAborted_message, "f") : ""}`;
    }
    get error() {
        reboot_api.assert(__classPrivateFieldGet(this, _GreeterGreetAborted_error, "f") instanceof protobuf_es.Message);
        return __classPrivateFieldGet(this, _GreeterGreetAborted_error, "f");
    }
}
_GreeterGreetAborted_error = new WeakMap(), _GreeterGreetAborted_message = new WeakMap();
export class GreeterGreetTask {
    constructor(context, taskId) {
        _GreeterGreetTask_context.set(this, void 0);
        _GreeterGreetTask_promise.set(this, void 0);
        this.taskId = taskId;
        __classPrivateFieldSet(this, _GreeterGreetTask_context, context, "f");
    }
    static retrieve(context, { taskId }) {
        return new GreeterGreetTask(context, taskId);
    }
    then(...args) {
        if (__classPrivateFieldGet(this, _GreeterGreetTask_promise, "f") === undefined) {
            // NOTE: we lazily create the promise because it eagerly awaits
            // the task and if the task is not meant to complete, e.g., it
            // is control loop that runs forever, this may cause tests to
            // wait forever.
            __classPrivateFieldSet(this, _GreeterGreetTask_promise, new Promise(async (resolve, reject) => {
                const json = JSON.parse(await reboot_native.Task_await({
                    context: __classPrivateFieldGet(this, _GreeterGreetTask_context, "f").__external,
                    rbtModule: "tests.reboot.greeter_rbt",
                    stateName: "Greeter",
                    method: "Greet",
                    jsonTaskId: JSON.stringify(this.taskId),
                }));
                if ("status" in json) {
                    reject(Greeter
                        .GreetAborted
                        .fromStatus(reboot_api.Status.fromJson(json["status"])));
                }
                else {
                    reboot_api.assert("response" in json);
                    resolve(GreeterGreetResponseFromProtobufShape(json["response"]));
                }
            }), "f");
        }
        return __classPrivateFieldGet(this, _GreeterGreetTask_promise, "f").then(...args);
    }
}
_GreeterGreetTask_context = new WeakMap(), _GreeterGreetTask_promise = new WeakMap();
export class GreeterSetAdjectiveAborted extends reboot_api.Aborted {
    static fromStatus(status) {
        let error = reboot_api.errorFromGoogleRpcStatusDetails(status, GREETER_SET_ADJECTIVE_ERROR_TYPES);
        if (error !== undefined) {
            return new Greeter.SetAdjectiveAborted(error, { message: status.message });
        }
        error = reboot_api.errorFromGoogleRpcStatusCode(status);
        // TODO(benh): also consider getting the type names from
        // `status.details` and including that in `message` to make
        // debugging easier.
        return new Greeter.SetAdjectiveAborted(error, { message: status.message });
    }
    toStatus() {
        const isObject = (value) => {
            return typeof value === 'object';
        };
        const isArray = (value) => {
            return Array.isArray(value);
        };
        const error = __classPrivateFieldGet(this, _GreeterSetAdjectiveAborted_error, "f").toJson();
        if (!isObject(error) || isArray(error)) {
            throw new Error("Expecting 'error' to be an object (and not an array)");
        }
        const detail = { ...error };
        detail["@type"] = `type.googleapis.com/${__classPrivateFieldGet(this, _GreeterSetAdjectiveAborted_error, "f").getType().typeName}`;
        return new reboot_api.Status({
            code: this.code,
            message: __classPrivateFieldGet(this, _GreeterSetAdjectiveAborted_message, "f"),
            details: [detail]
        });
    }
    constructor(error, { message } = {}) {
        super();
        _GreeterSetAdjectiveAborted_error.set(this, void 0);
        _GreeterSetAdjectiveAborted_message.set(this, void 0);
        // Set the name of this error for even more information!
        this.name = this.constructor.name;
        __classPrivateFieldSet(this, _GreeterSetAdjectiveAborted_error, error, "f");
        let code = reboot_api.grpcStatusCodeFromError(__classPrivateFieldGet(this, _GreeterSetAdjectiveAborted_error, "f"));
        if (code === undefined) {
            // Must be one of the Reboot specific errors.
            code = reboot_api.StatusCode.ABORTED;
        }
        this.code = code;
        __classPrivateFieldSet(this, _GreeterSetAdjectiveAborted_message, message, "f");
    }
    toString() {
        return `${this.name}: ${this.message}`;
    }
    get message() {
        return `${__classPrivateFieldGet(this, _GreeterSetAdjectiveAborted_error, "f").getType().typeName}${__classPrivateFieldGet(this, _GreeterSetAdjectiveAborted_message, "f") ? ": " + __classPrivateFieldGet(this, _GreeterSetAdjectiveAborted_message, "f") : ""}`;
    }
    get error() {
        reboot_api.assert(__classPrivateFieldGet(this, _GreeterSetAdjectiveAborted_error, "f") instanceof protobuf_es.Message);
        return __classPrivateFieldGet(this, _GreeterSetAdjectiveAborted_error, "f");
    }
}
_GreeterSetAdjectiveAborted_error = new WeakMap(), _GreeterSetAdjectiveAborted_message = new WeakMap();
export class GreeterSetAdjectiveTask {
    constructor(context, taskId) {
        _GreeterSetAdjectiveTask_context.set(this, void 0);
        _GreeterSetAdjectiveTask_promise.set(this, void 0);
        this.taskId = taskId;
        __classPrivateFieldSet(this, _GreeterSetAdjectiveTask_context, context, "f");
    }
    static retrieve(context, { taskId }) {
        return new GreeterSetAdjectiveTask(context, taskId);
    }
    then(...args) {
        if (__classPrivateFieldGet(this, _GreeterSetAdjectiveTask_promise, "f") === undefined) {
            // NOTE: we lazily create the promise because it eagerly awaits
            // the task and if the task is not meant to complete, e.g., it
            // is control loop that runs forever, this may cause tests to
            // wait forever.
            __classPrivateFieldSet(this, _GreeterSetAdjectiveTask_promise, new Promise(async (resolve, reject) => {
                const json = JSON.parse(await reboot_native.Task_await({
                    context: __classPrivateFieldGet(this, _GreeterSetAdjectiveTask_context, "f").__external,
                    rbtModule: "tests.reboot.greeter_rbt",
                    stateName: "Greeter",
                    method: "SetAdjective",
                    jsonTaskId: JSON.stringify(this.taskId),
                }));
                if ("status" in json) {
                    reject(Greeter
                        .SetAdjectiveAborted
                        .fromStatus(reboot_api.Status.fromJson(json["status"])));
                }
                else {
                    reboot_api.assert("response" in json);
                    resolve(GreeterSetAdjectiveResponseFromProtobufShape(json["response"]));
                }
            }), "f");
        }
        return __classPrivateFieldGet(this, _GreeterSetAdjectiveTask_promise, "f").then(...args);
    }
}
_GreeterSetAdjectiveTask_context = new WeakMap(), _GreeterSetAdjectiveTask_promise = new WeakMap();
export class GreeterTransactionSetAdjectiveAborted extends reboot_api.Aborted {
    static fromStatus(status) {
        let error = reboot_api.errorFromGoogleRpcStatusDetails(status, GREETER_TRANSACTION_SET_ADJECTIVE_ERROR_TYPES);
        if (error !== undefined) {
            return new Greeter.TransactionSetAdjectiveAborted(error, { message: status.message });
        }
        error = reboot_api.errorFromGoogleRpcStatusCode(status);
        // TODO(benh): also consider getting the type names from
        // `status.details` and including that in `message` to make
        // debugging easier.
        return new Greeter.TransactionSetAdjectiveAborted(error, { message: status.message });
    }
    toStatus() {
        const isObject = (value) => {
            return typeof value === 'object';
        };
        const isArray = (value) => {
            return Array.isArray(value);
        };
        const error = __classPrivateFieldGet(this, _GreeterTransactionSetAdjectiveAborted_error, "f").toJson();
        if (!isObject(error) || isArray(error)) {
            throw new Error("Expecting 'error' to be an object (and not an array)");
        }
        const detail = { ...error };
        detail["@type"] = `type.googleapis.com/${__classPrivateFieldGet(this, _GreeterTransactionSetAdjectiveAborted_error, "f").getType().typeName}`;
        return new reboot_api.Status({
            code: this.code,
            message: __classPrivateFieldGet(this, _GreeterTransactionSetAdjectiveAborted_message, "f"),
            details: [detail]
        });
    }
    constructor(error, { message } = {}) {
        super();
        _GreeterTransactionSetAdjectiveAborted_error.set(this, void 0);
        _GreeterTransactionSetAdjectiveAborted_message.set(this, void 0);
        // Set the name of this error for even more information!
        this.name = this.constructor.name;
        __classPrivateFieldSet(this, _GreeterTransactionSetAdjectiveAborted_error, error, "f");
        let code = reboot_api.grpcStatusCodeFromError(__classPrivateFieldGet(this, _GreeterTransactionSetAdjectiveAborted_error, "f"));
        if (code === undefined) {
            // Must be one of the Reboot specific errors.
            code = reboot_api.StatusCode.ABORTED;
        }
        this.code = code;
        __classPrivateFieldSet(this, _GreeterTransactionSetAdjectiveAborted_message, message, "f");
    }
    toString() {
        return `${this.name}: ${this.message}`;
    }
    get message() {
        return `${__classPrivateFieldGet(this, _GreeterTransactionSetAdjectiveAborted_error, "f").getType().typeName}${__classPrivateFieldGet(this, _GreeterTransactionSetAdjectiveAborted_message, "f") ? ": " + __classPrivateFieldGet(this, _GreeterTransactionSetAdjectiveAborted_message, "f") : ""}`;
    }
    get error() {
        reboot_api.assert(__classPrivateFieldGet(this, _GreeterTransactionSetAdjectiveAborted_error, "f") instanceof protobuf_es.Message);
        return __classPrivateFieldGet(this, _GreeterTransactionSetAdjectiveAborted_error, "f");
    }
}
_GreeterTransactionSetAdjectiveAborted_error = new WeakMap(), _GreeterTransactionSetAdjectiveAborted_message = new WeakMap();
export class GreeterTransactionSetAdjectiveTask {
    constructor(context, taskId) {
        _GreeterTransactionSetAdjectiveTask_context.set(this, void 0);
        _GreeterTransactionSetAdjectiveTask_promise.set(this, void 0);
        this.taskId = taskId;
        __classPrivateFieldSet(this, _GreeterTransactionSetAdjectiveTask_context, context, "f");
    }
    static retrieve(context, { taskId }) {
        return new GreeterTransactionSetAdjectiveTask(context, taskId);
    }
    then(...args) {
        if (__classPrivateFieldGet(this, _GreeterTransactionSetAdjectiveTask_promise, "f") === undefined) {
            // NOTE: we lazily create the promise because it eagerly awaits
            // the task and if the task is not meant to complete, e.g., it
            // is control loop that runs forever, this may cause tests to
            // wait forever.
            __classPrivateFieldSet(this, _GreeterTransactionSetAdjectiveTask_promise, new Promise(async (resolve, reject) => {
                const json = JSON.parse(await reboot_native.Task_await({
                    context: __classPrivateFieldGet(this, _GreeterTransactionSetAdjectiveTask_context, "f").__external,
                    rbtModule: "tests.reboot.greeter_rbt",
                    stateName: "Greeter",
                    method: "TransactionSetAdjective",
                    jsonTaskId: JSON.stringify(this.taskId),
                }));
                if ("status" in json) {
                    reject(Greeter
                        .TransactionSetAdjectiveAborted
                        .fromStatus(reboot_api.Status.fromJson(json["status"])));
                }
                else {
                    reboot_api.assert("response" in json);
                    resolve(GreeterTransactionSetAdjectiveResponseFromProtobufShape(json["response"]));
                }
            }), "f");
        }
        return __classPrivateFieldGet(this, _GreeterTransactionSetAdjectiveTask_promise, "f").then(...args);
    }
}
_GreeterTransactionSetAdjectiveTask_context = new WeakMap(), _GreeterTransactionSetAdjectiveTask_promise = new WeakMap();
export class GreeterTryToConstructContextAborted extends reboot_api.Aborted {
    static fromStatus(status) {
        let error = reboot_api.errorFromGoogleRpcStatusDetails(status, GREETER_TRY_TO_CONSTRUCT_CONTEXT_ERROR_TYPES);
        if (error !== undefined) {
            return new Greeter.TryToConstructContextAborted(error, { message: status.message });
        }
        error = reboot_api.errorFromGoogleRpcStatusCode(status);
        // TODO(benh): also consider getting the type names from
        // `status.details` and including that in `message` to make
        // debugging easier.
        return new Greeter.TryToConstructContextAborted(error, { message: status.message });
    }
    toStatus() {
        const isObject = (value) => {
            return typeof value === 'object';
        };
        const isArray = (value) => {
            return Array.isArray(value);
        };
        const error = __classPrivateFieldGet(this, _GreeterTryToConstructContextAborted_error, "f").toJson();
        if (!isObject(error) || isArray(error)) {
            throw new Error("Expecting 'error' to be an object (and not an array)");
        }
        const detail = { ...error };
        detail["@type"] = `type.googleapis.com/${__classPrivateFieldGet(this, _GreeterTryToConstructContextAborted_error, "f").getType().typeName}`;
        return new reboot_api.Status({
            code: this.code,
            message: __classPrivateFieldGet(this, _GreeterTryToConstructContextAborted_message, "f"),
            details: [detail]
        });
    }
    constructor(error, { message } = {}) {
        super();
        _GreeterTryToConstructContextAborted_error.set(this, void 0);
        _GreeterTryToConstructContextAborted_message.set(this, void 0);
        // Set the name of this error for even more information!
        this.name = this.constructor.name;
        __classPrivateFieldSet(this, _GreeterTryToConstructContextAborted_error, error, "f");
        let code = reboot_api.grpcStatusCodeFromError(__classPrivateFieldGet(this, _GreeterTryToConstructContextAborted_error, "f"));
        if (code === undefined) {
            // Must be one of the Reboot specific errors.
            code = reboot_api.StatusCode.ABORTED;
        }
        this.code = code;
        __classPrivateFieldSet(this, _GreeterTryToConstructContextAborted_message, message, "f");
    }
    toString() {
        return `${this.name}: ${this.message}`;
    }
    get message() {
        return `${__classPrivateFieldGet(this, _GreeterTryToConstructContextAborted_error, "f").getType().typeName}${__classPrivateFieldGet(this, _GreeterTryToConstructContextAborted_message, "f") ? ": " + __classPrivateFieldGet(this, _GreeterTryToConstructContextAborted_message, "f") : ""}`;
    }
    get error() {
        reboot_api.assert(__classPrivateFieldGet(this, _GreeterTryToConstructContextAborted_error, "f") instanceof protobuf_es.Message);
        return __classPrivateFieldGet(this, _GreeterTryToConstructContextAborted_error, "f");
    }
}
_GreeterTryToConstructContextAborted_error = new WeakMap(), _GreeterTryToConstructContextAborted_message = new WeakMap();
export class GreeterTryToConstructContextTask {
    constructor(context, taskId) {
        _GreeterTryToConstructContextTask_context.set(this, void 0);
        _GreeterTryToConstructContextTask_promise.set(this, void 0);
        this.taskId = taskId;
        __classPrivateFieldSet(this, _GreeterTryToConstructContextTask_context, context, "f");
    }
    static retrieve(context, { taskId }) {
        return new GreeterTryToConstructContextTask(context, taskId);
    }
    then(...args) {
        if (__classPrivateFieldGet(this, _GreeterTryToConstructContextTask_promise, "f") === undefined) {
            // NOTE: we lazily create the promise because it eagerly awaits
            // the task and if the task is not meant to complete, e.g., it
            // is control loop that runs forever, this may cause tests to
            // wait forever.
            __classPrivateFieldSet(this, _GreeterTryToConstructContextTask_promise, new Promise(async (resolve, reject) => {
                const json = JSON.parse(await reboot_native.Task_await({
                    context: __classPrivateFieldGet(this, _GreeterTryToConstructContextTask_context, "f").__external,
                    rbtModule: "tests.reboot.greeter_rbt",
                    stateName: "Greeter",
                    method: "TryToConstructContext",
                    jsonTaskId: JSON.stringify(this.taskId),
                }));
                if ("status" in json) {
                    reject(Greeter
                        .TryToConstructContextAborted
                        .fromStatus(reboot_api.Status.fromJson(json["status"])));
                }
                else {
                    reboot_api.assert("response" in json);
                    resolve(GreeterTryToConstructContextResponseFromProtobufShape(json["response"]));
                }
            }), "f");
        }
        return __classPrivateFieldGet(this, _GreeterTryToConstructContextTask_promise, "f").then(...args);
    }
}
_GreeterTryToConstructContextTask_context = new WeakMap(), _GreeterTryToConstructContextTask_promise = new WeakMap();
export class GreeterTryToConstructExternalContextAborted extends reboot_api.Aborted {
    static fromStatus(status) {
        let error = reboot_api.errorFromGoogleRpcStatusDetails(status, GREETER_TRY_TO_CONSTRUCT_EXTERNAL_CONTEXT_ERROR_TYPES);
        if (error !== undefined) {
            return new Greeter.TryToConstructExternalContextAborted(error, { message: status.message });
        }
        error = reboot_api.errorFromGoogleRpcStatusCode(status);
        // TODO(benh): also consider getting the type names from
        // `status.details` and including that in `message` to make
        // debugging easier.
        return new Greeter.TryToConstructExternalContextAborted(error, { message: status.message });
    }
    toStatus() {
        const isObject = (value) => {
            return typeof value === 'object';
        };
        const isArray = (value) => {
            return Array.isArray(value);
        };
        const error = __classPrivateFieldGet(this, _GreeterTryToConstructExternalContextAborted_error, "f").toJson();
        if (!isObject(error) || isArray(error)) {
            throw new Error("Expecting 'error' to be an object (and not an array)");
        }
        const detail = { ...error };
        detail["@type"] = `type.googleapis.com/${__classPrivateFieldGet(this, _GreeterTryToConstructExternalContextAborted_error, "f").getType().typeName}`;
        return new reboot_api.Status({
            code: this.code,
            message: __classPrivateFieldGet(this, _GreeterTryToConstructExternalContextAborted_message, "f"),
            details: [detail]
        });
    }
    constructor(error, { message } = {}) {
        super();
        _GreeterTryToConstructExternalContextAborted_error.set(this, void 0);
        _GreeterTryToConstructExternalContextAborted_message.set(this, void 0);
        // Set the name of this error for even more information!
        this.name = this.constructor.name;
        __classPrivateFieldSet(this, _GreeterTryToConstructExternalContextAborted_error, error, "f");
        let code = reboot_api.grpcStatusCodeFromError(__classPrivateFieldGet(this, _GreeterTryToConstructExternalContextAborted_error, "f"));
        if (code === undefined) {
            // Must be one of the Reboot specific errors.
            code = reboot_api.StatusCode.ABORTED;
        }
        this.code = code;
        __classPrivateFieldSet(this, _GreeterTryToConstructExternalContextAborted_message, message, "f");
    }
    toString() {
        return `${this.name}: ${this.message}`;
    }
    get message() {
        return `${__classPrivateFieldGet(this, _GreeterTryToConstructExternalContextAborted_error, "f").getType().typeName}${__classPrivateFieldGet(this, _GreeterTryToConstructExternalContextAborted_message, "f") ? ": " + __classPrivateFieldGet(this, _GreeterTryToConstructExternalContextAborted_message, "f") : ""}`;
    }
    get error() {
        reboot_api.assert(__classPrivateFieldGet(this, _GreeterTryToConstructExternalContextAborted_error, "f") instanceof protobuf_es.Message);
        return __classPrivateFieldGet(this, _GreeterTryToConstructExternalContextAborted_error, "f");
    }
}
_GreeterTryToConstructExternalContextAborted_error = new WeakMap(), _GreeterTryToConstructExternalContextAborted_message = new WeakMap();
export class GreeterTryToConstructExternalContextTask {
    constructor(context, taskId) {
        _GreeterTryToConstructExternalContextTask_context.set(this, void 0);
        _GreeterTryToConstructExternalContextTask_promise.set(this, void 0);
        this.taskId = taskId;
        __classPrivateFieldSet(this, _GreeterTryToConstructExternalContextTask_context, context, "f");
    }
    static retrieve(context, { taskId }) {
        return new GreeterTryToConstructExternalContextTask(context, taskId);
    }
    then(...args) {
        if (__classPrivateFieldGet(this, _GreeterTryToConstructExternalContextTask_promise, "f") === undefined) {
            // NOTE: we lazily create the promise because it eagerly awaits
            // the task and if the task is not meant to complete, e.g., it
            // is control loop that runs forever, this may cause tests to
            // wait forever.
            __classPrivateFieldSet(this, _GreeterTryToConstructExternalContextTask_promise, new Promise(async (resolve, reject) => {
                const json = JSON.parse(await reboot_native.Task_await({
                    context: __classPrivateFieldGet(this, _GreeterTryToConstructExternalContextTask_context, "f").__external,
                    rbtModule: "tests.reboot.greeter_rbt",
                    stateName: "Greeter",
                    method: "TryToConstructExternalContext",
                    jsonTaskId: JSON.stringify(this.taskId),
                }));
                if ("status" in json) {
                    reject(Greeter
                        .TryToConstructExternalContextAborted
                        .fromStatus(reboot_api.Status.fromJson(json["status"])));
                }
                else {
                    reboot_api.assert("response" in json);
                    resolve(GreeterTryToConstructExternalContextResponseFromProtobufShape(json["response"]));
                }
            }), "f");
        }
        return __classPrivateFieldGet(this, _GreeterTryToConstructExternalContextTask_promise, "f").then(...args);
    }
}
_GreeterTryToConstructExternalContextTask_context = new WeakMap(), _GreeterTryToConstructExternalContextTask_promise = new WeakMap();
export class GreeterTestLongRunningFetchAborted extends reboot_api.Aborted {
    static fromStatus(status) {
        let error = reboot_api.errorFromGoogleRpcStatusDetails(status, GREETER_TEST_LONG_RUNNING_FETCH_ERROR_TYPES);
        if (error !== undefined) {
            return new Greeter.TestLongRunningFetchAborted(error, { message: status.message });
        }
        error = reboot_api.errorFromGoogleRpcStatusCode(status);
        // TODO(benh): also consider getting the type names from
        // `status.details` and including that in `message` to make
        // debugging easier.
        return new Greeter.TestLongRunningFetchAborted(error, { message: status.message });
    }
    toStatus() {
        const isObject = (value) => {
            return typeof value === 'object';
        };
        const isArray = (value) => {
            return Array.isArray(value);
        };
        const error = __classPrivateFieldGet(this, _GreeterTestLongRunningFetchAborted_error, "f").toJson();
        if (!isObject(error) || isArray(error)) {
            throw new Error("Expecting 'error' to be an object (and not an array)");
        }
        const detail = { ...error };
        detail["@type"] = `type.googleapis.com/${__classPrivateFieldGet(this, _GreeterTestLongRunningFetchAborted_error, "f").getType().typeName}`;
        return new reboot_api.Status({
            code: this.code,
            message: __classPrivateFieldGet(this, _GreeterTestLongRunningFetchAborted_message, "f"),
            details: [detail]
        });
    }
    constructor(error, { message } = {}) {
        super();
        _GreeterTestLongRunningFetchAborted_error.set(this, void 0);
        _GreeterTestLongRunningFetchAborted_message.set(this, void 0);
        // Set the name of this error for even more information!
        this.name = this.constructor.name;
        __classPrivateFieldSet(this, _GreeterTestLongRunningFetchAborted_error, error, "f");
        let code = reboot_api.grpcStatusCodeFromError(__classPrivateFieldGet(this, _GreeterTestLongRunningFetchAborted_error, "f"));
        if (code === undefined) {
            // Must be one of the Reboot specific errors.
            code = reboot_api.StatusCode.ABORTED;
        }
        this.code = code;
        __classPrivateFieldSet(this, _GreeterTestLongRunningFetchAborted_message, message, "f");
    }
    toString() {
        return `${this.name}: ${this.message}`;
    }
    get message() {
        return `${__classPrivateFieldGet(this, _GreeterTestLongRunningFetchAborted_error, "f").getType().typeName}${__classPrivateFieldGet(this, _GreeterTestLongRunningFetchAborted_message, "f") ? ": " + __classPrivateFieldGet(this, _GreeterTestLongRunningFetchAborted_message, "f") : ""}`;
    }
    get error() {
        reboot_api.assert(__classPrivateFieldGet(this, _GreeterTestLongRunningFetchAborted_error, "f") instanceof protobuf_es.Message);
        return __classPrivateFieldGet(this, _GreeterTestLongRunningFetchAborted_error, "f");
    }
}
_GreeterTestLongRunningFetchAborted_error = new WeakMap(), _GreeterTestLongRunningFetchAborted_message = new WeakMap();
export class GreeterTestLongRunningFetchTask {
    constructor(context, taskId) {
        _GreeterTestLongRunningFetchTask_context.set(this, void 0);
        _GreeterTestLongRunningFetchTask_promise.set(this, void 0);
        this.taskId = taskId;
        __classPrivateFieldSet(this, _GreeterTestLongRunningFetchTask_context, context, "f");
    }
    static retrieve(context, { taskId }) {
        return new GreeterTestLongRunningFetchTask(context, taskId);
    }
    then(...args) {
        if (__classPrivateFieldGet(this, _GreeterTestLongRunningFetchTask_promise, "f") === undefined) {
            // NOTE: we lazily create the promise because it eagerly awaits
            // the task and if the task is not meant to complete, e.g., it
            // is control loop that runs forever, this may cause tests to
            // wait forever.
            __classPrivateFieldSet(this, _GreeterTestLongRunningFetchTask_promise, new Promise(async (resolve, reject) => {
                const json = JSON.parse(await reboot_native.Task_await({
                    context: __classPrivateFieldGet(this, _GreeterTestLongRunningFetchTask_context, "f").__external,
                    rbtModule: "tests.reboot.greeter_rbt",
                    stateName: "Greeter",
                    method: "TestLongRunningFetch",
                    jsonTaskId: JSON.stringify(this.taskId),
                }));
                if ("status" in json) {
                    reject(Greeter
                        .TestLongRunningFetchAborted
                        .fromStatus(reboot_api.Status.fromJson(json["status"])));
                }
                else {
                    reboot_api.assert("response" in json);
                    resolve(GreeterTestLongRunningFetchResponseFromProtobufShape(json["response"]));
                }
            }), "f");
        }
        return __classPrivateFieldGet(this, _GreeterTestLongRunningFetchTask_promise, "f").then(...args);
    }
}
_GreeterTestLongRunningFetchTask_context = new WeakMap(), _GreeterTestLongRunningFetchTask_promise = new WeakMap();
export class GreeterTestLongRunningWriterAborted extends reboot_api.Aborted {
    static fromStatus(status) {
        let error = reboot_api.errorFromGoogleRpcStatusDetails(status, GREETER_TEST_LONG_RUNNING_WRITER_ERROR_TYPES);
        if (error !== undefined) {
            return new Greeter.TestLongRunningWriterAborted(error, { message: status.message });
        }
        error = reboot_api.errorFromGoogleRpcStatusCode(status);
        // TODO(benh): also consider getting the type names from
        // `status.details` and including that in `message` to make
        // debugging easier.
        return new Greeter.TestLongRunningWriterAborted(error, { message: status.message });
    }
    toStatus() {
        const isObject = (value) => {
            return typeof value === 'object';
        };
        const isArray = (value) => {
            return Array.isArray(value);
        };
        const error = __classPrivateFieldGet(this, _GreeterTestLongRunningWriterAborted_error, "f").toJson();
        if (!isObject(error) || isArray(error)) {
            throw new Error("Expecting 'error' to be an object (and not an array)");
        }
        const detail = { ...error };
        detail["@type"] = `type.googleapis.com/${__classPrivateFieldGet(this, _GreeterTestLongRunningWriterAborted_error, "f").getType().typeName}`;
        return new reboot_api.Status({
            code: this.code,
            message: __classPrivateFieldGet(this, _GreeterTestLongRunningWriterAborted_message, "f"),
            details: [detail]
        });
    }
    constructor(error, { message } = {}) {
        super();
        _GreeterTestLongRunningWriterAborted_error.set(this, void 0);
        _GreeterTestLongRunningWriterAborted_message.set(this, void 0);
        // Set the name of this error for even more information!
        this.name = this.constructor.name;
        __classPrivateFieldSet(this, _GreeterTestLongRunningWriterAborted_error, error, "f");
        let code = reboot_api.grpcStatusCodeFromError(__classPrivateFieldGet(this, _GreeterTestLongRunningWriterAborted_error, "f"));
        if (code === undefined) {
            // Must be one of the Reboot specific errors.
            code = reboot_api.StatusCode.ABORTED;
        }
        this.code = code;
        __classPrivateFieldSet(this, _GreeterTestLongRunningWriterAborted_message, message, "f");
    }
    toString() {
        return `${this.name}: ${this.message}`;
    }
    get message() {
        return `${__classPrivateFieldGet(this, _GreeterTestLongRunningWriterAborted_error, "f").getType().typeName}${__classPrivateFieldGet(this, _GreeterTestLongRunningWriterAborted_message, "f") ? ": " + __classPrivateFieldGet(this, _GreeterTestLongRunningWriterAborted_message, "f") : ""}`;
    }
    get error() {
        reboot_api.assert(__classPrivateFieldGet(this, _GreeterTestLongRunningWriterAborted_error, "f") instanceof protobuf_es.Message);
        return __classPrivateFieldGet(this, _GreeterTestLongRunningWriterAborted_error, "f");
    }
}
_GreeterTestLongRunningWriterAborted_error = new WeakMap(), _GreeterTestLongRunningWriterAborted_message = new WeakMap();
export class GreeterTestLongRunningWriterTask {
    constructor(context, taskId) {
        _GreeterTestLongRunningWriterTask_context.set(this, void 0);
        _GreeterTestLongRunningWriterTask_promise.set(this, void 0);
        this.taskId = taskId;
        __classPrivateFieldSet(this, _GreeterTestLongRunningWriterTask_context, context, "f");
    }
    static retrieve(context, { taskId }) {
        return new GreeterTestLongRunningWriterTask(context, taskId);
    }
    then(...args) {
        if (__classPrivateFieldGet(this, _GreeterTestLongRunningWriterTask_promise, "f") === undefined) {
            // NOTE: we lazily create the promise because it eagerly awaits
            // the task and if the task is not meant to complete, e.g., it
            // is control loop that runs forever, this may cause tests to
            // wait forever.
            __classPrivateFieldSet(this, _GreeterTestLongRunningWriterTask_promise, new Promise(async (resolve, reject) => {
                const json = JSON.parse(await reboot_native.Task_await({
                    context: __classPrivateFieldGet(this, _GreeterTestLongRunningWriterTask_context, "f").__external,
                    rbtModule: "tests.reboot.greeter_rbt",
                    stateName: "Greeter",
                    method: "TestLongRunningWriter",
                    jsonTaskId: JSON.stringify(this.taskId),
                }));
                if ("status" in json) {
                    reject(Greeter
                        .TestLongRunningWriterAborted
                        .fromStatus(reboot_api.Status.fromJson(json["status"])));
                }
                else {
                    reboot_api.assert("response" in json);
                    resolve(GreeterTestLongRunningWriterResponseFromProtobufShape(json["response"]));
                }
            }), "f");
        }
        return __classPrivateFieldGet(this, _GreeterTestLongRunningWriterTask_promise, "f").then(...args);
    }
}
_GreeterTestLongRunningWriterTask_context = new WeakMap(), _GreeterTestLongRunningWriterTask_promise = new WeakMap();
export class GreeterGetWholeStateAborted extends reboot_api.Aborted {
    static fromStatus(status) {
        let error = reboot_api.errorFromGoogleRpcStatusDetails(status, GREETER_GET_WHOLE_STATE_ERROR_TYPES);
        if (error !== undefined) {
            return new Greeter.GetWholeStateAborted(error, { message: status.message });
        }
        error = reboot_api.errorFromGoogleRpcStatusCode(status);
        // TODO(benh): also consider getting the type names from
        // `status.details` and including that in `message` to make
        // debugging easier.
        return new Greeter.GetWholeStateAborted(error, { message: status.message });
    }
    toStatus() {
        const isObject = (value) => {
            return typeof value === 'object';
        };
        const isArray = (value) => {
            return Array.isArray(value);
        };
        const error = __classPrivateFieldGet(this, _GreeterGetWholeStateAborted_error, "f").toJson();
        if (!isObject(error) || isArray(error)) {
            throw new Error("Expecting 'error' to be an object (and not an array)");
        }
        const detail = { ...error };
        detail["@type"] = `type.googleapis.com/${__classPrivateFieldGet(this, _GreeterGetWholeStateAborted_error, "f").getType().typeName}`;
        return new reboot_api.Status({
            code: this.code,
            message: __classPrivateFieldGet(this, _GreeterGetWholeStateAborted_message, "f"),
            details: [detail]
        });
    }
    constructor(error, { message } = {}) {
        super();
        _GreeterGetWholeStateAborted_error.set(this, void 0);
        _GreeterGetWholeStateAborted_message.set(this, void 0);
        // Set the name of this error for even more information!
        this.name = this.constructor.name;
        __classPrivateFieldSet(this, _GreeterGetWholeStateAborted_error, error, "f");
        let code = reboot_api.grpcStatusCodeFromError(__classPrivateFieldGet(this, _GreeterGetWholeStateAborted_error, "f"));
        if (code === undefined) {
            // Must be one of the Reboot specific errors.
            code = reboot_api.StatusCode.ABORTED;
        }
        this.code = code;
        __classPrivateFieldSet(this, _GreeterGetWholeStateAborted_message, message, "f");
    }
    toString() {
        return `${this.name}: ${this.message}`;
    }
    get message() {
        return `${__classPrivateFieldGet(this, _GreeterGetWholeStateAborted_error, "f").getType().typeName}${__classPrivateFieldGet(this, _GreeterGetWholeStateAborted_message, "f") ? ": " + __classPrivateFieldGet(this, _GreeterGetWholeStateAborted_message, "f") : ""}`;
    }
    get error() {
        reboot_api.assert(__classPrivateFieldGet(this, _GreeterGetWholeStateAborted_error, "f") instanceof protobuf_es.Message);
        return __classPrivateFieldGet(this, _GreeterGetWholeStateAborted_error, "f");
    }
}
_GreeterGetWholeStateAborted_error = new WeakMap(), _GreeterGetWholeStateAborted_message = new WeakMap();
export class GreeterGetWholeStateTask {
    constructor(context, taskId) {
        _GreeterGetWholeStateTask_context.set(this, void 0);
        _GreeterGetWholeStateTask_promise.set(this, void 0);
        this.taskId = taskId;
        __classPrivateFieldSet(this, _GreeterGetWholeStateTask_context, context, "f");
    }
    static retrieve(context, { taskId }) {
        return new GreeterGetWholeStateTask(context, taskId);
    }
    then(...args) {
        if (__classPrivateFieldGet(this, _GreeterGetWholeStateTask_promise, "f") === undefined) {
            // NOTE: we lazily create the promise because it eagerly awaits
            // the task and if the task is not meant to complete, e.g., it
            // is control loop that runs forever, this may cause tests to
            // wait forever.
            __classPrivateFieldSet(this, _GreeterGetWholeStateTask_promise, new Promise(async (resolve, reject) => {
                const json = JSON.parse(await reboot_native.Task_await({
                    context: __classPrivateFieldGet(this, _GreeterGetWholeStateTask_context, "f").__external,
                    rbtModule: "tests.reboot.greeter_rbt",
                    stateName: "Greeter",
                    method: "GetWholeState",
                    jsonTaskId: JSON.stringify(this.taskId),
                }));
                if ("status" in json) {
                    reject(Greeter
                        .GetWholeStateAborted
                        .fromStatus(reboot_api.Status.fromJson(json["status"])));
                }
                else {
                    reboot_api.assert("response" in json);
                    resolve(GreeterGetWholeStateResponseFromProtobufShape(json["response"]));
                }
            }), "f");
        }
        return __classPrivateFieldGet(this, _GreeterGetWholeStateTask_promise, "f").then(...args);
    }
}
_GreeterGetWholeStateTask_context = new WeakMap(), _GreeterGetWholeStateTask_promise = new WeakMap();
export class GreeterFailWithExceptionAborted extends reboot_api.Aborted {
    static fromStatus(status) {
        let error = reboot_api.errorFromGoogleRpcStatusDetails(status, GREETER_FAIL_WITH_EXCEPTION_ERROR_TYPES);
        if (error !== undefined) {
            return new Greeter.FailWithExceptionAborted(error, { message: status.message });
        }
        error = reboot_api.errorFromGoogleRpcStatusCode(status);
        // TODO(benh): also consider getting the type names from
        // `status.details` and including that in `message` to make
        // debugging easier.
        return new Greeter.FailWithExceptionAborted(error, { message: status.message });
    }
    toStatus() {
        const isObject = (value) => {
            return typeof value === 'object';
        };
        const isArray = (value) => {
            return Array.isArray(value);
        };
        const error = __classPrivateFieldGet(this, _GreeterFailWithExceptionAborted_error, "f").toJson();
        if (!isObject(error) || isArray(error)) {
            throw new Error("Expecting 'error' to be an object (and not an array)");
        }
        const detail = { ...error };
        detail["@type"] = `type.googleapis.com/${__classPrivateFieldGet(this, _GreeterFailWithExceptionAborted_error, "f").getType().typeName}`;
        return new reboot_api.Status({
            code: this.code,
            message: __classPrivateFieldGet(this, _GreeterFailWithExceptionAborted_message, "f"),
            details: [detail]
        });
    }
    constructor(error, { message } = {}) {
        super();
        _GreeterFailWithExceptionAborted_error.set(this, void 0);
        _GreeterFailWithExceptionAborted_message.set(this, void 0);
        // Set the name of this error for even more information!
        this.name = this.constructor.name;
        __classPrivateFieldSet(this, _GreeterFailWithExceptionAborted_error, error, "f");
        let code = reboot_api.grpcStatusCodeFromError(__classPrivateFieldGet(this, _GreeterFailWithExceptionAborted_error, "f"));
        if (code === undefined) {
            // Must be one of the Reboot specific errors.
            code = reboot_api.StatusCode.ABORTED;
        }
        this.code = code;
        __classPrivateFieldSet(this, _GreeterFailWithExceptionAborted_message, message, "f");
    }
    toString() {
        return `${this.name}: ${this.message}`;
    }
    get message() {
        return `${__classPrivateFieldGet(this, _GreeterFailWithExceptionAborted_error, "f").getType().typeName}${__classPrivateFieldGet(this, _GreeterFailWithExceptionAborted_message, "f") ? ": " + __classPrivateFieldGet(this, _GreeterFailWithExceptionAborted_message, "f") : ""}`;
    }
    get error() {
        reboot_api.assert(__classPrivateFieldGet(this, _GreeterFailWithExceptionAborted_error, "f") instanceof protobuf_es.Message);
        return __classPrivateFieldGet(this, _GreeterFailWithExceptionAborted_error, "f");
    }
}
_GreeterFailWithExceptionAborted_error = new WeakMap(), _GreeterFailWithExceptionAborted_message = new WeakMap();
export class GreeterFailWithExceptionTask {
    constructor(context, taskId) {
        _GreeterFailWithExceptionTask_context.set(this, void 0);
        _GreeterFailWithExceptionTask_promise.set(this, void 0);
        this.taskId = taskId;
        __classPrivateFieldSet(this, _GreeterFailWithExceptionTask_context, context, "f");
    }
    static retrieve(context, { taskId }) {
        return new GreeterFailWithExceptionTask(context, taskId);
    }
    then(...args) {
        if (__classPrivateFieldGet(this, _GreeterFailWithExceptionTask_promise, "f") === undefined) {
            // NOTE: we lazily create the promise because it eagerly awaits
            // the task and if the task is not meant to complete, e.g., it
            // is control loop that runs forever, this may cause tests to
            // wait forever.
            __classPrivateFieldSet(this, _GreeterFailWithExceptionTask_promise, new Promise(async (resolve, reject) => {
                const json = JSON.parse(await reboot_native.Task_await({
                    context: __classPrivateFieldGet(this, _GreeterFailWithExceptionTask_context, "f").__external,
                    rbtModule: "tests.reboot.greeter_rbt",
                    stateName: "Greeter",
                    method: "FailWithException",
                    jsonTaskId: JSON.stringify(this.taskId),
                }));
                if ("status" in json) {
                    reject(Greeter
                        .FailWithExceptionAborted
                        .fromStatus(reboot_api.Status.fromJson(json["status"])));
                }
                else {
                    reboot_api.assert("response" in json);
                    resolve(GreeterFailWithExceptionResponseFromProtobufShape(json["response"]));
                }
            }), "f");
        }
        return __classPrivateFieldGet(this, _GreeterFailWithExceptionTask_promise, "f").then(...args);
    }
}
_GreeterFailWithExceptionTask_context = new WeakMap(), _GreeterFailWithExceptionTask_promise = new WeakMap();
export class GreeterFailWithAbortedAborted extends reboot_api.Aborted {
    static fromStatus(status) {
        let error = reboot_api.errorFromGoogleRpcStatusDetails(status, GREETER_FAIL_WITH_ABORTED_ERROR_TYPES);
        if (error !== undefined) {
            return new Greeter.FailWithAbortedAborted(error, { message: status.message });
        }
        error = reboot_api.errorFromGoogleRpcStatusCode(status);
        // TODO(benh): also consider getting the type names from
        // `status.details` and including that in `message` to make
        // debugging easier.
        return new Greeter.FailWithAbortedAborted(error, { message: status.message });
    }
    toStatus() {
        const isObject = (value) => {
            return typeof value === 'object';
        };
        const isArray = (value) => {
            return Array.isArray(value);
        };
        const error = __classPrivateFieldGet(this, _GreeterFailWithAbortedAborted_error, "f").toJson();
        if (!isObject(error) || isArray(error)) {
            throw new Error("Expecting 'error' to be an object (and not an array)");
        }
        const detail = { ...error };
        detail["@type"] = `type.googleapis.com/${__classPrivateFieldGet(this, _GreeterFailWithAbortedAborted_error, "f").getType().typeName}`;
        return new reboot_api.Status({
            code: this.code,
            message: __classPrivateFieldGet(this, _GreeterFailWithAbortedAborted_message, "f"),
            details: [detail]
        });
    }
    constructor(error, { message } = {}) {
        super();
        _GreeterFailWithAbortedAborted_error.set(this, void 0);
        _GreeterFailWithAbortedAborted_message.set(this, void 0);
        // Set the name of this error for even more information!
        this.name = this.constructor.name;
        __classPrivateFieldSet(this, _GreeterFailWithAbortedAborted_error, error, "f");
        let code = reboot_api.grpcStatusCodeFromError(__classPrivateFieldGet(this, _GreeterFailWithAbortedAborted_error, "f"));
        if (code === undefined) {
            // Must be one of the Reboot specific errors.
            code = reboot_api.StatusCode.ABORTED;
        }
        this.code = code;
        __classPrivateFieldSet(this, _GreeterFailWithAbortedAborted_message, message, "f");
    }
    toString() {
        return `${this.name}: ${this.message}`;
    }
    get message() {
        return `${__classPrivateFieldGet(this, _GreeterFailWithAbortedAborted_error, "f").getType().typeName}${__classPrivateFieldGet(this, _GreeterFailWithAbortedAborted_message, "f") ? ": " + __classPrivateFieldGet(this, _GreeterFailWithAbortedAborted_message, "f") : ""}`;
    }
    get error() {
        reboot_api.assert(__classPrivateFieldGet(this, _GreeterFailWithAbortedAborted_error, "f") instanceof protobuf_es.Message);
        return __classPrivateFieldGet(this, _GreeterFailWithAbortedAborted_error, "f");
    }
}
_GreeterFailWithAbortedAborted_error = new WeakMap(), _GreeterFailWithAbortedAborted_message = new WeakMap();
export class GreeterFailWithAbortedTask {
    constructor(context, taskId) {
        _GreeterFailWithAbortedTask_context.set(this, void 0);
        _GreeterFailWithAbortedTask_promise.set(this, void 0);
        this.taskId = taskId;
        __classPrivateFieldSet(this, _GreeterFailWithAbortedTask_context, context, "f");
    }
    static retrieve(context, { taskId }) {
        return new GreeterFailWithAbortedTask(context, taskId);
    }
    then(...args) {
        if (__classPrivateFieldGet(this, _GreeterFailWithAbortedTask_promise, "f") === undefined) {
            // NOTE: we lazily create the promise because it eagerly awaits
            // the task and if the task is not meant to complete, e.g., it
            // is control loop that runs forever, this may cause tests to
            // wait forever.
            __classPrivateFieldSet(this, _GreeterFailWithAbortedTask_promise, new Promise(async (resolve, reject) => {
                const json = JSON.parse(await reboot_native.Task_await({
                    context: __classPrivateFieldGet(this, _GreeterFailWithAbortedTask_context, "f").__external,
                    rbtModule: "tests.reboot.greeter_rbt",
                    stateName: "Greeter",
                    method: "FailWithAborted",
                    jsonTaskId: JSON.stringify(this.taskId),
                }));
                if ("status" in json) {
                    reject(Greeter
                        .FailWithAbortedAborted
                        .fromStatus(reboot_api.Status.fromJson(json["status"])));
                }
                else {
                    reboot_api.assert("response" in json);
                    resolve(GreeterFailWithAbortedResponseFromProtobufShape(json["response"]));
                }
            }), "f");
        }
        return __classPrivateFieldGet(this, _GreeterFailWithAbortedTask_promise, "f").then(...args);
    }
}
_GreeterFailWithAbortedTask_context = new WeakMap(), _GreeterFailWithAbortedTask_promise = new WeakMap();
export class GreeterWorkflowAborted extends reboot_api.Aborted {
    static fromStatus(status) {
        let error = reboot_api.errorFromGoogleRpcStatusDetails(status, GREETER_WORKFLOW_ERROR_TYPES);
        if (error !== undefined) {
            return new Greeter.WorkflowAborted(error, { message: status.message });
        }
        error = reboot_api.errorFromGoogleRpcStatusCode(status);
        // TODO(benh): also consider getting the type names from
        // `status.details` and including that in `message` to make
        // debugging easier.
        return new Greeter.WorkflowAborted(error, { message: status.message });
    }
    toStatus() {
        const isObject = (value) => {
            return typeof value === 'object';
        };
        const isArray = (value) => {
            return Array.isArray(value);
        };
        const error = __classPrivateFieldGet(this, _GreeterWorkflowAborted_error, "f").toJson();
        if (!isObject(error) || isArray(error)) {
            throw new Error("Expecting 'error' to be an object (and not an array)");
        }
        const detail = { ...error };
        detail["@type"] = `type.googleapis.com/${__classPrivateFieldGet(this, _GreeterWorkflowAborted_error, "f").getType().typeName}`;
        return new reboot_api.Status({
            code: this.code,
            message: __classPrivateFieldGet(this, _GreeterWorkflowAborted_message, "f"),
            details: [detail]
        });
    }
    constructor(error, { message } = {}) {
        super();
        _GreeterWorkflowAborted_error.set(this, void 0);
        _GreeterWorkflowAborted_message.set(this, void 0);
        // Set the name of this error for even more information!
        this.name = this.constructor.name;
        __classPrivateFieldSet(this, _GreeterWorkflowAborted_error, error, "f");
        let code = reboot_api.grpcStatusCodeFromError(__classPrivateFieldGet(this, _GreeterWorkflowAborted_error, "f"));
        if (code === undefined) {
            // Must be one of the Reboot specific errors.
            code = reboot_api.StatusCode.ABORTED;
        }
        this.code = code;
        __classPrivateFieldSet(this, _GreeterWorkflowAborted_message, message, "f");
    }
    toString() {
        return `${this.name}: ${this.message}`;
    }
    get message() {
        return `${__classPrivateFieldGet(this, _GreeterWorkflowAborted_error, "f").getType().typeName}${__classPrivateFieldGet(this, _GreeterWorkflowAborted_message, "f") ? ": " + __classPrivateFieldGet(this, _GreeterWorkflowAborted_message, "f") : ""}`;
    }
    get error() {
        reboot_api.assert(__classPrivateFieldGet(this, _GreeterWorkflowAborted_error, "f") instanceof protobuf_es.Message);
        return __classPrivateFieldGet(this, _GreeterWorkflowAborted_error, "f");
    }
}
_GreeterWorkflowAborted_error = new WeakMap(), _GreeterWorkflowAborted_message = new WeakMap();
export class GreeterWorkflowTask {
    constructor(context, taskId) {
        _GreeterWorkflowTask_context.set(this, void 0);
        _GreeterWorkflowTask_promise.set(this, void 0);
        this.taskId = taskId;
        __classPrivateFieldSet(this, _GreeterWorkflowTask_context, context, "f");
    }
    static retrieve(context, { taskId }) {
        return new GreeterWorkflowTask(context, taskId);
    }
    then(...args) {
        if (__classPrivateFieldGet(this, _GreeterWorkflowTask_promise, "f") === undefined) {
            // NOTE: we lazily create the promise because it eagerly awaits
            // the task and if the task is not meant to complete, e.g., it
            // is control loop that runs forever, this may cause tests to
            // wait forever.
            __classPrivateFieldSet(this, _GreeterWorkflowTask_promise, new Promise(async (resolve, reject) => {
                const json = JSON.parse(await reboot_native.Task_await({
                    context: __classPrivateFieldGet(this, _GreeterWorkflowTask_context, "f").__external,
                    rbtModule: "tests.reboot.greeter_rbt",
                    stateName: "Greeter",
                    method: "Workflow",
                    jsonTaskId: JSON.stringify(this.taskId),
                }));
                if ("status" in json) {
                    reject(Greeter
                        .WorkflowAborted
                        .fromStatus(reboot_api.Status.fromJson(json["status"])));
                }
                else {
                    reboot_api.assert("response" in json);
                    resolve(GreeterWorkflowResponseFromProtobufShape(json["response"]));
                }
            }), "f");
        }
        return __classPrivateFieldGet(this, _GreeterWorkflowTask_promise, "f").then(...args);
    }
}
_GreeterWorkflowTask_context = new WeakMap(), _GreeterWorkflowTask_promise = new WeakMap();
export class GreeterDangerousFieldsAborted extends reboot_api.Aborted {
    static fromStatus(status) {
        let error = reboot_api.errorFromGoogleRpcStatusDetails(status, GREETER_DANGEROUS_FIELDS_ERROR_TYPES);
        if (error !== undefined) {
            return new Greeter.DangerousFieldsAborted(error, { message: status.message });
        }
        error = reboot_api.errorFromGoogleRpcStatusCode(status);
        // TODO(benh): also consider getting the type names from
        // `status.details` and including that in `message` to make
        // debugging easier.
        return new Greeter.DangerousFieldsAborted(error, { message: status.message });
    }
    toStatus() {
        const isObject = (value) => {
            return typeof value === 'object';
        };
        const isArray = (value) => {
            return Array.isArray(value);
        };
        const error = __classPrivateFieldGet(this, _GreeterDangerousFieldsAborted_error, "f").toJson();
        if (!isObject(error) || isArray(error)) {
            throw new Error("Expecting 'error' to be an object (and not an array)");
        }
        const detail = { ...error };
        detail["@type"] = `type.googleapis.com/${__classPrivateFieldGet(this, _GreeterDangerousFieldsAborted_error, "f").getType().typeName}`;
        return new reboot_api.Status({
            code: this.code,
            message: __classPrivateFieldGet(this, _GreeterDangerousFieldsAborted_message, "f"),
            details: [detail]
        });
    }
    constructor(error, { message } = {}) {
        super();
        _GreeterDangerousFieldsAborted_error.set(this, void 0);
        _GreeterDangerousFieldsAborted_message.set(this, void 0);
        // Set the name of this error for even more information!
        this.name = this.constructor.name;
        __classPrivateFieldSet(this, _GreeterDangerousFieldsAborted_error, error, "f");
        let code = reboot_api.grpcStatusCodeFromError(__classPrivateFieldGet(this, _GreeterDangerousFieldsAborted_error, "f"));
        if (code === undefined) {
            // Must be one of the Reboot specific errors.
            code = reboot_api.StatusCode.ABORTED;
        }
        this.code = code;
        __classPrivateFieldSet(this, _GreeterDangerousFieldsAborted_message, message, "f");
    }
    toString() {
        return `${this.name}: ${this.message}`;
    }
    get message() {
        return `${__classPrivateFieldGet(this, _GreeterDangerousFieldsAborted_error, "f").getType().typeName}${__classPrivateFieldGet(this, _GreeterDangerousFieldsAborted_message, "f") ? ": " + __classPrivateFieldGet(this, _GreeterDangerousFieldsAborted_message, "f") : ""}`;
    }
    get error() {
        reboot_api.assert(__classPrivateFieldGet(this, _GreeterDangerousFieldsAborted_error, "f") instanceof protobuf_es.Message);
        return __classPrivateFieldGet(this, _GreeterDangerousFieldsAborted_error, "f");
    }
}
_GreeterDangerousFieldsAborted_error = new WeakMap(), _GreeterDangerousFieldsAborted_message = new WeakMap();
export class GreeterDangerousFieldsTask {
    constructor(context, taskId) {
        _GreeterDangerousFieldsTask_context.set(this, void 0);
        _GreeterDangerousFieldsTask_promise.set(this, void 0);
        this.taskId = taskId;
        __classPrivateFieldSet(this, _GreeterDangerousFieldsTask_context, context, "f");
    }
    static retrieve(context, { taskId }) {
        return new GreeterDangerousFieldsTask(context, taskId);
    }
    then(...args) {
        if (__classPrivateFieldGet(this, _GreeterDangerousFieldsTask_promise, "f") === undefined) {
            // NOTE: we lazily create the promise because it eagerly awaits
            // the task and if the task is not meant to complete, e.g., it
            // is control loop that runs forever, this may cause tests to
            // wait forever.
            __classPrivateFieldSet(this, _GreeterDangerousFieldsTask_promise, new Promise(async (resolve, reject) => {
                const json = JSON.parse(await reboot_native.Task_await({
                    context: __classPrivateFieldGet(this, _GreeterDangerousFieldsTask_context, "f").__external,
                    rbtModule: "tests.reboot.greeter_rbt",
                    stateName: "Greeter",
                    method: "DangerousFields",
                    jsonTaskId: JSON.stringify(this.taskId),
                }));
                if ("status" in json) {
                    reject(Greeter
                        .DangerousFieldsAborted
                        .fromStatus(reboot_api.Status.fromJson(json["status"])));
                }
                else {
                    reboot_api.assert("response" in json);
                    resolve(GreeterDangerousFieldsResponseFromProtobufShape(json["response"]));
                }
            }), "f");
        }
        return __classPrivateFieldGet(this, _GreeterDangerousFieldsTask_promise, "f").then(...args);
    }
}
_GreeterDangerousFieldsTask_context = new WeakMap(), _GreeterDangerousFieldsTask_promise = new WeakMap();
export class GreeterStoreRecursiveMessageAborted extends reboot_api.Aborted {
    static fromStatus(status) {
        let error = reboot_api.errorFromGoogleRpcStatusDetails(status, GREETER_STORE_RECURSIVE_MESSAGE_ERROR_TYPES);
        if (error !== undefined) {
            return new Greeter.StoreRecursiveMessageAborted(error, { message: status.message });
        }
        error = reboot_api.errorFromGoogleRpcStatusCode(status);
        // TODO(benh): also consider getting the type names from
        // `status.details` and including that in `message` to make
        // debugging easier.
        return new Greeter.StoreRecursiveMessageAborted(error, { message: status.message });
    }
    toStatus() {
        const isObject = (value) => {
            return typeof value === 'object';
        };
        const isArray = (value) => {
            return Array.isArray(value);
        };
        const error = __classPrivateFieldGet(this, _GreeterStoreRecursiveMessageAborted_error, "f").toJson();
        if (!isObject(error) || isArray(error)) {
            throw new Error("Expecting 'error' to be an object (and not an array)");
        }
        const detail = { ...error };
        detail["@type"] = `type.googleapis.com/${__classPrivateFieldGet(this, _GreeterStoreRecursiveMessageAborted_error, "f").getType().typeName}`;
        return new reboot_api.Status({
            code: this.code,
            message: __classPrivateFieldGet(this, _GreeterStoreRecursiveMessageAborted_message, "f"),
            details: [detail]
        });
    }
    constructor(error, { message } = {}) {
        super();
        _GreeterStoreRecursiveMessageAborted_error.set(this, void 0);
        _GreeterStoreRecursiveMessageAborted_message.set(this, void 0);
        // Set the name of this error for even more information!
        this.name = this.constructor.name;
        __classPrivateFieldSet(this, _GreeterStoreRecursiveMessageAborted_error, error, "f");
        let code = reboot_api.grpcStatusCodeFromError(__classPrivateFieldGet(this, _GreeterStoreRecursiveMessageAborted_error, "f"));
        if (code === undefined) {
            // Must be one of the Reboot specific errors.
            code = reboot_api.StatusCode.ABORTED;
        }
        this.code = code;
        __classPrivateFieldSet(this, _GreeterStoreRecursiveMessageAborted_message, message, "f");
    }
    toString() {
        return `${this.name}: ${this.message}`;
    }
    get message() {
        return `${__classPrivateFieldGet(this, _GreeterStoreRecursiveMessageAborted_error, "f").getType().typeName}${__classPrivateFieldGet(this, _GreeterStoreRecursiveMessageAborted_message, "f") ? ": " + __classPrivateFieldGet(this, _GreeterStoreRecursiveMessageAborted_message, "f") : ""}`;
    }
    get error() {
        reboot_api.assert(__classPrivateFieldGet(this, _GreeterStoreRecursiveMessageAborted_error, "f") instanceof protobuf_es.Message);
        return __classPrivateFieldGet(this, _GreeterStoreRecursiveMessageAborted_error, "f");
    }
}
_GreeterStoreRecursiveMessageAborted_error = new WeakMap(), _GreeterStoreRecursiveMessageAborted_message = new WeakMap();
export class GreeterStoreRecursiveMessageTask {
    constructor(context, taskId) {
        _GreeterStoreRecursiveMessageTask_context.set(this, void 0);
        _GreeterStoreRecursiveMessageTask_promise.set(this, void 0);
        this.taskId = taskId;
        __classPrivateFieldSet(this, _GreeterStoreRecursiveMessageTask_context, context, "f");
    }
    static retrieve(context, { taskId }) {
        return new GreeterStoreRecursiveMessageTask(context, taskId);
    }
    then(...args) {
        if (__classPrivateFieldGet(this, _GreeterStoreRecursiveMessageTask_promise, "f") === undefined) {
            // NOTE: we lazily create the promise because it eagerly awaits
            // the task and if the task is not meant to complete, e.g., it
            // is control loop that runs forever, this may cause tests to
            // wait forever.
            __classPrivateFieldSet(this, _GreeterStoreRecursiveMessageTask_promise, new Promise(async (resolve, reject) => {
                const json = JSON.parse(await reboot_native.Task_await({
                    context: __classPrivateFieldGet(this, _GreeterStoreRecursiveMessageTask_context, "f").__external,
                    rbtModule: "tests.reboot.greeter_rbt",
                    stateName: "Greeter",
                    method: "StoreRecursiveMessage",
                    jsonTaskId: JSON.stringify(this.taskId),
                }));
                if ("status" in json) {
                    reject(Greeter
                        .StoreRecursiveMessageAborted
                        .fromStatus(reboot_api.Status.fromJson(json["status"])));
                }
                else {
                    reboot_api.assert("response" in json);
                    resolve(GreeterStoreRecursiveMessageResponseFromProtobufShape(json["response"]));
                }
            }), "f");
        }
        return __classPrivateFieldGet(this, _GreeterStoreRecursiveMessageTask_promise, "f").then(...args);
    }
}
_GreeterStoreRecursiveMessageTask_context = new WeakMap(), _GreeterStoreRecursiveMessageTask_promise = new WeakMap();
export class GreeterReadRecursiveMessageAborted extends reboot_api.Aborted {
    static fromStatus(status) {
        let error = reboot_api.errorFromGoogleRpcStatusDetails(status, GREETER_READ_RECURSIVE_MESSAGE_ERROR_TYPES);
        if (error !== undefined) {
            return new Greeter.ReadRecursiveMessageAborted(error, { message: status.message });
        }
        error = reboot_api.errorFromGoogleRpcStatusCode(status);
        // TODO(benh): also consider getting the type names from
        // `status.details` and including that in `message` to make
        // debugging easier.
        return new Greeter.ReadRecursiveMessageAborted(error, { message: status.message });
    }
    toStatus() {
        const isObject = (value) => {
            return typeof value === 'object';
        };
        const isArray = (value) => {
            return Array.isArray(value);
        };
        const error = __classPrivateFieldGet(this, _GreeterReadRecursiveMessageAborted_error, "f").toJson();
        if (!isObject(error) || isArray(error)) {
            throw new Error("Expecting 'error' to be an object (and not an array)");
        }
        const detail = { ...error };
        detail["@type"] = `type.googleapis.com/${__classPrivateFieldGet(this, _GreeterReadRecursiveMessageAborted_error, "f").getType().typeName}`;
        return new reboot_api.Status({
            code: this.code,
            message: __classPrivateFieldGet(this, _GreeterReadRecursiveMessageAborted_message, "f"),
            details: [detail]
        });
    }
    constructor(error, { message } = {}) {
        super();
        _GreeterReadRecursiveMessageAborted_error.set(this, void 0);
        _GreeterReadRecursiveMessageAborted_message.set(this, void 0);
        // Set the name of this error for even more information!
        this.name = this.constructor.name;
        __classPrivateFieldSet(this, _GreeterReadRecursiveMessageAborted_error, error, "f");
        let code = reboot_api.grpcStatusCodeFromError(__classPrivateFieldGet(this, _GreeterReadRecursiveMessageAborted_error, "f"));
        if (code === undefined) {
            // Must be one of the Reboot specific errors.
            code = reboot_api.StatusCode.ABORTED;
        }
        this.code = code;
        __classPrivateFieldSet(this, _GreeterReadRecursiveMessageAborted_message, message, "f");
    }
    toString() {
        return `${this.name}: ${this.message}`;
    }
    get message() {
        return `${__classPrivateFieldGet(this, _GreeterReadRecursiveMessageAborted_error, "f").getType().typeName}${__classPrivateFieldGet(this, _GreeterReadRecursiveMessageAborted_message, "f") ? ": " + __classPrivateFieldGet(this, _GreeterReadRecursiveMessageAborted_message, "f") : ""}`;
    }
    get error() {
        reboot_api.assert(__classPrivateFieldGet(this, _GreeterReadRecursiveMessageAborted_error, "f") instanceof protobuf_es.Message);
        return __classPrivateFieldGet(this, _GreeterReadRecursiveMessageAborted_error, "f");
    }
}
_GreeterReadRecursiveMessageAborted_error = new WeakMap(), _GreeterReadRecursiveMessageAborted_message = new WeakMap();
export class GreeterReadRecursiveMessageTask {
    constructor(context, taskId) {
        _GreeterReadRecursiveMessageTask_context.set(this, void 0);
        _GreeterReadRecursiveMessageTask_promise.set(this, void 0);
        this.taskId = taskId;
        __classPrivateFieldSet(this, _GreeterReadRecursiveMessageTask_context, context, "f");
    }
    static retrieve(context, { taskId }) {
        return new GreeterReadRecursiveMessageTask(context, taskId);
    }
    then(...args) {
        if (__classPrivateFieldGet(this, _GreeterReadRecursiveMessageTask_promise, "f") === undefined) {
            // NOTE: we lazily create the promise because it eagerly awaits
            // the task and if the task is not meant to complete, e.g., it
            // is control loop that runs forever, this may cause tests to
            // wait forever.
            __classPrivateFieldSet(this, _GreeterReadRecursiveMessageTask_promise, new Promise(async (resolve, reject) => {
                const json = JSON.parse(await reboot_native.Task_await({
                    context: __classPrivateFieldGet(this, _GreeterReadRecursiveMessageTask_context, "f").__external,
                    rbtModule: "tests.reboot.greeter_rbt",
                    stateName: "Greeter",
                    method: "ReadRecursiveMessage",
                    jsonTaskId: JSON.stringify(this.taskId),
                }));
                if ("status" in json) {
                    reject(Greeter
                        .ReadRecursiveMessageAborted
                        .fromStatus(reboot_api.Status.fromJson(json["status"])));
                }
                else {
                    reboot_api.assert("response" in json);
                    resolve(GreeterReadRecursiveMessageResponseFromProtobufShape(json["response"]));
                }
            }), "f");
        }
        return __classPrivateFieldGet(this, _GreeterReadRecursiveMessageTask_promise, "f").then(...args);
    }
}
_GreeterReadRecursiveMessageTask_context = new WeakMap(), _GreeterReadRecursiveMessageTask_promise = new WeakMap();
export class GreeterConstructAndStoreRecursiveMessageAborted extends reboot_api.Aborted {
    static fromStatus(status) {
        let error = reboot_api.errorFromGoogleRpcStatusDetails(status, GREETER_CONSTRUCT_AND_STORE_RECURSIVE_MESSAGE_ERROR_TYPES);
        if (error !== undefined) {
            return new Greeter.ConstructAndStoreRecursiveMessageAborted(error, { message: status.message });
        }
        error = reboot_api.errorFromGoogleRpcStatusCode(status);
        // TODO(benh): also consider getting the type names from
        // `status.details` and including that in `message` to make
        // debugging easier.
        return new Greeter.ConstructAndStoreRecursiveMessageAborted(error, { message: status.message });
    }
    toStatus() {
        const isObject = (value) => {
            return typeof value === 'object';
        };
        const isArray = (value) => {
            return Array.isArray(value);
        };
        const error = __classPrivateFieldGet(this, _GreeterConstructAndStoreRecursiveMessageAborted_error, "f").toJson();
        if (!isObject(error) || isArray(error)) {
            throw new Error("Expecting 'error' to be an object (and not an array)");
        }
        const detail = { ...error };
        detail["@type"] = `type.googleapis.com/${__classPrivateFieldGet(this, _GreeterConstructAndStoreRecursiveMessageAborted_error, "f").getType().typeName}`;
        return new reboot_api.Status({
            code: this.code,
            message: __classPrivateFieldGet(this, _GreeterConstructAndStoreRecursiveMessageAborted_message, "f"),
            details: [detail]
        });
    }
    constructor(error, { message } = {}) {
        super();
        _GreeterConstructAndStoreRecursiveMessageAborted_error.set(this, void 0);
        _GreeterConstructAndStoreRecursiveMessageAborted_message.set(this, void 0);
        // Set the name of this error for even more information!
        this.name = this.constructor.name;
        __classPrivateFieldSet(this, _GreeterConstructAndStoreRecursiveMessageAborted_error, error, "f");
        let code = reboot_api.grpcStatusCodeFromError(__classPrivateFieldGet(this, _GreeterConstructAndStoreRecursiveMessageAborted_error, "f"));
        if (code === undefined) {
            // Must be one of the Reboot specific errors.
            code = reboot_api.StatusCode.ABORTED;
        }
        this.code = code;
        __classPrivateFieldSet(this, _GreeterConstructAndStoreRecursiveMessageAborted_message, message, "f");
    }
    toString() {
        return `${this.name}: ${this.message}`;
    }
    get message() {
        return `${__classPrivateFieldGet(this, _GreeterConstructAndStoreRecursiveMessageAborted_error, "f").getType().typeName}${__classPrivateFieldGet(this, _GreeterConstructAndStoreRecursiveMessageAborted_message, "f") ? ": " + __classPrivateFieldGet(this, _GreeterConstructAndStoreRecursiveMessageAborted_message, "f") : ""}`;
    }
    get error() {
        reboot_api.assert(__classPrivateFieldGet(this, _GreeterConstructAndStoreRecursiveMessageAborted_error, "f") instanceof protobuf_es.Message);
        return __classPrivateFieldGet(this, _GreeterConstructAndStoreRecursiveMessageAborted_error, "f");
    }
}
_GreeterConstructAndStoreRecursiveMessageAborted_error = new WeakMap(), _GreeterConstructAndStoreRecursiveMessageAborted_message = new WeakMap();
export class GreeterConstructAndStoreRecursiveMessageTask {
    constructor(context, taskId) {
        _GreeterConstructAndStoreRecursiveMessageTask_context.set(this, void 0);
        _GreeterConstructAndStoreRecursiveMessageTask_promise.set(this, void 0);
        this.taskId = taskId;
        __classPrivateFieldSet(this, _GreeterConstructAndStoreRecursiveMessageTask_context, context, "f");
    }
    static retrieve(context, { taskId }) {
        return new GreeterConstructAndStoreRecursiveMessageTask(context, taskId);
    }
    then(...args) {
        if (__classPrivateFieldGet(this, _GreeterConstructAndStoreRecursiveMessageTask_promise, "f") === undefined) {
            // NOTE: we lazily create the promise because it eagerly awaits
            // the task and if the task is not meant to complete, e.g., it
            // is control loop that runs forever, this may cause tests to
            // wait forever.
            __classPrivateFieldSet(this, _GreeterConstructAndStoreRecursiveMessageTask_promise, new Promise(async (resolve, reject) => {
                const json = JSON.parse(await reboot_native.Task_await({
                    context: __classPrivateFieldGet(this, _GreeterConstructAndStoreRecursiveMessageTask_context, "f").__external,
                    rbtModule: "tests.reboot.greeter_rbt",
                    stateName: "Greeter",
                    method: "ConstructAndStoreRecursiveMessage",
                    jsonTaskId: JSON.stringify(this.taskId),
                }));
                if ("status" in json) {
                    reject(Greeter
                        .ConstructAndStoreRecursiveMessageAborted
                        .fromStatus(reboot_api.Status.fromJson(json["status"])));
                }
                else {
                    reboot_api.assert("response" in json);
                    resolve(GreeterConstructAndStoreRecursiveMessageResponseFromProtobufShape(json["response"]));
                }
            }), "f");
        }
        return __classPrivateFieldGet(this, _GreeterConstructAndStoreRecursiveMessageTask_promise, "f").then(...args);
    }
}
_GreeterConstructAndStoreRecursiveMessageTask_context = new WeakMap(), _GreeterConstructAndStoreRecursiveMessageTask_promise = new WeakMap();
export class GreeterWeakReference {
    constructor(id, bearerToken, servicer) {
        _GreeterWeakReference_external.set(this, void 0);
        _GreeterWeakReference_id.set(this, void 0);
        _GreeterWeakReference_options.set(this, void 0);
        __classPrivateFieldSet(this, _GreeterWeakReference_id, id, "f");
        __classPrivateFieldSet(this, _GreeterWeakReference_options, bearerToken === null ? {} : { bearerToken }, "f");
        this._servicer = servicer;
        __classPrivateFieldSet(this, _GreeterWeakReference_external, reboot_native.Service_constructor({
            rbtModule: "tests.reboot.greeter_rbt",
            nodeAdaptor: "GreeterWeakReferenceNodeAdaptor",
            id: __classPrivateFieldGet(this, _GreeterWeakReference_id, "f"),
        }), "f");
    }
    get stateId() {
        return __classPrivateFieldGet(this, _GreeterWeakReference_id, "f");
    }
    async read(context) {
        return await (reboot.isWithinUntil()
            ? this.always()
            : (reboot.isWithinLoop()
                ? this.perIteration()
                : this.perWorkflow())).read(context);
    }
    async write(context, writer, options = {}) {
        return await (reboot.isWithinUntil()
            ? this.always()
            : (reboot.isWithinLoop()
                ? this.perIteration()
                : this.perWorkflow())).write(context, writer, options);
    }
    async __externalServiceCallCreate(context, partialRequest, options) {
        const request = GreeterCreateRequestToProtobuf(partialRequest);
        const json = JSON.parse(await reboot_native.Service_call({
            external: __classPrivateFieldGet(this, _GreeterWeakReference_external, "f"),
            kind: "writer",
            method: "Create",
            requestModule: "tests.reboot.greeter_pb2",
            requestType: "CreateRequest",
            context: context.__external,
            jsonRequest: JSON.stringify(request.toJson() || {}),
            jsonOptions: JSON.stringify(options || {}),
        }));
        if ("status" in json) {
            throw Greeter
                .CreateAborted
                .fromStatus(reboot_api.Status.fromJson(json["status"]));
        }
        else if ("taskId" in json) {
            return reboot_api.tasks_pb.TaskId.fromJson(json["taskId"]);
        }
        else {
            reboot_api.assert("response" in json);
            return GreeterCreateResponseFromProtobufShape(json["response"]);
        }
    }
    async __externalServiceCallGreet(context, partialRequest, options) {
        const request = GreeterGreetRequestToProtobuf(partialRequest);
        const json = JSON.parse(await reboot_native.Service_call({
            external: __classPrivateFieldGet(this, _GreeterWeakReference_external, "f"),
            kind: "reader",
            method: "Greet",
            requestModule: "tests.reboot.greeter_pb2",
            requestType: "GreetRequest",
            context: context.__external,
            jsonRequest: JSON.stringify(request.toJson() || {}),
            jsonOptions: JSON.stringify(options || {}),
        }));
        if ("status" in json) {
            throw Greeter
                .GreetAborted
                .fromStatus(reboot_api.Status.fromJson(json["status"]));
        }
        else if ("taskId" in json) {
            return reboot_api.tasks_pb.TaskId.fromJson(json["taskId"]);
        }
        else {
            reboot_api.assert("response" in json);
            return GreeterGreetResponseFromProtobufShape(json["response"]);
        }
    }
    async greet(context, partialRequest) {
        if (context instanceof WorkflowContext) {
            if (reboot.isWithinUntil()) {
                return await this.always()
                    .greet(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
            }
            return await (reboot.isWithinLoop()
                ? this.perIteration()
                : this.perWorkflow()).greet(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
        }
        else if (context instanceof InitializeContext) {
            return await this.idempotently()
                .greet(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
        }
        return await this.__externalServiceCallGreet(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
    }
    async __externalServiceCallSetAdjective(context, partialRequest, options) {
        const request = GreeterSetAdjectiveRequestToProtobuf(partialRequest);
        const json = JSON.parse(await reboot_native.Service_call({
            external: __classPrivateFieldGet(this, _GreeterWeakReference_external, "f"),
            kind: "writer",
            method: "SetAdjective",
            requestModule: "tests.reboot.greeter_pb2",
            requestType: "SetAdjectiveRequest",
            context: context.__external,
            jsonRequest: JSON.stringify(request.toJson() || {}),
            jsonOptions: JSON.stringify(options || {}),
        }));
        if ("status" in json) {
            throw Greeter
                .SetAdjectiveAborted
                .fromStatus(reboot_api.Status.fromJson(json["status"]));
        }
        else if ("taskId" in json) {
            return reboot_api.tasks_pb.TaskId.fromJson(json["taskId"]);
        }
        else {
            reboot_api.assert("response" in json);
            return GreeterSetAdjectiveResponseFromProtobufShape(json["response"]);
        }
    }
    async setAdjective(context, partialRequest) {
        if (context instanceof WorkflowContext) {
            return await (reboot.isWithinLoop()
                ? this.perIteration()
                : this.perWorkflow()).setAdjective(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
        }
        else if (context instanceof InitializeContext) {
            return await this.idempotently()
                .setAdjective(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
        }
        return await this.__externalServiceCallSetAdjective(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
    }
    async __externalServiceCallTransactionSetAdjective(context, partialRequest, options) {
        const request = GreeterTransactionSetAdjectiveRequestToProtobuf(partialRequest);
        const json = JSON.parse(await reboot_native.Service_call({
            external: __classPrivateFieldGet(this, _GreeterWeakReference_external, "f"),
            kind: "transaction",
            method: "TransactionSetAdjective",
            requestModule: "tests.reboot.greeter_pb2",
            requestType: "SetAdjectiveRequest",
            context: context.__external,
            jsonRequest: JSON.stringify(request.toJson() || {}),
            jsonOptions: JSON.stringify(options || {}),
        }));
        if ("status" in json) {
            throw Greeter
                .TransactionSetAdjectiveAborted
                .fromStatus(reboot_api.Status.fromJson(json["status"]));
        }
        else if ("taskId" in json) {
            return reboot_api.tasks_pb.TaskId.fromJson(json["taskId"]);
        }
        else {
            reboot_api.assert("response" in json);
            return GreeterTransactionSetAdjectiveResponseFromProtobufShape(json["response"]);
        }
    }
    async transactionSetAdjective(context, partialRequest) {
        if (context instanceof WorkflowContext) {
            return await (reboot.isWithinLoop()
                ? this.perIteration()
                : this.perWorkflow()).transactionSetAdjective(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
        }
        else if (context instanceof InitializeContext) {
            return await this.idempotently()
                .transactionSetAdjective(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
        }
        return await this.__externalServiceCallTransactionSetAdjective(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
    }
    async __externalServiceCallTryToConstructContext(context, partialRequest, options) {
        const request = GreeterTryToConstructContextRequestToProtobuf(partialRequest);
        const json = JSON.parse(await reboot_native.Service_call({
            external: __classPrivateFieldGet(this, _GreeterWeakReference_external, "f"),
            kind: "reader",
            method: "TryToConstructContext",
            requestModule: "google.protobuf.empty_pb2",
            requestType: "Empty",
            context: context.__external,
            jsonRequest: JSON.stringify(request.toJson() || {}),
            jsonOptions: JSON.stringify(options || {}),
        }));
        if ("status" in json) {
            throw Greeter
                .TryToConstructContextAborted
                .fromStatus(reboot_api.Status.fromJson(json["status"]));
        }
        else if ("taskId" in json) {
            return reboot_api.tasks_pb.TaskId.fromJson(json["taskId"]);
        }
        else {
            reboot_api.assert("response" in json);
            return GreeterTryToConstructContextResponseFromProtobufShape(json["response"]);
        }
    }
    async tryToConstructContext(context, partialRequest) {
        if (context instanceof WorkflowContext) {
            if (reboot.isWithinUntil()) {
                return await this.always()
                    .tryToConstructContext(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
            }
            return await (reboot.isWithinLoop()
                ? this.perIteration()
                : this.perWorkflow()).tryToConstructContext(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
        }
        else if (context instanceof InitializeContext) {
            return await this.idempotently()
                .tryToConstructContext(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
        }
        return await this.__externalServiceCallTryToConstructContext(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
    }
    async __externalServiceCallTryToConstructExternalContext(context, partialRequest, options) {
        const request = GreeterTryToConstructExternalContextRequestToProtobuf(partialRequest);
        const json = JSON.parse(await reboot_native.Service_call({
            external: __classPrivateFieldGet(this, _GreeterWeakReference_external, "f"),
            kind: "reader",
            method: "TryToConstructExternalContext",
            requestModule: "google.protobuf.empty_pb2",
            requestType: "Empty",
            context: context.__external,
            jsonRequest: JSON.stringify(request.toJson() || {}),
            jsonOptions: JSON.stringify(options || {}),
        }));
        if ("status" in json) {
            throw Greeter
                .TryToConstructExternalContextAborted
                .fromStatus(reboot_api.Status.fromJson(json["status"]));
        }
        else if ("taskId" in json) {
            return reboot_api.tasks_pb.TaskId.fromJson(json["taskId"]);
        }
        else {
            reboot_api.assert("response" in json);
            return GreeterTryToConstructExternalContextResponseFromProtobufShape(json["response"]);
        }
    }
    async tryToConstructExternalContext(context, partialRequest) {
        if (context instanceof WorkflowContext) {
            if (reboot.isWithinUntil()) {
                return await this.always()
                    .tryToConstructExternalContext(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
            }
            return await (reboot.isWithinLoop()
                ? this.perIteration()
                : this.perWorkflow()).tryToConstructExternalContext(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
        }
        else if (context instanceof InitializeContext) {
            return await this.idempotently()
                .tryToConstructExternalContext(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
        }
        return await this.__externalServiceCallTryToConstructExternalContext(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
    }
    async __externalServiceCallTestLongRunningFetch(context, partialRequest, options) {
        const request = GreeterTestLongRunningFetchRequestToProtobuf(partialRequest);
        const json = JSON.parse(await reboot_native.Service_call({
            external: __classPrivateFieldGet(this, _GreeterWeakReference_external, "f"),
            kind: "reader",
            method: "TestLongRunningFetch",
            requestModule: "tests.reboot.greeter_pb2",
            requestType: "TestLongRunningFetchRequest",
            context: context.__external,
            jsonRequest: JSON.stringify(request.toJson() || {}),
            jsonOptions: JSON.stringify(options || {}),
        }));
        if ("status" in json) {
            throw Greeter
                .TestLongRunningFetchAborted
                .fromStatus(reboot_api.Status.fromJson(json["status"]));
        }
        else if ("taskId" in json) {
            return reboot_api.tasks_pb.TaskId.fromJson(json["taskId"]);
        }
        else {
            reboot_api.assert("response" in json);
            return GreeterTestLongRunningFetchResponseFromProtobufShape(json["response"]);
        }
    }
    async testLongRunningFetch(context, partialRequest) {
        if (context instanceof WorkflowContext) {
            if (reboot.isWithinUntil()) {
                return await this.always()
                    .testLongRunningFetch(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
            }
            return await (reboot.isWithinLoop()
                ? this.perIteration()
                : this.perWorkflow()).testLongRunningFetch(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
        }
        else if (context instanceof InitializeContext) {
            return await this.idempotently()
                .testLongRunningFetch(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
        }
        return await this.__externalServiceCallTestLongRunningFetch(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
    }
    async __externalServiceCallTestLongRunningWriter(context, partialRequest, options) {
        const request = GreeterTestLongRunningWriterRequestToProtobuf(partialRequest);
        const json = JSON.parse(await reboot_native.Service_call({
            external: __classPrivateFieldGet(this, _GreeterWeakReference_external, "f"),
            kind: "writer",
            method: "TestLongRunningWriter",
            requestModule: "google.protobuf.empty_pb2",
            requestType: "Empty",
            context: context.__external,
            jsonRequest: JSON.stringify(request.toJson() || {}),
            jsonOptions: JSON.stringify(options || {}),
        }));
        if ("status" in json) {
            throw Greeter
                .TestLongRunningWriterAborted
                .fromStatus(reboot_api.Status.fromJson(json["status"]));
        }
        else if ("taskId" in json) {
            return reboot_api.tasks_pb.TaskId.fromJson(json["taskId"]);
        }
        else {
            reboot_api.assert("response" in json);
            return GreeterTestLongRunningWriterResponseFromProtobufShape(json["response"]);
        }
    }
    async testLongRunningWriter(context, partialRequest) {
        if (context instanceof WorkflowContext) {
            return await (reboot.isWithinLoop()
                ? this.perIteration()
                : this.perWorkflow()).testLongRunningWriter(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
        }
        else if (context instanceof InitializeContext) {
            return await this.idempotently()
                .testLongRunningWriter(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
        }
        return await this.__externalServiceCallTestLongRunningWriter(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
    }
    async __externalServiceCallGetWholeState(context, partialRequest, options) {
        const request = GreeterGetWholeStateRequestToProtobuf(partialRequest);
        const json = JSON.parse(await reboot_native.Service_call({
            external: __classPrivateFieldGet(this, _GreeterWeakReference_external, "f"),
            kind: "reader",
            method: "GetWholeState",
            requestModule: "tests.reboot.greeter_pb2",
            requestType: "GetWholeStateRequest",
            context: context.__external,
            jsonRequest: JSON.stringify(request.toJson() || {}),
            jsonOptions: JSON.stringify(options || {}),
        }));
        if ("status" in json) {
            throw Greeter
                .GetWholeStateAborted
                .fromStatus(reboot_api.Status.fromJson(json["status"]));
        }
        else if ("taskId" in json) {
            return reboot_api.tasks_pb.TaskId.fromJson(json["taskId"]);
        }
        else {
            reboot_api.assert("response" in json);
            return GreeterGetWholeStateResponseFromProtobufShape(json["response"]);
        }
    }
    async getWholeState(context, partialRequest) {
        if (context instanceof WorkflowContext) {
            if (reboot.isWithinUntil()) {
                return await this.always()
                    .getWholeState(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
            }
            return await (reboot.isWithinLoop()
                ? this.perIteration()
                : this.perWorkflow()).getWholeState(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
        }
        else if (context instanceof InitializeContext) {
            return await this.idempotently()
                .getWholeState(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
        }
        return await this.__externalServiceCallGetWholeState(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
    }
    async __externalServiceCallFailWithException(context, partialRequest, options) {
        const request = GreeterFailWithExceptionRequestToProtobuf(partialRequest);
        const json = JSON.parse(await reboot_native.Service_call({
            external: __classPrivateFieldGet(this, _GreeterWeakReference_external, "f"),
            kind: "reader",
            method: "FailWithException",
            requestModule: "google.protobuf.empty_pb2",
            requestType: "Empty",
            context: context.__external,
            jsonRequest: JSON.stringify(request.toJson() || {}),
            jsonOptions: JSON.stringify(options || {}),
        }));
        if ("status" in json) {
            throw Greeter
                .FailWithExceptionAborted
                .fromStatus(reboot_api.Status.fromJson(json["status"]));
        }
        else if ("taskId" in json) {
            return reboot_api.tasks_pb.TaskId.fromJson(json["taskId"]);
        }
        else {
            reboot_api.assert("response" in json);
            return GreeterFailWithExceptionResponseFromProtobufShape(json["response"]);
        }
    }
    async failWithException(context, partialRequest) {
        if (context instanceof WorkflowContext) {
            if (reboot.isWithinUntil()) {
                return await this.always()
                    .failWithException(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
            }
            return await (reboot.isWithinLoop()
                ? this.perIteration()
                : this.perWorkflow()).failWithException(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
        }
        else if (context instanceof InitializeContext) {
            return await this.idempotently()
                .failWithException(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
        }
        return await this.__externalServiceCallFailWithException(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
    }
    async __externalServiceCallFailWithAborted(context, partialRequest, options) {
        const request = GreeterFailWithAbortedRequestToProtobuf(partialRequest);
        const json = JSON.parse(await reboot_native.Service_call({
            external: __classPrivateFieldGet(this, _GreeterWeakReference_external, "f"),
            kind: "reader",
            method: "FailWithAborted",
            requestModule: "google.protobuf.empty_pb2",
            requestType: "Empty",
            context: context.__external,
            jsonRequest: JSON.stringify(request.toJson() || {}),
            jsonOptions: JSON.stringify(options || {}),
        }));
        if ("status" in json) {
            throw Greeter
                .FailWithAbortedAborted
                .fromStatus(reboot_api.Status.fromJson(json["status"]));
        }
        else if ("taskId" in json) {
            return reboot_api.tasks_pb.TaskId.fromJson(json["taskId"]);
        }
        else {
            reboot_api.assert("response" in json);
            return GreeterFailWithAbortedResponseFromProtobufShape(json["response"]);
        }
    }
    async failWithAborted(context, partialRequest) {
        if (context instanceof WorkflowContext) {
            if (reboot.isWithinUntil()) {
                return await this.always()
                    .failWithAborted(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
            }
            return await (reboot.isWithinLoop()
                ? this.perIteration()
                : this.perWorkflow()).failWithAborted(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
        }
        else if (context instanceof InitializeContext) {
            return await this.idempotently()
                .failWithAborted(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
        }
        return await this.__externalServiceCallFailWithAborted(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
    }
    async __externalServiceCallWorkflow(context, partialRequest, options) {
        const request = GreeterWorkflowRequestToProtobuf(partialRequest);
        const json = JSON.parse(await reboot_native.Service_call({
            external: __classPrivateFieldGet(this, _GreeterWeakReference_external, "f"),
            kind: "workflow",
            method: "Workflow",
            requestModule: "google.protobuf.empty_pb2",
            requestType: "Empty",
            context: context.__external,
            jsonRequest: JSON.stringify(request.toJson() || {}),
            jsonOptions: JSON.stringify(options || {}),
        }));
        if ("status" in json) {
            throw Greeter
                .WorkflowAborted
                .fromStatus(reboot_api.Status.fromJson(json["status"]));
        }
        else if ("taskId" in json) {
            return reboot_api.tasks_pb.TaskId.fromJson(json["taskId"]);
        }
        else {
            reboot_api.assert("response" in json);
            return GreeterWorkflowResponseFromProtobufShape(json["response"]);
        }
    }
    async workflow(context, partialRequest) {
        const { task } = await (context instanceof WorkflowContext
            ? (reboot.isWithinLoop() ? this.perIteration() : this.perWorkflow())
            : (context instanceof InitializeContext ? this.idempotently() : this)).spawn().workflow(context, partialRequest);
        return await task;
    }
    async __externalServiceCallDangerousFields(context, partialRequest, options) {
        const request = GreeterDangerousFieldsRequestToProtobuf(partialRequest);
        const json = JSON.parse(await reboot_native.Service_call({
            external: __classPrivateFieldGet(this, _GreeterWeakReference_external, "f"),
            kind: "writer",
            method: "DangerousFields",
            requestModule: "tests.reboot.greeter_pb2",
            requestType: "DangerousFieldsRequest",
            context: context.__external,
            jsonRequest: JSON.stringify(request.toJson() || {}),
            jsonOptions: JSON.stringify(options || {}),
        }));
        if ("status" in json) {
            throw Greeter
                .DangerousFieldsAborted
                .fromStatus(reboot_api.Status.fromJson(json["status"]));
        }
        else if ("taskId" in json) {
            return reboot_api.tasks_pb.TaskId.fromJson(json["taskId"]);
        }
        else {
            reboot_api.assert("response" in json);
            return GreeterDangerousFieldsResponseFromProtobufShape(json["response"]);
        }
    }
    async dangerousFields(context, partialRequest) {
        if (context instanceof WorkflowContext) {
            return await (reboot.isWithinLoop()
                ? this.perIteration()
                : this.perWorkflow()).dangerousFields(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
        }
        else if (context instanceof InitializeContext) {
            return await this.idempotently()
                .dangerousFields(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
        }
        return await this.__externalServiceCallDangerousFields(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
    }
    async __externalServiceCallStoreRecursiveMessage(context, partialRequest, options) {
        const request = GreeterStoreRecursiveMessageRequestToProtobuf(partialRequest);
        const json = JSON.parse(await reboot_native.Service_call({
            external: __classPrivateFieldGet(this, _GreeterWeakReference_external, "f"),
            kind: "writer",
            method: "StoreRecursiveMessage",
            requestModule: "tests.reboot.greeter_pb2",
            requestType: "StoreRecursiveMessageRequest",
            context: context.__external,
            jsonRequest: JSON.stringify(request.toJson() || {}),
            jsonOptions: JSON.stringify(options || {}),
        }));
        if ("status" in json) {
            throw Greeter
                .StoreRecursiveMessageAborted
                .fromStatus(reboot_api.Status.fromJson(json["status"]));
        }
        else if ("taskId" in json) {
            return reboot_api.tasks_pb.TaskId.fromJson(json["taskId"]);
        }
        else {
            reboot_api.assert("response" in json);
            return GreeterStoreRecursiveMessageResponseFromProtobufShape(json["response"]);
        }
    }
    async storeRecursiveMessage(context, partialRequest) {
        if (context instanceof WorkflowContext) {
            return await (reboot.isWithinLoop()
                ? this.perIteration()
                : this.perWorkflow()).storeRecursiveMessage(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
        }
        else if (context instanceof InitializeContext) {
            return await this.idempotently()
                .storeRecursiveMessage(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
        }
        return await this.__externalServiceCallStoreRecursiveMessage(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
    }
    async __externalServiceCallReadRecursiveMessage(context, partialRequest, options) {
        const request = GreeterReadRecursiveMessageRequestToProtobuf(partialRequest);
        const json = JSON.parse(await reboot_native.Service_call({
            external: __classPrivateFieldGet(this, _GreeterWeakReference_external, "f"),
            kind: "reader",
            method: "ReadRecursiveMessage",
            requestModule: "tests.reboot.greeter_pb2",
            requestType: "ReadRecursiveMessageRequest",
            context: context.__external,
            jsonRequest: JSON.stringify(request.toJson() || {}),
            jsonOptions: JSON.stringify(options || {}),
        }));
        if ("status" in json) {
            throw Greeter
                .ReadRecursiveMessageAborted
                .fromStatus(reboot_api.Status.fromJson(json["status"]));
        }
        else if ("taskId" in json) {
            return reboot_api.tasks_pb.TaskId.fromJson(json["taskId"]);
        }
        else {
            reboot_api.assert("response" in json);
            return GreeterReadRecursiveMessageResponseFromProtobufShape(json["response"]);
        }
    }
    async readRecursiveMessage(context, partialRequest) {
        if (context instanceof WorkflowContext) {
            if (reboot.isWithinUntil()) {
                return await this.always()
                    .readRecursiveMessage(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
            }
            return await (reboot.isWithinLoop()
                ? this.perIteration()
                : this.perWorkflow()).readRecursiveMessage(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
        }
        else if (context instanceof InitializeContext) {
            return await this.idempotently()
                .readRecursiveMessage(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
        }
        return await this.__externalServiceCallReadRecursiveMessage(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
    }
    async __externalServiceCallConstructAndStoreRecursiveMessage(context, partialRequest, options) {
        const request = GreeterConstructAndStoreRecursiveMessageRequestToProtobuf(partialRequest);
        const json = JSON.parse(await reboot_native.Service_call({
            external: __classPrivateFieldGet(this, _GreeterWeakReference_external, "f"),
            kind: "transaction",
            method: "ConstructAndStoreRecursiveMessage",
            requestModule: "tests.reboot.greeter_pb2",
            requestType: "ConstructAndStoreRecursiveMessageRequest",
            context: context.__external,
            jsonRequest: JSON.stringify(request.toJson() || {}),
            jsonOptions: JSON.stringify(options || {}),
        }));
        if ("status" in json) {
            throw Greeter
                .ConstructAndStoreRecursiveMessageAborted
                .fromStatus(reboot_api.Status.fromJson(json["status"]));
        }
        else if ("taskId" in json) {
            return reboot_api.tasks_pb.TaskId.fromJson(json["taskId"]);
        }
        else {
            reboot_api.assert("response" in json);
            return GreeterConstructAndStoreRecursiveMessageResponseFromProtobufShape(json["response"]);
        }
    }
    async constructAndStoreRecursiveMessage(context, partialRequest) {
        if (context instanceof WorkflowContext) {
            return await (reboot.isWithinLoop()
                ? this.perIteration()
                : this.perWorkflow()).constructAndStoreRecursiveMessage(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
        }
        else if (context instanceof InitializeContext) {
            return await this.idempotently()
                .constructAndStoreRecursiveMessage(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
        }
        return await this.__externalServiceCallConstructAndStoreRecursiveMessage(context, partialRequest, __classPrivateFieldGet(this, _GreeterWeakReference_options, "f"));
    }
    idempotently(aliasOrOptions = {}) {
        const idempotency = (typeof aliasOrOptions === "string" || aliasOrOptions instanceof String) ? { alias: aliasOrOptions } : aliasOrOptions;
        return new Greeter.WeakReference._Idempotently(this, {
            ...__classPrivateFieldGet(this, _GreeterWeakReference_options, "f"),
            idempotency: idempotency,
        });
    }
    perWorkflow(alias) {
        return this.idempotently(alias);
    }
    perIteration(alias) {
        return this.idempotently({ alias, perIteration: true });
    }
    always() {
        return this.idempotently({ always: true });
    }
    schedule(options) {
        return new Greeter.WeakReference._Schedule(this, {
            ...__classPrivateFieldGet(this, _GreeterWeakReference_options, "f"),
            schedule: options || { when: new Date() }
        });
    }
    spawn(options) {
        return new Greeter.WeakReference._Spawn(this, {
            ...__classPrivateFieldGet(this, _GreeterWeakReference_options, "f"),
            schedule: options || { when: new Date() }
        });
    }
}
_GreeterWeakReference_external = new WeakMap(), _GreeterWeakReference_id = new WeakMap(), _GreeterWeakReference_options = new WeakMap();
GreeterWeakReference._Idempotently = (_e = class {
        constructor(weakReference, options) {
            _weakReference.set(this, void 0);
            _options.set(this, void 0);
            __classPrivateFieldSet(this, _weakReference, weakReference, "f");
            __classPrivateFieldSet(this, _options, options, "f");
        }
        async read(context) {
            const servicer = __classPrivateFieldGet(this, _weakReference, "f")._servicer;
            if (servicer === undefined) {
                throw new Error("`read()` is currently only supported within workflows; " +
                    "Please reach out and let us know your use case if this " +
                    "is important for you!");
            }
            // TODO: pass along initial intent rather than deducing it here.
            let how = (() => {
                if (__classPrivateFieldGet(this, _options, "f").idempotency.always) {
                    return reboot.ALWAYS;
                }
                if (__classPrivateFieldGet(this, _options, "f").idempotency.key !== undefined) {
                    throw new Error("`.read()` must be called with one of `.perWorkflow()`, " +
                        "`.perIteration()`, or `.always()`; `.idempotently()` is not " +
                        "(currently) supported");
                }
                return __classPrivateFieldGet(this, _options, "f").idempotency.perIteration
                    ? reboot.PER_ITERATION
                    : reboot.PER_WORKFLOW;
            })();
            return await new GreeterBaseServicer.WorkflowState._Idempotently(servicer.__external, { alias: __classPrivateFieldGet(this, _options, "f").idempotency.alias, how }).read(context);
        }
        async write(context, writer, options = {}) {
            const servicer = __classPrivateFieldGet(this, _weakReference, "f")._servicer;
            if (servicer === undefined) {
                throw new Error("`write()` is currently only supported within workflows; " +
                    "Please reach out and let us know your use case if this " +
                    "is important for you!");
            }
            // TODO: pass along initial intent rather than deducing it here.
            let how = (() => {
                if (__classPrivateFieldGet(this, _options, "f").idempotency.always) {
                    return reboot.ALWAYS;
                }
                if (__classPrivateFieldGet(this, _options, "f").idempotency.key !== undefined) {
                    throw new Error("`.write()` must be called with one of `.perWorkflow()`, " +
                        "`.perIteration()`, or `.always()`; `.idempotently()` is not " +
                        "(currently) supported");
                }
                return __classPrivateFieldGet(this, _options, "f").idempotency.perIteration
                    ? reboot.PER_ITERATION
                    : reboot.PER_WORKFLOW;
            })();
            return await new GreeterBaseServicer.WorkflowState._Idempotently(servicer.__external, { alias: __classPrivateFieldGet(this, _options, "f").idempotency.alias, how }).write(context, writer, options);
        }
        async greet(context, partialRequest) {
            return await __classPrivateFieldGet(this, _weakReference, "f").__externalServiceCallGreet(context, partialRequest, __classPrivateFieldGet(this, _options, "f"));
        }
        async setAdjective(context, partialRequest) {
            return await __classPrivateFieldGet(this, _weakReference, "f").__externalServiceCallSetAdjective(context, partialRequest, __classPrivateFieldGet(this, _options, "f"));
        }
        async transactionSetAdjective(context, partialRequest) {
            return await __classPrivateFieldGet(this, _weakReference, "f").__externalServiceCallTransactionSetAdjective(context, partialRequest, __classPrivateFieldGet(this, _options, "f"));
        }
        async tryToConstructContext(context, partialRequest) {
            return await __classPrivateFieldGet(this, _weakReference, "f").__externalServiceCallTryToConstructContext(context, partialRequest, __classPrivateFieldGet(this, _options, "f"));
        }
        async tryToConstructExternalContext(context, partialRequest) {
            return await __classPrivateFieldGet(this, _weakReference, "f").__externalServiceCallTryToConstructExternalContext(context, partialRequest, __classPrivateFieldGet(this, _options, "f"));
        }
        async testLongRunningFetch(context, partialRequest) {
            return await __classPrivateFieldGet(this, _weakReference, "f").__externalServiceCallTestLongRunningFetch(context, partialRequest, __classPrivateFieldGet(this, _options, "f"));
        }
        async testLongRunningWriter(context, partialRequest) {
            return await __classPrivateFieldGet(this, _weakReference, "f").__externalServiceCallTestLongRunningWriter(context, partialRequest, __classPrivateFieldGet(this, _options, "f"));
        }
        async getWholeState(context, partialRequest) {
            return await __classPrivateFieldGet(this, _weakReference, "f").__externalServiceCallGetWholeState(context, partialRequest, __classPrivateFieldGet(this, _options, "f"));
        }
        async failWithException(context, partialRequest) {
            return await __classPrivateFieldGet(this, _weakReference, "f").__externalServiceCallFailWithException(context, partialRequest, __classPrivateFieldGet(this, _options, "f"));
        }
        async failWithAborted(context, partialRequest) {
            return await __classPrivateFieldGet(this, _weakReference, "f").__externalServiceCallFailWithAborted(context, partialRequest, __classPrivateFieldGet(this, _options, "f"));
        }
        async workflow(context, partialRequest) {
            const { task } = await this.spawn()
                .workflow(context, partialRequest);
            return await task;
        }
        async dangerousFields(context, partialRequest) {
            return await __classPrivateFieldGet(this, _weakReference, "f").__externalServiceCallDangerousFields(context, partialRequest, __classPrivateFieldGet(this, _options, "f"));
        }
        async storeRecursiveMessage(context, partialRequest) {
            return await __classPrivateFieldGet(this, _weakReference, "f").__externalServiceCallStoreRecursiveMessage(context, partialRequest, __classPrivateFieldGet(this, _options, "f"));
        }
        async readRecursiveMessage(context, partialRequest) {
            return await __classPrivateFieldGet(this, _weakReference, "f").__externalServiceCallReadRecursiveMessage(context, partialRequest, __classPrivateFieldGet(this, _options, "f"));
        }
        async constructAndStoreRecursiveMessage(context, partialRequest) {
            return await __classPrivateFieldGet(this, _weakReference, "f").__externalServiceCallConstructAndStoreRecursiveMessage(context, partialRequest, __classPrivateFieldGet(this, _options, "f"));
        }
        schedule(options) {
            return new Greeter.WeakReference._Schedule(__classPrivateFieldGet(this, _weakReference, "f"), {
                ...__classPrivateFieldGet(this, _options, "f"),
                schedule: options || { when: new Date() }
            });
        }
        spawn(options) {
            return new Greeter.WeakReference._Spawn(__classPrivateFieldGet(this, _weakReference, "f"), {
                ...__classPrivateFieldGet(this, _options, "f"),
                schedule: options || { when: new Date() }
            });
        }
    },
    _weakReference = new WeakMap(),
    _options = new WeakMap(),
    _e);
GreeterWeakReference._Schedule = (_f = class {
        constructor(weakReference, options) {
            _weakReference_1.set(this, void 0);
            _options_1.set(this, void 0);
            __classPrivateFieldSet(this, _weakReference_1, weakReference, "f");
            __classPrivateFieldSet(this, _options_1, options, "f");
        }
        async greet(context, partialRequest) {
            return await __classPrivateFieldGet(this, _weakReference_1, "f").__externalServiceCallGreet(context, partialRequest, __classPrivateFieldGet(this, _options_1, "f"));
        }
        async setAdjective(context, partialRequest) {
            return await __classPrivateFieldGet(this, _weakReference_1, "f").__externalServiceCallSetAdjective(context, partialRequest, __classPrivateFieldGet(this, _options_1, "f"));
        }
        async transactionSetAdjective(context, partialRequest) {
            return await __classPrivateFieldGet(this, _weakReference_1, "f").__externalServiceCallTransactionSetAdjective(context, partialRequest, __classPrivateFieldGet(this, _options_1, "f"));
        }
        async tryToConstructContext(context, partialRequest) {
            return await __classPrivateFieldGet(this, _weakReference_1, "f").__externalServiceCallTryToConstructContext(context, partialRequest, __classPrivateFieldGet(this, _options_1, "f"));
        }
        async tryToConstructExternalContext(context, partialRequest) {
            return await __classPrivateFieldGet(this, _weakReference_1, "f").__externalServiceCallTryToConstructExternalContext(context, partialRequest, __classPrivateFieldGet(this, _options_1, "f"));
        }
        async testLongRunningFetch(context, partialRequest) {
            return await __classPrivateFieldGet(this, _weakReference_1, "f").__externalServiceCallTestLongRunningFetch(context, partialRequest, __classPrivateFieldGet(this, _options_1, "f"));
        }
        async testLongRunningWriter(context, partialRequest) {
            return await __classPrivateFieldGet(this, _weakReference_1, "f").__externalServiceCallTestLongRunningWriter(context, partialRequest, __classPrivateFieldGet(this, _options_1, "f"));
        }
        async getWholeState(context, partialRequest) {
            return await __classPrivateFieldGet(this, _weakReference_1, "f").__externalServiceCallGetWholeState(context, partialRequest, __classPrivateFieldGet(this, _options_1, "f"));
        }
        async failWithException(context, partialRequest) {
            return await __classPrivateFieldGet(this, _weakReference_1, "f").__externalServiceCallFailWithException(context, partialRequest, __classPrivateFieldGet(this, _options_1, "f"));
        }
        async failWithAborted(context, partialRequest) {
            return await __classPrivateFieldGet(this, _weakReference_1, "f").__externalServiceCallFailWithAborted(context, partialRequest, __classPrivateFieldGet(this, _options_1, "f"));
        }
        async workflow(context, partialRequest) {
            return await __classPrivateFieldGet(this, _weakReference_1, "f").__externalServiceCallWorkflow(context, partialRequest, __classPrivateFieldGet(this, _options_1, "f"));
        }
        async dangerousFields(context, partialRequest) {
            return await __classPrivateFieldGet(this, _weakReference_1, "f").__externalServiceCallDangerousFields(context, partialRequest, __classPrivateFieldGet(this, _options_1, "f"));
        }
        async storeRecursiveMessage(context, partialRequest) {
            return await __classPrivateFieldGet(this, _weakReference_1, "f").__externalServiceCallStoreRecursiveMessage(context, partialRequest, __classPrivateFieldGet(this, _options_1, "f"));
        }
        async readRecursiveMessage(context, partialRequest) {
            return await __classPrivateFieldGet(this, _weakReference_1, "f").__externalServiceCallReadRecursiveMessage(context, partialRequest, __classPrivateFieldGet(this, _options_1, "f"));
        }
        async constructAndStoreRecursiveMessage(context, partialRequest) {
            return await __classPrivateFieldGet(this, _weakReference_1, "f").__externalServiceCallConstructAndStoreRecursiveMessage(context, partialRequest, __classPrivateFieldGet(this, _options_1, "f"));
        }
    },
    _weakReference_1 = new WeakMap(),
    _options_1 = new WeakMap(),
    _f);
GreeterWeakReference._Spawn = (_g = class {
        constructor(weakReference, options) {
            _weakReference_2.set(this, void 0);
            _options_2.set(this, void 0);
            __classPrivateFieldSet(this, _weakReference_2, weakReference, "f");
            __classPrivateFieldSet(this, _options_2, options, "f");
        }
        async greet(context, partialRequest) {
            const taskId = await __classPrivateFieldGet(this, _weakReference_2, "f").__externalServiceCallGreet(context, partialRequest, __classPrivateFieldGet(this, _options_2, "f"));
            return {
                task: Greeter.GreetTask
                    .retrieve(context, { taskId })
            };
        }
        async setAdjective(context, partialRequest) {
            const taskId = await __classPrivateFieldGet(this, _weakReference_2, "f").__externalServiceCallSetAdjective(context, partialRequest, __classPrivateFieldGet(this, _options_2, "f"));
            return {
                task: Greeter.SetAdjectiveTask
                    .retrieve(context, { taskId })
            };
        }
        async transactionSetAdjective(context, partialRequest) {
            const taskId = await __classPrivateFieldGet(this, _weakReference_2, "f").__externalServiceCallTransactionSetAdjective(context, partialRequest, __classPrivateFieldGet(this, _options_2, "f"));
            return {
                task: Greeter.TransactionSetAdjectiveTask
                    .retrieve(context, { taskId })
            };
        }
        async tryToConstructContext(context, partialRequest) {
            const taskId = await __classPrivateFieldGet(this, _weakReference_2, "f").__externalServiceCallTryToConstructContext(context, partialRequest, __classPrivateFieldGet(this, _options_2, "f"));
            return {
                task: Greeter.TryToConstructContextTask
                    .retrieve(context, { taskId })
            };
        }
        async tryToConstructExternalContext(context, partialRequest) {
            const taskId = await __classPrivateFieldGet(this, _weakReference_2, "f").__externalServiceCallTryToConstructExternalContext(context, partialRequest, __classPrivateFieldGet(this, _options_2, "f"));
            return {
                task: Greeter.TryToConstructExternalContextTask
                    .retrieve(context, { taskId })
            };
        }
        async testLongRunningFetch(context, partialRequest) {
            const taskId = await __classPrivateFieldGet(this, _weakReference_2, "f").__externalServiceCallTestLongRunningFetch(context, partialRequest, __classPrivateFieldGet(this, _options_2, "f"));
            return {
                task: Greeter.TestLongRunningFetchTask
                    .retrieve(context, { taskId })
            };
        }
        async testLongRunningWriter(context, partialRequest) {
            const taskId = await __classPrivateFieldGet(this, _weakReference_2, "f").__externalServiceCallTestLongRunningWriter(context, partialRequest, __classPrivateFieldGet(this, _options_2, "f"));
            return {
                task: Greeter.TestLongRunningWriterTask
                    .retrieve(context, { taskId })
            };
        }
        async getWholeState(context, partialRequest) {
            const taskId = await __classPrivateFieldGet(this, _weakReference_2, "f").__externalServiceCallGetWholeState(context, partialRequest, __classPrivateFieldGet(this, _options_2, "f"));
            return {
                task: Greeter.GetWholeStateTask
                    .retrieve(context, { taskId })
            };
        }
        async failWithException(context, partialRequest) {
            const taskId = await __classPrivateFieldGet(this, _weakReference_2, "f").__externalServiceCallFailWithException(context, partialRequest, __classPrivateFieldGet(this, _options_2, "f"));
            return {
                task: Greeter.FailWithExceptionTask
                    .retrieve(context, { taskId })
            };
        }
        async failWithAborted(context, partialRequest) {
            const taskId = await __classPrivateFieldGet(this, _weakReference_2, "f").__externalServiceCallFailWithAborted(context, partialRequest, __classPrivateFieldGet(this, _options_2, "f"));
            return {
                task: Greeter.FailWithAbortedTask
                    .retrieve(context, { taskId })
            };
        }
        async workflow(context, partialRequest) {
            const taskId = await __classPrivateFieldGet(this, _weakReference_2, "f").__externalServiceCallWorkflow(context, partialRequest, __classPrivateFieldGet(this, _options_2, "f"));
            return {
                task: Greeter.WorkflowTask
                    .retrieve(context, { taskId })
            };
        }
        async dangerousFields(context, partialRequest) {
            const taskId = await __classPrivateFieldGet(this, _weakReference_2, "f").__externalServiceCallDangerousFields(context, partialRequest, __classPrivateFieldGet(this, _options_2, "f"));
            return {
                task: Greeter.DangerousFieldsTask
                    .retrieve(context, { taskId })
            };
        }
        async storeRecursiveMessage(context, partialRequest) {
            const taskId = await __classPrivateFieldGet(this, _weakReference_2, "f").__externalServiceCallStoreRecursiveMessage(context, partialRequest, __classPrivateFieldGet(this, _options_2, "f"));
            return {
                task: Greeter.StoreRecursiveMessageTask
                    .retrieve(context, { taskId })
            };
        }
        async readRecursiveMessage(context, partialRequest) {
            const taskId = await __classPrivateFieldGet(this, _weakReference_2, "f").__externalServiceCallReadRecursiveMessage(context, partialRequest, __classPrivateFieldGet(this, _options_2, "f"));
            return {
                task: Greeter.ReadRecursiveMessageTask
                    .retrieve(context, { taskId })
            };
        }
        async constructAndStoreRecursiveMessage(context, partialRequest) {
            const taskId = await __classPrivateFieldGet(this, _weakReference_2, "f").__externalServiceCallConstructAndStoreRecursiveMessage(context, partialRequest, __classPrivateFieldGet(this, _options_2, "f"));
            return {
                task: Greeter.ConstructAndStoreRecursiveMessageTask
                    .retrieve(context, { taskId })
            };
        }
    },
    _weakReference_2 = new WeakMap(),
    _options_2 = new WeakMap(),
    _g);
export class Greeter {
    static ref(idOrOptions, options) {
        if (idOrOptions === undefined || typeof idOrOptions === "object") {
            const context = reboot.getContext();
            if (context instanceof WorkflowContext) {
                // We support calling `Greeter.ref()` with
                // no `id` __only__ inside a workflow to be able to call an
                // inline writer, inline reader or other method call, since
                // workflow is a `static` and therefor we can't get a
                // reference to outselves as `this.ref()`.
                const servicer = GreeterBaseServicer.__servicer__.getStore()?.servicer;
                if (servicer !== undefined) {
                    return new Greeter.WeakReference(context.stateId, idOrOptions?.bearerToken, servicer);
                }
            }
            return new Greeter.WeakReference(context.stateId, idOrOptions?.bearerToken);
        }
        if (typeof idOrOptions !== "string") {
            throw new TypeError(`Expecting first argument to be a 'string' "id", ` +
                `got '${typeof idOrOptions}'`);
        }
        return new Greeter.WeakReference(idOrOptions, options?.bearerToken);
    }
    static async create(context, idOrPartialRequest, partialRequestOrOptions, optionsOrUndefined) {
        let id = undefined;
        let partialRequest = undefined;
        let options = undefined;
        if (typeof idOrPartialRequest === "string" || idOrPartialRequest instanceof String) {
            id = idOrPartialRequest;
            partialRequest = partialRequestOrOptions;
            options = optionsOrUndefined;
        }
        else {
            partialRequest = idOrPartialRequest;
            options = partialRequestOrOptions;
            if (optionsOrUndefined !== undefined) {
                throw new Error(`Invalid arguments passed to 'Greeter.create'`);
            }
        }
        if (options === undefined || !("idempotency" in options)) {
            if (context instanceof WorkflowContext) {
                return await (reboot.isWithinLoop()
                    ? Greeter.perIteration()
                    : Greeter.perWorkflow()).create(context, idOrPartialRequest, partialRequestOrOptions, optionsOrUndefined);
            }
            else if (context instanceof InitializeContext) {
                return await Greeter.idempotently()
                    .create(context, idOrPartialRequest, partialRequestOrOptions, optionsOrUndefined);
            }
        }
        if (id === undefined) {
            id = uuid.v4();
        }
        const weakReference = Greeter.ref(id);
        const response = await weakReference.__externalServiceCallCreate(context, partialRequest, options);
        return [
            weakReference,
            response,
        ];
    }
    static forall(ids) {
        return new Greeter._Forall(ids);
    }
    static idempotently(aliasOrOptions = {}) {
        const idempotency = (typeof aliasOrOptions === "string" || aliasOrOptions instanceof String) ? { alias: aliasOrOptions } : aliasOrOptions;
        return new Greeter._ConstructIdempotently(idempotency);
    }
    static perWorkflow(alias) {
        return Greeter
            .idempotently({ alias });
    }
    static perIteration(alias) {
        return Greeter
            .idempotently({ alias, perIteration: true });
    }
    static always() {
        return Greeter
            .idempotently({ always: true });
    }
}
Greeter.singleton = { Servicer: GreeterSingletonServicer };
Greeter.Servicer = GreeterServicer;
Greeter.servicer = GreeterBaseServicer.servicer;
Greeter.State = GreeterState;
Greeter.Authorizer = GreeterAuthorizer;
Greeter.WeakReference = GreeterWeakReference;
Greeter.CreateAborted = GreeterCreateAborted;
Greeter.CreateTask = GreeterCreateTask;
Greeter.GreetAborted = GreeterGreetAborted;
Greeter.GreetTask = GreeterGreetTask;
Greeter.SetAdjectiveAborted = GreeterSetAdjectiveAborted;
Greeter.SetAdjectiveTask = GreeterSetAdjectiveTask;
Greeter.TransactionSetAdjectiveAborted = GreeterTransactionSetAdjectiveAborted;
Greeter.TransactionSetAdjectiveTask = GreeterTransactionSetAdjectiveTask;
Greeter.TryToConstructContextAborted = GreeterTryToConstructContextAborted;
Greeter.TryToConstructContextTask = GreeterTryToConstructContextTask;
Greeter.TryToConstructExternalContextAborted = GreeterTryToConstructExternalContextAborted;
Greeter.TryToConstructExternalContextTask = GreeterTryToConstructExternalContextTask;
Greeter.TestLongRunningFetchAborted = GreeterTestLongRunningFetchAborted;
Greeter.TestLongRunningFetchTask = GreeterTestLongRunningFetchTask;
Greeter.TestLongRunningWriterAborted = GreeterTestLongRunningWriterAborted;
Greeter.TestLongRunningWriterTask = GreeterTestLongRunningWriterTask;
Greeter.GetWholeStateAborted = GreeterGetWholeStateAborted;
Greeter.GetWholeStateTask = GreeterGetWholeStateTask;
Greeter.FailWithExceptionAborted = GreeterFailWithExceptionAborted;
Greeter.FailWithExceptionTask = GreeterFailWithExceptionTask;
Greeter.FailWithAbortedAborted = GreeterFailWithAbortedAborted;
Greeter.FailWithAbortedTask = GreeterFailWithAbortedTask;
Greeter.WorkflowAborted = GreeterWorkflowAborted;
Greeter.WorkflowTask = GreeterWorkflowTask;
Greeter.DangerousFieldsAborted = GreeterDangerousFieldsAborted;
Greeter.DangerousFieldsTask = GreeterDangerousFieldsTask;
Greeter.StoreRecursiveMessageAborted = GreeterStoreRecursiveMessageAborted;
Greeter.StoreRecursiveMessageTask = GreeterStoreRecursiveMessageTask;
Greeter.ReadRecursiveMessageAborted = GreeterReadRecursiveMessageAborted;
Greeter.ReadRecursiveMessageTask = GreeterReadRecursiveMessageTask;
Greeter.ConstructAndStoreRecursiveMessageAborted = GreeterConstructAndStoreRecursiveMessageAborted;
Greeter.ConstructAndStoreRecursiveMessageTask = GreeterConstructAndStoreRecursiveMessageTask;
Greeter._Forall = (_h = class {
        constructor(ids) {
            _ids.set(this, void 0);
            __classPrivateFieldSet(this, _ids, [...ids], "f");
        }
        async greet(context, partialRequest, options) {
            return Promise.all(__classPrivateFieldGet(this, _ids, "f").map((id) => Greeter.ref(id, options).greet(context, partialRequest)));
        }
        async setAdjective(context, partialRequest, options) {
            return Promise.all(__classPrivateFieldGet(this, _ids, "f").map((id) => Greeter.ref(id, options).setAdjective(context, partialRequest)));
        }
        async transactionSetAdjective(context, partialRequest, options) {
            return Promise.all(__classPrivateFieldGet(this, _ids, "f").map((id) => Greeter.ref(id, options).transactionSetAdjective(context, partialRequest)));
        }
        async tryToConstructContext(context, partialRequest, options) {
            return Promise.all(__classPrivateFieldGet(this, _ids, "f").map((id) => Greeter.ref(id, options).tryToConstructContext(context, partialRequest)));
        }
        async tryToConstructExternalContext(context, partialRequest, options) {
            return Promise.all(__classPrivateFieldGet(this, _ids, "f").map((id) => Greeter.ref(id, options).tryToConstructExternalContext(context, partialRequest)));
        }
        async testLongRunningFetch(context, partialRequest, options) {
            return Promise.all(__classPrivateFieldGet(this, _ids, "f").map((id) => Greeter.ref(id, options).testLongRunningFetch(context, partialRequest)));
        }
        async testLongRunningWriter(context, partialRequest, options) {
            return Promise.all(__classPrivateFieldGet(this, _ids, "f").map((id) => Greeter.ref(id, options).testLongRunningWriter(context, partialRequest)));
        }
        async getWholeState(context, partialRequest, options) {
            return Promise.all(__classPrivateFieldGet(this, _ids, "f").map((id) => Greeter.ref(id, options).getWholeState(context, partialRequest)));
        }
        async failWithException(context, partialRequest, options) {
            return Promise.all(__classPrivateFieldGet(this, _ids, "f").map((id) => Greeter.ref(id, options).failWithException(context, partialRequest)));
        }
        async failWithAborted(context, partialRequest, options) {
            return Promise.all(__classPrivateFieldGet(this, _ids, "f").map((id) => Greeter.ref(id, options).failWithAborted(context, partialRequest)));
        }
        async dangerousFields(context, partialRequest, options) {
            return Promise.all(__classPrivateFieldGet(this, _ids, "f").map((id) => Greeter.ref(id, options).dangerousFields(context, partialRequest)));
        }
        async storeRecursiveMessage(context, partialRequest, options) {
            return Promise.all(__classPrivateFieldGet(this, _ids, "f").map((id) => Greeter.ref(id, options).storeRecursiveMessage(context, partialRequest)));
        }
        async readRecursiveMessage(context, partialRequest, options) {
            return Promise.all(__classPrivateFieldGet(this, _ids, "f").map((id) => Greeter.ref(id, options).readRecursiveMessage(context, partialRequest)));
        }
        async constructAndStoreRecursiveMessage(context, partialRequest, options) {
            return Promise.all(__classPrivateFieldGet(this, _ids, "f").map((id) => Greeter.ref(id, options).constructAndStoreRecursiveMessage(context, partialRequest)));
        }
    },
    _ids = new WeakMap(),
    _h);
Greeter._ConstructIdempotently = (_j = class {
        constructor(idempotency) {
            _idempotency_1.set(this, void 0);
            __classPrivateFieldSet(this, _idempotency_1, idempotency, "f");
        }
        async create(context, idOrPartialRequest, partialRequestOrOptions, optionsOrUndefined) {
            let id = undefined;
            let partialRequest = undefined;
            let options = {};
            if (typeof idOrPartialRequest === "string" || idOrPartialRequest instanceof String) {
                id = idOrPartialRequest;
                partialRequest = partialRequestOrOptions;
                options = optionsOrUndefined;
            }
            else {
                partialRequest = idOrPartialRequest;
                options = partialRequestOrOptions;
                if (optionsOrUndefined !== undefined) {
                    throw new Error(`Not expecting more than 'partialRequest' and 'options' arguments after 'context'`);
                }
            }
            if (id === undefined) {
                id = await context.generateIdempotentStateId("tests.reboot.Greeter", "tests.reboot.GreeterMethods", "Create", __classPrivateFieldGet(this, _idempotency_1, "f"));
            }
            return await Greeter.create(context, id, partialRequest, {
                ...options,
                idempotency: __classPrivateFieldGet(this, _idempotency_1, "f"),
            });
        }
    },
    _idempotency_1 = new WeakMap(),
    _j);
export function importPys() {
    reboot_native.importPy("tests.reboot.greeter_pb2", "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");
    reboot_native.importPy("tests.reboot.greeter_pb2_grpc", "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");
    reboot_native.importPy("tests.reboot.greeter_rbt", "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");
}
importPys();
