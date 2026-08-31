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
    reboot_native.importPy("tests.reboot.greeter_pb2_grpc", "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");
    reboot_native.importPy("tests.reboot.greeter_rbt", "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");
}
importPys();
