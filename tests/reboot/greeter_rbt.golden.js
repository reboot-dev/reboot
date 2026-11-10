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
