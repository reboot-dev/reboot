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
    reboot_native.importPy("tests.reboot.greeter_pb2", "H4sIAAAAAAAC/81ba3fbxhH9rl+BMG0lOTGFJx/qcY8ZEpJVS6QCQmbSMAfFYymhJgEWWDpUf333ARCLJQACMuX2g0WJO3Pnzuzs7Axw/L3w9s1bwQ09P3i8FDZw8baHvzn5XrgGAYhsCDzBeRbgExDWUQhDN1wKzmaxABFSWq39JYjagjCaCOOJKeijG/M7pBqHm8gFlwIEMYwvIuCEIbx4jACASJrAIKF7/ImghPtn+BQGwicQxX4YXApaW+60pZNWq5VR2LftgTaSOFlE4Up4DMPHJaDIGNFfrcMICh6I3chfwzAS7Fiwsj9ralnrEFnMq5LvKvXj55UTLi3PhrZjx4Doc98V6rf9AIUnsJcpkLPxlx6g3JPfUdjev6exsPwgBhFEEUOUkOoZ1YrPT06wOctzhHd7htsjsLA3S3iGpCiJyIHtL5K9XD/ZUmo4XGPY2Fo7MjaORCwvhFYqRv5IZbBQORK048/VOFQiQykJKlit4XMKRGWIeipH/qBCe1j22k9h7CAIoZ3zjgFDgvSTkSJoJycjfTo0bu7NiYGjyqVDFtX2wPOmIPLtpf8f4F2h03HmnM6D+Vayy88CWpXnW9ElEm0qgTXwPxSzizReF0nMd1pYopeTINHMrTvUv4s0UBckSDkRNxFB7l8wricyrfnWVhE9Cbshdq8pc8pZUsmXGvThEmAyWE7AP87m0GBXZPIPC6uBvUplZVY2XcCiLhKFtvcv4EL/SyqtZNK5NfkjibAUAXeDSsgXYK1AHNuPqZ6a6G1FZ75VMDxos7FuG6niHdVDbCQx4r68xEjzbQ/pO1qCLM5bM2Q7GkYA7a8B/r1BsP8/oWlhPwgyklOVhGS8RptLFm1tt68u2de8B/ukpBJSKnW2twLIOio1rA/KLvBn+aizFtt3iaYewOjZ4LDsv+Ig50QSitQ75TN4LmKYfM/sxhd7uSmMMF3Be4ykFYI0b51jswnNJGoUrUfPQj7NcqZ3ayjMC5CGWVKmAA7S/clHu3BfpbKUn89pzs+3HSlyfBjZ0TOX9nI+7S/y0S8g0h6jH8BjDwELf7dDxyGi/mgR+IIuIcteoJpgSVYM3DDwuKREm4nBZCo7wKLSNBW0SbhRnHPGiRFSOMVFzkV2A3MBB6zYJyLV0glHNe9qtpFv6S7immn5HgeaFQu1zd5sbROJ33jYZAeSX+ctWn8cE3lwGwaPxiYIUDd1BaD7xOzxj0RKjpcArC3or0ASrZizHJHIEzETSU0TIXyYO9ShawBnT+ESTCFTdVpnZFGchdHnxTL8g0vZggMg7R+Aeesvu3qhRVEYzXz49CnRaQLzT0qGr6zNzw/NtrQUgS0szu5aRT0BaP1CyLlTdH+DPTH2UCqVRBuZZguCtCAEvBICWYGWPJpZBrC9MqKpN8UybA68ijfv58HZENmA0caFg8A7HNQ0h9CBRfdpR1vDpz0qmsFLtH6YB+c1DGXBc0iakOB0yBWFCkTwCKJwE1/5YOnFeVZ24RXGUWKXmUSOdkj51CQ6zCpjJ8q2Jl8rqZ0of3qT/I/BcrHX1BCFdIkhhfxVQjRS7I6MxvHKCcjf0T4AfSnjmJNyimo6DD+DIAHo5AEcTtZMROW0UomdXTOL1bt59WyR8XCz2VXiHudhssSGA24cIgz5YNAFtBFYzvE91PSGEAQubRMCttJwqxi+T7coxuU1uxmcXH0ii7j44wND6eBqnXd/5btRGO+lkmIwi7TiSiLK5/Ufdv7KYF0N13s4PWO31HpH+wEGJUugs7QVRaeWBVHYUy/nTz12xsi0Wn+j+HcYexguw4iheb470Ape2eMJEhNK3gSFyWm27uklyZrJ/Likd9MKL6IL1nJfYC1Ktcnfb/6cUldT6jI5GqStNPQRbYJQo48XIBW+NnR9nCxIiQY9c6jGqPLtg54s0ptr25fIwSLck/EJ9bJPIbn55TuaKrsGPdl3h2PPTRhkbisWySogYpWfV9SErZx8Erc+JF5hZmmNKu/U07GyUIIx3eFM0zwmBn+nlYZty0gBOtigEtutKrFKAozPTyTNumZkB7Ht4nH3f8DGTtlMaC9tRs9muLvihllpxgWlzT8t0vEcn+xG2eqBjZjRNiRvV9/Sp1DfwD6+N2hHW9Q6k8rCFaXKDvsrmKQ7kMefRX72qOOYEWAy0SAzJtvQk1Uurwo7fmpZKziJiPQBhz+m46PawbvgL3Gjr29dQB4xveam/5pOdazlgRNGaPr7WrsSZze5PcXL0pHmH/SqT4emWgS4/nhv4Com0qomMtuFZb9Rxet/yhsd2SWt7Fcl45Yeg8LWGq+/4apdda9v/1BLvG7N3tBSUTTnFJSKqpEJUXtTR7redYYueJc+4Pnu4HySDGIdvjWpPT/hxyXdxtr1LiLcq7j2zjnSFC1D9zMmfU87afzVJopAANlmt/K0FPSV5IRolIinzLcApXxfoWREOsVEFy61Q56UJE8ZlbTHRZ3OangcHsTxXSeH3YS7HjrBBXtpzDfqGH9RKsVEXzxLLf1Czzv15RtYTH1UdrcunvVo10u6bXrR/YxWgqz7TvhwloqGAFsol2Hp0JlR7JA9Uk7x26rHZejYy1h4JyS/nZ2fpC+82j/hzySRUYLrwWY12r19ic+y9zI/CikQr22Ga0YFgSRwee3THP3kBQ1++3PKIvsLIQgh+waobT1MdWtoZVjTyxNByP5sW8vQ9oCXvjJDfo7DACCZFPa3UwvPFKZunP7eVDrevW1iNJzTuYwOk4xGcxFtvCiKpwUAhv7zgz41rTvdHIwG5kAfm8avTRiUApSQ6iEm0mmhKwjiw2Q0RcorOhpZzrOFXzD8dkrnmmaRqQVXL3TqXJRl9Cknn2JjB0hLdjT+O7R69HEtfwlpdpI5GncetK4LL418yXx3NH8q8Gu7przUtYJh8YiOlaC/btJVTqKv5FyBlVd2smCIPZ5vJeDf1CU6N7+WTxn6a5eP3NR9vALOo77u3lzZ3HB/NEcKkb+NM8nzgqO7wuDWckROHLmci1JHzw31jX1LnyMczSkWsK43rWN5wz2gOJpTBbivXQYKh+rj9URl6K/tVtEzj6N5VQb+uuXh4KOQ400RdSx9XQ84vJ0MPxbazp581PSnLlQVYUVW5oqqzmX0SUhLXZJ6+Sc1vA+T2wk/psbQjuA7GWEelgWBhySVfp3xl+JKWq+OMAZWZJ6BoQ+QKJ1qC9EVWa2vgm2oklSsML2fjKd6oRFVUhroECtyv3w8L7ahyLU1sAWt333hAwBqT1N6L9Svsl4RRK3fr6+CbXRUMa8wxaT+rg/Nm0+VOdFRlaaK2F6P96lAzRqjH/roTp9OB9fFfvZU6etganCpCHOPD3MNTWyx3+HywUQUbyfja+NhPL4ZX1/p5vBDVdT7XfGlANi+JKoalx+6OfswuUXiB2oAUu02VqU2O1ywZhPj49XtZFYZYknsSo3UiC2JLzy6YUyM2Y354dPg9qHEksRXnkolakfj7Bj68MGYot2vylqkpjRSI7ZklU82c2LovGbl3sk83QYQhIOi1ONQtaGKKr0cg7Loynz4BqNGgVC66ksRCANVVOroV4VBFbUXQ1AOff6iRJKm8TA0B+NR89xQ+9pR4Ag3Tes3BqsKltaRjoNH2HVEbvdHgzHSmDxMr27029G0Mk4dsfsCZWK3L3FRMW/uShzuy9JBUYpZcKTvZ4MD9wdSUxqpUVv9cltVu9fvK830SOMratwu3WEN0idXuYb0Os30iDVJ6pVrVTgnS7LYUJG29aJ4YOoqmhpUuYES6fK7e8c6mYYK2vtuv3dYlvb1cq9gfCGel0wmqK0Xa6vQrl7uVv2Hv1XobZbAit1wDc5P/gsZ7xSIyTkAAA==");
    reboot_native.importPy("tests.reboot.greeter_pb2_grpc", "H4sIAAAAAAAC/+1dW3OjOBp951doeh7s1HrIbO/MPnRtttaVkGy2knTK8Wz2jcIgO2xj5JHEpL1d/d9XF7ABC/BFuOlYeUj5Ih3BkY4QRx+ffwQ3MIbYozAAkyWgLxDMRo+X4HFJX1AMFhhR5KMI+Gi+CCOIwSJKZmFsg6uP4OHjGDhXt+MfrHfv3l1GIYwp8OIAEIj/YCX9yCMEElYVY0gWKA7CeAYokqCTZPpTAKdhDGWF0IfEZjhWOF8gTMEML/zs9auHY1aXWNYUozmYITSLoJ3BgLQUnC/o0l1M3gOPpGXcAFE3KyfeyEK8lMSikFBiYzhBiIJV0xBSiDMoUURUlsXEy6yMQLJuGGXujfPgjIZj58r9tzN6uv34AC5A78/2X3+x/9KTJdaf87OzXZfRREIUu67l/OfRueR1ndHo48gdOXfO8MlJEX61f+5ZT5f/dK5+u2NF0i/dK9YYL/GvJIbg/a8D8P7n97/0rBVqzI6TJAt+TozkC3DtRQRaFsXLDxZgf5JMcSQJDaOQhqy3Ug6mISZ0hRQSN0KvEItqlfjqOv38qQ+AmqozC3724YKCW9G8gzHCH+pbG+OEnUw4rSgha2cjx+Yv+uIjcea9MR/o7NTBwvM/eTMIwphQL4oYdEiAR0EKCr7kD//roLfC+BNDAZOESs2sROSjgIPJUXMuR8x5bkS5gvDFEgRwAeOAABSXMHmBEP394ouaqq92qfxjBD0CQbKYYY+1vUQJlqc2R0ESQa64JsgSIsIgQK9xHq94fgnhUpaoP1GEIvK3iyJR5YMcvzBa094Ar2EUgQlkcwpkEwaAvLc5Z1/UKthgnfgvkJ9aAKasIoaSAN5ZapGwoxmsEEZJTMM5fJbHIj4+syxLzFbgRnbUPWSzX0CeaDLpo8l/oU/P5HhiE9R9SMTZs+LIDwUnAfKTOZv9PMpHDDst/oafkJyjmDDYdMXnNoHBZj3gumEcUtftExhNB8B/8eIYRmkjaUOXiA1JnPgUYdtafTHEM7Iuxv/Syh/AUIr5Ur6381ir17w9+xJDdtxMQ2lVO4k9vHTF/34Bm//1zvOTpF2k6Fxi5fjN/jD8PWH1XDa5h14U/g/ii8aZND2ykaxqP2VVx+iJYka6qhV+ZSFspod7NSRr29dsKqxqgmHMQsJqwsCdi7O+4HPPWZFTQYseSsVbXYwKsCMQmrajjc8nSIcBV174h6aRmkfUxW4e8wgkF5vTxvUYezHxfD576ae9Atz0QLEHlmO0mvDZCwo/U138K6C3Y795EW07/OX+hG/dgm6Knc+sfOxFLVJdauIUKWcnd4fiGVty8bXWNaT+iyamFci6ZhQV9sEzy7dj/RmHrEYrtEvoExzYN5A+v6AIPlFt6+gCpLbFXx70WItAiDUwfO2F0XNIXxxhC/DbKi0sb8Ce4ODNOBhOMitFI7Ep6AnS+ozwp2mEXvXwmaF1hchm7WdHrHFVfOXFM4hRQq5DGAVED7MlUF1TbQn2e1owPFGE2dXBTzBhdzX3kBBuiOq551ZBa7v1U4Ef4x5Q3a62YT+CXtBOd6iQdfWGCvsInaFuVltfrO7mhnHQok4am9FmsDY1dAzvtfkYDum/Ci9f7jHidvx8aSenbn7aMQNWU9z5F239Q9pbWf4S2CaQunxDpi+Mf77KT8gle2//9nB7/3jn3DsPY+fqTFkvgJSt2Ui/JwkCsdwAjSBvHAY/9NbVsBcSCB4QvV1/L7bo6iqvuBH9YKhRUZN3Ew1DKoYq3GNDlposhdVrqGqmqmTVGsqUlCl8UcPUFkxJm9RQpVwc5B1KQ5GKog3P0tBUR1PqQBqSVCRlJp1hR8VOycMzJCnvWVR37IYqFVUqb8owpWKq0RIytOVpszhnXhC4ao/LpciVQfj9NLQeD9Ko/JQwdk6paea+eHEQQcx3V74UTLZeGtr5QYaV5txNd7P6puEpLVTZehpuOVAWynzMPSM4pV1Z5xQWvMpDokQbPNGz4tuejOPUQZ9A0speISy0HfKKEaE7clcIFdRBYR5QK5OqAMR2CFXGHu7Ia1U0pg6KK7BPmm1V7KUerhXIOzCtZXu5ilxd4Qj1dJbjK/XTWmrhzdOrCqrUwqoCWOusUBey2WGG0/jJFiiWyG99wBZjJrUstPKIehdcqlDMFhdeYsmzE5ubsZE6GN1AfeuDshwJqZPEFPOtU7gKftTBXQbWFdL2iKTckb5yhKMOFkuYWqfGitDJLo1IdUyWlvtSFbLeW6a6MK+W7p1qo7p25F4ZtKiDehWwVubrQiLbIb42GnJH3ptjErU4g02t6DUNtw1/bMlP3Drycbu++ir+i+QMoZ8RnqUXKfm7bqlYsV96NdGpvYHKL5YetnSVbe5FZ/i8bFao3y+1OjjbqLcRx7muvc9RWRb4UaabkGGg7MXCwxSgKc81wTNMjG65eT+8A8PHW1sZLKo/SPQfhBf05dGWw0azXY1Cj1APz8qmLxIraHLRL2k1jUB2fUYiOwo2csjFA4pL2vG9qKlIyMYeG5HwQuSKKVVH8wUb9jwriqLmqxdSd4ow604vWCoK8KQbKKGKbxgpXuBRT3yV29HBkCY4loMZfl6wYST4rgm03prIPXJaaE5eoS1FRTomGgeEuqPrR0jlAKjre2W3q3u8+Gl1RHe1gmRwsRFQtwSkymCiN1WJroQkp62eQki1EVG3RFSTLaWVtCiak5+ctrKqnlswIuuWyLbLTmT01n29qR59MWrrmtqac1HpsnAPNvGNoKofkDLC6rKw6jOPGYF1Q2Cqx+mMrjqmq+Y8c60mlDMa06mx9EFMI7JOi0yZVdBctLphtxce1zVC6pjtXpNDsp1kkYenhDxtPW0+22001S1NNWUMNRemTgkpe/rfyKibMlLnhzUi6oSIVtkhjHq6pZ6KbMC6ZKMxue9pC6icQMToqFs6qs/93FaSZ3NVOixISZkPxEirY9FKW2Qtbjeld1uJu09bfcocRkZ83RLfFnndW03g3lKa9tNWXnNOLCPDjj03smMW/+Ol6z9GUv5TUGv6tNhlhPxPb/bXgROM2RGOGV97/riFoOc8h/P9/IoRP1otP6nDRuC8jkkiSmxJ5QbcCRKKFq9e8fcjJYU7jckVjMbfIJKAx/ndoawtfT+zLDisYXePcWpILl8p2v3tmfW0YLKkqjMWl2ZPQ1NFYmc58ov0uDway2PLDMNTfjgZtrZMUVyYAXVlJs6thLQkIVnjfT9posTKauc8RuWFZIG+9Jq/RxKjEuxbZzFb4KTs5Veie6WAknC60z4VF02tpXoqrZf2GpJVlB42Ik+S2baSAomJvCu5gGoPZr8UQALyaJl/cqtRY+N+Yxu3ya86XpxNrVty6mEA5bs4o5t9dKMydA4TTpM7aeTTjSia9H51407V6Gc7/VT7zbtTupM7rd8h1emDmstS3g0y6jpMXTWXp8PlVbc7YUTWlc11FCF8z1mB+K3usYvTEye67xZ7jqTzNZquHbc14hG23PKNadlzyw+gVrfe1kdutpTU5r+iKzTtAeQGvY4tgDWcVq9wU0jtmIUKDX1jtzDX850xDbc4pj29wxzysSzE3ORjnJBv7SBudTlu4bqr9ep6AovM/wNf+HyF8KYAAA==");
    reboot_native.importPy("tests.reboot.greeter_rbt", "H4sIAAAAAAAC/+y9a3fbSJIt+l2/Ai1/EFkjs7rO656rXjz3eGxXX6+p15Jd7XWPx4uCSFBCmSI4BGmVuqb++43IB5AAMoEESEqkuL26SxKJTOQjMnJHZOSOF8FDuJheBJM4Da9n0cmLIE6T5eoiSL/Ei9E0Fh8t11N6ZJ78R0h/3D0sHrLnX0bLZbJ8OU4m0fB0up6PXy6j1Xo5T19+DWfr6PSE/r0IPiRUeBXcRPNoGa6igB8P7m+jZRTEdwt6XTQJ5uFdlAZ38c0tP7gK0ttwktzTF/TcPAiDdRotqap0EY3jaUyPpsldJEoF8TxY3UbxMlgsk1UScKMD+nkd8cdByo+EaZDMoyCZBsl6mb2U6hOvPQ9602QZRL+Hd4tZdEFvW0b/sY7SFdUVzWTbJsHVeh1PrvrBfRRcx/NJEM5mqqaUXqfroneGqyCkrlGV1/FkQq2nBp6Jtp0FIRVccc/pWxqIcB7Mo6/RkoZkNosn0YCH6/2KngqXE1374GS6TO6C0Wi6prGNRiP1BVVGwxqu4mSecg/f/fjLz5cf9FPGl2IObrlFs1lyH89vgh9/ff8hCBeLKFzSOIm28Fgtuc80SPy7evl5kMbzMX+dpNmHLAbhA49wPKeJjidB73qZfInm/SCWpfVcT+Rkxzy16V24Gt/ylMarW/mOebqiYRQzMYuvl+GSZnZworq3jK6TZDWg4UmpF9zsvJPyu1H+3YnriwG9cvxllDVoxA2i/9wtaHBIhHun3w3+++Cvp30epVcfPrz96cO7n39icQ9WDwuaUCFe1AEhV+ltsiaJuDYkV/eGBHA9/481DQdJDffI+CfktBcNbgbBlZhMqpo7pHr6av5w1R/QHJHo3IsXjEMS+GA8C9PbKC3WJd7Hy+HlJJrGc2rBXUSzM1Gidxt+NQSfXzwIfk2jYh3T9Wz28DJrrBJd1UA1krKJA9E2MVNROMnmJkwf5uM4MWZEfaIfuF7Hs1VcEEz9kX5knMxX0e+rr+HSfMr4VD84CVchD0UamQ8an+oHb5LkZhYNxFq7Xk8HkygdL+PFihZ3Xk4+NNIPjfKHXNX8libzES2SO17ZznqMp1wV0SCn4U1UU4l6IqtguRibT9Of5lcjWj6rdTqQg28uj+w7+ZXUIEYRLXnGJ9bSorB6ljtoPMV/6q8Ss3iSzcdqGY6j63D8xfg2+0w/xGrV+J7/1F8t4vGXmTlc8oOigqhoBf31LLkZ0P+N7+kv/j8tgBdicV8E8c2clN8nWeJz1m65Oo1Giw9KiimMkwF3JJlOq5qJvhypL3Ux3h9XSTIrKmv1mZyh8HqcKffrlIdqJRe3udCux6Pil7IsrYdoFd9pzZT/XVgy4qPsF3tJ/n0SzVahrWj2pbvsP3mvdRTl75Q0FheHWQEJ391itLj+LzUrpfBcbY33S97plmlDheZj1voG0d1i9SBqUTW/5Q9qqswKjMSTFvnhWbTubCw/6stCY1ghqGrUErX2yljCWXdW/5wl41CDFkZZI/FBabrUY6PC95amjxkAWdvN3zgKRMtRYbWXSomvbUXlppA6SqpvLQVvadOKlo5y6ktLMYJi9Nkqmo8f7EWNB2zFqT3LeThLCXwQDotmo7twTmp96ahMPz4qPV5b9R2By1l0z1Czodb8ydoKV2H6hZoQEmBqqtF41KNKMhYWAvot/erNn7dUvpjR/nEXzVf2urKvLUUJM32Nx05xyL62FaW1FOlpcZUvPGOtZH3tLEtf2fQDD4hDO/BXtiICtdqL8FeWIrR4xATYS+lvLQXvk+WXKdkUjvdlX1uKhmuCsdZS/I2jgPhPsoz/6ZwEfmBkPOWqaMXmCpsJDIBrKys9aavwWloC9jrkl6ViabQiKHxjea/+plRgTlbLb+lg8UA9m1dLya9H8mup7lVBc3N+QwL6gf7+SCYE//w/Rc2v6hJ7te3RrEnXZJV9F84Wt+F3ZvFrsrvUx7ZHB7qRhQ3LLDXKn3BB6HD+0LCPqyd0BemDOcj0l/7ibrwQGiFaDqZhuqI/jefor5H8cqS+LM0Hl1b7TnUEubT60lJsHdtLrGNhgk4mMVvttBs+UKmX0e8SDtJmq4yDVHgRovn6joxSsbGTwuYxuUsmaxortdsTOkoH6rU3yyiiRWxil94JG4Kvk1myPFe/ko23XI9Xr+aT92QNRZfReE1W9NfoR/neS+kU8X46XdAzkXp8GZFAFWtQH5mPvQnnpDuTdfo9O17SwvNv2dXE4vgPdi3Jz/4erT7eJrPo/apc+9+5x7ZPzNf9yLuMGILCk+bH5uOXhBdqB8X+QLGK4rfy0/fR6tXkt2i8oi8KFRa/MCuiMV/cczuLz+eflh5umE6PKfxAD/+QzG8u13P2q3wflV/OakL+9lHp/bwC4V35lVZUoJ0WZJMvo2m0JAgVGa6u4rIPF/HAcGRZFAM/cbtaLTx0RrOXoO6pDMu7HigaJDb9lywqvSh8L9FP47cFN4BrmTd9Lys5IWuYYemwZCEPJPjn73qjEXuHRiMxhR+j4D6Zn60C4fZjZ+4vD5NwvorHwhyJWAdFZOHe3wov7G30IHyh6/lEODmVzqBRGJyI59PRdUTCNMq+iiYXAW2Bn+ivz9Qs+rVHLxZ+nuBXEqXVhZCwBf19cvLrT+/ffqCnxBf83MkJiZdc6dHyQ/ILz01PvOhCfzoQuuI8yPYL9bVroAaqXN98sfGW70nZyveI7z1rk+skTgn7krYna0uVo+dn1KHvCQzzqgle/q9iu2UjpJNdvstsS1Gl6v6rIvLDfByKD8t3OZtdfLjQCl3zibslpTHK2+L5vuJAdG2LUFWlQRGfVcdEfOw5JLKKYitkeWcjKuOhmuH3LvtodGzGu/livZK7rWzMKl7xGUjRCfzzQkISuSz/Uy44KcOsHFo8HurtzLOMWnbs5iVtZu00ny7w+dJPDFHlupqKD+JUHDDQBtMTvTqXlfblKQx/YhYVn5aKnWiHuSyf/UltlH+o5olRD+M0Cj6QiSWQSl5WONxPX/NZT7LKlWCmgTSuEycvVDw4LRU985OLswt1XnUmWnumO1eujl7DohEvad8V7zujBp3lT/UdY8gzXRhCefrmOYKi9KEMIDd26+OXiX5hELNPvUcyr+dQhjNr8QZjKlf2aBQub9LRiE+gxwIlnAeV8yoGDn/86aUK8uHSNX9Sq4crEb95rAZbLUKEuBL+xVcibBXlg8e1ZX+dmKreqhfzGf/mG12dkpLCnlAwjBpAQ+HZhg2y8GzzNl14vD1isLTM2mjvhnjABfNJv8Hw26XNh1tjhWqjbM1t3YYKUGi58d9Fq5CPbJ1F8gXNhRshgNk+HwTwHHcvcwx2vHnp6SsMof7QexizWrJPeNb3eCx1g1uMZ1GOd7OHbWPzKc+orZ6s+1yX/sO685jD57vx2LxbDfuPrUiD5rUVad4EbKXab0ru5tZ1qG3rPHYqS4FWw+a3Z1jKtN6+nC2t6UrXhlX2tLbWqSizvI5Xy3D5oIN3nGXb9HnwE/0nmihPbOmVS44ZXI3CKVfw3SiNSBNOnK9ln1Ljdmppgs+uegQ2jWVktmvZOEa2LFbFES5/6z/SlXpzJ0dn+TyAiSp3u8WEdR8Xj3m2ruXCXFuf8J5ve/3Z16wc9n/2rJ1oMYPcy90gsY1M+JYr31p1Ra7FK8qfdhE+2+vsE8GvtH5jhYqWmfZFjB+W4TwNxQFSB/DYUHonOLLhnbuAlA2v3KDNHkCzvuwOMGf9C7cPP+vft4XmApR6jjXwKfAp8CnwKfAp8Ok28Wn9ruMPVR8+JFmU5GsZDeoNVGvKSjjiDE8biKsmPiCv5h1OWNrw2jJUqnlF5xZ6gVB3yS7DZ4Nx7je4MOc2xs4XZNa3rgAxXdDLXUUReHVQVfZV535htzX3Vt1b2GTtOerYyRp0vGsXa9Hxqo1b3Hpt2mvYxRq1v2kHa9X+oq21tvXatVf1CGvY/mLvtWwNN/dbwjVFt7Vya16xpQVb84au7fNZnu6CDc6bmpLNwu8u29qD09gDj65u2uCKDyedRdFC3qySyDN1ekbi+arZMeJ+vY9XpNqagkFX/drbmrPUnH1HHdsLS65m8HKLrtqRFuYc9XQ31px74mzGkKUP4k5F5WO7MncPU0cd/nEZ04fdlHix7G60ePEdO1HjxVd0bmF7RV4ouSV8VfOG7eCqmhds3DofHFVTxW7wU80LvaN5i1ci/aJ6bWV8AlqjpUc4ra3yjvG90bIU0Wqru3WTfCJ9LSWaBshSpDnq1lKofQSws7F13encNo+VZCu6kxVke5Hvyvk+jGd8v/jt7+NIgDHP1eMst6Vdyln/dnYoZ/WdWuaxllyltrMruWrfyo7kqnyjVnmsH1fxnawh18varqNXkvmi5SoqldryGirVvt0VVKq8Q6tarJ5ime2unWLdW105xao3aFGLVVMsvNM1U3yV74op8yU0LJXy4w1ApPx4s1yWS7RHa/YmujrQpkUeS6T08HbWRqnSrSyKUp1d2uCxDEqldiL/pXf4Cn6F78VL/h2ltrRVOGrfzlbhqLxDqzzWgb1Mg7awF2oUTXux1qZLXZPru7VBCyve2sa7ikUfbaFrLUpoCfIukkazaYvHFQVVixLXUbikmRCUZ626whPZogCTvLbp92p93eJxg5yxRcikpO+raZcPMYVdyHx88ru6YLkvXnf7yGx007LsZnfFEEmOqmLIWmVeGoLUDJ6rQxpV1fAdDKpi9iqOqvywxbCaBGOHNa6y5VsfWFbxxcM4+sD/+I1LH9xgcqu3PpBq8yuMpSZs9B1OXcfBjahq+NYH1cQHhZE1v/Ae3kJtBzfGZut3oF+5PSXtKtju/XWrqOEANSsX2fqAMuIsDKdIO+A7mKL0wQ0lt3r7GxRh8eIGRR/4b1Bc+vA2KGr11gfSsFIK42lyz/sOq1nX3l1Qahpdo/Fbv6WkjbqSxMoPW0itquXgxla3fB+I17oTzngZdvbrIHI85AUQ6RPyM2jstSnQL6tTXrpmHG+NzWLMKxluZ1M/CGurRgM9rkkzjvtDN1uNBVjD1ZofeKEV+9CJXV0OnEjS07xN2+oRWxrXItIENe9Q1qFnbS6Gnn7xV862qkzVxTWaaUH8FJK9gWrRykbKP6xud/vy9+ZfqiP9biJiqivbdM27rqwH+VFd8Q4X6pt74tXpzg33oW+qKdltsD15k2oKt79a39gJn+5u3GaLt7/jDfnyS5pJlmqa5ucjrt60bnu/2v9WtT1XwVNfw60ZQtOZvLU71OV37QobNd6kNe/P6luzVnqVmhHy3RnqElk0bAx1RRtUVV3RZu1aV7r9rtDcDZ8Od221x5ZQU7DTMPsp15qyrfeDxh54dHXTBnuET9TUsJNQipr3+S5f7+Q8TSkifOtpSpXgW49HMgffqjrknGjX29aDtJXO+SSx8Kxl80nzzDnhWVH7rBitOtp2eLbarwronESL1e1GdwB9X+8DLEVrCrBSfOINKmX5vfPr+g5RDhxFR/bhpl9hRmxwULaUKxG/2dMBePa/dl85eVHzL/ghugnHD8HN5S+vg/dZfs26IiIZPQ1wGgmKFR7rZTSLvobzVdBL5rOHfjBNlkGerFOkNY/vFjOV9jOY5e+kytSDnKc9DC7lIZlyhQ2Cd0L842X2hlUSjGcx1ZMO5GL+MfwSyU78fbkYqy6EnBheDMCL4JX5vqxZcv7HIefCuua0V8soSBfROJ7GY27xPLjiJ67OVS3XkUzpbqsrDXphGmQZ6oPrB5HSTzxzJZbB+EpVs5itb+J5P5gkQmDSW5H+df5APb67o8G8DlXa+DRIVpxwVTYluWYSm6uBiiKTrx3JFNj8X6kha1KiDoyBudAiG6fp+lq8rFeo87w+69jg9SwZf9HCYqoIKb3m12IiCpX3N347J/b7UeaXrWlE9SlXW6RmE1kJpWqbnv46/zJP7uc1knP2R6GmP89OeanJmasMgOfEqF6cnp6S0MrP+WO5gO5IzmklkF5N0jQWHyfBbZKWFxTXcFWYoauABEsurAHVfaL2rykpI85eNhopZ7esZSSzzFdl7FMLofhsTAhXPhg5KycF6Pwub6r6WKSyS0V7hcTP4nT1yZEnV4/sT1Tkc0U+fEr1ijuT6OFZ/7PRKuHb5XKiYXm7eMPNX1nUsrnWmIhMfLfhV1YBDA+ScSwUiEzFx/UOyu3OUQA3YBrPolGe/zBvgCO3av7o4Hsq+ib7szI+7hOrt+9fX7775cPPl3kz5K634sbnTVitSeN/anRTWaQnByIOeFX8+HU4m/E6+VTY7T9JnZlt3OI1nO33vUgL+/m88LQYVv3H58/i18+mDKu1P2wS517f4JycjFaJTkN7F61ukwknJaodCC5UGIy8ivIU6feeW9+UKSOHInx8nWTR24+kmixvfp4ayugoFNVuFJVFlo5eX1nGpLvaqrdXlIGgXxP8GE8ms+ieYPSWrZbMYKEpyw0T/T1bJlSlyzY5DyJx+VbUybbANCSLWOjMNLmL9GMit+4onKXJKEjX49vcGlqyefMi+J6Kk4kqaLjIWJnNqOZ7YbYEbIyEpIFv2F4RYZv0+usHzm+r/pYp78ci9TJb/1RfuKYxXsb/lJ/RfI2/pAMamEgVofX3Naa1R8aJeJZeTj24k4/3osHN4JxqudLmmXwkFdJ41R+csNaWjR2JhsmgA7ajyYwlUZqe6e9f/qHEnOMABvyf/9br/3mmN60s7YscjHySLduWrjId3WWPDfISpOeru4oj4Pqb88oKytxy/0qWWXXBh4vFTA2xefWkorNf5c+9mxTfQqJfV1Iu/0Ihoczvwnl4w+2zbOTmA6lMPPyj/CuvZTELx0K+R1IYbRVlzwx+0b+9Fg/n1YzJPp1Hs7rm5BNUengwei0/qDRO5soehySh9TUaDw4+8O+v+VejIiGAciUYrXMoaOMVLNqjYul08IH//of609DI0XRKamWkcmpTlbZGq0WTDt6Kp/+RPXxuaMhwkl95CtOH+Zg2gLdfI4s/Ll0vomWvP6jKdFUuh8U/i1tJJoPD7LfSA0XwkCcbr8oqP8kuQgs2UcvorF99ewabqOripmjsqbUw6NT2qh/FhpKelt5Y2knL62BY/qD4eEmEh6W/iw9X5GJY+aRYgNO2c8Qcu4FGeUL6u3Q4C++uJ+FFcfEPZpyCfVV48tz0ZhYRbgEVyF/LT5i1Z8FL6u/is3LlTeJ0ITd+q1iUF2r+uFytb7K/O4uvrnIoWqX/Kj5jaImh8XvxIbH4huK/pSlPGArwEqCiQ8tADQpPWCfgRSD8twILCJsimQYRtSGQqOcsza60pYnCCfx8dtMtFXv+dWRUSNs0aSISpH/SYzTQiah8nBAeYaxRwOSi0aoquZKvHxTgGsk8oLmjWxhUDliuXPkDHTAjfOCFwTqTKWzPfJOhF4f6TCzdM8/sqKWyJtn3WbsUIaWaHAzim1ZqIUg+a7x/XltLiaK1fW0WjsCzbtyc9TVLKrTW7SvQQZ21pMwq1VWhxWndmhJJSOvymmShdcFSmOhZ6wv45ZViO0s66xj6V6rbFv5w1i2KpFRz42nY2RbOmvN3/mlqb5KvzHhi0zWe8qnNOR9UcVoCthGny+SOLLLlehaJ88BozBUvHwbGKetUFxjllY24xCiejrISpb0wfzKRDzthrAd2Erg2r5Isk+z34D/bPX+5nkVFZJXvfPbjqJrKLk4KVb0I3k21EapaR6awHNtUm6mT88wJRDsfjW64nq1K1RgV3N/GtOGSEZ3cp2ICF4vcuKba82/ieamWSfQ1uEsmUdDjU/RZcpNKO54MTNZuqfB7RrOFaAhZ5stSedrxeJ+mJkQSBDwI0/8uTlPhXjDN8v6gUJgbWpEAbXRfVGZcDYjH2L+R45VPQa9SWb4lk+4+t34dpyPurwAVw+8J6UXV5/on5R6Z2UgqnTtvL4Z950Co1jf1cqSkZ1htTlN31IssBUvg2hDFYQc9kLme8iKG866ANSXCKriBqFypObs0jamDjsYXy/X6vPCKnzngc0zCIpZWqs7pH4KIT2vTIExlrIkONEnlApNn+/Jwlz64M6FzzBh59hC85IU7SSTopjLCxU0frWWZ4Ept9VfB/ZLUBWt+qUXu49nMqJCgx0QUoHm5iVmfFFo0CH6e69beR2ezGe0OHIKSSBccqwU+7DcqZG+gfmcqqw+LdQrXYqhjFqg2Uf85d0V6CI3awq9JzKbEavnA6kaYQNLK0JYLdWh1W62uLDPZ1yPZGzYjtAXvMCfEAQhTr1hshRqrfVAFW9XtzR05JA7yubg41j+r9QDUNsPAbLt4v44hZWhQcIergy/5x4XjUMByhNPsrS92sOqvLy/cvBnllSkcVPpchSRjpRstjONlNL2o9xRdRoUzIB1axbW+W3EsTbL0NUTzATg9PX2nXffSb02m9lXuDx7otvavxJFjiStCn5iMhQrVTrvimNwSZKVlOax2Tn0z+H/lz+peU3JsiFfVeTdy/xsN5zD7rfhQ/xH9dXKVD0/VKJ6WXSViuCQaqHGBXorxeV2m5zA0vpQtoZVsHhdSKFF4R+IyWoqqRsbNvdGXqLR1VnhAqj6xwWhkjNvo3A7Bh7zYjPby3iOKpUUAIlvPGlpeGDwPSu3rc7ibrST/exCxjOLb8kKj3o5XI7JUTHRQPMRQMmhbeyXxPD8pzupFfi3aCOAlHc+tDMQP5YZuWrXySLUeUTQt6fPC2bk4J/r113dvPn8uLvZLAb/Enp8TGNGS59My3uzOlIctuCFbj0MMzYx1UvUafjRhxHFV2sTIKJjkMJyJSRWeOzk/GcPEYiIgl9hUhe4gYELb4HRKiH++ypo2MEENH7xxOwkR9sTMDhYkGeltsqb5l8ftM+GQDKJ5uhZRq1z/Sh5kFlSyOItUcsp672ukzh7p49UynE7j8cBYXCISWayAsrt7oE4BqPSIWlSO9NUiVKe09DMWddUPhkNj5YmFm4/ITz9/eHsR8GlssJ4TAA7k4lbiKY9L0/ViIRBBQXu/CH5SiIpWSTwX6I3kYL0IhMWVCvSoTk5F/RPlZk3oi3xgZiFNdCOxn6cAk+ItHNOHN7Qf33DcRFlb0eqyyzofiORWdTwN9Kn8MHe0lu3m+deQxJlETvQ8VkBPIWcpWhx6KsRLCN9ESEnZ4tUQ+Xq9kiO2ul0m65tbUqZkB+fBrpcst6XCjCqp53zCLeFy+b3XES3FvA55WF6qhMVXnJPoTtPcTfjUhDauwqNkjvOWoGzx6p57+vdkJU7w+QxeqM7M2S5R75yUceFNEsOeVmqankrUFJz9IZ/8U4Sa69JmAEEWw12t5fTf55YP3yTBQ7JWqz64Xib3KceahtdBsqDBEmifZHfG64HWTcrIxlINB9nzmjfW5znbWNJayPWR8T07Pmjl3Agb5P8p1tkvmrrCmCrsKwKNhhKjD94/pKvoTiH2ntMbdb0aff0unC1uw+8Gyo5gzPxODqMc4l6/CoTUAhtaLfj6uanrldxuhQpRhrdUnSJAnO0zXvz5We+suAzVicWJDXD4gEkTUN6W9+VHgXQGrFO9qX6/IbCzuE3E0rP0YhmOebzTRTjvOcaBh2A4Pf1Dh6GURufP3lnpq5iEoX9qGVZ6iaztVHS811f7MG2fswdbCblnzwX0DEjsabHeiQPMNPjlgYaQFhsrTFZ0PAnvRdTaoFLNQjyrzenx8MNybfGbzSJqxtA9Rh/oZ/QDPzR4/ev7Dz//+PayNOQXromUoTvDILwPYwUECFs/XEfSDfMg/Tt2X1lZWkvC0+QvM6BlTXRZ4aCv13fVMPglXMq7gu9XS9b+BbRmeXODXZHPvr3vVkuig0VRtSzMOcg+tTciX7BSeGsdGK4V7a17zKYOTfFxP6omYbi0neM4rNZae8rbrkoLhpW7L24oNqDuRfNJr1KxuzbaOejBCxlgOEkiefmMECZf7CE8SuCd8fg4WQj323i95C149nBRU2MaRcHtarVIL7799oakdX3NUQbfyjl+OYm+fsswlSDat3yPJkq//S//47/+j4Gzwv/tGTcn5W+5no+m67k4AB+t7tm7t0p00Eo0kkEsqXt0c3OVKpIOp54OeSGTXZW/EMnh66KAS4jaPV6mH97QaOrVtcUaV3Vl/2l+rFbuzX/VQRlWP6qvpkYuM3NY63ljOmqKEb4p2EHBX3K2rPopkEjK4OKqWWf92pqKDSixddn+RTPPxgkPTn3DOqmN8SwKzQOZMk4sBpLAaIPRBqPtyYw2Z4AX1iXWJdblE65La4zkM3Gu2Ht3hM4W60DA+bKR88UuXO2cMQ1RqXDDdHfD+K59uGXglnkct4xdCT+Jm8beFLhtTLeNY8+EG+dx3TgN92+eJVIt9/LoEWtpQIBct4hcy8IGBLuXCLZZJwDJAsk+BZItK+c9QLTlJgHZupFtZW8Fwn1khGu9E/5cgK2tc8eIZy3jABi7GYy1idaWguFqeBcAaTeAtH7aAEgWSPaRkKxNLT8NgLW1BLi1gFuteyjg6pPCVU00hEAeBPIgkOfpbkUVibuey+2oQq+O8ZaUOQCwFze7LVUQpm3dmrLw4MFC7G4hNq14mIYwDR/pFlVB9T7NbapCE2AMFm5VFXdGWIGPawVayF2fCeas9uwIcWdlEIA9N8KeVaFCmM2eIE6f9Q7UCdT5OKizqnifBHlWmwH0aaJPy/4IBPo0CDTjq31m+FP364jRp3bhA3tuA3tqgQLy3DPk6V7pwJ3AnY+LO7XKfVLU6Ty6BeY0d0UgzsdFnHlqAgS7INgFwS5PFuxSSc+G9Yj1iPX4ZOvRkRwQqxKrEqvyyValPTHoM/GSWjt3hK5S2zjAX7qRv9QqWlsKF61JvgtPandPqqc2gDsV7tTHcada1fKT+FStLYFj1XSs2vdQeFcf17vqkW0eBiUMShiUj2hQllUG5A/yZ58b1nfTZD33E79f52yD3IbXs0gamgVxvHtYPAzsiXjv1sWrME+aidcbqz1+1txCrlaPNKYepqssZzdWuxiqL1T22fuIzazkjhYIDwZrjBUJgphpWjJqU6d9NtL7cqkaqW3ub2nY7nm7Zg10ZeZvZ1fTOn1Nm/ng159e/ePVux9e/esPb69oIZZqEj4QNUXcBlJ38ZgrJbuGTCz+Qr6sCAxKtawSUi1zsi4IpI2/fDtL0lTMdDKfi6wn8eqhuKu/KFXw4ec3P/euo/lt/4Ia8jVOY5WCeBKNY6GNaEapVREpJ2E00cykybzaDB7P4KqwcvpXUnjYTBOZiIOEdREP8pzHcBmVqrmPSLQIthAYYwiuBqAXDW4G51p3ntMCJgP5t0qS5BJGOg+i1bhf7Dy3cXRNA5VMp1Z3ofpu8K/yZ0nyCHTRQLPj6cLi5frIfq0vrOWn69ns5ZQQ4A0tlpvLX16LF58HqUpLHE8LqZstdd2TnX4XpySBjON68SAamImheXdiJVhICW2pRiaJjqTh1CdjnrdGmqZ5ch/cJDxrQv7im9uVnKAB++osFRFojUiYaEpyW1ZWpaSPGje/SYNZTAMgDSdLLdq44r1pPuHhoAaubgcWn5JIYW1PR607z7YD1/r3dbgkXM4Zoq8fgiuldK8GFsfo+rpG6cj1W3T2vKciPbdrinYVWmezzNlF+mCkP1slbsvXnps7nExIW6eu5NwOx1Jtsm5XGUvy7qpl6/dp9ROhCYZiuJUit3fEy4tFm0lIMhNq/9lglYiJGukvbIii2ibSsBcnjW4MbnnlKWlFBaaSZ3D0Kk4uF+O3jHPYqyYAj/0VtNzFtwPW5D2RJL15x3Cbz3lTtbrquc139q3E83VkN6N5PxuzKRyv1iK/fSRbqjPRR1rf0GYY3Z9zT1iFUHdD3h9mIWetl307cTls1mnmANH6lmZPfjMSkGvAm8SIO9Tj//Rdg6hqM5a/e5AkpNVgXUqhArDydbKy+hUmn3GvELm7FdLAt2qDkGPedvinGEZ3e8TXJ43taMxkDa+Gl1UpcIzEhVFXszKzXOTY78akFLZjwa6k1Uz6dyvW5XOxLLs5MVok+fQwaczSMGxg2MCwgWEDw+ZgDRtTncO8gXnzlOaNKYtPa+Q4W/KYpo5f/mdANkA2QDZANkC2Y4Fsjn0B6A3o7SnRm0MsnxbI+TTqcTGdLcM23NlP4c62zwXc2wfu3m5Kfoyl9tRLrTwnWHKHvuTs2Rix0p5gpdmmAgvseS0wa/6orvRz8P3B9wffH3x/8P0dgu/PthHA8wfP35N6/mxC+cR+v8YmPWrQainRIAyjJwheLcwBLKIDt4hsuZSwrB5/WVXnAUvrmSytPEkEFtbTLSw9C1hWB76sHEzY+0pakHc6azivD7HCrrN1/TXWzBU9lpZ5ct/3HY96QmKPsMZSBYhshHcT3k14N+HdPFjvZkmjw68Jv+ZT+jVL4vi0Hs26xjymL9OHZtDnToqtGkA4QDhAOEA4QLiDhXBWvQ4gByD3pBeLbUL5xDeMG5v0mKDOkfYEfv/H9/tbpwLO/wN3/rclavfhlm2qEtYUrClYU7CmYE0drDXVqONhWcGyelJG2iYBfWKy2lbN263F1TEvyDaMi0dLDAKL4lHyg5TSfEzidMFw2JXiYxWmX2z5PfjzdPCB/vtWYI68xDf5r2yhZyndZO41UjvfhyTP5kOjWZIsRhxlLybF9ro8kZx48Ug3m4Tt5/kPVPydLv2aplTkORkGvVl4dz0Jg6xmCWDzN41SqmGynlHbeMX1qylH/JrAw3Cpkoz8vJRbRyEbyRv9rExIIipgDCjxdhSs5zOa4OCsMGBinaVk5xgGzIozfrKRIj0Y45CE8rc1reponq6XUZrvEfyOgJb/Whhb0e8xQ6+sHk4mqJ+lt+hEfBJY5iFa31w/fBOUu/s3DWaz2ljY4hULjkQgNFRJpZhIkWLmSNGZUXjr5YcHRvrJorqjh4uiZEuwalhT+rngTNSrNJ8Yz3GyZBeSSME0OHHgjl5jUhY517RSpeCUTd5f00iq2FlMSFlpWLbURHHSRvPoPkjHpNpy0+Q+EjFy67RsmgnPGUs0D4wC+lcqYeCVgPNXKk/fFUvG3Xq2ihec6IewOYtcqTph4YqRIOO2R1NHdT9Iu3olnHNsYGSVCDESGYT7Yucgs6hU3228EhZjKPIIlaGKbvxZKrNeKZzA+IYkkrH3SdH8MNM6ujInqM7bFEWWYVhHHr52ZVb8pvqRK2FkVWkJPXHRNhEsD+boXjWsQy5YLm//pqJEh5VP7AU75n8UWVTZ4J9FKwfgc4J7udBKiSF7CjvoaXObf6WRGnqlzsysriy77MjHEKvN3aH/qZYX8jWxc+wXvkPfUyJKws+53khhr3p+KZ/OA1N59fv1HbyOaNkuZf7l4SjbrEj0buKx/NiVLjjTsnkGSUv2aOPbwbv89+bUpiRNYTqcnvEmGfyhKl6v48ng11/fvekJn+FQdFUsD/pc/OQn+n+eNaQerZm7fpOtpqS3J1aVmSRUqPR+jezKTaJUwPp80UwV6oFA42tSzBFvsG/d9qlUroSQWV1KP2UotXFu7411Pex+CeWmvRzU5VEVWqmyM8cS04yy+nqO+WhKh5vStsHAq1EoRNLTxqc6w+26yhwQPJuTXr+5YX12eCiLtN+UHbd2cdhEUY5j3yf1sHx0gyS0wq7xEF3LHKjR551AfXRRb/KKpOUkHtOzP3QdeTI/6bAYjcazME1HI/rtLmFoPhr9OfB6/D8I6TJCogJn7VdU7mXhhcVZr+NpTJ2T5wE19YkWBdN4FtUuPGMAOHm4BAf6LSMlh9cPOtH7yMDC7Nvs1aZjV0D6PPj02XuJqrTDamANcX5SgZXieHLidAbWwULpGBZfahxoVw06H31j2kq3Zim6fofi1b7u4ByMWOxqhtrC+0g4YFrUw1m5vne2+/x1XLEQJ+vpi/HaD/TrT/ScXeTO+k6PMIniUNt053XgVrxtuAl212B46EbELwLCX4uQk2PLEQgUCpcHIOITsRyV/eWo5Go9X8UzPk/j3TUNenxr6arUwIHQJiPhbou/RmSp6lJ9R7Vs6UWM0dS5nSjFbxFGobAVOWFr/npHPfH8ayIlbuBwpGdNKpgiQ4t5cu5Xg5i8hgMWrcZYQxviN/IV237d0bjOJXVAbgPRYngNHsdrIAYbTgM4DZ7KaeAQQIvPQOmFDVwGZg2P6jGAfQ37GvY17OtjsK8l4DwW89qxfcG6fnrrWgkijGsY17syrgvp4g7Jxi5mqoOp/Rimdn0OKVjcsLgfx+JuzmVWMrwtaS272d+WinBwj4N7OBbgWIBjAY6FBsdCAWwfi3+hfrOGm+Hp3QxFsYS3Ad6GXXkbXHnq4XiA46HO8eCdxxo+CPggHscH0Sq1eskd4SgLzwQ8E/BMwDMBzwQ8E4/smXAB82NxUnjv5vBXPL2/wimscF3AdbE718XDhyQjiVFzsI+Oi8aU3nBV7NZVYZETOCrgqHg6R4WXQFrdFJaSPk6KBhWEiwuw4mHFw4qHFb91K96GUY/Hhvfa6GDB74MFbxVU2O+w3x/Hfn/7u0SRsONhx/vY8SV5gT0Pe34/7PlGwWy060s1wL6HfQ/7HvY97Pt9t+/LGPY47fzGDRD2/r7Z+xXBhd0Pu39ndj+J6w/J/OZyPefkKd9HBIVg7sPcL5v7FjGBlQ8r/8msfC95tBn3loIbXSyoqRCGPgx9GPow9GHob9vQt4HWo7HvvbY+mPV7YNZbxRTWPKz5R7LmPy7ZyoA5D3O+3pyXcgJ7Hvb8ntjzLoFsNuhlyUM7pRc6GOwAcEfAHQF3BNwRh+2OUKj7SP0Rrq0bDom9c0hoQYVHAh6JnWUnjFYfb5NZJKT38LIUkiaDK2K3+QlNAYELAi6Ip3JBNAiixfVQKLFZ3kJLTYgegLkOcx3mOsz1becvLEDSo8ljWL+9wTzfg3yGRcGEWQ6zfFdm+fdhPPtItstbsW1R3xEkAMu8ZJlXZATWOazzp7LOPYTRYqFXSuH6Puxy2OWwy2GX759dXsWkx2Kbe2xusM+f3j63CChsdNjou7bR1Q4FCx0WusNCdyJI2Oewzx/XPvcyZkrWuSoD2xy2OWxz2OawzffXNtdY9Ngsc6cegF2+P3Z5JpywymGV78oq16N/ULHsutGXClDCMN+tYf7RabrCIn92Frkcrpo59x6kkiHR3fCtr77jwDXbGzB7YfbC7IXZ+2zM3gzsPR971/zof1t4RpQTNB3dxZPJLLonUDW4Cx+uyQgkYDNdz0Vi8dHqngeT+qZBq943PFBRDY5wwZjz7QMpy3Q69/0XwUeGmffR2TIy2hioNtIXjmKLaBknk5g3kIdgFd9FBEPLwHmW3DhKi6fCQA9XcBff3K6C6yi4Xc9vzoN4EA3OnavoBSPyZXDLWiS4Xt8MnLgst871PqocGvylew+oB7qtQc9OUIn9Uz0RQ7FdshZhzVV9m1DzwX/nsUwj6sQktVZ3f0tKKviwXNdsCROhExbRfMJyo6Fjadj5s/qR/MRT8rl+IFXvhupnFyD3Inh9G42F/iaZ/xqJOicB18a9Hd/WlEzJ1JpNhOUbJOPxeqlqWdYp++qaqlX6s2je4xHtsxH+13q9TNtYtLTOLlugWhSUecfyUFsbLVY2h0gtMoNCM0Canr1fxbNZwFPLvZvSRqjMarXXZFoqOGus7YxNcbVBBOGUXTjL6OVS0jmwnZ65EPQonm2AofTY/MuweQ2YSz2er6MmkK/MFd6xetVWTOM5a0z7xKrlKmpgIejVbMziIYm+e3Xi/lMk/V7heLUWulquTwYvQkOSyo6nNeWlAyJmmVL4jjZJVvDUwLNVQEAjCGuKK3GS0jXJnRBGVWFaU34efRWisFrG9NvknPT9Kn/7mB0jBEfWq/oeGK+7jsYhbR9qx+NRFq6BhvJitN1zUWdV5wCIK3HDXdHC+moWtOIb3PoeSOTYHftiY9PDRI1qxxy3v4cFOaTHKQFOCXZ1SvAmnFNzk3X6fRzNJili93BEUDKGSxKCkwLE7j1V7F6jKFpi90plNmK/sdcFAl4Q8OKYBsc0OKbBMU3DMU0ZbR9LdGLjxo3oxKd3OFSEE34H+B125Xd4v0qWtEzG62VKDfsxSlNq/kGFKlp7gLjFx3FKWAcfrgm4Jp7KNeEpkBYHhUOPbOCmqKsRzgo4K+CsgLMCzgo4KxqcFXaIfiwuC88NHY6Lp3dcOAQV7gu4L3blvriktXrQ3gtbB+C8eBznhW3s4buA7+KpfBd+8mhxXdiVyAaei5oKwZgEMx9mPsx8mPlbNvOtUPZYrHy/rQ9G/tMb+XYxhY0PG39XNj6NerparserV/PJ4YcrNPYG1v/jWP+NEwFXAFwBT+UK6CCcFr+Ah67ZwEngWztCHRDqAB8IfCDwgcAH0uADaYb6x+IQ6QAA4B15eu+IhwDDVQJXyfZcJSeG/yIzsOeJkIFUkEcJe1y9NR8KevdyNSJNnnk6hsGp+PBU8yUVHCaS2exU/3l6UtBmwSXPxl0kYGBxBKanr1YrpoqQc/dH5cV/yq3r7I+yB+fPs+C0VFUyD870SpS8YsEkiaTVH/1ONn9eQA3NC20L6a1wrNZqKjeR3CcwGr0WujNvPk9YPgNexv8ylmZXcXGKib4InJaUamJeQNlKNUVkW7WFdWJxLtQzI/aDl/8rIxSTlb1VT504LWnRD9rdI650rFUdba3hZNLTBq6UasLYhaIs5ZORGgj9XqFwSfB0ep/MDBXPnQcE5+N5vIrJ/BOfDCsvERjE0ap+v7zHZrZ/dZGazMz5Ei1LRGs/gGy20XmXKhHzOFQ/m1f9icXa/5DIwTPfJhtQGgjX/ieJ78QfvROX56TagU+NQipLllgIi30SI69oQ1mjKJnVWoIxhdhKqg2TBHtD+aPaOsPcz1S8c8oM7TM8K66OMx+3nZcPq1Zw+jZYaF2nFgAohM0hZnr+hu6JFHtG7qgSf1afoiU2452VZGy9YIExilS+cnXOZpMVVans5T+y6b+MKuqIbaCcADLIReU8+G2drgJC73L3W2i8U4QCRZNxYzPxRfBOml/SfaEfCibrSDAFSlNNONuFmSRbeVKxwhQ045p0FTEpNYLkQTLNHuCOX/06/zJP7udXpUq01z8MxrOYwJQAVatlOE8XBA/mq9mDbMugfEbi7jyp4qz5PfWhxQ6TaEB9X2rVD8kNIcyHgCDgLSHNGUmJfJIFd/yFGzimvZyG6i78QtZleWiiMI1pWBnTTKLr9c0NuyiLz5RK/PTzh7cXOa0hqYiMWlRbzDSZ7INixs3rSNEpVs80rhbra7JtvpUD8y0NzLcZ7/G3FS/U4uFKz1jpAEKOi9CwFyXS/p8Fj2I4+8RfflZMs87S+aaplMIry5Czfy3lhrBHSE/aua8zqm87I/spEcPIQy9PdfjMgQdonkyiKx5NGu1wRk2aPIjxFqc+VQRelrURl/8tHS0eSAHPB5ISdrRY0iiPhHQI4XARd/pyrE5Pf9WiF/So1VYTT+v7fqC9NX/+rbDqqJNnauGd/fv8NPgX5/vOzga/kYbKvOrch2vqzIBk+C5cjTL6zGxF+ZISy3W2kVuxwY2oeujyChaPS8WJ24QWJ8kEz3hAa5QxOQnDfUj6Z5U4rbTxbD2Ryu5sQUND+/NAGytyN9ZAn8CBoxImS6UW8MYzD6WdcSObweMsjw+/xHNWn44aTg0NdPo3xc8cr87IcFovmBM7mi2m6xnX56gh00jnrE+EURL9vkhokmJ2I92R1hVbk3McpEg4zdU76T4YTk/XnUT4tAFT2h2stEztwlPQRQYVMrsQrAX4AZsyMivqO0ubT/FWNInGM9rJlL9R1ybFt7pY+k6O9sjYb3WdcnNO5Q4qCdRvw68uyvRxchcFUzJcqO2JkDne/TXVOsl/XgM94XKlqIV6JWh4eagyw10d7/Pnbt72vLw+7BfvE0zu8+KheZw66lAv0qMwCD7w66kvyT3zwU+ir9Es4bXgXMspS/pDQLagWM7F8eRtnT6Nl8GVZJB0+W3YAU3qTQwltXnOXVFc1WPeX4WTijmsnf7+F6YPnI/E5XtJmWV4yh67oSReo1npUU+FXLs9zm34vaenvxj7SL6QeXZLw7XZ2q4/s3kRXPLgCSRrCBlpO3OMNIh0i52a2CXJ2iwVg34fL6Uuvw8fzKqdSlP0mSGYookXgh8Gi4cJbRvxOHj1yzueglhsL45aQq0cGR5X+vM3A5KfuYRfwWRBQU+NIiwi17/DdWiCXIe5XNJcUjW5feJavevH1d8OR7dSOBbIl0VN+altobIde5qXxvbXtdtCjttHj+1X8eOiyG0iyTql8E6tnvswZWsprGhw1sbuxCXZRkr4hzqX2aZ1a2jjc/HNQOzWgOzWwOx2AO12QO0WgK0nuN0NwC0dkDR5fHxiWmiR8PgtltFq9UCCQb2ayS1rHlz+8ppBynWUR7P8TQ43C9A6jXisS/LDy4aUFE2nMVf+TirJyJ3HEqgxHLwRW5hoPy9FuaNJrFzuD0HgdSozWKRRJBWAgk4ygZE4UFotHzQG0/513qX5vSdlGCm3YinmMbtzEmpAxMhwTjMZTS4C3V6VamgW35Fk0d793V//WqpNltCVpoPgfSSXlyiTBrxFlHsUBLer1SK9+PbbjKmcwCv/cbMM73j1vLxZ0xpP5fcvZVXfnpzsZofx2VnabSh2SZ+e/iGQiDnZ/cFopCJJ/ji7CM6CfyE5WxYf0dlxKl/0g/8V/FUe+52d0eZlf+2pMBPof1qKRBoQFcdVmPd82jW4yYWEVwgppYVEnlQ2mzraGu3vtUlCt5l37b3+e25x3Bos7Q13vu47XlcNa/bOKQdPKQvblof6M4t/DdPobZb3JkzzJDhlTbQNyHu4iigbFocWyr83VVD+qaf+aY+p/de10Zh9XdQbw9eNYetmcHUzmLoBPG2ApV2VpVP0L4I/so//dKkYaxozZ9TFMrpLvkaWwAtR3JKrk8eYz5qypJzpIpz3TgpokEaPD1MJ0F5Zj2Cvcn33N+EjUQBXOxqNEKNopQIuR/SqrNRQXGk5yTtuhODUR+B0jorZIHTHO6CG/90sF+NR+WXl8z2N3elZoSLeq2gT9Wp99GeE6XjGV1yYsWDLB5HdL1rG0weZao1vTrCmDdWv4js+UBWBU0b6RC1P4Xp1W8pZLgM0ZK3yLkZRl+nI0iwgQH1wngdIypVyYo9g40hm0hOk1KNZEk5OuQ+JgALrOTVSpUXlr2jk+bKTCCAyTw1e5AEfq+BuLRd/Kh1mwisdrsLrMBXBy2R10czMIqPwMlnPJy9Xy3ihHOD0v2m8jF7SO16SuiC99jfSS9cpi5g4WOfQR0OtvgiuRtw+jlgUt+fGnBdzREXziyerkW6YiGuU6S9p6Zu94LaqUeAQAmq1jM78Ei8Mf7Z+faFr+Uy+OCluExc8+UuqMZnqY/C78AsraJ2NUJ8f8HubxjT6KgVqpcZJxFxwlANPuWjtvTm08gx+LvIm3kZ3g+C13qyE21V1Vqe8vBfLMS3NrYhhCMfy/YwaVAlr+4yjjhfBej6PxqzTlzGbupw9syebKM5KuGkJrdC7+J86nSKHs4Zm+7XkpBzXSwI4S0impvGM2tm3j/lHjjyQ4zMSyTdHakUKYzpblJwrMksoWnhlNI/D2ctk+lJtx0G4EpvlV9I+HEAiT5nE+EkPd1rMuqjypMr3pLx90xDGjAP1eKdU2iE9tpuEqlRx1Rc3oCzS+tz6kO3+W0EJGIlkM3AsjrMIDPCGLeaHnfxqov/SOPTXEZWLRmKIeOTPDDFihdLrn+n8labMK8nmUkINiJMJo6g+MhuRHI1k2lujuG662eqoUHylHCxyYZTx2QtuEh8uFt+5CJekBuMFP90j3BsTfKY6xNqrVqFzpxbfTDu2DgLLZ9uinUrKvygJ9XrNNvW26eYQFcuLjRPlC1cMp+eu2OtbKxj8Ei7TiCNO39OKIHvI0oyBftgalKe/zDvTdAu3JHUnjfdvrZfczp1BQUNrSJCxzMSBX96Ki5MWd4ilQnbeiT4/aRXu7ni8vq+ilQRKkiVp6aGJSLJPezW3M1RYZ+39I1eoZy24sR+1UZOGJpTyivy1BPxb4jTzKRwav1cfZNSTWwzJcsgpx22hof+xJoyTNjwqxEeHZktx6F+cVI8fVbLsovLwCaWuCaGuHbzt3jA/ccSGyx4PsmthqgbL8xps0R4k4I7GmdqiSq+kaSuu/Ml9hbYYdS1BcDZYTtleBPcCJ85V4mkVI0lYmXcEViinZIjPCV6Mg55YxfSGl2qLIsQqXhalJ9aIC7EtJjLGhBXbSh6lR1mN9BJaPIzI+oyck+VERIJQ2d/FLukkwtBpxTPFzShOhD/GN3PalT/J517S1KyjzydlgzAlLSAuT9Zbht9swUhUq9lmJJauxTUYfC7LzrTo1iRDn7ytUd+97vNFd5OX1mvjBUKtAa2Kb6f37ErmoxVaNl+es5v4/ZON0MX+WN0wtmFsw9iGsb0DY1vvw3/hQ62oeC34BRfWsERPgUY17PdPGU0oeKMNbS3IRi0SKogLtRzTp23BHomgPE4MgyspqVfnIljhmobn3kMaYP8/O/u/pfleDXpRG4GQdbGktYQbcJ2t0b+UbGS+1SYOK20vVEwFhJGHw+A7W0kTMJq9LDxrPjTgUxSau5gll8k0QtYdVTOqUKb6fN9yFmq3xZpj7aq4+MOr9/82evdmxDxIdbwPy56DNaluMD/99bNB3NPf+KK8YZxou/NZ+HIO0Jnj7ciA12dzZ04XX464AqF3AZ0nTwkB06Clm16N96bG6w/qHEia78607HM2Ac0852iHUvyVGZZaR3/t5SnKfV9VZVlYgfp+s2MAPS5rN174zm90f+Ifn/1cXXKb0l4bySJi7lMbO8eaNsL6nc1zN+y4I9bvf/W3AjbdHRt2SAePXU2U/7nnVVLLHDVvj+4nFOvK2/lq+bBIOLh5KoKQ5i81Xw7ZCismI9W8QWxXsU+QHQ7BDYdRiy8UsM+dgTsKDunsw2sblaHkwaocSh7GgVD2Zst65h/9k9Jq0sWLFFyFi5nMhLMOaZNdRTKs8kq962pQMAiT+TRe3mUBZNrfIBzD4iojgwDp/L2OJK+QsK8LppyajIGbSkbt3Yz1vkYjVadyQS5m4VhEbo3kvayB/FoYGyHvZ9WVaB+Ac+dzjp3Gg6Aia5yOynuVv7LmxkCSpjEzP2TcxWRsLoOJYLCZROpKIgdRGT0I3r05KV9sDGWQG1uMwoN4Li4PinC5cJYmAW3+ZJ+XXxeXeZrVBAkOK9rfqDWBtJKlL0z3kX+bzzkIL5wEN1zpYlHhR9DnBkY8HUNZ+lQGDRo9SmWjg949i05U6R1fPhjcDALhvwmultd8L/LrFXVufBsmaXCXzL9ED+KEguxgUhHB9+pqa6V/Yco8IJJfQuDgCv9GiZtB7GOFTUMUdgZrChXxXsS3vU4m0eDXn17949W7H1796w9vLeDt1BCT4OwPu7z+eaYu/67nkwHfx3pI1pa411O+kjHmhTrhORJEIUbt0rN8rqIkwgdep9rrYqmMi6ciPJXXebpiKgwxvBy1dlrLTiOCXpmRfC7kSAytuMGsvH8PQvczc/fAtPita/8vavGrtR5XyFW0h/innz/IK52Kh10WIEmgHf5xp/S9bPnZH8WG/3mWuRfNjuZ3uk8tdakF+TetXs/+sI2SqHqLk5KVtASLZgQno7t4MplF9yR1mqFpPR9lMaSre6b5XCUZoZs+Wy3Z0uI8j0oWR785qLLbZms7A3NEYtqOikrBmEUqMxvBOIm11Wxwu7LKNneVm1wZ3a4jUJelWmugelmfNmg0NP/wxZa14TKlAfA5gGzV1ccl/qzzIWx4QOkeXwX/vOyoAsWsFK06iaoVjlox6Bh40VLgSvQl2+ATk/vMZpxi1Subrua1pqCWsfSGGNPwqPh6VrAGv7EX4/GL4Cd1ZiMYO+xnDPIiVeV0xGBOUGcqV9VtdsSwK2vAlSDZsl3DEHEgghlMEqhoWz3Qtvog+FkeWqoRt1TibL6uQ1NjK262MdNODCwVvVYnewI481Py/uttkiowLf+M7mgFfY0KLlhrfQL9x3d8qi5PZ8QKFaKURnN1umYiZ+a3pZ3+gdbw3yz1pXwkJM0iQZt/xnXOONVGJAdOBAAQtraJdn419oamZn3N/hrFafaSb8YRvE6+jdOUFv63//2v//M72y5n0TXi+Dnb/fIBYe998/5X1GGl8s4zksqikL8MaHEJ68W9TVZcQUNVtPJF8C9Zq0yZ4mUlpL3e/5Qr0nAyEly6IUMovWfR2CfLSTwPyZ4dlZ45b8nd0Hd45RrWpPzhIhdrieu7XajfxaV6z4v1tZra95KnfNcv4l2CdSgrY7xXdEaxF+bMheIk3abKVFSIPBY2L+eZVXJEjaZ2UnfVbKF9wuSgkox/pE0s6xduNu1ImCQcFXHN1DfTcD1b2W4Z8nm7RXmwhMn/KLXx3X/7n//3/yWdEim1PbJTTr3Q56/i6JXvD0rmRR0foYwgjlhR0RppOLXMn8+d1rP8Tms2O/8+P+t+ObTX73wrV15n/VR3RbZ4T/Czl7/2RXCpCLFKQsjzf6PWkByEv1QLO+NXRUlBjWlZTDrKyzq7eQukC6gY5ZBxcEa/R+O1uLn7NQ6tbJNkhP+W+qxb681JvTozSlUHSjgHOnie6KDr2dEG50dm+NW+o4bsY+Egdd8X1varOJVQLempn/0LdyIT4e7pV4K6R8Km3oRn/1K8+zF49kWRDWn2myov+64qhulhkueXZrlbgMDRcucXZONQqfPFz6dkzs+8jlt1FIF4HsTzIJ4XP8E7vzXeeaksQTsP2vlDpZ2vSDBY5y2DDtb5vA6wzpc8J/vKOu+xtOu9DSCdryxikM53U9ggnd85hNwmjKzTCeCcB+f8llGtJ7LdCbq1XTUE5Two5w+Ucl5LPBjnAzDO75xxPtOvIJzvFIv0bAnn/dQQ+ObBN38sfPOZqtwB3fwiTNPDZZCvDS3pGu6xQUjKXvPHO+JP9pg+Xgo+CO1AaAdCOxDaVUO69oa2yQyO8Gbg1nxGGRNCM9GRN8mRKxTLn9/Ig9uo9mZpvw1DldQDu2Ooyhml8lG30F3LmEtnQF+Z5Lo55HFPOK69LunaeJhr8dU3m0Otg2RhLsZqPnsSZpsqeVQO5sJ47zcFMwArACsAKwArGJjBwAwGZlM4wMAMBuaDYGD2NeVBwLxt30Q7/4Snj6LRT+EQ5wr/sjiFOCIC5hrnhmqZadKDfhn0y6Bfbva8HQz98k5OVrdOvuw40gT3cnUzB/cyuJeN3oF7GdzL4F4G97I/97Jjr7WdfB049XKN6dN4JNfK7rThIjAv1zIv1zkPfE8lHcF77uHdkHi5Rp7AuwzeZfAug1nRwQ8A3mXwLoN3Wb0LvMvgXQbvslEevMtAB+BdBu+yg3f5fbR6NflNhnhtQr/sCOLdAf2y2eINWZgz3mSjSnUK/Oyol+0T3S1C4GgZmIuyd9hEzGZfnpKPuWYR9k5axVd4xGjI8IssrkT8WX2Klt4s4bvkk9F6wSJkFKl81frIErTSoJUGrXQbWmlTNYBdemvs0oUdACTTIJk+VJJplyCDa9oy9uCazusA13TJW7SvXNP+K7ze0QLK6cpaBuV0N70NyunHwpXbxJZ1qgHM02Ce3jLU9YS7u4S8tpuWIKAGAfWBElCXBB881AF4qHfOQ13WtqCj7hSi9WzpqFspJbBSg5X6WFipy4oT5NSlAByf+JsNY2I2CN/Za6pqWzDGQTBWFxYFeADBAwgeQPAAWpSALw+gnui/gHTv+Ej36khxbTtkr78N7j6vO8V7Q9dmiR/yJmA/CNK23XKxNUSK1oKex6Zk86av25i77bwLeVtOR1YgifcOzt4TrviNOcc0CvuoSGozek9lgqVX0sgdz8i6y3hrFV3tOeOEe9slu3sBIDXtrYqxJBDNWwXrmFMyyeeEO8ZBTyxpesNLtXcRlBUvi2yXqAjbiP1Sc+sw4408co+yGukltJIYqvUZUifLiaRlmsa/i+1z4GIB0NRumUZneCfCJ+V97E/yuZc0Nevos5uH38eU/GZrVuVBsvJb4/efPTl/jf5+VI5+BxzZY6p+WOqw1GGpw1IHYz+cB2DsB2M/GPsPlbG/pQsIxP3H4Cw6ev7+Zr9T1sCKKwBs/mDzB5t/892Cg2Hzf4RQlK1z+9fHgIDiv7rtg+IfFP9G70DxD4p/UPyD4t+f4r9+y7Udox0403+zkdR4zNfKULWBJRD+1xL+ezgdNjzpdI/yhrz/zdIF+n/Q/4P+HwS/5X0P9P+g/wf9f/FdoP8H/T/o/43yoP8HOgD9P+j/HfT/H/JZ3FYmAKPKA0sH0NHl9UwSBDSKQrdoBOQKeAa5Ahyy8ZRpAzKP5lYdT+DbB98++PYdyx3U+1uj3ncpVLDwg4X/UFn4PWQahPyWaQAhf14HCPlL/pt9JeTvtNjrvSDg5q8sa3Dzd1Ph4OZ/AuC5TfBZpyVA0w+a/i1jYU88/EiY2HbTEoz9YOw/UMZ+9xoAeX8A8v6dk/fX6GDw+HeKtXq2PP5dVRUo/UHpfyyU/jXqFOz+pfialuE1j0D0XxedA7b/XbD9u9YL6ARBJwg6QdAJWpQAiP9VDeDuA/F/tg47sL7VBzL55wAQke+mDLrC3f17vju+uCckf/OPE63FTs+IB04zdtmY4BzEA50isfc7MUDGW1YbFNaNyy2PNK/prTncDaRvfY87/1bNZ+Pkb2kAgp7/COn5/ZQmmPptswUrG1Y2rGxY2bu0skHaD8MfpP0g7Qdp/+G4b8DfDxfOcVH5t3Ia6Uvz9jIg+C/MMAj+QfBf7x48EIL/x41GAdc/uP7B9Q+uf2OTA9c/uP7B9Q+u//3l+m9lRTUeH7Yyam24CbT/tbT/7XwVvieodSHS7lHfMA1AK8FDRgBkBEBGAHD+lndHZARARgBkBCi+CxkBkBEAGQGM8sgIAHSAjADICODMCPDwIXmtD8dflx0C7fMBXIq2bDEVgCQPGmTEF9HdYvUgyrzl37qy/zdU+wz5/msnulvAwnNn+28QksPl97fIAtj9we4Pdv/nyO5vWezg9t8it79NmYLZH8z+h8vs3yDR4PW3TAJ4/fM6wOtf8sLsL69/66Ve78kAq39lUYPVv5sCB6v/o0PObcLOOh0BTn9w+m8ZBXsi4UdBw7ZrmGD0B6P/wTL621cA+PwD8Pk/Ap+/Q/+Czb9TnNQzZvPvoqbA5Q8u/+Ph8neoUjD5l+JiWoXFtA9V2SCQZh9Y+71jZ/aap9+2FsAfCP5A8AeCP7AajrZHLFnueA5vinPNHpXRRDTTSrWglPKLLvMnk/Igkqq9b9tvww8m9cTu+MFyPq98Fs6rdFQyvrQFiXjb8M49oRD3usps59puAdG+2QSt7TO5dlOE6hHQaTdrm12QaTcM/L7TZwP8AvwC/AL8gjwb5NkgzwZ5NsizrVEbh0Se3c0tAOrsXfs52vk6PP0djT4Ph7iDONvfUZLRZltKgDS7MLsgzQZpdp1X74BIs3d68NvVLeh94gpe7Or+D15s8GIbvQMvNnixwYsNXuwKL7b3Jms7Tjt4Jmxvs6jx3K+VjWpDRuDBbuDB9nc8+B59OqIN3cO9MQG2t7yB/hr016C/BsGlg1oB9Negvwb9tXoX6K9Bfw36a6M86K+BDkB/DfprL/rrt79LbxRosI+EBts54d3CEECH7e7LwdBhl2QCtNigxQYt9nOnxS4tetBj74geu6xcQZMNmuznQZNdI9mgy7ZMBuiy8zpAl13y2hwGXXarJV/vAQFtdmVxgza7myIHbfaTQdFtwtE6XQH6bNBnbxkdeyLkR0XJtguZoNEGjfazoNGurgTQaQeg035kOm2LPgatdqf4qyOh1W6rtkCvDXrt46TXtqhW0GyX4m86hd+Abvvg6bbLawPMg2AeBPMgmAerYW97yq9ljxfZQ/rt5mg20HDvjIa7TXjp86Lj9oRyoOU+Dlruei0Eem6AZYBlgGWAZdB0g6YbNN2g6QZNd+PFOIuRcng03e3dCKDrfiy/SDvfiKd/pNFH4hB/0Ha3d6xY6btLJUHjXZht0HiDxrvOG3igNN47O1gGnTfovEHnDTpv0HmDzht03qDz3lM6by9zqfHcsJUNa0NIoPVuQevt56A4DHpvL/kDzTdovkHzDSJPByUEaL5B8w2ab/Uu0HyD5hs030Z50HwDHYDmGzTfLppvMix/SOY3l+s56+3vo9X4dq/YvZ1FbC2/LFvKoPw2QWiF8rt28rtFLoDp292XfWb6togCCL5B8A2C72dI8G1Z6+D13h6vt02Vgs4bdN4HS+fdINBg8bbMAVi88zrA4l1yyuwti3frlV7v1wB5d2VNg7y7m/4Gefdj481tYs46FQHObnB2bxkCe8Lgx4DCtkuZoOoGVfehUnXbFwAYugMwdO+eoduhfUHM3Sli6vkSc3dRUuDjBh/30fBxOxQpaLhL8TFtwmO2FLICSu6np+S2LQ+QC4JcEOSCIBeshqXtD4WWO7BjPwi4/YLMwLu9Td7ttjGeB0+33QKyfbN19Abq7X2m3m7WP2DcBhYGFgYWBhYG0TaItkG0DaJtEG277qVZzJODINru5iUAv/aO3R7tXB+e7o9GF4hD2EGr7e030TdS3e4BkGiDRBsk2s0+vsMh0X78Y2EQaoNQG4TaINQGoTYItUGoDULt/SHU9jaUGg8BWxmtNmAEHu16Hm1/R8Te0md7SxtYs8GaDdZs8GI6KBjAmg3WbLBmq3eBNRus2WDNNsqDNRvoAKzZYM32Y83+WAp3aE+b7Qgn7k6b7Z2otR1DtiOGRDZfnSM/d5rsj47glnahCODJdvflcHiypSw8JVG2z4rsnbQK1/AI+ZDRHFmYiviz+hStw1nC1+wno/WCxcgoUvmq9VEniL9B/A3i7w2Iv6WOAPP3rpi/1eYA6m9Qfz8T6u+qRIP72zIJ4P7O6wD3d8m1dCDc3z5Lvd49A/LvyqIG+Xc3BQ7y70eHnNuEnXU6AuzfYP/eMgr2RMKPgoZtV0VB/w367+dB/52tAPB/B+D/fmz+71z/ggC8U/DXsRCAe6opMICDAfxIGcBzVQoK8FKwT6tYn/bxNxtEB4Hueyd032otgOMQHIfgOATHoUUJ+HIc6on+CwgFj49Q0Iv411awJROh1zXmfSWfK4QgeXPUHwT53KNyyjnjUGsR0GOTynnz8W3MPnfehX4up0yrY9D3CP/eEwr9jQnSNCT7qNh4Mx5TZYalV9LiHc/IwssIehUv7zmDhnvbpb57gSY1v6+K4CREzfsGq59Tss/nBELGQU8scnrDS7WREa4VL4tsl7YI6IjNUzP+MA+PPKyPshrpJbS2GLf1GV8ny4kki5rGv4u9dOAiIdA8dJl6Z6wngjPl/e9P8rmXNDXr6LN3eoJ6c/KbTSxLpCI4nFQEVv2NXAQw1GGow1CHoY5kBPAdIBkBkhEgGYHz8q/FZDnAZATe/iBkIzgqzxHSEfg7oez5CGQJJCQoXWFHQgIkJHBfUTjUhATbDlJB8gEkH0DyASQfQPIBJB9A8gEkH9jX5AN1ZlHjuV8rG9WGjJB9oE32gVrHw4ZHn+7h3m76gTp5Q/4B5B9A/gEwDJe3ROQfQP4B5B8ovgv5B5B/APkHjPLIPwB0gPwDyD/gyD/w92j18ZbkUljlm+QdcKTv6553wF3EbHIlu3W7LARN7Xp2GQgc890t6uC5Zx5oko5DTT1QEIKnTDmQ+Sm36jwCRT8o+kHRX1jkoObfGjV/UXmCkh+U/IdKye+UZFDxWwYfVPx5HaDiL3lZ9pWKv8USr/dQgIK/sphBwd9NcYOC/9Gg5TbhZZ1uAPU+qPe3jHY9Ee9OUa/tQiQo90G5f6CU+2XJB9V+AKr9nVPtV/QtKPY7xTc9W4r9dmoJ1Pqg1j8Wav2K6gSlfil+xSt8ZdOQkg3CX/aBWN8/xmWPmfWLSwFEfSDqA1EfiPqqYWN7Q0dlC7/wpiXXBE0ZWUMzc5M3a1NT8Jc/U5MHS1Pt7dd+G+otqRd2R72VU2Xlo2/h/pbxns4gwjLjt3+45Z4wfXtdKLaxUXshsW+2B8r2mZO6MW702ZNS1ymZXZBRN434frNRA9wC3ALcAtyChRos1GChBgs1WKgPloW6rdkP9uld+THa+TI8/RmNPg2HeB8967SHI0S10Gb2g2UaLNNgmW721h0My/SjnNt2dvd5H5iCbLq63YNsGmTTRu9ANg2yaZBNg2y6Qjbtv8vazskOnG3awxxqPMhrZZPaMBFYpmtZpn0cDL5nmY7wQPcwb8gu7SFfYJUGqzRYpcEb6WA0AKs0WKXBKq3eBVZpsEqDVdooD1ZpoAOwSoNV2sEqzY67j/TKbIfdK2Zp72Sl7bikvbOnPRMq6ZpJ7hZO8NzppBsE5FDZpCtyAEZpMEqDUfr5MUpXFjpYpbfGKl1VomCWBrP0oTJL10oz2KUtEwB26bwOsEuXvC37yi7dcpnXeyvAMF1Z0GCY7qa8wTD9qDBzm1CzTj+AZRos01tGvp7od+cI2HbpEUzTYJo+UKZpm/SDbToA2/TO2aateheM051in54t43R79QTWabBOHwvrtFWFgnm6FOPiHeLSPuzkwPmmveNg9phuuroGwMoHVj6w8oGVrxpatjfcU674jL2gnfaJEgP19Bapp9uFZx46/bQ3HPtmE2S2z6TTTdGlz55zuknD7IJ3umHQ95t2GiAXIBcgFyAX1NOgngb1NKinQT0dHDL1dBfzH/TTu/RntPNpePo1Gn0bDjE/egpqT4eIvm9bfhpU1IVZBRU1qKjrPHcHQ0W9w4Pcrq4/7xNU8E9X93vwT4N/2ugd+KfBPw3+afBPV/invTdZ25HZgdNPe5pCjed6rWxSGyoCBXUtBbWvk2Ffaag95QxU1KCiBhU1yCYd9AegogYVNaio1btARQ0qalBRG+VBRQ10ACpqUFE3UFFXrquCiPq5EVHXkvGAhlr9e+401EoKQEINEmqQUD9fEmolnqCg3joFtVagIKAGAfWhE1BbZBn005bhB/10Xgfop0seln2nn/Za5PX+CZBPV5YzyKe7qW6QTz8iwNwmyKzTDqCeBvX0ljGvJ+7dMfa1XXkE8TSIpw+ceDqXfdBOB6CdfjTaaUPngnS6U5TTsyed9lVNoJwG5fSxUU4b6hOE06VIFs9AFtBNHzDdtJZ/8PCBhw88fODhqwaQ7R3bVDEOY6+opt2RYCCa3gHRtE/45XOhmW4AYSCZfu4k03bdAoppAFsAWwBbAFtfYGvcdwPBNAimi3dBQDANguna0BYQTO+3yQ966d35MNr5MTx9GY3+DIeIg1zaxwlSopZWz4JYujCjIJYGsXSdr+7giKW3fmALWmnQSoNWGrTSoJUGrTRopUErvXe00o1Xk0AqbbM2H5lUut61sO+U0rUyBkJpEEqDUBqUkQ5CAxBKg1AahNLqXSCUBqE0CKWN8iCUBjoAoTQIpR2E0h+T5ZfpLLnfhEla11Exm3dNDe0kqdYtulS+jxqS6ErQEp8FSLikSEbF4idgqxcUX0O1muQv2CQ9S6WLeCk1Mq+a9Z1UwLStq0DVdL2MbO7zq1EWATIaaf6mEq+OWobVeJGs4IB2cd4Z0+pqrCtFi7JX/L6/KZd1Vbpahy60Z6feKd20t8gdKvG07gcYp8E4Dcbp58c4rdc3qKa3RjWdqUxwTINj+lA5pm1CDHJpy7iDXDqvA+TSJW/LvpJL+63ueicFWKUr6xis0t10NlilHwNLbhNP1qkF0EmDTnrL8NYT4u4K5tpuNoJHGjzSB8ojbQg9CKQDEEjvnEDa1LJgju4UzvRsmaO9lREoo0EZfSyU0abC3AFXdNOxPxv0fQu7tJM5sCls5NlSBvqf/z978kBHpMAuWAO9R32/+QOzEQNxIIgDQRwI4kCLEgBxIIgDS7F8IA4EcWDtIQaIAx+TOLAUQQfGwF0wBtaEIZsQG1SBT00VWB/irxqXm2kgBzTmEOSAIAesC684GHLAJnfg47ECdrgSBn7A6q4OfkDwAxq9Az8g+AHBDwh+wAo/YIft1nYitkumQFY62XG66856cMfuOt44tdPpLy543Eg76LTgGxkH620pL+49L4rBztxutju6IH8D+ZvthArkbyB/A/kbyN9A/gbyNxE1CfI3kL+B/A3kbyB/cyqSRyZ/exPOSW0n6/T7OJpN0o044OzRnDL5uttNoM4HLScFziKlRl+WDd12FHL6UL9UqzoCrOGN441jMlL907WIaNqcbCc/51RHunE6iufxKg5nsuSwVwweE25nOWjp6DrihmfnxeJq7qaEbM4Z73ZOPDRGYVv0bZbj4w+JHEXzbbIB/d2yvTUliD9QjreSFDwl1Vv9+uudtDpX9zibl8fuWTyB+LP6FK26WcLXUSaj9YJFxyhS+ar1URVI60BaB9K6NqR1Je0A7rqtcdeVtwJQ2IHC7lAp7GpkGUx2luEHk11eB5jsSq6jfWWya7XI6x0vILSrLGcQ2nVT3SC0e0SAuU2QWacdwGsHXrstY15P3Ltj7Gu7fwd6O9DbHSi9XVX2wXIXgOVu5yx3Fp0LsrtO4VvPluyurWoC5x04746F886iPndAfSeJ7Bx3aXRgTXZpJl2ExkUYAQJpZPjklXDslfW89ipXan8TzhKFa7Xr0WQUWumLAvSqrJSkDDjJ+2KE6HhG6GweNbNBjI93wI3zXq/j+o/ruq8+OTTCeBoCNS72hxSuwliRscOV1wNI4kASB5I4kMRZlIAvSZye6L+Ake34GNmoaQ3bYq+/DSo3r8uhe8PeZQ8lqiPxKobBHwKH126puZqjR2vxzmMzdHkTmm1M5XXehcsr56Uy9UirQO2aAO3aYbR/2TH0t785/5QGYB8VeWlG+6gMr/RKWrfjGdl0GZ+pojE9Z4hwb7t8dy+wo6ZDVXGXhJ95l2Blc0q2+JwgxzjoiYVNb3ipti1CseJlke1yFcEasVVqnhVmP5FH71FWI72E1hOjtD6j6WQ5kRQ90/h3sXMOXNfrNc1XpswZ2YmQSnlP+5N87iVNzTr67CZq9zQgv9mmLbnP/O1NEf3PnrW9Xnvvgry9GYTsMWU7jHIY5TDKYZSDuR1+AjC3g7kdzO0HzNze3vcDAvcj8RIdPY+7l8NJtdHuAACrO1jdwerefLngYFjdHy34pKvzzzvqAxTv1X0fFO+geDd6B4p3ULyD4h0U7xWKd+9N1nZotktidxLnRi72i9pz80ZCdi+jqPFcr5VtasNEDRzt7justVztxkj4HF226upOjzLbHWlu6WjTPdBFasx626pAyyiFzUvGasWlVjA6hnO0FME+sgAgC4DttBNZAJAFAFkAkAUAWQCQBUDcI0UWAGQBQBYAZAFAFgCnInnkLADvOSzwktb+Mo2/Rj/K7eswcgFYm76ljADWup9rXoAGGegWffDcswO0FUtZ0aEmDbB2ah9SB9QtVCQQQAIBJBBAAgGrjkAaga2lEbBvDkgmgGQCh5pMoFGikVLAMglIKZDXgZQCJT/UvqYU6LDU6305SCxQWdRILNBNgSOxwKNDzm3CzjodgfQCSC+wZRTsiYQfBQ3brooiyQCSDBxokgHXCkCqgQCpBnaeasCpf5FwoFOk2LNNONBNTSHtANIOHEvaAacqRfKBUmRQq8CgbQXrHHgigm4xIQeRn8C+cECICEJEECKCENGiBJClQNUA9sHaLAXd9sxjTF5QF8aEFAb+5HS+say1wAiJDIqnovZEBu0jy5HOAOkMSpZoRsjRyiT9ZvvW6T6nNuh4HeHZZzzwUfa7yHvQGdbscToE+ADgA4APAD4AJEWAWwJJEZAUAUkRHJFuh5MUoatPCakRjsr7dPQJElo4snRLa1wKSJaAZAlIltB8VeJgkiU8SbBMZ9fihlEqyKdQBQvIp4B8CkbvkE8B+RSQTwH5FCr5FDbde20ndQeeZqGFadV4pNjKzrXhKCRbqE220MZ5sa8pF1rIGxIvIPECEi+AWrm8JSLxAhIvIPFC8V1IvIDEC0i8YJRH4gWgAyReQOIFR+KFSyq6zbwLl6Ipj5F3wdbyDdMutHxX2Sv2TPIw1ItEtxiHo03DUCc5h5qFwdanp0zCkHk7t+qCQtICJC1A0gLbWkfOgq3lLLCqUqQsQMqCQ01Z0CTQyFhgmQNkLMjrQMaCkgNnXzMWtF/p9T4QJCyorGkkLOimv5Gw4LHx5jYxZ52KQL4C5CvYMgT2hMGPAYVtlziRrgDpCg40XYFjASBbQYBsBTvPVuDSvkhW0Cm66tkmK+ikpJCrALkKjiVXgUuRIlVBKZamTSjNlsJbNojI2etEBX7xNnucp8C6aEBRCIpCUBSCorAawrY3RFw14R7e3O6aoSojoGimrvKmrfIMPfNnrPJgq6q9wdtvQ0EmtcTuKMhyyrB8Eiw86jIg1RneWGZPbx0Puifk6V53o20E322A3Ddbx3QHSe9dG+b67Nm9PbTSo5J7183GfnN7AzcDNwM3AzeD2hvU3qD2BrU3qL3tUSGHQ+3d0aMAZu8du0jauUk8XSWN7hKHsB89sbe/j0U1tMaVAFpv0HqD1rvZH3gwtN5PcLC8dVJvvxNdcHpXYQI4vcHpbfQOnN7g9AanNzi9/Tm9/bZe2/HcgVN6+xtVjceIrQxcG4gCo3cto3cLp4XvSaoj7tE92hsSevtLG/i8wecNPm8wdjoIH8DnDT5v8Hmrd4HPG3ze4PM2yoPPG+gAfN7g83bweb/WB+Ov5pNW6WB9QrM/5CLyGAzfjX3ZFd23x4ufKfd3C/HpFhNxtETg3jJ1qKzgjR0ERTgowkER/vwowhsXPvjCt8YX3qxkQR4O8vBDJQ9vJd1gErdMCJjE8zrAJF5yHe0rk/iGy77eFQNa8coCB614N2UOWvEnhaXbhKZ1+gIc4+AY3zJS9kTLj46YbVdLQTgOwvEDJRz3WQ1gHw/APr5z9nEvvQwq8k6BYc+Winxz9QVecvCSHwsvuZeKBUl5KUCoc3zQLsJ1No052msO8w5BRHtMaN682sDSCJZGsDSCpdGiBHxZGvVE/wWUiMdHiVhHaOy9l/b626Bb9Lp/vTcMe77xV94E/vJegCmirssA/mOwO3a+J6Ta6xLyWgu3nhHvnmZEszHvuTINbBZ9vidpBxyR9hlDXG1UWzfWvDy6vqa35sA30Ov1t5lNobPF+c1ujc+DzLPgf4vg2SddaKt8HzUDQxvAssfpGGD1w+qH1Q+rf6dWP3IzwBGB3AzIzYDcDIfoOUKiBniPjjVrQ0d/lWq1r8sC+RyQzwH5HHx8lAeSz2GvYnC2numhQ9wL0j5UQQfSPiDtg9E7pH1A2gekfUDaB/+0Dx32Ydtp4YHngOhoojUecbaynW1YCwkhahNCdHWO+J7y1oWVu8d/wxQRHYUR+SKQLwL5IsAIXd47kS8C+SKQL6L4LuSLQL4I5IswyiNfBNAB8kUgX4SRL0L4m5yxDM4gfCOw4YJP+DYLpec3t3Ay8eODV/Sfz5bjMEctytWgjrzYH5FaLnDXN0F9zNqGsdenT/Xvyjwfnz+fl2p+xfMg6uAGfP5sROifnp5eisliriftPhRUUiKEUk9SmG0krCBvYg7blZNi+CsF22UaXP0SLe9IQ1CJN9E8ZibVmMOMSTu+0nO+DITxHKXsK1d8rEE57ULRYfvPyGAUp2abcclJ/lCgXaTyBFTQxrKTnXBS9s1deBOPZUBrwQeuJeY6ooW0lOHqHPM2yvyuI1FUfjMaWYW+6JJRmks6YcJC96v+m9wnmy8OlcbDd+6FXFUVKW1awheXqWY9lXmT8mD1MLgqZDC9qpDCT6IFbUySTT/JN03ew7XWK5TJw7JoKtz+QO0L7DkIDv8eZaeqQbqWIi058YW3piCsgzpvI+myxYM4upQzKW82qCMfjnstVNXr+4Qk7dxHqfyThi50pqfYJEOtCIbSrnjXC7KrHvTDhkT/Hq1K4sU8d3FqnZjCYI/0cyW3uiGoLaLgagerXXDW0D9xTGOYEMd2kPSN8wMzy0BZiJWtzspOeWTc427v4aeu/J8/fznvTh3KLYyYoDgshIK2rKe8H9kr+uznXOZ1m3E3WhE07adSS9OWV/YH0Ma6WCZf2aK9S5aRXVsW4j+XOueFNhfLy4GtxrtEnDiN/hy4n1GW5anD0ZP1q+eg+TL27uwcVDfvzzMnO5jcFTmaYS7Zh3RYxZlsql0IjQa7qxbuJ3lZ4ewPY6VTERpqV6krm77t5af/WRTKgE+N+1cWsn9p9UYn9hQ42fpVe/wVx5tenWs66+CqwA52JTfHKBZe77BUpQVL5ZTmAlLR9nslgl+v+oH0ll2V1k15+7bEWRD2KdNQ23VD82rvW89aN6+51KktpDwp1Cfvw9Dy9JakbUmTK35wc3bmNvpdE6A5Fs3/l6yFV6OIx2UeARq3x11+lRDKrEWVq+B110+d1mYXm1L23zBOPQw8q41ZMM3+kd/GlTaJuu3HzhTbxdzcqDLNMmXfcS29RLWhH1yZQqVffxUk17+Rks4K0241WY9lcGJ+2zB/4dT4lDNtXUf6S4e1RiXk7mQi76JBdHHiiNToZpc5bbPHs0zMURsfg3nyBJYJyf16tipZDUUhG7jvobeyB0T5oU0qfSI5ituhbPaWtj/LpiHVSztKf9WmRqJ4+dwgSwuyNBxczeOQRxNRJRWdLpfqyYuaf8FrmU7k/Wp9nQZ1T56oSMU0ykiFltEs+hqq0HrtLA/HfLQpKUwvxfAFmhk1eM8HWScv9Ad8r7zo5k+mK1aCuqpZmqhwT6Za5lfeRHPhhJ8IclNxP/9OPEfK+mQ8I3stGGUOnfV1z3b/hXo64C/1/aTCvTSJmDdd2oanVqSEHY089kwfpg/N8fGflofoc6HIB2/VL/YsvwwMLuq7d2nGj5tr0+lEoz275Jw1eTE/SoLnTCC0B02cZok9i2lZ9ZmlToBT2K/PZQYgnQLLqFxc1E05FCtePQgO2ywo+yW/gbZUwZ0ts0GtloIeYf6ghVBnANDOt9LFfR3SzqHay4j9dTGJ2yB4JxM0nitzRSej4v17ydfU9XV+eRDMccwv9UZrXgXnG3286BNSq8t4og+/mGIikpyxv3N/SBmbg2G/2P5OD58yaUpiQObTbXLPh15M/JsGV+bEXnG+FPHOlAxMsVPOZg/mlfOHUk+193OxXgryYL7IL0ks6NNUjqfJbyImlcOfW4Sm6jIDeVz47k0lOLW4EWRxpf6Lo29hJ1ezII7UK6Mo+TZkYofSENL+OCul7CzCrcxXYX7sSALLvmYWDPlntRll+VAnru/ekDxdR7QQSh6RbDCNZmSf5ddDKmn3zHI+U2TJVV24C5DfZq250mLYJ4LSusfOjLIiFa275Xscs3LS40Hp82Lt3tmS8xuljns1JajjL45lha4CGqp7vykpQzdMyuZhmP3m4PV4xTY6C5gcoZyPQ+nDNEtNJll9RNjCTaLZbTgAxqhNhIidc9SL1LTyyJ3jUDKuBPUiqdRuWdVyaqXxMklFOj+jMrk1n5TmVkdCj0pzOqC3ZJ+pAM2Sl1YR01W29/N8Zi0MUQr28saup0xF5iumEoEhavij5H2L4n1xgUZUa/sZVsnOOBkGi0dM9KIBig+O8AEPBbvACiEcjGL/2Y7iu6HqZPllOkvuN4My3zw1qvE5MsgUwCdvay3wp5lrFx/fYkra7J9GXFWDpq6zChsVrYca7Os7v2oFZUhGEwxdlF1b4sHG27qabkP8rFzALUZYiHiUFghHiszfSV38qAoX5a27pJb2uRZtMkoN3uW/tyHPV0NVvqC0Zf+JMXFi52qsVD7mrlKpaqNmdTQyDM7EI2cnplOP9hx93TRLp24KyYdE8j6c1N4G6dtiF3gTLyerqbCziIeanFQ2mpV8tFwuKBeXS9OmKEeyWrowWtWv1/Nw+SA4RWz0I6wenV9KGZMuMT95tBDF2Nh1xM8Kg055rQ/1L9VHPJGb9MjRVF647iuZiFLkcnZEJvXrLzFx2ROH4aQEqv1WUTGfflWhs4YWCRRgYwhJJiJhyPWy7ga34C2M2fwXwTCMZ9ndw5mfNWHfcj0rx5WaC0MZATl3VJmHybJQhs0LJ9+kxGsa7tyX19rQZ+E5fb+a/KqOpYfDJxpWmofcGjM3NH63xbKL20Sa30+4cK7MtXQlbzdoJshB/cKr2j5iaZjG2pfowb1KDIGri2Y1mA2FlZPLm8qaHlwNwtl9+JBq7tB4ag0QPleR2HfRXRL/0xIPbjLY0V4qK72ouxWaL9Sem7KmNCC1nS3UW13V92oxE2pdjWZRmK5Gydx15afXkHz2wno7w7x3UVNBsoxvOPCcLMKYiaQ43D5z9crP4nlDHZnja7BgA3jFpRW56/23ieCg4Ir6tTlehVePaxGG7FVpsK/cmV+nZ38Ugcifgz80fvgz6P3BpDql2vp/9s/qUvr+9POHtxd5JrJbkWyUjwevfnl7Ofr48+W/ff/Dzx+vamrQ9Ajs72SnXTYoIvtYxEea8opFTR3Cv6o5K6+jiKYhlEeVSzHc15r0tKaOtTgQqE7MoAWlYC6sZu99Sf9yDFN7LCU2WPuB1SYIo39Su9LLhsmH5cOHJLtu/Lp8otpgqFhLw3AxDBeZVniQpb+kZ1cPYh7f8m/Pw2KxikGzBVMnPcdo0VjH46ksnAbB9TRtrF2CqQNTB6YOTB2YOjB1YOrA1GkNNRpsnDoLp3Sm1NHSKdUCi+e4LZ6SOLS1fOzSBAvIeSJ/+JZQqWuwiGARwSKCRQSLCBYRLCJYRDu2iEhl/5DMby7Xc753+320Gt/6G0KWwrB/js7+sUiBh9njlp2jtHYsw3HgRo6lR7BtYNvAtoFtA9sGtg1sG9g227ZtyjdtotXH22QWvS/e0Wu6cWOWgjnjffMmWj6TOzfm/HvcvbGIy1HewTHHYT/v4tjyOttv4Zh9gdECowVGC4wWGC0wWmC0wGhpjzFanchw4lVmrsrSF3kbLpWSMF6O7SymIgLN9otLao7RhqmMxWEfwVS6A1MGpgxMGZgyMGVgysCUgSmz29gyDT8qrNWedowqByvmWK0YJQD+NkxRYo7ZgnEi/UO0X1RnYL3AeoH1AusF1gusF1gvsF62Hj1WNmCYI/uSU3yk8dfoR5krx9uKsRWGKeMTTWYfuedE62zrYbOVUyNRx2jq2IZj7+LO6mTZ0wqyVQFTCKYQTCGYQjCFYArBFIIptCX80WwgFRJIycxAO08ghVRPm6V6Qloma1qmohn0mjMf+lv38vGKPb9Dm3mf3QX19rweq7IF7zBzC0Pra9ha0LYl32IN8i6j7i3m2G6JzwvYfHP3Q7FyhebP5CCXdvkMy1dNXg8Y3wDhveC71QCWba2YvM0o3NONseV06tueMv5nn68WzhJZfhfuEafd5+UfKeoGT4+IQyC62ZIsNsPS35ZxMgGi+XgROpZsK9MGkqlWHaMlbbBh1SzrWuHjO3nOA4lI6CFvh89xJEXslLXQQ3dtUW9tW2epxIXnJ10uEleT+fmmObSCA4vh5VJrTo/v5hn/Wmb7a9BhPgjYvrS3tqwbl/R76trkt4jsjq/+uNosBHTtoz+KI+aJsS3DDKS9G6RtDvVh4G2zxceNumvmrsWGZtayfwjcpj88cXitoACNHxIaRyrAjnH2B47T7en6OuF2j5R1XZP9PRKubxVQtmGOu2cA8JFNB0rDkvFmC8qjNtvLpnlzDlSZ+KSJeQ5K5WgJ6Y9LhdhI47tpjkbm9I6M84ejJ3yZ1p+fepARKF31gywNN2MX/eOX1qEwwvAw7sbDaB3zw3A1Wpt+3D5Hn9nsvj3K6p7MC7mT1CIOqYED8oDDAY6Iub0ltfqhBwYU2NW7BQi4mcbbcrLvRcBAWR93pCR/Buj+GLlPj8rsr/KTdtIADTydXZhND8ba9yP1fEbK4Fjow45SEWiKr43UgHUFtKcGOzgVUMeLdZAKoKQB3oTzm2iZrNPv42g2Sb01QKkcHHxbdPDZxxauvd249kqjfRhOvVKjj9udVz+DLTa7UkUH7sJrkhE47w7Xefd+lSyjzrxZ1tLYwr2uAtiHzvdOQM3AY3/f0eUA25gfyC0BW9OP/LqAx2y2uTdgq24PLxDUaR3fmwRewgRQcLig4Hi5NLdBdnng3j4r32Unl18z6WNHssynPgn0J2rajCTyMP2CJd4pxVC0EfPUN4dAQgXmKTBPgXlq68xTZYOkoSfrdTwZ/Prruzefd8JdBasZ5FUgrwJ5FWxbkFeBvArkVSCvAnkVyKt2CdM3oL8CWAf/FfivwH8F/qtnDOgNv2UnIOAoD0ywx5igfs4AD3Z1ed0+7Adyfd3e+CO/wO41o624oawVPiso4StJQBWHjCpAqglSzU148UCqCVLNDsoCpJoHpzRAqvkoygSkmgFINUGqCVJNkGqCVPPp9c/unJtboOWEaxO8nODlBC/nplIDF+YBRzqClxO8nODlBC8neDnBywleTvBygpcTvJzg5QQvp5cGAC/nPvsIN2P2hHcQ1J6g9uzmCwS1J/x/oPYECtic2nN3Nya3QA4KiAB2ULCDgh0U7KDAFWAHBTuoVoxgBwU76PaOJ7LY7lfzyWbmSmNNMF28SBibh/Hx+Bk9pxQmza6oG5sm4EBYHZu6ceSEjy1nuQ0XZFPVe0gT6asAfRkkWwsfTKNDMo1KbOcfwvRLuhHV+f7ym38DqvNjojrfBlHqMWNs/cLr1ejrd+FscRt+N1ixehD7DCuKd5NHQNGNVKZAypsjZRsJ7Z6iYTsT7FEhXttstQmdr9IG7wNyraEEbikMQKB7i0AN6Fn+aposgx6PefA1nK2jfhCbSHWwWobxjN400pPZ618wHOCXXQTxzZxsk093cTo+D8LVavmSIEA8jyafK+8R0z4N6E3BcGhZoFoff3j1/t9G796MeJe6sNZiQGqfzbLnrKS44wy3rINabT4D0gGEB3oN9XDfxCY+LG/oPTl7g+sHap+7EotxEsYkxoW+D6jvA7XwB+8f0lV0VwkEt2lbcxai5TJZyml4N5fY1tW5O2nRCp5AIWuZBglIsFL+gIWU+x6k49tosp7ZnAt90Hs/f1gK2s5HDE0BqzdYvcHqDRwLHAscCxz7VDgWRPVHg27BTw9+evDTg58e/PTAx8DHwMfAx174ePcpF4CN9wAbt8x9AGS8DWTcnOVib3GxT0aJI0PFzbPZChM35i05OGID/zwkQMBAwEDAQMB7h4AfJ58QEPGeIeIWiXyAjLeNjOtTOR0EQm5Kk3TESLl+djsj5tpkXQeOnH2SbgFBA0EDQQNB7wOC3nnyPODlp8fLLfPYASZvPT+WLV3hYaTHsicHPObsWLa5bIOFG9NPHh4E9s0nCeQL5AvkC+S7f8gXeWGPAvsiOSySw7aBMkgOi+Sw7QEwksMCAQMBAwHvNwLeRb5jIN6nJzDzzUMMpLsFIrOazNL7SmhWm9T5uIjNamavBaKtyQ2+DzfjrPm+O4oHICwgLCAsIOyeQNhKXvLWCbvLedoBZfcIyromCXB2R3C2MuCHAWkrzT5uWNs0iy2gbaWqA3fUNksKEC4QLhAuEO6eIdxK0z3xrSoHdLu/6LY4RcC2O8a2argPC9mqRgPXumewA6p1gr+DxLQuGQGiBaIFogWi3RNEq7PDeUNZXQAYdv8wbGluAF53BF71OB8GatWtPW646pizFjhV17B/MQX5um/FtOsUDGBUYFRgVGDUPcGob8I5wY9knX4fR7NJ6g1VS+WAWPcPsdqnCMB1R8C1NNyHgV9LjT5uGFs/gy3QbKmiA/e6NskIEC0QLRAtEO2+JAVekWheRuP1Mo2/Rj/Kl/hnB7aVBrrdwzTBNRMFjLurfMG2QT+QxMG2ph95BmGP2WyBeq3V7WH6NLviaJdc2EuYAIwBjAGMAYz3BBhf0hh3xsW2woDF+weLa+YJqHhHqNg25ocBim0tP25M7DGXLSCxrbb9Q8R2ndEKEHsJEvAw8DDwMPDwnuDhLJPNq/lkM6dxY01AyvuHlH0nDbB5R7C5cQIOA0M3duO4AXXbWW6Brhur3j+o7aF0WuHu9sIHEA4QDhAOEP5kIPzkZDyjZZOd48vNZclikF5IFDUay5ySFxYJVF+lA0k9rrJPynKM6kejeB6vRiMXeG9dtRVVZyJxUb8JX5rIqiNmzteX61VSC42kalGtDj75dvBz/6S48arHqBXqt9L3Wefpiex3OQMv9LQG6SIax9N4rOBeelG2vmg/bUHGLB+v2FHmlCiha7IQSGSjVXwXZb8E/xmUv+L/TKJZ2fApmC/GJLDoCj32djqNxquLSpuolmierpfR6DZMRe3/pEp797e07+hn8lkQa2jo8SKX+bBLy8FhMchZlgbDmZysMztG1+aXOaFWG8tqZ4lpKLVQDeCwV+y2mMk33GH6hWkD+Of/oXEfzJP7Xj/4l6xkXwCIfA+vAlL14LlbUkqIQcCOrJjNTCystYGa23CxiOaTHv9hPKr2Uf70pExtzqPpT2nOP7GIDmIRiarq15A5nVhCXZfQ+2j1avIbSQJZTf5xokYhLKiDWFDmlNWvK8vkYnl1XV5kL8zTcMzi3mmlOcpj0R3EonPMXv36q59yLMXuS/HhQ5K5DJX512IhWkpjGR7IMrTMXdMidE83luB2luDb36XTbbOlWKoFS/IAl2RpDtssTfv0Y4l2XqKWHO9d0yWLwliQh7EgLVPXsA7dk43lt6Xlt5N05ViAB7AAremX61dgc9JzLEGfQ4Ud5EvFktvLQ4aavJDlwwbfbKtYYh5LbJf53LDU9nGpNeWqKi23VhnhsORaLLltJ5jBctvn5WZPoeFYbB4JarDUPJba9pjvsbj2cXE5CL9Lq8qHMh/LyWM57YqkF4trHxdXPQ1paY21IPnFUvMJBnsE9kAsu70MD/O4nFaOE2t7bRRL0GMJ7p6nCAtwHxegB/VKaf21JTvC8vNYfk9Ji4CFuZfXeVpe4S7f9NmEaAFL1rpkT05e1PwLXq1p+pbxP6NlGtQ9ePKCdttZ9DWcr4JVomkflunfgni5NL4Yz+JoTrJ1cpIhHyV55eXJn72axWFKEu+8Ba8qOcnUuJx/lum6+v49X1LO+/XmrTKjwH82NKZVCUtMcqFgQ9oFv5fUxJZ49styXudX0m5Teo5NzQL3q6FmU/erwFfflC4i52tGLv2q0g3pCfEftbQGeZFP5XVxHliE+/P5ibrN67V+ynWKkr6LxfJ6Uf5NNCYll8zryrbq+kDX6H8H29jm5YJ1bvIn9fwkNc26JJX7qaTDczOd3nnu+NJx05j/5XwJVUKk8XPpiCi+T/2wX1pt6sbN8+iGudfsU29qr2I1dSqNqGHPrleOW0v71D/fu3RNXV3l9Yz2djK31VnrRZj96qjPxazmOX0YrQRHiKynQsLybHpae31if7vbdM2n9QRHqsL9n+lNu24zpvaqtz63Rhrnl54ezaiW0VJWM5o+y35aY773uJeOOwjtp/P+mfa04KnYK8heG9HeaIEQMLrn4tLJ+nw6VglN3aeuNYdHN3VvSjWMmHuVNshn2cFStOM+ds4Va+s/d+Hz65yOp9unPjkDN5s6c/+cOlPymO9Tn5piAJu6NtHlR9Nn1zfr6cBe+aO8Ts0b3W1cCzVVVTO6e64dtR0d7VMvvYKTmjrJPOT7PZlb6WbjKd5eHbW0jnRpPE7KvDThfDI6gBW8/SF4Efz084e3F8FakEtfja6CxTKaxr8Lnumr0SSahuvZ6ipIE+ZnZ8J3jlRIZrN4EhmViCwK4fxBxbQEHNOSBlTnOApCVWU0EfXHKdd9HU8m0Ty4fjAqSdZLmTtgHCxm65t4ng6yb3VLLjYd6aZ4iXPbtMpgg5EONtCiMaikQPjsd7AbzggAjeJpMf6FPh1+8igdp6NwsRjFikz8sxH0UmGzjqfq0LTA10/irg6FzY+LHPOSDf0fzKX+lhnMq7E609PX4ZwLSxrqh+A6ISnQxMTiJWdj/UfW/mBJc5KeFqN4yrE6sm1D3XaSRVmr2S8xeZVu/b386ZZ6JZliZadu1O+t+iSbO1TNph6JGs0OFQ55Kh0zj1d20L8CcaDsZqE9bbtb7Myw1DnqvvlCcxScx16VEXGcPe1gcFwEi3KcnC1uO2burg9rhoXG0tG+4rDaT54so2o5/tnJmNrY8vSI2hvbfkAdnR66x0MMp6VptYNZPuVpGNXSUcvOR7dMfOYY5XIvNh7uyrAMPYauMgGl1hcmwn4cUx1+y5nILkbdxm6lBtve0tZD7Ojw0DkUPJyWZtWPojwFaRrGj5WndjOOiqTINZD3+usNR1J1eugej+pYyqYVYEnxRKIKUMxjgV0AlQLbjAIsxTa1hi6lLg0rnWQ4Y77XHBCLq78yKBV/+w4GpsoNIgfH0r62A2Tr4tDacRqoSjvsg6V8686helX9fssDpVkdysMUZp93HCTdtaGlu8YAqfebw6Md2pVR+Wj5YkvDkd3Dl+Nwn//ZqvtZ04d5L6izunazl2V3cKW3JZ/sDjpdvh8t+15uWNsxqHRsWO0rjUnp5QUbye6kqVpLNu/ILswm61UdZT/Z29raknJ0eegcDLaubO0yB9Lu4ayMo83NuINhtF5LlKNob2jbQXR0d+gaBxpCW5sKfhUf72HV7dLkwtuFR6bxbply1vj0qLUvx2uYhp7DyZ6gpt6UGqBdh/QO/Wv5OmbWI4/LFMatvQtagct2We8uRbrDSta7+uCV8h2Vz5b7oPVFSxdksm598+U+XN6ktVc1fa6lFByOxghxgsu6bLbq/sRZSdDlLTyZe1NMYjmRXWnIh+PygJavSRaHZxymq57f/bZzXUXpLmQu5tGsZZ+lK7Gpy6WkY949FqLUqr/a8y2L9rcziIWbGNsfw4Ibrmko7SlxDm1EbfH12x9Yl6uzaYwbMxBhuO3DbfOCNg92bY6ZPR3qhiu7Ox/dshe03Sg704hgtPVo27yfjYNcmwji0JRGXez9zgdcuUlbjniZ+x/irGFawZHaCNfsdO4HB9tsQevbH9uqL7ZpfGu4vCGxpVHVjlvfMXWmtD/6Ec18v01DWSXjxRiqMSy7kpuG0knEemi61BE5vQNj2OrTa7SK63nHDs5eq4uH3P6YWz3WTUNez7p4aCNeF4K8/QFvdmI3OhH9SfcObSq8A4M95iWNrAOpHcPXq9HX78LZ4jb8bhDxMUQqWvBLtLyLU/YFv4nmMYEJxar2Ivg+WXr5gAdljsSSz9fpkd/A716lU6zy+WzFLV6Qxl4hypWGp3hQ0R9Ev9P0lc2IWlmUcliM7TaFqULv5z890l1dnp2Se3oXk6MORRyR8dXUWBXun53NXBbDu62JS6tR/1uYuYIDtzyBPnnin2QenTwyO5vOSjztfk+ry0U/qKRBbnDJ78Fk+/AH7Wzea2Oq910GbOcGg01y0T/R/DeRDe1w9t0R4P8/e+/W3TiOpQu++1ewHA+2upSsy8w6D+7R6XLGJSumMzNibGfF6RMrFk1LkM0KmtKQVDhV2fnfDzYA3gEQEkmJpHauKtshkbjtC7A/fNgYkvDL2xp2G7eh90AZdPmIDqcUMnp6z7VDtg1jN7h/+zi6UJfFqDsVUBPpByV4sR1kN7n6uQ+ilyQ8OqDsM+Z/v4Vf3K2y97ls+DhRmzJLUnfRW/XwQr9lW90ts/e96fYoMtZnU+pMzorzF8OQdbKHZ+93wepR5SzLvXQAKeeOkPRbxumuor3jlZ5Hkao0YVNn4syfjem3FMv7mvZ+F0oeRaa6pE6diVZ21KfnAKp0n8lucp3hcSDV2lwx3WGr6oMc/Za9dIPXbnCN3lEkX5smqjPBqw9W9Vvu9fvMdluXuR1FI3bLIdXd5qfpca8jaUvN5V83bCys2+Qyr7obwL53I2Kxq5AIy3/FrgEj4XeRtyCW97z2yTMJaAvpuNF5cZmUn14WZtMy3iuuCyvcsAQVJa26rAouKzB5SCSLygRocOFR9rCwqp9XC/Ldgzv/SpffaRWWG8fu/Mlyrf/31noIvQUI9AG2WOg3VrgJ4Eo32/pEqBXRPoR0IGJRHo3U4idiPaSjBgnInrfrreXOIZSL2G82mHAhIK0iqRWOT8LFfQtqoKKwe8nQ3FuXxH60LS/g5Yu8ZcnqM5pwI3f+GaVDBhf4kZAE88pBvetgy92Lkz3spA8Jnfzmhsy5wN//cMPP+gN7+bZ+yWUVkxeWGcPFx3D1jepUMkCgKfnB4eNKzYx2JOY+zFsl5mNbF1lBVCwBocMYP7lM3x6I5T74BP5crGhBvhcQi6FjETs9Cv4+op8zjc6V46aDmrvBUFhzjrAwKY0gIwVFjkO7niVwU97RyN9R39AonHtyUeOXpK70+kdWHaut0T2Q1XIdkzv6+FtLzyfUz0Xz0FtTf6h/9c3b29c37z/efbiRXAkGPjOXBC7arKkzmNjp95NK/j8u6pX1tPIXzPpWTFGevcXCJy9gm9QAX6jmuEEm/nwCQK4ItGYCicOoy2afXNq2PbmYZHn8XuXe+Z7M3Q018Asnq+YiOf5M1cn3t9Y69L4BRhc/0c8XK1rFM3GDXCG0AOppnt0tNGu9iiLvgb6WhhrwYvAYTa2HTcwLYeVbz3S+yZXie18Jfe2Rzj3MQrbUJDZ0JJ7cb1TtfdDtrbWiDjtkeQtzb4oMd7kuXE4u7NIR5OzL2jO+wlJ/St9IcjZmYq7WWL++cNdr35uz+cXxFldKLb/Onnu/yF8mBbOV9s1b9kjhJWYFz25AZ/JQ9mLhAWFhP/F/ZaWsfXfOJkeHz3iygtJn7I/JX6/Zw7kF1pMbBMTXNSdJqBg5pYdt5zX/oNI4dpeoM6ezHNGXmHuQXUYbvYY/cwWtvpLAoQPo0dg4rLuPt7wSK74d2Xfw73+If+bOexN2Ba7zzfW9hVvIuS9bb/ILc/+RPlxMj7tN3xWziP32WzribNmoVOkrpXnkLmSsvFW6uVd8PyuqfFXXZ8V/TiulML2epX/JrvIVejAr/Kv4YFlNZ+UPio+XNGxW+nfx4ZzyzHJ/lx4q6MCs+M/ioxU1mFU+KS+Uqbxn7Gd+kVxa35eFmXmsLFLgU1MuqDDUcHmskV1DbZ4O9kslLil61+LA7dtevUVqmuBAdtdNnoJAbeIddSEEYpK0lXQtauD1HwgVQ8gbo/QptBbJld1JuOjc0sI/EffrTbr6LQet0kVT6kXEKtV+JPFl7qZlnkAlyX6oSnZyw4MERbqTi5+AcRw8ltexFl0ee2yxei8+uf/33JI0W5pSh7NdbUTyY7Y64MEGbCes6IKBR2H/cVHiSpelpx6rYptfWXcf3ny4fIrjdXT1pz890lo2D/Z89fwnPnDfLci3Pz2vgtWfaL9oRPqn/+uvf/0fkyvLXSxgDbdehTGLHed0aQQtXtGVSph3d7mEyRnaEaxeeN9c/8XdRuDStryLIhrIFcBX+3yBEfFQQYhP52GrtGPuKOlX6a3b6R3odtnF0sB2yaqCpZy18BbBRZbAxhU6zM0SVqCw1Itiz/ctQqOOzTqVHuvId8mUW3ivXCFfDLrxRQShJw1YFhCRQhHscvsVbw8Mc7HfeXua5f8xNZmbhOJwFeOTa3RZuyoSD+aW8/Lbf6uOoOQMcljRbkmwQxKtqW6RulVJTZbsavLxdG5Tlux7USxxsfwKd1hH8dH5Ii+bOiF/RdWULJzNmgolrqko3qx9Av5wqnrsYUuH7ssXSX2Tq5p88HyVDABQGLN/XHJEyvpcJ40vOY8jDefyAFcqrVnyx5SPMV85TCWDMqt+tOfhDa7a/KNEwfukv7Upf8SIoYburKG7Fp1p52dDqRzHDJoctuDmkP9iUEZRJOSjafTJNGSyOZaBnLXCUOXGIn2ij1ZTd44e7eSQdlIjjf5bhpxMxG2i9B1aA1rDEK2hBc6VWFDJnhjWykrOu8AlVq+WWDohHW9GYV1k2698cfTa9X3AOmnLeJLjKnsDGAIX6ncuptZ8xSDTIJ7dhRtSAKpk710W6/jILm1b+Z/VdXzJyT9jTjkOYGz1Zmloh5my5RDsPJPCVjewqJ62befHIKFA88vTz/ZyLQkoqDSJ5Cy6oGrM0jfOJCMHezGSGo14ZElvyvfpFHB/0dV8Defn50BBKzBI+AkaASZnVA+bPqvOxlJF8lnfOT59OcntDdi8ZAe2AfzLSeU9yFYiKS4tcg1berQ7DKqWluyvVmtJwWnhaTFJ1yQPFz+Z2Ew4op6JTHqcG1GjMN6CzturmATzreMC/6qUbtyUNlgSd7EAfrztythYPu9mVV9KE46zYjNFlKNH5ZsMgDufSyL5plLugcuJduoGNy+rI2V4Mc8o3UDMHnF+ob5avr+Vf+jn27d30/acD7WdjyRcrsJnyw2s8zzV6lxiasWJ6B46PmPXbK7ErHzFOXKrZy+m08nUuudCv7+IhFkW93bgAgE3uYNnE5GFdbkUG07A8ANqEKvkEib4Ca1pWRz4JxKKSwzo13a5ZxUhOTGd/+qGmM6bK/8bYQoAw+bwhvPJvGKPvH9TVrwqz5GpUyp6kIpN7uBSFO6kWmTJm0icRc70p2lvc8bFuz7jw6vavORTm/M+qT/2t1dFXVJPb3KPJTHD/Mwn9TLVx4Wv0+xWV995yt1xL9Wgv69eSppwJZe3dAKWP+kKUiz7rXjmiV34Q38WR1Y3kbczmZtM6E0ndXmaNUfepeoIT6XPJMaUswt5YULuMwntKnvVvv7x0/V/3cqrmvBbV1M56Z0QL4mb8U6NZPoxy+nMVNuftEGKRmuHbSpZnBQ++hsI15tzvrNCJx2VUu5kx7mxkXLjckJ6n/09VTm6/dc4hzADk6Az9difzXtSjjMFdSYRRYE7J+XR7MKnSYkx4vRBruwXcfs3p4YsZHSahrQahb5KvCWTZ10sKB8FLg7l8CX3LslHsOjpqiXYReqGrfaDhfk7K6rAGzcdHKoNeVPiQdSVrgdihN6Fq2cWuV/yLvGxldRQYsk35shXKnhl/RIRZnq5nlhiGGG9+ex+pUunTUjEaQSqUpJCQnY+CuT4QEDzYLFIV6/LFdy2nnCE2I1VdnXJCBfYV7w6XRIpJrLikMxK/55qXgrJUsKKkr8BB2vilO7linypQMW/zx+TuFe9fc9fuKdrfnHGif5J4rnF9D09TmQrJuusBgnFK/mPV6F7YMPDiRljMU4VmslPYmmrcRdu7GoeySnPzNPNKHxwPgT+Nj33sAb/dC8yCDBB3jOqXdL4SD5G+RcULZtQp1OI5b+SrdY5lZ6t9Usp3yq5nJWbs24p48aOT9wodlYVjmL+P/U3GZvxig0TLcwD8h552Dw+gq56wdzfLJhR1xSyCj36huvzZZJ1SUt7JAEEXMDKY595QU0ZnK0XMebefRn0ubde/rSy3LoyknAuiGJYCNCS/rmJ4pqX7kvCure1LyyTYF64KlrJxW8V//r7hXX5G41zLkuFT36fnE9rGsRP87zAhB2IAy/87Nb9x7c3zqcPN//57scPn+5rSnkQJ3PcYGutwaUmowkukk5VQVRTQPRUPT7zQOBsjQs0zjn4n9WyrhVb7sJDsZKoSlY/2joLyI+GspDJtHb2Vj4AfVZ/y8PznbaVNEsA3dxe9A4TVRiqABnkMX7jFfnhkceu0UcF9HE8FDI7aELmXx3eDvqaT4uBLR51hLQXZCm84S7Yo3QBx1fY9QikqvIEk2SV6pDIDtFHPQJZRSEVKIrCImudj6ha+l0eIjxT+SXoLpzNFcMjb0GqVbPsz1rsIYcwoL/pzN8I+dW7HQNv0YGb2AT58IqhrDsBcDqciZZ22QtQsdTJo2OGZwarCJUPSk8FBo8OESybvdHd2rjsgL6N/93IwVUVelb8p6b09coL0owldvaRzNSNQdy/6Q4h56CqZ3f7QCDJqbPcBDwDevwC0X68SuRNEmlrfbiRdlSfkbmXIWPMOMO0MsNU7Un1VGYvdYJ/nT7ZwWxmgvsXNmY/66Ugw/txb6HDvYUEV9wh5QIf/R/C9fwn8XIxR0dpPHPiz2N58qEsPm8nrat/Md8X2hpZIdLW5WtQl54r+VIyiE8MzpL7GPGd/Xf+W64ZpQPFyaSoS92wP6rOQSWoR26L7Dv7Nfvr/RvNGm3/RiuQpcR75ovLfaZFsgEiuM8eTlAyBmOrtgcKeNo9GxiWaUvsshDFewkoDjrDMrct/hSSOaTHoaE6GKLivQxGjOYrZmU1o5A8P6vdRrOrLylfKe2YFQaBL9WVWHv90qxgLX+cJaZh03XVI/UYTvKdzIzKuwQ1LmmzoWr6yy/v33xpezur0f5eW2Za3X9iuQKCBRgXSzpWyEIW2rXbU3u9n+xeVVEz6ebVnm3ke1vJHy3sb1V3pnZtmXzjSjVrucH2Mv785y/yID6xgvdv3tLv7t7+/Pq/nP98+1/O399ev3l7w7aQYkhOlwzARD3J8cXGP1x/U7fU4Dsub1Zs5gT3ePHbri37/SIzZrrsCCHEPVfvFyhHR7OnZzCd/3FWsxV3uWu/4PbJ6v6SZr9D0TXmZ6RciE1EkoWnBmnhjZzVrhrsZbh6LjnQVFfUrW6ZuTDViQq8zEXBpC5qt4+4depW7DwI0WEizEx5hcl7apV6ZbFoCFTyJduZY9t0a045ZhkfqXomfu8P6rI0tUBOzxUvyHkgS0jumtIYLnLXrkGOv8vJRbLhqCnRW4rVPn0FzAdchmvlikrIESyfLO3dxTddcUnX870mheLiJ55vZrGCfDR8O3V1pt0zXVEVK7Zp7YaxN/fW8Pal++h6wQTKhJ1lgyIFIldqGaNt82NE6v3PbM530tVanRcxZzbxIJ4OnCOpR19JBpQk2qp9fLKrRyo73Fz/jZxujojhkxzhOyvHTkZ/Yv1hZv1ZW1LyaOZ5yklyXkIaLxBxie73cHyOTW2XE6Ny7Y8unZNgt/c2Dqlx6dtbVyTDdHZDRLKOrb35V5/Y/spdROn5OvsbdEYjKiGuDBViuWRBTF4EVAwXCCoCqNVv0mXPc0QkB1RNJle1OsmXFTADGKwqstUFOyS4EIPHEkdBHy5+S04ZspTVjsguS1cTMI9ZF2J+sM4NaxGaS4snv67JHJgxoh7tkIBnc+PqcPx+8e/c5wOSApkHH2mBZm05B2d0AYVd8CgRiuCNstwl3JRFCwYvz+NC6g55nf9RX3yNlghnyItTP8rxafW6pOTJynPRmbnf0lNxpJXz5I0LL1q7MVX5UF+EAbmssAjI9aXOv+00Ri+lK+LaGJ7iEBWIr7u8uPfY5glsb1gKOLEmErMyLF+A/fTVCxgXLMknyWcSWHyUUiCrK+HDEvFsfS/gZYBsyAhNINR7K6EpLGl5dm2BaWbLGpVIAftMK2a5v/UvMn0qcYemxWSo4mY8A9f6CtLke65P28zWMpynmOWThpzRMGXHiS+yTTSAF7hIWY/FxtpplXcrMTUa+bcFzH3PXuBFdN2mifl3cFzJrknW1N1IWurJOuV6CgvlZ85zdRmUJNpyt+Ityb08tXZuVi9m8r1ncz7X3uw3lVP7Pd+hlranc/O6zxfegs3aaYpNQILmqzCEOZxP7f9hVpyJ4lOvvMvWSjlxBVXxBC+E7+orFGt3eDi/4J9aZjpwfsuZqyJXKiew8tIYp0xcC0o/S7H2+/M2PASPXhOYYnmenFf6Deq2c9/+XsTtzo2ssnhChHGqTYMhWQP/OLP4SeQC+YYXfHFu/VFS3x+t84v6gSJ+qbHGYNluTaXFzqCdJRQMqjOQlXT9IRgV4HicSjptYAyGWzMV9FePkBGc/5oavZIH8tKM4qbLsNKIzXJ/m71cZXfMqh+ZFaW9x0f5Uo5No9jr39MoBZAFABA7IJJLiCxuyDBe/03FgoeXJiImzlDVYEB5eImtRyPaw8UGjjUxV/kHU38IWEa68cJenQBS/+f6MRDyk2Kn8lTFZmrOFyvmM/Mr6yM7o8PXzN4yt5R8ciMYVLF6/INxkaWTM5z7UFxX/qGthWWTBWY9GFb1o7pdTMPdaBXoNNsRyjJuNQOLZkU8abF5XkfJ8qut3hiYvgBDJREPJGxf+1SMl8I0jNbrUvACaHSFZBD83H99BgTBNymthotnQAoIXiGDkV1I+qA+6D2rY3RylqqCnyqn0cqP4ExVSSqSEcpO/ZzaEL2/e3tzfff+w8/TmkQe15KTv+fn538nPhzh4g8BcLFmN4SxwxQkBsSO7YCxr/jpjHuO7LGZqnJfnhfm8At+ThJezMK+e3Y+/sh5RHbK7tHTzBwFPnZjhd1JaTPFVWNMdbqr4sgr02MVRx8PiDSj77bCbh2tCvbjdBU/rVZ7AEFxbr40S4rseaWr/3ab8/gUsudst+edEcmJBfdhTv9PZ253HucONuTOG/DXVNceGfkAOZ3C8Abd2nsKyvfmGl5skLsNisGWP6/i98mNsGTBAEzjoWX/3Hlk2VtNBrbZ1cT6g9A7jKt4vv1hlVzuYD66+Zd7qL3FqwSMx1p2A0GbQ36X7VU1Gn1FOU0EkSvydKSxvVulV4eLXu8hC0kpx/M7Rlnr2bjXPNndSL/9lR/ea2fES6XhyOtuJ3lH4vnT7gMuKaSHM6usmVV3c7zBL1wNs/fofyoxVw495/ZSzX8g8aenlU9Yo3dfKubf7uOSMd++XZeO+bSBzQf6nev5n7z46e2vc8ICw50Hu1ICemzpCF9zptze4yvex9EtjG4CDuw8rMmLjRyvCq7bY8yURp9U0sWKWX6jk/kglt7vYeBYauFRlw+6W4N2iNRlpfQxZJdfTWMeLequtmlTLOAVG0tFVkgPVx6yZu4gE/nr7YskDQavg0U7VlNbYl+xltqG7wLp1pe1gyzPzvh+rejaLY1lfBIDgsWR90sJmD8Rh3P/Rv3tmoTx9izZGmDjVN4ZMN0VuFRfbX7WEPp/Zd2x3KSQ1O/FDReRBdQKN/YefGItNmGas5kE7jP8g5OnWDboNAf0q+TgH89zelHU1Ytpms8gIC+0/AXPIS1eXawIow55iQQYC53qmRdQwUORsJuUtpYdF2DV08eKFQl6aNJSL4LGCjp/ZivH3sJIvlftWJS/L6vsK+tNJpZn71EkTeBU6I9uNHf911STLmDkLqKAjpQzZ/8upap6ZSXjFFgft/SrINWsaMrPBfg+q6RQyjf6dT6zA8sRS8fVZaRyKmiQMRAXIR8MLYCdQQXKHic3QyL/R5Cf6EGuHK4Yam0EdkQE5zshxQ1jtsOZ9+oNIa8sSIMRegvC2YKFQRHNt74D9WENTB7OdLKg0lAPe44fGE1VsbI3y/bl5iXlUm5mRkXtyGnItGrShzRR8ivQ4iB1ewM7zaxt3rG1mSfwbc0A290hPD0HfOSdzuR7xcZm6Wv0vgPyvo9FzTpR59uGjT4O2UY74Rqcnp/uB2ci/V67KS9/Cp33gJx3RKjeVPXt5FfQinHp0UK6DdPsmqx0eu67n6Sr5HtF69Tqo3wBnfyAnHwu+4WDDl/u8A3GaKSm2y1H8hSngF5xPTN9kDRLpz7Sx9HvD8rvb+Fai3kiRXleUgRr9jLz+sEdl6UfhuB96tNFb4jqcu0oNc9UqSqv4TQy5GmECHHifNLlfKIe5XH7gk7Ps5zg/NKrczmpThgdw9E/jZPIkCYRKkLHpzJ0RCZBZ1nURJw69p866sZ2TFbe7Ym7k58fjn1yUKEMvFBj3Ukexyli0FOELAH7ae9S1A5Rj3aouzHhbs4BnyAhtB/nmVNWmf74suIx9O9DIoqS2HkB4fGEsrj0b4MyqhrTYdtxdzkITs/R9yiXQvJ9pUlqRZE8ik5/QE5/SeXnwDUEDqnqHzr+va1aO67jsOuu0qSc7hRw9HQvZemLBtWrSfogOv9BOn+3rHno+ltw/e747Ln17E2n4u3/xhJnSBOVVNNSzf2o7axUiYSz1FIqHVAnn0Jn3k9nTtXFfqkokdKFj8hfa6zqZShW1VVKt9NbR/cmNV3yfW0mOuWD6HoHtI5eJNJzliXFO/kdUfXQ9GgntD0z7TZh5AmmW+hX4svse6OkfDWPo48fUiYGkCFVKSFE57msi5iToW6E+pSdoRMD7jQv7ek5/37l102+N0unq38aPf+APD9cC4mOvxMLrxvaMdn44TJkn2D64p5n+k6zp+6e2HuHV3FWGVJS5PQgKX3PweiiNmfybuN1QmauS9e/T/b7k7rZ9pX1KXTX3PEwL8ad0IJ8Iz7cVnARJfpOnZ9r3UdrN7hPddzLuwE6N4ElkIW1YbfQe3FkLTe+v/3u/9+4vrf06DfCfYLXy5wDcAUkYwiF0XJsqFJy9TEMmQMFzZbnMtleXvwmpGDzZ73F7xeTc8n19bT8pKDf1M1IO8Euf2Yv8KsbfheDeykr3IeBnKlLvYMR+xEesl//cnv34ae3N9VC1mzUnGhN5rQF89lduMlpS+lWaWgdLCqZalizRMcKGvOOToEf4fafS/HcRHMxdVF17lb8xUojc779tSThvdEt3hJnLu2W5M7t0o3X+2RdP52Ll9HqW7B6riO9Nvq8utTaPFcS+rLsnnlq1T9UE6m3atTTWqtW+6iCnicuinukpGOTJom+T/zWcPQXLfiLguL02m1IdGinFYNMmUzWDXLT6vHqQZ9eGi+7RyfSthNRKVKv/Yk+OfBOrqUmbbCJl6m1xV47HHUq44K76VWO3w5uUUZn0oozkalJz12JOnls4winxmx6FfFo0+I2jYBMUuEq3U1vcsSi2xmC2ymry4DcjzzFaMtuSGlOPXZHiiSqjd2SOnFq3hv1KqOoMlgySz6InumgnkmmOv12SGotau6HtIbUL/ejyc3Zstcp5ONUu51jJ6rExc8gXIxQkyH5mEKixN3AG10KRSPoRm9jfd5nliR1zO839yPboXofWZ82re4kAvqQdneeC9rS7x1oieI034mWW0u/dqRlGQSbLkVUWQNznqRH6fRwCdJP91FVkV67EFXWtsZuRGMqvXIlylx0bbmTYv45iTM5emI2dCX9diWJggzCkRSzgLXmRq5lOeR650RKmc2aupBSNrOc76hm9doDAqlNQGTuGJQxii7fF7qIxi4i1YNe+4ZSAqudYI2yApkgGZ+k6cqMvMWOLqFhFq2cRfcmvZTSlGsT2eDq4JCmX1aYXnsAue7s5AgU6ZFM/IHStnqMaerOYOcJ8/3KYaRmr5qdVNz1fVxUdMGll+pUv0n1GvXajV2v0zMjmr3eIHvscTTpgXIOp195c5T+wizJxo6vo7fpwNtIFarXzkajW43xDr159Qr00NlIU+TDNBtNPp1Az9O0qLMH7J7QoUlZ6MS6SFJQq3z9zl9gqIK7pTYw1UWjrAfm1n2MJdbZGcsVn53R5MmALsW/v3cjknxGJcJed4TfEOIXLf3mhsz7wd//cMPPaU3iMdow0IwPbKvK9T8XvM4X9vQXKldtodlQXdCB/8YyFLnzOR1HMH7WLJbliLjzJ+YTppZnE3sKfiEk1rO7Zcl5slKeN37srX3CUq6RMLLIr1Q6Ij9PQOUUkiD26VubmBf67D0+xdaT+61QjGstvOWSwMPUzUAz7i8y8YjkTrOfV4EQWjqdXAfUN9EXgjmxVkvhvkKqGwuLiyXtDSuV+x0neSW6ovXO489Uv6ZlAcJY/vY7r4fNMslLzPCnVuJXruhfYc7W0rLz5355kXZWceVx+nT6JVyZeZmUn2mct8yepv4WRqNo4rmymOU4DhsDx7mcSJ+znWdvsfDJixtm72QfVbv0OWnUl1xzy8mo0s/5TQrrEKaSeJsOJL+xknnPYi5UsIni1CobQi5HGKHCyPDnpcPCExndbAJI28UyGFU9xrnQOitpLhS1CqjmhoT6ajeI2UzF58GkMfdiejxXLJzEgLCSxWjw1kckjkW+sOKITCF5mSNbVkzGNTS8qa9X6y1MLJdpryf75ZY6wdSEXaXQqmYdU+TEKn+PaQKHlCZQkkpq7Jf65JL+9d54WrjuPpeB6wSvue8o0Vj14mt55rDS1+gbh3RhfTUh1+m4xsd+G04LF+FUEwqd4P033SZbq96LoU18JH8KfeaQrrEhVDPkKX9Ox3cqBqHfZtXco+qztZ2ecz1wUrqKVujTgkkUpCb5F7rgQbjgOJOig+6Y2qHBgAzWEtvw2uqUd6fosw+T2U+iIurEa1IF0aQnQ0c9EEe9dWKmKuLmkbksBdUp+em68Ria+bXtneWZAk/dS3efELFGXeR56mrVRpHFDb33ML03EeJEN248MEM30Bb8uzrl4gm69cNklqwqi1GqSP3T6LuH5LupCB2fytAJuRCdZTX54gl57LrhGJbpte6VCykpT94td5Z5s045CokR67WjmP4QPfNAPfOLJAnlKbvml4GbXwuMNkmuzxNktnWc0rRK1NHnKFU8ht53SIw3EjsvIDxOwj9Z7ptqGPpuXM19qyoD6un510Mkeq2ogSoXp0QVlFkr0dcOwtcuqfwcODDlEHl+1NPxt9qhGIqxted7i+liT9fzdpcVV6kKxdSlGkUopflEnzswn+vKksmeosd1h2hkzX1tKa/uqTjZv7FEADlXk6lENWPq3I/aTiecSLiUDlaiA7qswehh++hhqbrYL9K0u2P3qxqrehmKVTV3qfL8xqe3fO0+jXNF8LV5mZUPonMd0PJ1kUjPWUqyGJ/O6lU9DkMwsRaOLmvSIZ7gGeYD5b+unro0y9RY8zh64CEdbwYZUqURQnSeZZkHT+igc91wDM34mvtmTQrt03PNB8oUXlEOs9Tf+qfRLw/IL0PWUXTLidnVjcawDK+5TzZNJX6C2SOPlTG9miBv9xToO7yKznxIOSnTk2P0PQeX3MWUlbsNzqisVjMT7JUtOH91RFeZQBtfDaFIHFr7guSSB2JFT6uNv+Bp192AD4BHFdWNvjIjjZ82UdJba03Cqg29snwSX7CHll74zAyClhNtnhkvBhyZcEzRJqz4g3unkIT6PnMDtAgSxtpc1slb6TuKh6Mka3qWZjoOt8WE161dedHw2gtpuvY0w3z57opi+va9rsxo99qMhldnJB2F6zO4AaoqaeWejPq7MiT3ZejuzMjbpuRijEo5pdsxCpaqvAIjuwYjzdf/WpK12fjOC4MbgKo3XBQ/WXoBNZqSSWmsEax2slfG4pyL7iqVb1MPrUhgWvc8+mf0zwPyz9z6BuWe84a5u3cumOkuzvmHatro8fhmSWLP/FW03aYTbnwDrTb3nuFr6LfRbw/IbxdMclDuW2Ktu3txme3u4szlHm1cPl2ftznn3g+c0BjdPbp7dPe7uXuViQ7K8+vTJe8+CdRkU95lPqh1gWObGtTJoQsTw2GyJhvOCI+r1aNP7DVI9WGztAl1qlvm29/CX7lJoOZJdPvo9gfi9mUGODCnr87AvI/L1yRo3s3ha13bmN29PNu00u13n4YZ3T+6f3T/te6/bIgDngbkiZubTgeKvM77TwtK1zey6UGdrDo/Kxwmi3NTdMgs8yzOEDhDjGKGkBnlsCYGtb3uMR9oEknvNA1ofd2ovX8hKbba/XeWLRqDAXT16OrrXb0wwCH7+kLm6cbOvpiYuoG3/yTJTD4iFqYky3aejdlx+unGrEx9Ql09O5OE6O3R2w+Dl1mww2HxMyUmugdPU5YSeye+ptyTjcubq/J65zz6IRJe46Id3Ti6cYkbrxrfoFy5KpX27u5cmWl7F5eucWXjdOvFlOESp95dLm106ejS0aVrXHpieoN06MVc3fu781Iq732c+bUsZft4XHkpI3nOh1czc+8BotcmETZ30ErsRJezuyXn1MAx7eOU9nJI7TmjdhxRqj+yKlrxPnrPU/I6Co9TSl5d52qKbqaseUr/UvItn6T5yo0cSo0zKTqSScMs2jlv0H166abQa22qXFzh4QpvDCu8sikOaoUnt9LdV3iKfNe7rPCULm1kZ+c1qQfzh+gPlM+68fFKs3xfu76PBy5xDhjS+XqptQ7roL3GkPc4ca8z652O3uv94LjmBk3a8NzUcKB82k1nBrMswDu+jvMCzgsDmhekpjqoaUFjxbvPCjqb3mVS0HvAcc0JpmnL82lsj5XPu3Ga290TCTcpCycTnEyGlBy31qyHlTfX0Nj3SKlravo7Zds1d6oDmYDOzl5p/rNe+x4JqJHqHjp7Zd3B3QkudQGpY/huybTKom+H2/XKg0LgxgE32Fo3TPlYh236D6qYbhCz7Pmr+ImWNheVgqdN71CwLl+eVtRtsAsu6LO0vwuem997fIrT56wHlz4CRUdT6iytF+L7tEj612oZE+p3CUvAL2qg7z9TX/KNRBObjoR1Hcfu/AlcPvl17XtzqMpLrkj4Fx0xqPk8cKnAz637BR1L+ObeWj1A9p/Itq5l3ybp/fl0QqtJi7Ot2w2tT7xuuSFrugeudku1jopuTbWaOkXa/pDQvyMSsBsE/BV9hpUztR42cFkAzFcPhM03dJAWtBYY7qTkwsu/3L22qcioM34iPsxey03A5nJr4UXu84P3uKFtj2COSoaBNsdlY5PciMAakO8KjEx1RPg8wG9NcH24jWabzqrFIebD8X7JSq8UdMbmjqQE+Aae/46aZ0jY7RpRDJdK0N5/g+mRq8hqE1rzTRSvnq37N7TAO/oa0Afg9/+GaZWr4Bmsl0gA87Dz5EZOUjq35X/jpgh3qKRLIpAR9Zgf2FTu+p/Fx0mj0z+s/7bKX8GPBfFj9wt1gmCD0zO2hNGXLNw1K0HWE21F3CV4SzqC6YwJ3Zlaqnbn/LdwqobtsOHalLQYVgv3UKIY+IC6HOGWnF+oPvqvqbK7Dz65o7KgY1IcCPjwHy6daJWvXFAnxi5dTp0dfY+uvVYB70Ti+64kJV/7HjWsWeXN5J2zUtFX4naJXcpMi2JrgLRtO7SGv/p2uQSDMnjxe+oBU48vXuNlXG/ozB16/zJqefaw6DRf16vfqztIw4spZMrfq7hCCYUyxVq+SaG8CN7UfNbo/Tueb2gx4XuDIvPNlCTG26toSTmS8hu0XVYQ74I+zV+rvanJANh6x9SprHRV1fAidGXX96OucEnp8uwr7fZAkYuleU/U6QL2kramPE193XSmcB62sTh0p2Mbt1x2xms/FygpSFZDUy+bzFiqEw1Nh1t5vqHxUMspu221t0TgbdzaEt2vaTMr1NN9FKBcCG+pnCizVwXyouS1tDTOOnxlv2lPU6CuxiYzra5E3k3NZsVeVWrK09TXoI+6AsUa2hA1228lbFi4aUuaLMpNS+fD4nB4KwNOHScLKPOIJ6BDfGMCmvEzQKxSfPdcoIw8COQhwp0bfc3C4/Pz85sEWong9sz5E1lsfLLgewUhn0kZFJO/nZPDcHB/IYf++fYA/V+wimkp8xU1/9ijcf0DmbuAeb0QDg6FW1pcBtevOOKxZaBJRJ5dGh3Po6RIwhuRA06S9lyuwhyx3fetaAV7EmRi53uWQax/YyNQuvGU3y8chx4pZ72e+9FUdimndk9JLPsyKCP3EBFLQ7u0RizW8m/Ff0LnHW+RVfoQO9/+4vrrJ/cvNnwZ8eUc/ev9QslRF8gF7VKyzTBNSp6J3zksmm29OV7gxY5THJPiJtvgBgUwKoCryttDb8iaBAvQKapA/GZa3mIwMgt2LuAuWEAiNzH7003gX3cN8B+7bXdSKvQF0OQtvAW/wCa+BqsXVnzuLev9GwYY0qc5wMge8kA+ADMVi2SoYmmg7EdqhS/u9l5crQsm/wxW58XFnadXpcL4bcse7/ByE8MOHm0F+XXN7uRdWdFmvaaLJGserqLou3ybAdqNpvTdUpHCFp+8+ZM1ZxB2fpuNjUMOi12DP4Idt6A0INJSn0hY2krj+2e5V/MqoccgMwd6nb3+fpHAmcUduwLmmJpPvb5LNpBkTaZ1JvtvxS8knZ0/uUFAfIf6SDpxhLlXS99I3hVGA1MV/yvnGemaiwpIrD0TFyAeu4TX8/Cu1tqkfqfQgLKfYbtT1NGUqxES/IEEJHTpvPmZAc0cbs5u3S0gXl+KtVPvfw2F800bNo3wPRcvemL7Mrx5EdvBDUUZNswZhd2zlI7AGkqLYj253O/a2tRvcnml28Al+cEmePpZvOJrAvm+nNnSoCACO1tiTKa7F3pDltLyQrKcyE4OSU6UbR5yixqpPjmP4XrOlCq6pY9fisGQlFbZ70/HGDb7ZWsnqD+yfwnccHvD5v4FgPGabU/67YwrHvAacu/c0++oP2TCzggGVJ9geJTlQf0OX4jM4G/7E9Us9aYqf5Jvu5/Do+fqZ8XW60xvq1CIWAFfJuuAgkQn2ta4Czd2JbvwT4x/Gdl/57/VA5oRE6jOzFpUtoLhFrzpTOZ71QVMbGp1oIJO0t9LTXUuRxNYu4vdsWl3bPG1fbuNYvIsoAfV7rj044LrcRJfRZWb7+2D1lXeIwySsQybA7uzBC4fl9sSnQXZtza79n2WWhWzUhDUJnpNv7F//nDnvPvwy89vrtQqyq49N2yWXodkWs6aydX8lwBWU8Edc9dqUVuw4ccn/jNlg6vD68v8OrdBLh6HyosPac2qhCMfToJ8OG7AcY/rYCtdkqRCiXj59Jl3rh8pmu8tFepjVxpqf4K124eArJaX55Vvzycg+PTzc42Iy6/SFhq3IflEWrp61EsDAoSebtrHfsqHWhDbqsWLqFgpSdWLdjqBT6w/0LE/P9NqnPnm4OVEqSxqk4MupEPMF1D69qaj+Obt7eub9x/vPtzYQJVjc5nc//XBb7wPvrm+t7gOHzfPJIgvayaaZ47jzLQPLc/ZApTx+H755f0bK6HPbTZ0ToNPLh+2VHjFeZjN2eyRye/WeU0FTy6gN6kurJY8fr34TSem3y9qyj0Hag6PChlvhhVpqGUX/15XOABC29WGWZ8IwF2+VF8tRSgehhCQ8kXQf2iWPrV+nEVyjmaSK0/lGY9A9Eso15ny7VfW+yDBBv7nzPqz/X//2f5rPqymPeLmA0wxABLuBeydzaP36oWjt5SY3PvosjiPwKolYkUJuBn+zJmgxsaShdkmyhbOulI106rUz9Ipee3Ov17ygmpeZvaelwdn5vB30yKMZPH/pKIQeyKAL4arF1C5BZn7VA0XXDARFQuQuxbWerUK/e2/a8pPQRvXewaBkueNzxjPsSjFoz2mrVjAilOApEWgJ4+nVsunOhdRgxDAKx8Kuz/rKp1fVMhFP30r1SX5YqJ5tcCbLXihPO82KUcGU5TiezvDJiZ52s+eJKbCy1VIPpGLWn7iiUlC4GKEKrF4KTbll4AuLz+fKQP6QrE/UMNmxUwNX+AmVXrlS9amn97e/f3DG+fjzYe7D9//8s55e3Pz4ca5+6+Pb2+vLN+L4s9gy6q1r5hMbbE58gUWwJ9l1bRYftEYNO23/mg6qDcfX+/14s3b7z/QECr36pnEpJKw4m1xKcpP2nwUXe2RbqTtFlBGKg3RD0nDc52FkPNKEXDmi2YCVcZaURx+2W+PQzRy93EqbVuYtDAl1JZ2KFZs8R0RsctG16cbwpiogADz/UV2FiWwVuGCwPKiVAKbHQRjmv5vFfhbIKIvOEOb0e6r5ZXKYOsr0We+CWBXB4qDN+VO3gLaFMwJt02JvCWGWGuMOxhg8WiHcqMs2qzhcgE7VY3STMEX50KQSWgueSIJKnmsKCtBYgfp82cmUCwPGdk/BEBWLG2aF0epGxzE4W15zC3s4HOHLbLYu9JyS0XRJSkrTZzXqk7ur6yfNlHMF7tiNZacuoHNsXT1JY5g8Xm/ipfzFitQp+vv6adv38gkIV6EX3pRFv9Nu1X6IIvg2Somsea6XZRsINmGAXfKml2SkgbICy2JJCteYliauqRaWFc3jGRls6YkEE2dRUHIqxBDq9oSKjhMbffKElIxAPJxBez7ixjoyiQEKnmQxJJpMXzJzO2pWsKCxK7nR/J8e5uourSGEmV+cHqmWXjn9JuHgTkF90lwWfx0Yv1P689cvaueLYGA86ZwpTrABlQD4YYSeET8LvilmapTpW4YjyrXTlloKCC2Kh4n2Re/fCDB0+TKcv2IsVNg0z+0HkkcJ0eHGDwAKFbElKdUxr0YViHjewaWecHc3yx4AXCuNLDuxZDcQ/D47H4lpWIW5GHz+MhOoLmRR2OIs7OdhnpiqvpsDoCpBX5zl8LMoPBRcQkGk+21t7oRCx814USqx3kZVusu/EsSZCbdLDyXDHY5KjUZBA/Mkc9D+e6Xuq2PJJijotObLx2JHD6fO42DPCzkYSEPC3lYyMNCHtageViFE309omEVzyoiCwtZWMjCQhYWsrCQhYUsLGRhHYGFVViQIAkLSVhdkLAKSjYeDhb7jRQspGAhBav/FKyCD2qFgVUGz5ExhYwpZEwhYwoZU8iYQsYUMqaQMYWMKWRMIWMKGVPjZEzlE5QicQqJU0icQuIUEqeQODVo4pQs63aP+FPS7OJIo0IaFdKokEaFNCqkUSGNCmlUR6BRydYlyKZCNlUXbCqZro2HVJXvHXKrkFuF3Kr+c6tkHqm1JFf5wvdMdSUpQgXkI4kLSVxI4kISF5K4kMSFJC4kcSGJC0lcSOJCEheSuMZJ4lLcXI18LuRzIZ8L+VzI50I+16D5XIr5DaldSO1CahdSu5DahdQupHYhtQupXUjtQmoXUrs6pXYpYhFkeSHLC1le/Wd51UAJbefU0nsLJGghQQsJWkjQQoIWErSQoIUELSRoIUELCVpI0EKC1ugIWtu71etkrSWYA0jPQnoW0rOQnoX0LKRnDZyeJZndjkfOEtsmydRtk+d1zLfU38JfSMdCOhbSsZCOhXQspGMhHQvpWB3SsWpWIkjAQgJWAwJWjXaNiXIliS+QcIWEKyRcDYFwpQEH2qdbqT0Fkq2QbIVkKyRbIdkKyVZItkKyFZKtkGyFZCskWyHZatRkqxJTA0lXSLpC0hWSrpB0haSrEZGuSqaB5CskXyH5CslXSL5C8hWSr5B8heQrJF8h+QrJV43JV6U4A0lYSMJCEtbQSFgKsKBbMpbccyApC0lZSMpCUhaSspCUhaQsJGUhKQtJWUjKQlIWkrLGRsoiUfzjKni84RSmdySePyEXC7lYyMVCLhZysZCLNWwulmRyQwoWUrCQgoUULKRgIQULKVhIwUIKFlKwkIKFFKx9KFiS8AKZV8i8QubVAJhXGmigdcKV2k8gzwp5VsizQp4V8qyQZ4U8K+RZIc8KeVbIs0KeFfKsxs2z+hR6EIQi0QqJVki0QqIVEq2QaDUiohWf3ZBphUwrZFoh0wqZVsi0QqYVMq2QaYVMK2RaIdOqOdOKxxdItUKqFVKtBke1KoIDrXCt4DlpLW+XS2roFXYC+N1r33OjzMV870bkloTfvLnK3YiyakF9ZHYhswuZXcjsQmYXMruQ2YXMLmR2IbMLmV3I7EJm1ziZXT+Q+NPTyid8hxcZXcjoQkYXMrqQ0YWMriEzugqz2vGYXDGJqNwFLPDI28YGRbQTqVxI5UIqF1K5kMqFVC6kciGVq0MqV91SBLlcyOVqwOWqU6/xkLkKoQWSuJDEhSSu/pO4pHhA24myZJ4BeVTIo0IeFfKokEeFPCrkUSGPCnlUyKNCHhXyqJBHNTIe1Tva1k9e/PSW7a5Qf4ZcKuRSIZcKuVTIpUIu1aC5VJWZDTNjIZ0K6VRIp0I6FdKpkE6FdCrMjIWZsZBNhZmx9iBTVWILJFQhoQoJVf0nVClBgbZJVSoPgcQqJFYhsQqJVUisQmIVEquQWIXEKiRWIbEKiVVIrBopsUpEdUirQloV0qqQVoW0KqRVjYJWJeY1JFUhqQpJVUiqQlIVkqqQVIWkKiRVIakKSVVIqmpAqhJqhZQqpFQhpWo4lKoSINAVoaroHczoVEX+jDFvRpkckJUAjfkH0DSkJCnjSnJtmo6R0bXDQCIJrEMS2M7KjMwxY+ZY3q/8N/LIkEeGPDLkkSGPDHlkyCNDHhnyyJBHZsAjS3d7ZPgtbAIUc9UXV+0XSvuqYPIqvtonAdYgUQ2JakhUQ6IaEtWQqDZooloyofXwGsVy05Crhlw15KohVw25ashVQ64actU65KoZr0mQtYastS4uVizr2Xj4a0nPkLiGxDUkrvWfuFb2RG0z1kr+AKlqSFVDqhpS1ZCqhlQ1pKohVQ2pakhVQ6oaUtWQqoZUNaSq7UJVe+MGjyRcbaJ3HvEXETLWkLGGjDVkrCFjDRlrg2asleY1TK2GdDWkqyFdDelqSFdDuhrS1TC1GqZWQ5Iaplbbg5pWiiyQoYYMNWSo9Z+hpgAEWiGqwXOl8t8ul9S4KzwH8LLXvudGmUP53o3ILQm/efOqcxGlaAB7vAoTr8LEqzDxKkzkhSEvDHlhyAtDXhjywpAXhrww5IWN8yrM23gVkhsy34SR942IMpC1hawtZG0hawtZW8jaGjRrSzq79TDpmLadSOlCShdSupDShZQupHQhpQspXR1SuvZboCDTC5leXaQj0yrdeAhg0m4iDQxpYEgD6z8NTOujWiODSWvZkxKmK6t2ZwDpYUgPQ3oY0sOQHob0MKSHIT0M6WFID0N6GNLDkB42TnrYDXEXyA5Ddhiyw5AdhuwwZIeNih0mm9x6SA7TNRO5YcgNQ24YcsOQG4bcMOSGITfsGNww3foEqWFIDeuCGqbTufEww2S9RGIYEsOQGNZ/YpjOQ7V9m6XGTyBTC5layNRCphYytZCphUwtZGohUwuZWsjUQqYWMrVGxtR6nSyzroMFJvVC2hbStpC2hbQtpG2Nj7ZVO9P1kMNl3GYkdCGhCwldSOhCQhcSupDQhYSuYxC6jBcryO5CdlcX7C5jBRwP1au2y8j7Qt4X8r76z/sy9l1tk8BMPQgywpARhowwZIQhIwwZYcgIQ0YYMsKQEYaMMGSEISNsFIywXET4ibhfb8iShLAsutpvZfrK+gRLtiJZI5mKp7RuWnwEyuXybTqGTQqCSf6lRxqHBtbDNk+1Kc7BrZI6ip3g+4B58pB0A/H9Qru4fiBUetSrrL6SYPcVdiTybyvflOTqrpZUXkzKuSW1nJJ0Y1S66V3cU+XIl1eBbRLk0nEyjgCD5B2nbE/J+JfNptow6gWf16uYKuw2ITjsoAm5t+332d8/8YKkG2S82pBtQ7Pd/jr53LBHgWigKe8l9GLD8j6xR+vKE9ChWYni4Zoy+R6/SYEptUJTWt446FP5f8r0Tyg4WxTzP+tWbIkOValJClvWLNtS9bcr1CSuCW0wILmi6HiQ6aNcB4wevQvdIHLnICCzooUyNONjsvGuGMBVefFWMSZ1zFZ9dFatQI4Ui77N5jLWaJUzUhK5/PG8vs6qGi3jKklWftL+S3dz08GSOLy6QZO9kpICi2taX1vPH9K3JIvsKqLPFcv1ffsn71eyEEoSscWZXFLnDAu6L6xD7tmewr2Q9T3fy6RLCvk+3vL84jfWgcT8f7+wYIdyHZJv3moT+VsqOupxGM5EVxeuopzzhbdkDYite9Hwe4CqYJUsyOs+tRKysFUFvA+imAo2YXC5VkBepF0j30i4zWqBVsGgwRpb1cdkNGyqn5eVDk/u7fMa/St4t5z+lZwbn5bacG7Hd0PZvKlwQ7k5uM6i8o/OqhUM0w2V+o9uCN3QQd1QTv/Kbkg4g5E4otxyW+WK8sv3WmdUeHgmq2agDqk8CuiS0CUd1iXlNbDklFg4PA6PlMbrCneURf51BpV7clYpfZheqNh5dEHogg7qgjL1y/wPR+udGwJe4xvxt1fFXRg1Xi/3UhLsumOAvWDTV7WQcvXlZti6+alLDTIuR8fTvxXP6nDPwit/K3ZqRRXRX7kLxdlCpnNVWTsOcHOqADt8I7yF41ztMIHop6ZdIMziLCZroDhwBgzLFRNpBG1NrIv9FifNZG/nXjFWXOYP+feRQnOqe//XIIT3sTiAWmqe9GAp/GfbNsrbRN4tCk/h52APSu9D/tv6JQCi28z65efbt3ey7V9+kk9ZzMKbx1AW8DiAWKYtsTslKysQ5AugnvbK8h6DVUg+P3vR/MuZlJ3O96gjcXIfjkksiMsmQjbp0zmbrnWC9SaeWpeeTeyppBi2UZ0SQJYe8RecsTCZAtk8elpt6CeQBuTCcRarzYNPnE0ABz7nK9gIdy4khX5zQ8+lT/Jd5W8r6rfdYGux9VHsuT6rAdZGS+rJ44g3F3aVeY8uIllD3ZC+FMOJU8m3d0+sgeDQaZOyh1kCEp6oJGCb2F5gfdzSSoIy+ZGX4xXY9oxFKShnrKCHFe27+ITqzQqGaCM5vPYKGsPt/sLy+MrG3sE1vLLepgkXvgvFooKTKTkpE3ggdPqC4z1eMffFamkROpxUFW3ZQF1eTyBzQ+Jc6MLFoyMztVaq57+fpHrGxgSyQfCTBVTCLKsLW5W5lr8C0or3TKZCIb30/MQzofHUlcVR7QgIfelBCnv0blE2O8pbYOQtHfTE7XhiE8psThen1ucdgnpjXZzuoIpfJhID/eV/Wd4z9eLfCBxRvLLmT2T+lZtqwB0B9buRx4eaThL8KKP1AmcE53MatgYx0LolJXO+j2s93nx8naQaYHOTvetY0vgvtZnquOa/mcmsZdJCfanRGNWnsfndDP2LlP6dnjRM89PIfcpUurRWHMATEIm8JNMzyU7xFUZkZkzIXEtzzdM7Gvl5q9xQ0sGRN1d74JotHkTjdM8lfkf5rPo4mXo09ht66TjKJb7fkGa17TakRWEIbcsrGxxxew9ryHewNNRk+WAJS+CHQTKR5A/jrBhOmphjp1mPOwU4d/OTeF2ZYcEpwACaWnIIhmzpQmVFC/EWO8/O7C37Nfvr/Rut33Dkdn21U3Kf4jSXU8C61cNEdXA6V4qdtz19+8riZQpcLcik0gKQY1hxUeqlytVQUFp76X0ltKysjYcARRRql6o4azzvV3JTq/mKRTGpvLI+cTJweiwniTPYSWQ2xCwhXJKBj+nvRSRQNIuD+5BuhgcP3uNTrKgIjk3TkGa+Cb14C2uaBOWLrO+gtrkbsNNt8M3WikM4LwRRpWAfJmkqEywYYkpFTdBQCI5pM+c0huUxaQRHrVmgNi3lv4OkTyGhdYo+0ljd3fgsieB3ybk4RU3uJn6asgyE30gYQgpCNgwgMljgskCMx3mFAZOf0n51pjynzoee53ooZxq8n1pPqxdAzafsaPl9Xo/u2UIQ2pIct5IuBnlFgvqdjUxytHy9Cekak9VOA1Nx+iESAWs+1SjErorCK80GoD+weC6LUpsZTGGb21hqESYWnXNFNdZccFqyRCrlNZ7WMg3yEFbmGCn3uzqbqGftUtqs/FCZJM/SzAWJXyvh99oh5ZrwA4s7VptQns9TmsRTOIjUNiXgTlZBpqOF8w0RoWYZh+4SDh3Gq9rEbso+FlWuZr+C7SF25r/L2pJvWPqNbL0lsrspVMwo91thy7dsl3Wbytng1mwsVzRYLpSpMmkgG4JZYaCM8hoW7P+Ps/yYSdLJyd6nC+xw6zy486+r5VIx0uJb+3v+W5Ix5eXJ8wnLgKVTAVa8MoBRZlXMEGqG0RbUZ+8klnVL02Iyy2KOIRGiXNSkYjJWHw4p0UnGSRvvXJ3VlJ0OqCzTCYNrs6SWbEtYzbUoFZw0QfvsxP7/QHPqC9Q2jxeSJIasLUsEcJDF8oIJ4WJq9E6So1ISW96tePIUo3JK0arROxP7loR0bef9i9ytbuOQev26HF6lk/+1oWzeC+hfm+i1ilsZrKgSx5Dms3EASk+07qq2ba+s1z71tWx+E+5DbFXw1EGQesagEGoTHNKnxQRsFvae2SqbGrrB6wsvor4iIHNItGCg+iVnaM+hD5c1g5Zt/sCLMH/D9oSIJIKYrvL5Hg4r3KCkLGcabLLQNYBPWCEi2xIs3YGXYlBSjg9kfSVbto5lTJqQzCH5xuLfYWBDlmzcoDiIfB4SVkyaTS/ZyuJTV8Tla1DaJQ2ygKvjbyf03ZDlhtrQEGAD24gBW3jHYnvLoDQRkfH9ykr+csUCETpUVXT7727EgKYsIeX55MrI1mFi8oINOTsz8SKpZWlyKBY2EGpSlZXLtT+6Ic8PJdyOpK/1aamS/7ZsW7boQcsZqPK1q9JnFXLEyg5o1+SFFYhAPts8dQYFU+fpX/iVEOG3UkbzYjn8SXAqtBy+cUjsR3vKM8x4jDn2QMoJZoplbNbU9RIaskNywpyHC2Jurkm2PE0RcFTRhWz8bMP7nwAr8PdX7IaJrTafnjq3DF19sCUgKwM2wx0+/HQ5yg/i1+i1v3qEVRU73V8/Q54nzDO2yQptly6beOaPiP+zLuEj584tXQ+uFGHLP9dKe5Mce7/4jf3xe20aR9ZKdtcBH1XbPq+ZLrWzJcuEXJk1aqw09REaiWaJjy8nmtTHIpmMXoavaKjKMiV58UakDBcKmVySwo0EsgmSlynDC8TWXCmvoG2Wc5EPS6KUWcILtrjgp8BhrrhMFhP64fKWSclGYGqR2lrYuRJZ6QoZGI28On+2fsWWy+vZpGmSNBO1dVezN+lap8+/WE4z8p+ErJmerELv0YMN3OUmmHNQNEFcBYGDztYrOkmwTEZgZqWSEtUH1wDkC+4xN+KyD1hVXESB+5U4ACNepKQX2VUm8DBUU9RJNnMme0gNaHR34fZulSZCFOjGSdEopSPQX1qlorld0SxPVz8GKdw6wSHdEemOSHccId1RN4v1kP7YmUdEmmGfaYY6LT0E7VBffyMaoq7otmiJ2uafIk0RKYVySqFOUYwohkgKRFIgkgKRFIikQCQFIikQSYFICkRSIJICkRSIpMC+kAKlId5+JEFdtIikQSQNImkQSYPHJQ2Ka1eTaz5sKreYX+P9Fv7qD1tQu12B7EFkD+7BHpTP9MgmRDZh52xCqer1k11Y31RkG+7NNqQ2D/Fkeg1pEoJSrZWOe2uEsxLCcsLExFIzh0JQrDT7METFU9SbQQvbVJBIYEQCIxIYR09glM924yEymntKJDQOh9Ao19rDExtV7WiR4Civohuio6I7SHhEwqMcd5UrDBIfkfiIxEckPiLxEYmPSHxE4iMSH5H4iMRHJD4i8XHAxMeSJ2qDACmPHpEIiURIJEIiERKJkHsQIRXbHUiIREJkY0JkeQWAxEgkRh6YGFlSwSEQJHVNRqJke0TJBDJRMiZLgmjCgKMu80e6CL7ZBAF9/B2J50+nRZiUDECPeZLS1nZGjzxV5ej+ztbIp/7JgSWgE8HEuIiUtXpB3NZ9q03Vp0Y1kGeJPEvkWY6RZ6meJIdzTfYgXC4yN3vN3FTbwUEIm7rqm/E01SW3Rs/UNP7Eb8uueia8D3tXLqdau4yvx66KYVb9CO/DRgYoMkCRAYoMUGSAIgMUGaDIAEUGKDJAkQGKDNCeM0AlAeKexE91qIl8T+R7It8T+Z7I9zTje2r2RpDmiTTPfWiesmke2Z3I7uye3SnRvJ6SOutailzO/bmcsJaHVaYT8tF1ljC8wOCUjHoDbt4PJP70tPLJrTxmHTFjs9Dz/lI1S83siqN5enowKGGqBIVUSaRKIlVyhFRJ2ew05BSUpp4PiYt9Ji7KtPIQjEV5vY2oirIi2+IoSpuLKSORZphoiExBMEUkEgSRIIgEQSQIIkEQCYJIEESCIBIEkSCIBEEkCA6KIFgI7fZjBsqiQ6QEIiUQKYFICTwuJbAw3Txyb8X8pfBc/eEESvcbkAyIZMA9yIDFKR1ZgMgC7JwFWFC5ftL/1E1E3t/evD8IFF9gVHlsBjtG+WFuQPB6Rz0S4NVvU796SmS/Su/7S/iTNLUr0t9p6sTghKoTGBIAkQCIBMAREgBVM9aQSYC7eEEkAvaZCKjSzkOQAdV1NyIEqoptixSobDYSA5EYmGiJSkmQHIjkQCQHIjkQyYFIDkRyIJIDkRyI5EAkByI5EMmBgyIHVsK7/QiCqigRSYJIEkSSIJIEMW+gEUdQuR2BPEHkCe7BE6zO7sgVRK5g51zBitr1ky+obyZyBvfmDIL/cMB7ZL6QKmpluFvgiQmJnSRzUPS9/7zBtKFdswZPSRsGJlC1sJAviHxB5AuOmC9YnKfGwBas93/IFRwCV7ComYdkCpZrboUnWCy0bZZgqcnIEUSOYBm2LKoIMgSRIYgMQWQIIkMQGYLIEESGIDIEkSGIDEFkCCJDcJAMQRHcNeMHFiNEZAciOxDZgcgORHbgTuzA0vYDcgORG9iAG5jM68gMRGbgwZiBQun6zQuUNRJZgS2wAoV/zHECxRg34IDBxvcNAMoR9YA/cXrPSdECZQPQX26gvLVdEQRPVjmGKNoasSFfEPmCyBccIV9QM4ENmTS4oztE5mCfmYMaHT0EfVBbfSMOoabktoiEusYjmxDZhImiaPQEKYVIKURKIVIKkVKIlEKkFCKlECmFSClESiFSCpFSOChKoSzC249XqIkVkVyI5EIkFyK5sKf3E+u2BfpDOdS1EnmHyDvcg3confyRfIjkw87JhzLN6ycDsbalSEPcm4YITop6RjG4TsLsmUnZRlk/gY+UEE387SVAOyUvSp3JJgxSGX4i7tcbsqSrsGBObOcme/esBoNgsFEt/pBhHfx5TaBaQFL40/mPSsSGrM/U7CMa2b5PVpt0SVeKbZ0X2kuolHfzSt774jswko7jBR4NtKpjAc2r9uDfqh8Z1Vx9Lbd0lrFncl/b77O/S0N0JW22XRoNqlPFDxRv5Vfzs3wDq+MWzZ/IYuOTJuNGVzh1e4uwsIFVUfpHRsBJv4IfC+Jne6ISfozCFm5FL6rDqLehW2XvVSIwg/Hkb8Zu9DWSvwBjOIMf8q9zIpxVRFwLDjI5r92XYOBChi7sLGF5v8ck3ozeCjORqYwFbnq1NzGvICqGkF7J9pvkYyX2SEP99gtfw9xsAtCat/pFyfk96/3kHopMAQOOjESb9ZofEHjhm8cpGVK3sj//6BPYwoRJ+skCxAG2SfMQyxb2hDaR2OqknWXojaZE+q33DE2BmAzAM1rCH85NSSdC0/lCWIz897TmWzGYqbyYNOzCNGs7cuVQq3MiIp0JaNU0p2U76PBL6MXkYErMjBNqDK+kI/o+8L2AfGJPwOYlhIefTR+8IdHGj78Y+VfOQK92I6Ptwv6DlLaaPeL8EsDO+azmoZ9v396pbdmwW0c2dq4mY7b2V9Y9o2qyLq7EVHvF8aTVsxczpIiPQ3gvJfAn/gJoKnxHmZZEOyABuKEmh8ZSTp3yhCRa+d8Ii7EZEMQr4bQt+dzHWjhlVRjtYzZzc6w655vre3TNQVcpDlkuyTyO+uP6coMi3/sEWYTMyGZCLvIKgAHN6byMh1Rulu36L+5WsSLZBF5u2Ga7vcxqXq+8IJ6JXtrZR7Itq0mTs1ZMBVo8XJXODHehG0QuAxX2OacgfVjJlN/5+B37fZzzdqUmcCS+9TN0JybXFoWkWEPAGS89Tfi/rWSFIFkE5DeKlcUsvHkMZU0tKLCmxEbKVFYUPKaHx/TG6QJkHr+HB9TG6HVGe64sr0uHOEhWrK/RybF8UcqTLbudFCu0buhHw4pno7J/0Yr0BaroSaLxbO6hrWYmpXswf5aGP7z/IbYq+/iEzrDtLzLpObe8lhsdbEvc9wx+qOmAKXsw+cOUe9/BUS89WpCxbEshvSLWKC0ppnVjPa0TteqBXGTtODlO+C44/6A2xRkzLVHNBkHiLYmvF/8kbKf79DCAfO+PCwUUW9IRInCawu5+ie4mg9pwne6GD14cuuE2Ibkoy1OyVCUabf9Mf5CFIMgYNCOEs4N0SJZQ6F9obEsFtlA2hTbB3yVi2FPTFVqMqAWiFuNGLSQWPRzwAj1j655xtJCKRECHQFak1TYCWCQltoSzyNqKcIu88anrMcJcKg7G6C2pP0DYpl+wjcRojNGbVIlm6V9qHKeiQ7PKJ+qXpao0k346PHhIH3giStQVSkTXHU7mB2eF0KkBjpBbR582fqQYiONCScpGdYQqnbw2YBjVqzCquf7X6zbCTgg7jRt20k9tiECh6xw1GKVX/0PgUnUtaARR6QtvCa2q6QECVwhcIXClAa709oMY1mExLOMwF+GsruCsOBOBU4a2FOJphGts71avIQVPuJnHYn19ihiXZBiOjXBJm9QZvnXSetBXIdYJCCEahGjGDtGoPXNfL+Da0/pHjDOoZXgYlEFXf0OMQV10awiDpvUnjS9gBN+PCF6tn4ZXY/U5IDZaF2M43F04vIWLF+aJCJJBZtGwRDatxUClBc2px8Sl4voUG1eadpAY+WT1o+9CNRUYxs4YO59S7Cz34MOKoY29wonE0nKZHj6mVrWjxdhaXkUnMbaiNxhrY6zdq1hbrqcji7lr19kYex8s9k5WLMogvCSsJsEWldWPq+DxZhME9PF3JJ4/nWAMLhmFI4fe0hZ1FXGftBJ0zxuOfOqM2HUKgrEUKWv1gngnkm0zNalRAQzdMXQfeeiudvzDOZbQF/cyXjBArSUHwQB01TcL/dUltxXxa9qOpH1546v2jGz6nuEDaq02ptJXpTyrfjRAartRLIFgQmdgAowX3K7uhFwCzhJEABCCRDLtBY383qGThw74MPQKO0iadBjw4NT0oK9CrBMQxvYY259UbF/wzL3fjt/N+k8l8i7I8Aihd6n+NmPvQtHdBN/F1uM2O4bR/QqjC/o5/O11s3UxRsKHi4T5TZ7VUJjLpsn1iCT+9LTyCbvl9ASvv8x3/8jXYBab0tV1mKcp774JTSUQjG0xth359ZMSj9v3mNbQysd7zaNEZge57lFab7NrHyVFtnX9o6y1GKtirHrkWFWml4OPUWvWsRibdnblIomdFxh5J4KhBzXLi6JBaPLO9fxPdJJ8++ucsGE/vXC0MgTHDUklzekoLD1h2fdReDrBYIiKIeq4Q1SVF+57mLqDxY82VFXJ7hDhqrruRiGrqtiWwlZlqzF0xdD1yKGrSjcHH74arHcxhO0qhF3SwXdgSUeXEmL4qcpVRNJCOHP9sApjsjjdQFYMQD/C2LQxHQexJyf1/glOLRQMXzF8PY3wteh7hxK81tr66EPXotwOGbiWa24lbC0W2nLQWmoxhqwYsvYkZC1q5mgCVuXaFsPV7sNVlw9+LlgV4mgQtCRLli6ilcPGnEltxw02s1Z0FGUOX2A9GnrJsGKAiAHiMAxG4fj6HunVmynYIwlDOgjCLpxos177LNy7VCzyafxAVfzyc2ElmQu54om1pCu9GBTws06i7ERNIqLdwIEvXxSNy62zlucXyQBccJ1+Ef+k7aeqvaECfKB2T4Paxcank/2SLh3pUxe/lcPIie04YMeO8/uF9c1zrXu+hvtMvdwXOyngkv1zko765TzpGv/i/lzaYnUIYN6XuRuw0Ip2B1Qk6Yu+J+dne62C91uPflb20NzmpzuUYe4K4L8v8o9VljFTm4xsQXwyuErJPR4CUKlU2RDuKJeHOIc2itXcAl2McqO1+xJc5pyj8kUjd6Kfx+veMXhwYogbIIBjBOD0SmmErZdM3TgpG1OEDlVsuPhJuiaZpUFeg/D7jRs8knC1iVQCGfvWfmkAjou2VBrTEehyslLvPgcwNWh34cZug8y/3Jez5jcuRShQs2IABmlYhJBzw1IeiBuS0IlXX0nQeGhA1g0L2Wy8RdOxjTcPDYvIbRUoS4ri0KgxbkwcTZ/qi2nJn6l9FQKaCGiOm/EiX5IMJw0+ToE4BeIUuOsUOFrAUu7ODoFbqmpuRASTF9oSEUzRYrygQd74ZKbJrmXQPJzovdmz3EyNHoa5wejB5BY5k2fzft6wyTCCRo+CzzbrGfXMRg/m/K9hwdzL4n0a/aL7yf2PMWqb2OMs+WOq2XNlRc9CFeBWXsDNkj/Uj4IhzuCH+hFhgrN53W5n3v5m+X/oWgoCmPFf6sfA+mbwQ9MRancz+KF+JGdxMy1XsLywmSV/DO9Kk1rYElmbXe06LJKhdxgEElGXUZJGAzj6Nl6F5IbMN2FEF6o/cazl9LYipMNw3A0JRZM62pY4cT04BDLDhlRZFWRqjmxek/3IdcBZP/zVLgtllwi4qQ7V6QcCwggIjxsQ1k0MQ4KF++98RgvC6VToEFCcvv5GgJyu6JZgOW3rEZxTgXN8ikSIp1cQj06XdwB62Gsz8Xt4UIJhqIGAQleAQgQCoAMnJJDw/KmeSkXTIKq8oUtJBBdko3BcbEHeoo6ghdNWgp6KsEY8GNhjYD/uwF7jlPt+7HU30x9tXK2R4CHCam31jaJqTcktBdW6tuOJQIyTjxwna9Rz8OmPzFbDGPx2FfyGdPylsa9MMA2iHrpeieJwM4+vgwVusrNZp3ZIjhsUGzSvowgZdeWAe2ELso6fGnDeO9OZXfQB43OMz8cdn5tOFsPZhO+L4xktIGCqModAB8zb0ggqMK2mJdzAuFe4MS9vPPMBuC3fL7jBVKuNt+iZlGfs5/C25/cIRhCt6AqtmCfCcNxg4ag37muFlo3B3Kc6ZTm3dBH8Phm22N9eOvl/UQdePINAo5I0D6T0hLbREujlSXNyWny8oAvr2Hsm6R/ZCi/9Cn4siB+7JklCqXrfpNrN+n0renKlMhGDd+VWACNRsSjHXa99CBhoP5WHf+Rvxm70NZK/AGM5gx/yr/OHlHjZpkZSh12ALnh5zWHit2hM6Ub6o9tCVlQzrKfViyxmybXR/jtLtKV/5uPbG+fTh5v/fPfjh086qed1uyj1Qhi+Z9dpf76S7PQ7HDCzf/nl/Zu+drPSjTO9NZuL9kzjAPJDpLD9dOTkBeZHsz5QKw1ytcj9RlLvIt4rh5XZbMG8Fecl85aridJFwG3nHpf7JCa9GfspdxVUMDP6f/mXdMxn9P91eV8nRe1ak9BJsuXt6h8m0vFmPqygtKxASb2QdZn52q4qPpOOcHWEYOjq7fr93dub67v3H36e6gbU9V/cbcR6tHcz69tz/eOn6/+6VTZELB1+oYse//UTnEGMbulIR0uPRJfF8f2BBCT05kmgKt6hC1RA/O7oavZLeYlRWNwJmVHhFJ8pJ3IxgK9KBYgmlPUhadrnz1+mpa+uYb3MvlN3poi9OhybhZ+ad6orLLrADTy6Pm6wwpIPYn1GnL3SU3c1mNWajAa0pLdXZ/I1VmWIqPlXPlO8m6SRmCUDqHpOtAseFH8qnoQ+0afgl2o7YM5NTWb8lbCuKs7EDUf2BkbMSUrTrEIro6FbsmqP8xdHQ/4Mw82ywagN4LKBiVLnY2gwtK0LBmuqNVajXhYdU7+qZdXpIJMcbCmENGRWAGJprpOZEF9xvC4nqgsK0o5cJkXU3xeQPKlLYPzO9SNy1lDFDqNaydg2V6r8tFaelIortiv5ss9oHuvC2xu1br9JQuk+i3VSzS1+0MjpVsYI2Bo7GHezKU0XD0jXPLlzcG5Mvly1d9+EVvM/m3fwS603LTms1PNc1ec5l0IWTGKiOWoMcpdRvqzDN7jyzHZyMEbJaJLRmBlMYAVVqB313fghrOwD3NK1O6WH/T7yNWm7GKpoL58Iv7RO5OmfoLrf1gaWRsPEj7VZSxfePIaypjBPfdlln7xb7chkjoQcJOQczZpl3ng4vJgTciAd3j/W9ppwFxZKXu9aYprki0Q2iaLxzB+b5PysJmtF5kkfmCd5LTdml4DUZ/Bj2jQZaHuhoJJNolgRG/s1I+aIEXvksMGolJtiEpDWjsg+QWlhXhoXQ4Zlq0osqkHodhdu71YpjUZMlb2MuaUtHVAMrmh/VzF5/wU7DqmoxxpjY4yNjx4b67xm7+8579KQRxqT6uTdUoyqqwLTKGB0eezoUqefhnkUOo8PDVdnGC8eNF7UziHjih/jcOvEbGISBy0yipd0FFqLREoHZwcQapZaPNiQs9KPw4SefRb4uKRUP/YYkmJI2rOQVO5dRxyamhv4SYSocvl3EqrKq8KQFUPWfoWscj3tZ+hau7rDEPaIIaxirhl5KJskaVLGtKVhaRLqUF39cRU83myCgD7+jsTzp36GtJKGDimSlTa/swC271Ltnp0Y+dQBsIQTNO6BY1dRWym8Dip3pTQxEsZI+PiRsNopD4fHPExPMdbYWq1RbYXU6hqQsKxofNVEkJHcswBcrdXGBOWqlGfVj47GSDZb02K0fthoXTNpjSxIBzXxaVedkPfVWUJnITSXjEGTs6gk/vS08gk7kNzPw8P5Fg7pEHGx3Z0dJu6tAIctherYYgyMMfDxD+9KvOGodn9NDXash2Ql8m3rsKykaNzNxWDy6MdbJXrZl93bmtUVxn+HPaAqmxtGdlCVxM4L9NGJoJNgJflONwgU3rme/4ku597+OidMxXoZ7VVaOaCIT9L2rqK+fgtz+NKQjzFGgBgBHj0CVHnIUUWBuxjvSCNBlZxbigZVxWNEiBHhsSNClW72JSo0WH1hZHjQyFA5X4wrOlzSbjqwInNI0lFqNZXOtxBYXD+swpgseh0jijYOMEJMW951fNhHMQ5dErLxxcgQI8PeRIZFvzjKuLDebEceFRZl3HJMWCwcI0KMCPsSERY1s2/xoHK1hdHgUaLB0iwx1ljQ5d3MRYKi4w0CiBu69qm/0rsHwaCsoQOKCOXN7yos7L1URyET5UhjlIhR4tGjRI3DHFWouKMVjzRe1Ei7paBRUwNGjhg5Hjty1KhnX8JHs1UZxpAHjSF108e4Akm4i5Wqi+iqk6wXZ9I1bNZP0H9+kTO7aNfKrgguGYOBylzW3Fk8k9/lW9UhibZMik2O5k9ksfFLBlYtv5S64eWJBHULmwVdXLLDy8kf2Xoq/Qp+LIgfu9Xljm6pcytavcvIJu9c8itv3fXah/UvbTI1sGlysbwbfY2mrHsz+FG98DqruvHd1MUm7LBO5Eux6+z19wvJUon1RX1nu2YZdhe6QeQy8xQrMflSWLFskz6cpNWyS+mzvqRLpzto7228efhido139yooMawdpJR7y36f/a1Z2MPHqhvEi8pCyyh+oHiL6QB9mP1W3U1OB5I+QoJoExLnyY3YkPyLtuUyZwfyd3N9LN5NXp4AhIzTuUdoZx+vDa5q/6CueE5efIidb39x/fWT+xebDbazfvirDUb2fjGcO5ybCONUb2FtSQPK0jWD63opcrzrty9aZoIr5QMYa7d1ypeJBKD85X9Z3vM6pC7smUYYVxZdwc2/ctgzIB6NBEJrvYo8PhKWGz5u4DnrxY0sdz6nk1oQU9FtJSU/0kiAxrPW483H15bQSGYk9q4dD+iHiUpXByH/zUx6228L9eXADIP68O7jVoA2vKm4T2DboG8hdpwkmDeellgA9IZGQnf0D9gph9//m8oBjPLS8Fk7WL1cTqw/5hE9CBlKBqwY2vwrU3VwVoWYmGaWCpANSjKOO83V3Ff+EK7nP4nXlW7KKeBzTjsBohT8k1T9QNyQhE68+koCTd1skSDaL/OzjtwPyu3ebArPWWvdWkhur8Vm2Xkfp29fWezFzYq0IJNK88NrWnFRJKXK81+eSRYU14tFAsnB5rYXLFfhM4vxAe8U+8as+fZZTZ/lBndZlcUTcWGT2767vv1P5/b139+++eXHt1OFuWYuxvaiFW/d5YSPW/Ydt82Li4kEGqaO4rLQVOry480adg2kTg3WlNQKWJ/KOwdsvVm7D1ltg+6G9dq9gpxFzkrGL38hden5bssfzevHrKxLRruhAgTNjRveU27dkvh68U9CO/mN9BUyyrfxhJCjPoum+9DeTbreML53wwcvDt1wm+xXKcuDVJqRzdtuP3LdY/KV6J/9M/1BFmKvy6AZIfkGSwB3CYX+RWStVTaFNsE/Cp5V0LkRwFoS0Q0H3UITQLCt/2CbRDUOgblJq20EvUlKbAmBk7V1HEBc6qKM0LiKIzJ6S+o3ENA7HKAnUV9jXC9VkFn6lxrhq+jHrPKJ+mWpmsyknyJwiMAhAocIHCJw2CJwqIcrED/sF35IgyonW7zNCoF/kxses1BoCMiiorknBDIORGAItowTb1Sp3wigR71vQRQSDQNRyPZQSL21HQKQrGtBs/tHtYW3dQWpvgeIWCJiORDEUq/JCF4ieIngJYKXCF4ieCnAS2MYBHHMnt1/nAnOKWOaCqE2Qsu2dysaXVH/uZnHIszqL7gpaexJQZsDEFZPR7puFEeBz6nNo6/5zRBmOjrMpFaaw4BMuvobQkzqolsDmDStHxC8hABO9wCOWlP2zcaGeAjiIYiHIB6CeIgJHmIUOyEa0jc0ZEs7D5LlgktkzMAQiURbi65LqeuGAYmUGn2y0EjPhTcwiKQ8mqODSuRmg5AJQiYGkIVceQ4Pnaja0SKEIq+iEyhF0RuEVBBSUUAqco1BaAWhFYRWEFpBaOVQ0Ept7IUQS88hliR9vxJrKYm4SdhOVeDHVfB4swkC+vg7Es+fegu1SNp6SgjLAETV/dmhyKeGzZdvnLwcKWv1gvg4J9BkghoDZqO2v+GcPeuL/iAc1B4cpNbLg6BAuuqbgT/qktvCfDRtH8fhrKq946mpAyJEav0yPjJVleCs+hEeYUJcCXElxJUQV2oTVzKKOBFO6hmcBGLwqdickMvNWYLgAESSyLM9QOJT6NEZfyDgEW/s6aJH/RRW/3k50lEcH7ZTMA/k4SDwYoJ8FJTmCMhLqf42oZdC0d1gL8XWI88GURQVilLQFOTXIA6COAjiIIiDHAwHUcVOCIT0HQh5YZKrIiFcog2i6x9I/Olp5ZPbmM5FfYVACo08Ieij18LpPeRRHL0RQB0yM0CIAyEOKcQgU5ZDQBvyehtBGrIiW4IypK1FCAMhjBTCkGkIQhcIXSB0gdAFQhfdQRc1sQ9CFv2CLB5JTP07lZcTgcBg/swLsEEQ/M71fJjM3v46J8xK+4pSVBp6QkhF74XUe7SiOoIjQCxUJoGoBaIWUvRApTCHQC7UdTdCL1TFtoRgKFuNKAaiGCmKodISRDIQyUAkA5EMRDK6QzIMYiNEM/qFZiypyJwXKjOHJEKjGlERZAsB8/XDKozJou+YhmjmCSIaPRXQYPCMZPxGhGYUjQGxDMQytHhCUV0OiWSUa24FxygW2jKKUWoxYhiIYVQwjKKOIIKBCAYiGIhgIILRPYKhjIUQv+grfuFykeXQCyHEBqHxJ9rkpU+nsZ6CFkn7Tgit6KtIeg9TpAM3AnyipPcITCAwIYUHSnpyCESiUmUjKKJUWksYRLmNCD4g+JCCDyXlQNQBUQdEHRB1QNShO9RBHdMg3NAvuOFFSIpKPxFag1j2jRs8knC1iVRzaz9QhlIzTwhs6LmAur+KI3EPDS7g4D6ANb9xKdGadoA0LCYi/rJhEUJ6DUvJO9PGQwOybljIZuMtmo5tvHloWERu/tKvIA0aQxfujqZP9cV0A8WV3coIEDn5HDGcO4fQ0aGjQ0eHePVx8Wq5Fz0EbK2quRF6LS+0JRBb0eJxXImVx5f4RViahxMtNXuWTy1GD8MEYvRgcgmqybNlFMugyTCARo+CYzfrGXXfRg/mnLRhwdwV4w1mh9uxkHsC48vLUjQs+WOqfFRUPgtVEEh5BTdL/lA/CkY2gx/qR4R5zeaqRbsUrcv/Q9dSENyM/1I/BpY1gx+ajlCbmsEP9SN5pDL3t65Mbk6z5A+8RA73n3D/CfefcP+pxf2nWpgbt6H6tQ21SATmLJnEqDKUZNhg0+M2XoXkhsw3YURj4Z9IFLmPvU2YLm3sCe1QDUJYh4BvWceVVcE9A5HNa7Ifue4wsZSH7ij7AXIhjmBXQGedQ9ob6L1yIQbbGgar09lDILH6+hvhsbqiW0Jlta0fCzbLOoUI3+EQPp1W7YDzsddm4jciSYgkIZKESBIiSS0iSYbhKOJJ/cKTIhAblYeQm5MscWby0LQBXnFDjWIo2JKsrScELQ1BVL0/dS0dxBEgOxrbwNPYiKxIkQ2NzhwCWNFW3whX0ZTcEqyiazue3kakJEVKNIqCJ7kR/0D8A/EPxD+6wz/MYiaEP/oFf4RUalL0QybOBhE1XfNTj7mZx9fBYlAsm9qGnxAsMjghdk+QWJB1/NTgNFw30Eu9oEaAw5ha5nDYNkdUJsR6WsN6TPXyEMCPeVsaoUCm1bQECRn3ahysG+YWkHNzOCTJVL+M+TdMgjP2E7k3iD0h9oTYE2JPLWJPewSmCET1C4iaJyJ03GDhqFk5taLOxoDan3X/KfT4jA7Kc2/N3YCZPXgsyw22oqURbap179wKlb+n3cwVsw7JN4g8XOuFlWYt6cRvLVZg0651/261skOyvJzc0xIXVhxu4YtCCYkt2dbfVy+0sHBqvdBxdmmhdEBpW1YvWen0k+T5XBEwIcJLVE2ywRIt+ETcrzdkSUKqm7Tx0Lzcm/dwxD5pIZUzzOHUSUBhQoVc6Dt9SNn/1Teq/CyCsiJ3SeItD9NYwyPWguIwSztvXS5hCRhDcyaZ9Oc+nWqsQv2XqSToEr54/I+Aa/ICj9rspTTtU9V03PXa9+bM7eoyBakmwuvs9feLL9Ximdcql/qaDo374JPPu8XJcqwieT7Ju6l7mH5OQtod+634I4nA0/AJIIDoNt48fDECJUDv6sYsXeAlf2RNq6791JCISVqondZdCvBUPuczK+FzEH2V/VY8w0xxZpEg2lAv9eRGrHP/oqVewlcztl5WvJvPqjLL97jsu4W0mKcCTRJ61gC+ZSV2AdEWjF+vwm1A8uz3CcHuQ5db98Bp4D6ThonkarMgLrx5DGXRpRIt8CiwPleEQ0H3x9UOmbEPB8kfk0K+sj4E/ta656vT+4gtcu/jTOT0o+hptaHRw/19stajS82p5UrKuk/yiN+nL0Vr9yWgL9jd7koU9Hlq7bp/cTobGHmTO8QmRbG+RhsR+aJa2mwotG4cGwrgnYxS+lVzMeLmQ9ebD3l9M95gAInO4Me0aa6/yVmtveT8h6m7VRiOgB8uORCYnHgm4TdvLuLUy9rMgPn21CTTC8ky/7jtpB8rxsJWLL2NAURWt5gSZ6XdEXmVE1ugebgjhDtCuCOEO0Ij3xFKEOi2toI0HnvA2z2D2spheaCSBU2TBG8kvl78k9BOfiMjgC3z3TmlNH3jkGL3mJGbjFJD4MgNH7w4dMOts3f2Nomq2j/TH2Rhls6NO/ZvsFpwl1DoX5yIUDGoN99oE/zjJCDMq+dpQasSKQ8HYUVrQcAXAd+W8j5WFfgg6R5l1TbL8lgtsa3kjpK2jgMMTh2pESJccZeG99hIvBuCygfMIllVX2NsOVWQWfqXGuys6Mes8onuQhaJmsyknyJ4XQ9e6yMvxLARw0YMGzFsxLB7h2HXO26Esg8DZdPw2skWyLMCWtQAE83FmyMDuRU9OyG8e3yyRTBvnNC3SlNPCwXXeywExNGGEBA/NUBc7xMOgY3XtaARTK4vvCXEvKYHCJ4jeD4Q8FyvyYijjx1HN47oEFJHSB0hdYTUEVLvHaS+kw9HdP0w6HougnbKSLtCYI2A2e3dKk0fJNYko4DcJf06KcB9XHLt/cVe8gE/NdRYbXTjugUMwc+TAz/Vqn0Y6FNXf0PgU110a7CnpvV4XxnCijlYUa0p+15YdtIondEyEDE6xOgQo0OMDjG6HmJ0xh4cEbpDIXRb2jEnS84t5McAOom0WoNxStmLRwfTlfp3snDdeOQ8MNiuPPCnDN/JjRFhPITxRgPjyVX88HCeqh0twnryKjqB9xS9QZgPYT4FzCfXGIT7GsJ9tctIhP0Q9kPYD2E/hP16DvsZeXKE/44E/yW3iylxwJL4muBEVLw/roLHm00Q0MffkXj+NAYYUNKtU0L/xiXV7o/1Rj51F3ylx0/sRMpavSA+zjlymUxPDE9UW/VwTpD3RdUQqjw1qFJtPQdBKHXVNwMm1SW3hUdq2j6OI9ZVr4Rnnw+IXqr1y/jgc1WCs+pHeBDZAPM0Wjwj1IlQJ0KdCHUi1Nk/qNPYgSPCeSCEE4bYpyJxQi4TZwlCAVxTIqv2gC++HhkfnslrP11Ac/By7T+NUTrgJw03FowOaYuIBY4HCyyo9hHAwFL9baKBhaK7gQOLrUdaIgJ7KmCvoClIR2wKzamWgYjNITaH2Bxic4jN9R2b03lwBOeOBc7xMLCKznFpNYBxfiDxp6eVT25hoh8BLFfozwnBcWORY+9huOJAnxb8JjMuhN0Qdhsw7CZT6UPAbfJ6G8FssiJbgtekrUVYDWG1FFaTaQjCaTvDaTXLOITREEZDGA1hNITRegejGXhuhM8OA589kpg6bSoLPt/CIiUvnAYoyzvX82GGevvrnDDTGwFiVunTCaFmY5Jn75Gz6mCfFnqmMjRE0BBBGzCCplLrQ6Bo6robIWmqYltC05StRkQNEbUUUVNpCaJqO6NqBss8RNYQWUNkDZE1RNZ6h6wZem9E1w6Dri2pOJwXKg+HJAKhqlsRUguozPXDKozJYkQYm+jRCSJsw5flYPC1ZKhPE10rmhhia4itjQBbKyr1IZG1cs2t4GrFQltG1UotRkwNMbUKplbUEUTU9kbUlMs6xNMQT0M8DfE0xNN6i6dpfTeiaYdG01wujhyWJgTUAH35JCK8EUBoSVdOCDsbgfR6D5qlY3xaaFnJmhAmQ5hswDBZSZsPgY9VqmwEjJVKawkRK7cRoTCEwlIorKQciIHtjIGpl2cIfiH4heAXgl8IfvUO/NI7bUS9DoN6JSEVVdNEIA1wkjdu8EjC1SZSrV0GB3aVenRCmNd4ZNn9vZWJQ2lwWyV3saz5jUuJ1rQDpGExEfGXDYsQ0mtYSt79Nh4akHXDQjYbb9F0bOPNQ8MicjOefrFp0BgIrzR9qi+mG0S47IFOCxiWzzzDucsXfSL6RPSJuG2C2yb12yZyX3+I3RNVzY02UeSFtrSXomjxOK6azmNr/IJpzcOJlpo9yydAo4dhmjN6UOi10bNlBM+gyTCARo/C9GPWMzrJGD2Ym0oMC+YTBt4MfriNM7knML4UPAUEkz/UO0Oi8lmogn/K68xZ8odmt4ka2Qx+TGs3z+aq0EIKWOb/oWspCG7Gf6kfA8uawQ/drt3mYQY/1I/kwdrc33U7gbTq5A+8nL1+G7QWscPdUNwNxd1Q3A3F3dDe7YYa+W7cFD3MpugiEYazZNKgWluST4N9tdt4FZIbMt+EkfeN/ESiyH0cw31P0n6d0H7p2OR6iB0CNkbKquDytcjmNdmPXM2YBMujfJTdKbm8T2uPSmfzQ9qp6r0e4o7Aie0I6CzrEPsC+vob7Q7oim5pj0Db+rHsFLBOId58OLxZp1U7oM7stZn4jbhmPa5puLJGdBPRTUQ3Ed1EdLN36OYOHhwxzsNgnBGIhI61kImTrCdncmCjATB2QzV9hHinrFsnBHeOTKq9T48iHe/TQhs1FodpUxDtGzDap9HsQ4B92uobYX2akluC+nRtxzQriN6l6J1GUTDlys6YnNnyDyE5hOQQkkNIDiG53kFy5g4cEbnDIHIhlYgUkJOJqgFyQ1ce1A1u5vF1sBgrGbG2jyeE1I1Z3t2TwxZkHT81OJfeDRpYL9PTggZN7X04pMQj6h3CjycGP5pazyGwSPO2NAImTatpCaU07tU4yInMeSE18XDgpql+GdMUmQRn7CdSFOvh0D3W2IiNIjaK2Chio4iN9g4b3dObI1B6GKB0nojHoYGpoyYy1ooxGwPAVHhUWiRJVtLzlCJ1mE/qnHk6TyV/ZCBEdQqrYgQskE8vkiHu1xuyJCHVGmI7t9Dkq9LAwbTrQSyZRd40Mvd96/yB6sR5Fn5b4GBpZBqSUgnRlsapVPZzK9o8uqFFLdi6X1N1Sgpkwf4m8OkwWi/kolLAS9IE0IVw5Vv+arWeUhnTAfPmTxZIHgS8hcqz6srNKFYOy0Tm5SrIQZKGbKZbZ4oVpv1IqC86K/nzXCIztfsuLlXmBrhCklLdbHWrTRVll4Yg12qbD7cDg3w5UZbC3G1aVCZKxZKWawko+Iyt1CSxmPGA0I9JSE3Cfh94sef63r+I0ZCw1qZ+Mva3l5J2nUle1NnLpTStq+2467XvzdnwQsIp8SmbRKZWWt+ZwovOfbq0sRKLLKaTIDDxebTrjiOvvOqfi43ZeVF6nb3+fvGlWjzrVbnU19QduA8++fx5J6hMD/qWTED6cKoeb8UfCQiXAigsxruNNw9fjMDTA7hlyZzezqpesXUkd0kyzaVlFD9QvMV0gD7MfiuegYGkj5Ag2tBJ9smN2JD8i7ZF5xn4u/kUirP8OJWXHkLGbDoC/RPa2WDLi5XYybZWA23efReT/T7OTmWhCWB9rW9LDlxG3e8ABe4zaZjGujYH+8Kbx1AWne1ogSZbSvsoRlnoB9ubPKYmyIx4ONuPg1W+dncQiwo03WXtMjmd/cO8ih9ij7BYX7ONwHxZLW32FZo3jg09cAdGebCrCcxx86/rzb+8vhlv8IFEZ/Bj2jRB9gQ3mXCTCTeZcJNp3JtMjiM21VmfWttrUoTBA99PkkCx6Zq9dpTkDRKjP8vJYVzbWiyzZDKrN0lES+LrxT8J7eQ3MnwMLN+b40Jh+ZZ0goiNQ3DdYxNuMkgNAQo3fPDi0A23zt4ZYCXaaf9Mf5CFWUpY7ie/wWrFXUKhf3EiQgWm3vGhTfB3gUr20FqFRp4UaicR7HDAOzSQVg0EIcUj5D+u6s1B0h7Lqm2Y7rhaZFtZjiWNHQfcmDowI8yx4qYMrxeUeBWELQ+YTrmqvsboZaogs/QvNY5Z0Y9Z5RPdPXkSNZlJP0V4FOFRhEcRHkV4tMXMwVpMZHwoaTkaQbBUkb6YUJtIV4mzAlLRAILLsVvHBaMqOnZcRFXRqE7A1dFJFmGkXsFIzXS5Xk9PCn3VeysEYtGCEJM9PCart8pDwLN1LWiG1OpLbwm0rekC4reI3w4Ev9VrMkK5COUilItQLkK5COVyKNcYgRkfqqsJbRDglQO8uXSjThnsVQxnI3Rwe7dK88WI2G4MqK+kW8fGfCVN6gjxHZVM+yiQusE+MdBSbWx9vZ9uDyVA5O0YyJtatQ6Du+nqb4q6qctuDXPTNB8viUNMK4dpqTXF8JY4hIgQIkKICCEihIj2gYiMQrYxAkSK9TfCQyp4aEvH28lSAWc5YKVj2RqOUIpCxoYRlYrrE1ZUatoBMKPRyLrPAjId/BPGkuRGOSxMyUg5EFs6NrYkV7XDY0yqdrSJNcnr6ARzUnQHsSfEnhTYk1xjEINCDAoxKMSgEIM6EAZVGwKOHYuSrNsRkzLEpJLwQglOlQa3CXBBte/HVfB4swkC+vg7Es+fRoBNSXp1ZEhK0qJukKhRCbT7o3aRTx0FX4lyCn/U9PL0FkReI87TgrTUtjycA5190DIEyY4AkqmV9yDYmK76hpCYuui2kDBN48dx3LHqFfAc4gFxM7V+GR9CrEpwVv0IDwUi2oZoG6JtiLa1iLYZhbkjBNkUy33E1hTYGgjepwPmhHzEnCUMGSBqkpFsD3f5FMKd26ND0ni3egWl8SYdAksbukz7KJC6wT5lqKtgbL1nbZkrAQJRRweiCqp1BCSqVH+rUFSh7G6wqGLzkY2FqJIKVSpoCrKwEBdCXAhxIcSFDoULqUK20QND2fobkSFTZOiFjVkVGuJj2QBH+IHEn55WPrmN6fQ3fEyo0J3jYkGFpnSCAY1Edn0SgGpwTwrrkRlR3zEeA2EjtnN4bEemSofAdOT1NsNyZGW2hOFIm4vYDWI3KXYj0xDEbBCzQcwGMRvEbDrDbGpCrPFhNZV1NGI0cozmkcR0KqEj5UQwVDBT54euQVj/zvV8mDff/jonzCEMH5apdOm40EylOZ3AMyOSY98EoRvkk4JqVIbVd7jGUPAI2RweslGp1CFgG3XdzaAbVbktwTfKZiOEgxBOCuGotARhHIRxEMZBGAdhnM5gHINQbHxQjnSNjXCOHM5Z0sFyXuho0RhADBdVwMoQtgAHXD+swpgsxgPqiA71A9IRjekU0Bm8BPslBPUAnySUUzSnoQA5WpEjjHM8GKeoTocEcco1twPhFEttGcApNRnhG4RvKvBNUUcQvEHwBsEbBG8QvOkcvFGGXeOFbnKragRu6oAblw9WDrYRw9cg5E+CjeGjNUltx4VpklZ0gs8MX1g9GXbJkJ4UFFOylb5jMHrpIvhyePClpECHQF0qVTaDW0rFtYSzlBuJAAsCLCnAUlIORFYQWUFkBZEVRFY6Q1bUAdP4IJX8IhmxFDmW8iLGiOpYMlwNwvE3bvBIwtUmUk3gQ4NQSh06LpJSakwngMpoJNj9LUqJP2twdxJ3Wqz5jUuJ1rQDpGExEfGXDYsQcm5YSt77Nx4akHXDQjYbb9F0bOPNQ8MichOufslr0BgaaTiaPtUX04JvUvudkwIf5bPMcO6TQ0+InhA94S6eEBH6wyP0ci97CKBeVXMzvF5eakuwvaLJ47jpMA+p8fsNNQ8namr2LJ97jB6GGcboweTebZNny8CdQZNhAI0eBc9v1jPq340ezHlxw4K5r8aLKQ+3RyP3BMZ3UqYAYPLHVPmoqHwWqlCW8hJvlvyhfhSMbAY/1I8I85rNVat6KUCZ/4eupSC4Gf+lfgwsawY/NB2hNjWDH+pH8uBs7m9dmdycZskfeDco7rjhjhvuuOGOW3s7brWI+vg23iQhMO6/yfffFslQOUs2VlTzSqPXYDPnNl6F5IbMN2FEA++fSBS5jyO48UHareNuzUmb1MkG3chkeghwmg2Rsiq4eSWyeU32I5ens374q10e5F1AwCb6UCfrk9oa0dn6kDZI+q2DCEcfHo7WafYhQGl9/c2gaV3ZLQHU2uaPBaZmnUKw83Bgp06rdoA82Wsz8RtBNQTVEFRDUA1BtfZANcMoeHzQmnJRjwCbHGCLYMCoCogRc5JF1UweXTdAZm6oHY4PbJP16rhYm6xFnUBt4xJoD8VRM9QnBXRp7KzvyQjMNQBxpsPjTBrFOgTMpK2+GcqkKbolkEnXeExkgLhRihtpFAWTGiAahGgQokGIBnWGBpkFauMDg1QLb8SC5FhQSMdLCgXJBrIBcECjDOqjN/P4OliMlINV28XjYkS1zesEMBqx3LvnyCzIOn5qcCq0E/nvItuTgqtM7X84HK0+6B/iY4fHx0w1+RBgmXlbmiFnpvW0BKMZd2scvC3mSZC1dTj0zVS/jBlcTIIz9hPZW4jXIV6HeB3ide3hdXvEyeMD74xCBETy5EjePBk8xw0WjprjVTvI2RhkoT7AhMWBryaQKOf2MgnAzhTHdOh0e3Um0RRub5fS1GS267+424gbv6jRhjtxvMDZ0MH3LyfS5aPCMbEi11ShPdok5vGkJfur1fpSPmGwwtNikrSykoeLn0xsNtqinolMHC8hbVSn8oD/WC1hCnB+TxXzloTfvDkV0fuAzgfkE3viNZ073QeffDZ98IZEGz/+UqythD9w3Kja9GQY6fRAn5BiKdkjTgJO6B8qIhd5VTTsSlFXz8/PP5IQpiLLDaxzj73GR/Pc4mpDI/ukASV47Z5Fv/cwua/EaunKgqWktXr24pgsptY9F8z9RSTMoojPBXRRwGdoWgZ1MAu73LqST/lELNrYFzdcpLW7/orO9mKG94KAhKLWe+vy5cmbP5WKcH3q/ujigE7bYCOwLFnD8msxsa2P9A9aTrjaPD5Z7GXyjYSlAthoQWW0waEVbdZr6lYX1nffWeRX+uecWv3ch4Jgcn4ipbfvuQzvqRWAlyU+azp12Y+0MNYsOuURa7F6Ad9H3Gf7dJ2LxHfkvMVUWP2UGeAMfpwpZshXiZFY0ZrMvaU3F7NWlJlD3WZB5tJYWcVmyXFhU0z4hq0idYhw5gW5SZs8ehe6QeSyFYBZ0a0h03XbT+y3dIupK9T438rVdBB3FmstrBJEh0Vq0zPlpgXqYOc6OGilgv8C95k0yHZam+134c1jKIeGCbQwTWl7aXhZg+u33VCtW9jwy3vcPTf1HLSiY1pRNzt4xrt37e/c5VVy0rCuup25Yl1n+2685YuRY8K77awVmlXFRfffOTvQrpmoBmxJnQBWmbX3rPGumnxHbYfdtGPupO23iybdQcvrkdEuGUhsBj9qgFV11tcK/PgpAQvukwDvfkpjbd86f3BDcm7BYFBHFFbi4WJMeM8fnFqbwCc0hn4hFyHJkAhwKuGqDFhC7DmlwTMP2S2AJSHy3kJ1Fl1wxDBVz2mo/uiGEL7LmpCLbu+Lru9V2Q8nLWPFn4u2scj6vNSIrP9liDUZDes+Ddfts8puSmEqTPTxqnY/P+d6zRcliu37GsChshmZBx9yLakDIAyAiEpVElBCUqMGmChUWihWA1KoN5E5aCGJzHZC/432SsoOhLoovf+5nJhuhRN/J3VKl63vA7r0cH3v/7T3bc2N40i67/oVDNeDpFk1+0zvOefBG4pZT116vFOXDtsVdeZ4HDQt0Ta7ZFFBUnZrevu/byYAUiAJkOBFsi7ZEe2SZRIEkIlEfl8mE//yaihUOumppsez1WD/JrG3vbh5o8B105j1FuLVjWPVTeLUrWLUdeLT+tBhxsfH3fqXMIiDoq7n47UhQ7LycixdJpXav7noae1gbo737XUb1OwgoKkLZrJif4kf1oDFu/Tis+mvHgzo2euSzNtd6lce8TExwNlxd0gEH48K7T3n5CZyakE8ueGdH4duuHIaVyVVLEH7M/zwpmZlSkOMicLw77HBPzuRBzqgP38LHj8zpb9qLhLNItg0pbx35K9C4MQB03rsYj0eHCutEMamyWnlIxtz1IrWdCiwTr1eRR/3l7BOF34la11Y3pV3KFcjkd7dk94KlTTivlPhj9NPaghbkP248M1Iw3ApVGCs/PaoifV9pbg74Z1rc85DWw/1iGCuSzDv6VwSz0w8s/49qCzRrPLea/DNPLk2yzdXr5r9estHmy6847wzQDdn7cSOM/xHAw5RYjSOj5HWDP6YyGntFHTIUx+ljhFFdugUWfOlU700iMjOcVvlppo4bVqwHS/Yg6O3y1fQppnuqqc3Jr3LG+6A/67oOVHhRIW/IhVerp3EihMrfsCsuBGwJIK8LkG+/9NKXDlx5aZceQUqqEObJ/YqQ5zXWk3EoW+DQ4/XInHyfLpGXI1oz9VVkNaxEnaZ6ja0oesVE3pcZL1yAjql6klnif7vROmqlIrKf2yJONcbzaOnzZsq+gGSw3ot2Tw1XPbsFsSwvtkuKniUdnsPWGHiYLvjYPWaUMnAUjUNqqZB1TTU7G4lFiFutz63u9+TSswuMbuG1TZK/fmW1TdqLCOqxrEVRncF0+CsTxcQsmKErkJUramxHFQniqwrWjfX1PHSu4WJ2BjNS7pMdG9nSmiqZET/vgL9qzauRAO3XAAHTgertWa7tLCuDx3Rw+rmu6eJNcMguvho6WK1RhBtTLQx0cYd0Mal2Ibo43b08f5OLtHIRCM3opE1eKBTOtloWRGt/Bq0cmJVtfxyTnZNuDmQ6cdg/nCxnM/h0g9ePHkkSq4FvayYz6NilZXj75JMJoUlDpmVJpqBNXdi/8kTL3NG2if589j4rf1m+luhn0Q/b4d+1htfqtmxA0vm8JhrvcJtnLAue3Rznlrfaif0dEmn97e0RXFZUe2JDRDZet0xKjxRlNK4+BWdP0jUN1HfhtR3JRIjxrs2473fc0pENxHdpkR3CWpoy28bLyKitbdBa+P8zkAeTsgF4tyjRJDMVgiqPSXIGY4jqSmtGvoR883JBGyOcD4G7SL1qBI/VUwuJ44yhogyfhuq5KHzpRkt2TJhmnt2V4xpptku6gGX9ZoSeY+X/8xoAiXw7j+f+Gplbav9W+LxWvJ4ezepROQRkWdc0rbMoW15DlyNdUTFbF+HzONiK7J5XFYNCJefvfjbYzDzLmM39ii1rzk5mJnIYyIFcwPvkAwk3SRqsaGS6ZSIckO3QlCqjCERkzUV+uAISZVWbJqIVD+zMQGpaq6LXE1lN4lxPCLGUaUBxDRSviTlSzbKlyzBDkSw1iVY93UyiVglYtUwQ1Lpj7dMjTRYNpQTuQUa9cGLnRcUhBOhJNDnkiXTgJn64PozdLXe/zbxmKYRO9WcOS1M5jGxp4rBd8igkp4Si9pS2cqUidjUrbCpOgNJjGoD5T44VlWnHZtmVvXPbcyu6prsgmHVdpdY1iNiWXVaQEwrMa3EtDZiWiswBrGtddnWfZ5QYlyJcTVkXLX+ekvW1XD5EPO6Beb1HmTh4L4EplJIA5SlIKEWzNbZXRDG3pR4rfb8q5jKY2Rf06FvgHslDSXmtYGi6RWJWNetsq5Zs0ica221PljGNasZ2+Jb809tzbZmG+ySa811lZjWI2RaszpAPCvxrMSztuJZlXiCWNamLOv+TSdxrMSx1uRYc/55Rwxr6dIhfnWr/KrLZSGxq0I6DZirZAPvgLLSIfRa2L8enZncvDUeM4OI10/vkErcT4G88vQqpq+aOXtjnc/F+ouEw43O9NQDt2P+wPACrlsAXwhiRtbAtz17lGtigaYVWoki98Gz7hHpWHMXfh+O0LuPHoMlfIPLv+8402B5N/PAfwUzG02gV1PH6ecafHZD34WrIjQg7nPgTy13vrK4NwMeEWsdrcz9zJ/EEe8mWgw+kn6U76Abwg0wn1EOkVhXj6xTkTe7h26sL8QNi6GkZ3wiWD7AI7+soHGwgUGuDX8+9SeYZ88IHtTR1KJhI3cBjFV8w6wmTAnMRa6RfqLdfQv9RNiF7ENQfo2R2iFWscZyw7XlhSEMXOi6Ey0Xixkj+QZDJZwEtR1c61z/eIgg2opRua5NWedRPdL55qYcNNyf9JNB97m+JpAN+g5quwRh3cEanjx60+UMNtx78KXgqv7vefJwaDsOrkvH+aNvPfuudct9q2uwUjd20sCA/TpMZ3owSYbF/3B70lOhyjZjmLhz5nzCMFAVTMdw0uvV9dZ7tbDUdQ2Cv8Z6vSk+Sae0Y702j3qlLNWBMdw587RparvwuBbcc76t3Sedq0jYWqSBgsI2YNpyqC9auC/zgWSUuiJHMiIz4UlMKaXhcXHwZpqwc4og1mhuiRodKMaE3LHK7A/OT/fvcQpmGsDId+78wQuDZaSa6EM9tCM36GPKbioMvUNK4qh0ae/Pok0I1oYn0PLNg81MqxaE/jVvAnmJFrcLlWnRgkw9t5oKlGOLBpZLf9pmHuPlXYvbJd0rjwhVdMKNPadkHOVNtDR1elNGx83kyCr1FkqHfJNhJcNKhvUQ+S+1xds0DaZ7auMMT3WDHRyUpOnp/p4qL2eC8LPkNRcmWlh9HV8olRei5a28SOhr5XX5HJOKLuIkVV6GFrF6FGD3Ki+SrJtBg9yGrS+k1NyuUnPVq9eIhkuTdpIPI00gijU5DlVsS95tGScf1JfhAhnjD/WfxdIYT1QOrzKBSP5F1zMUypj/o74EV8UYf2g6DethjD+qs5Okz7q2+FIYJx9GdOIYnThmeuJYKVFHacN104b3dzopbZjShk1PGdOgvpbnixmtHTpZbBsBxWkiCoelJ0agJznpNIgJXcZB6F14k2UYAXD/xLNojiPKqBz6McUaNRPQYcTxCLXrAOhxJiVt83jAYWTz1u0HrkrO4u4nOy9nU7qyqRpWqRnFhHLUYpnBo8jQjqv+wfH1Zdq4ada+/NmNufuyZjtg8Et7vc88Pn/phljjzlnjMo0x5I7ZLWPxL7GYxGIas5gGzj9xmXW5zH2fVGI0idE0ZTRLveOWvGaNdUTs5jbYzQgFAjMtJJK80AeqoxRVAzIKayRukos6thq0qvk8JvpUPf4O2VNSWKJkO1G5CpWi4rRboV9L7CVVqG2m5QdHipboyKY50dJHN6ZES1rtomptWaepdO0RMZ0likD1a6ULqH4t1a81ITs5hVuNQIjBrcvg7vmcEoFLBK5hJdsyP75lOVvzRUQ1bbdA3qKIlNytSk4NmDAwu7DGl5P4bD494ozVymk4JvrVYDI65GKPXAP3PrVv6i3ix4Zv+XeudnXUirJYc4ySqRGkjNYdUPuDI2hNtW/TbK15PxpTt6aP6CCz1Xg0+5vlylYi5bh2z/ya6o5RviuT0pj9pFxXynU1znWtCQ+INa3Lmh7SBBOFShSqaQ6ssd9dJx82sWYZSrXhCqPs2G0QrJNEOI47nzr6XNlKIfIxT2awJi3n0pvdf/Pc7xfevRd6aNszv4G9Xhcf8O7TA1QGhTKUpVD35bGkPKT4GoTsxf6Tl35Yo/f0T/hj6s3Wlk53AI48BpsN8lL0/LRkpZXdN8BB2o67WMzwmCToOpZ0svi3sRt9B+cNhznGH0NzfhFnNbPRsckEF9J3IxNTPYK5th6DFxXDI/MEf2Nl6Muv+eX9hfPty8XfP3z88q1qPs+lPregVzXDhzF999bFNLFil/316/m7XR5qYSgVa8RcxGVLS54mzcpKZ0/doDyj9bgnmOj6C1E/m9WL8Vw7vczKwA3QVXGHpvicvBeVYBPhr9rS5ZqjN1CKY/ZTvUGBgMbwv/qPMPdj+N9wnxI2+0MQgoskWWYQSkGRzhEC3c08pkhZJYUtGPxyxxFrrermnM/OLZ7Pis/AzyaRFCZhSmNvHgVk/273pMyZH8XXuedzt/Omk+ga6cTOxeXwCLkW9awri6xP/UmM7YAXBY1VhSGaKWBewegsUdHBIz1LlMxDNsIj7yS7HS7dU2tULwomi+P4zkDUdJqZtqrK48VS8OUH6YnesP3BD+wHF+PQahf/T9dVR+PZgDrKs7z9qT7z2lb4Po0YbL0dqLrH4EJ+yi+Wdp9LRKI/jZR33NBZj63PejxUFRU9km2d8WGS8m4wxh+jyksNi9+nY92JtbI/vDQrgpfE4psUCPXis+mvHgzo+ViqzkojfkUQn+1Gl1j+eES6OXfXTSawhc/rhnd+HLrhymlc1lKhq/Zn+OFNq+tc8g3tGQO/7j02+GdAlSAc/QlX8PhZLc+7rg5rdJRYAWIF9rSgb3F97jaMJ7vWkV2rWTi2OF7iF0SnU5WsJBkKimdwWptCT/aRo9D7dERVEFVx4JqaVKMsGtHaxEVqbMbpp2oKo2B3xoVvqhtRmqKx8ltiSDqta+nB/KZ7zDgDPRqga8lHPT7uRDP4V6RRtD3qklE5SpkTCHldENJCs6s1lygXolz2k3Ip34KIfTk2w1ePiCnXHuJkiJMxR7pGXiHRM0TPHI/Sij6WW1kibYi0qSJt4rUGOXkCR6NdjXD96ipI39gUXiq9BdGGH1JM6KuyQ8r+dMsNkQ7tEt/UoRJUCZlIFCJRaInOrk2s/w4RM+0sRF2+QT8lx8c27BNMqtzVCdkTsj8WlU1xvd6a1UL1BIfrwuGVE7OtXhQhEnJjaFghk9Y4JuceEJ7pChPnmtoZbFzo1+YwMunWvmDlBkphKnTCzoSdacnOruvsEnuEoc0sRxssrZ4iwtT7AlBKvQDC1oStj011lRhbbeUIa28Tayf7vhZ054TUBCCBUD8G84eL5XwOl37w4skj4aIWmFsxn68JtZXd6RRhkwLt+EsP0QzMHiuhLRKGojanQnWiXhXqQxCdIDot/tm1waay268d7IbpqQn29ZNNWfqi00W57mUafaXrQmwAsQFHorEJCaC3frWz54tWYlz8irLXO6UQcAHMQH5OyAXo3KMEkThQCLY93ONe15GUIFANfXewfdKfDYL7Y5D27omrShyElgktHwSuzVjU3Q4511jLrdBnZkooxLw3nrlqpyQwSWDyWFRWjSYz1oxCyVvFgS9s7otAkMukycFtXvztMZh5lzF4RRTxa3GonzyRr3m4X7YfnR7yR7qyo6i0ttB1QiUUSiiUluTsusyq7zSmNbEENQ+1U0wBYdgdPutLv0sTdiXseuiqmhxPp7BahFU3eZCcFzsvOONOhFOOR8rJImgANz64/uwb+Gnvf5t4bK4JcjSHp4XJfEWIquhLlzCV9GaXoWoj4ZcJlyArQVZamrPrKku/07DV1CrUg666qSD4uruYoGL3JghLEPYY1FX0TmfBCMpuEMrew6Q76G7BRi2mHdS5IIoW0OTsLghjb0rApD2gFVO5A3A27ckmwCxpzO5C2RqC1wuWYCzBWFqWs+ty+74XILbcHjSDsNlpIAC7+4hAuWMTfCX4evjKmgOvWdtF0HUr0NXlky4BVyGGBiDknTt/8MJgGalEdqgviuYG/YoAs9CTLgHmUcl2czVSYIm6Uzd2G1ZG4ZsE63KrFrhmtGgC0VWL24UsW7Rw5wGoDZ04+O7NW00FyrJFA8ulP20zj/HyrsXt/tR7YhB6smpx1i/LxHFKxlHeRCeWSG9piPEgxmM/uQm1a7DbRbxog6INijaoJhScerVTFTnR6cSwGBzczs1k9XVcaJUXoimovCgpulx1nbysDbqIs1R5GS7R6lHAQqy8SFpuBg3yRbWPxfxK0SiRp0SeHr6yir6pd53a1fsS6zxOPpgcWs8eNQ5VjJf6Bm6wx8mH6lvQdI/xR/WlYtrGE5UDr/pPtuRj+ReTkaBWjvk/1ZejfR/jD4MBg5Uf44/qSyVbP5Y+mzyDG/5x8oGqMnbJrU+TFekwEiECM5dbpA3o18s4CL0Lb7IMI//Z+8RZiuMg2JVDf0WaXdOfLsn2I5T2JhkNNn3aR2D1nMjmT7AfuJCdxd1Pdl4AtRBmYy2p0gKiQ4kO3U86tMyQ7zopuusmpB5VVSYJIqxSworbvj2kRwz8ByJJiCQ5FpUVPSyzeg0IE3b7WPxLELpLCB2hpECthaicxBSP1T5xA4SF2fObBFjH9pqVaj5fEaOru9MlRCcF2vG3rpqqQIWICX4T/KYFOrs2MPw7/RJWDfNQD1uXTAi9jrW7+KN6PyfETIj5SDRWdLDElNHbWRuEvyHMuxL9qgTSALvA/h/F4XISn82nRxxYrpyGVwSwBn3rEs0euUZsLnI09RbxY2fHYHeiFXWkTmiX0O5+4lJT477bgefdMB/1ALDpzFOgWXSaCXkfw8w1vQYC0ASgj1F9RW9N7WLtUDSzH2P2k8LQXeLwSSIxx51PHX1QulKyfMz/OZnBCueP73HB3eNswvoZTGbRCGY1yu/156A46MiyNxzZjp7ovvOB3Xnay62z3N8H0Oiw5PmZJYS96Bm/dFk0BYgVIpsd5HE+LTo4knNj9HYse6tTbiQzAd889/uFd++FHtjBU0mY3wAxLBeLAN/qgxlAGHIrW4zhLfP3pTvmgXWbDPcW18F8tkKLO498UDeXaRV6s6hhd/AFCAQ/YuuAK3qyJw+PAwVlAZ9R8mvIQkVoPQM0d4kG4u2g2D50X2oifRbz/W8lmd3Cs6aoqjAIaAtQwMSd92M8UsVypRbCZFKwj8EyBmzyDEjIjWCQAFPEHKzVHNw7+V1AnO5T1cvQIIoSj1847zb0Jr8LwAOk1yuL7TPtdX1YsBdLWMpP3vswDDS7Qv+TH0UoUrGFpC0nkA+mjH9z+x9WX90EAtRVsAQTgQ0xvMWmmakFTJh1wcb3l36Z9RIDm7P3O9PtOHn7qAY2GraYjFuhz6hK3jTtvyurMyiJhQqNmgtGkV8F1tu1ko7YlQMFv+TZn7ATZcVK+ivY0kvxrY34l3+EzUCtAGkL29CA5GFbUIG81b2EFZaxTMVBvLGuvrz7MniM40V0+uOPD/DE5Z09CZ5+5Nryw9R7/vEpmAc/wkDBI/jx33/66f8OTy13Ok0NGxqAxLhxo+IuFjNkEXDztBXPhO0AlPWFj9WdvbirCJf9Kkr0AfdAqRFORkzAdsVIozx6yTwXG5fuwtfKiqg289ZZ0gw/AApWyL2tegXtjXV+zx7L2KOpP0VTFy28iX+/QlKEbSAWfw8bTOGTu4JHgGNgeWAkl4tUsmxQPwBUZhRD5j7VQ9F1wJH3I9geJ2D+pxbjZMCYglpaAe8T83l7Ld4oTDR0nHzIXiIpWU7BSnRr23q1MZ2q1KeKNxgN5JC4RCUMecFdkohTNoL17AMUmGW85t2m1RwnmTeEdy0p8YzPBx1KaSA2RwLTFH1BJcKEj9KbrCYsn/yQBlSeU//R5Y9Q9kFq2D5ff1Z1p2kfjB7B3Od4uQA4oTQno4LwCnRgGkmgldP5yqmvvG2W0Gb1uIPuGD9NgpWxH8+8hlWCMCTU8FZ3+qsHqvjc5P5OF2XlwisP6NFqrNjHtr5Km/ViB1bv3myKZEE4aZaQArcJAXU7spDfOrkD//mEgYIIQ/vSPbcLcKyTyxMaIhpZy/nMQyjt9UNvzTbg4g8DmbidBcECSTKRN4D0LIKCFcsgAMsVo0WZADZ5cENEJvlHI8nGUEKGznojXfY16Qlr8kT0BSmG2UnuweuxytRyMmrr1ub4hj1KsbhrLuFEB1W2zGnLuPa6j1L3erpgcJUJVlFhmV7n+C95IlgkquoBdUPVeaM2Upt6BS0nSVsXI8s3Xh0OzN9RGbcu9r+rMLZ55816XNlNjYHWh8qZda6sbMeSe6ouSi2u+sqKYK6B6OsEbLuX6e7qplboxSFlH16qqhWLNYnByivcKNDKNG7MfqqDoqhsY/yh/nOqZuP006gkj8Cb1bevJuYrb7pqGdXd1Pq2Gr9D2l5L0/UWSoxooFgLVfLW5qTkx95ku9fLcDiyTs7nz+4MEzTDh+WTN48ZQLWtd/AVRmgWMKrTf85PrH9m7jyxrB+sM6uf9KfPuWWRI4Y0PbRi9UVNFuiFnXE6+n/RNNkXIxHtoeuna1AeVv8vJ6XKuTfrrbG+miy/XscGutQ4lxjmSqM8zPi7Gn8nb2FBgZmjzaFY1t0+m69GyNOgP61an5pUomHeuc14x1JC5KkilPUuwJCZP5/MllNPjgjjFsOWyi3eesuSa1DbFW0AcnphzdyBYL6zkM0iiHyOHdZLdupNl4z9sRVj4/Ni/RuMXO7+aNjTXle2m496xolLw1JssJ7zltF6OcFN7UUIYi3FkFyUaQdsDkwdBkwHQ2UTaO4tfTJY8oQcLtY8CJG35jnps+QW1yBfeU/x26GdZ/ozqX2JsCszKmvJLGUMz+c+Zvn7//IMpZaMNV3n8Ww1aD4GCYAn9XQboPqfw8Xkk7hdAe3lwGZJ61ISVc6oKTOrsxOl6xrfodgv2YzqKjpBYdDSu225RLzesMlzms3CThsoe0i+gHvZg7JTnHuY/MfczGZtdLF10z1FwYeAOAdijrGisI0//vdgaJKJXGBW1mbhwZujyfDWnYrTi9Xqz/+KCuCwjTZZQclD0r/okklF4gO/W0sR8Ys+wzWDfqbKnvAXPvE3j/qa1FYeChn3+ULuqy+SCynnSYvyxZ1m2skuTDErObPrZbMT8jrWKxpCvHt5l3pZ6RNth6cZylZxmE8bGRRcrvT+7Nhy/hdniNEB+wXfzSrqQGI3ed9KLWXp3l1bAEKsvFq5bAvUl5bO9qhi/xkWEkba5yy3zFdW5SrzhBpMRGYfGgToMUKY2ftYPjLsoG5klJ1r/WlkPQYvpxWA4m/BizKJVL7ml/cXzrcvF3//8PHLt2zCc5pmfS71tG1qgnrkMJzv3vrEGmZpv349f7dLo6wciTqt21yoqvCYPCsaPyadrGJD8uTVC9/BnJakgldNWj5JU3l5zlTKRskg7Vm6XGEscc7H7GfR5MCUjuH/4h9gtsbw/6jCJCkVIeO0d6IIw8J0QmtZh5m1WNWrNTjZVrd6BVFkpxTnuXq1nl+9vzi7Ov/y2UwAAulBZ+r2sLo7Zx+/nf3jUpvMiNsh6xI4UOnnwX0Y/Au2wKtw6fFNjuc765ZOT7UQTs0Jo0ZVCBROxP6+tvz6OZZtXp9umfWy0UoZ7XId2pTJIAXdTCrj6xTnaJPr0zLfp23Oz6bWQs2EQVoAG84ePEATTgtRsxDfWF//n+U/LULYgTCqcmpNHr3Jdx6InHs+ex1HFX15cSPLneDLSvMYpn6Va/UBRoYJeA8Xv7xNT9dkQdY6XO8cvkz0UPC+Ehkv/2WsTkho+TCJZDZ5mJaA6yy5rpv8v9IIVde5de3z6xqUg6lIqjNMrHPUzKE2jsHelc69nFun9supNjjG31O9gmnmL6nen7z/bYH2Y/5g3QfLMH5ULlL+6nhlHsHIeoBO938XWq+aiaHtCGb9j/6JIlfOPF/OOGfOPG9OH35I5VVV3EctukbJJs2kCP5MON0BIZrUZOkZLKjGyW9GCXAGSXDGiXAmIeBuEuJaJ8XtjjrvuiobqXG1/chGVkvy2MonvnUCW30hRB54SlopCMdOFga4m31M6DKVStWY6kqociEcSLZtjbytXvNMrDSzaazPDiqvJJUJIDeLsVYWd5KLOZUcJmyWaNB+wFsbTk+bFJTdRoojSTOAtLmDu1/hKh857r0p+c9KCr6AomNdpKm7wJKoVtk9PUC1WHTmbsVusn+NpFIwT7Dg0Azy6hKsVutkgi9siUqpbC7QiuP1PzzDs1wbGrzwZt6zy61n0hiWzwpD6Q98WiO71+OBjuQQMHE9duYMBwC2OhE0VgyZeXEwT/JOwuFp5Yu1DuqKcw/mcYI7DNbh0US27pegXGuOIamB94F9vb6MP+UUM30KIa6XRx/8eYzhZFfdlAXhF958ivvNWF1sD78ravE179bNSJFd++QFy3j8f0aoQHwTi0ryK99YbxlfAcbxxes/84opU4sVJAIZzoIHLKXlhnPumPCyKn6Ya4MV1Xp0I9gQvbmVzinTeJ61ysu8hMs5NmTn7fLMmw9wOobWeGz9r6Jxgm48gKxFP9T26f7kLfaC1SRmS6n/O//wR1/ZtVVaFAarfp0o2zz569cr69t76+zivXV5df7xo/Xt7Pzq/PPPvKBeDMqOyyH2bOsfwZJVbUoW+AK2TvQuNA0nBa/stEe3bAEkwlj3jXV+3W+wOJhhr2l2yvJ+p4EFE+3hqnTDFbM+6Jkw/cKORwHOTCpRLMMz956x2tlksgztk151rmhi3bI1XDDfWLakn4MXaBl6zaxEvESiy7plin7Lhsj1OMllxsxlNgKpiUf3Gc0JDAjsfOhDN6eW99vEW6xr0zx4ccRVZKp+o/Tzl6v3p7zgzQtTQ+b3QaPrhsSUC9VhF8Bznr2sOQ6WD4+paJhg3BkWiltpFP8J7HsEH6RGnoIQtw/PDdPllHtqMhnY28eVeCMXPJXMK67xhMkP12j0Ap0JXvivq/WY1nPBLQuf614a7XYcfw5W0BlggTnJXrF6c86v0bo+2Lo43Vj8dV1lUbpuMLTykQc3jsMf4GH+3JverB/tLmHAof8vuIc9HLlYY4YPb3bWLUT2Wfr5phC2z3c392TNOI0GIm0nqAODzASOerlCfKc1AiTrm3+NgnniNcm7C04Y/LYerrhmncOEd9oYEo0GciOSo8OyKuAG8RdWA67PvuzLV3EGqf8YvGCR8uRqOT1o3cY1u+xGTqxlf1dlViWZLpFIjVC+FsX7qHrPSchXtPsQBOAFOKwm/d3yno0e9/cnN7ZFPc+r4L8iOYEluzii5QIV2GY+e5rybzPBCjENdR6j6CuOFCbouoIzX49bzicb1bpLkddyU6g+1m5qdG9GZCcqk7IkUokUHICBEsiToSQnFU9epyUpHq0T3rCwellK7kaWL0/2zUcZ0E9h9WFZiGqU++sZTnxaPvamhi1QBISTdGM2Z6c6lRBVcRN1yLEl7JwFRcwidCfY32jhKlYVx74M+d+f/J44O7k08z8G/dyffPDWhieK0nvwEN7aiRgSIjEJD5yo6gLiOQ9wE9sZ74JnLDgI+6aXQBWOyJADQArochL6C0WhxAW71uFVDP0JS8YqPgwwjDcb62fpCv71PuJF9tuvl1dfPr2/yCHQotfLBB560XImEvtTkCCkqvQBay971vSwCmU31oQNaINSI6wfLBZAs94Gi1W1dnSoIeZa0ommaLSFW/6MsmhcAfkqTRSD21icSaQA9YEGA2X7xQ0j750/icuLosuduuZvCPdvymufcwdOfnfFGZSUS9e9BlcWOOvzbjHPR+5hyezDvGfHIpq4KY35ISfML2QYGOy55hFsa+dX9nbU+9ui+1fqvOX29dyOrnglVZQA3zM/T+Wp1fPSWnpodb2zRDJp3e1k4tkyGIPupy/uCJbPSuxqcmrVaUWJygY+nHzeb66g/qmVeY3tgXfKWdz9lLzSNpKEwjjwklsyERa5GljVDTwBSSIWd8sxk/ZbIY+9dsp22wvmE8z5Hy/k701btzCgp0WA5xcgxrg9RKf4bgXrhAV3pfe17mLn+c/ubPHo/tmZgxr+GrGFk50Otf/x3Z9PxxXtqPaFnG2pakIYFr0PZPTW61qnpJrs6nraZe/9ahRR3wBnojMvYo7XBHbhbyUNBcF3f90B/mtJ/sli4SRV4NOb5C9Lbl3Gj+Nyl5PlG6zPubDxFm1NncKGJ99lxwF3fh2mniVVGkr802SnRdnW67h0p3n/8aV0RQONuh6vE8KdEFd57SEoWmg2FEVDtYek+ZotF16+HoON3OheBZdxiEEpzU3CHxiLf81uHKouywKVNNagiU1e49TdrG1k9q/51rhVFbglF/PUMPK5xzGySpkgG4er032hEuJ0xzgWykAh+TTKs56NQUVApByiK2MsZZuEBqAVdF9/ydpNGBlWv5FDhS9eGra8TfQ8esQcqFs5VonxXhbY1jQ2CcLQm8Sz1Tr0yoKQYpox3ivixyzUyIPwmrawqFk6bruMS1BJtOwYzrwW6FIR+AQMFM3n8otYADJ/99uk7yzVrqiL67FFXiyaH2B/FQSNJKZPoO/r2b1VdO7WuvMmLg/L+5GiLX5mF/fxbjFOfivtIfz8LnjQ27PP+FQYnTdZKgigN9YTPNMHaVqRjx/duRcso9nKVgVEKmSkXqqC7GBLqiyBxWCJ6xdOP5tB1R+ZsmYseq1QBFWVs0/ud2QMsNJ0otUsEH4rZUOIWRGZljBn0qFt65akCD4eThMGL3NWVY+H84VCw59wUMtwzsLrimYy2QfWd0wAc0N2hDM0ESzDiYdNzGBCmFHwY13ttSf/4RGPsEN9W7LsqHA5Z+k0wT34+E9BuGKpGEEYeSP+IMTNipbuw+AJhuezbNREhXkyDQqfv7kQil3HLllP/JPCJ1VITJkaqGhqX/ZzoQCMg0Ymm/tSxxUOqIOTL9gd9nqqzKyKqY3w70Wf7L+5EcspHgiqXzOCxmq1IdXKqRcPtJhpV8caVk/LOtO0Em2rEzdiuKCCUzXSwqyq2/rgTLnjV1NflxGLsPRL3ysYVB2FrP272HvP7oIQNhz9ZbhFOLw/5TNkGqarNc9iEkaV92SfHi4mos9M2Je8+xXHHA/bR/WEd1yQZyh49f5e7WqsywaWR7szsNCRYchBXoli/pIuSMXrikeBnnyde+yFGm+a7EXMqxHRgUImDlsXbYI4F+zQ3m0EcdgtNWI44vp8CKcrNtuExeYnGo96XbLXCWvNhtc3OEBUT1Y3Jqlbk9OGpHQDMrqEhK5NPjcgnRVGtZpkbkou1yOVFV0zJ5HbksfNSOOhtqhbbXK4FilcQQZ3RwRvigQuEMCb4RxrcY1ajrGEW9Rxivk3ajrgELvgDks5wwZcYVccYX1+0JQbTKZ+OZ/53z02ZyXM3gin/90XvCfXioOCc9iLe+bMIuMRcw3xLTehECfsjRNGH67JQn5JlLsxRyECbARtufPYi8ku7J7YHH+l6kW8OocFY/I1ZIJgat3DUO7cpCINkmJYUab4QtSI9RK5tnwzTB/gjvApJZ6ScfPTpsUQ1qoMf1e8IJZXwSY0aBMK1Jj+TKlPnTeTf/E0w5+p2M5umM4OWM5OGM5u2M1WzGYFq5mTSIHNrGIyN0KYaYmyYeH99LpkQxnRUEYycA0v4xfMuIVueIW6nEJLPsH4OIxerw1/UAWxM4iwa4TNGi8C7EsQelJjYT+SJeUe14Db2dv2KHFS7jilT1L6JKVP1kuflNcPJVFSEiUlUVISJSVRUhIlJVFSEiUlUVIS5ZaTKA3cUUqlpFRKSqWkVEpKpaRUSkql7DyVUt6BKaGSEipfKaFSFZDoOuiTiR0UYj/SoU1dhYGK50BRLKjDWJBGYhQWorDQIYSFJIJgO7EhzXqiMBGFiShMRGEiChNRmIjCRBQmojARhYm2HCaq55lSxIgiRhQxoogRRYwoYkQRo84jRprNmIJHFDw64OCRLtigiCOtroK3yYFaBfJ1B4p2cNW2k4Vle0+LeMXueY+fpJhRxZWHV6dDKTyq21GD0Ka6Hc0JaarbQXU7qG4H1e2guh1Ut2MTdTtMvRuq40F1PA6jjodS46muR+m33dT1qICO3cNzhaCrwPn73zjAIZC+xyA9J0QC6wTWCawTWCewTmCdwDqB9QMB69VeDoF2Au2HCNpzmk/g/dDBe07gChAP3urHYP4Abc+hCx+8ePK4H6diqHpefFPz+AC9YloIxxOOJxxPOJ5wPOF4wvGE4/cXx5s5NwTfCb4fCHxXKDyh9gNE7Qo5V4J1fjLGTp2tsYFI+y4XTVLJg0omUckkOkmjZrUk1UKiWklN2S0Dlqsx29WC9SqhmMxZsLZsWDNWzKDrVCuJaiVRrSSqlWS1oj8raVADOrSKFi1HVFQriWolUa0kJd9Y6pdSpSSqlLQP2ztVSqJKSVQpqUNNK9G2dMqpUlLrSkmqrZjqJBkJ0VC0VCdp1+JAIqJQCAT97MXfHoOZh6rh7Ue6ZqbLNU7UEI86vETNzIRQhiZlaFKGJmVoUoYmZWhShiZlaO5thmaVV0OpmZSaeRipmRlNp5zMLeRk1mHHugDjGQkXQfgH1599A4PzPrEsVPNoP5B3QXCEvgl9E/om9E3om9A3oW9C33uLvk08G0LghMAPA4EXtJ1Q+BZQ+JYj4gUh64G4ED/B8P2C4UJsBMIJhBMIJxBOIJxAOIFwAuF7D8L1fg1BcILghwXBha4TAD9cAC5km8Dv/5zMoP8cy+Xw+Dfhuq9lNJlFNQsTiSYKSLwBsNai9uQhyTHHrwOxE6CzGZCdjJHQNaHro0XXuwmY31gf/fl3a7ngAEDhybGXq9AzE3ORIj8/llpJfB282p8Ld8d69gG8pOKGSwbDW7gELFqKDaU2QFcX7gO+uXmbhVKAUrj7Dz7ewyPzwuxfIztvzO21Gw1DTz9vnh1I0Do+dRbZzhq+O/aDF0sLT+y26Q0yUK1PNvBG2hEOSRtEOhDp8FqkQ376002olHZILtpr4oFP8haJB2agNsc7lLh6RDgQ4XAYhEOi5MQ0dMw01Mm3zwPnrimHpP1iqP+dO3/wYPXzAUQ7VftYe0uu0y0OKdrhWsi5QVIVZKqCTFWQ61VBzi0hqn/clNozoPgaU30tKL8Sfs2cAmxLBTajBA26TvWPqf4x1T+m+sdWq8yqSrLTgPSsIj/LwRTVP6b6x1T/mFOKZh4pVT6mysf7sLFT5WOqfEyVjzvUtBJtS6ecKh+3rXyc24Sp5rGR+AyFSjWPXz3BNB85KAR9LmMAmxfgcoeR/+x98qLIffD2I/Sj7HqN6sea+/P5qjscF1KOgKJDFB2i6FC96JByIVGMiGJEFCOiGBHFiChGRDEiihFRjIhiRFuOEdXxSylSRJEiihRRpIgiRRQpokhR55Ei5VZM8SKKF202XtQsetF1GEkdaCgEk7DCZ5expO2doKnqeY1Qkvr216x8ssnioqrRUg2UGuQ31UBpTl5ThVGqMEoVRqnYB1UYpQqjm6j0YejcUNUPqvpxGFU/VApPFUBKv93wkZtlaLJrZK96VhHYAyQE9245ic/m084zRq/W+/I2oH7lWGrgfoO29iidtHI0lFpKqaWHkFoqIYHt5JdWrizKNaVcU8o1pVxTyjWlXFPKNaVcU8o1pVzTLeeaNvVRKe+U8k4p75TyTinvlPJOKe+087zTym2ZclApB/WVclCNwx9dR62qIxUgpl7vTcl/1kUCTJnXZbkYBMFMhrKbem+srxH05W6VnNZkffPc7+umfIR3T94c5ASOKHP63Al4jIlRBwA4ZSw/tIT4+IdneKRrQ2fAJItsjsnMhwYiu9djxwAmJiLzIClsM0jPKJEvAInmYngMHBdxPWw8YehPvRtNBO9PUjAPGnDvZgWm6K34/vpaY0GeuFBsIZybUa6BM/RisYWb9cNcbtYc3ln8eZ1ZYjYsMVtcZAsbeFOIAypur+xc2gYzfGlAERROCgnCb6f5h4F3JT9W9o0LnJixrZU7MUrazx8pIRZ6AuQTQQ0Kl2exeuXT2SoEHbIW+JvjFaF8Iib2J8m9LMrochXF3pOQVNEeKvxSmzXKN4Cv8+9zAHSqHUAIEE2o1M0//sM60W0HJ1ciZ2sZLWGqVhyksWXtwlrxFvDVHOYNvkrmJnnKyHp59CePCXiPlosFGxDemxZ1+udc+2jr5NLzGCCd+U9+HFmYdHVqPcbxIjr98ce0ian3jL88gDuOHuIPD0tYoxH/+w/81h9PKrOSuP0WU4vStafLp4XCDfhdnRTFd+D+qYnCiPVzFbzzJyUhsYzCYBxFeCamuRd/aNIvhWb/1QWtTYkA0NyUFTjNZ9j4kQ+7CMLYQXrRKGN3VGk2xlOqn9ZNTe16GmAklVOrd4v+6JVfV5Va1VrtUmery9lJGm2oZ/ndNAKoNl3OvFY7Ko8PS3uLac5Mpsqa9d/10mvKr88dD6y8GL5n4Vj7vfhQTNwR05MfBfp2zjvwYq/gAx59jP/+/2AugVWYuqdFEIMXs6qKSUldku6yz9efd9claOsB9NSmLAmmGGtPzsjFbvQ9dSQevBjjPsVFJXzOSxHluYKbNCYwSaUoDfJwXBN692nQ30m/Gpm8P8IXUi7ZZJBOWqKN4+RD1xslztr5tFN7hU3a+ANUu43N4mTT2XSazAISTv6cdwY3yThg/ghMIWCg2LVl68S+UVki1ObI/hlg+idxFShNdjCD4l2PPFvcvjq7/Ltz+fZv7999/fh+LR7bjwLer8FQfglG8qP5fBQUFPwwLxwMbSdmmii0aDgSijEcqF7ByaqLZEDG0ufsRcmUjJMPyl6aqVNRlVqokZiYrE780dPvXzxxv/7u1XjLyrzMWbEF7frutsGtJP1TwPa6qHSXEdescRfTtVngTqOB3Ii8W3S6uxYSQGAz6ksX98HSJL081S23PGzMSkxMvi3dUDSa7sx3o7F40HWmBzfsrOo+u6Kv2Dq+e6vSG+HvqtsegxdNylP57J19/Hb2j0vljTB35SN4cVdRf2R9cGeRN9S/3VjegV/eXzjnV+8vzq7Ov3xu0g+wtOewLtjm0S/phjL5IP8iZS9nWJxHdz6deWuVuF/OJ3EQzCIbwH3su7m0z8IGIOxaYQfIPjeT2SgGy0Z3wv9yhX84GdbcIYb5HUCO4E8KKasJTTPODH2k5FfQxoyr3LFksNa/WX1BtPTL3luVzdhY/iV7mWypxhlvtGR/4fkVW9xfaCegnYB2gkPYCVBzEkigV5uXR2++1pf8akOeASDk04JnNSS/5bgwbIPFpv4LloiIT6UDTrtwc93HC/s3ypOcZRufkkK62hkqnGqEklMEa0in8KhvcToGOBKFEhuhnxp7huG+sRkfQOw9FT6A0ZBrOwrkA6x9ACmvkhwBcgTIESBHgBwBcgS26AgI006uwKvTAYkktucHEItMLgO5DEfmMoj8XaXbsL6qrctQ213o1fYVSvyEUh9hk/6B0TbZ6S7Se2Ot3MX9qeXNcWvs/Q/3oVU8fKgZAA==");
}
importPys();
