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
    reboot_native.importPy("tests.reboot.greeter_pb2", "H4sIAAAAAAAC/81ba3fbxhH9rl+BMG0lOTGFJx/qcY8ZEpJVS6QCQmbSMAfFYykxBgEWWDpUf333ARCLJQABMunTDxYl7sydO7OzszPA8ffC2zdvBTf0lsHjpbCBi7c9/M3J98I1CEBkQ+AJzrMAn4CwjkIYuqEvOJvFAkRIabVe+iBqC8JoIownpqCPbszvkGocbiIXXAoQxDC+iIAThvDiMQIAImkCg4Tu8SeCEu6f4VMYCJ9AFC/D4FLQ2nKnLZ20Wq2Mwr5tD7SRxMkiClfCYxg++oAiY8Tlah1GUPBA7EbLNQwjwY4FK/uzppa1DpHFvCr5rlI/fl45oW95NrQdOwZEn/uuUL+9DFB4AttPgZzN0vcA5Z78jsL2/j2NhbUMYhBBFDFECameUa34/OQEm7M8R3i3Z7g9Agt748MzJEVJRA5sf5Fsf/1kS6nhcI1hY2vtyNg4ErG8EFqpGPkjlcFC5UjQjj9X41CJDKUkqGC1hs8pEJUh6qkc+YMK7WHZ62UKYwdBCO2cdwwYEqSfjBRBOzkZ6dOhcXNvTgwcVS4dsqi2B543BdHS9pf/Bd4VOh1nzuk8mG8lu/wsoFV5vhVdItGmElgD/0Mxu0jjdZHEfKeFJXo5CRLN3LpD/btIA3VBgpQTcRMR5P4F43oi05pvbRXRk7AbYveaMqecJZV8qcEl9AEmg+UE/ONsDg12RSb/sLAa2KtUVmZl0wUs6iJRaHt/ABcuv6TSSiadW5M/kghLEXA3qIR8AdYKxLH9mOqpid5WdOZbBcODNhvrtpEq3lE9xEYSI+7LS4w03/aQvqMlyOK8NUO2o2EE0P4a4D8bBPv/E5oW9oMgIzlVSUjGa7S5ZNHWdvvqkn3Ne7BPSiohpVJneyuArKNSw/qg7AJ/lo86a7F9l2jqAYyeDQ7L/jsOck4koUi9Uz6D5yKGyffMbnyx/U1hhOkK3mMkrRCkeescm01oJlGjaD16FvJpljO9W0NhXoA0zJIyBXCQ7k8+2oX7KpWl/HxOc36+7UiRs4SRHT1zaS/n0/4iH/0CIu0x+gE89hCw8Hc7dBwi6o8WgS/oErLsBaoJlmTFwA0Dj0tKtJkYTKayAywqTVNBm4QbxTlnnBghhVNc5FxkNzAXcMCKfSJSLZ1wVPOuZhv5lu4irpnW0uNAs2KhttmbrW0i8RsPm+xA8uu8ReuPYyIPbsPg0dgEAeqmrgB0n5g9/pFIybEPwNqCyxVIohVzliMSeSJmIqlpIoQPc4c6dA3g7Cn0wRQyVad1RhbFWRh9Xvjhn1zKFhwAaf8AzFt/29ULLYrCaLaET58SnSYw/6Zk+Mra/PzQbEtLEdjC4uyuVdQTgNYvhJw7Rfc32BNjD6VSSbSRabYgSAtCwCshkBVoyaOZZQDbKyOaelMsw+bAUbx5Pw/OhsgGjDYuHATey0FNcwgdWHSfdrQ1fNqjohm8ROuHeXBew1AWPIekCQlOh1xRqEAEjyAKN/HVEvhenGdlF15hHCV2mUnkaIeUT02iw6wydqJsa/K1ktqJ8qc3yf8Y+Iu9poYopEsMKeSvEqKRYndkNI5XTkD+jvYB6EsZx5yUU1TTYfgZBAlAJw/gcLJmIiqnlUrs7JpZrN7Nq2eLjIebza4S9zgPkyU2HHDjEGHIB4MuoI3Acs7SQ01vCEHg0jYhYCsNt4rh+3SLYlxes5vBydUnsoiLPz4wlA6u1nn3V0s3CuO9VFIMZpFWXElE+bz+085fGayr4XoPp2fsllrvaD/AoGQJdJa2oujUsiAKe+rl/KnHzhiZVusfFP8OYw9DP4wYmue7A63glT2eIDGh5E1QmJxm655ekqyZzI9Lejet8CK6YC33FdaiVJv8/eavKXU1pS6To0HaSkMf0SYINfp4AVLha0PXx8mClGjQM4dqjCrfPujJIr25tn2NHCzCPRmfUC/7FJKbX76jqbJr0JN9dzj23IRB5rZikawCIlb5eUVN2MrJJ3HrQ+IVZpbWqPJOPR0rCyUY0x3ONM1jYvB3WmnYtowUoBcbVGK7VSVWSYDx+Q+SZl0zsoPYdvG4e2Q2RTthJ6zslNWE9tRm9GyGu6tumJVoXFja/FMjHc/zya6Urb6wITPajuTt6lv6NOob2Mf3B+1si1poUmG44lTZaX8Fk3QH8vizaJk98jhkBJiMNMisyTb2ZJXLr8LOn1rWCk4kIv2Cwx/TMVLt4F1Y+rjh17cuII+ajrnpv6bTHWt54IQRmgK/1q7E2U1uUfGydLT5F73y0+GpFgGuT94bvIqJtKqJzHZh2W9Y8fpf8kZHdklL+1XJuKXHoLDFxutvuKpX3fPbP9QSr1u7N7RUFM07BaWianRC1N7Uka53raGLPnnQ892Lc0oykHX4FqX2HIUfm3Qbaze7kHDv4to7J0mT5IfuZ0z+nnbW+KtNFIEAss1v5akp6DPJSdEoIU+ZbwEi01coGZFONdGFS+2QJyfJU0cl7XlR57MaHoYHcXzX2WE34a6nTnDBXjrzjTvGX5RKMbsgnqWWfqHnnvryDSymPiq72xfPfrQLJt03vfB+RitB1o0nfDhLRUOBLZTLsHToDCl2yB4pp/jt1aMfOrYfC++E5Lez85P0BVj7J/yZJDRKdD3YrEa7tzHxWfae5kchBeK1zXDNqCCQBC6vfZqjn7ywwW+DTlnk5UIIQsi+EWpbD1PdGloZ1vTyRBCyP9uWH9oe8NJXaMjPcRgAJJPC/nZq4RnD1I3T35tKx7u3T4yGczqX0WGS0aguoo0XRfG0AMDQf37Qp6Z1p5uD0cAc6GPT+LUJg1KAElI9xEQ6LXQFQXyYjKZIeUVHJct5tvALh99O6ZzTLDK14OqFTp2Lsow+5eRTbOwAac0Oxn+HVo8+ruWvIc1ONgfjzoPWdeG1kS+Z9w7mTwV+7eRSkuRSXutiwfB4QAdL0I+bfJWT6ZGcK7ByZCcLhtrD+VYC/k1donP0sXzK0I9dRnJT+OEKOY963L25srlh/2COFCJ/G2eS5wcHd4XBreWInDhyOReljp4b8hv7lj5XOJhTLGBdb1qH8oZ7YHEwpwpwj10GCofsw/VGZejHdqvoGcjBvCoDP255ePHRyOGmiTqWDtMLDm8nw4+FHLInITX9qgtVRVyRlbmiqnMZfRLSUpekYP7JDe/D5HbCj60xtCP4TkaYL8uCwEOSSr/OOExxJa1XRxgDKzLPwNAHSJROuYXoiqzWV8E2VEkqVpjeT8ZTvdCIKikNdIgVuV8+rhfbUOTaGtiC1u++8oEAtacpvVfqV1mvCKLW79dXwTY6qphXmGJS/9SH5s2nypzoqEpTRWyvx/tUoGaN0Q99dKdPp4PrYj97qvR1MDW4VIS5x4e5hia22O9w+WAiireT8bXxMB7fjK+vdHP4oSrq/a74WgBsXxJVjcsP3Zx9mNwi8RdqAFLtNlalNjtcsGYT4+PV7WRWGWJJ7EqN1IgtiS88umFMjNmN+eHT4PahxJLEV55KJWpH4+wY+vDBmKLdr8papKY0UiO2ZJVPNnNi6Lxm5d7JPN0GEISDotTjULWhiiq9HoOy6Mp8+AajRoFQuuprEQgDVVTq6FeFQRW1V0NQDn3+okSSpvEwNAfjUfPcUPvaQeAIN03rNwarCpbWkQ6DR9h1RG73R4Mx0pg8TK9u9NvRtDJOHbH7CmVity9xUTFv7koc7svSi6IUs+BI388GL9wfSE1ppEZt9cttVe1ev6800yONr6hxu3SHNUifXOUa0us00yPWJKlXrlXhnCzJYkNF2taL4gvTV9HUoMoNlEiX3+VblHQaKmjve3tDSYEs7euVovGFeF4ymSAVtbYK7eoVqeo/BK5Cb+MDK3bDNTg/+R9b5yTY6TkAAA==");
    reboot_native.importPy("tests.reboot.greeter_pb2_grpc", "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");
    reboot_native.importPy("tests.reboot.greeter_rbt", "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");
}
importPys();
