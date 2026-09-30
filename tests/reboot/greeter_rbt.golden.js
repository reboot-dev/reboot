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
    reboot_native.importPy("tests.reboot.greeter_pb2", "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");
    reboot_native.importPy("tests.reboot.greeter_pb2_grpc", "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");
    reboot_native.importPy("tests.reboot.greeter_rbt", "H4sIAAAAAAAC/+y9a3fbSJIt+l2/Ai1/EFkjs7rP656rXpp73Larj9fUa8mu9jrH40VBJCihTBEcgrRKXVP//UbkA0gAmUACJCU+tld3SSKRiXxF5I7IyB0vgsdwPrkIxnEa3kyjkxdBnCaL5UWQfonnw0ksPlqsJvTILPmPkP64f5w/Zs+/jBaLZPFylIyjy9PJajZ6uYiWq8Usffk1nK6i0xP69yL4kFDhZXAbzaJFuIwCfjx4uIsWURDfz+l10TiYhfdRGtzHt3f84DJI78Jx8kBf0HOzIAxWabSgqtJ5NIonMT2aJveRKBXEs2B5F8WLYL5IlknAjQ7o503EHwcpPxKmQTKLgmQSJKtF9lKqT7z2POhNkkUQ/Rbez6fRBb1tEf3HKkqXVFc0lW0bB9erVTy+7gcPUXATz8ZBOJ2qmlJ6na6L3hkug5C6RlXexOMxtZ4aeCbadhaEVHDJPadvaSDCWTCLvkYLGpLpNB5HAx6u90t6KlyMde2Dk8kiuQ+Gw8mKxjYaDtUXVBkNa7iMk1nKPXz3w88/XX3QTxlfijm44xZNp8lDPLsNfvjl/YcgnM+jcEHjJNrCY7XgPtMg8e/q5edBGs9G/HWSZh/yMggfeYTjGU10PA56N4vkSzTrB7Esred6LCc75qlN78Pl6I6nNF7eyXfM0iUNo5iJaXyzCBc0s4MT1b1FdJMkywENT0q94GbnnZTfDfPvTlxfDOiVoy/DrEFDbhD9535Og0NLuHf6l8H/GPz5tM+j9OrDh7c/fnj304+83IPl45wmVCwv6oBYV+ldsqIVcWOsXN0bWoCr2X+saDho1XCPjH9infaiwe0guBaTSVVzh1RPX80er/sDmiNaOg/iBaOQFnwwmobpXZQW6xLvY3F4OY4m8YxacB/R7IzV0rsLvxoLn188CH5Jo2Idk9V0+vgya6xauqqBaiRlEweibWKmonCczU2YPs5GcWLMiPpEP3CziqfLuLAw9Uf6kVEyW0a/Lb+GC/Mp41P94DhchjwUaWQ+aHyqH7xNkttpNBCydrOaDMZROlrE8yUJd15OPjTUDw3zh1zV/JomsyEJyT1LtrMe4ylXRTTIaXgb1VSinsgqWMxH5tP0p/nVkMRnuUoHcvBN8ci+k19JDWIU0SvP+MRaWhRWz3IHjaf4T/1VYhZPsvlYLsJRdBOOvhjfZp/ph1itGt/zn/qreTz6MjWHS35QVBAVraC/nia3A/q/8T39xf8nAXghhPsiiG9npPw+yRKfs3ZL6TQaLT4oKaYwTgbckWQyqWom+nKovtTFeH9cJsm0qKzVZ3KGwptRptxvUh6qpRRuU9BuRsPil7IsyUO0jO+1Zsr/LoiM+Cj7xV6Sfx9H02VoK5p96S77T95rHUX5O7Uai8JhVkCL734+nN/8lxpJKTxXW+PDgne6RdpQofmYtb5BdD9fPopaVM1v+YOaKrMCQ/GkZf3wLFp3Nl4/6stCY1ghqGqUiFp7ZYhw1p3lP6fJKNSghVHWUHxQmi712LDwvaXpIwZA1nbzN44C0WJYkPZSKfG1rajcFFJHSfWtpeAdbVrRwlFOfWkpRlCMPltGs9GjvajxgK04tWcxC6cpgQ/CYdF0eB/OSK0vHJXpx4elx2urvidwOY0eGGo21Jo/WVvhMky/UBNCAkxNNRqPelRJxsJcQL+FX73585bK51PaP+6j2dJeV/a1pShhpq/xyLkcsq9tRUmWIj0trvKFZ6yVrG6cZekrm37gAXFoB/7KVkSgVnsR/spShIRHTIC9lP7WUvAhWXyZkE3heF/2taVouCIYay3F3zgKiP8ki/ifzkngB4bGU66KlmyusJnAALi2stKTtgpvpCVgr0N+WSqWRkuCwreW9+pvSgVmZLX8mg7mj9SzWbWU/Hoov5bqXhU0N+c3tEA/0N8fyYTgn/+3qPlVXWKvtj2aNemGrLK/hNP5XfgXs/gN2V3qY9ujA93IwoZllhrmT7ggdDh7bNjH1RO6gvTRHGT6S39xP5oLjRAtBpMwXdKfxnP011B+OVRfluaDS6t9pzqCXFp9aSm2iu0lVrEwQcfjmK122g0fqdTL6DcJB2mzVcZBKrwI0Wx1T0ap2NhJYfOY3CfjFY2V2u0JHaUD9drbRRSREJvYpXfChuDrZJosztWvZOMtVqPlq9n4PVlD0VU0WpEV/TX6Qb73SjpFvJ9O5/RMpB5fRLSgijWoj8zH3oQz0p3JKv2OHS9p4fm37Gri5fgPdi3Jz/4eLT/eJdPo/bJc+9+5x7ZPzNf9wLuMGILCk+bH5uNXhBdqB8X+QLGK4rfy0/fR8tX412i0pC8KFRa/MCuiMZ8/cDuLz+eflh5umE6PKfxAD3+fzG6vVjP2q3wXlV/OakL+9lHp/bwC4V35hSQq0E4LsskX0SRaEISKDFdXUezDeTwwHFkWxcBP3C2Xcw+d0ewlqHsqw/KuB4oGiU3/JfNKLwrfS/TT+G3BDeAS86bvZSUnZA0zLL0sWcgDCf75u95wyN6h4VBM4ccoeEhmZ8tAuP3Ymfvz4zicLeORMEci1kERWbgPd8ILexc9Cl/oajYWTk6lM2gUBifi+XR4E9FiGmZfReOLgLbAT/TXZ2oW/dqjFws/T/ALLaXlhVhhc/r75OSXH9+//UBPiS/4uZMTWl5S0qPFh+RnnpueeNGF/nQgdMV5kO0X6mvXQA1Uub75YuMt35Gyle8R33vWJuUkTgn7krYna0uVo+en1KHvCAyz1AQv/7XYbtkI6WSX7zLbUlSpuv+qiPwwH4fiw/JdzmYXHy60Qtd84m5JaYzytni+rzgQXdsiVFVpUMRn1TERH3sOiayi2ApZ3tmIynioZvi9yz4aHZvxbjZfLeVuKxuzjJd8BlJ0Av80l5BEiuV/SoGTa5iVQ4vHQ72deZZRYsduXtJm1k7z6QKfL/3IEFXK1UR8EKfigIE2mJ7o1bmstC9PYfgTs6j4tFTsRDvMZfnsT2qj/EM1T4x6GKdR8IFMLIFU8rLC4X76ms96kmWuBDMNpHGdOHmh4sFpqeiZ37o4u1DnVWeitWe6c+Xq6DW8NOIF7bvifWfUoLP8qb5jDHmmC0MoT988R1CU3pcB5MZufPyypV8YxOxT75HM69mX4cxavMaYSskeDsPFbToc8gn0SKCE86ByXsXA4fc/vFRBPly65k9KergS8ZuHNNhqEUuIK+FffFeEraJ88Li27K8TU9Vb9WI+4998o6tTq6SwJxQMowbQUHi2YYMsPNu8TRceb48YLC2zNtq7IR5wwXzSbzD8dmnz4dZYodooW3Nbt6ECFFpu/PfRMuQjW2eRXKC5cCMEMNvngwAOcfcyx2DLm5eevsIQ6g+9hzGrJfuEZ32Hx1I3uMV4FtfxdvawTWw+5Rm11ZN1n+vSf1h3HnP4fDcem3erYf+xFWnQvLYizZuArVT7Tcnd3LoOtW2dx05lKdBq2Pz2DEuZ1tuXs6U1XenasMqe1tY6FWUWN/FyES4edfCOs2ybPg9+pP9EY+WJLb1ywTGDy2E44Qr+Mkwj0oRj52vZp9S4nVqa4LOrHoFNYxmZzVo2jpEtL6viCJe/9R/pSr25k6Pz+tyDiSp3u8WEdR8Xj3m2ynJhrq1PeM+3vf7sa1YOuz971k60mEHu5XaQ2FomfEvJt1ZdWdfiFeVPuyw+2+vsE8GvtH5jhYqWmfZFjB8W4SwNxQFSB/DYUHorOLLhnduAlA2vXKPNHkCzvuwWMGf9CzcPP+vft4HmApR6jjXwKfAp8CnwKfAp8Okm8Wn9ruMPVR8/JFmU5GsZDeoNVGvKSjjiDE8biKsmPiCv5h1OWNrw2jJUqnlF5xZ6gVB3yS7DZ4Nx7je4MOcmxs4XZNa3rgAxXdDLXUUReHVQVXapc7+wm8y9VfcW1pE9Rx1bkUHHu7Yhi45Xrd3i1rJpr2EbMmp/0xZk1f6ijbW2tezaq3oCGba/2FuWreHmfiJcU3RTklvzig0JbM0burbPRzzdBRucNzUlmxe/u2xrD05jDzy6um6DKz6cdBpFc3mzSiLP1OkZiWfLZseI+/U+XpFqawoGXfVrb2vOUnP2HXVsJyy5msHLLbpqR1qYc9TT7Vhz7omzGUOWPog7FZWP7crcPUwddfjHRUwfdlPixbLb0eLFd2xFjRdf0bmF7RV5oeSG8FXNGzaDq2pesHbrfHBUTRXbwU81L/SO5i1eifSL6rWV8QlojRYe4bS2yjvG90aLUkSrre7WTfKJ9LWUaBogS5HmqFtLofYRwM7G1nWnc9s8JMlWdCsSZHuRr+R8F8ZTvl/89rdRJMCYp/Q4y21ol3LWv5kdyll9p5Z5yJKr1GZ2JVftG9mRXJWv1SoP+XEV34oMuV7WVo5eSeaLllJUKrVhGSrVvlkJKlXeoVUtpKdYZrOyU6x7o5JTrHqNFrWQmmLhrcpM8VW+ElPmS2gQlfLjDUCk/HjzuiyXaI/W7E10daBNizxEpPTwZmSjVOlGhKJUZ5c2eIhBqdRW1n/pHb4Lv8L34rX+HaU2tFU4at/MVuGovEOrPOTAXqZBW9gLNS5Ne7HWpktdk+u7tUYLK97axruKRR9toWstSugV5F0kjaaTFo8rCqoWJW6icEEzISjPWnWFJ7JFASZ5bdPv5eqmxeMGOWOLkElJ31fTLh9iCvsi8/HJb+uC5a543e0js9ZNy7Kb3RVDJDmqiiFrlXlpCFIzeK72aVRVw7cwqIrZqziq8sMWw2oSjO3XuMqWb3xgWcUXD+PoA//jNy69d4PJrd74QKrNrzCWmrDRdzh1HXs3oqrhGx9UEx8URtb8wnt4C7Xt3Ribrd+CfuX2lLSrYLv3162ihj3UrFxk4wPKiLMwnCLtgO9gitJ7N5Tc6s1vUITFixsUfeC/QXHp/dugqNUbH0jDSimMp8k97zusZl07d0GpaXSNxm/8lpI26korVn7YYtWqWvZubHXLd4F4rTvhjJdhZ78OIsdDXgCRPiE/g8ZemwL9sjrlpWvG8dbYLMa8kuF2OvGDsLZqNNDjmjTjuD90s9VYgDVcrfmBF1qxD53Y1eXAiSQ9zdu0rR6xpXEtIk1Q8w5lHXrW5mLo6Rd/5WyrylRdXKOZFsRPIdkbqIRWNlL+YXW728Xfm3+pjvS7iYiprmzTNe+6sh7kR3XFO1yob+6JV6c7N9yHvqmmZLfB9uRNqinc/mp9Yyd8urt2my3e/o435MsvaSZZqmman4+4etO67f1q/1vV9lwFz30Nt2YITWfyxu5Ql9+1LWzUeJPWvD+rb81a6VVqRsh3Z6hLZNGwMdQVbVBVdUWbtWtd6fa7QnM3fDrctdUeW0JNwU7D7Kdca8q23g8ae+DR1XUb7BE+UVPDVkIpat7nK77eyXmaUkT41tOUKsG3Ho9kDr5Vdcg50a63rQdpI53zSWLhWcv6k+aZc8KzovZZMVp1tO3wbLRfFdA5jubLu7XuAPq+3gdYitYUYKX4xBtUyvI759f1HaIcOIqO7MJNv8KM2OCgbClXIn6zpwPw7H/tvnLyouZf8H10G44eg9urn18H77P8mnVFRDJ6GuA0EhQrPNaLaBp9DWfLoJfMpo/9YJIsgjxZp0hrHt/PpyrtZzDN30mVqQc5T3sYXMlDMuUKGwTvxPKPF9kblkkwmsZUTzqQwvxD+CWSnfj7Yj5SXQg5MbwYgBfBK/N9WbPk/I9CzoV1w2mvFlGQzqNRPIlH3OJZcM1PXJ+rWm4imdLdVlca9MI0yDLUBzePIqWfeOZaiMHoWlUzn65u41k/GCdiwaR3Iv3r7JF6fH9Pg3kTqrTxaZAsOeGqbEpywyQ21wMVRSZfO5QpsPm/UkPWpEQdGANzoZdsnKarG/GyXqHO8/qsY4PX02T0RS8WU0XI1Wt+LSaiUHl/7bdzYr8fZH7ZmkZUn3K1RWo2kZVQqrbJ6S+zL7PkYVazcs5+L9T0x9kpi5qcucoAeE6M6sXp6SktWvk5fywF6J7WOUkC6dUkTWPxcRLcJWlZoLiG68IMXQe0sKRgDajuE7V/TUgZcfay4VA5u2UtQ5llvrrGPrVYFJ+NCeHKB0Nn5aQAnd/lTVUfi1R2qWivWPHTOF1+cuTJ1SP7IxX5XFkfPqV6xZ1J9PCs/9lolfDtcjnRsLxdvOHmryxq2VxrjEUmvrvwK6sAhgfJKBYKRKbi43oH5XbnKIAbMImn0TDPf5g3wJFbNX908B0VfZP9WRkf94nV2/evr979/OGnq7wZctdbcuPzJixXpPE/NbqpLKsnByIOeFX8+HU4nbKcfCrs9p+kzsw2bvEazvb7XqSF/XxeeFoMq/7j82fx62dzDSvZv2xazr2+wTk5Hi4TnYb2PlreJWNOSlQ7EFyoMBh5FeUp0u89t74pU0YORfj0Osmit59INVnefJgayugoFNV2FJVlLR29vrKMSXe1VW+vKANBvyb4IR6Pp9EDwegNWy2ZwUJTlhsm+nu2TKhKl21yHkTi8q2ok22BSUgWsdCZaXIf6cdEbt1hOE2TYZCuRne5NbRg8+ZF8B0VJxNV0HCRsTKdUs0PwmwJ2BgJSQPfsr0iwjbp9TePnN9W/S1T3o9E6mW2/qm+cEVjvIj/KT+j+Rp9SQc0MJEqQvL3NSbZI+NEPEsvpx7cy8d70eB2cE61XGvzTD6SitV43R+csNaWjR2KhsmgA7ajyYylpTQ509+//F0tc44DGPB//luv/8eZ3rSytC9yMPJJtmxbusp0eJ89NshLkJ6v7iqOgOtvzisSlLnl/kaWWVXgw/l8qobYvHpS0dmv8ufejYtvoaVfV1KKf6GQUOb34Sy85fZZNnLzgVQmHv5B/pXXMp+GI7G+h3Ix2irKnhn8rH97LR7OqxmRfTqLpnXNySeo9PBg+Fp+UGmczJU9CmmF1tdoPDj4wL+/5l+NisQClJJgtM6hoI1X8NIeFkungw/89z/Un4ZGjiYTUitDlVObqrQ1WglNOngrnv5H9vC5oSHDcX7lKUwfZyPaAN5+jSz+uHQ1jxa9/qC6pqvr8rL4Z3ErydbgZfZb6YEieMiTjVfXKj/JLkILNlFidNavvj2DTVR1cVM09tRaGHRqe9UPYkNJT0tvLO2kZTm4LH9QfLy0hC9LfxcfrqyLy8onxQKctp0j5tgNNMwT0t+nl9Pw/mYcXhSFfzDlFOzLwpPnpjeziHALqED+Wn7CrD0LXlJ/F5+VkjeO07nc+K3Loiyo+eNSWt9kf3devrrKS9Eq/VfxGUNLXBq/Fx8Swncp/lua8oShAIsAFb20DNSg8IR1Al4Ewn8rsICwKZJJEFEbAol6ztLsSluaKJzAz2c33VKx599ERoW0TZMmooX0T3qMBjoRlY8SwiOMNQqYXDRaVSUl+eZRAa6hzAOaO7qFQeWA5cqVP9ABM8IHXhisM5nC9sw3GXpxqM+E6J55ZkctlTXJvs/apQgp1eRgEF+3UgtB8lnj/fPaWkoUre1rs3AEnnXj5qyvWVKhtW5fgQ7qrCVlVqmuCi1O69aUSEJal9ckC60LlsJEz1pfwC9Liu0s6axj6F+pblv4w1m3KJJSzY2nYWcbOGvO3/mHqb1pfWXGE5uu8YRPbc75oIrTErCNOFkk92SRLVbTSJwHRiOuePE4ME5ZJ7rAMK9syCWG8WSYlSjthfmTiXzYCWM9sJPAtXmVZJlkvwf/2e75q9U0KiKrfOezH0fVVHZxUqjqRfBuoo1Q1ToyheXYptpMHZ9nTiDa+Wh0w9V0WarGqODhLqYNl4zo5CEVEzif58Y11Z5/E89KtYyjr8F9Mo6CHp+iT5PbVNrxZGCydkuF3zOazkVDyDJflMrTjsf7NDUhkiDgUZj+93GaCveCaZb3B4XC3NDKCtBG90VlxtWAeIz9Gzle+RT0KpXlWzLp7nPr13E65P4KUHH5HSG9qPpc/6TcIzMbSaVz5+2XYd85EKr1Tb0cqtVzWW1OU3fUiywFS+DaWIqXHfRA5nrKixjOuwLWlAir4AaicqXmbNM0pg46Gl8s1+uz4BU/c8DnmBaLEK1UndM/BhGf1qZBmMpYEx1okkoBk2f78nCXPrg3oXPMGHn6GLxkwR0nEnRTGeHipo9Wskxwrbb66+BhQeqCNb/UIg/xdGpUSNBjLArQvNzGrE8KLRoEP810ax+is+mUdgcOQUmkC47VAh/2GxWyN1C/M5XVh8U6hWsx1DELVJuo/5y7Ij2ERm3h1yRmU2K5eGR1I0wgaWVoy4U6tLyrVldeM9nXQ9kbNiO0Be8wJ8QBCFOvWGyFGqt9UAVb1e3NHTkkDvK5uDjWP6v1ANQ2w8Bs23i/jiFlaFBwh6uDL/nHheNQwHKE0+ytL3aw6q8vC27ejLJkCgeVPlehlbHUjRbG8SKaXNR7iq6iwhmQDq3iWt8tOZYmWfgaovkAnJ6evtOue+m3JlP7OvcHD3Rb+9fiyLHEFaFPTEZChWqnXXFM7giyklheVjunvhn8b/mzuteUHBviVXXejdz/RsN5mf1WfKj/hP46KeWXp2oUT8uuEjFcEg3UuECvxPi8LtNzGBpfri2hlWweF1IoUXhPy2W4EFUNjZt7wy9Raeus8IBUfWKD4dAYt+G5HYJfsrAZ7eW9RxRLiwBEtp41tLwweB6U2tfncDdbSf73KGIZxbdlQaPejpZDslRMdFA8xFBr0CZ7peV5flKc1Yv8WrQRwEs6nlsZiB/KDd0ktfJItR5RNIn0eeHsXJwT/fLLuzefPxeF/UrAL7Hn5wRGJPJ8Wsab3ZnysAW3ZOtxiKGZsU6qXsOPJow4rkqbGBkFkxyGMzGpwnMn5ydjmJiPBeQSm6rQHQRMaBucTAjxz5ZZ0wYmqOGDN24nIcKemNnBnFZGepesaP7lcftUOCSDaJauRNQq17+UB5kFlSzOItU6Zb33NVJnj/TxchFOJvFoYAiXiEQWElB2dw/UKQCVHlKLypG+egnVKS39jEVd9YPLS0PyhODmI/LjTx/eXgR8GhusZgSAAyncannK49J0NZ8LRFDQ3i+CHxWiIimJZwK90TpYzQNhcaUCPaqTU1H/WLlZE/oiH5hpSBPdSOznuYBJ8RaO6cNb2o9vOW6irK1IuuxrnQ9Ecqs6ngT6VP4yd7SW7ebZ15CWMy050fNYAT2FnOXS4tBTsbzE4huLVVK2eDVEvlkt5Ygt7xbJ6vaOlCnZwXmw6xWv21JhRpXUcz7hlnC5/N6biEQxr0Melpcq4eUrzkl0p2nuxnxqQhtX4VEyx3lLULZ4dc89/XuyFCf4fAYvVGfmbJeod0bKuPAmiWFPKzVNTiVqCs5+l0/+IULNdWkzgCCL4a7WcvrvM8uHb5LgMVkpqQ9uFslDyrGm4U2QzGmwBNqntTtleSC5SRnZWKrhIHuWeUM+z9nGktZCro+M79nxQZJzK2yQ/69YZ79o6gpjqrCvCDQaSow+eP+YLqN7hdh7Tm/UzXL49S/hdH4X/mWg7AjGzO/kMMoh7vWrQEgJ2KXVgq+fm7peye1WqBBleEvVKQLE2T5j4c/PeqdFMVQnFic2wOEDJk1AeVfel58E0hmwTvWm+v2awM7iNhGiZ+nFIhzxeKfzcNZzjAMPweXk9HcdhlIanT96Z6WvYloM/VPLsNJLZG2nouO9vtqHafucPtpKyD17JqBnQMuehPVeHGCmwc+PNIQkbKwwWdHxJLwXUWuDSjVz8aw2p0eXHxYri99sGlEzLt1j9IF+Rt/zQ4PXv7z/8NMPb69KQ37hmkgZunMZhA9hrIAAYevHm0i6YR6lf8fuKyuv1tLiafKXGdCyJrqscNDX67tqGPwcLuRdwffLBWv/AlqzvLnBrshn3953qyXRwaKoWhbmHGSf2huRC6xcvLUODJdEe+ses6mX5vJxP6om4XJhO8dxWK219pS3XZUWDCt3X9xQbEDdi2bjXqVid220c9CDFzLAcJxE8vIZIUy+2EN4lMA74/FRMhfut9FqwVvw9PGipsY0ioK75XKeXnz77S2t1tUNRxl8K+f45Tj6+i3DVIJo3/I9mij99r/8j//6PwbOCv+XZ9ycXH+L1Ww4Wc3EAfhw+cDevWWig1aioQxiSd2jm5urVJF0OPV0yAuZ7Kr8hUgOXxcFXELU7vEy/fCGRlOvri3WKNWV/af5sdp1b/6rDspl9aP6amrWZWYOaz1vTEdNMcI3BTso+FPOllU/BRJJGVxcNXLWr62p2IASW5ftXzT1bJzw4NQ3rJPaGE2j0DyQKePEYiAJjDYYbTDans1ocwZ4QS4hl5DLZ5RLa4zkgThX7L07QmeLdSDgfFnL+WJfXO2cMQ1RqXDDdHfD+Mo+3DJwyzyNW8auhJ/FTWNvCtw2ptvGsWfCjfO0bpyG+zcHiVTLvTx6xFoaECDXDSLX8mIDgt1JBNusE4BkgWSfA8mWlfMOINpyk4Bs3ci2srcC4T4xwrXeCT8UYGvr3DHiWcs4AMauB2NtS2tDwXA1vAuAtGtAWj9tACQLJPtESNamlp8HwNpaAtxawK3WPRRw9VnhqiYaQiAPAnkQyPN8t6KKxF2Hcjuq0KtjvCVlDgDsxfVuSxUW06ZuTVl48GAhdrcQmyQepiFMwye6RVVQvc9zm6rQBBiDhVtVxZ0RVuDTWoEWctcDwZzVnh0h7qwMArDnWtizuqgQZrMjiNNH3oE6gTqfBnVWFe+zIM9qM4A+TfRp2R+BQJ8HgWZ8tQeGP3W/jhh9ahc+sOcmsKdeUECeO4Y83ZIO3Anc+bS4U6vcZ0WdzqNbYE5zVwTifFrEmacmQLALgl0Q7PJswS6V9GyQR8gj5PHZ5NGRHBBSCamEVD6bVNoTgx6Il9TauSN0ldrGAf7Stfyl1qW1oXDRmuS78KR296R6agO4U+FOfRp3qlUtP4tP1doSOFZNx6p9D4V39Wm9qx7Z5mFQwqCEQfmEBmVZZWD9Yf3Z54b13SRZzfyW3y8ztkHuwptpJA3NwnK8f5w/DuyJeO9Xxaswz5qJ1xurPX3W3EKuVo80ph6mqyxnN1a7GKovVPbZh4jNrOSeBIQHgzXGkhaCmGkSGbWp0z4b6X25VI3UNg93NGwPvF2zBro287ezq2mVvqbNfPDLj6/+8erd96/+9v3baxLEUk3CB6KmiNtA6i4ecaVk15CJxV/IlxWBQamWZUKqZUbWBYG00Zdvp0maiplOZjOR9SRePhZ39RelCj789Oan3k00u+tfUEO+xmmsUhCPo1EstBHNKLUqIuUkjCaamTSZVZvB4xlcFySnfy0XD5tpIhNxkLAu4kGe8RguolI1DxEtLYItBMYYgqsB6EWD28G51p3nJMBkIP9aSZJcwkjnQbQc9Yud5zYOb2igksnE6i5U3w3+Jn+WVt6L4FVwbWaXEfDriqfvmubzkTTIF0KEPBpiTkuF4/v7aBzTwEwfpcuLh5U0o8hnHOhmCVDIiYsJF88YQ5YHSS6XUbhYxJGUcRLdQGwQUTCJFyRZ4XLJoXPn4qOUfaMPYbk1179wEmZufByNX9PAXAvTujhgqlFD0UwS6eA7smeLDSIkSquPvXEXFtffR3b2feGtb7KaTl9OCBbfUkW3Vz+/FrNxHqQqV3M8KeSzttT1EKbBfZySWDK47cWDaGBmy+Ytm3eGQp5sSzUyc3Ykrcn+eRAzXqC1O0segtuEJ08IZXx7t5SrdsAOTEtFhOQjkjBap7mBL6tSIkmNm92mwTSmAZDWpKUWbXHyhk3zTcNBDVzeDSyONpHX256jW3eeDSqu9e+rkNbpktNm3zwG12onuh5YvMWrmxpNLJVa0QP2nor03P462mpJ+UwzDyApyaH+bJm43QH2hOXheExbWOrKWO7wttVmMHeVsWQ0r5r7fp9WPxHq8VIMt9rd7B3xcu3RDhvSmgm1U3GwTMREDfUXNphVbRPpkYuTRt8Ot7zylDQtA3PnY8T4Kk6u5qO3DP7Y1ShQoP0VJO7i2wFvbz2ROb55G3X7FFLxfOZq0ZqdhkR+MxTgbsDb0ZA71OP/uL0e0rAeSlV7GdSvOSFz1B/VBpJE8Uk0rfGQmLi5CrgV1JYoeigarfCf0aMxzXU8TXtebrNV2uwO+9QA5O073+cmB1n7b2gsCXrMqN20Ddb3z5yoc6/RbtW5Gk1Q79+iLjRPTCa9+btlT4a8o+t1RLtC8xQbwzDIq/gTQfCz+um58G1ljpdYwYymvB3xjiE0dnNfjZrOvR62Doo+2Vut4vHgl1/evfF7sXuIvIr3m1vcX381lBrIKJu0YmOxTut68PPV2/e//PD2zfDN21dvvv/p9b+tu0qavDW2f6eiLcIiVYZicBONwhVZq/EytbhBrJUYC4VlZk5wYUVAmwyYcDxNRl+i8YVnVZPT3+WepFVr/4/T55p5MgHd+8OHq1c/vn/1+sO7n34cvv/fP/3y/Zvh1dsPV/+H/vvq/U8/vh9+fPeBPv4w/Nur1//203ffNbaAkSfDxyLeX3dNVKwHthJqSzUfHIjWZrhEG2y9/hpnEa2q48OqeEbdOLGfK15FIz5biJdkpAhDQqwoaeIIq0PaKsu7RfRwLna6pTBsQja4p2RBjBUuOtkyzCkAFm06uAdK+gi191OKq4Yp4nWysobdWjzj3lOlu4AbctKpDQIDsx3PP8Uwutsjvj5pbIebBI+bgWMiXze9cAxJR1vU1U+fuYLl2G/HRy+c8QVHPUkz2W4bcdcfiqu+26lQi6zpHj5iszQ8xfAUw1MMTzE8xfAUH5Kn2Nzj4C+Gvxj+YviL4S+Gv/jo/cUF0xFeY3iN4TXefa+xKbTP6zt2tuQpPcimqoUnDJ4weMLgCYMnDJ4weMIsnjDHZgmnGJxicIrBKQanGJxiR+8UcxmU8I/BPwb/2O77xxzy+7yuMp9GPa3X7PFDkvF3KBY1xGE+SxymfS4Ql7nncZnFaX37m+SxgqjtjqiV5wQit+8iR2vj+2R2e7Wa8Zr6LlqO7iBpzyNptqmAgB2WgH1cxEz66zpqbZeICqerOF3F6SpOV3G6itPVPT1dte2OOFvF2SrOVnG2irNVnK3ibNVqP+JkFSerOFndg5NVm/Q+87lqY5OelM0mWn68S6aRyJQFx/PzsNoU5gAe5z33OOsU2m/FQqRxgFg9i1hV5wGidSCipZoLwXpWwdKzALHac7H6mCy+TKbJQ/lYdEfTw+SdzhrO8iENw0yuv8Y6R1CPV8sseej7jkd96nePi7mlCnA3F6fHOD3G6TFOj3F6fEinx6VtDufGODfGuTHOjXFujHPjoz83LtuQODHGiTFOjHf/xLgkt897VlzXmKc8JX5P9kpE879apGSLqtTDHfjqbNXAOQbnGJxjcI7BOQbn2EGlcLBtdnCRwUUGFxlcZHCRwUV29C4yu1UJRxkcZXCU7UFSB5v0PnN2h8YmPaXT7IqUT4PPDBGrTxOxap0KhK3uedhqxor2ajbekIe6sUp4q+Gthrca3mp4q+GtPiRvdePGB881PNfwXMNzDc81PNdH77lutjzhxYYXG17s3fdiN0ry83q02zVvu97t8up7Qkduvb8Q3ttnvpDvmiIWxkmymlU8uifSeUASTspiQsOSztn1mDeZDe+8Acsw/XJhcY3x5+ngA/33rXBl5CW+yX9l59VQeTRocVHhqXYamQ8Np0kyHzIXl5gU2+vimUy+kcoXD3WzabH9NPueir/Tpdl3Fd5MIzbGpuH9zTgMspqlszB/0zClGsarKbWNJU6Nez94+a/tmsDDcBWlc9IY0U8LaZHmAnt6evpGPys9dKICdi1J32YUrGZTmuDgrDBgQs7SaGk6i0khRee8r8vTolFIi/LXFUl1NEtXiyjN9wh+R0DivxKO7ei3mD06J7klKnaWUHl3J6uZxD7CX5UTOXxz8/hNUO7uX7WPLKuNFxuBLVo40rFBQ5VUig1oHHKdRjvH2WvST9xNsuj54YFcvEOhiU5K20xxKVkcZ6bnWj8XnIl6leYT4zlKFnxcFywf51F1e1TujJ77kEI0Wc81SapcOOXjhV/SSKrYaUx2mdKw7BUXxUkbzaKHIB2Rass9ng+RYNJYpWUPrzil5BXNA6P8h9cjmYXmWqCua+lOTK95Zdyvpst4To/fEKblJVf2O8/knIuDhB5NHdX9KM8wluIglP2WWSViGfFgpX2xcySr8unjXbwU3vkwuH+cP5ahim78WSpq0TiB8Q2tSHbpnRS9mloxLVazoRztqjZVnbcpCvVVOtD8JCpdT1WlflP9SDtfZ7dDNaIupeUAr7L5YocV/suhdCJq3ycP5vBBNcyOD0au5mplbP+mokQvK5/YC1a7fFn9yOIiZKcdH65Mo6UD8Dl9hlLQpARlKLSnsIOeNrdXuTRSl7UjZiJD4czVj+upqffvDlwr0PynWq5Vg9A1fBD5M2cy6aklSoufBnRACnvZrF2kQzcwlVe/wbVwE5HYLobL5Es0uxxmmxUtvdt4JD8eDuurIPvqfk77wmz0eGnZ/vJvB+/y35sNU1pNYXo5OeNNMvi94pYR57OXoqtCPOhz8ZOf6P9x1uAzrJk7t/mlbDW1entCqoKeXpJKpfdr1q7cJEoFrM8Xvd9CPRBofM3uSt5g37rd3lK5EkJmdSndy6HUxrm9N9L18KlOKDdth9GnrTXWSpWdOZaYZpjV13PMR70NzE6T6bLRC6494efeHqvWcLuD+yubk56PE4/PUZRF2u/q1nYuRTmO/YaxFotQPrqG30LYNR5L1332wDuB+uii3uQdCgRwGUzOftd1DHW6J2kzD4ZD4S8eDum3+4Sh+XD4x8Dr8f8gpMsIiQqctZeo3MvCgpXOo1E8ialzMvaipj7RomAST6NawTMGgKpU4EC/ZajW4c3jUNnSQwML85Fp76ywaRRPYNW+cXYefPrsLaJCAvXEmcv5WResXI4nJ84zxjpYKM+bxZcaB9pVgzpesOxy+qBFnZC7NUvxRPlSvNr3lDkHIxa7mqG2ONQkHDAp6uGsnEPlOD6WxbhisZyskS7Gaz/Qrz/Sc/Yld9Z3HjTTUrzUNt15HbgVb7tcB7trMHzpRsQvAsJf8/CW7S0xAoFC4TKuQnwixFHZX45KrlezZTzl2CXeXdOgx9yG16UGqlMi4W6Lv0ZkqepSfUe1bOlFjNFUjJQoxW8RRqGwFenju/z1jnri2ddErriB43w+a1LBFLm0mCfnfjWIyWuI29BqjDW0sfyGvsu2XxeGeCaW4l65DUSL4TV4Gq+BGGw4DeA0eC6ngWMBWnwGSi+s4TIwa3hSjwHsa9jXsK9hXx+DfS0B57GY147tC9b181vXaiHCuIZxvS3j+n20fDX+VdwW26+jebPhMLWfxtQ2xxwWNyzu57K469ehxfAuKos17G9LRTi4x8E9HAtwLMCxAMdCg2OhALaPxb9Qv1nDzfD8bobisoS3Ad6GbXkbzEuncDzA8eDreHCsG/gg4IN4Lh+E95K0uCMcZeGZgGcCngl4JuCZgGfiiT0TLmB+LE4K790c/orn91c4FytcF3BdbM918fghyUhi1BzsouNCEgIO9D43YC7YRwFQ3vJvcFVs21VhWSdwVMBR8XyOCq8FaXVTWEr6OCkaVBAuLsCKhxUPKx5W/MateBtGPR4b3mujgwW/Cxa8daHCfof9/jT2+9vfJIqEHQ873seOL60X2POw53fDnm9cmI12fakG2Pew72Hfw76Hfb/r9n0Zwx6nnd+4AcLe3zV7v7JwYffD7t+a3U/L9ftkdnu1mnHylO8igkIw92Hul819yzKBlQ8r/9msfK/1aDPuLQXXulhQUyEMfRj6MPRh6MPQ37ShbwOtR2Pfe219MOt3wKy3LlNY87Dmn8ia/7hgKwPmPMz5enNerhPY87Dnd8Sedy3IZoNelty3U3qhg8EOAHcE3BFwR8Adsd/uCIW6j9Qf4dq64ZDYOYeEXqjwSMAjsbXshNHy410yjcTq3b8shaTJ4IrYbn5Cc4HABQEXxHO5IBoWosX1UCixXt5CS02IHoC5DnMd5jrM9U3nLyxA0qPJY1i/vcE834F8hsWFCbMcZvm2zPLvwnj6kWyXt2Lbor4jSACWeckyr6wRWOewzp/LOvdYjBYLvVIK1/dhl8Muh10Ou3z37PIqJj0W29xjc4N9/vz2uWWBwkaHjb5tG13tULDQYaE7LHQngoR9Dvv8ae1zL2OmZJ2rMrDNYZvDNodtDtt8d21zjUWPzTJ36gHY5btjl2eLE1Y5rPJtWeV69Pcqll03+koBShjm2zXMPzpNV1jkB2eRy+GqmXPvQSoZEt0N3/rqOw5cs70BsxdmL8xemL0HY/ZmYO9w7F3zo/9l4RlRTtB0eB+Px9PogUDV4D58vCEjkIDNZDUTicWHywceTOqbBq163/BARTU4wgVjzjcPpCzT6dz3XwQfGWY+RGeLyGhjoNpIXziKzaNFnIxj3kAeg2V8HxEMLQPnaXLrKC2eCgM9XMF9fHu3DG6i4G41uz0P4kE0OHdK0QtG5IvgjrVIcLO6HThxWW6d631UOTT4S/ceUA90W4OeraAS+6d6Ii7FdslahDVX9W1CzQf/nccyjagT49Ra3cMdKangw2JVsyWMhU6YR7MxrxsNHUvDzp/Vj+QnnpLP9QOpenepfnYBci+C13fRSOhvWvNfI1HnOODauLeju5qSKZla07GwfINkNFotVC2LOmVflalapT+NZj0e0T4b4X+u18u0jUUL6+yyBaqXgjLveD3U1kbCyuYQqUVmUGgGSJOz98t4Og14arl3E9oIlVmt9ppMSwVnjbWdsSmuNoggnLALZxG9XEg6B7bTMxeCHsWzNTCUHpt/uWyWAVPU49kqagL5ylzhHatXbcUknrHGtE+sEldRAy+CXs3GLB6S6LtXt9x/jKTfKxwtV0JXS/lk8CI0JKnseFJTXjogYl5TCt/RJskKnhp4tgwIaARhTXG1nOTqGudOCKOqMK0pP4u+iqWwXMT02/ic9P0yf/uIHSMER1bL+h4Yr7uJRiFtH2rH41EWroGG8mK03XNRZ1XnAIgrccNd0cL6auYk8Q1ufQ8kcuyOfbGx6WGiRrVjjtvdw4Ic0uOUAKcE2zoleBPOqLnJKv0ujqbjFLF7OCIoGcOlFYKTAsTuPVfsXuNStMTulcqsxX5jrwsEvCDgxTENjmlwTINjmoZjmjLaPpboxMaNG9GJz+9wqCxO+B3gd9iW3+H9MlmQmIxWi5Qa9kOUptT8vQpVtPYAcYtP45SwDj5cE3BNPJdrwnNBWhwUDj2yhpuirkY4K+CsgLMCzgo4K+CsaHBW2CH6sbgsPDd0OC6e33HhWKhwX8B9sS33xRXJ6l57L2wdgPPiaZwXtrGH7wK+i+fyXfitR4vrwq5E1vBc1FQIxiSY+TDzYebDzN+wmW+Fssdi5fttfTDyn9/Ity9T2Piw8bdl49Oop8vFarR8NRvvf7hCY29g/T+N9d84EXAFwBXwXK6ADovT4hfw0DVrOAl8a0eoA0Id4AOBDwQ+EPhAGnwgzVD/WBwiHQAAvCPP7x3xWMBwlcBVsjlXyYnhv8gM7Fki1kAqyKOEPa7emg8FvXuxHJImzzwdl8Gp+PBU8yUVHCaS2exU/3l6UtBmwRXPxn0kYGBxBCanr5ZLpoqQc/d75cV/yK3r7PeyB+ePs+C0VFUyC860JEpesWCcRNLqj34jmz8voIbmhbaF9FY4UrKayk0k9wkMh6+F7sybzxOWz4CX8b+IpdlVFE4x0ReB05JSTcwLKFuppohsq7awTizOhXpmxH7w8l8zQjFZ2Vv11InTkhb9oN094kpHWtXR1hqOxz1t4MpVTRi7UJRX+XioBkK/VyhcWng6vU9mhornzgOC8/EsXsZk/olPLisvERjE0ap+v7zHZrZ/VUhNZuZcRMsrorUfQDbb6LxLlYh5vFQ/m6X+xGLtf0jk4Jlvkw0oDYRr/5PEd+KP3onLc1LtwKfGRSpLllgIi30SI69oQ1mjqDWrtQRjCrGVVBsmCfYu5Y9q6wxzP1PxzikztM/lWVE6znzcdl4+rNqF07fBQqucWgCgWGyOZabn79I9kWLPyB1V4s/qUyRiU95ZaY2t5rxgjCKVr1yds9lkRVUqe/mPbPqvooo6YhsoJ4AM8qVyHvy6SpcBoXe5+8013ilCgaLJuLaZ+CJ4J80v6b7QDwXjVSSYAqWpJpztwkySrTypWGEKmnFNuoqYlBpB8iCZZA9wx69/mX2ZJQ+z61Il2usfBqNpTGBKgKrlIpylc4IHs+X0UbZlUD4jcXeeVHHW/J760GKHSTSgvi+16vvklhDmY0AQ8I6Q5pRWiXySF+7oCzdwRHs5DdV9+IWsy/LQRGEa07AyphlHN6vbW3ZRFp8plfjxpw9vL3JaQ1IRGbWotphpMtkHxYybN5GiU6yeaVzPVzdk23wrB+ZbGphvM97jbyteqPnjtZ6x0gGEHBehYS9KpP0/CR7FcPqJv/ysmGadpfNNUymFV5YhZ/9ayg1hj5CetHNfZ1Tfdkb2YyKGkYdenurwmQMP0CwZR9c8mjTa4ZSaNH4U4y1OfaoIvLzWhlz+13Q4fyQFPBtIStjhfEGjPBSrQywOF3GnL8fq5PQXvfSCHrXaauJpfd8PtLfmj78WpI46eaYE7+zfZ6fBvzjfd3Y2+JU0VOZV5z7cUGcGtIbvw+Uwo8/MJMqXlFjK2VpuxQY3ouqhyytYPC4VJ25jEk5aEzzjAckoY3JaDA8h6Z9l4rTSRtPVWCq7szkNDe3PA22syN1YA30CB45KmCyVWsAbzyyUdsatbAaPszw+/BLPWH06ajg1NNDpXxU/c7w8I8NpNWdO7Gg6n6ymXJ+jhkwjnbM+EUZJ9Ns8oUmK2Y10T1pXbE3OcZBLwmmu3kv3weXkdNVpCZ82YEq7g5XE1L54CrrIoEJmF4K1AD9gU0ZmRX1nafMp3orG0WhKO5nyN+ra5PKtCkvfydEeGfutrlNuzqncQSWB+l341UWZPkruo2BChgu1PRFrjnd/TbVO6z+vgZ5wuVKUoF4LGl4eqsxwV8f7/Lmbtz0vrw/7xfsEk/useGgep4461Iv0KAyCD/x66kvywHzw4+hrNE1YFpyynPJKfwzIFhTiXBxP3tbp03gRXEsGSZffhh3QpN7EUFKbZ9wVxVU94v1VOKmYw9rp739h+sD5SFy+l5RZhqfssRtqxWs0Kz3qqVjXbo9zG37vyenPxj6SCzLPbmm41pPt+jObF8EVD55AssYiI21njpEGke5lpyZ2QWttmopBf4gXUpc/hI9m1U6lKfrMEEzRxIuFHwbzxzFtG/EoePXzO56CWGwvjlpCrRwZHlf681cDkp+5Fr+CyYKCnhpFWETKv8N1aIJch7lc0lxSNbl94lq968fV3w5Ht1I4FsiXRU35qW2hsh17mpfG9te1m0KOm0eP7aX4aVHkJpFknVJ4p6TnIUzZWgorGpy1sTtxSbaREv6hzmW2aZ0MrX0uvh6I3RiQ3RiY3Qyg3Qyo3QCw9QS32wG4pQOSJo+PT0wLCQmP33wRLZePtDCoV1O5Zc2Cq59fM0i5ifJolr/K4eYFtEojHuvS+mGxISVF02nMlb+TSjJy57EEagwHb8QWJtrPoih3NImVy/0hCLxKZQaLNIqkAlDQSSYwEgdKy8WjxmDav867NL/3pAwj5VYsl3nM7pyEGhAxMpzRTEbji0C3V6Uamsb3tLJo7/7Ln/9cqk2W0JWmg+B9JMVLlEkD3iLKPQqCu+Vynl58+23GVE7glf+4XYT3LD0vb1ck46n8/qWs6tuTk+3sMD47S7sNxb7SJ6e/CyRiTnZ/MByqSJLfzy6Cs+BfaJ0tio/o7DiVL/rBvwZ/lsd+Z2e0edlfeyrMBPqfXkUiDYiK4yrMez7tGtzki4QlhJTSXCJPKptNHW2N9vfaVkK3mXftvf57bnHcGiztNXe+7jteVw1r9s65Dp5zLWx6PdSfWfwtTKO3Wd6bMM2T4JQ10SYg7/4qomxYHFoo/95UQfmnnvqnPab2l2ujMbsq1GvD17Vh63pwdT2YugY8bYClXZWlc+lfBL9nH//hUjHWNGbOqItFdJ98jSyBF6K4JVcnjzGfNWVJOdN5OOudFNAgjR4fphKgvbYewV7n+u6vwkeiAK52NBohRtFSBVwO6VVZqUtxpeUk77gRglMfgdM5KmaN0B3vgBr+d7uYj4bll5XP9zR2p2eFinivok3Uq/XRnxGm4xlfcWHGgi0eRXa/aBFPHmWqNb45wZo2VL+K7/hAVQROGekT9XoKV8u7Us5yGaAha5V3MYq6TEeWZgEB6oPzPEBSSsqJPYKNI5lJT5BSj6ZJOD7lPiQCCqxm1EiVFpW/opHny04igMg8NXiRB3wsg/uVFP5UOsyEVzpchjdhKoKXyeqimZlGRuFFspqNXy4X8Vw5wOl/k3gRvaR3vCR1QXrtr6SXblJeYuJgnUMfDbX6Irgecvs4YlHcnhtxXswhFc0vniyHumEirlGmvyTRN3vBbVWjwCEE1GoZnfklnhv+bP36QtfymXxxUtwmLnjyF1RjMtHH4PfhF1bQOhuhPj/g9zaNafRVLqilGicRc8FRDjzlorUP5tDKM/iZyJt4F90Pgtd6sxJuV9VZnfLyQYhjWppbEcMQjuT7GTWoEtb2GUcdL4LVbBaNWKcvYjZ1OXtmTzZRnJVw0xKS0Pv4nzqdIoezhmb79cpJOa6XFuA0oTU1iafUzr59zD9y5IEcn6FIvjlUEimM6UwoOVdkllC08MpoFofTl8nkpdqOg3ApNsuvpH04gESeMonxkx7utJh1UeVJle9JefumIYwZB+rxTqm0Y/XYbhKqUkWpL25AWaT1ufUh2/23ghIwEslm4FgcZxEY4A1bzA87+dVE/6lx6G8iKhcNxRDxyJ8Zy4gVSq9/pvNXmmterWwuJdSAOJkwiuojsyGto6FMe2sU1003Wx0Vii+Vg0UKRhmfveAm8eFi8Z3zcEFqMJ7z0z3CvTHBZ6pDyF61Cp07tfhm2rF1EFg+2xbtVFL+xZVQr9dsU2+bbg5RsbzYOFG+cMVweu6Kvb61gsHP4SKNOOL0PUkE2UOWZgz0w9agPP1l3pmmW7ilVXfSeP/Wesnt3BkUdGkNCTLETBz45a24OGlxh1gqZOed6POTVuHujsfr+ypaSaAkWZCWvjQRSfZpr+Z2hgrrrL1/5Ar1rAU39qM2atKlCaW8In8tAf+WOM18Ci+N36sPMurJLYZkcckpx22hof+xIoyTNjwqlo8OzZbLoX9xUj1+VMmyi8rDJ5S6JoS6dvA2e8P8xBEbLns8yK6FqRosz2uwRXuQgDsaZ2qLKr2Wpq248if3Fdpi1LUEwdlgOWV7ETwInDhTiadVjCRhZd4RWKGckiE+I3gxCnpCiukNL9UWRYhVvCxKT6wRF2JbTGSMCSu2pTxKj7Ia6SUkPIzI+oyck8VYRIJQ2d/ELukkwtBpxTPFzShOhD/GtzPalT/J517S1KyizydlgzAlLSAuT9Zbht9swEhU0mwzEkvX4hoMPpdlZ1p0K1pDn7ytUd+97vNFd5OX5LXxAqHWgFbFt9V7diXz0Qotmy/P2U38/sla6GJ3rG4Y2zC2YWzD2N6Csa334T/xoVZUvBb8ggtrWKKnQKMa9vunjCYUvNGGtl7IRi0SKogLtRzTp23BHi1BeZwYBtdypV6fi2CFGxqeB4/VAPv/4Oz/luZ7NehFbQRirQuR1ivcgOtsjf6pZCPzrTZxWGl7oWIqIIx8eRn8xVbSBIxmLwvPmg8N+BSF5i7mlctkGiHrjqoZVShTfb5vOQu122LNsXZVXPzh1ft/G757M2QepDreh0XPwZpUN5if/vzZIO7pr31R3jBOtN15EL6cPXTmeDsy4PVZ35nTxZcjrkDoXUDnyVOLgGnQ0nWvxntT4/UHdQ4kzXdnWvY5m4BmnnO0Qyn+ygxLraO/9vIU5b6vqrIsSKC+3+wYQI/L2o0XvvMb3Z/4x2c/V5fcprTXRrKImPvU2s6xpo2wfmfz3A077oj1+1/9rYB1d8eGHdLBY1cT5X/ueZXUMkfN26P7CcW68na2XDzOEw5unoggpNlLzZdDtsKSyUg1bxDbVewTZIdDcMth1OILBexzZ+CWgkM6+/DaRmWo9WBVDiUP40Aoe7NlPfOP/klJmnTxIgVX4WImM+GsQtpkl5EMq7xW77oeFAzCZDaJF/dZAJn2NwjHsLjKyCBAOn9vIskrJOzrgimnJmPgppJRezdjva/RUNWpXJDzaTgSkVtDeS9rIL8WxkbI+1lVEu0DcO58zrHTeBBUZI3TUXmv8lfW3BhI0jRm5oeMu5iMzUUwFgw240hdSeQgKqMHwbs3J+WLjaEMcmOLUXgQz8XlQREuF07TJKDNn+zz8uviMk+zmiDBYUX7G7UmkFay9IXpPvJvsxkH4YXj4JYrnc8r/Aj63MCIp2MoS5/KoEGjR6lsdNB74KUTVXrHlw8Gt4NA+G+C68UN34v8ek2dG92FSRrcJ7Mv0aM4oSA7mFRE8J262lrpX5gyD4jklxA4uMK/UeJmEPtYYdMQhZ3BmkJFvBfxba+TcTT45cdX/3j17vtXf/v+rQW8nRrLJDj73b5e/zhTl39Xs/GA72M9JitL3OspX8kYsaCOeY4EUYhRu/Qsn6soifCR5VR7XSyVcfFUhKeynKdLpsIQw8tRa6e17DQi6JUZyWdiHYmhFTeYlffvUeh+Zu4emBa/Vfb/pIRfyXpcIVfRHuIff/ogr3QqHnZZgFYC7fBPO6XvZcvPfi82/I+zzL1odjS/031qqUsJ5F+1ej373TZKouoNTkpW0hIsmhGcDO/j8XgaPdCq0wxNq9kwiyFdPjDN5zLJCN302WrJlhbneVSyOPrNQZXdNlvbGZgjEtN2VFQKxixSmdkIxmlZW80GtyurbHNXucmV0e06AnVZqrUGqpf1aYNGl+YfvtiyNlymNAA+B5Ctuvq0xJ91PoQ1Dyjd46vgn5cdVaCYlUurbkXVLo7aZdAx8KLlgivRl2yCT0zuM+txilWvbLqa15qCWsbSG8uYhkfF17OCNfiNvRiPXwQ/qjMbwdhhP2OQF6kqpyMGc4I6U7mubrNDhl1ZA64FyZbtGoaIAxHMYJJARdvqgbbVB8FP8tBSjbilEmfzdR2aGltxs42YdmJgqei1OtkTwJmfkvdf75JUgWn5Z3RPEvQ1KrhgrfUJ9B/f86m6PJ0REiqWUhrN1OmaiZyZ35Z2+keS4b9a6kv5SEiaRYI2/4zrnHKqjUgOnAgAIGxtW9r51dhbmprVDftrFKfZS74ZR/A6+TZOUxL8b//7n//nX2y7nEXXiOPnbPfLB4S99837X1GHlco7z0gqQiF/GZBwCevFvU1WXEGXqmjli+BfslaZa4rFSqz2ev9TrkjD8VBw6YYMofSeRWOfLMbxLCR7dlh65rwld0Pf4ZVrkEn5w0Uu1hLXd7tQv41L9Z4X62s1te8lT/mun8W7BOtQVsZ4r+iMYi/MmQvFSbpNlamoEHksbF7OM6vkiBpN7aTuqtlC+4TJQSUZ/0ibWNYv3GzakTBOOCrihqlvJuFqurTdMuTzdovy4BUm/6PUxl/+2//8f/8f6ZRIqe2RnXLqhT5/FUevfH9QMi/q+AhlBHHEiorWSMOJZf587rSe5Xdas9n599lZ98uhvX7nW7nyOuunuiuyxXuCn738tS+CK0WIVVqEPP+3SobkIPypWtgZvypKCmpMizDpKC/r7OYtkC6gYpRDxsEZ/RaNVuLm7tc4tLJNkhH+a+ojt9abk1o6M0pVB0o4Bzo4THTQ9exojfMjM/xq11FD9rFwkLrvC2v7VZxKqJb01M/+hTuRiXD39CtB3UNhU6/Ds38l3v0UPPuiyJo0+02Vl31XFcN0P8nzS7PcLUDgaLnzC2tjX6nzxc/nZM7PvI4bdRSBeB7E8yCeFz/BO78x3nmpLEE7D9r5faWdr6xgsM5bBh2s83kdYJ0veU52lXXeQ7TrvQ0gna8IMUjnuylskM5vHUJuEkbW6QRwzoNzfsOo1hPZbgXd2q4agnIelPN7SjmvVzwY5wMwzm+dcT7TryCc7xSLdLCE835qCHzz4Js/Fr75TFVugW5+Hqbp/jLI14aWdA33WCMkZaf54x3xJztMHy8XPgjtQGgHQjsQ2lVDunaGtskMjvBm4NZ8RhkTQjPRkTfJkSsUy5/fyIPbqPZmab8NQ5XUA9tjqMoZpfJRt9Bdy5hLZ0BfmeS6OeRxRziuvS7p2niYa/HVN+tDrb1kYS7Gah48CbNNlTwpB3NhvHebghmAFYAVgBWAFQzMYGAGA7O5OMDADAbmvWBg9jXlQcC8ad9EO/+Ep4+i0U/hWM4V/mVxCnFEBMw1zg3VMtOkB/0y6JdBv9zsedsb+uWtnKxunHzZcaQJ7uXqZg7uZXAvG70D9zK4l8G9DO5lf+5lx15rO/nac+rlGtOn8Uiuld1pw0VgXq5lXq5zHvieSjqC99zDuybxcs16Au8yeJfBuwxmRQc/AHiXwbsM3mX1LvAug3cZvMtGefAuAx2Adxm8yw7e5ffR8tX4VxnitQ79siOIdwv0y2aL12RhzniTjSrVKfDBUS/bJ7pbhMDRMjAX195+EzGbfXlOPuYaIeydtIqv8IjRkOEXWVyJ+LP6FIneNOG75OPhas5LyChS+ar1kSVopUErDVrpNrTSpmoAu/TG2KULOwBIpkEyva8k066FDK5py9iDazqvA1zTJW/RrnJN+0t4vaMFlNMVWQbldDe9Dcrpp8KVm8SWdaoBzNNgnt4w1PWEu9uEvLabliCgBgH1nhJQlxY+eKgD8FBvnYe6rG1BR90pROtg6ahbKSWwUoOV+lhYqcuKE+TUpQAcn/ibNWNi1gjf2Wmqalswxl4wVheEAjyA4AEEDyB4AC1KwJcHUE/0n0C6d3yke3WkuLYdstffBHef153inaFrs8QPeROw7wVp23a52BoiRWtBz1NTsnnT163N3XbehbwtpyMrkMR7B2fvCFf82pxjGoV9VCS1Gb2nMsHSa2nkjqZk3WW8tYqu9pxxwoPtkt2DAJCa9lbFWBKI5q2CdcwpmeQzwh2joCdEmt7wUu1dBGXFyyLbJSrCNmK/1Nw6zHgjj9yjrEZ6CUkSQ7U+Q+pkMZa0TJP4N7F9DlwsAJraLdPoDO9E+KS8j/1JPveSpmYVfXbz8PuYkt9szKrcS1Z+a/z+wZPz1+jvJ+Xod8CRHabqh6UOSx2WOix1MPbDeQDGfjD2g7F/Xxn7W7qAQNx/DM6io+fvb/Y7ZQ2suALA5g82f7D5N98t2Bs2/ycIRdk4t399DAgo/qvbPij+QfFv9A4U/6D4B8U/KP79Kf7rt1zbMdqeM/03G0mNx3ytDFUbWALhfy3hv4fTYc2TTvcor8n737y6QP8P+n/Q/4Pgt7zvgf4f9P+g/y++C/T/oP8H/b9RHvT/QAeg/wf9v4P+/0M+i5vKBGBUuWfpADq6vA4kQUDjUugWjYBcAQeQK8CxNp4zbUDm0dyo4wl8++DbB9++Q9xBvb8x6n2XQgULP1j495WF32NNg5DfMg0g5M/rACF/yX+zq4T8nYS93gsCbv6KWIObv5sKBzf/MwDPTYLPOi0Bmn7Q9G8YC3vi4SfCxLablmDsB2P/njL2u2UA5P0ByPu3Tt5fo4PB498p1upgefy7qipQ+oPS/1go/WvUKdj9S/E1LcNrnoDovy46B2z/22D7d8kL6ARBJwg6QdAJWpQAiP9VDeDuA/F/JocdWN/qA5n8cwCIyHdzDbrC3f17vj2+uGckf/OPE63FTgfEA6cZu2xMcA7igU6R2LudGCDjLasNCuvG5ZZHmtf01hzuBtK3vsedf6vms3HytzQAQc9/hPT8fkoTTP222YKVDSsbVjas7G1a2SDth+EP0n6Q9oO0f3/cN+DvhwvnuKj8WzmN9KV5exkQ/BdmGAT/IPivdw/uCcH/00ajgOsfXP/g+gfXv7HJgesfXP/g+gfX/+5y/beyohqPD1sZtTbcBNr/Wtr/dr4K3xPUuhDpgq3622i6Sul9wn/wBKkCWi1OZA1A1gBkDQAvcHkHRdYAZA1A1oDiu5A1AFkDkDXAKI+sAUAHyBqArAHOrAGPH5LX+gD9ddlp0D5nwJVoywbTBUiCoUFGjhHdz5ePosxb/q1rhoCGag8wJ0DtRHcLajj0jAANi2R/cwBY1gIyACADADIAHGIGAIuwg/9/g/z/NmUK9n+w/+8v+3/Digb3v2USwP2f1wHu/5IXZne5/1uLer0nA8z/FaEG8383BQ7m/yeHnJuEnXU6Arz/4P3fMAr2RMJPgoZtVzXB+g/W/71l/bdLADj/A3D+PwHnv0P/gvG/U5zUATP+d1FT4PsH3//x8P07VCnY/ktxMa3CYtqHqqwRSLMLzP7esTM7zeVvkwVwDIJjEByD4BishqPtEJOWO57DmwZdM0xlVBLN1FMtaKf8osv8Cac8yKZq7+T223CIST2xPQ6xnPMrn4XzKmWVjC9tQTTeNrxzR2jGva472/m4W0C0b9ZBa7tMwN0UoXoElNvN2mYbhNsNA7/rFNsAvwC/AL8AvyDYBsE2CLZBsA2CbWvUxj4RbHdzC4Bee9t+jna+Dk9/R6PPw7HcQa7t7yjJqLUtJUCsXZhdEGuDWLvOq7dHxNpbPfjt6hb0PnEFd3Z1/wd3Nrizjd6BOxvc2eDOBnd2hTvbe5O1HaftPVu2t1nUeO7Xyka1ISNwZTdwZfs7HnyPPh3Rhu7hXpsA23u9gf4a9NegvwbBpYNaAfTXoL8G/bV6F+ivQX8N+mujPOivgQ5Afw36ay/667e/SW8UaLCPhAbbOeHdwhBAh+3uy97QYZfWBGixQYsNWuxDp8UuCT3osbdEj11WrqDJBk32YdBk16xs0GVbJgN02XkdoMsueW32gy67lcjXe0BAm10RbtBmd1PkoM1+Nii6SThapytAnw367A2jY0+E/KQo2XYhEzTaoNE+CBrtqiSATjsAnfYT02lb9DFotTvFXx0JrXZbtQV6bdBrHye9tkW1gma7FH/TKfwGdNt7T7ddlg0wD4J5EMyDYB6shr3tKL+WPV5kB+m3m6PZQMO9NRruNuGlh0XH7QnlQMt9HLTc9VoI9NwAywDLAMsAy6DpBk03aLpB0w2a7saLcRYjZf9outu7EUDX/VR+kXa+EU//SKOPxLH8Qdvd3rFipe8ulQSNd2G2QeMNGu86b+Ce0nhv7WAZdN6g8wadN+i8QecNOm/QeYPOe0fpvL3MpcZzw1Y2rA0hgda7Ba23n4NiP+i9vdYfaL5B8w2abxB5OighQPMNmm/QfKt3geYbNN+g+TbKg+Yb6AA036D5dtF8k2H5fTK7vVrNWG9/Fy1HdzvF7u0sYmv5VdlSBuW3CUIrlN+1k98tcgFM3+6+7DLTt2UpgOAbBN8g+D5Agm+LrIPXe3O83jZVCjpv0HnvLZ13w4IGi7dlDsDindcBFu+SU2ZnWbxbS3q9XwPk3RWZBnl3N/0N8u6nxpubxJx1KgKc3eDs3jAE9oTBTwGFbZcyQdUNqu59peq2CwAYugMwdG+foduhfUHM3Sli6nCJubsoKfBxg4/7aPi4HYoUNNyl+Jg24TEbClkBJffzU3LbxAPkgiAXBLkgyAWrYWm7Q6HlDuzYDQJuvyAz8G5vkne7bYzn3tNtt4Bs32wcvYF6e5ept5v1Dxi3gYWBhYGFgYVBtA2ibRBtg2gbRNuue2kW82QviLa7eQnAr71lt0c714en+6PRBeJY7KDV9vab6BupbvcASLRBog0S7WYf3/6QaD/9sTAItUGoDUJtEGqDUBuE2iDUBqH27hBqextKjYeArYxWGzACj3Y9j7a/I2Jn6bO9VxtYs8GaDdZs8GI6KBjAmg3WbLBmq3eBNRus2WDNNsqDNRvoAKzZYM32Y83+WAp3aE+b7Qgn7k6b7Z2otR1DtiOGRDZfnSMfOk32R0dwS7tQBPBku/uyPzzZci08J1G2j0T2TlqFa3iEfMhojixMRfxZfYrkcJrwNfvxcDXnZWQUqXzV+qgTxN8g/gbx9xrE31JHgPl7W8zfanMA9Teovw+E+ru6osH9bZkEcH/ndYD7u+Ra2hPubx9Rr3fPgPy7ItQg/+6mwEH+/eSQc5Ows05HgP0b7N8bRsGeSPhJ0LDtqijov0H/fRj035kEgP87AP/3U/N/5/oXBOCdgr+OhQDcU02BARwM4EfKAJ6rUlCAl4J9WsX6tI+/WSM6CHTfW6H7VrIAjkNwHILjEByHFiXgy3GoJ/pPIBQ8PkJBL+JfW8GWTIRe15h3lXyuEILkzVG/F+RzT8op54xDrUVAT00q583Htzb73HkX+rmcMq2OQd8j/HtHKPTXJkjTkOyjYuPNeEyVGZZeS4t3NCULLyPoVby85wwaHmyX+h4EmtT8viqCkxA17xusfk7JPp8RCBkFPSHk9IaXaiMjXCteFtkubRHQEZunZvxhHh55WB9lNdJLSLYYt/UZXyeLsSSLmsS/ib104CIh0Dx0mXpnrCeCM+X970/yuZc0Navos3d6gnpz8pt1LEukItifVARW/Y1cBDDUYajDUIehjmQE8B0gGQGSESAZgfPyr8Vk2cNkBN7+IGQjOCrPEdIR+Duh7PkIZAkkJChdYUdCAiQkcF9R2NeEBJsOUkHyASQfQPIBJB9A8gEkH0DyASQf2NXkA3VmUeO5Xysb1YaMkH2gTfaBWsfDmkef7uHebPqBuvWG/APIP4D8A2AYLm+JyD+A/APIP1B8F/IPIP8A8g8Y5ZF/AOgA+QeQf8CRf+Dv0fLjHa1LYZWvk3fAkb6ve94BdxGzyZXs1u2yEDS16+AyEDjmu1vUwaFnHmhaHfuaeqCwCJ4z5UDmp9yo8wgU/aDoB0V/QchBzb8xav6i8gQlPyj595WS37mSQcVvGXxQ8ed1gIq/5GXZVSr+FiJe76EABX9FmEHB301xg4L/yaDlJuFlnW4A9T6o9zeMdj0R71ZRr+1CJCj3Qbm/p5T75ZUPqv0AVPtbp9qv6FtQ7HeKbzpYiv12agnU+qDWPxZq/YrqBKV+KX7FK3xl3ZCSNcJfdoFY3z/GZYeZ9YuiAKI+EPWBqA9EfdWwsZ2ho7KFX3jTkmuCpoysoZm5yZu1qSn4y5+pyYOlqfb2a78N9ZbUC9uj3sqpsvLRt3B/y3hPZxBhmfHbP9xyR5i+vS4U29iovZDYN5sDZbvMSd0YN3rwpNR1SmYbZNRNI77bbNQAtwC3ALcAt2ChBgs1WKjBQg0W6r1loW5r9oN9elt+jHa+DE9/RqNPw7G8j5512sMRolpoM/vBMg2WabBMN3vr9oZl+knObTu7+7wPTEE2Xd3uQTYNsmmjdyCbBtk0yKZBNl0hm/bfZW3nZHvONu1hDjUe5LWySW2YCCzTtSzTPg4G37NMR3ige5jXZJf2WF9glQarNFilwRvpYDQAqzRYpcEqrd4FVmmwSoNV2igPVmmgA7BKg1XawSrNjruP9Mpsh90pZmnvZKXtuKS9s6cdCJV0zSR3Cyc4dDrphgWyr2zSlXUARmkwSoNR+vAYpSuCDlbpjbFKV5UomKXBLL2vzNK1qxns0pYJALt0XgfYpUvell1ll24p5vXeCjBMVwQaDNPdlDcYpp8UZm4SatbpB7BMg2V6w8jXE/1uHQHbLj2CaRpM03vKNG1b/WCbDsA2vXW2aaveBeN0p9ing2Wcbq+ewDoN1uljYZ22qlAwT5diXLxDXNqHnew537R3HMwO001XZQCsfGDlAysfWPmqoWU7wz3lis/YCdppnygxUE9vkHq6XXjmvtNPe8Oxb9ZBZrtMOt0UXXrwnNNNGmYbvNMNg77btNMAuQC5ALkAuaCeBvU0qKdBPQ3q6WCfqae7mP+gn96mP6OdT8PTr9Ho23As86OnoPZ0iOj7tuWnQUVdmFVQUYOKus5ztzdU1Fs8yO3q+vM+QQX/dHW/B/80+KeN3oF/GvzT4J8G/3SFf9p7k7Udme05/bSnKdR4rtfKJrWhIlBQ11JQ+zoZdpWG2nOdgYoaVNSgogbZpIP+AFTUoKIGFbV6F6ioQUUNKmqjPKiogQ5ARQ0q6gYq6sp1VRBRHxoRdS0ZD2io1b9Dp6FWqwAk1CChBgn14ZJQq+UJCuqNU1BrBQoCahBQ7zsBtWUtg37aMvygn87rAP10ycOy6/TTXkJe758A+XRFnEE+3U11g3z6CQHmJkFmnXYA9TSopzeMeT1x75axr+3KI4inQTy958TT+doH7XQA2ukno502dC5IpztFOR086bSvagLlNCinj41y2lCfIJwuRbJ4BrKAbnqP6ab1+gcPH3j4wMMHHr5qANnOsU0V4zB2imraHQkGouktEE37hF8eCs10AwgDyfShk0zbdQsopgFsAWwBbAFsfYGtcd8NBNMgmC7eBQHBNAima0NbQDC92yY/6KW358No58fw9GU0+jMcSxzk0j5OkBK1tHoWxNKFGQWxNIil63x1e0csvfEDW9BKg1YatNKglQatNGilQSsNWumdo5VuvJoEUmmbtfnEpNL1roVdp5SuXWMglAahNAilQRnpIDQAoTQIpUEord4FQmkQSoNQ2igPQmmgAxBKg1DaQSj9MVl8mUyTh3WYpHUdFbN529TQTpJq3aIr5fuoIYmuBC3xWYCES4pkVAg/AVstUHwN1WqSv2CT9CyVLuKF1MgsNat7qYBpW1eBqulqEdnc59fDLAJkONT8TSVeHSWG1XiRrOCAdnHeGdOqNNaVIqHsFb/vr8tlXV1drUMX2rNTb5Vu2nvJ7SvxtO4HGKfBOA3G6cNjnNbyDarpjVFNZyoTHNPgmN5XjmnbIga5tGXcQS6d1wFy6ZK3ZVfJpf2ku95JAVbpihyDVbqbzgar9FNgyU3iyTq1ADpp0ElvGN56QtxtwVzbzUbwSINHek95pI1FDwLpAATSWyeQNrUsmKM7hTMdLHO0tzICZTQoo4+FMtpUmFvgim469meDvm9hl3YyBzaFjRwsZaD/+f/Bkwc6IgW2wRroPeq7zR+YjRiIA0EcCOJAEAdalACIA0EcWIrlA3EgiANrDzFAHPiUxIGlCDowBm6DMbAmDNmE2KAKfG6qwPoQf9W43EwDOaAxhyAHBDlgXXjF3pADNrkDn44VsMOVMPADVnd18AOCH9DoHfgBwQ8IfkDwA1b4ATtst7YTsW0yBbLSyY7TXXfWg3t21/HGqZ1Of3LB40baQacF38g4WG9LeXHveVEMduZ2s93RBfkbyN9sJ1QgfwP5G8jfQP4G8jeQv4moSZC/gfwN5G8gfwP5m1ORPDH525twRmo7WaXfxdF0nK7FAWeP5pTJ191uAnU+aDkpcBYpNfqqbOi2o5DTh/qlWtURYA1vHG8c46Hqn65FRNPmZDv5Oac60o3TYTyLl3E4lSUve8XgMeF2loOWDm8ibnh2Xiyu5q5LyOac8W7nxJfGKGyKvs1yfPwhkaNovk02oL9dtremBPF7yvFWWgXPSfVWL3+9k1bn6h5n8/LYPYsnEH9WnyKpmyZ8HWU8XM156RhFKl+1PqoCaR1I60Ba14a0rqQdwF23Me668lYACjtQ2O0rhV3NWgaTnWX4wWSX1wEmu5LraFeZ7FoJeb3jBYR2FXEGoV031Q1CuycEmJsEmXXaAbx24LXbMOb1xL1bxr62+3egtwO93Z7S21XXPljuArDcbZ3lzqJzQXbXKXzrYMnu2qomcN6B8+5YOO8s6nML1HeSyM5xl0YH1mSXZtJ5aFyEESCQRoZPXgnHXlvPa69zpfZX4SxRuFa7Hk1GoaW+KECvykpJyoCTvC9GiI5nhM76UTNrxPh4B9w47/U6rv+4rvvqk0MjjKchUONid0jhKowVGTtcWR5AEgeSOJDEgSTOogR8SeL0RP8JjGzHx8hGTWvYFnv9TVC5eV0O3Rn2LnsoUR2JVzEMfh84vLZLzdUcPVqLd56aocub0GxtKq/zLlxeOS+VqUdaBWrXBGjXDqP9y46hv/31+ac0APuoyEsz2kdleKXX0rodTcmmy/hMFY3pOUOEB9vluweBHTUdqoq7JPzMuwQrm1OyxWcEOUZBTwg2veGl2rYIxYqXRbbLVQRrxFapeVaY/UQevUdZjfQSkidGaX1G08liLCl6JvFvYuccuK7Xa5qvTJkzshMhlfKe9if53EuamlX02U3U7mlAfrNJW3KX+dubIvoPnrW9Xntvg7y9GYTsMGU7jHIY5TDKYZSDuR1+AjC3g7kdzO17zNze3vcDAvcj8RIdPY+7l8NJtdHuAACrO1jdwerefLlgb1jdnyz4pKvzzzvqAxTv1X0fFO+geDd6B4p3ULyD4h0U7xWKd+9N1nZotk1id1rOjVzsF7Xn5o2E7F5GUeO5Xivb1IaJGjja3XdYa7najZHwObps1dWtHmW2O9Lc0NGme6CL1Jj1tlWBllEuNq81VrtcahdGx3COlkuwjywAyAJgO+1EFgBkAUAWAGQBQBYAZAEQ90iRBQBZAJAFAFkAkAXAqUieOAvAew4LvCLZX6Tx1+gHuX3tRy4Aa9M3lBHAWveh5gVoWAPdog8OPTtA22UpK9rXpAHWTu1C6oA6QUUCASQQQAIBJBCw6gikEdhYGgH75oBkAkgmsK/JBBpXNFIKWCYBKQXyOpBSoOSH2tWUAh1Evd6Xg8QCFaFGYoFuChyJBZ4ccm4SdtbpCKQXQHqBDaNgTyT8JGjYdlUUSQaQZGBPkwy4JACpBgKkGth6qgGn/kXCgU6RYgebcKCbmkLaAaQdOJa0A05ViuQDpcigVoFBmwrW2fNEBN1iQvYiP4FdcECICEJEECKCENGiBJClQNUA9sHaLAXd9sxjTF5QF8aEFAb+5HS+say1wAiJDIqnovZEBu0jy5HOAOkMSpZoRsjRyiT9ZvPW6S6nNuh4HeHgMx74KPtt5D3oDGt2OB0CfADwAcAHAB8AkiLALYGkCEiKgKQIjki3/UmK0NWnhNQIR+V9OvoECS0cWbqlNS4FJEtAsgQkS2i+KrE3yRKeJVims2txzSgV5FOoggXkU0A+BaN3yKeAfArIp4B8CpV8CuvuvbaTuj1Ps9DCtGo8Umxl59pwFJIt1CZbaOO82NWUCy3WGxIvIPECEi+AWrm8JSLxAhIvIPFC8V1IvIDEC0i8YJRH4gWgAyReQOIFR+KFKyq6ybwLV6IpT5F3wdbyNdMutHxX2St2IHkY6pdEtxiHo03DULdy9jULg61Pz5mEIfN2btQFhaQFSFqApAU2WUfOgo3lLLCqUqQsQMqCfU1Z0LSgkbHAMgfIWJDXgYwFJQfOrmYsaC/p9T4QJCyoyDQSFnTT30hY8NR4c5OYs05FIF8B8hVsGAJ7wuCngMK2S5xIV4B0BXuarsAhAMhWECBbwdazFbi0L5IVdIquOthkBZ2UFHIVIFfBseQqcClSpCooxdK0CaXZUHjLGhE5O52owC/eZofzFFiFBhSFoCgERSEoCqshbDtDxFUT7uHN7a4ZqjICimbqKm/aKs/QM3/GKg+2qtobvP02FGRSS2yPgiynDMsnwcKjLgNSneGNZfb01vGgO0Ke7nU32kbw3QbIfbNxTLeX9N61Ya4Hz+7toZWelNy7bjZ2m9sbuBm4GbgZuBnU3qD2BrU3qL1B7W2PCtkfau+OHgUwe2/ZRdLOTeLpKml0lzgW+9ETe/v7WFRDa1wJoPUGrTdovZv9gXtD6/0MB8sbJ/X2O9EFp3cVJoDTG5zeRu/A6Q1Ob3B6g9Pbn9Pbb+u1Hc/tOaW3v1HVeIzYysC1gSgwetcyerdwWviepDriHt2jvSaht/9qA583+LzB5w3GTgfhA/i8wecNPm/1LvB5g88bfN5GefB5Ax2Azxt83g4+79f6YPzVbNwqHaxPaPaHfIk8BcN3Y1+2Rfft8eID5f5usXy6xUQcLRG495raV1bwxg6CIhwU4aAIPzyK8EbBB1/4xvjCm5UsyMNBHr6v5OGtVjeYxC0TAibxvA4wiZdcR7vKJL6m2Ne7YkArXhFw0Ip3U+agFX9WWLpJaFqnL8AxDo7xDSNlT7T85IjZdrUUhOMgHN9TwnEfaQD7eAD28a2zj3vpZVCRdwoMO1gq8vXVF3jJwUt+LLzkXioWJOWlAKHO8UHbCNdZN+ZopznMOwQR7TChebO0gaURLI1gaQRLo0UJ+LI06on+EygRj48SsY7Q2Hsv7fU3Qbfodf96Zxj2fOOvvAn85b0Ac4m6LgP4j8H22PmekWqvS8hrLdw6IN49zYhmY95zZRpYL/p8R9IOOCLtM4a42qi2bqx5eXR9TW/NgW+g1+tvMptCZ4vzm+0an3uZZ8H/FsHBJ11oq3yfNANDG8Cyw+kYYPXD6ofVD6t/q1Y/cjPAEYHcDMjNgNwM++g5QqIGeI+ONWtDR3+VarWvywL5HJDPAfkcfHyUe5LPYadicDae6aFD3AvSPlRBB9I+IO2D0TukfUDaB6R9QNoH/7QPHfZh22nhnueA6GiiNR5xtrKdbVgLCSFqE0J0dY74nvLWhZUXDOHfRtMVv1Y4LJ4gjUTHBYucEsgpgZwSYI0u76/IKYGcEsgpUXwXckogpwRyShjlkVMC6AA5JZBTwsgpIXxSzngHZ6C+EfxwwaeA64Xb85tbOKL48cEr+s9ny5GZoxbljlDHYuyzSC2XvOuboD5mbcPY69On+ndl3pHPn89LNb/ieRB1cAM+fzai+E9PT6/EZDEflHYxCropEWapJynMNhJWkLcxh/bKSTF8moIRMw2uf44W96QhqMSbaBYz22rMocikHV/pOV8EwniOUvanK87WoJyaoejU/WdksI5Ts83Y5SR/KNBuVHlKKqhl2RFPOCn75j68jUcy6LXgJ9cr5iYiQVrIkHaOixtmvtmhKCq/GQ6ti77oklGaSzphwkL3q/6b3G+bC4dK9eE792JdVRUpbVrCX5epZj2VeZPygPYwuC5kOb2uEMePozltTJJxP8k3Td7DtdYrlMlDt2gq3D5D7S/sOUgQ/x5lJ69BupJLWvLmC29NYbEO6jySpMvmj+J4U86kvP2gjoU4NrZQVa/vE7a0dT+m8mEautCZwmKdLLYiYEq7610vyK6D0A8bEv17tCwtL+bCi1PrxBQGe6ifK7nejYXaIlKudrDaBXBd+ieXaQwl4vgPWn2j/FDNMlAW8mWrs7JTrhn3uNt7+KkrR+hPX86704tyCyMmMQ4L4aIt6ynvR/aKPvs5l1luM35HK4Km/VRqadryyv4A2ljni+QrW7T3ySKya8tCjOhC58XQ5mJZHNhqvE/EqdTwj4H7GWVZnjocPVm/eg4qMGPvzs5KdfP+OHMyiMldkSMeZpKhSIdenMmm2heh0WB31cL9JC80nP1uSDoVoaF2lbq26dteHiGQRaoM+GS5f21JCCCt3ujEniYnk1+1x1/zEc/1uaa8Dq4LDGLXcnOMYuH1DktVWrBUTnsuIBVtv9ciQPa6H0hv2XVJbsrbtyUWg7BPmararhuapb1vPY9dv+ZSpzaQFqVQn7wzQ+LpvZI2tZpcMYbrMzi30e+aJM0hNP8nWQmvRhGPy1wDNG5PK36VMMusRZXr4nVXVJ3WZhebUvbfME49DDyrjVkwzf6R39iVNom6EcjOFNvl3dyoMs0yZd9xLb1EtaEfXJuLSr/+OkhufiUlnRWm3Wq8GskAxvxGYv7CifEpZ+O6ifSXDmuNSsjdyUTeRYPo4sQRzdHNLnPaZk9nmZijNjoG8+QZLBNa96vpsmQ1FBfZwH1XvZU9IMpf2lalTyRHcTuUzd7Q9mfZNKR6aUf7r9rUSCYvnxtkqUMWhoOreRzyiCOqpKLTpaievKj5F7yWKUfeL1c3aVD35ImKZkyjjHhoEU2jr6EKv9fO8nDER5uS5vRKDF+g2VOD93yQdfJCf8B3z4tu/mSyZCWoq5qmiQoJZTpmfuVtNBNO+LEgQBV3+O/Fc6SsT0ZTsteCYebQWd30bHdkqKcD/lLfYSrcXZOIeV3RNjy1Im3scOixZ/qwgWgekP+0PESfC0U+eKt+sWcCZmBwUd+9KzPG3JRNpxON9uySc9bkzvwoSaCzBaE9aOI0S+xZTN2qzyx1kpzCfn0uswTpNFlG5eIyb8qhWPHyUfDcZoHbL/kNtKUKfm2ZMWq5EBQKs0e9CHWWAO18K13u12HvHM69iNhfF9NyGwTvZBLHc2Wu6IRVvH8v+Cq7vvIvD4I51vml3mjN6+J864+FPiG1uojH+vCLaSgiySv7G/eHlLE5GPbL7+/08CmTprQMyHy6Sx740IvJgdPg2pzYa86pIt6ZkoEpdsrp9NG8lv5Y6qn2fs5XC0EwzJf9JdEFfZrK8TQ5UMSkcoh0i/BVXWYgjwvfvakEsBY3giz21F84+hYGczUL4ki9MoqSk0MmfygNIe2P01JazyLcynwV5seORLHsa+aFIf+sNqO8PtSJ67s3tJ5uIhKEkkckG0yjGdln+RWSSmo+s5zPFFnyWRfuC+Q3XmuuvRj2iaC97rEzo6xIRevu+K7HtJwYeVD6vFi7d0bl/Nap4+5NCer4L8eyQlcBDdW931wpl26YlM3DZfabg/vjFdvovMDkCOWcHUofpln6Msn8I8IWbhPNgMMBMEZtIkTsnKNepKaVR+4ch5LxKagXSaV2x6qW0y+NFkkqUv4Zlcmt+aQ0tzpaelia0wG9JftMBWiWvLSKvK6yvZ/nM2thkVKwlzd2PWUqel+xmQgMUcMxJe9kFO+UCzSiWtvPsEp2xskwWDxiohcNUHxwhA94KNgFVgjhYB37z3Y04A1VJ4svk2nysB6U+ea5UY3PkUGmAD55W2uBPxVduxj6FlPSZv804qoaNHWdVdioaD3UYF/fC1YSlCEZTUJ0UXZtiQcbb/RqSg7xs3JJtxhhIeJRWiAcuWT+TuriB1W4uN66r9TSPteiTUapwbv89zYE+2qoypeYNuw/MSZO7FyNlcrH3FUqVW3UrI5GLoMz8cjZienUoz1HX0nNUq6bi+RDIrkhTmpvg/RtsQu8iZcT2lQYXMRDTU4qGxVLPlouF5SL76VpU5QjWS1dGK3q16tZuHh0XOORXHfOL+Uaky4xv/VoIZOxMfCInxWWnbKsX+pfqo94IjfpkaOpvHDdVzIRpcj37IhM6tdfYuKyJw7DSS2o9ltFxXz6RYXOGlokUICNISSZiIQhV4u6W96C2zBm818EwzCeZXcPZ4fWpH6L1bQcV2oKhjICcn6pMleTRVAumwUn36TEaxru5Zdl7dJH8Jy+X02QVcfkw+ETDZLmsW6Nmbs0frfFsovbRJoDULhwrk1Zupa3GzRb5KBe8Kq2jxAN01j7Ej26pcRYcHXRrAb7obBy8vWmMqsH14Nw+hA+pppfNJ5YA4TPVST2fXSfxP+0xIObLHe0l8pKL+pujuaC2nPT2pQGpLazhXqrUv2ghJlQ63I4jcJ0OUxmris/vYYEtRfW2xnmvYuaCpJFfMuB52QRxkw2xeH2matXfhbPGurIHF+DORvASy6tCGAfvk0ETwVX1K/NAyu8elyLMGSvS4N97c4OOzn7vQhE/hj8rvHDH0HvdybeKdXW/6N/Vpf298efPry9yLOV3YmEpHw8eP3z26vhx5+u/u2773/6eF1Tg6ZQYH8nO+2yQREZyiI+0pRXLGrqEP5VzWt5E0U0DaE8qlyI4b7RxKg1dazEgUB1YgYtaAfzxWr23pcYMMcwtcdSYoO1H1itgzD6J7WSXjZMPiwePyTZdePX5RPVBkPFWhqGi2G4yNTDgyxFJj27fBTz+JZ/OwyLxboMmi2YutVzjBaNdTyey8JpWLiepo21SzB1YOrA1IGpA1MHpg5MHZg6raFGg41TZ+GUzpQ6WjqlWmDxHLfFU1oObS0f+2qCBeQ8kd9/S6jUNVhEsIhgEcEigkUEiwgWESyiLVtEpLK/T2a3V6sZ37v9LlqO7vwNIUth2D9HZ/9YVoGH2eNeO0dp7ViGY8+NHEuPYNvAtoFtA9sGtg1sG9g2sG02bduUb9pEy493yTR6X7yj13TjxiwFc8b75k20OJA7N+b8e9y9sSyXo7yDY47Dbt7FseV+tt/CMfsCowVGC4wWGC0wWmC0wGiB0dIeY7Q6keHkrMxclaUv8jZcKiVhvBzbWUxlCTTbL65Vc4w2TGUs9vsIptIdmDIwZWDKwJSBKQNTBqYMTJntxpZp+FFhrfa0Y1Q5WDHHasWoBeBvwxRXzDFbME6kv4/2i+oMrBdYL7BeYL3AeoH1AusF1svGo8fKBgxzZF9xio80/hr9IHPleFsxtsIwZXyiyewjd0i0zrYeNls5NSvqGE0d23DsXNxZ3Vr2tIJsVcAUgikEUwimEEwhmEIwhWAKbQh/NBtIhQRSMjPQ1hNIIdXTeqmekJbJmpapaAa95syH/ta9fLxiz2/RZt5ld0G9Pa/HqmzBO8zcwtD6GrYWtG3Jt1iDvMuoe4M5tlvi8wI2X9/9UKxcofkzOcilXT7D8lWT1wPGN0B4L/huNYBlWysmbzMK93RjbDid+qanjP/Z56uFs0SW34Z7xGn3eflHirrB0yPiWBDdbEleNpelvy3jZAJE8/EidCzZVqYNJFOtOkZL2mCXVbOsa4VP7+Q5DyQioYe8HT7HkRSxU9ZCD921Qb21aZ2lEheen3S5SFxN5ueb5tAKDiyGl0utOT2+62f8a5ntr0GH+SBgu2hvTKwbRfo9dW38a0R2x1d/XG0WArr20R/FEfPE2JZhBtLeDtI2h3o/8LbZ4uNG3TVz12JDM2vZPQRu0x+eOLx2oQCN7xMaRyrAjnH2e47T7en6OuF2j5R1XZP9PRGubxVQtmaOuwMA+MimA6VhyXizAeVRm+1l3bw5e6pMfNLEHIJSOVpC+uNSITbS+G6ao5E5vSPj/P7oCV+m9cNTDzICpat+kKXhZuyif/zSOhRGGB7G7XgYrWO+H65Ga9OP2+foM5vdt0dZ3bN5IbeSWsSxauCA3ONwgCNibm9Jrb7vgQEFdvVuAQJupvG2nOw7ETBQ1scdKckPAN0fI/fpUZn9VX7SThqggaezC7Pp3lj7fqSeB6QMjoU+7CgVgab4WksNWCWgPTXY3qmAOl6svVQAJQ3wJpzdRotklX4XR9Nx6q0BSuXg4Nugg88+tnDtbce1Vxrt/XDqlRp93O68+hlssdmVKtpzF17TGoHzbn+dd++XySLqzJtlLY0t3OsqgH3ofO8E1Aw89vctXQ6wjfme3BKwNf3Irwt4zGabewO26nbwAkGd1vG9SeC1mAAK9hcUHC+X5ibILvfc22flu+zk8msmfexIlvncJ4H+RE3rkUTup1+wxDulGIrWYp76Zh9IqMA8BeYpME9tnHmqbJA09GS1iseDX3559+bzVrirYDWDvArkVSCvgm0L8iqQV4G8CuRVIK8CedU2Yfoa9FcA6+C/Av8V+K/Af3XAgN7wW3YCAo7ywAQ7jAnq5wzwYFuX1+3DvifX1+2NP/IL7F4z2oobylrhQUEJ35UEVLHPqAKkmiDVXIcXD6SaINXsoCxAqrl3SgOkmk+iTECqGYBUE6SaINUEqSZINZ9f/2zPubkBWk64NsHLCV5O8HKuu2rgwtzjSEfwcoKXE7yc4OUELyd4OcHLCV5O8HKClxO8nODl9NIA4OXcZR/hesye8A6C2hPUnt18gaD2hP8P1J5AAetTe27vxuQGyEEBEcAOCnZQsIOCHRS4AuygYAfVihHsoGAH3dzxRBbb/Wo2Xs9caawJposXCWPzMD4dP6PnlMKk2RZ1Y9ME7AmrY1M3jpzwseUst+GCbKp6B2kifRWgL4Nk68UH02ifTKMS2/mHMP2SrkV1vrv85t+A6vyYqM43QZR6zBhbv/BmOfz6l3A6vwv/MliyehD7DCuKd+MnQNGNVKZAyusjZRsJ7Y6iYTsT7FEhXttstQmdr9IG7wJyraEEbrkYgEB3FoEa0LP81SRZBD0e8+BrOF1F/SA2kepguQjjKb1pqCez179gOMAvuwji2xnZJp/u43R0HoTL5eIlQYB4Fo0/V94jpn0S0JuCy0uLgGp9/OHV+38bvnsz5F3qwlqLAal9Nsues5LijnO5YR3UavMZkA4gPNBrqIf7Jjbxy/KG3pOzN7h5pPa5K7EYJ2FMy7jQ9wH1faAEf/D+MV1G95VAcJu2NWchWiyShZyGdzOJbV2du5cWreAJFGst0yABLayUP+BFyn0P0tFdNF5Nbc6FPui9Dx+WgrbzCUNTwOoNVm+wegPHAscCxwLHPheOBVH90aBb8NODnx789OCnBz898DHwMfAx8LEXPt5+ygVg4x3Axi1zHwAZbwIZN2e52Flc7JNR4shQcfNstsLEjXlL9o7YwD8PCRAwEDAQMBDwziHgp8knBES8Y4i4RSIfIONNI+P6VE57gZCb0iQdMVKun93OiLk2WdeeI2efpFtA0EDQQNBA0LuAoLeePA94+fnxcss8doDJG8+PZUtXuB/psezJAY85O5ZtLttg4cb0k/sHgX3zSQL5AvkC+QL57h7yRV7Yo8C+SA6L5LBtoAySwyI5bHsAjOSwQMBAwEDAu42At5HvGIj3+QnMfPMQA+lugMisJrP0rhKa1SZ1Pi5is5rZa4Foa3KD78LNOGu+747LAxAWEBYQFhB2RyBsJS9564Td5TztgLI7BGVdkwQ4uyU4Wxnw/YC0lWYfN6xtmsUW0LZS1Z47aptXChAuEC4QLhDujiHcStM98a0qB3S7u+i2OEXAtlvGtmq49wvZqkYD17pnsAOqdYK/vcS0rjUCRAtEC0QLRLsjiFZnh/OGsroAMOzuYdjS3AC8bgm86nHeD9SqW3vccNUxZy1wqq5h92IKcrlvxbTrXBjAqMCowKjAqDuCUd+EM4IfySr9Lo6m49QbqpbKAbHuHmK1TxGA65aAa2m49wO/lhp93DC2fgZboNlSRXvudW1aI0C0QLRAtEC0u5IUeElL8yoarRZp/DX6Qb7EPzuwrTTQ7Q6mCa6ZKGDcbeULtg36niQOtjX9yDMIe8xmC9RrrW4H06fZFUe75MJeiwnAGMAYwBjAeEeA8RWNcWdcbCsMWLx7sLhmnoCKt4SKbWO+H6DY1vLjxsQec9kCEttq2z1EbNcZrQCx10ICHgYeBh4GHt4RPJxlsnk1G6/nNG6sCUh595Cy76QBNm8JNjdOwH5g6MZuHDegbjvLLdB1Y9W7B7U9lE4r3N1+8QGEA4QDhAOEPxsIPzkZTUlssnN8ubkseBmkFxJFDUcyp+SFZQWqr9KBpB5X2SdlOUb1w2E8i5fDoQu8t67aiqqzJXFRvwlfmciqI2bO5cv1KqmFhlK1qFYHn3w7+Ll/Utx41WPUCvVb6fus8/RE9rucgRd6WoN0Ho3iSTxScC+9KFtftJ+2IGOWj1fsKHNK1KJrshBoyUbL+D7Kfgn+Myh/xf8ZR9Oy4VMwX4xJ4KUr9NjbySQaLS8qbaJaolm6WkTDuzAVtf+TKu093NG+o5/JZ0HI0KXHi1zmwzYtB4fFIGdZGgxncrLO7Bhdm1/mhFptLKudJaah1EI1gJe9YrfFTL7hDtMvTBvAP/8vjftgljz0+sG/ZCX7AkDke3gVkKoHz90rpYQYBOzIitnMxIKsDdTchvN5NBv3+A/jUbWP8qcnZWpzHk1/SnP+CSHaCyESVdXLkDmdEKGuIvQ+Wr4a/0orgawm/zhRoxAEai8EypyyermyTC7Eq6t4kb0wS8MRL/dOkuYoD6HbC6FzzF69/NVPOUSxuyg+fkgyl6Ey/1oIoqU0xHBPxNAyd01C6J5uiOBmRPDtb9Lptp4olmqBSO6hSJbmsI1o2qcfItpZRC053rumSxaFIZD7IZCWqWuQQ/dkQ/w2JH5bSVcOAdwDAbSmX66XwOak5xBBn0OFLeRLhcjt5CFDTV7I8mGDb7ZViJiHiG0znxtEbRdFrSlXVUncWmWEg8i1ELlNJ5iBuO2yuNlTaDiEzSNBDUTNQ9Q2x3wP4dpF4XIQfpekyocyH+LkIU7bIumFcO2icNXTkJZkrAXJL0TNJxjsCdgDIXY7GR7mcTmtHCfW9tooRNBDBLfPUwQB3EUB9KBeKclfW7IjiJ+H+D0nLQIEcyev87S8wl2+6bMO0QJE1iqyJycvav4Fr1Y0fYv4n9EiDeoePHlBu+00+hrOlsEy0bQPi/SvQbxYGF+MpnE0o7V1cpIhH7XyyuLJn72axmFKK955C15VcpKpcTn/vKbr6vv3XKSc9+vNW2VGgf9saEyrEpaY5ELBhrQLfi+piS3x7JflvM6vpN2m9BybGgH3q6FmU/erwFfflC4i5zIjRb+qdEN6QvxHidYgL/KpLBfngWVxfz4/Ubd5veSnXKco6SsslteL8m+iESm5ZFZXtlXXB7pG/zvYxjYvBda5yZ/U85PUNOuKVO6nkg7PzXR657njS8dNY/6X8yVUCZFGh9IRUXyX+mG/tNrUjdvD6Ia51+xSb2qvYjV1Ko2oYQfXK8etpV3qn+9duqauLvN6hjs7mZvqrPUizG511OdiVvOcPg6XgiNE1lMhYTmYntZen9jd7jZd82k9wZGqcPdnet2u24ypneqtz62Rxvmlp4dTqmW4kNUMJwfZT2vM9w730nEHof10PhxoTwueip2C7LUR7Y0WCAGjBy4unayH07FKaOouda05PLqpexOqYcjcq7RBHmQHS9GOu9g5V6yt/9yFh9c5HU+3S31yBm42debhkDpT8pjvUp+aYgCbujbW5YeTg+ub9XRgp/xRXqfmje42roWaqqoZ3h9qR21HR7vUS6/gpKZOMg/5bk/mRrrZeIq3U0ctrSNdGo+TMi9NOBsP90CCNz8EL4Iff/rw9iJYCXLp6+F1MF9Ek/g3wTN9PRxHk3A1XV4HacL87Ez4zpEKyXQajyOjEpFFIZw9qpiWgGNa0oDqHEVBqKqMxqL+OOW6b+LxOJoFN49GJclqIXMHjIL5dHUbz9JB9q1uycW6I90UL3Fum1YZbDDUwQb/P3vv1t04jqSLvvtXsJ0PlqZV7Ms5az94jva0Ky/Veaaqso7t7Nyzc3nRtATZ7KQpHZKyS11T/33jRgogARASSYmkola305ZIXCICAcSHD4HMNNzSFQh3dhu7fogXQF6wkPkv+NPpV4u3g8TzVysv4MnE7wTSSymbdbDgm6ZSvn5s7nxTWPxYzjHPsqH/g+RSf08ymJe5Oovzt35EXmZpqDfOwxJbQZaYmFZyMcv+yNvvxFgnybnM4ilydVjbplnbsS2yUsV+UeWVuvVD8dOGesUyxbJOPfLfd+oTa+6UNxv3iJYodkja5Cl1TNxeaaF/UuJA1k2pPbt2V+7MtNA53H2xQlEK2m2vkkQ0e08tCEeXYJHJSdviXWWm7/rUIBYsS037ZLGqd54UUlVs/7QiU1W2vEyi6sbuLlBNp6d6eVBxKppmFGZxl6dCqoWtltalW0x8ppFysRe1xV0Sy9RCdCUFFFovKUK9HVMWv2JPpA2pq7JbcWGrW7qziDUdnmpFQcSpaJZZimwXpEqMX0pPtSNHnqRIJ8jX7OuakuSdnurlUZYla5q0LJF3JMoLFHFboI2FipRthi9Y5DbtvHQpdGla6iRZzoj1igJRQP0loZTw9hYEU84NwoSjaN+uAlJ1carsOBZUqR1qYXFsXSuqq/L3DQsqy+pQFJOff76nkLKuTRXdFQTE6xfFkwHaJal8UXzRkDjyc/hMDq/bP3fqft706bYXuLNZ6WIvi3BwqbcFTLaFThfPR7O+Fxu2qwxKHZuW+4plUqhcipHUIE05WlKhI22ETcqjOjx+Urd150hK0+WpVhgkulK1SxSkGuEsyVEFM7YgRuWxRCZFdUN3FaKmu1OdHLAIVW2ScBUb9LAMu1RBeG0gMpVnyzhYY9OjnbEcKzFNLcVJkKCq3hQakEGHuI7s1+JxzLxHFocphFN7l3gExrvdendNrzss3XpnJq8Uz6jcKc6Dml8tHJDJu/Vv3179+DExHtW0OZYiAY6ChMgFl6bbbPn5iYuCobNTeOzuTarE4kV2BZFPZ0WBFo9JyuKZ+Uk6sjvfNsmKKJyF3Jo5CnfsM4MSq7pcuHTMusfUlHbqb4Z8s1fHzQhROonRvAwlGK5KlOorcfomURW/vnnB6qDOKhlX3kAE4laLW4WCVgvbeMdMR0VdcWS3dekWUdDdpKy9RgSknUlbhX5WCtl4EUTfnIaJe9+6wDlMuqPEi7n/wZyzZZoEpFYu19Tp3Hu3bFOR1puXbRmLrZKvIZc3WGxBqhlwaytT7ZX2Jy/RHPutEmU5GS/IkMuwCCVXiVKbiLVvvlTDnG4hGFZiepVRsTnvWO/iNRMfsnmZKxHrKpGbsy72TeImCnLzAq8GsStBRPuke31ThTUx2EIvCVIKMgOGH1Lv5S9+uHry/+Iisg2R0Bb8guLnICFY8DsUBXgxwbOqvXE+LGMrDNgt5kgsYL5aRL4G7l5Op1jO59MILC5Z40hiuWLxyBsVYxf9itVXDCOMtsjsUOZ2i8ZUSu9nrx4GVxe1U4Cn21AO3xTRMOPLV2OVcv+0prmcw9uU4pIy678BzUkAblGBNvfEH0WP2jwyramzxKfttlp1EL1buga5ApLvgLJt8ge1pncjp7rrNqDaN3Dr3EV/JP1XJRtqUft6BniflF/c1nCbuA29A8Zgykd0OKNQ0dM7bh2qbRi3xv3bx7GFqixG7ZmAnkjfK8Xz7SC3ztXPXVC9IuHRAXW/Zf53W/nybpW7z2XDx4natFmS2oveyocXuq3b8m6Zu+9Nt0fRsTmbUmt61py/6Ieusz08d78LVo+qZ1XupQNoWThC0m0d57uK7o5Xeh5Fq8qETa2pUzwb020tFvc13f0ulDyKTk1JnVpTreqoT8cBVOU+k1vnOsPjQKqVuWLaw1b1Bzm6rXvlBq9b4xq9o2i+Mk1Ua4rXH6zqtt6r95ndpi5zO4pF7JZDqr3NT9vjXkeylorLv66pLJyb7DKvqhvAvvcT5NCrkBDNf0WvAUPxd0kwR07wvArRM4pwC7Hc8Ly4yMrPLwtzcRkfNdeFSTcskYqyVo3KitsWmD3Ek0VtFWhx4dH2YT6qfl7O0XcP/uwbXn7nVTh+mvqzJ8d3/t8b5yEO5kShD2SLBX/jxOuIXOnmOl8QHkW4DzEWRMrLw5Fa+oSch1xqJAHZ82a1cfwZCeUS+i8VJrkQEFeR1UqOT5KL++Z4gPLC7hWiuXdGyH10nSBi5fO8ZdnqMxmzQe79M8lFRi7wQzGKZqWDelfRhrkXb/uwlz/EbfLFj6lzIb//w4+/mg/siW29E7KKqQvbDoaLX+LlC7apTEDEUkThMLniYYY7kjIfFiyz4eM6F9uCsFoihMWYPvnU3h6Q4z+EiPw6X+KCwiBCDkXHEnp6lPj7BH9OLVoox8+FKtxgyEezQFgYFyRISUGJ5+GubxO4ae9oZO/ob2jkzj27qPEuqyu//pFWR2urdQ9kuVzP5o4+9tYiCBH2c8ksDlbYH5pffff+5u31x19uP10rrgQjPlNIApesV9gZjN38+3Ep/x9T9dJ5WoZzOvqW1FCeg/k8RK9kbOIB+Iotx4+26hcTADJDwDUjkjgMu2z6ych13fHFeJvH743wzvdo5q/xAL/wttVcZMefsTmF4cZZxcELwejSJ/z5fImreEZ+JBSCC8Ce5tnfkGatlkkSPODX8lCDvBg9JhPnYZ2yQmj5zjOeb4RSwuAbwq894rmHjpANHhJrLIkn/wWbfUhse+MsscOOad5C4U2e4U7owmh84RaOIG+/rDzjy0fqT/kbWc7GrZrLNVavL/zVKgxmdH7xgvml1sqvts99nIuXSZHZyvjmDX1EeomOgmc/wjN5rHpReoCPsJ/YX9tSVqE/o5Ojx2Y8VUH5M+4v2W9v6cPCAuvJjyIUmpqTJVRMvMLDrveWfVBqHL1L1JvhWQ6ZSxQepJfRJm/Jr0JBy28o8rAAAxwbx1X38RZXYvLbiXtL/v4H/1M4743oFbjeix8Gc1/Kua9ab7ILc/+RPyynx93k7/JZxH3/kkucLhu1Jn2pHR7ChYyltwo39/Lvp7LJl219Kv85KZVC7Xqa/6a6ypfbwVT6S36waKbT4gfy4wULmxb+lh8WjGcq/F54SLKBqfyn/GjJDKalT4oLZazvKf0pLpIL6/uiMrceaxspsKlJCCosLVwda2yvobZPB3tXiktk7yoLbt/2mkekoQkeye66FikIeEx8wC4EkZgkbyVei1p4/QeE1RCzxmh9Cq5FcWV3Fi56N7jwL8j/dp2vfotBq3LRlHsRvkp1H1E6Em5aZglUsuyHumQn1yxI0KQ7ufiJMI6jx+I61sHL44AuVu/5J/f/LixJt0tT7HA2yzVPfkxXByzYINsJS7xgYFHYf1wUuNJF7ellJbf5jXP76d2n0VOarpLLP/3pEdeyfnBny+c/McF9N0cvf3peRss/4X7hiPRP/9df//o/xpeOP5+TNdxqGac0dpzhpRFp8RKvVGLR3QkJk7doR7R8ZX3zw1d/kxCXtmFd5NGAUABb7bMFRsJCBa4+k4ct046Zo8Rf5bdu53egu0UXiwPbBa2KLOWceTCPLrYJbHxuw2xYkhUoWeolaRCGDsJRx3qVa4925LtsypXeK1bIFoN+epGQ0BMHLHMSkZIi6OX2S9YeIma53+J4mop/TGzmJm44zMTY5JqMKldF/EFhOa++/bfsCArOQMCKdkuCHaNkhW0LVa1KKrJkl5OP53ObtuQwSFKFi2VXuJN1FJPOnbps7ITCJTZTNPfWK6yUtKKidL0KEfGHE91jDxssurs7RX3jy4p88GyVTACgOKV/jBgi5Xyt0sad4HGU4ZwIcOXamma/TJiM2cphohDKtPzRnoc3mGmzjzID75L9Vqb84RIDC93ZQnctemudXy21cpxhUOewBRsO4he9GhQyIR+GRpeGhko3xxogZ40wVNlgUT7RxVFTdY4exskhx0mFNro/MtRkIjYmCt/BaIDR0MfR0ADnii+oVE/0a2Wl5l3AEqtTSyyTko43o9Au0u1Xtjh664chwTpxy1iS4zJ7gzAELvTvXEyc2ZJCplE6vY3XSAKqVO+N5Dp+oZe2LcOv+jruBP1vmVOeRzC26mFpOQ63xiYg2CKTwtU3UDZP13VFGWQUaHZ5+tleriUDBbVDIjuLzqka0/yNM4XkyF6MokYrHlnWm+J9OhLuz7sq1nB+fk4oaBKDhJ2g4WDylurh4mf12VjKSD7tO8OnR2Nhb8BlJXtkGyAcjUvvkWwliuLyIldkSw93h0LVypLD5XKlKDgvPC8m65riYfmTsUuVw+sZq7THuBEVBhPM8by9TFE023g+4V8V0o3b0gYL6pYLYMfbLq0Hy9fdRtVdYcLxlnSmSAR6lNhkArizuSRRbyoJD4zGxqmbuHlVHTnDi3pG5Qbi9hHvM/bV6v0t8aGfb97fTppzPnjs/ILixTJ+dvzIORepVueKoSZPRPek41N6zeaSz8qXjCO3fA5SPJ1MnHum9PuLhA9LeW+HXCDgZ3fwrBM0d0YLvuFEGH6EGkQrGZEJfoxrWsiCf0Ixv8QAf+0We1ZSkpfi+a9KxHjeXIYviBoAEZvHGs4m89J4ZP2b0OJ1eY5snZLsQUpjcgeXonEn5SIL3kThLIShP8l7Kwwu1vUpE69u85JNbd7HrP403FzKtqSf3tQeSzEMxZlP6WXKj3NfZ9itLr/zJNxxr7Sgvy9fC5Zwqda3cgJWP+lzUiz9V/PME73wB/+UJWuayJuZzG0m9LqTujrNmqfuUlnCE+Uz2WASxoW6MK73qYJ2tX3Vvfrxy9V/3airGrNbV3M9mZ0QK4kN450aSe1jKtjMxNifvEGaRhvFNlEsTqSP/kaUG8wY31ljk57OKHcax4JslNw4QUkft79PdI5u/zXOIYaBTdCZe+yv9j0pxpmcOpOpQuLOKXk0u/BpcmIMP30glP3Kb/9m1JC5ik5Tk1ajsVeFt6T6rIoF1VJg6tCKL7t3SS1B2dOVS3Bl6oar94PS/L0tSuKN2woHW4M4lFgQdWnqAZfQh3j5TCP3EesSk62ihgJLvjZHvlTBG+dzgujQE3ricDGS9eaz/w0vndYx4qcRsEkpConp+SiixwdELI8sFvHqdbEkt61nHCF6Y5VbXjKSC+xLXh0viTQTmSySaeHvieGlGC0UrCj1G+RgTZrTvXyeL5VQ8e/FYxL3urfv2Qv3eM3PzzjhX1E6c6i958eJXM1kva1BQfHK/mNVmB5Ys3BiSlmME41lspNYxmr8uZ/6hkcE45kGphmFCedTFG7ycw8r4p/ueQYBqsh7SrXLGp+oZSS+oGnZGDsdKZb/hjZG51R4ttIv5Xyr7HJWNpxNSxk/9ULkJ6m3LHEUxf/032zZjJdUTLiwgJD30MP68ZHYahDNwvWcDuqKQpZxgN/wQ7ZMcka4tEcUkYCLsPLoZ0FUUQZj6yWUuXdfBH3undc/LR2/qowsnIuSlCwEcEn/XCdpxUv3BWXdu8YXFlkwz10VruTit5J//f3CGf2G45xRofDx7+PzSUWD2GmeVzJhR/zACzu7df/L+2vvy6fr//zw46cv9xWlPPCTOX60cVbEpWbSJC4ST1VRUlFA8lQ+PvOAyNkan9A4Z8T/LBdVrdgwFx7zlURZs2Zpm0aAKA1tIeNJ5eytfYD0Wf8tC8932lYyLAFMc7vsHca6MFQDMqhj/Nor8sMjj22jjxro43go5PagCZp981g78GshLoZs8egjpL0gS+4Nd8EelQs4tsKuRiB1lWeYJK3UhES2iD6aEcgyCqlBUTQjstL58KqV34kQ4ZnOL5HukrO5XDzqFuRWNd3+Wok9CAgD+JvW/A3XX7XbsfAWLbiJdSSGVxRl3QmAM+FMuLRRJ0DFQiePjhmeWawidD4oPxUYPXqIs2z2Rncr47ID+jb2ey0HVzboqfynofTVMojyjCXu9iPVULcGcf9mOoQsQFXP/uYBkSSn3mIdsQzo6SuJ9tNlpm+Uadvow62so/yMyr30GWOGGaaRGaY8nnRPbcdLleLf5k+2MJvZ4P7SxuxXsxZUeD/sLbS4t5DhijukXGDS/yFezX7iL8s5OgryFNQvYnlqUcrPu1nrql8U+4JboypE2TqxBn3pQskjhRCfKJyl9jH8O/fv7F+1ZRQOFGeToil1w/6oOgOVSD3qsUi/c9/S3z6+M6zR9m+0BlnKvKdYnPCZEckmEMH99uEMJaMwtm57QMLT7qlgaKYtvsuCNO9loDixGZq5bf6nGM1IehwcqpOBqHlvCyMmsyUdZRVSyJ6fVm6jueWXtK8UdswkIbCluhZrr16aSaPlj9NsaLh4XfWIPYaXfacaRsVdggqXtF5jM/38+eO7u6a3s2rt7zU1TMv7TzRXQDQng4smHZOykMVu5fbUXu9nu1dl1Ey5ebVnG9neVvZLA/tb5Z2pXVum3rjSzVp+tBmlX/98pw7is1Hw8d17/N3t+5/f/pf3n+//y/v7+6t376/pFlJKktNlAhjrJzm22PiHH66rlhpsx+Xdks6cxD1e/LZry36/2A5mvOyISYh7rt8v0ErHsKdnMZ3/cVqxFTfatV/k9sny/pJhv0PTNepnlFyIdYKyhacBaWGNnFauGtxFvHwuONDcVvStbpi5MDGpiniZC2lIXVRuH7HRaVqxsyDEhInQYcoqzN7Tm9Qbh0ZDxCRftztzdJtuxSjHNOMjNs/M7/1BX5ahFpLTc8kK8h7QgiR3zWkMF8K1ayTH32h8kW04GkoMFny1j18hw4e4DN8RisrIETSfLO7dxYupuKzrYq+RVFz6xPLNzJckHw3bTl2eGfdMl9jE5Dat/DgNZsGKvD3yH/0gGpMyyc6yRZEckSu0jNK22TEi/f7nds738tValRexZzaxIB4LzlPUY65kC5Rk1mp8fLyrRyo6XKH/Vk5XIGKESCB8b8txM+mPnT9MnT8bS8oe3XqeYpKc1xjHC4hfovs9OT5Hp7bR2Kpc9xcfz0lkt/cmjfHgMre3qkiK6eyGiGw7tgpm30Lkhkt/nuTn69wX0hmDqri6tqgQzSVL1BQkhIrhE4IKB2rNm3Tb5xkiIgBV4/FlpU2yZQWZASxWFdvVBT0kOOfCo4mjSB8ufstOGdKU1R7PLotXE2Qecy74/OCcW9bCLRcXj35doRlhxvB6jCIhns1Py+L4/eLfmc8nSArJPPiIC7RryzlxRheksAsWJZIiWKMcf0FuysIFEy/P4kLsDlmd/1FdfIWVcGfIitM/yvBp/bqk4MmKc9GZvd8yU3GUlbPkjfMgWfkpNvnYXIQFuUxaBAh9qfJvO8notXBFXBPikUUkEV93eXFv2YoEtnc0BRxfE/FZmSxfCPvpWxBRLliWT5LNJGTxUUiBrK+EiSVh2fpeiZchZENKaCJKvXcymsICl+dWFphntqwwiRyw31rFVPjd/CK1pwJ3aCInQ+U341m41jckTX7gh7jNdC3DeIrbfNIkZzSZstPMF7k2FsAKnOesR7mxbl7l7ZJPjVb+bU7mvucgChK8bjPE/Ds4rmzXZNvU3Uha+sk653ryEcrOnAt1WZTE23K7ZC0RXp44OzerEzP53rM5m2uv95vK8fg936GWpqdz+7rP58Gcztp5ik2CBM2WcUzmcDa1/4ddcTaGj73yLlsrxcQV2MQzvJB8V10hX7uTh8UF/8Sxs4HzG8Zc5blSGYGVlUY5ZfxaUPxZjrXfnzfhIVj0msEUi/PsvNJvpG5X+PZ3Gbc7txqV8gkRyqm2DYZUDfzj1GEnkSXyDSv44tz5o6K+PzrnF9WCQmGhsdZg2W5NxcVOSTsLKBipzkJXyvUHZ1QQx+OV0mkTxmC8sTPBcPlIMoKzfyZWr4hAXp5R3HYZVpDYVPjd7uUyu2Na/siuKOM9PtqXBDaNZq9/z0HJgSwCANEDIkJCZH5DhvX6b8IXPKw0HjExhqoBAxLhJboeTXAP52tyrIm6yj/Y+kOCZeQbL/TVMUHq/1wtA64/JXaqTlVsZ+ZssWI/M79xfqFndNiaOVgIS8knPyFC5avHP1gXWTg5w7gP8rryD00tLOssMKvBsLIfNe1iWu5G60Cn6Y5QlnWrKVg0lfGk+fp5lWTLr6Z6YzH0ORiqiHhIwvZViNU44kPDar2uBC8IjU5KBsHO/VdnQOB8k8JqWD4DIiF4UgYjV0r6oD/oPa1idDKWqoafqqbRqo/gTHRJKjIJbU/9nJqIPt6+v766/fjp50lFIo8rxcnf8/Pzv6OQHOFiDxHgYkVvCKOHKVBKEDu6A0a/Yqcz7hmyR2eq0n15QSzgF+ycJHlxG/bd0/PxR84jslN2j45m5pD42LUNdiej3RquHmOqsl0dR16bHkuWPhwQqUffbYTdOlgT7MbpKnZarfIAgubcfGGW5NnzClf/7TbnsSlkz9luzzsjshML/sMM/x/P3P4sFQ42COcN2Gu6a4+sfICaTmF5g27lPQXFe3MtLzYQboOisOXPy/RjdiMsmlMA01q09M+dJUvfqiPYelcTmw9C7yBX/nzzYlVc7mAvXfHlDlqvfJWAtaxVNxA0KfLb7V5VLelryqmjCKHI09HG5naZXx3Oe72HLhSlHM/vWGWtp3KveLI9Sb//lR3ea0bihdJA8qbbST6gdPa0u8AVhXRwZlU1s+xujid86WqYvaX/pcBcOfSc20kz/wGlX56WIaKN3n2pKL7dxSWj2L5dl45i2sD6gv7gB+GXIH16/+sM0cBwZ2GXSgCPrZTwFWPK7S1f/j5IV5JuBg7sLNbsxVqOVwfX7SEz7aDPKmljxay+0cleiIX3Oxg4Flp41OWD6dagHSJ1VSldDNnVV9PYR4umq22aVAvxirW1oiqkgysPVTN30In69eZVkgeDV9G8mVFTWWJXsZbKhu8C6VaXtYMuz87Yfi3v2g2OZUKUEgSLIe8jBZg/5odz/4b97QrF6eYs2xqgciruDNjuCoz0V5uf1YT+3zi3NDcpSer36sfzxCHUCj8NHkLkzNdxnrMZRf4z+YORp2g26DwH9Jvs4B/Lc3oh2+rFJM9nEKFXXP6c5ZDmr86XiFKHgkwDlIWO7SyIsOJJkWQ3KW8tPS5Aq8ePyRVxemjW0iAhjeV0/u1YOfYWRva9bsei+H3RZN8477ZqeQ4eedIERoX+xU9mfvgWW9IFkdxFEmFJeTP6dyFV1Rsnk1Pk/LLBX0W5ZSUTdi4gDGklUikv+GsxswPNEYvl6lNSOVY00TEhLpJ8MLgAegaVUPYYuZkk8n8k+uM9EMphhqG3RsKOSMj5TpLihjLbyZn38g0hbxySBiMO5oixBSWh8OY73xHzoQ3MHt7apGTSpB76HDswmptiaW+W7svNCsal3cxMZOsQLGRSHtKHHKLoV0KLI6nba4zT7WibtTza7BP4NjYAm90hPD0HfOSdzux7zcZm4Wvwvj3yvo+yZZ2o821ijD72eYy2wjU4PT/dDc5E/r1xU179FDjvHjnvBGG7Kdvbya+gNXLp0EK6iaHZNlnp9Nx3N0lX2fea1unNR/sCOPkeOXkh+4UHDl/t8C1kNNCh2y5H8hSngE5xPbf2oGiWyXyUj4Pf75Xf35BrLWaZFtV5SQGs2WuYVwt3WCP9MATvU58uOkNUV1tHoXm2RlV6DaaRPk8jiKsT5pM25xO9lIftC1o9z3KC80unzuXkNmF1DMf8NEwifZpEsAq9EOvQ45kEvYVsiTB17D91VMl2SKO83RN3Jz8/HPvkoMYYWKHWtpM9DlNEr6cIVQL2096lqBRRh3ao2xnC7ZwDPkFCaDfOM+esMvPxZc1j4N/7RBRFqfdKlMcSysLSvwnKqE6m/R7H7eUgOD1H36FcCtn3pSbpDUXxKDj9Hjn9BdafR64h8FDZ/sDx7z2qjXIdxrhuK03K6U4BR0/3UtQ+b1C1meQPgvPvpfP3i5YHrr8B1+8Pbzw3nr3pVLz932jiDGWiknJaqlmYNJ2VKtPwNrWUzgb0yafAmXfTmWNzcV9LRqR14QPy14ZR9dqXUdVWSrfTW0d3JjVd9n1lJjrtg+B6e7SOnmfa8xYFwzv5HVG9aDq0E9rcMG03YeQJplvoVuLL7fdWSfkqHgcf36dMDESH2KS4Er3noi1CToYqCXUpO0MrA7jVvLSn5/y7lV83+94una75afD8PfL85FpIcPytjPAq0Q5pjB8uQ/YJpi/ueKbvPHvq7om9d3gVZpU+JUXOD5Li9zyILipzJu8mrxMa5qZ0/ftkvz+pm23fOF9if8UcD/VizAnN0QsKyW0FF0lm79j5+c59svKj+9zGA9EN4LmJjAQ0d9b0FvogTZzFOgw33/3/az8MFgH+hrtP4vW2zoFwBRQyJIXhclxSpeLqYyIyjxQ0XZyrdDu6+I1rwWXPBvPfL8bniuvrcflZQb/pm5F3gl7+TF9gVzf8zoU7UhUeEkFO9aXeEon9SB5y336+uf300/vrciErKjUvWaEZbsFsehuvBWsp3CpNWkcWldQ0nGlmY5LFfMBT4C/k9p8Rf25suJhaNp3bJXux1EjBt79VJLy3usVb4cyV3VLcuV248XqfrOunc/EyjPoGRj2zkU4PetFcKsc8MxL8suqeeTyqfygnUm90UE8qR7XeR0l2nrko5pGyjo3rJPo+8VvDwV804C8kw+m021DY0E4rBpUx2awb1EOrw6sHc3ppuOwenEjTTkRnSJ32J+bkwDu5loq0wTZepnIsdtrh6FMZS+6mUzl+W7hFGZxJI85EZSYddyX65LG1I5yKYdOpiMeYFrduBGSTClfrbjqTIxbcTh/cTtFceuR+1ClGG3ZD2uHUYXekSaJa2y3pE6eK3qhTGUW1wZJd8kHwTAf1TCrT6bZD0ltRfT9kHEjdcj+G3JwNex0pH6fe7Rw7USUsfnrhYriZ9MnHSIkSdwNvTCkUraAb8xjr8j6zIqmjuN/cjWyH+n1kc9q0qpMI4EOa3XmWrKXbO9AKw6m/E60eLd3akVZlEKy7FNFlDRQ8SYfS6cESpJvuo2winXYhuqxttd2IYah0ypVoc9E15U7k/HMKZ3L0xGzgSrrtSjID6YUjkbOANeZGrlQ55DrnRAqZzeq6kEI2M8F3lLN67QGBVCYgsncM2hjFlO8LXERtF5HbQad9QyGB1U6wRtGAbJCML8p0ZVbeYkeXUDOLljCiO5NeSjuUKxPZwOrgkEO/aDCd9gBq29nJEWjSI9n4A+3Y6jCmaTqDLRLmu5XDSM9etTupuOv7sKhog0uvtKluk+oN5rUbu95kZ1Y0e/OA7LDHMaQHEhxOt/LmaP2FXZKNHV8Hb9OCt1EaVKedjcG2auMd5uHVKdDDNEbqIh+22WjEdAIdT9Oizx6we0KHOmWBE2sjSUGl8XU7f4GlCe6W2sDWFq2yHtiP7mMssc7OaK747RlNlgxoxP/+3k9Q9hnWCH3d436Dq5+39MWPqfcjv//Dj7/mNfHHcMOIZXyiW1V++FXyOnf06TusV2OhW1FdYMG/0AxF/myG5UgGP20WzXKE/NkT9QkTJ3CROyF+IUbOs7+hyXm2pTyvwzRYhYimXENx4qBfsXZ4fp4I6ylGURrit9YpK/Q5eHxKnSf/RSrGd+bBYoHIw9jNkGbcX2zVw5M7TX9eRlxp+XRyFWHfhF+IZshZLrj7irFtzB2mlrw3tFTmd7zsleQS1ztLv2L7mhQVSGT52++sHjrLZC/RgT9xMr9yiX+LhbGWly2e+2VFutuKS4/jp/MvyZWZo6z8rcUFi+3T2N8SachDXCiLjhzPozLwvNFY+ZzrPQfzeYhe/Xj7zvajcpe+Zo26E5pbTEaVf85uUljFZCpJN7kg2Y2V1HvKuVDJmJCnVpUImR6JhCTJsOeVYmGJjK7XEUnbRTMYlT3GObc6J2suKWoZYcuNEfbVfpTSmYrNg1lj7vn0eK5ZOHGB0JK5NFjrE5SmPF+YLJEJSV7mqZYV42GJhjX17XK1IRPLKO/1eL/cUieYmrCtFFrlrGOanFjF7yFNYJ/SBCpSSQ39Uh8h6V/nB08D190LGbhO8Jr7lhKNlS++VmcOK3wNvrFPF9aXE3Kdjmt87PbAaeAinHJCoRO8/6bdZGvlezGMiY/UT4HP7NM1Nghbhjrlz+n4To0Quj2s6ntUc7a203OuB05KV7IKc1owhYFUJP8CF9wLF5xuteiBO8bj0EIgvR2JTXhtfcq7U/TZh8nspzARfeI1pYEY0pOBo+6Jo954KTUVfvPITJWC6pT8dJU8+jb8mvbO6kyBp+6l20+IWGEu6jx1lWajyeIG3ruf3htxdYIbtxZM3wdoA/5dn3LxBN36YTJLlo3FKlWk+Wnw3X3y3ViFXoh16MVMid6inHzxhDx2lTj6NfQa98pSSsqTd8utZd6sMg4pMWK1dcjpD8Ez99QzvyqSUJ6ya37t+fBrgNGmyPV5gsy2llOalok65hylmsfA+/aJ8YZS75Uoj5HwT5b7phND1wdXfd+qy4B6ev71EIleS2agy8WpMAVt1krwtb3wtQusP48cmPKQOj/q6fhboyj6Mtia871yutjT9bztZcXVmoKcutRgCIU0n+Bze+ZzfVUy2VP0uH4fB1l9X1vIq3sqTvZvNBGA4Gq2JlHOmDoLk6bTCWcaLqSDVdiAKWsweNguelhsLu6rMu3u0P2qYVS99mVU1Xep6vzGp7d8bT+Nc0nxlXmZtQ+Cc+3R8nWeac9bKLIYn87qVS+HPgyxBo4uG9IhnuAZ5gPlvy6furTL1FjxOHjgPh1vJjrERsOV6D2rMg+e0EHnKnH0bfDV982GFNqn55oPlCm8ZBx2qb/NT4Nf7pFfJllHwS1nw65KGv0aePV9sm0q8RPMHnmsjOnlBHm7p0Df4VVw5n3KSZmfHMPvebDkllNW7iacQY1aw0ywV7Zg8eqItjKB1r4aQpM4tPIFxSUPyEmelutwztKu+xETQIAN1U++0UGaPq2TrLfOCsXlMfTGCVF6QR9aBPEzHRC4nGT9THkxxJFxx5Ss45I/uPekJNT3WzeAi0Bxasxlnb2Vv6N5OMmypm/TTKfxRk543diVFzWvvVCma88zzBfvrpDTt+91ZUaz12bUvDoj6yi5PoMNQF0ljdyTUX1XhuK+DNOdGeLYVFyMUSqncDuGNFK1V2Bsr8HI8/W/VWRttr7zwuIGoPINF/IniyDCg6YwpAyjkYza8V4ZiwUX3VYq37oeWpPAtOp58M/gn3vkn9no65V7Fgfm7t5ZGqa7OOcfymmjh+ObFYk9xato200nXPsGWmPuPcvXwG+D3+6R35aGZK/ct2K07u7FVWN3F2eu9mjD8unmvM2Cez9wQmNw9+Duwd3v5u51Q7RXnt+cLnn3SaAim/Iu80GlCxza1KBPDi1NDIfJmmw5Izwul48hcldEqw/rhYuwU91Q3/6e/CZMAhVPgtsHt98Tt68agD1z+voMzPu4fEOC5t0cvtG1Ddndq7NNa91++2mYwf2D+wf3X+n+iwOxx9OAOnFz3elAk9d5/2lB6/oGNj3ok1WLs8JhsjjXRYfsMs/CDAEzxCBmCNWg7NfEoB+ve8wHhkTSO00DRl83aO8vJcXWu//WskVDMACuHlx9tavnA7DPvl7KPF3b2cuJqWt4+y+KzOQDYmEqsmyLbMyW00/XZmWaE+qa2ZkoBm8P3r4fvExpHPaLn6kYonvwNFUpsXfia6o92bC8uS6vt+DRD5HwGhbt4MbBjSvceHnw9cqV61Jp7+7OtZm2d3HpBlc2TLcupwxXOPX2cmmDSweXDi7d4NKzoddLhy7n6t7fnRdSee/jzK9UKduH48oLGckFH17OzL0HiF6ZRNjeQWuxE1PO7oacUw3HtI9T2sshNeeMmnFEuf2oqmjE+5g9T8HraDxOIXl1lauR3UzR8rT+peBbvijzlVs5lApnIjuScc0s2oI3aD+9dF3otTJVLqzwYIU3hBVecSj2aoWnHqW7r/A0+a53WeFpXdrAzs4bUg+Kh+gPlM+69vFKu3xfu74PBy5hDujT+XrlaO3XQXvDQN7jxL1pWO909N7sB4c1NxjShgtTw4HyadedGeyyAO/4OswLMC/0aF5QDtVeTQuGUbz7rGAa07tMCmYPOKw5wTZtuZjG9lj5vGunud09kXCdsmAygcmkT8lxK4d1v/LmWg72PVLq2g79nbLt2jvVnkxAZ2dvDP85b8MARXiQmh46e+PckrsTfOwCcsfw3YJalYPfjjerZUAKITcO+NHGuabGRzvs4j+wYfpRSrPnL9MnXNqMV0o8bX6HgjN6fVpit0EvuMDP4v7OWW7+4PEpzZ9zHnz8CCk6mWBn6byiMMRF4t+WixRhv4toAn5eA37/GfuSF5SMXSwJ5ypN/dkTcfno11UYzEhVQXZFwr+wxEjN55GPFX7u3M+xLMk3987ygWT/SVznSvVtlt6fTSe4mrw417lZ4/r4644f06YHxNVusNVh1a2wVWOniNsfI/x7giJ6g0C4xM/QcibOw5pcFkDmqwdE5xsspDmuhYg7K1l6+fPtWxerDDvjJxSS2Wuxjuhc7syDxH9+CB7XuO0JmaMyMeDm+FQ22Y0ItAFiV4hkyhJh8wC7NcEPyW00m3xWlUXMxPFxQUsvFXRG546sBPINef47PDxjRG/XSFJyqQTu/QuZHpmJLNexM1sn6fLZuX+HC7zFrxH6APn3f5NplZngGVkvoYjMw96Tn3hZ6Wws/xsbiuQOlXxJRHSEPeYnOpX74Vf+cdbo/Bfnv53iV+THHIWpf4edIBmDkzO6hDGXzN01LUHVE2NFzCUECyzBfMYk3Zk4unYL/ps7Vct2uOTalLwYWgvzULwY8gF2OdwteZ+xPYZvsbH7DyG6xbrAMpEFQT78h48nWu0rF9iJ0UuXc2eH38Nrr2XEOpH5vktFyVdhgAfWtPRm9s5ZoehLfrvELmXmRdE1QN62HVrDXn2/WJABZfHi99gD5h6fv8bKuFrjmTsO/mXV8u3DvNNsXa9/r+ogDStGypS/V3FSCVKZfC1fp1BWBGuqmDV6/46LDZUTvtcoUmymIjHeXkUrylGUX6PtqoJYF8xp/hrtTUUGwMY7pk9lZaqqghdhKru6H1WFK0pXZ19ptgeaXCz1e6JPF7CXtg3lGeprpzPSedja6jCdjq3dctUZr/1coKIgVQ11vWw2Y+lONNQVt/Z8Q21Rqym7TbW3QOCt3doC3a9uM0vU030MoFgIa6maKLNXBeqi1LU0JGcTvrLftGco0FRjnZnWVCLrpmGzYq8qDeUZ6qvRR1OBfA1tiZrttxK2LNy2JXUW5balM7F4DN7aAqeetw0oRcSToENsY4I042cCsSrx3XOOMrIgkIUIt37ybRsen5+fX2fQSkJuz5w9ofk6RHO2VxCzmZRCMeLtnAyGI/cXMuifbQ/g/0XLFJcyW+LhnwY4rn9AM59gXq+IgUPxBhe3heuXDPHYUNAkQc8+jo5nSVYkYo0QgJOsPaNlLBDbw9BJlmRPAo1dsWdbiPVvVAKFG0/Z/cJpHKBi1utZmExUl3Ia95T4sm8LZQgPIb40dAtrRLmWf5P/JJ33gvm20ofUe/mLH66e/L+45MuELefwbx/nWo46Ry5wl7JthklW8pT/K2DRdOvNC6Ig9TxZJvImW++EQjAqAlcVt4feoRWK5sSmsAGxm2lZi8kgc8jOBbkLliCR65T+6mfwr78i8B+9bXdcKPSVoMkb8hb5h4yJb9HylRYvvOV8fEcBQ/w0AxjpQwHRD4GZ5CIpqlgQlPuIR+Grv7nnV+uSIf9MRl2QyjtPbwqFsduWA9bhxTolO3i4FejXFb2Td+kk69UKL5KcWbxMku/ENhNoN5ngdwtF8rH4FMyenBmFsMVtNioHAYtdEX9EdtyigkCUpT6huLCVxvbPhFdFkzBjkFsHerV9/eM8gzPlHTsJc8yHT7W9KzaQVE3GdWb7b/IXis7OnvwoQqGHfSSeOGLh1cI3inf5oCFTFftN8Ix4zYUVxNeemQvgj43I6yK8axxtSr8jNaDoZ+juFHY0xWq4Bn9AEYp9PG9+pUAzg5u3t+5KiNedXDv2/lekcLZpQ6cRtucSJE90X4Y1L6E7uDEvwyVzhrR7ltMRaENxUbQno/2urc39JtNXvg1c0B/ZBM8/S5dsTaDel7NbGkgqcLdLjPFk90Kv0UJZXowWY9XJIcWJsvWDsKhR2pP3GK9m1KiSG/z4iAtDUVppvz+XMdnsV62dSP2J+zny4801nfvnBIw3bHvib6fM8AivQXjnHn+H/SFV9pZggO2JiEdbHqnfYwuRKfnd/YItS7+pyp5k2+7n5NFz/bN863VqHqukEL4CHmXrAEmjY2Nr/Lmf+opd+CfKv0zcv7N/9QLdEhOwzUwbNDZp4EredKryvfoCxi4edcQEvay/I0N1PkMTaLvl7ri4Oy7/2r3ZJCl65tCDbndc+bHkerzMV2HjZnv7xOpK7yEKyTiWzSG7s4hcPq4eS3gWpN+69Nr3aT6q6Cglilonb/E37s+fbr0Pnz7//O5Sb6L02nPLZpltSGXltJnMzD9HZDUV3VJ3rVe1Qzb82MR/pm1wWbyhyq+zMcjU42F9MZFWrEoY8uFlyIfnRwz3uIo2yiVJrpSElY+f+eCHiab5wUJjPm6poe4Xsnb7FKHlYnRe+vZ8TBSff35uUHHxVdxC6zZknyhL10u9IBBC6GmnffSnWtSc2FYunkfFWk3qXnTzCXzs/AHL/vzMaHH2m4OjsdZY9EOOdCEXMVtAmdubS/Hd+5u31x9/uf107RKqHJ3L1P6vC37jY/Tih8H8Kn5cP6MoHVVMNM8Mx5kaH1qc0wUo5fF9/vzxnZPR59ZrPKeRT0YPG6w8eR6mczZ9ZPy7c15RwZNP0JvcFpYLFr9e/GZS0+8XFeWeE2oOiwopb4YWaWllF/9eVTgBhDbLNR19PAD32VJ9ueCheByTgJQtgv7DsPSp9OM0kvMMk1xxKt/yCHi/uHGdad9+43yMMmzgf06dP7v/95/dv4phNe4RGz6EKUaAhHsOe2/n0Xv9wjFYKIbcx2QkzyNk1ZLQojjcTH4VhqBhjGULs3WyXTibSjVMq0o/i6fklT/7NmIFVbxMx7uoD8bMYe/mRVjp4v/JVcH3RAi+GC9ficnN0SzEZjhnikmwWgi5a+6slss43Py7ofwctPGDZ6JQ9LwOKeM55aUEuMe4FXOy4uQgqQz0iHhquXxscwkeEBx4ZaJwu7OuMvlFjV7M07fWXLIvxoZXJd6s5IVE3m1WjgqmKMT37habGIu0nz1JTNLLZUg+04tef/yJcUbgooQqvniRm/I5wsvLr2fagF4q9gc8sGkxE8sX2JAqvHK3bdNP72///umd98v1p9tP33/+4L2/vv507d3+1y/vby6dMEjSr2Qs69a+fDJ1+ebIHVkAf1VV02D58mAwtN/5o61Qr395u9eL1++//4RDKOHVM8WQysKK9/JSlJ20+YV3tUO2kbebQxm5Nng/FA0XOktCzktNwCkWTRWqjbWSNL7bb4+DN3J3ORW2LWxamBNqCzsUS7r4ThDfZcPr0zWiTFSCALP9RXoWJXKW8RyR5UWhBDo7cMY0/t8yCjeEiD5nDG1Kuy+XVyiDrq94n9kmgFsWFANvip28IWhTNENsbCr0rRiIlYNxhwEoH+3QbpQl6xW5XMDNTaMwU7DFOVdkFpornsiCShYrqkpQjIP8+TMbKJaFjPQPDpDJpU1EdRS6wUAc1pZHYWFHPvfoIou+qyy3UBRektLS+Hmt8uT+xvlpnaRssctXY9mpG7I5lq+++BEsNu+X8XLWYg3qdPU9/vT9O5Um+IvkH7Mq5b9xtwofbCN4uorJRnPVLspWkHTDgDllwy5JwQLUhRZUsi1eMbAMdSmtsKpuIsnSZk1BIYY6ZUWoq+Ci1W0JSQ7T2L2ihnQMADGuIPv+PAa6tAmBCh4kG8m4GLZkZuOpXMIcpX4QJup8e+ukvLQmJar84OTMsPAW7JuFgYKBhygayZ+Onf/p/JmZd9mzZRCwOBQudQfYCNWAu6EMHuH/Sn5pqutUoRvWUmXWqQoNOcRWxuMU++KjBxQ9jS8dP0woO4Vs+sfOI0rT7OgQhQcIipVQ4ymUcc/FynV8T8GyIJqF6zkrgJwrjZx7LpJ7Ejw++99QoZg5elg/PtITaH4S4Bji7GwnUY9tTZ/OAWRqIf8yl0KHgfSRvAQjk+1VsLzmCx894URpx6IOy3VLfymCzKyb0nOZsItRqY0QAjIc2Twkdr/QbXMkQR0Vnt5CpSQEfF44jQM8LOBhAQ8LeFjAwwIeVq95WNKJvg7RsOSzisDCAhYWsLCAhQUsLGBhAQsLWFhHYGFJCxIgYQEJqw0SlmRkw+Fg0X+BggUULKBgdZ+CJfmgRhhYRfAcGFPAmALGFDCmgDEFjClgTAFjChhTwJgCxhQwpoAxNUzGlJigFIhTQJwC4hQQp4A4BcSpXhOnVFm3O8SfUmYXBxoV0KiARgU0KqBRAY0KaFRAozoCjUq1LgE2FbCp2mBTqWxtOKQqsXfArQJuFXCrus+tUnmkxpJciYXvmepKUYQOyAcSF5C4gMQFJC4gcQGJC0hcQOICEheQuIDEBSQuIHENk8Slubka+FzA5wI+F/C5gM8FfK5e87k08xtQu4DaBdQuoHYBtQuoXUDtAmoXULuA2gXULqB2tUrt0sQiwPIClhewvLrP8qqAEprOqWX2FkDQAoIWELSAoAUELSBoAUELCFpA0AKCFhC0gKAFBK3BEbQ2t8u32VqLMweAngX0LKBnAT0L6FlAz+o5PUsxux2PnMW3TbKp20XPq5Rtqb8nvwEdC+hYQMcCOhbQsYCOBXQsoGO1SMeqWIkAAQsIWDUIWBXWNSTKlSK+AMIVEK6AcNUHwpUBHGiebqX3FEC2ArIVkK2AbAVkKyBbAdkKyFZAtgKyFZCtgGwFZKtBk60KTA0gXQHpCkhXQLoC0hWQrgZEuioMDSBfAfkKyFdAvgLyFZCvgHwF5CsgXwH5CshXQL6qTb4qxBlAwgISFpCw+kbC0oAF7ZKx1J4DSFlAygJSFpCygJQFpCwgZQEpC0hZQMoCUhaQsoCUNTRSFkrSH5fR4zWjMH1A6ewJuFjAxQIuFnCxgIsFXKx+c7EUkxtQsICCBRQsoGABBQsoWEDBAgoWULCAggUULKBg7UPBUoQXwLwC5hUwr3rAvDJAA40TrvR+AnhWwLMCnhXwrIBnBTwr4FkBzwp4VsCzAp4V8KyAZzVsntWXOCBBKBCtgGgFRCsgWgHRCohWAyJasdkNmFbAtAKmFTCtgGkFTCtgWgHTCphWwLQCphUwreozrVh8AVQroFoB1ap3VCsZHGiEa0WeU9byfrHAA73ETiB+9yoM/GTrYr73E3SD4pdgpnM3vKxKUB+YXcDsAmYXMLuA2QXMLmB2AbMLmF3A7AJmFzC7gNk1TGbXDyj98rQMEdvhBUYXMLqA0QWMLmB0AaOrz4wuaVY7HpMrRQnWO4cFHlnbqFB4O4HKBVQuoHIBlQuoXEDlAioXULlapHJVLUWAywVcrhpcrirzGg6ZSwotgMQFJC4gcXWfxKXEA5pOlKXyDMCjAh4V8KiARwU8KuBRAY8KeFTAowIeFfCogEcFPKqB8ag+4LZ+CdKn93R3Bfsz4FIBlwq4VMClAi4VcKl6zaUqzWyQGQvoVECnAjoV0KmATgV0KqBTQWYsyIwFbCrIjLUHmaoUWwChCghVQKjqPqFKCwo0TarSeQggVgGxCohVQKwCYhUQq4BYBcQqIFYBsQqIVUCsAmLVQIlVPKoDWhXQqoBWBbQqoFUBrWoQtCo+rwGpCkhVQKoCUhWQqoBUBaQqIFUBqQpIVUCqAlJVDVIVNyugVAGlCihV/aFUFQCBtghVsnewo1PJ/Blr3ow2OSAtgTTmH4SmoSRJWVcitGkyREbXDoIEEliLJLCdjRmYY9bMMdGv/DfwyIBHBjwy4JEBjwx4ZMAjAx4Z8MiAR2bBI8t3e1T4LdkEkHPVy6v2C+34KmHyOr7aFw7WAFENiGpAVAOiGhDVgKjWa6JaNqF18BrFYtOAqwZcNeCqAVcNuGrAVQOuGnDVWuSqWa9JgLUGrLU2LlYs2tlw+GtZz4C4BsQ1IK51n7hW9ERNM9YK/gCoakBVA6oaUNWAqgZUNaCqAVUNqGpAVQOqGlDVgKoGVDWgqu1CVXvnR48oXq6TDwEK5wkw1oCxBow1YKwBYw0Ya71mrBXmNUitBnQ1oKsBXQ3oakBXA7oa0NUgtRqkVgOSGqRW24OaVogsgKEGDDVgqHWfoaYBBBohqpHnCuW/Xyzw4C7xHIiXvQoDP9k6lO/9BN2g+CWYlZ0LL8UA2MNVmHAVJlyFCVdhAi8MeGHACwNeGPDCgBcGvDDghQEvbJhXYd6kyxhdo9k6ToIXxMsA1hawtoC1BawtYG0Ba6vXrC3l7NbBpGPGdgKlCyhdQOkCShdQuoDSBZQuoHS1SOnab4ECTC9gerWRjsxodMMhgCm7CTQwoIEBDaz7NDCjj2qMDKasZU9KmKmsyp0BoIcBPQzoYUAPA3oY0MOAHgb0MKCHAT0M6GFADwN62DDpYdfInwM7DNhhwA4Ddhiww4AdNih2mGpy6yA5zNRM4IYBNwy4YcANA24YcMOAGwbcsGNww0zrE6CGATWsDWqYyeaGwwxT9RKIYUAMA2JY94lhJg/V9G2WBj8BTC1gagFTC5hawNQCphYwtYCpBUwtYGoBUwuYWsDUGhhT6222zLqK5pDUC2hbQNsC2hbQtoC2NTzaVuVM10EOl3WbgdAFhC4gdAGhCwhdQOgCQhcQuo5B6LJerAC7C9hdbbC7rA1wOFSvyi4D7wt4X8D76j7vy9p3NU0Cs/UgwAgDRhgwwoARBowwYIQBIwwYYcAIA0YYMMKAEQaMsEEwwoSI8Avyv12jBYrJsuhyv5XpG+cLWbLJZI1sKp7gunHxCTEun23TUWySE0zElx5xHBo5DxuRaiPPwY2SOuROsH1AkTyk3ED8ODcurh8Q1h72KstvKNp9hZ3w/NvaNxW5usslFReTam5JJack3xhVbnrLe6oM+QpKsE2GXHreliNAIXnPK46nTP7FYVNuGPaCz6tlig12kxEcdrAE4W334/b3n1hByg0yVm1Mt6Hpbn+Vfq7po4RoYCjvNQ5Sy/K+0EeryuPQoV2J/OGKMtkev02BObXCUJo4OPBT4p8q++MGThfF7NeqFVtmQ2VqkmYsG5Ztufm7JWoSs4QmGJDMUEw8yPxRZgNWj97GfpT4M6Igu6K5MdTjY1J5lwbAZXHxVhpM+pit/Oi0XIEaKeZ9m85UrNEyZ6SgcvXjor1Oyxat4iopVn7K/it3c3NhKRxeldBUr+SkQHlNGxrr+UP+lmKRXUb0mWH5Yej+FPyK5txIEro4U2vqnGJB99I65J7uKdxzXd+zvUy8pFDv4y3OL36jHciG/+8XDtmhXMXoJViuk3CDVYc9DsWZ8OrC15RzPg8WtAGpc88bfk+gKrJK5uT1EI8SNHd1BXyMkhQrNmNw+U6EXpVdQy8o3mxrIa0iQiNrbF0fM2m42D5HpQ6P793zCvuTvJtgfwXnxqalJpzb8d3Qdt7UuCFhDq4aUeKj03IF/XRDhf6DGwI3dFA3JNhf0Q1xZzAQRyQst3WuSFy+Vzoj6eGpqpqeOqSiFMAlgUs6rEsSLbDglGg4PAyPlMfrGne0jfyrBpTw5LRUej+9kNx5cEHggg7qgrbmt/U/DK33rhHxGi8o3FzKuzB6vF7tpRTYdcsAuzSmLysh5fLL9bB1+1OXBmRcjY7nv2ueNeGe0it/kzu1xIYYLv255mwhtbmyrj2PcHPKADv5hnsLz7vcYQIxT027QJjyLKZqID9wRhiWS6rShLQ1G130X37STPW28Iq14VJ/yL5PNJZT3vu/Ikr4mPIDqOl6FaKvhUYyuiY7l3qH5cIekk+p0n85ofLurmygruuCgdgYSIPa1jhGsmlldjr/7XyOCDNu6nz++eb9rWq/mB390xYzD2YpKYsQPwgTzVhih6yyaHEkIwH25ZdO8BgtY/T1OUhmd2dK/jvbBU94bgByEGOOfDrV0mUFXhXg1VS0WqcTZxS4yJ0oiqFb4TnFZBGgcM44EeMJobMnT8s1/oQkGrnwvPly/RAibx2RI6WzJdlq9y4Uhb74ceDjJ9m+9csSzwx+tHHoCiwN/JDWQFZfCzxXpAlrLtm3Zj26SFQN9WP8UkrOtCq+vX2iDSRTBm7S9mGa4oSlQonoNnkQOb9scCVRkV7JygkkPj/laXJSGy3oYYn7zj/BhrYkIlorjse9IY1hjuLCCdjayd3Bl7xx3ucpHb6L+bKF0TUZ7ZMwTfAESQ4QBXJ2jeXCQVic2BRdlaBGV2OSGyLzRnhpFGDJTJyl7vnvx7mdUZmQfBPs7ALWMM0bQ9d9vhMuCS0meMaDgRlkkJ/QeEY4Yrt0GG6eEMpgflTDHbwfVc2/6hZYuVcPXPeRXLcNi1cw3onzdQecwdp4JzvY7t1YMaI//y8neMZu/wWRU5OXzuwJzb6xsR0xz4EddRIw3eBZhZ2udF7JscXZDEfSUUqY5oqSGQXJdx6vf3mbZT+gk5m7qyxxSJoPsrJcxW+mquE1bqC+fJRZ1WdwErt5hjslIz0//JinzFE7oYlyta85E8hRG3VJtsekPfkVyq2m5EyhpULzzJ5JfQRMECUWjrq5xjPgdLWBG0e9ienBzFPpH9afcdPLYz/hKyWp1vl+Qt3WtptQZXVwexPNjZy7+0iWnR/IatKQeoRmUSE/LDKcZL9Yp+rw8mwhO02UzC2Qw0A/8de1aR88CZsw1CLAKqrVDtYVLiSY7zyh07fct/S3j++MnsNTj+zLnTIOyROdYIBVC46x7jS3UIorDj5z+4rqpQZcLsimUgldsqxY1nqhcj0+lddeeF+Ld2trY1GDDI3tUhWjsot+RZhc7dcsmmnljfOFMZTzs0JZaEKPR1MR0yx1WVpAar8XCYf2HLbjQHLgsHgjeHxKNRWRs9w4Cpqt4yDdkFVNBj0mznektpkf0SN35JuNk8bkEBMJRDklMsudmQHUJAzV1EQaSuJp3MwZDntZGJuQ8980tpsUkvKRTFQxwnXyPuLw3l+HNLPhd9lhPU1N/jp9mtC0iC8ojkleRCoGojKyJqaxGwsNJYGpj46/OdMenmeiZwkoiukP7yfO0/KVQPkTet79XrSje7oUJG3JzoApl4OsIs5H30omO+++Wsd4lUlrx7EsP5KR8BhXzH9Kwl1N4aVmk92HyGEJNgptpsiGaz/G8hFhM6IFV1QxmiWnpcruUlzlGUemRXLE0hyjJKSXZxP9rF3I5SWKyiajl2EuyPxaYVPBKFJmCT/QyGO5jtVJRpWZRbmDyMemAg/aVrC1UenQRYLwsExjf0FOQqbLymxz2j7KJlexiUI3Nlvz30VrERuWf6Nab/GUcxoTs0pIJ+1DF8dl1U73VrgVu90lC1YrZaLNZEhFMJUEZZVsURr/f5yKMlPkuFO9jxfY8cZ78GfflouFRtL8W/d79q8ijcvrUxAimpbLZAK0eG0Ao031uAW1Kawrmc/emTWrlqZyhk058REPUS4q8kNZmw9DofAk4+WN9y7PKsrOBapKv0IR3m2mTbpPrSeAFArOmmB8duz+f8Ryqgs0No8VkmWrrCyLB3AkteYFVcLFxOqdLHGmIra8XbKMLlblFKJVq3fG7g2K8dou+Be6Xd6kMfb6VYnFCukIKkNZ0QuYXxubrYqNMrKiyhxDnmTHI+h7ZnWXlW1747wNsa+l8xt3H3x3g+UzIvlwLArBY4LtAuBiIjoLB890lY0HusXr8yDBviJCM5L9wcL0C87QnZE+jCqEtt0vIi+S+ZvsaPBIIkrxKp9t+9DCLUraJnIj+zJ4DRAiWghPAUWW7oQsY1GSQFJyvqENXcdSek+MZiQjyPzfiWBjmgHdojgS+TxkVJ08xV+2+8WmroTp16K0EQ6yCIEo3IzxuzFNWLXGIcCa7DxGdOGd8h0xi9J4RMa2OEtJ1TULRNKhsqG7f/cTCjRts2Sejy+txjqZmIJojc7ObLxIPrIMiR2l3YaK/GnFct1f/JglreJuR9HX6lxZ2X8bupM7kl1oMS+WWP2YbY7ocntJCWxVp8crktZyZEBMhY+dgjTkWW4adl9F/FJIty6Xw54kzgWXw/YckfvoTlj6m4DS2h5QMfuNXMZ6hV0wwqE7yZwoeLooZcM2S+VnKIKco/TJVQF0r/yfBF5g7y/p9RcbY7I/feIbvAqhS0FaBtlH95j48bKUZQmosO9w+UhWVzT1QPVMeZ7R4uj+LGm7cvnE0pIk7M+qbJSM2LfwA3LfCV0G+k7em+xM/sVv9JffK3NM0lbSixiYVF33vGLaNM6aNE1zafaoGK3VvoJNKsx0sUtMXhFJiUPMmcqVSSFinZ8YSmGG7BdSFzJK6jwDVNhWOn7MUNAcRQFJJr3GiovxeiamsFKWRoDaOJli2DyhQBC3JeX5pHBxow1Kx5w8ynrJqBEsnZVxuGzRvgmtlSbMxBMwTxRK+nTJxj9poTEa39Cs/Y+IzDj5nTZ0yUGFjaelGUJzkgVmac7x+A2hFX0HO4sJA0ap91ivqGvJW2zuWZIuV05Ad6D5JTrUBxCVjclY36YGDRKTWwvIliuHyJ713uONoYxrRLUVpGueBp/7sUxI3EDTpxi9msyQQAx817dgiqZk+jy76MhiBGb+b5v4ha5nWTYEIvRRtn41j0wKHfHwqpThSRu+mv1EsMj6YrUnwKbyLJupsC0mcQqkDKeVDo89t6efM6fi3KW5itQulU0vZ0zbIbDhCxdGzRBaaXhF79ELmVb+kwx2MgiwP3xkY20dzdiGQbYbwflQ2K8scTto6jEy9ZyVPCKdDsgwJ1wmtopY89t5yIr7Ion8b8gjEPtFziFT3T1EHibVyMOKriozzdSgsd7Gm9tlnrmUI38nxXtWSqDrPGhNo21oTMpX2+NJn66BnaZ1VGke+MvAXwb+8gD5y6Z5tIN85u66VOARd5lHbDLzQ/CKzfXX4hmbim6Kd2xs/inykIExrGYMmwzFikEMnF/g/ALnFzi/wPkFzi9wfoHzC5xf4PwC5xc4v8D57QrnVxni7ccBNkWLwAkGTjBwgoETfFxOML/qObtayMV6SzfUgb4nv3WIDGzc6gByMJCD9ycHq2d8IAsDWRjIwkAWBrKwmX1rIhL0gDxc3XwgEx+HTIznQYK15J45g2ew8pRKa4wOWkAfT5h3XGhmv/jHpcbvTosqFHEoPvIpGiBYzS4WAXxl4CsDX3nwfGX1/Ds03vJBXS7wmPvDY1ab/+H5zLp2NMhrVlfRDr9Z0x3gOQPPWc1zVhsM8J2B7wx8Z+A7A98Z+M7Adwa+M/Cdge8MfGfgOwPfucd854InaoL3rI4egf8M/GfgPwP/GfjP+/CfNVsmwIMGHnRTPOjiSgD40MCHBj408KGBD70LoVhNTOgdL9rUDeBHd4QfncGJWqJ0QYt1+Kp4GfEjDhCv11GEH/+A0tnTafGkFQLoPD1a2WYrspXizRbJ0KdqXA2aBvnv38ofJSH2bx4Jq7yErBrmibbWIEqJOXyOEprSnd4s3lPzqzAtIFMDmRrI1EMkU+sn6Q5yqE/ZZQMru9OsbP04OggZ21R9PQ62vuTGqNeGxp8i41poY9mzkaZSrwVEbVuitt68rPjZ6hlmWv5oAvRuoHcDvRvo3UDvBno30LuB3g30bqB3A70b6N1A7+42vVsRIO7J6taHmkDmBjI3kLmBzA1kbksyt2FfBTjcwOGuweFWTfdA3QbqNlC3gboN1O0KzrOetNAHxnZV64GofSSiNolzSQTmxUw13oLohtCzFSqrQZz9AaVfnpYhulHjOQOmY0s97zoPu9BYGzqV9Ep7zOvTM6DTsAKdhoH5DMxnYD4PkPmsmg/7nza6RZcJBOQuE5BV5nwI5rG63lqUY1WRTXGNlc2FtM7AFs4sRGUgkMYZeL7A8wWeL/B8gecLPF/g+QLPF3i+wPMFni/wfHvF85VCu/0IvqroEJi9wOwFZi8we4/L7JWmm0fmrai/5J6rQ9Re5R4FcHqB07s/p1ee2oHMC2ReIPMCmRfIvGY6rGrnvwcsXn2zgb57HPouAVFeiUoYbkF0JeqoBt3yA56lyV7O+3ytcUqc3VLvu87bVTTYhoJUeq09/u5pGtRpWYRJ28DnBT4v8HkHyOfVzZX95/QewIUCt7fL3F6daR+C36uvuxbHV1dsUzxfbbOB6wtc38xKdEYCfF/g+wLfF/i+wPcFvi/wfYHvC3xf4PsC3xf4vsD37RXftxTe7cf51UWJwPsF3i/wfoH3Cxl97Wi/2m0MoP4C9Xd/6m95lgf6L9B/gf4L9F+g/5p5tDqCQA8owOamAw34ODRgMqd6ZC7Zrg+wzkq6aoC9ydV9kmRg3ve+UIHz5u7CWeIvtU8DPiVDOh1b0OsZ6L9A/wX674Dpv/LsOBzyb0uuE4i/fSD+ykZ9SNpvseZGSL9yoU1TfgtNBsIvEH6LhF/ZRIDuC3RfoPsC3RfovkD3Bbov0H2B7gt0X6D7At0X6L69pPvy4K4e2VeOEIHqC1RfoPoC1ReovrtRfQubFkD0BaJvfaJvNr8DzRdovkDzBZov0HztuLIyGaBHJF9Vw4Hie2yKL5eAQPDlCqrByiSkkGuy2ZLgVcFPjDV3UhxflQC6TvRVt9mGpqR6sz3K78ka1ymaRoXagQYMNGCgAQ+QBmyYQPvPBT6YOwVWcJdZwQYbPwQ12Fh9LX6woeSmSMKmxgNTGJjCmaEY7ATowkAXBrow0IWBLgx0YaALA10Y6MJAFwa6MNCFgS7cK7qwKsLbjzNsiBWBOAzEYSAOA3H4uMRhafJ5ZE6Lek/ThkKH6MSmZgKnGDjF+3OKlYsAIBYDsRiIxUAsBmKxmZ9rIBX0gF1c2XqgGB+HYkwcFl4tcM14GWtuqmTybftJuH4ZiSvcjAjsWVhZ4Al2HUe5AXxB/rdrtMAzWTRDrne9ffesAp+jkGolNrfFAdnzBhBHQhnZ0+JHBdLQts/YcyWJ433MIjEc7hRwH+8V95JUyrp5qe69/A6RpOcFUZBiSyp3Czev3IN/K39kVXP5NSGsVDHThK/dj9vfCyK6VDbbLUgD25T8geYtMdKdig0syy2ZPaH5OkR15IZX/VX77mSxTyKF/JctuS3/ivyYo3DLF1BwzzRj4Yb3oixG8xi60fZepwI7iFv9Zuon3xL1C0SGU/JD/bWgwmlJxZXAOdXzyn+Neq5k0oWdNazu95DUu6WOk5nIVsd8T+Fyb9KrpCq6e3Cp2otVy4rzB2Lz1iRdszvX64hYzXvziub8nvZ+fE+KzME0hhom69WKHf55ZcSKnGhsinbPfwkR2d4nk/STQ9A4EpGI8OOG7JeuE04DoKEFrtxQIv42eCZNITgFCS1wCX84tyVkcUtnaygu+e9xzTdcmLm+qDZcaZp1PbVx6M05U5FpCBjNVLCyHWz4NQ5SdDAjpoOT1BhfKiX6MQqDCH2hT5CNfQKZfLV98Bol6zC9s/Kv7HRHuRtbSjzZm1NSwrePeJ8jwiqZVjz08837W/1YtuzWkQc7M5Mhj/Y3zj2lMdMuLvlUe8kw1uVzkFL0lMkhvlcejsn8BaFwMbYFwVIS1eYPqcnDsZRXZTwxSpbhC6IxPgVHWSWM0qie+2gLJ7QKqz3+em6OVue9+GEwp/iPhxYLNEuT7rg+QShqXgDRRUwH2ZTrRV0BOR3AqO6Uo1dsluuHr/5GsyJZR4EgtuluL9OaV8sgSqe8l+72I9V27rjOOUhqAg0efMxnhtvYjxKfggr7nAFSPqw9RbLz0Vr673HO0haawDapGj/femJ6bVBJmjUEOT9pptD/t5OtEBSLAJFEoS1mHsxSUtbEIQVWlFjLmIqGAkdg4QjsMF2AyuN38PDnEL3OYM9cirZ0iEOWcn21TlWKRWlPfe12ilJqXd+PTcrnBrd/4YrMBeqoe7zxdO7BraZDyvSgeM6MPbz/AU/73dEBnu/cX2XKM6CilVsd+szc95T80PMPcmZt9ovtuZQWjkGa0YItA70Q0mtijcKSYlIl60mVqnUPCJG15wnnJXbB+Xu1KU5Zm5lp1ggSb1B6Nf8nojvdp4cBiL0/LhQgt6QlROA0ld3+Et3PhFpzne7HD0Ea+/EmI7loy9MyuBUW7f6Mf6A5J8hYNCMm52qxSBak0L/g2BYrbK5tCm5CuEvEsKela6wYUAtALYaNWihGdH/AC/CMjXvGwUIqCgUdAllRVlsLYFGU2BDOomorwC3qxueuxwpzKTkYq7eU/gBgm27BNopBY43e5EY0zX/T4zglG5qWPtG/rDSlqfLT/sFD5sATUKK2UCK87vC2fnAqhU41cARhHX3a+JFGEMeFkrSNaglVOnlrgDCqU2FUffuvtm2AnQB2GjbsZJ7aAIEC1zloMMps/ofApapaUAuiMhfeEFpV0QMArgC4AuDKAFyZxw9gWIfFsKzDXICz2oKz0q0KvCK0pVFPLVxjc7t8m2WD4uvrU8S4FGI4NsKlbFJr+NZJ20FXlVilIIBoAKIZOkSj98xdvdxuz9E/YJxBr8PDoAym+mtiDPqiG0MYDK0/aXwBIvhuRPB6+7S8Nq7LAbHVuhjC4fbC4Q25lCRPWJwJmUbDCt00FgMVFjSnHhMXiutSbFxq2kFi5JO1j64r1VZhEDtD7HxKsbPag/crhrb2CicSS6t1eviYWteOBmNrdRWtxNia3kCsDbF2p2JttZ0OLOauXGdD7H2w2DtbsWiD8IKy6gRbWFc/LqPH63UU4cc/oHT2dIIxuEIKRw69lS1qK+I+aSNonzechNgZ0esUOGMp0dYaROlOJNt6ZlJhAhC6Q+g+8NBd7/j7cyyhK+5luGCA3koOggGYqq8X+utLbiriN7QdSPvqxpfHM7DpO4YP6K3amkpf1vK0/FEPqe1WsQSACa2BCUReIVaAFzMNeAuiAgIhKDTTXNDI7h06eeiAiaFT2EHWpMOAB6dmB11VYpWCILaH2P6kYnvJM3d+O3630X8qkbekwyOE3oX6m4y9paLbCb7l1sM2O4TR3QqjJfvs//a63boYIuHDRcLsJs9yKMx0U+d6RJR+eVqGiN5yeoLXX4rdP/I1mHJT2roO8zT13TWl6RQCsS3EtgO/flLhcbse01qO8uFe86jQ2UGue1TWW+/aR0WRTV3/qGotxKoQqx45VlXZZe9j1Ip1LMSmrV25iFLvlUjeS4joiZmJqqgRmnzwg/ALniTf/zpDVOynF46WRHDckFTRnJbC0hPWfReVZ1IMhKgQog47RNV54a6HqTuM+MGGqjrdHSJc1dddK2TVFdtQ2KptNYSuELoeOXTV2Wbvw1eL9S6EsG2FsAssfI8s6fBSgosfm1xJJQ2EM1cPyzhF89MNZLkAuhHG5o1pOYg9Oa13T3F6pUD4CuHraYSvsu/tS/BaOdYHH7rKejtk4FqsuZGwVS604aC10GIIWSFk7UjIKlvmYAJW7doWwtX2w1WfCV8IVrk6agQt2ZKljWjlsDFnVttxg81tK1qKMvuvsA6JXiFWCBAhQOzHgNE4vq5HetXDlIxHFMdYCHxceMl6tQppuDfSLPJx/IBNfPRVWkkKIVc6dhZ4pZcSA/xq0ig9UZOpaDdw4O5O0zhhnbU4v8gEcMFs+pX/iduPTXuNFfiAxz0OaufrEE/2C7x0xE9d/FYMI8eu55Fx7Hm/Xzgvge/cszXcV+zl7tysgBH9c5xLfTTLusa+uD9XtlgfAtj3ZeZHNLTC3SEmkvXF3JPzs71WwfutR79qe2g/5ic7lGHvCsh/d+qPdSNjqh8yqgXxyeAqBfd4CEClVGVNuKNYHuAcxijWcAu0HOUmK/81GgnOUfuilTsxz+NV71g8OLbEDQDAsQJwOmU0fKwXhrp1UjZqCC2aWH/xk3xNMs2DvBrh9zs/ekTxcp3oFDL0rf2CAI6LtpQa0xLocrJabz8HMB7Q/txP/RqZf5kvp82vXQo3oHrFEBikZhFczzVLeUB+jGIvXX5DUW3REF3XLGS9DuZ1ZZuuH2oWIWwVaEtK0tiqMX6KPEOfqotpyJ/pfRUAmgBoDpvxol6S9CcNPkyBMAXCFLjrFDhYwFLtzg6BW+pqrkUEUxfaEBFM02K4oEHd+Gym2V7LYHg4s3u7Z9kwtXqYzA1WD2a3yNk8K/p5yyYTCVo9Sny2Xc+wZ7Z6UPC/lgUzLwv3aXSL7qf2P9aobTYep9kvE8OeKy16GusAt+ICbpr9on+UDMQp+aF/hA/B6axqt1Mcf1PxD1NLiQKm7B/9Y2T0TckPQ0fwuJuSH/pHhBE3NXIFiwubafZL/640qYQtgbXZ1q7DPBO9RyGQBLuMgjZqwNE36TJG12i2jhO8UP2JYS2ntxWhFMNxNyQ0TWppW+LE7eAQyAwVqbYqkqk5cVlN7iOzAW/18Fe3qJRdIuC6NlRlHwAIAyA8bEDYNDH0CRbuvvMZLAhnMqFDQHHm+msBcqaiG4LljK0HcE4HzrEpEiCeTkE8JlveAeihr035v/2DEixDDQAU2gIUEqIALDiugYznj+1UqZoaUeU1XkoCuKCSwnGxBXWLWoIWTtsIOqrCCvVAYA+B/bADe4NT7vqx192G/mDjaoMGDxFWG6uvFVUbSm4oqDa1HU4EQpx85DjZYJ69T39ktxqG4Let4DfG8lfGvirF1Ih68HolSeP1LL2K5rDJTmedSpEcNyi2aF5LETLYygH3wuZolT7V4Ly3ZjO72APE5xCfDzs+t50s+rMJ3xXHM1hAwNZkDoEO2LelFlRgW01DuIF1r2BjXt146gNgW75bcIOtVVtv0VMtT+nP/m3P7xGMAFrRFloxy5Th+dHc02/cVyptK4NZiG3K8W7wIvhjJrY03Iw88S/swOUzCDgqyfNAKk9oWy2BXp8MJ6f5x3O8sE6DZ5T/sl3h5V+RH3MUpr5NklBs3te5ddN+3/CeXOqGiMW76lFAJFEaUZ6/WoUkYMD91B7+Ub+Z+sm3RP0CkeWU/FB/LR5SYmXbDpIq7ILYQiBaDlW/g2NKPzEf3ea6wpbhPC1fVTGL0Eb37zTRlvmZX95fe18+Xf/nhx8/fTFpXbRtWetSGL5n13F/vqHt6XdywMz9/Pnju652s9SNM/NotlftmcEBiCLSjP1ccuoCRWlWB2oFIZeL3E+SZhfxUStWOmal4a05LymOXEOUzgNuV3hc7ZOo9qb0p9pVYMVM8f/VX2KZT/H/q/K+jmXrWqHYy7Ll7eofxkp5Ux8mGS0tUFEvybpMfW1bFZ8pJVyWEBFd9bj+ePv++ur246efJyaB+uGrv0loj/ZuZnV7rn78cvVfN9qG8KXDZ7zoCd8+kTOIyQ2WdLIIUDKS5fsDilAczLJAlb+DF6gE8bvFq9m74hJDWtxxnWHlyM8UE7lYwFeFAngTivaQNe3r17tJ4asrsl6m3+k7I2OvHsNmyU/DO+UVFl7gRgFeH9dYYamFWJ0RZ6/01G0Js1yTlUALdnt5pl5jlUSEh3/pM827WRqJaSZA3XO8XeRB/qvmSdIn/BT5R7cdMGNDTTX4S2FdWZ2ZG07cNZGYl5VmWIWWpGFashqP88vSUD9DcbOtMCoDuK1gktz5WA4Y3NY5hTX1FmswLwfLNCxbWXk62GqObCnEOGTWAGJ5rpMpV58sr9FYd0FB3pFRVkT1fQHZk6YExh/8MEFnNU3sMKaVyba+UYnTWnFSkldsl+pln9U81oa3t2rdfpOE1n3KdWLLlT+o5XRLMiJsjR0Gd70pzRQPKNc8wjk4P0V3l83dN2G0/K/2Hbyr9KYFh5V7nsvqPOdKyIJqjDdHj0HuIuVRFb7BjGe6k4OxSkaTSWNqMYFJplAp9d34IbTsA9zStTulh/575GvSdhmovL1sIrxrnMjTPUW1v61NWBo1Ez9WZi2dB7OUlDUh89TdLvvk7VrHVudAyAFCztFGs8ob94cXc0IOpMX7x5peE+7CQhHtriGmiVgksEk0jaf+2CbnZzlZKzBPusA8Ea3cml1CtD4lPyZ1k4E2Fwpq2SSaFbG1X7NijlixRw4bjCq5KTYBaaVE9glKpXlpWAwZmq0qG1E1QrfbeHO7zGk0fKrsZMytbGmPYnBN+9uKybuv2GFoRS9riI0hNj56bGzymp2/57zNgTzQmNSk74ZiVFMVkEYBostjR5cm+7TMo9B6fGi5OoN48aDxonEOGVb8mMYbL6UTEz9osaV4KaXQWCRSODjbg1Cz0OLehpylfhwm9OyywoelpWrZQ0gKIWnHQlK1dx1waGo/wE8iRFXrv5VQVV0VhKwQsnYrZFXbaTdD18rVHYSwRwxhNXPNwEPZLEmTNqYtiKVOqINt9cdl9Hi9jiL8+AeUzp66GdIqGtqnSFbZ/NYC2K5rtX12YhJiB0ATTuC4hxy7SppK4XVQvWu1CZEwRMLHj4T1Trk/POZ+eoqhxtZ6i2oqpNbXAIRlTePLQwQYyR0LwPVWbU1QLmt5Wv7oaIxkuzUtROuHjdYNk9bAgnRiJiHuqhezvnoL0lkSmitkUOcsKkq/PC1DRA8kd/PwsNjCPh0iltvd2mHiziqw31ooyxZiYIiBj394V+ENB7X7aztgh3pIVqHfpg7LKoqG3VwIJo9+vFVhl13Zva1YXUH8d9gDqqq5YWAHVVHqvZI+egnpJBklYqdrBAof/CD8gpdz73+dIWpinYz2Sq3sUcSnaHtbUV+3ldl/bahlDBEgRIBHjwB1HnJQUeAug3egkaBOzw1Fg7riISKEiPDYEaHONrsSFVqsviAyPGhkqJ0vhhUdLnA3PbIi81DWUTxqSp1vILC4eljGKZp3OkbkbexhhJi3vO34sItq7LsmVPKFyBAiw85EhrJfHGRcWD1sBx4VyjpuOCaUC4eIECLCrkSEsmV2LR7UrrYgGjxKNFiYJYYaC/qsm0IkyDteI4C4xmuf6iu9OxAMqhrao4hQ3fy2wsLOa3UQOtFKGqJEiBKPHiUaHOagQsUdR/FA40WDthsKGg01QOQIkeOxI0eDeXYlfLRblUEMedAY0jR9DCuQJHexYnPhXfWy9eJUuYbd9pPYP7vImV6062yvCC4MBguTGVXcWTxV3+VbtiGFtYzlJiezJzRfh4UBVi6/kLrh9QlFVQubOV5c0sPL2S/b9VT+FfkxR2Hql5c7pqXODW/1LpLN3hmxK2/91Sok61/cZDzAJtnF8n7yLZnQ7k3Jj/KF19uqa99NLTdhh3UiW4pdbV//OFcslWhf9He2G5Zht7EfJT4dnnwlpl4Ka5ZtyoeztFpuIX3WXb50uiXtvUnXD3d213i3b4KKgbWDloS33I/b3w0Le/Kx7gZx2VhwGfIHmreoDeCH6b+6u8mxIPEjKErWMfKe/ISK5F+4LSNhHKjfFfoo301enAC4jvO5h1tnF68NLlt/r654zl58SL2Xv/jh6sn/i0uF7a0e/uqSQfZx3p87nOso41RvYW3IAoratYPrOqlyuOu3K1ZmgyuJAYyz2zrlbqwAKD//Lyd4XsXYhT3jCOPSwSu42TcGe0YowJFA7KyWScAk4fjx45o857z6iePPZnhSi1Ksuo2i5EccCeB41nm8/uWtwy2SDhJ3145H+MPMpMtCEL+ZKm/7baA+AcywqA/uPm4EaIObirsEtvX6FmLPy4J562mJBkDvcCR0i38hO+Xk3/+N9UAG5cjyWTdavo7Gzh9FRI+EDIUBrBGt+MpEH5yVISZqmYUCVELJ5LjTXM185Q/xavYTf13rpjwJn/OaCRCV4J+i6gfkxyj20uU3FBnqposE3n6Vn/XUflA97u2mcGG0Vq2F1ONVbpYr+jhz+4pqlzcr8oJsKhXFa1uxrJJC5eKXZ4oFxdV8nkFyZHM7iBbL+JnG+ATv5PvGtPnuWUWf1QNuVNbFE/LJJrd7e3Xzn97N27+/f/f5x/cTzXDduhg3SJasdaMxk9v2OzY2Ly7GCmgYO4qR1FTs8tP1iuwaKJ0aWVPiUUD7VNw5oOvNyn3IchtMN6xX7hUII3JaGPzqF3KXLnZb/ahoH9OiLVnthnIQVJAb3FPu3KD0av5PhDv5groKGYltPCHkqMuqaT+097Ou14zv/fghSGM/3mT7VdrySCrNxGVtdx+Z7VH9KuzP/Rn/QHO+12XRjBi9kCWAvyCF/oVnrdU2BTchPAqeJdncAGAther6g27BEACwrftgm8I0DoG5KautBb0pSmwIgVO1dRhAXO6irNC4kiOyekvpNwDQOxygpzBfa1wvN5Bp/pse4SvZx7T0if5lpZlMlZ8CcAjAIQCHABwCcNggcGiGKwA/7BZ+iIMqb7t4m0qBf50bHrehUB+QRU1zTwhk7InCAGwZJt6oM78BQI9m3wIoJAwMQCGbQyHNo+0QgGRVC+rdP2osvKkrSM09AMQSEMueIJZmSwbwEsBLAC8BvATwEsBLDl5awyCAY3bs/uOt4rwipqlRai20bHO7xNEV9p/rWcrDrO6Cm4rGnhS02QNldVTSVVIcBD6nHx5dzW8GMNPRYSa90RwGZDLVXxNi0hfdGMBkaH2P4CUAcNoHcPSWsm82NsBDAA8BPATwEMBDbPAQq9gJ0JCuoSEb3HmiWaa4TMcUDFFotLHoupC6rh+QSKHRJwuNdFx5PYNIitIcHFSiHjYAmQBkYgFZqI3n8NCJrh0NQijqKlqBUjS9AUgFIBUNpKK2GIBWAFoBaAWgFYBWDgWtVMZeALF0HGLJ0vdrsZaCiuuE7dgEflxGj9frKMKPf0Dp7KmzUIuiraeEsPRAVe2fHUpCPLDZ8o2RlxNtrUGUHucEmkpRQ8Bs9OOvP2fPumI/AAc1Bwfp7fIgKJCp+nrgj77kpjAfQ9uHcTirPN7h1NQBESK9fVkfmSprcFr+CI4wAa4EuBLgSoArNYkrWUWcACd1DE4iagix2ryY6c1bEMUREEmhz+YAiS9xgGf8noBHrLGnix51U1nd5+UopTg8bEcaHsDDAeDFBvmQjOYIyEuh/iahF6nodrAXufXAswEURYeiSJYC/BrAQQAHARwEcJCD4SC62AmAkK4DIa9Uc2UkhGm0RnT9A0q/PC1DdJPiuairEIjUyBOCPjqtnM5DHrL0BgB1qIYBQBwAcSghBpWxHALaUNdbC9JQFdkQlKFsLUAYAGHkEIbKQgC6AOgCoAuALgC6aA+6qIh9ALLoFmTxiFLs37G+vIQojMyfogJrBMEf/CAkk9n7X2eIjtKuohSlhp4QUtF5JXUerShLcACIhW5IAGoBqIUSPdAZzCGQC33dtdALXbENIRjaVgOKAShGjmLorASQDEAyAMkAJAOQjPaQDIvYCNCMbqEZC6wy7xXrzEOZ0rBFlBTZQMB89bCMUzTvOqbBm3mCiEZHFdQbPCOT34DQDHkwAJYBWIYRT5DN5ZBIRrHmRnAMudCGUYxCiwHDAAyjhGHINgIIBiAYgGAAggEIRvsIhjYWAvyiq/iFz1QmoBdciTVC4y+4yYsQT2MdBS2y9p0QWtFVlXQepsgFNwB8omD3AEwAMKGEBwp2cghEolRlLSiiUFpDGESxjQA+APiQgw8F4wDUAVAHQB0AdQDUoT3UQR/TANzQLbjhlWsKaz9TWo1Y9p0fPaJ4uU50c2s3UIZCM08IbOi4gtq/iiNzDzUu4GA+gDa/dinJCncA1SwmQeGiZhFcezVLEZ1pbdEQXdcsZL0O5nVlm64fahYhzF/mFaRFY/DC3TP0qbqYdqC4olsZACKnniP6c+cQODpwdODoAK8+Ll6t9qKHgK11NddCr9WFNgRia1o8jCuxRHyJXYRleDizUrtn2dRi9TCZQKwezC5BtXm2iGJZNJkI0OpR4tjteobdt9WDgpO2LJi5YrjB7HA7FmpPYH15WY6GZb9MtI/yyqexDgIpruCm2S/6R8kgm5If+kf48JrOdIt2JVon/mFqKVHclP2jf4yMrCn5YegIHlNT8kP/iIhUCr+bymTDaZr9ApfIwf4T7D/B/hPsPzW4/1QJc8M2VLe2oeaZwrwF1Rg2hoIOa2x63KTLGF2j2TpOcCz8E0oS/7GzCdOVjT2hHapeKOsQ8C3tuLYqcs9A4rKa3EdmO1QtRdEdZT9ArcQB7AqYRmef9gY6b1yAwTaGwZps9hBIrLn+WnisqeiGUFlj64eCzdJOAcJ3OITPZFU74Hz0tSn/F5AkQJIASQIkCZCkBpEky3AU8KRu4UkJURvWB9ebly1xpurQtAZecY0HRV+wJVVbTwha6oOqOn/qWinEASA7hrEBp7EBWVEiGwabOQSwYqy+Fq5iKLkhWMXUdji9DUhJjpQYDAVOcgP+AfgH4B+Af7SHf9jFTAB/dAv+iLHWlOiHSp01Imq85scecz1Lr6J5r1g2lQ0/IVikd0psnyAxR6v0qcZpuHagl2pFDQCHsR2Z/WHbHNGYAOtpDOuxtctDAD/2bamFAtlW0xAkZN2rYbBuqFsAzs3hkCRb+7Lm31ANTulP4N4A9gTYE2BPgD01iD3tEZgCENUtIGqWqdDzo7mnZ+VUqnorAzz+nPsvccBmdGI8987Mj+iwJx7L8aMNb2mCm+rcezfc5O9xN4ViVjF6IZGH77zS0pwFnvid+ZKMad+5/7BcujFajMb3uMS5k8Yb8oVUQjaWXOfvy1dcWDxxXrGcfVwoFihuy/J1Wzr+JHteKIJMiOQlbCZbYfEWfEH+t2u0QDG2Tdx40jzhzXtyxD5rIdYzmcOxkyCFcRPySd/xQ9r+L1+w8dMIykn8BUo3LEyjDU9oC2QxKzvvjBZkCZiS5oy32p+FeKpxpPpHuSbwEl4+/oeIawqiAI/ZkTLtU3no+KtVGMyo2zVlCtJNhFfb1z/O78rFU69VLPUtFo3/EKKvu8XJaqwiez7Lu2l6GH+OYtwd9z3/JYvA8/CJQADJTbp+uLMCJYjdVcksX+Blv2ybVl776SERm7RQO627NOCpes6no4TNQfhV+q/mGToUpw6KkjX2Uk9+Qjv3L1zqiHw1petlzbtiVpWp2OOi7+baop6KWBK3sxrwLS2xDYhWGvxmE24Ckqf/nhDs3ne9tQ+cRv4zqplIrjIL4jyYpaQsvFTCBR4F1meGcCjo/rjWoRrs/UHyh2SQb5xPUbhx7tnq9D6hi9z7dKty/FHytFzj6OH+Plvr4aXmxPEVZd1necTv85eSlf8a4RfcdnclJHueOLvuX5zOBoY45A6xSSHXV2sjQiyqoc0GqXXD2FAg3skqpV85FyNsPrS9+SDam/UGA9HolPyY1M31Nz6rHC+C/7B1t5qBw+GHEQMCsxPPKH4JZjxOHVVmBhTbU5FML0YL8XHXyz/WyMLVLL2tAURaN58Sp4XdEXWVY5ejebAjBDtCsCMEO0ID3xHKEOimtoIMHrvH2z292sqheaCyBU2dBG8ovZr/E+FOvqABwJZid04pTd8wtNg+ZuRnUqoJHPnxQ5DGfrzx9s7epjBV92f8A83t0rkxx/5CVgv+ghT6Fy9BWA36zTfchPA4CQhF8zwtaFWh5f4grDBaAPAFwLehvI9lAz5IukdVtfWyPJZLbCq5o6KtwwCDc0dqhQiX3KXlPTYK7wag8gGzSJbN1xpbzg1kmv+mBztL9jEtfWK6kEVhJlPlpwBeV4PX5sgLMGzAsAHDBgwbMOzOYdjVjhug7MNA2Ti89rYL5KmEFtXARIV4c2Agt6ZnJ4R3D0+3AOYNE/rWWeppoeBmjwWAOIwhAMRPDRA3+4RDYONVLagFk5sLbwgxr+gBgOcAnvcEPDdbMuDoQ8fRrSM6gNQBUgdIHSB1gNQ7B6nv5MMBXT8Mui5E0F4RadcorBYwu7ld5umD+JpkEJC7ol8nBbgPS6+dv9hLLfBTQ431g25Yt4AB+Hly4KfetA8DfZrqrwl86otuDPY0tB7uKwNYUYAV9Zay74VlJ43SWS0DAaMDjA4wOsDoAKPrIEZn7cEBoTsUQrfBHfO2ybm5/ihAp9BWYzBOIXvx4GC6Qv9OFq4bjp57BtsVBX/K8J16MAKMBzDeYGA8tYkfHs7TtaNBWE9dRSvwnqY3APMBzKeB+dQWA3BfTbivchkJsB/AfgD7AewHsF/HYT8rTw7w35Hgv+x2MS0OWFBfHZwIq/fHZfR4vY4i/PgHlM6ehgADKrp1SujfsLTa/rHeJMTugq302ImdRFtrEKXHOUeu0umJ4Yn6Ud2fE+RdMTWAKk8NqtSPnoMglKbq6wGT+pKbwiMNbR/GEeuyV4KzzwdEL/X2ZX3wuazBafkjOIhsgXlaLZ4B6gSoE6BOgDoB6uwe1GntwAHhPBDCSUQcYpV4MdOJtyBKIbimQlfNAV9sPTI8PJPVfrqAZu/12n0ao1LgJw03SoMOaIuABQ4HC5RM+whgYKH+JtFAqeh24EC59UBLBGBPB+xJlgJ0xLrQnG4ZCNgcYHOAzQE2B9hc17E5kwcHcO5Y4BwLA8voHNNWDRjnB5R+eVqG6IZM9AOA5aT+nBAcNxQ9dh6GkwV9WvCbanAB7AawW49hN5VJHwJuU9dbC2ZTFdkQvKZsLcBqAKvlsJrKQgBO2xlOq1jGAYwGMBrAaACjAYzWORjNwnMDfHYY+OwRpdhpY12w+ZYsUkTl1EBZPvhBSGao97/OEB16A0DMSn06IdRsSPrsPHJWFvZpoWe6gQYIGiBoPUbQdGZ9CBRNX3ctJE1XbENomrbVgKgBopYjajorAVRtZ1TNYpkHyBoga4CsAbIGyFrnkDVL7w3o2mHQtQVWh/eK9eGhTCHYdEtKagCVuXpYximaDwhj4z06QYSt/7rsDb6Wifo00TV5iAG2BtjaALA12agPiawVa24EV5MLbRhVK7QYMDXA1EqYmmwjgKjtjahpl3WApwGeBnga4GmAp3UWTzP6bkDTDo2m+UwdApbGFVQDffnCI7wBQGhZV04IOxuA9joPmuUyPi20rDCaACYDmKzHMFnBmg+Bj5WqrAWMFUprCBErthGgMIDCciisYByAge2MgemXZwB+AfgF4BeAXwB+dQ78MjttQL0Og3plIRU200whNXCSd370iOLlOtGtXXoHdhV6dEKY13B02f69lZlDqXFbJXOxtPm1S0lWuAOoZjEJChc1i+Daq1mK6H5ri4boumYh63UwryvbdP1QswhhxjMvNi0aQ8IrQ5+qi2kHES56oNMChtUzT3/u8gWfCD4RfCJsm8C2SfW2idrXH2L3RFdzrU0UdaEN7aVoWjyMq6ZFbI1dMG14OLNSu2fZBGj1MJnmrB7kdm31bBHBs2gyEaDVo2T6sesZnmSsHhSmEsuC2YQBN4MfbuNM7QmsLwXPAcHsF/3OEK98Guvgn+I6c5r9YthtwoNsSn5MKjfPZrrQQglYin+YWkoUN2X/6B8jI2tKfph27dYPU/JD/4gI1gq/V+0E4qqzX+By9upt0ErEDnZDYTcUdkNhNxR2Qzu3G2rlu2FT9DCbovNMGd6CagNbbUE/NfbVbtJljK7RbB0nwQv6CSWJ/ziE+56U/Tqh/dKh6fUQOwRURtqqyOVrictqch+ZmVENFqV8lN0ptb5Pa4/KNOb7tFPVeTuEHYET2xEwjaxD7AuY66+1O2AquqE9AmPrh7JTQDsFePPh8GaTVe2AOtPXpvxfwDWrcU3LlTWgm4BuAroJ6Cagm51DN3fw4IBxHgbjTIhKsKy5TrxsPTlVAxs1gLFrbOkDxDtV3TohuHNgWu18ehSlvE8LbTSMOEibAmhfj9E+g2UfAuwzVl8L6zOU3BDUZ2o7pFkB9C5H7wyGAilXdsbk7JZ/AMkBJAeQHEByAMl1DpKzd+CAyB0GkYuxRpSAnEpVNZAbvPLAbnA9S6+i+VDJiJV9PCGkbsj6bp8cNker9KnGufR20MBqnZ4WNGg73vtDSjyi3QH8eGLwo+3oOQQWad+WWsCkbTUNoZTWvRoGOZE6L6AmHg7ctLUva5oi1eCU/gSKYjUcuscaG7BRwEYBGwVsFLDRzmGje3pzAEoPA5TOMvV4ODD19ETGSjVuZUAwFRaVyiTJUnqeQqRO5pMqZ57PU9kvWxCiPIWVMQIayOcXySD/2zVaoBhbDXK9G9Lky4LgyLQbkFhyG3njyDwMnfMHbBPn2/DbIQ4WR6YxKpSQbHCcinU/c5L1ox87eAQ79ytsTlmBNNhfRyEWo/OKLkoFvGZNILYQL0MnXC5XE6xjLLBg9uQQzRMFb0jl2+qKzZArJ8tE6uVKyEGWhmxqWmfyFab7iLAvOiv4cyGRmd59y0uVmQWukKVUt1vdGlNFuQURCK12mbg9IuTRWFsKdbd5UVtVapa0zEqIgU/pSk0Ri1kLBH+MYjwk3I9RkAZ+GPwLWYmEtjb3k2m4GSnadaZ40TReRsq0rq7nr1ZhMKPiJQmn+Kd0Epk4eX1nGi86C/HSxslGpJxOApGJL8Bd9zx15WX/LDdm50Xp1fb1j/O7cvG0V8VS32J34D+E6OvXnaAyM+hbGALKh3PzeM9/yUC4HEChMd5Nun64swJPD+CWFXN6M6t6zdaR2iWpLBeXIX+geYvaAH6Y/qt5hggSP4KiZI0n2Sc/oSL5F26LyTOwd8UUilNRTsWlB9cxnY6I/XHrrLHlRUtsZVurhjXvvotJ/z3OTqXUBDL6Gt+W7LmO2t8BivxnVDONdWUO9nkwS0lZeLbDBdpsKe1jGEWlH2xv8piWoBrE/dl+7K3xNbuDKBvQZJe1y/h09g9FEz/EHqFcX72NQLGshjb7pOYNY0OPuAOrPNjlBOaw+df25p9ob9YbfESjU/JjUjdB9hg2mWCTCTaZYJNp2JtMnsc31WmfGttr0oTBPd9PUkCx+Zq9UkrqBnHpTwU9DGtbi2aWzGb1OoloUXo1/yfCnXxB/cfAxN4cFwoTW9IKIjYMxbWPTfiZkGoCFH78EKSxH2+8vTPAKqzT/Rn/QHO7lLDMT76Q1Yq/IIX+xUsQVph+xwc3IdwFKtnDajUWeVKonUKx/QHvYIA0OkAAUjxC/uOy3Rwk7bGq2prpjstFNpXlWNHYYcCNuQOzwhxLbsryekGFVwHY8oDplMvma41e5gYyzX/T45gl+5iWPjHdk6cwk6nyU4BHAR4FeBTgUYBHG8wcbMREhoeSFqMRAEs16YsRHhP5KnEqIRU1IDiB3TosGFXTseMiqppGtQKuDk6zACN1CkaqZ8vVdnpS6KvZWwEQCyMIMNnDY7LmUXkIeLaqBfWQWnPpDYG2FV0A/Bbw257gt2ZLBigXoFyAcgHKBSgXoFwG5VojMMNDdQ2hDQC8aoBXSDfqFcFejThroYOb22WeL4bHdkNAfRXdOjbmq2hSS4jvoHTaRYVUCfvEQEv9YOvq/XR7GAEgb8dA3vSmdRjczVR/XdRNX3ZjmJuh+XBJHGBaAqaltxTLW+IAIgKICCAigIgAItoHIrIK2YYIEGnW3wAP6eChDZa3t00FvM0Bq5RlYzhCIQoZGkZUKK5LWFGhaQfAjAaj6y4ryFb4J4wlqQdlvzAlK+MAbOnY2JLa1A6PMena0STWpK6jFcxJ0x3AngB70mBPaosBDAowKMCgAIMCDOpAGFRlCDh0LEqxbgdMyhKTysILLThVEG4d4AJb34/L6PF6HUX48Q8onT0NAJtS9OrIkJSiRe0gUYNSaPtH7ZIQOwq2EmUU/qTu5ekNqLxCnacFaenHcn8OdHbBygAkOwJIpjfeg2BjpuprQmL6optCwgyNH8Zxx7JXgHOIB8TN9PZlfQixrMFp+SM4FAhoG6BtgLYB2tYg2mYV5g4QZNMs9wFb02BrRPEhFpgXM4l5CyIygqgpJNkc7vIlJnduDw5JY93qFJTGmnQILK3vOu2iQqqEfcpQlzTYOs/asjcCAKKODkRJpnUEJKpQf6NQlFR2O1iU3HxgYwGqpEOVJEsBFhbgQoALAS4EuNChcCFdyDZ4YGi7/gZkyBYZeqUyK0NDTJY1cIQfUPrlaRmimxRPf/3HhKTuHBcLkprSCgY0EN11SQE64Z4U1qMaRF3HeCyUDdjO4bEdlSkdAtNR11sPy1GV2RCGo2wuYDeA3eTYjcpCALMBzAYwG8BsALNpDbOpCLGGh9WU1tGA0agxmkeU4qkES8pLiKjITC2KrkZY/8EPQjJvvv91hqhD6D8sU+rScaGZUnNagWcGpMeuKcIk5JOCanQDq+twjaXiAbI5PGSjM6lDwDb6uutBN7pyG4JvtM0GCAcgnBzC0VkJwDgA4wCMAzAOwDitwTgWodjwoBzlGhvgHDWcs8DC8l6xtHAMwMWFDbAkwgbggKuHZZyi+XBAHd6hbkA6vDGtAjq912C3lKAX8ElCOfJw6guQY1Q5wDjHg3FkczokiFOsuRkIRy61YQCn0GSAbwC+KcE3so0AeAPgDYA3AN4AeNM6eKMNu4YL3QiragBuqoAbnwlLgG24+GqE/Fmw0X+0JqvtuDBN1opW8Jn+K6sjYleI9KSgmMJY6ToGY9YugC+HB18KBnQI1KVUZT24pVBcQzhLsZEAsADAkgMsBeMAZAWQFUBWAFkBZKU1ZEUfMA0PUhEXyYClqLGUVy4jbGOZuGqE4+/86BHFy3Wim8D7BqEUOnRcJKXQmFYAlcFosP1blDJ/VuPuJOa0aPNrl5KscAdQzWISFC5qFsH1XLMU0fvXFg3Rdc1C1utgXle26fqhZhHChGte8lo0BkcanqFP1cU04Jv0fuekwEf1LNOf++TAE4InBE+4iycEhP7wCL3ayx4CqNfVXA+vV5faEGyvafIwbjoUITV2v6Hh4cxM7Z5lc4/Vw2SGsXowu3fb5tkicGfRZCJAq0eJ57frGfbvVg8KXtyyYOar4WLKw+3RqD2B9Z2UOQCY/TLRPsorn8Y6lKW4xJtmv+gfJYNsSn7oH+HDazrTreqVAKX4h6mlRHFT9o/+MTKypuSHoSN4TE3JD/0jIjgr/G4qkw2nafYL3A0KO26w4wY7brDj1tyO2/9p79uaGzeSdN/5KxDqB5KzNHzGe8550AZjVuPuntFOt+2Q1NFnjkYBQWRJgpsCGAAoWTPr/75ZF4AFoKpQuJDiJR1hNUUBdcnKysrvy0SillE/vMCbAgJj/E0df5tnovLumaxA80rS6xDMuUyjmFyQ2SpOAHh/JkniPxzAGx+U03rb0JxySBsJ0B3Ymm6DnGYi0nZF37ySuLwn94Gvp7e8+8EtC7kJCdhFH+rW+qhCI6a9vk8Bkt3WQaSjt09HmzR7G6S0uf9u1LSp7Z4IauPwD4WmZpNCsnN7ZKdJqxpQnuy2qfgXSTUk1ZBUQ1INSbX+SDVLFHx41JrWqUeCTU2wJVRgoAJCYl7mVE3V6LoDM3MB+/DwyDbVrN6Wa1ONaCNU22Et6A4uR42oj4roMuyzXS9GYK8ByDNtn2cyKNY2aCZj991YJkPTPZFMpsFjIQPkjXLeyKAoWNQA2SBkg5ANQjZoY2yQHVA7PDJI53gjF6TmgmKQl5IKUgmyA3EAKANs9GqWnoXzA83Bqp3i23JEtcPbCGF0wOu++RyZOVmmjx2eCt3I+jdZ26Oiq2z3//7kaO2C/iE/tn1+zFaTt0GW2Y+lG3Nm209PNJr1tA4jb4tZEsza2h77Zqtf1hlcbAWn7CdmbyFfh3wd8nXI1/XH17XAyYdH3llBBGTy1EzeLBOe54dzT5/jVSvktQzWUJ/ShEXBVwtIlGt72QCwgeYxHThuTwcKTeH7baQsTeb6ixf/NeGbX/To0nfiBKG3AuEvRmOl+6gxTKzJJSh0AENiFk/Z8iKKliP1gcEaz5vJysoqLi5+M3aZtEU/Y9VyvMQwqI2uB/2P9RLnBOefQTEvSfwczGCJzkM4D8hXdsWPcHb6dwtybXvhBUlWi/Sm2FuJf+C8UXXomRjheIArlFzK+hIvIyfMFxWZC1kVLadS1NWTk5NfSEyPIscPnZOA3caleeJwtQFknw2gRK/dMvR7Sw/3SHhLpw51JZ3oKUhTMp84t3xhboeJ2BZFfi4Ep4Cf0NAGGJi5Wx5dyaZ8JQ4M9sWP53nv/iKC016c8EEYklj0euuMXh6D2WOpCX8B5g+cAzi26R6hbsmSul/zsev8Ah+gnThaPTw67GbyTOJSA0xatDMYcOwkq+USzOrc+e47h/wGH2ew62cL2hA9nB9J6e5bvoa3sAuolSULNnQw2Q/QGBsWHHnEmUcv1PYR/8k9XuOisB2StZiIXT9hG3BKfww0J+S7bJM4yZLMgvtgJk6tZL0d6oIFa5PG2ioOS80L23LCF8yLNDHCayvIt7TNpVexHyY+8wDsmu6Nma4LP7F/lSGmTbHGfyh3swHcWey14CWICYvSpgNt0AJ1cOM6uNdKRf8L/SfSodppbbXfeTBLaTsAE6AxQ2utNLyswfVhN1TrHgJ+ssVtGdTzcBe95S7aTATPOnrXf+ROVslxx77qInPFvgZtA29yM2pOuFlkrTCsKi/aPnK2paiZ6IbuJX0BWG3V3kHnqJo6otYgmvaWkbR2UTRlBE3WI6soGV2xKf1RQ6zqq75W6MevGVlwmwG82wlg7YVzcufH5MShwgBDFFfwcBET3vILJ84qXBDA0C9kGJM1E0GNShyVCUuKPScAnjlkdygtSZH3K+3OAYcjpUf1DKD6gx9T+K4agoRub4um713ZDmcjY82fiLExZH1SGsR6/mWKNZOGc5vDdXdQiaYUjsJMH09r4/mS6bV3SjTh+xrCoRKMlMkHaSR1BIQFEVHpSkFKKHo0EBOFTgvNGkgKfRCZkxYKZNaI/beKlZQNCJgos/0ZjW1D4WTRSJ1yt/U8BNfDXwT/JA0UKhd6runp4nW0f0IcbC9u3ipw3TZmvYV4detYdZs4dacYdZP4tD50WPDx6Wn9SxylUVXXy/HamCFZeTsat0mt9m8ueto4mFvifQf9BjV7CGjqgpms2F/mh7Vg8S5Jejb/lcCEnkmfZN7uUr/yjI+JAS7Ou0ci+HhUaO85Jz9bpw7Ekx/fBWnsx69e66qkii3o/gQ/yNyuTGlMY6Iw/Xva4B+9hIAO6N+/Bd0vbOmvhptEswk2TSnvHfmrWHDkgHE/9rEfD46VVizGpslpZZetOWpFazoU2KRer2KM+0tY5xu/lrWubO/aO5S7EUnv/klvhUpacd/54k/zT2oIW1n7aeWbiYbhUqjAVPntURPr+0px98I7N+acx64e6iHB3JRg3lNZIs+MPLP+Oagi0azy3hvwzTy5tsg31++a/XrKR5suvOO8M0A3b+3ETgv8RwsOUWI0jo+R1kz+mMhprQh65KmPUseQIjt0iqz91qnfGkhkl7gts6lGThs3bM8b9uDobfMO2jTTXdd7a9Lb3HAP/HfNyJEKRyr8Dalws3YiK46s+AGz4lbAEgnypgT5/osVuXLkym258hpU0IQ2z+xVgThvtJuQQ98Gh56ul8Qr8+ma5WpFe75eRXkdK2GXsW5DF7peIdDjIuuVAuiVqkedRfq/F6WrUyos/7El4lxvNI+eNm+r6AdIDuu1ZPPUsKnvDsSwvtk+KngYh70HrDBysP1xsHpNqGVgsZoGVtPAahpqdrcWiyC325zb3W+hIrOLzK5ltQ2jP9+x+kaDbYTVOLbC6L6CGLz12wXEWjFCV7FUnamxElRHiqwvWrfU1PHSuxVBbIzmRV1Gurc3JbRVMqR/34D+VRtXpIE7boADp4PVWrNdWlg3hp7oYXXz/dPEmmkgXXy0dLFaI5A2RtoYaeMeaGMjtkH6uBt9vL/CRRoZaeRWNLIGD/RKJ1ttK6SV34JWzqyqll8urV0bbg7W9FMUPlyswhAu/UjS2SNSch3oZYU8j4pVVs6/TzIZFRY5ZFaaaAHW3EuDJyIe5ky0PQVhav3Ufjv9rdFPpJ+3Qz/rjS/W7NiBLXN4zLVe4TZOWJu6bs9T61vthZ42DHp/S1tUtxXWntgAka3XHavCE9VVmla/wvcPIvWN1Lcl9V2LxJDxbsx477dMkehGotuW6Daghq78tvUmQlp7G7Q2le8C1sOL+YJ493RFKJmtWKjulCBnOI6kprRq6kfMN2cC2BzhfAzahepRt/xYMdlMHBUMEWb8tlTJQ+dLC1qyZcK01HdfjGmh2T7qAZtGjYm8x8t/FjQBE3j3n098s7K29f4t8ngdeby9EyoSeUjkWZe0NTm0Hd8D12AfYTHbtyHz+LJV2Ty+Vi0Il7+Q9OtjtCCXqZ8STO1rTw4WBHlMpGBp4j2SgaibSC22VDKdEmFu6FYISpUxRGKyoUIfHCGp0opNE5HqPlsTkKrm+sjVVA4TGccjYhxVGoBMI+ZLYr5kq3xJA3ZAgrUpwbqvwkRiFYlVywxJpT/eMTXSYttgTuQWaNQHknovdCG8hK4E9bnklWnBTH30gwV1tT78NiNM05Cdas+cVoR5TOypYvI9Mqiop8iidlQ2kzIhm7oVNlVnIJFRbaHcB8eq6rRj08yqvt/W7KquyT4YVu1wkWU9IpZVpwXItCLTikxrK6a1BmMg29qUbd1ngSLjioyrJeOq9dc7sq6W2weZ1y0wr/ewFh49l8BUitUAZamsUAdm6+wuilMyR16rO/8qRHmM7Gs+9Q1wr6ihyLy2UDS9IiHrulXWtWgWkXNtrNYHy7gWNWNbfGu5185sa7HBPrnW0lCRaT1CprWoA8izIs+KPGsnnlWJJ5Blbcuy7p84kWNFjrUhx1ryz3tiWI1bB/nVrfKrPl8LiV0Vq9OCucoO8B4oKx1Cb4T9m9GZ2c1b4zELiHjde49U4n4uyBuLVyG+eubsnXMeiv2XCIebOtNzAm5H+MDwAt23AL4oiJk4o8Al7qTUxJKaVmglSfwH4txTpOOEPvw+nlDvPnmMVvAN3f5Dz5tHq7sFAf8VzGwyg1HNPW9YavDZjwMfrkqoAfGfo2Du+OGrw70Z8IhY69TK3C+CWZrwYVKLwWcyTMoD9GO4AeSZlBCJc/XIBpWQxT0MY30hPbAYSnqmPYLlAzzyyys0DjYwKrURhPNgRvPsGcFDdTS3aLSRuwjmKr5hVhNEArIoNTLMtHvoUD8RTiH3EJRfY6R2iFVssN3o3iJxDBMXuu4lq+VywUi+0VgJJ0FtR9c61z8dUxDtpFS5rm1Z50kz0vnmxgwa7k+G2aSHXF8zyAZjB7VdwWLdwR6ePZL5agEH7j34UnDV8F9l8nDseh7dl573+9B5DnznlvtW12ClbtysgRH7dZxLejTLpsX/cHsyUKHKLnOY+SFzPmEaVBVs53AyGDT11geNsNR1A4K/wX69qfakU9qpXpsnAyNLdWAMd8k8bZrarnTXgXsut7X7pHMdCduINFBQ2BZMWwn1JUv/JRxJRqkvcqSwZDY8iS2lND4uDt5OE3ZOEcQeLW1RqxeKsUXuWWX2B+fn5/c0BzMtYOR7P3wgcbRKVII+1Jd2lCZ9TNlNlan3SEkclS7t/btoM4K15Rto+eHBJNOpBaF/7ZugvESH24XKdGhBpp47iYKuY4cGVqtg3kWO6equw+2S7pkjQjWD8FPiGeZhbqKjqdObMnzdTImsUh+h+JJvNKxoWNGwHiL/pbZ4m6bBdL22zvBUN9jDi5I0I93ft8rLmSD8XfKaCzMtrL+Ob5TaC6nlrb1I6GvtdeUck5ohUiHVXkYtYv0swO7VXiRZN4sGuQ1bX4ipuX2l5qp3rxUNlyftZB8mmkAUa3Iaq9iWstsyzT6oL6MbZEp/qP8stsZ0pnJ4lQlE8i+6kdFFmfJ/1JfQXTGlPzSDhv0wpT/qs5Okz7q2+FaYZh8m+MYxfOOY7RvHjEQdpg03TRveX3Fi2jCmDdu+ZUyD+jq+X8xq7+CbxbYRUJxnS+Gx9MQE9KS0Oi1iQpdpFJMLMlvFCQD3zzyL5jiijMqpH1OsUSOAHiOOR6hdB0CPs1XSNk9fcJi4vHX3gauSt7z7wS2vsy1d2VYN69QMY0IlatFk8DAytOOqf3B8vUkbN83am/tuzd2bmu2BwTeOep95fP7QDbLGvbPGJo2x5I7ZLVPxL7KYyGJas5gWzj9ymU25zH0XKjKayGjaMppG77gjr9lgHyG7uQ12M6ELApIWK5I90Aeqo1yqFmQUrZG4SS7q2GrQquR5TPSpev49sqeosEjJ9qJyNSqFxWm3Qr8a7CVWqG2n5QdHihp0ZNOcqLHr1pSoodU+qtaaBo2la4+I6TQoAtavlS7A+rVYv9aG7OQUbj0CQQa3KYO75zJFAhcJXMtKtiY/vmM5W/tNhDVtt0De0iVScreqdWrBhIHZhT2+mqVn4fyIM1ZrxXBM9KuFMHrkYo9cA/c+tW9Oluljy6f8e1e7JmqFWawlRsnWCGJG6w6o/cERtLbat2m21n4cralb2y56yGy1ns3+ZrmynYg5rv0zv7a6Y5XvylZpyn5irivmulrnujaEB8iaNmVND0nASKEihWqbA2vtdzfJh82sWYFSbbnDMDt2GwTrLFsczw/nnj5XtnYR+ZxnC9iTjndJFvdfif/tgtyTmFDbXvgN7PW6+AC5z1+gMqqUoTRC3ZdHQ3lI8TUsMkmDJ5J/WKP3/E/0x5ws1pZO9wIceQ4um+SlGPmpYaeZ7hvRSbqev1wu6GuSYOi0pJPDv0395Bs4b3SaU/pjbM8vUqkWDjomTHAhAz+xMdUTkLXzGL2oGB6ZJ/grK0NvvuaXDxfe158v/vbx089f6+R5Lo25A72qmT7M6RtZF9OkFbvcL1/O3+/yVCtTqdkj9kts2lqymDQ7K5eeukFZos24JxB0842ol2b9ZjzXipdZGbgBhiru0BSfk88iAzYR/qorXa559QZdxSn7qT6gYIGm8L/6jyD7KfxveU4Jm/0xisFFkiwzLEpFkc4pBLpbEKZIRSWFIxj8cs8Te63u5pLPzi1ewIrPwM82kRS2wpjG3j4KyP7d7psyF0GSXpf6527nTS/RNdSJnYvL0VfIdahnXVtkfR7MUtoOeFHQWF0Yop0ClhUM3yUqBnik7xJF81CM8MgnyW6HS/fUGjWLgsnLcXzvQNQMmpm2usrj1VLw5hfpidGw8yGI3AefxqHVLv4frutejecC6jBneQdzfea1q/B9WjHYejtQd4/Fhfwtv7S0eygRicE8Ud5xg+967Pyux0NVUTEi2dZZv0xSPg2m9Mek9lLL4vf5XHdir+wPL82K4GWx+DYFQkl6Nv+VwISej6XqrDTjNwTxxWH0ieWPZ0k35+76mQA7+Lx+fBeksR+/eq3LWip01f0JfpB5fZ1LfqA908Cvf08b/COgSlgc/RuuoPtFI8+7qQ5rdBRZAWQF9rSgb3V/7jaMR7vWk11rWDi2Ol/kF8Sgc5WsJRkqimfxtjaFnuwjR6H36ZCqQKriwDU1q0ZZNaKNiYvc2EzzT/UURsXuTCvf1DeiNEVT5bfIkPRa15KAfPMzZlqAHi3QteSjHh93opn8G9Io2hH1yagc5ZojCHlbENJBs+s1FykXpFz2k3IxH0HIvhyb4WtGxJi1BzkZ5GTska6VV4j0DNIzx6O0YoxmK4ukDZI2daRNutYgr0zgaLSrFa5/vYryJzaFl4pPQXThhxQCfVN2SDmefrkh1KFd4pt6VIK6RUYSBUkU3KKLaxvrv0PETDcL0ZRv0Ivk+NiGfYJJtac6IntE9seisjmu11uzRqge4XBTOPzqpeyoF0WIxLoxNKxYk844puQeIJ7pCxOXmtoZbFwZ1+YwMurWvmDlFkphu+iInRE745ZdXDc5JfYIQ9tZji5YWi0ixNT7AlCMXgBia8TWx6a6SoyttnKItbeJtbNzXwu6S4vUBiDBon6KwoeLVRjCpR9JOntEXNQBcyvk+ZZQWzmcXhE2KtCOP/SQLMDssRLaImEo6fJWqF7Uq0Z9EKIjRMfNv7i2OFR2+7GD3TA9DcG+XtiYpS8GXV3XvUyjr3VdkA1ANuBINDYjAfTWr3H2fNVKTKtfYfZ6rxQC3QALWD8v5gvo3dMVpMSBYmG7wz3udR1JCQLV1HcH22fj2SC4P4bV3r3lqlsORMuIlg8C1xYs6m6HnBvs5U7osyASDDHvjWeuOikRTCKYPBaVVaPJgjXDUPJWceALk30VCPI1afPiNpJ+fYwW5DIFrwgjfh1e6icL8i1f7lccR68v+UNd2VFU2njRdYuKKBRRKG7JxbXJqu80prWxBA1faqcQAWLYHX7Xl/6URuyK2PXQVTV7PZ3CaiFW3eSL5EjqvVCJewkVOX2lnLwELeDGRz9YfAU/7cNvM8JkjZCjPTytCPMNIapiLH3CVNSbXYaqrRbftLgIWRGy4tZcXNdZ+p2GrbZWoRl01YkC4evuYoKa0xshLELYY1BXMTqdBUMou0Eoew9C96i7BQe1EDuoc2UpOkCTs7soTskcgUl3QCtEuQNwNh/JJsAsaszuQtkGC69fWISxCGNxWy6uzfZ9L0Cs2R60g7BFMSCA3X1EoDyxEb4ifD18ZS2B16LtQui6Fejqc6FLwFUsQwsQ8t4PH0gcrRLVkh3qg6KlSb8hwKyMpE+AeVRru7kaKbBF/bmf+i0ro/BDgg25UwtcMzo0QdFVh9vFWnZo4Y4AqI29NPpGwk6ioGvZoYHVKph3kWO6uutwezAnTwxCz147vOuXZeJ4hnmYm+jFEuktDTIeyHjsJzehdg12u4gXHlB4QOEB1YaCU+92rCInBp0ZFosXt3MzWX8dX7TaC6kpqL0oK7pcd528rS2GSKVUexndovWzgI1Ye5G03Swa5JtqH4v5GdEokqdInh6+soqxqU+dxtX7Mus8zT7YvLSedTWNVYyX+gZusKfZh/pbqOme0h/1lwqxTWcqB171n2zJp/IvNjOhWjnl/9RfTu37lP6wmDBY+Sn9UX+pZOun0mebPrjhn2YfsCpjn9z6PNuRHiMREjBzpU3agn69TKOYXJDZKk6CZ/KZsxTHQbArp/6GNLtmPH2S7Ue42ptkNJj4tF3Q6jmJy3twH/gie8u7H9zyAjRCmK21pE4LkA5FOnQ/6VCTId91UnTXTUgzqsq0EkhY5YQVt317SI9Y+A9IkiBJciwqK0ZosnotCBN2+1T8ixC6Twid0JUCtRZL5WWmeKr2iVsgLJo9v0mAdWyPWank+YYYXT2cPiE6KtCOP3XVVgVqlhjhN8Jv3KCLawvDv9MPYTUwD82wtUEg+DjW7uKP+vMcETMi5iPRWDFAgynDp7M2CH9jkLsS/aoWpAV2gfM/SePVLD0L50ccWK4VwxsCWIux9Ylmj1wjNhc5mpNl+tjba7B70Yomq45oF9HufuJSW+O+24Hn3TAfzQCwreQx0CwGzRZ5H8PMDb0GBNAIoI9RfcVobe1i41A0sx9T9hPD0H3i8Fm2Yp4fzj19ULp2Zfmc/3O2gB3Oux/whbun0oT9M5otkglINSmf9eegONSRZU84shM9033vI7vzdFDaZ6W/j6DRsaH/whaioxhYP3RZNQUUKyQue5HH+bzq4EjOjdXTseypTrmRggC+Ev/bBbknMQE7eCot5ldADKvlMqJP9YEEKAy5lS3G+Jb5+9IdYeTcZtO9pfsgXLxSixsmAaibz7SKerNUw+7gC1gQ+pG2DrhiIHvy0B0oKAv4TLJfYxYqotYzouYu00B6Oyh2AMOXmsj7Yr7/rbRmt9DXnKoqTALaAhQw88NhSl+p4vhSC3EmFDrGaJUCNnkGJOQnMEmAKUIGazUH905+FpCK+1T1MDQshcHjF867C6MpnwLQgfR4ZbV9pr1+ABv2YgVb+Yl8iONIcyoMPwdJQpdUHCF5yxnkA5Hxb27/wxmqm6AA9TVagYmgDTG8xcTM1AIE5lyw+f1paLJeYmIhe74zP46zp48aYKNxB2HcCn2mqkTm+fh9WZ1BSRyq0FRzwSjyq8B6+042ELd2ouCXPAcz9kZZsZP+DLb0UnzrUvzLP8JhoFaAvIVtaEDW2RZUoGx1L2GHFSxTdRLvnKuf3/88ekzTZXL6/fcP0OPqzp1FT99zbfluTp6/f4rC6HuYKHgE3//7Dz/83/Gp48/nuWGjBiAzbtyo+MvlgrII9PB0FX3CcQDK+sLn6i9e/NeEbvvXJNMHegZKjXAyYga2K6U0yiPJ5FxtXLqLPlZWRbWFp86yZvgLoGCH3LuqR9DeOef3rFvGHs2DOTV1yZLMgvtXSoqwA8Thz2GDKXzyX6ELcAwcAkZytcxXlk3qO4DKjGIo3KfqlLoOdObDBI7HGZj/ucM4GTCmoJZOxMfEfN5BhycKMw2dZh+Kl0hKVlIwg25tW682plO1+lTzBKPFOmQukYEhr7hLEnHKZrCWPkCBRcFr3m1azfMyuVF415ESL/h8MKCcBmIyEpim6gsqESZ8lJ5ktWH55E5aUHle867NXSjHIDXsnq8/q4bTdgxWXTD3OV0tAU4ozcmksngVOjCPJODO6X3nNFfeLltos3rcw3Cse5NgZRqkC9KyShANCbW81Z//SkAVn9vc3+umrN145oAe7saac2zru7TdKHZg9+7NoYgWhJNmGSlwmxFQtxOH8lsnd+A/nzBQkNDQvnTP7RIc6+zyjIZIJs4qXBAKpckwJmu2gW7+OJKJ20UULSlJJvIGKD1LQcEryyAAy5VSizIDbPLgxxSZlLumJBtDCQU665102ZdsJKzJEzEWSjEsTkodr+cqU8vZrJ1bl+Mb1pViczfcwpkOqmyZ15VxHfQfpR4MdMHgOhOsosIKoy7xX7IgWCSqroOmoeqyUZuoTb2ClpNWWxcjKzdeHw4s31Ebt66Ov68wtv3g7UZcO0yNgdaHypl1rq1sx5J76i7KLa76yppgrsXSNwnY9r+mu6ub2kWvTqnYuVFVazZrFoOVd7hVoJVp3JT9VAdFqbJN6Q/1n3M1m+afJoY8ArJobl9tzFfZdDUyqrup9V01foe0vZGm6y2UmNFIsRfq1lubk1Kee5vjXr+G44lzch4++wuaoBk/rJ5ImDKA6jrv4SsaoVnCrE7/EZ44/yjceeI43zlnzjAbz5BzyyJHjNL00IozFDVZYBRuwekY/knT5FDMRLRHXT9dg/K0hn86MSrn3uy31vpqs/0GPRtoo3E2GOZaozwu+Lsaf6dsYUGBmaPNoVjR3T4LXyeUp6H+tGp/alKJxmXntuAdSwmRp4pQ1vuIhsyCcLZYzYkcEaZHDNsqt/TWW5ZcQ7Vd0QYgpxfWzB0szDcWsllGScCxw3rLzsl8xdgfVzE3Lhfn32Dm8vAn44H2OtNpPhlYJy6NjdhgLfOO0Xo5wU3tRQhiLceQfCnzAbgcmHoMmI7GyiaouXf0yWBZDyVcrOmIIm9NP3lfcotrkK+8p/rt2C0z/YXUvmyxazMqG61ZzhiehwHN8g/+SSxXLZtrvs/Txeuo/RwkAJ7V022B6v8SL2efxe0KaC8HNg2tS0lUJaOmzKwuCko3NH5CsV+KGdV1dILCoOV3u3KJeL1hk2VazMLOGzB1Ui7gbuqoKOJSZ/IfS5It2uhq67ZnioIPgeUcCRnTisIu/fG/R2ObTOQKs7I2Cw8kpCaDrAeV5her1Z//lSqAxw7abAdlneR/0SWTisQHfreWIuIX/QTXjIaFKnvCX/jMnzwaalJbeShkOuQbeai+SC6kXCYtzJs7z7STXZhqVnLh1CtmJ5R1bFA1hPTu1V3uZeU9uh5PM5St4ricNjKquFz5/cW5lfwvzhBTB+wX+mxWVQcyu8nHZrSUxrO78QKIZeXVymVboL7UKO1JzfkzriSMdM9Z7pivrMpV5gk1NBGZfWgRoKcRwsLZx/KR4QT1E6vsXOcPE+cxejmtARR/jV6USaTyNb98uPC+/nzxt4+ffv5aTHjO06zPpZF2TU1Qzxym842s31jDLO2XL+fvd2mWtTNRp3XbL6oqPCZLRePH5MKqNiQLr1n4DmRqSAWvE1o5SVN5eclUykbJIu1ZulxhLKnMp+xn1eSASKfwf/UPIK0p/D+pMUlKRSg47b0owrgiTmit6DCzFutGtQYn2xrWoLIURZFSOdfv1vOrDxdnV+c//2S3AALpwWCajrB+OGefvp79/VKbzEiPQzYkcKDyz6P7OPonHIFX8YrwQ47nO+u2zkC1EU7tCaNWVQgUTsT+Prb89jmWXR6f7pj1stFKGd1yHbqUyUAF3Uwq49sU5+iS69Mx36drzs+m9kLDhEHcABvOHjxAE44bUbMR3zlf/p8TPC1jOIFoVOXUmT2S2TceiAxJwB7HUUVfXvzE8Wf0YaUwBdG/llp9gJnRBLyHi19+zN+uyYKsTbjeEL7M9FDwvhIZL/9lqk5I6NiZRDLbdKYl4HpLrusn/88Yoeo7t657fl2LcjA1SXWWiXWemjnUxjHYs9Klh3Ob1H451QbH+HOqVyBm/pDq/cmH35bUfoQPzn20itNH5Sblj47X5hFMnAcY9PBfQutVkhi7nmDWfx+eKHLl7PPlrHPm7PPm9OGHfL3qivuol65Vskm7VQR/Jp7vwCLa1GQZWGyo1slvVglwFklw1olwNiHgfhLiOifF7Y4677oqW6lxvf0oRlYNeWxmwXdOYGu+CAkBT0m7CsKxkxcD3M0hTeiyXZW6OTVdodqNcCDZtg3ytgbtM7HyzKapPjvIXEmqEEBuF2OtLe4kF3MyvEzYLtGg+4S3Np2BNimoeIxUZ5JnAGlzB3e/wlU5cjx4Z/jPyQq+gKLTukhzf0lLojqmewaAamnRmbtXdpP7ayKVgnmCDUfNIK8uwWq1zmb0gS1RKZXJglpxev13z9CX70KDF2RBnn1uPbPGaPmsOJb+wMWauIMBD3RkLwET19PBnNEJgK3OFppWDFmQNAqzvJN4fFr7YK1HdcW7B/M4oycMrcOjiWzdr0C51hxDVgPvI/t6fRnv5ZRm+lRCXC+PAfjzNIZT3HVzFoRfknBOz5uputge/a6qxdd8WDcTRXbtE4lW6fT/TKgC8UMsMeRXvnN+ZHwFGMcXMnzmFVPmDitIBGu4iB5oKS0/DrljwsuqBHGpDVZU69FP4EAkoZPLlGk8z1rlZV7iVUgbcst2eUHCERXH2JlOnf9VNU4wjAdYazEOtX26P/mRjoLVJGZbafgv/uH3oXJor3lRGFr160TZ5smfv1w5Xz84ZxcfnMur80+fnK9n51fnP/2FF9RLQdnpdkiJ6/w9WrGqTdkGX8LRSb0LTcNZwSs3H9Et2wDZYqzHxga/HjdYHJphr2l2zvJ+55EDgiZ0V/rxK7M+1DNh+kUHnkRUMvmK0jI8IXmm1c5ms1Xsngzqc0Uz61as4ULzjWVL+lP0Ai3DqJmVSFeU6HJumaLfsilyPc5ymWnmMpuB1MSj/0zNCUwI7HwcwDDnDvltRpbr2jQPJE24iszVT5T+9PPVh1Ne8OaFqSHz+6DRdUNC5EJ12AXQzzMpmuNo9fCYLw1bGH9BC8W9ahT/Cex7Ah+kRp6imB4fxI/z7VTqNRMGHe3jq3giFzyVwiOu6YytH92jyQsMJnrhv76u57SWBbcsXNaDPNrteUEIVtAb0QJzkr1i9ea8X5N1fbB1cbqp+Ou6yqJ03WjslCMPfprG30FnQUjmN+uu/RVMOA7+CfewzikXa83w0Zu9dQuJe5Z/vqmE7cvDLfWsmafVRKTjhOrAqCDAyaBUiO+0QYBkffOvSRRmXpN8ulCBwW/r6Ypr1jlM9E6XhkSTkdyI5OiwrAq4QfyF1YAbsi+H8lWcQRo+Ri+0SHl2tZwetG7jml12IyfWsr+rMquyTJdEpEYoH4viY1Q95yTWV7T7EEXgBXisJv3d6p7Nnp7vT37qinqeV9F/JXICS3FzJKslVWCX+ex5yr/LFlYs01jnMYqx0pmCgK5rOPP1vOV8skmjuxR5LTeV6mPdRKN7MqIoqELKkkglUnAAFkogC0NJTip6XqclKbrWLd64sntZSu5Gti9P9i1HGaifwurDshDVpPTXMyr4vHzsTQNboAgIZ+nGTGanOpUQVXEzdSixJew9C4qYRezP6HiTpa/YVRz7MuR/f/KvzNkppZn/PhqW/hSAtzY+UZTeg054aydiShSJSXjgRFUXkL7nAW5iJ+Nd9EwLDsK5STKowhEZ5QAoBXQ5i4OlolDikl3r8SqGwYwlY1U7AwxDFlO9lK7gX/KJXuT++OXy6ufPHy5KCLTq9bIFj0myWojE/hwkiFVV+oCNtz1relyHsltrwga0QakRzncOC6A5P0bL13rt6FFD7LWkF03RaAu3/AVl0bgC8lWaKAa3sVSSlALUBxoslO0XP07I+2CWmouiy4O65k8ID2/Mtc+5Ayc/u+KNDOXSdY/BmQJnQz4s5vnIIzRIH+RenIto4sYY86OcML+QYWCw55ou2NHOrxzsqPe3RffP6LyVzvXSia54JFWUAN8zP0/lqTXz0jp6aE29s2xl8rrbmeDZNpiC7ucP7giWz8nsavbWqtOaEpUtfDj5fb+lgvqnTuExtgc+KG9590P2SNtEWhTGgRtuKURY5GpgdTfwBCSJWNwtx0w6b8V67LVTttteMBcw539IzJ+bdm5hQk/LiL6/gGKM20N0iu9eYZ+w4K70vNZd6j3/0V8sH/0/eiGo4a8J2zhFcaj9j29BOJ/WtKM6F0q2pa4JYVj0PpDVU69rnZJqsqvraZue+9Uoor4BzkQXHsScrgnsyt8MDUXRt2A9AP6rIf9kufSyKvD5TfKXhltX6ePU7HKyfIP1ey5ceou2pk7lwJPvctOIO78eU09DlQaDf5qdtHRtmw1cutN+/PShdEUDrYaerhPCvZju8sZTULTQbiqKhhpPSfM12y68fD0NNnKjexVdpjENSmluEv7AVPxrd+NYdVkRqOSxBk1s8pqK7mZtI4t/LbfGrarALaWYp4aRL3XHyCplgmwav57uC5WQ5ifGsVAGipXPozxraYxqAiJmiK6MsZgOCQ1Aq+i+/pK1mzCxrH4jhwpfSB62vM30PHmkOVC3cqySxntZYFvT2CyKYzJLF6/r0CsLQgox03iviB+zUCMPwmvaokXN8nm7Ji5BtaKm13CWtUCXisAFMFI0X8ovYgHI8t0/ZmNnqXZVXVzPLSGpaH5Ex6sgaKRl+gz6vpburWJwt84dmfk8LB8kirb4O7u4j3dL4+S30hnC398FHf149hPtFWZHZisFAfTOeYI+A1hNJwnoRz8k0SpZvLqqgEjNGqm3qiA72JYyJbBYbHH9xhkWM6iGE1vWjEWvFYqgqnL22f9GGQNaaTrTahYIv5WyIYRURKYlyEx6adu6JSmCT19OE0cvIauqx8P5QqHhT3RSqzhk4XVFM4XsA+cbTQDzY/YKZ2giWsUzQptYgECYUQhSXe21p+Dhkb7CjurbimVHxauQpdNE9+DjP0XxK0vFiOKETHhHFDcrWrqPoyeYXsCyUTMV5sk0dPH5kwuxOHVcw37inxQ+qWLFlKmBiqb25TwXCsA4aMpkc1/quMIBTXDyBbvDXYvKzqrY2ojgXozJ/aufsJzikaD6NTNorVYbUq2SevFAi5129axhzbSsN00zaFuTuBHDBTWcqpUWFlXd1QdnzI5fQ31dJSzCMjQ+VzCqexWy9u/i7D27i2I4cPSX0SPC4+MxS8g2TNdIzkIIk9p7ir3Hy5kYM1vsSz78mtccj7tH9YR3XFnPWPDqw7061diQLSyP9mRgoSPLkIO8E4X8siFIxeuqrwI9+RIS9kANmWdnEfNqRHSgkonD9kWXIM4Fe2nvNoI47JYGMRxxfTmE0xebbcNi8zcaTwZ9stcZa82mN7R4gaierG5NUncmpy1J6RZktIGEbkw+tyCdFUa1nmRuSy43I5UVQ7MnkbuSx+1I47G2qFtjcrgRKVxDBvdHBG+KBK4QwJvhHBtxjVqO0cAt6jjF8hM1PXCIfXCHRs6wBVfYF0fYnB+05QYz0a/CRfCNMJkZmL0JFf/7n+k9pVY8unAee3DPnllkPGKpIX7kZhTijD1xwujDNVnIL0lKN5YoRICNoC13hD2Y7MPpSZvjj1S9iEfnaMGYcg2ZKJo79zCVOz+rSENJMVpRpvpA1ISNknJt5WaYPsAd8VNOPGXz5m+bFlNYqzL8XfGAWFkF29CgbShQa/ozpz513kz5wdMCf6ZiO/thOntgOXthOPthNzsxmzWsZmlFKmxmHZO5EcJMS5SNK8+nNyUbTESDiWTgGm7iF+y4hX54haacQkc+wfp1GINBF/6gDmIXEGHfCJs1XgXYl7DoWY2F/UiWlEfcAG4Xb9ujxEl54Jg+iemTmD7ZLH1S3j+YRIlJlJhEiUmUmESJSZSYRIlJlJhEiUmUW06itHBHMZUSUykxlRJTKTGVElMpMZWy91RK+QTGhEpMqHyjhEpVQKLvoE8hdlCJ/UgvbeorDFR9DxTGgnqMBWlWDMNCGBY6hLCQRBBsJzak2U8YJsIwEYaJMEyEYSIME2GYCMNEGCbCMNGWw0TNPFOMGGHECCNGGDHCiBFGjDBi1HvESHMYY/AIg0cHHDzSBRsUcaTXq+jH7IVaFfJ1B4p2cNV2s43lkqdl+sru+UA/STGjmisPr06HcvGwbkcDQhvrdrQnpLFuB9btwLodWLcD63Zg3Y5N1O2w9W6wjgfW8TiMOh5Kjce6HsZv+6nrUQMd+4fnioWuA+cffuMAB0H6HoP00iIiWEewjmAdwTqCdQTrCNYRrB8IWK/3chC0I2g/RNBe0nwE74cO3ksLrgDx4K1+isIHaDuEIXwk6exxP96KoRp59UnN4wP0CrEgjkccjzgecTzieMTxiOMRx+8vjrdzbhC+I3w/EPiuUHhE7QeI2hXrXAvW+ZsxdurdGhuItO9y0STVemDJJCyZhG/SaFgtSbWRsFZSW3bLguVqzXZ1YL0MFJM9C9aVDWvHilkMHWslYa0krJWEtZKcTvRnLQ1qQYfW0aJmRIW1krBWEtZKUvKNRr8UKyVhpaR9ON6xUhJWSsJKST1qmkHbcpFjpaTOlZJURzHWSbJaRMulxTpJuxYHEhGFSiDoLyT9+hgtCFUNsh/pmoUhN3ijhujq8BI1CwLBDE3M0MQMTczQxAxNzNDEDE3M0NzbDM06rwZTMzE18zBSMwuajjmZW8jJbMKO9QHGCytcBeEf/WDxFQzOh8yyYM2j/UDelYVD9I3oG9E3om9E34i+EX0j+t5b9G3j2SACRwR+GAi8ou2IwreAwrccEa8ssh6Ii+VHGL5fMFwsG4JwBOEIwhGEIwhHEI4gHEH43oNwvV+DEBwh+GFBcKHrCMAPF4CLtc3g93/OFjB+juVKePyrcN3XazRbJA0LE4kmKki8BbDWovask+w1x28DsTOgsxmQnc0R0TWi66NF17sJmN85n4Lwm7NacgCg8OTYw1XUMxOyyJFfkEqtZL4OvToIhbvjPAcAXvLlhktG41u4BCxajg2lNkBXl/4DfXLztgilAKVw9x98vIdH5oW5vyZu2Zi7azcapp5/3jw7kKF12usicb01fPfcB5JKG0+ctvkNMlBtTjbwRroRDlkbSDog6fBWpENZ/PkhZKQdsov2mnjgQt4i8cAM1OZ4B4Orh4QDEg6HQThkSo5MQ89MQ5N8+zJw7ptyyNqvhvrf++EDgd3PJ5DsVO1j7S2lQXd4SdEO10IuTRKrIGMVZKyC3KwKcmkLYf3jttSeBcXXmurrQPkZ+DV7CrArFdiOErQYOtY/xvrHWP8Y6x87nTKraslOC9Kzjvw0gymsf4z1j7H+MacU7TxSrHyMlY/34WDHysdY+RgrH/eoaQZty0WOlY+7Vj4uHcJY89hq+SwXFWsev3mCaTlyUAn6XKYANi/A5Y6T4Jl8JkniP5D9CP0oh96g+rHm/nK+6g7HhZQzwOgQRocwOtQsOqTcSBgjwhgRxogwRoQxIowRYYwIY0QYI8IY0ZZjRE38UowUYaQII0UYKcJIEUaKMFLUe6RIeRRjvAjjRZuNF7WLXvQdRlIHGirBJFrhs89Y0vbeoKkaeYNQkvr2t6x8ssnioqrZYg2UBuQ31kBpT15jhVGsMIoVRrHYB1YYxQqjm6j0YencYNUPrPpxGFU/VAqPFUCM3274lZsmNNk3slf1VQX2AAnBvVvN0rNw3nvG6NX6XN4G1K+dSwPcb9HWHqWT1s4GU0sxtfQQUkslJLCd/NLanYW5pphrirmmmGuKuaaYa4q5pphrirmmmGu65VzTtj4q5p1i3inmnWLeKeadYt4p5p32nndaeyxjDirmoL5RDqp1+KPvqFV9pAKWaTB4Z/jPuciAKfO6HJ8GQWgmg+mmwTvnSwJjuXvN3tbkfCX+t3VTAYV3TySEdQJHlDl9/gw8xsyoAwCcM5YfWqL4+Ltn6NJ3YTBgkkU2x2wRQAOJOxiw1wBmJqLQkRS2GeXvKJEvgBUtxfAYOK7iejh44jiYkxtNBO8PUjAPGvDvFhWm6Efx/fW1xoI88UVxxeLcTEoNnFEvlrZws+7M52bN44OlP68LW8yFLeaKi1xhA28qcUDF7bWDy9tghi8PKILCSSFB+O203Bl4V3K3sm9c4cSsba08iEnWfvmVEmKjZ0A+W6hR5fIiVq/tne1C0CFnSX/zSBXKZ8vE/iS5l9U1unxNUvIkVqpqDxV+qcsa5QfAl/BbCIBOdQKIBaQmVBrm7//hnOiOg5MrkbO1SlYgqlcO0ti29mGvkCV8FYLc4KtMNlkvE+flMZg9ZuA9WS2XbEL03ryo0z9CbdfOySUhDJAugqcgTRyadHXqPKbpMjn9/vu8iTl5pr88gDtOPcTvHlawRxP+9+/4rd+f1GYlcfstREtX152vnpYKN+Bf6qQofgIPT20URuyfq+h9MDOExAoKQ+MowjOxzb34XZN+KTT7zz5obU4EgObmrMBpOcMmSAI4RSiMHeUXTQp2R5VmYy1SvVg3Jdq1GGAmtaLVu0W/D8zX1aVWdVa73NnqUzpZoy31rHyaJgDV5qsF6XSi8viwdLbY5swUqqw5/90svcZ8fen1wMqL4XsWjnU/iA/VxB0hnvIsqG/nvQcv9go+0Fcf03//fxRKYBVE97SMUvBiXutiUtKQpLvc8/Xn3XUJunoAA7Upy4Ip1tpTMnKpn3zLHYkHktK4T3VTCZ/zUkR5ruAmjQnMUimMQR6Oa2Jynwf9vfyric3zI3wjlZJNRrnQMm2cZh/6Piip1M7nvdor2qRLf4Bqd7FZnGw6m88zKVDCKQj5YOghmUbMHwERAgZKfVe2TuwblSWi2py4fwGY/llcBUpTnMyoetcjzxZ3r84u/+Zd/vjXD++/fPqwXh43SCI+rtFYfghG8qO5PCoKCn4YiUdj10uZJgotGk+EYoxHqkdwiuoiGZCp9Ll4USaSafZBOUo7daqqUgc1EoIp6sTvA/35xRP3m59erY+swsOcNUfQrp9uGzxK8j9F7KxLjKeMuGaNu5iuLSJ/nozkRuTTotfTtZIAAofRULp4CJYmG+WpbruVYWNxxYTwXemGqtH0F4GfTEVH14UR3LB3VQ/ZFUPF0fGNvBpvhL+rbnuMXjQpT2bpnX36evb3S+WNIDvzDF7812Q4cT76i4SM9U83mgfwy4cL7/zqw8XZ1fnPP7UZB1jac9gX7PAYGoahTD4oP0g5KBkW79EP5wuyVon7VThLo2iRuADu08AvpX1WDgBh1yonQLHfQmajmCyb3Qn/yxX9w8m44QkxLp8AcgR/VklZzWiaaWHqEyW/Qm3MtM4dyybr/JszFETL0PTcqmzGpvIvxctkSzUteKOG84XnV2zxfMGTAE8CPAkO4SSgmpNBAr3avDyScK0v5d1GeQaAkE9LntWQ/VbiwmgbLDb1X7BFRHwqn3A+hJvrIb1weKN8k7Ns43NSSFc7Q4VTrVByjmAt6RQe9a2KY0RnolBiK/TT4MywPDc24wOIs6fGB7CacmNHAX2AtQ8g5VWiI4COADoC6AigI4COwBYdAWHa0RV4czogW4nt+QHIIqPLgC7DkbkMIn9X6Tasr+rqMjR2FwaNfQWDn2D0ETbpH1gdk72eIoN3zqu/vD91SEiPxsH/ABVsOLP7CBoA");
}
importPys();
