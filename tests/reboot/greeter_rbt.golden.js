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
// transaction ID because more than one transaction may be running on
// a state at the same time and each needs its own entry.
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
        // The state that the transaction ongoing on this same state is
        // using when we are called, or `undefined` when there is none.
        const ongoingTransactionState = ongoingTransactionStates[ongoingTransactionStateKey(context)];
        try {
            statesBeingConstructed.add(context.stateId);
            let state = GreeterFromBinary(bytesState, 
            // Don't validate if we're constructing because non-optional
            // fields that this method might be setting will be invalid.
            { validate: !(statesBeingConstructed.has(context.stateId)) });
            // A reader, a writer or a transaction called within a
            // transaction on this same state continues from the state its
            // caller is using, because the caller's writes only reach the
            // stored state once the caller returns. It works on a copy, so
            // that aborting drops its writes, and a writer or a transaction
            // hands them back to the caller below once it has returned
            // successfully.
            if (ongoingTransactionState !== undefined) {
                state = ongoingTransactionState.clone();
            }
            const request = GreeterCreateRequestFromBinary(bytesRequest);
            let partialResponse = await reboot.runWithContext(context, () => {
                return this.__Create(context, state, request);
            });
            const response = GreeterCreateResponseToProtobuf(partialResponse);
            // We have returned successfully, so hand what we wrote to the
            // transaction we were called within, which is still holding the
            // state we copied ours from.
            //
            // TODO: it's premature to overwrite the caller's state now given
            // that we might still "fail" and an error will get propagated
            // back to the caller which will still see our effects. What we
            // should be doing instead is creating a callback API that we
            // invoke only after we complete that lets us update the state
            // _reference_ then.
            if (ongoingTransactionState !== undefined) {
                ongoingTransactionState.copyFrom(state);
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
        // The state that the transaction ongoing on this same state is
        // using when we are called, or `undefined` when there is none.
        const ongoingTransactionState = ongoingTransactionStates[ongoingTransactionStateKey(context)];
        try {
            let state = GreeterFromBinary(bytesState, 
            // Don't validate if we're constructing because non-optional
            // fields that this method might be setting will be invalid.
            { validate: !(statesBeingConstructed.has(context.stateId)) });
            // A reader, a writer or a transaction called within a
            // transaction on this same state continues from the state its
            // caller is using, because the caller's writes only reach the
            // stored state once the caller returns. It works on a copy, so
            // that aborting drops its writes, and a writer or a transaction
            // hands them back to the caller below once it has returned
            // successfully.
            if (ongoingTransactionState !== undefined) {
                state = ongoingTransactionState.clone();
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
        // The state that the transaction ongoing on this same state is
        // using when we are called, or `undefined` when there is none.
        const ongoingTransactionState = ongoingTransactionStates[ongoingTransactionStateKey(context)];
        try {
            let state = GreeterFromBinary(bytesState, 
            // Don't validate if we're constructing because non-optional
            // fields that this method might be setting will be invalid.
            { validate: !(statesBeingConstructed.has(context.stateId)) });
            // A reader, a writer or a transaction called within a
            // transaction on this same state continues from the state its
            // caller is using, because the caller's writes only reach the
            // stored state once the caller returns. It works on a copy, so
            // that aborting drops its writes, and a writer or a transaction
            // hands them back to the caller below once it has returned
            // successfully.
            if (ongoingTransactionState !== undefined) {
                state = ongoingTransactionState.clone();
            }
            const request = GreeterSetAdjectiveRequestFromBinary(bytesRequest);
            let partialResponse = await reboot.runWithContext(context, () => {
                return this.__SetAdjective(context, state, request);
            });
            const response = GreeterSetAdjectiveResponseToProtobuf(partialResponse);
            // We have returned successfully, so hand what we wrote to the
            // transaction we were called within, which is still holding the
            // state we copied ours from.
            //
            // TODO: it's premature to overwrite the caller's state now given
            // that we might still "fail" and an error will get propagated
            // back to the caller which will still see our effects. What we
            // should be doing instead is creating a callback API that we
            // invoke only after we complete that lets us update the state
            // _reference_ then.
            if (ongoingTransactionState !== undefined) {
                ongoingTransactionState.copyFrom(state);
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
        // The state that the transaction ongoing on this same state is
        // using when we are called, or `undefined` when there is none.
        const ongoingTransactionState = context.nested
            ? ongoingTransactionStates[ongoingTransactionStateKey(context)]
            : undefined;
        try {
            let state = GreeterFromBinary(bytesState, 
            // Don't validate if we're constructing because non-optional
            // fields that this method might be setting will be invalid.
            { validate: !(statesBeingConstructed.has(context.stateId)) });
            // A reader, a writer or a transaction called within a
            // transaction on this same state continues from the state its
            // caller is using, because the caller's writes only reach the
            // stored state once the caller returns. It works on a copy, so
            // that aborting drops its writes, and a writer or a transaction
            // hands them back to the caller below once it has returned
            // successfully.
            if (ongoingTransactionState !== undefined) {
                state = ongoingTransactionState.clone();
            }
            // While we run, our state is the one that the readers, writers
            // and transactions we call on this state continue from and hand
            // their writes back to. The `state` should already be validated
            // above, so we can just store it here.
            ongoingTransactionStates[ongoingTransactionStateKey(context)] = state;
            const request = GreeterTransactionSetAdjectiveRequestFromBinary(bytesRequest);
            let partialResponse = await reboot.runWithContext(context, () => {
                return this.__TransactionSetAdjective(context, state, request);
            });
            const response = GreeterTransactionSetAdjectiveResponseToProtobuf(partialResponse);
            // We have returned successfully, so hand what we wrote to the
            // transaction we were called within, which is still holding the
            // state we copied ours from.
            //
            // TODO: it's premature to overwrite the caller's state now given
            // that we might still "fail" and an error will get propagated
            // back to the caller which will still see our effects. What we
            // should be doing instead is creating a callback API that we
            // invoke only after we complete that lets us update the state
            // _reference_ then.
            if (ongoingTransactionState !== undefined) {
                ongoingTransactionState.copyFrom(state);
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
            console.error(`Unhandled error in 'tests.reboot.Greeter.transactionSetAdjective'; propagating as 'Unknown'\n`);
            throw error;
        }
        finally {
            // Our caller's state is the ongoing one again, so that a writer
            // the caller runs after us continues from it. The outermost
            // transaction on this state has no caller, and removes the
            // entry.
            if (ongoingTransactionState !== undefined) {
                ongoingTransactionStates[ongoingTransactionStateKey(context)] = ongoingTransactionState;
            }
            else {
                delete ongoingTransactionStates[ongoingTransactionStateKey(context)];
            }
        }
    }
    async _TryToConstructContext(context, bytesState, // `undefined` for a workflow.
    bytesRequest) {
        // The state that the transaction ongoing on this same state is
        // using when we are called, or `undefined` when there is none.
        const ongoingTransactionState = ongoingTransactionStates[ongoingTransactionStateKey(context)];
        try {
            let state = GreeterFromBinary(bytesState, 
            // Don't validate if we're constructing because non-optional
            // fields that this method might be setting will be invalid.
            { validate: !(statesBeingConstructed.has(context.stateId)) });
            // A reader, a writer or a transaction called within a
            // transaction on this same state continues from the state its
            // caller is using, because the caller's writes only reach the
            // stored state once the caller returns. It works on a copy, so
            // that aborting drops its writes, and a writer or a transaction
            // hands them back to the caller below once it has returned
            // successfully.
            if (ongoingTransactionState !== undefined) {
                state = ongoingTransactionState.clone();
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
        // The state that the transaction ongoing on this same state is
        // using when we are called, or `undefined` when there is none.
        const ongoingTransactionState = ongoingTransactionStates[ongoingTransactionStateKey(context)];
        try {
            let state = GreeterFromBinary(bytesState, 
            // Don't validate if we're constructing because non-optional
            // fields that this method might be setting will be invalid.
            { validate: !(statesBeingConstructed.has(context.stateId)) });
            // A reader, a writer or a transaction called within a
            // transaction on this same state continues from the state its
            // caller is using, because the caller's writes only reach the
            // stored state once the caller returns. It works on a copy, so
            // that aborting drops its writes, and a writer or a transaction
            // hands them back to the caller below once it has returned
            // successfully.
            if (ongoingTransactionState !== undefined) {
                state = ongoingTransactionState.clone();
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
        // The state that the transaction ongoing on this same state is
        // using when we are called, or `undefined` when there is none.
        const ongoingTransactionState = ongoingTransactionStates[ongoingTransactionStateKey(context)];
        try {
            let state = GreeterFromBinary(bytesState, 
            // Don't validate if we're constructing because non-optional
            // fields that this method might be setting will be invalid.
            { validate: !(statesBeingConstructed.has(context.stateId)) });
            // A reader, a writer or a transaction called within a
            // transaction on this same state continues from the state its
            // caller is using, because the caller's writes only reach the
            // stored state once the caller returns. It works on a copy, so
            // that aborting drops its writes, and a writer or a transaction
            // hands them back to the caller below once it has returned
            // successfully.
            if (ongoingTransactionState !== undefined) {
                state = ongoingTransactionState.clone();
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
        // The state that the transaction ongoing on this same state is
        // using when we are called, or `undefined` when there is none.
        const ongoingTransactionState = ongoingTransactionStates[ongoingTransactionStateKey(context)];
        try {
            let state = GreeterFromBinary(bytesState, 
            // Don't validate if we're constructing because non-optional
            // fields that this method might be setting will be invalid.
            { validate: !(statesBeingConstructed.has(context.stateId)) });
            // A reader, a writer or a transaction called within a
            // transaction on this same state continues from the state its
            // caller is using, because the caller's writes only reach the
            // stored state once the caller returns. It works on a copy, so
            // that aborting drops its writes, and a writer or a transaction
            // hands them back to the caller below once it has returned
            // successfully.
            if (ongoingTransactionState !== undefined) {
                state = ongoingTransactionState.clone();
            }
            const request = GreeterTestLongRunningWriterRequestFromBinary(bytesRequest);
            let partialResponse = await reboot.runWithContext(context, () => {
                return this.__TestLongRunningWriter(context, state, request);
            });
            const response = GreeterTestLongRunningWriterResponseToProtobuf(partialResponse);
            // We have returned successfully, so hand what we wrote to the
            // transaction we were called within, which is still holding the
            // state we copied ours from.
            //
            // TODO: it's premature to overwrite the caller's state now given
            // that we might still "fail" and an error will get propagated
            // back to the caller which will still see our effects. What we
            // should be doing instead is creating a callback API that we
            // invoke only after we complete that lets us update the state
            // _reference_ then.
            if (ongoingTransactionState !== undefined) {
                ongoingTransactionState.copyFrom(state);
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
        // The state that the transaction ongoing on this same state is
        // using when we are called, or `undefined` when there is none.
        const ongoingTransactionState = ongoingTransactionStates[ongoingTransactionStateKey(context)];
        try {
            let state = GreeterFromBinary(bytesState, 
            // Don't validate if we're constructing because non-optional
            // fields that this method might be setting will be invalid.
            { validate: !(statesBeingConstructed.has(context.stateId)) });
            // A reader, a writer or a transaction called within a
            // transaction on this same state continues from the state its
            // caller is using, because the caller's writes only reach the
            // stored state once the caller returns. It works on a copy, so
            // that aborting drops its writes, and a writer or a transaction
            // hands them back to the caller below once it has returned
            // successfully.
            if (ongoingTransactionState !== undefined) {
                state = ongoingTransactionState.clone();
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
        // The state that the transaction ongoing on this same state is
        // using when we are called, or `undefined` when there is none.
        const ongoingTransactionState = ongoingTransactionStates[ongoingTransactionStateKey(context)];
        try {
            let state = GreeterFromBinary(bytesState, 
            // Don't validate if we're constructing because non-optional
            // fields that this method might be setting will be invalid.
            { validate: !(statesBeingConstructed.has(context.stateId)) });
            // A reader, a writer or a transaction called within a
            // transaction on this same state continues from the state its
            // caller is using, because the caller's writes only reach the
            // stored state once the caller returns. It works on a copy, so
            // that aborting drops its writes, and a writer or a transaction
            // hands them back to the caller below once it has returned
            // successfully.
            if (ongoingTransactionState !== undefined) {
                state = ongoingTransactionState.clone();
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
        // The state that the transaction ongoing on this same state is
        // using when we are called, or `undefined` when there is none.
        const ongoingTransactionState = ongoingTransactionStates[ongoingTransactionStateKey(context)];
        try {
            let state = GreeterFromBinary(bytesState, 
            // Don't validate if we're constructing because non-optional
            // fields that this method might be setting will be invalid.
            { validate: !(statesBeingConstructed.has(context.stateId)) });
            // A reader, a writer or a transaction called within a
            // transaction on this same state continues from the state its
            // caller is using, because the caller's writes only reach the
            // stored state once the caller returns. It works on a copy, so
            // that aborting drops its writes, and a writer or a transaction
            // hands them back to the caller below once it has returned
            // successfully.
            if (ongoingTransactionState !== undefined) {
                state = ongoingTransactionState.clone();
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
        // The state that the transaction ongoing on this same state is
        // using when we are called, or `undefined` when there is none.
        const ongoingTransactionState = ongoingTransactionStates[ongoingTransactionStateKey(context)];
        try {
            let state = GreeterFromBinary(bytesState, 
            // Don't validate if we're constructing because non-optional
            // fields that this method might be setting will be invalid.
            { validate: !(statesBeingConstructed.has(context.stateId)) });
            // A reader, a writer or a transaction called within a
            // transaction on this same state continues from the state its
            // caller is using, because the caller's writes only reach the
            // stored state once the caller returns. It works on a copy, so
            // that aborting drops its writes, and a writer or a transaction
            // hands them back to the caller below once it has returned
            // successfully.
            if (ongoingTransactionState !== undefined) {
                state = ongoingTransactionState.clone();
            }
            const request = GreeterDangerousFieldsRequestFromBinary(bytesRequest);
            let partialResponse = await reboot.runWithContext(context, () => {
                return this.__DangerousFields(context, state, request);
            });
            const response = GreeterDangerousFieldsResponseToProtobuf(partialResponse);
            // We have returned successfully, so hand what we wrote to the
            // transaction we were called within, which is still holding the
            // state we copied ours from.
            //
            // TODO: it's premature to overwrite the caller's state now given
            // that we might still "fail" and an error will get propagated
            // back to the caller which will still see our effects. What we
            // should be doing instead is creating a callback API that we
            // invoke only after we complete that lets us update the state
            // _reference_ then.
            if (ongoingTransactionState !== undefined) {
                ongoingTransactionState.copyFrom(state);
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
        // The state that the transaction ongoing on this same state is
        // using when we are called, or `undefined` when there is none.
        const ongoingTransactionState = ongoingTransactionStates[ongoingTransactionStateKey(context)];
        try {
            let state = GreeterFromBinary(bytesState, 
            // Don't validate if we're constructing because non-optional
            // fields that this method might be setting will be invalid.
            { validate: !(statesBeingConstructed.has(context.stateId)) });
            // A reader, a writer or a transaction called within a
            // transaction on this same state continues from the state its
            // caller is using, because the caller's writes only reach the
            // stored state once the caller returns. It works on a copy, so
            // that aborting drops its writes, and a writer or a transaction
            // hands them back to the caller below once it has returned
            // successfully.
            if (ongoingTransactionState !== undefined) {
                state = ongoingTransactionState.clone();
            }
            const request = GreeterStoreRecursiveMessageRequestFromBinary(bytesRequest);
            let partialResponse = await reboot.runWithContext(context, () => {
                return this.__StoreRecursiveMessage(context, state, request);
            });
            const response = GreeterStoreRecursiveMessageResponseToProtobuf(partialResponse);
            // We have returned successfully, so hand what we wrote to the
            // transaction we were called within, which is still holding the
            // state we copied ours from.
            //
            // TODO: it's premature to overwrite the caller's state now given
            // that we might still "fail" and an error will get propagated
            // back to the caller which will still see our effects. What we
            // should be doing instead is creating a callback API that we
            // invoke only after we complete that lets us update the state
            // _reference_ then.
            if (ongoingTransactionState !== undefined) {
                ongoingTransactionState.copyFrom(state);
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
        // The state that the transaction ongoing on this same state is
        // using when we are called, or `undefined` when there is none.
        const ongoingTransactionState = ongoingTransactionStates[ongoingTransactionStateKey(context)];
        try {
            let state = GreeterFromBinary(bytesState, 
            // Don't validate if we're constructing because non-optional
            // fields that this method might be setting will be invalid.
            { validate: !(statesBeingConstructed.has(context.stateId)) });
            // A reader, a writer or a transaction called within a
            // transaction on this same state continues from the state its
            // caller is using, because the caller's writes only reach the
            // stored state once the caller returns. It works on a copy, so
            // that aborting drops its writes, and a writer or a transaction
            // hands them back to the caller below once it has returned
            // successfully.
            if (ongoingTransactionState !== undefined) {
                state = ongoingTransactionState.clone();
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
        // The state that the transaction ongoing on this same state is
        // using when we are called, or `undefined` when there is none.
        const ongoingTransactionState = context.nested
            ? ongoingTransactionStates[ongoingTransactionStateKey(context)]
            : undefined;
        try {
            let state = GreeterFromBinary(bytesState, 
            // Don't validate if we're constructing because non-optional
            // fields that this method might be setting will be invalid.
            { validate: !(statesBeingConstructed.has(context.stateId)) });
            // A reader, a writer or a transaction called within a
            // transaction on this same state continues from the state its
            // caller is using, because the caller's writes only reach the
            // stored state once the caller returns. It works on a copy, so
            // that aborting drops its writes, and a writer or a transaction
            // hands them back to the caller below once it has returned
            // successfully.
            if (ongoingTransactionState !== undefined) {
                state = ongoingTransactionState.clone();
            }
            // While we run, our state is the one that the readers, writers
            // and transactions we call on this state continue from and hand
            // their writes back to. The `state` should already be validated
            // above, so we can just store it here.
            ongoingTransactionStates[ongoingTransactionStateKey(context)] = state;
            const request = GreeterConstructAndStoreRecursiveMessageRequestFromBinary(bytesRequest);
            let partialResponse = await reboot.runWithContext(context, () => {
                return this.__ConstructAndStoreRecursiveMessage(context, state, request);
            });
            const response = GreeterConstructAndStoreRecursiveMessageResponseToProtobuf(partialResponse);
            // We have returned successfully, so hand what we wrote to the
            // transaction we were called within, which is still holding the
            // state we copied ours from.
            //
            // TODO: it's premature to overwrite the caller's state now given
            // that we might still "fail" and an error will get propagated
            // back to the caller which will still see our effects. What we
            // should be doing instead is creating a callback API that we
            // invoke only after we complete that lets us update the state
            // _reference_ then.
            if (ongoingTransactionState !== undefined) {
                ongoingTransactionState.copyFrom(state);
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
            console.error(`Unhandled error in 'tests.reboot.Greeter.constructAndStoreRecursiveMessage'; propagating as 'Unknown'\n`);
            throw error;
        }
        finally {
            // Our caller's state is the ongoing one again, so that a writer
            // the caller runs after us continues from it. The outermost
            // transaction on this state has no caller, and removes the
            // entry.
            if (ongoingTransactionState !== undefined) {
                ongoingTransactionStates[ongoingTransactionStateKey(context)] = ongoingTransactionState;
            }
            else {
                delete ongoingTransactionStates[ongoingTransactionStateKey(context)];
            }
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
            nested: call.context.transactionNested,
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
