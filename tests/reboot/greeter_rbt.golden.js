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
    reboot_native.importPy("tests.reboot.greeter_pb2", "H4sIAAAAAAAC/81ba3fbxhH9rl+BMG0lOTGFJx/qcY8ZEpJVS6QCQmbSMAfFYykxBgEWWDpUf333ARCLJQABMunTDxYl7sydO7OzszPA8ffC2zdvBTf0lsHjpbCBi7c9/M3J98I1CEBkQ+AJzrMAn4CwjkIYuqEvOJvFAkRIabVe+iBqC8JoIownpqCPbszvkGocbiIXXAoQxDC+iIAThvDiMQIAImkCg4Tu8SeCEu6f4VMYCJ9AFC/D4FLQ2nKnLZ20Wq2Mwr5tD7SRxMkiClfCYxg++oAiY8Tlah1GUPBA7EbLNQwjwY4FK/uzppa1DpHFvCr5rlI/fl45oW95NrQdOwZEn/uuUL+9DFB4AttPgZzN0vcA5Z78jsL2/j2NhbUMYhBBFDFECameUa34/OQEm7M8R3i3Z7g9Agt748MzJEVJRA5sf5Fsf/1kS6nhcI1hY2vtyNg4ErG8EFqpGPkjlcFC5UjQjj9X41CJDKUkqGC1hs8pEJUh6qkc+YMK7WHZ62UKYwdBCO2cdwwYEqSfjBRBOzkZ6dOhcXNvTgwcVS4dsqi2B543BdHS9pf/Bd4VOh1nzuk8mG8lu/wsoFV5vhVdItGmElgD/0Mxu0jjdZHEfKeFJXo5CRLN3LpD/btIA3VBgpQTcRMR5P4F43oi05pvbRXRk7AbYveaMqecJZV8qcEl9AEmg+UE/ONsDg12RSb/sLAa2KtUVmZl0wUs6iJRaHt/ABcuv6TSSiadW5M/kghLEXA3qIR8AdYKxLH9mOqpid5WdOZbBcODNhvrtpEq3lE9xEYSI+7LS4w03/aQvqMlyOK8NUO2o2EE0P4a4D8bBPv/E5oW9oMgIzlVSUjGa7S5ZNHWdvvqkn3Ne7BPSiohpVJneyuArKNSw/qg7AJ/lo86a7F9l2jqAYyeDQ7L/jsOck4koUi9Uz6D5yKGyffMbnyx/U1hhOkK3mMkrRCkeescm01oJlGjaD16FvJpljO9W0NhXoA0zJIyBXCQ7k8+2oX7KpWl/HxOc36+7UiRs4SRHT1zaS/n0/4iH/0CIu0x+gE89hCw8Hc7dBwi6o8WgS/oErLsBaoJlmTFwA0Dj0tKtJkYTKayAywqTVNBm4QbxTlnnBghhVNc5FxkNzAXcMCKfSJSLZ1wVPOuZhv5lu4irpnW0uNAs2KhttmbrW0i8RsPm+xA8uu8ReuPYyIPbsPg0dgEAeqmrgB0n5g9/pFIybEPwNqCyxVIohVzliMSeSJmIqlpIoQPc4c6dA3g7Cn0wRQyVad1RhbFWRh9Xvjhn1zKFhwAaf8AzFt/29ULLYrCaLaET58SnSYw/6Zk+Mra/PzQbEtLEdjC4uyuVdQTgNYvhJw7Rfc32BNjD6VSSbSRabYgSAtCwCshkBVoyaOZZQDbKyOaelMsw+bAUbx5Pw/OhsgGjDYuHATey0FNcwgdWHSfdrQ1fNqjohm8ROuHeXBew1AWPIekCQlOh1xRqEAEjyAKN/HVEvhenGdlF15hHCV2mUnkaIeUT02iw6wydqJsa/K1ktqJ8qc3yf8Y+Iu9poYopEsMKeSvEqKRYndkNI5XTkD+jvYB6EsZx5yUU1TTYfgZBAlAJw/gcLJmIiqnlUrs7JpZrN7Nq2eLjIebza4S9zgPkyU2HHDjEGHIB4MuoI3Acs7SQ01vCEHg0jYhYCsNt4rh+3SLYlxes5vBydUnsoiLPz4wlA6u1nn3V0s3CuO9VFIMZpFWXElE+bz+085fGayr4XoPp2fsllrvaD/AoGQJdJa2oujUsiAKe+rl/KnHzhiZVusfFP8OYw9DP4wYmue7A63glT2eIDGh5E1QmJxm655ekqyZzI9Lejet8CK6YC33FdaiVJv8/eavKXU1pS6To0HaSkMf0SYINfp4AVLha0PXx8mClGjQM4dqjCrfPujJIr25tn2NHCzCPRmfUC/7FJKbX76jqbJr0JN9dzj23IRB5rZikawCIlb5eUVN2MrJJ3HrQ+IVZpbWqPJOPR0rCyUY0x3ONM1jYvB3WmnYtowUoBcbVGK7VSVWSYDx+Q+SZl0zsoPYdvG4e2Q2RTthJ6zslNWE9tRm9GyGu6tumJVoXFja/FMjHc/zya6Urb6wITPajuTt6lv6NOob2Mf3B+1si1poUmG44lTZaX8Fk3QH8vizaJk98jhkBJiMNMisyTb2ZJXLr8LOn1rWCk4kIv2Cwx/TMVLt4F1Y+rjh17cuII+ajrnpv6bTHWt54IQRmgK/1q7E2U1uUfGydLT5F73y0+GpFgGuT94bvIqJtKqJzHZh2W9Y8fpf8kZHdklL+1XJuKXHoLDFxutvuKpX3fPbP9QSr1u7N7RUFM07BaWianRC1N7Uka53raGLPnnQ892Lc0oykHX4FqX2HIUfm3Qbaze7kHDv4to7J0mT5IfuZ0z+nnbW+KtNFIEAss1v5akp6DPJSdEoIU+ZbwEi01coGZFONdGFS+2QJyfJU0cl7XlR57MaHoYHcXzX2WE34a6nTnDBXjrzjTvGX5RKMbsgnqWWfqHnnvryDSymPiq72xfPfrQLJt03vfB+RitB1o0nfDhLRUOBLZTLsHToDCl2yB4pp/jt1aMfOrYfC++E5Lez85P0BVj7J/yZJDRKdD3YrEa7tzHxWfae5kchBeK1zXDNqCCQBC6vfZqjn7ywwW+DTlnk5UIIQsi+EWpbD1PdGloZ1vTyRBCyP9uWH9oe8NJXaMjPcRgAJJPC/nZq4RnD1I3T35tKx7u3T4yGczqX0WGS0aguoo0XRfG0AMDQf37Qp6Z1p5uD0cAc6GPT+LUJg1KAElI9xEQ6LXQFQXyYjKZIeUVHJct5tvALh99O6ZzTLDK14OqFTp2Lsow+5eRTbOwAac0Oxn+HVo8+ruWvIc1ONgfjzoPWdeG1kS+Z9w7mTwV+7eRSkuRSXutiwfB4QAdL0I+bfJWT6ZGcK7ByZCcLhtrD+VYC/k1donP0sXzK0I9dRnJT+OEKOY963L25srlh/2COFCJ/G2eS5wcHd4XBreWInDhyOReljp4b8hv7lj5XOJhTLGBdb1qH8oZ7YHEwpwpwj10GCofsw/VGZejHdqvoGcjBvCoDP255ePHRyOGmiTqWDtMLDm8nw4+FHLInITX9qgtVRVyRlbmiqnMZfRLSUpekYP7JDe/D5HbCj60xtCP4TkaYL8uCwEOSSr/OOExxJa1XRxgDKzLPwNAHSJROuYXoiqzWV8E2VEkqVpjeT8ZTvdCIKikNdIgVuV8+rhfbUOTaGtiC1u++8oEAtacpvVfqV1mvCKLW79dXwTY6qphXmGJS/9SH5s2nypzoqEpTRWyvx/tUoGaN0Q99dKdPp4PrYj97qvR1MDW4VIS5x4e5hia22O9w+WAiireT8bXxMB7fjK+vdHP4oSrq/a74WgBsXxJVjcsP3Zx9mNwi8RdqAFLtNlalNjtcsGYT4+PV7WRWGWJJ7EqN1IgtiS88umFMjNmN+eHT4PahxJLEV55KJWpH4+wY+vDBmKLdr8papKY0UiO2ZJVPNnNi6Lxm5d7JPN0GEISDotTjULWhiiq9HoOy6Mp8+AajRoFQuuprEQgDVVTq6FeFQRW1V0NQDn3+okSSpvEwNAfjUfPcUPvaQeAIN03rNwarCpbWkQ6DR9h1RG73R4Mx0pg8TK9u9NvRtDJOHbH7CmVity9xUTFv7koc7svSi6IUs+BI388GL9wfSE1ppEZt9cttVe1ev6800yONr6hxu3SHNUifXOUa0us00yPWJKlXrlXhnCzJYkNF2taL4gvTV9HUoMoNlEiX3+VblHQaKmjve3tDSYEs7euVovGFeF4ymSAVtbYK7eoVqeo/BK5Cb+MDK3bDNTg/+R9b5yTY6TkAAA==");
    reboot_native.importPy("tests.reboot.greeter_pb2_grpc", "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");
    reboot_native.importPy("tests.reboot.greeter_rbt", "H4sIAAAAAAAC/+y9a3fbRrIu/F2/AiN/kJgtMzPn9p5Xs7Tf47GdOV47ibNkZ7zOyfaCIBKUEFMEN0Fa0WTnv79VfQEaQDfQ4E28PF4zkUSiG93VVdV166dfBE/RdHQZDJMsuh3HJy+CJEtn88sg+5JMw1EiPpotRvTIJP2PiP54eJo+5c+/jGezdPZykA7jq9PRYjJ4OYvni9kke/k1Gi/i0xP69yL4mFLjeXAXT+JZNI8Dfjx4vI9ncZA8TOl18TCYRA9xFjwkd/f84DzI7qNh+khf0HOTIAoWWTyjrrJpPEhGCT2apQ+xaBUkk2B+HyezYDpL52nAgw7o523MHwcZPxJlQTqJg3QUpItZ/lLqT7z2IjgfpbMg/i16mI7jS3rbLP6PRZzNqa94LMc2DG4Wi2R40wse4+A2mQyDaDxWPWX0Ot0XvTOaBxFNjbq8TYZDGj0N8EyM7SyIqOGcZ07fEiGiSTCJv8YzIsl4nAzjPpPrw5yeimZD3Xv/ZDRLH4IwHC2ItnEYqi+oMyJrNE/SScYzfPfDT++vP+qnjC/FGtzziMbj9DGZ3AU//PzhYxBNp3E0IzqJsTCtZjxnIhL/rl5+EWTJZMBfp1n+IbNB9MQUTia00MkwOL+dpV/iSS9IZGu91kO52AkvbfYQzQf3vKTJ/F6+Y5LNiYxiJcbJ7Sya0cr2T9T0ZvFtms77RJ6MZsHDLiYpvwuL705cX/TplYMvYT6gkAdE/3mYEnGIhc9P/9L/H/0/n/aYSq8+fnz748d3739kdg/mT1NaUMFeNAHBV9l9uiCOuDU4V8+GGHAx+Y8FkYO4hmdk/BN8eh737/rBjVhM6ponpGb6avJ00+vTGhHrPIoXDCJi+GAwjrL7OCv3Jd7H4vByGI+SCY3gIabVGSrWu4++GozPL+4HP2dxuY/RYjx+epkPVrGuGqCipBxiX4xNrFQcDfO1ibKnySBJjRVRn+gHbhfJeJ6UGFN/pB8ZpJN5/Nv8azQznzI+1Q8Oo3nEpMhi80HjU/3gXZrejeO+kLXbxag/jLPBLJnOSbiLdvKhUD8UFg+5uvk1SychCckDS7azH+MpV0dE5Cy6ixs6UU/kHcymA/Np+tP8KiTxmS+yviS+KR75d/IrqUGMJprzjE+srUVj9SxP0HiK/9RfpWbzNF+P+SwaxLfR4Ivxbf6ZfojVqvE9/6m/miaDL2OTXPKDsoKoaQX99Ti969P/je/pL/5/PjwphMbYxAcV/RMlaZ/Hm45GdQVEX4bqS92Mt8F5mo7LOll9Jhciuh3kOvw2Y4rMpQyb8nQ7CMtfyrbE9vE8edAKqPi7JBnio/wXe0v+fRiP55Gtaf6lu+0/eUt1NOXvFNOVZcDsgHjsYRpOb/9Lg0CUnmvs8XHGG9osa+nQfMzaXz9+mM6fRC+q57f8QUOXeYNQPGnhH15F6wbG/KO+LA2G5V51oyTROitDUvPpzP85TgeRtk3YmArFB5XlUo+Fpe8tQx+wnWMdN3/jaBDPwpJQV1qJr21Npe7PHC3Vt5aG97Q3xTNHO/WlpRlZXPTZPJ4MnuxNjQdszWk8s0k0zsjGIHMrHocP0YS098zRmX48rDze2PUD2ZDj+JEtypZeiycbO5xH2RcaQkR2UVuPxqMeXZJPMBUW3syv3+J5S+fTMW0TD/Fkbu8r/9rSlEyjr8nAyQ7517amJEuxXhZX+9Iz1k4Wt8629JVNPzBBHNqBv7I1EcapvQl/ZWlCwiMWwN5Kf2tp+JjOvozIdXC8L//a0jRakLVqbcXfOBqI/6Sz5J/OReAHQuMpV0dz9krYG2A7t7GzypO2Dm+lwW/vQ35ZaZbFc7J47yzv1d9UGkzIOfk160+faGaTeiv5dSi/lupeNTQ35zfEoB/p70/kKfDP/1vW/KovsVfbHs2HdEvO11+i8fQ++ovZ/JbcK/Wx7dG+HmRpwzJbhcUTLks5mjy17OPqCd1B9mQSmf7SXzwMpkIjxLP+KMrm9KfxHP0Vyi9D9WVlPbi12nfqFOTW6ktLs0Vib7FIhKc5HCbsnNNu+EStXsa/SXOQNlvlA2QiWBBPFg/ke4qNnRQ20+QhHS6IVmq3J+so66vX3s3imITYtF3OT9jfe52O09mF+pVcudliMH81GX4gpye+jgcLcpa/xj/I917L2If309mUnonV47OYGKrcg/rIfOxNNCHdmS6y7zi+kpWef8sRJWbHf3AESX7293j+6T4dxx/m1d7/zjO2fWK+7gfeZQQJSk+aH5uPX5O90EgU+wPlLsrfyk8/xPNXw1/jwZy+KHVY/sLsiGg+feRxlp8vPq083LKcHkv4kR7+Pp3cXS8mHD75Lq6+nNWE/O2T0vtFByKI8jNJVKBjE+R6z+JRPCMTKjYiWmWxj6ZJ34hXWRQDP3E/n089dEZ7MKDpqdyWdz1Qdkhs+i+d1mZR+l5aP63flrx9l5i3fS87OSGnl83Sq4oj3JfGP393HoYcBApDsYSf4uAxnZzNAxHd45jtT0/DaDJPBsIdiVkHxeThPt6LYOt9/CRCnovJUMQylc4gKvRPxPNZeBsTM4X5V/HwMqAt8Bf66zMNi349pxeLcE7wM7HS/FJw2JT+Pjn5+ccPbz/SU+ILfu7khNhLSno8+5j+xGtzLl50qT/tC11xEeT7hfraRai+atczX2y85TtStvI94nvP3qScJBnZvqTtydtS7ej5MU3oOzKGWWqCl/9aHrcchIyly3eZYymrVD1/1UR+WNCh/LB8l3PY5YdLo9A9n7hHUqFRMRbP95UJsexYhKqqEEV8VqeJ+NiTJLKL8ihke+cgavRQw/B7l50aSw7j3WS6mMvdVg5mnsw51VGO9b6fSpNEiuV/SoGTPMzKocPjkd7OPNsoseNoLmkz66Q5icBppB/ZRJVyNRIfJJnII9AGcy5mdSE77clkC39iNhWfVpqd6Li4bJ//SWOUf6jhCapHSRYHH8nFEpZK0VbE1U9fc0onnRdKMNdA2q4TCRZqHpxWmp758cXZpUpLnYnRnunJVbuj1zBrJDPad8X7zmhAZ8VTPQcNeaVLJJRJNk8Kitb7QkAe7Nrpl7N+iYj5p96ULPrZF3LmI16BplKywzCa3WVhyInmgbASLoJaWooNh9//8FIFBbl0z78o6eFOxG8e0mDrRbAQd8K/+HKEraOCeNxb/teJqeqterFY8W++0d0pLintCSXHqMVoKD3bskGWnm3fpkuPd7cYLCOzDtp7IB7mgvmkHzH8dmnz4c62Qn1QtuF2HkPNUOi48T/E84gzs84mhUBz41YTwByfjwVwiLuXSYMNb156+Uok1B96kzHvJf+EV32HaakH3IGeZT7ezB62js2nuqK2fvLpc1/6D+vOY5LPd+OxRbda9h9bkxbNa2vSvgnYWnXflNzDbZpQ19F57FSWBp3I5rdnWNp03r6cI22YyrIDq+1pXb1T0WZ2m8xn0exJ1+g423aZc/9H+k88VJHYyitnXBo4D6MRd/CXMItJEw6dr+WYUut2ahmCz656BD6NhTLr9WwclK2yVZnC1W/9KV3rtwhyLM2fe7BQ1Wl3WLDl6eKxzlZZLq219Qnv9bb3n3/NymH3V886iQ4ryLPcjCW2kgvfUfKtXdf4Wryi+ukyzGd7nX0h+JXWb6ymomWlfS3Gj7NokkUigbSE8djSeiN2ZMs7N2FStrxyhTF7GJrNbTdgcza/cP3mZ/P71jBcGKWetIZ9CvsU9insU9insE/XaZ827zr+purTxzSvknwtq0G9DdWGttIccZan9cVREx8jr+EdTrO05bVVU6nhFUuP0MsIdbdchnw2M879BpfNuQ7a+RqZzaMrmZgu08vdRdnwWkJV2aXO/cLlZO6tOrewiuw5+tiIDDretQlZdLxq5RF3lk17D5uQUfubNiCr9hetbbSdZdfe1RZk2P5ib1m2lpv7iXBD03VJbsMr1iSwDW9Ydnw+4ulu2BK8aWjZzvzutp0jOK0z8JjqqgOuxXCycRxP5ckqaXlmzshIMpm3B0bcr/eJitRHU3Lo6l97e3OWnvPvaGI74ck1EK/w6OoT6eDO0Uw34825F87mDFnmIM5U1D62K3M3mZbU4Z9mCX24nBIvt92MFi+/YyNqvPyKpUfYXZGXWq7Jvmp4w3rsqoYXrDw6HzuqoYvN2E8NL/Su5i0fifSr6rW18SlojWce5bS2zpes741nlYpWW9+dh+RT6Wtp0UYgS5P2qltLo+4VwM7BNk1n6bF5SJKt6UYkyPYiX8n5LkrGfL747W+DWBhjntLjbLemXcrZ/3p2KGf3S43MQ5ZcrdazK7l6X8uO5Op8pVF5yI+r+UZkyPWyrnL0SiJfdJSiSqs1y1Cl9/VKUKXzJUbVQXrKbdYrO+W+1yo55a5XGFEHqSk33qjMlF/lKzFVvIQWUak+3mKIVB9v58tqi+7Wmn2Irgl0GZGHiFQeXo9sVDpdi1BU+lxmDB5iUGm1Ef6vvMOX8Wt4L17872i1pq3C0ft6tgpH50uMykMO7G1atIW9UStr2pt1dl2ahtw8rRVGWIvWtp5VLMdoS1Pr0EJzkHeTLB6POjyuIKg6tLiNoxmthIA86zQVXsgODRjLtcu854vbDo8b4IwdSiYlfF/DuHyAKexM5hOT39QBy12Jutsps9JJy2qY3VVDJDGqyiVrtXVpKVIzcK72iapq4BsgqkL2KlNVftiBrCbA2H7RVY587YRlFV9OxtEH/uk3br13xORRr52QavMr0VIDNvqSU/exdxRVA187UU37oERZ8wtv8pZ62zsam6PfgH7l8VS0qwC199etooc91KzcZO0EZYuzRE5xu4AvMUXrvSMlj3r9GxTZ4uUNij7w36C49f5tUDTqtRPS8FJK9DSx533Java1cweU2qhrDH7tp5S0U1fhWPlhB65VvewdbfXIdwF4bXnAGS/Hzn4cRNJDHgCRMSE/h8bemzL6ZXcqStdux1trs9jmlQi345GfCWvrRht63JNGHPc33Ww9lswa7tb8wMtasZNO7OqScOIunvZt2taP2NK4F3EbUPsOZSU9a3NBevrFXznbujJVF/doXgvip5DsA1RCKwcp/7CG3e3i742/1AT63QbE1NS27Zh3U1sP8KOm5kscqG+fideklx64D3xTQ8vliO2Jm9TQuPvR+tZJ+Ex35TFbov1LnpCvvqQdZKlhaH4x4vpJ667nq/1PVdvvKnjuY7gNJDSDyWs7Q11916Zso9aTtOb5WX1q1gqv0kAh352h6SKLlo2hqWmLqmpq2q5dm1p33xXap+Ez4WVH7bElNDRcisx+yrWhbef9oHUGHlNddcAe5RMNPWyklKLhfb7i6305T9sVEb79tF2V4NuPx2UOvl0tcedEt9l2JtJaJudziYVnL6svmuedE54ddb8Vo9NEu5JnrfOqGZ3DeDq/X+kMoO/rfQxLMZqSWSk+8TYqZfudi+v6kqgwHMVEduGkX2lFbOagHCl3In6zXwfgOf/GfeXkRcO/4Pv4Lho8BXfXP70OPuT3azY1EXfOE4GzWECsMK1n8Tj+Gk3mwXk6GT/1glE6C4rLOsXt5cnDdKyu/QzGxTupM/UgX8ceBdcySaZCYf3gnWD/ZJa/YZ4Gg3FC/WR9Kcw/RF9iOYm/z6YDNYWI738XBHgRvDLflw9Lrv8g4ruwbvnaq1kcZNN4kIySAY94EtzwEzcXqpfbWN7cbusrC86jLMgvog9un8SVfuKZGyEGgxvVzXS8uEsmvWCYCobJ7sX1r5MnmvHDAxHzNlK3w2dBOucLV+VQ0lsGsbnpqyoy+VpxHeilmIjUkA1XovYNwlxqlk2ybHErXnZe6vOi+dax/utxOviimcVUEZJ7za/FQpQ67638dr7Y7wd5v2zDIOpPucYiNZu4lVCqttHpz5Mvk/Rx0sA5Z7+Xevrj7JRFTa5cjQCeC6NmcXp6SkwrP+ePpQA9EJ+TJJBeTbMsER+nwX2aVQWKe7gprdBNQIwlBatPfZ+o/WtEyohvLwtDFeyWvYTyMvk6j/3SgSk+GwvCnfdDZ+ekAJ3fFUNVH4ur7DIxXsHx4ySb/+K4J1dT9kdq8rnGHz6tzss7k5jhWe+zMSoR2+V2YmDFuHjDLV5Z1rKF1hiKm/juo6+sAtg8SAeJUCDyKj7ut18dd2EF8ABGyTgOi/sPiwE47lYtHu1/R03f5H/W6OPOWL398Pr63U8f318Xw5C73pwHXwxhviCN/0trmMrCPYUh4jCvyh+/jsZjlpNfSrv9L1Jn5hu3eA3f9vtBXAv7+aL0tCCr/uPzZ/HrZ5OHlexftbHzec/AnByG81RfQ/sQz+/TIV9K1EgIblQiRtFFdYn0ey+sb8qVkUMRbl8nWfT2llST5c2HqaGMiUJRbUZRWXjp6PWVhSbLq61mf0U5CPo1wQ/JcDiOH8mMXrPXkjsstGSFY6K/Z8+EunT5JhdBLA7fij7ZFxhF5BELnZmlD7F+TNytG0bjLA2DbDG4L7yhGbs3L4LvqDm5qAKGi5yV8Zh6fhRuS8DOSEQa+I79FVG2Sa+/feL7bdXf8sr7gbh6mb1/6i9aEI1nyT/lZ7Regy9ZnwgTqyYkf18Tkj1yTsSz9HKawYN8/Dzu3/UvqJcb7Z7JRzLBjTe9/glrbTnYUAxMFh2wH01uLLHS6Ex///J3xeZcB9Dn//y3894fZ3rTyq99kcQoFtmybekus/Ahf6xftCA9X99VHAXX31zUJCgPy/2NPLO6wEfT6ViR2Dx6UtPZr4rn3g3LbyHWb2opxb/USCjzh2gS3fH4LBu5+UAmLx7+Qf5V9DIdRwPB36FkRltH+TP9n/Rvr8XDRTcD8k8n8bhpOMUCVR7uh6/lB7XBybuyBxFxaHOPxoP9j/z7a/7V6EgwoJQEY3QOBW28glk7LLfO+h/573+oPw2NHI9GpFZCdac2dWkbtBKarP9WPP2P/OELQ0NGw+LIU5Q9TQa0Abz9GlvicdliGs/Oe/06T9f58qr8Z3kryXnwKv+t8kDZeCguG6/zKj/JIUKLbaLE6KxXf3tuNlHX5U3R2FMbzaBT26t+EBtKdlp5Y2UnrcrBVfWD8uMVFr6q/F1+uMYXV7VPyg342naumOMwUFhcSP+QXY2jh9thdFkW/v6Yr2Cfl568MKOZZQu3ZBXIXw3T79Uk0NFLEaqlTUE/dUYmIHH9V7L4pH7mbS0mSVMGYDI3+rmPMslTw7/Szzi4qSjzfpgHSXs3/coQ9VeZGXqtdKACr5W5mXTJy67U3+Vnpc4YJtlUmixWhq6qmOJxqWfe5H8vLXi6yysxKv1X+RlDv10Zv5cfEmrjSvy3wqwpGzEsvNT0ykKofukJK+u8CETkWfCD8IaIN8TSS3vtLMsP42WpsnD4+fyMXiasldvY6JAMDOImEoF/0mNE6FR0PkjJkmIrqeRNiEGrrqQOun1SpmIobzAt+ES4gg6HQiUh+rrURzBRiVhn8vLdM99r3MukPhNMeuZ5r2ulrQlTftbtcpNKTw7s81U7tUA7n7WenG/spQIu2703C7rh2XKoos09SxC3zuMrAVmddQT7qvRVA/TpPJoKvEnn9hoeonPDSoHrWWfogKqk2LJgZ0sWLVb6thVunC1X/1LpuTWPd7aGLHnxzj9M7U38lbt97HQnI843XXCKjS9UYO92NEsfyJecLcaxyGTGA+549tQ38sMj3SAsOgu5RZiMwrxFZS8snkzlw04D3MPqExZ50SX5VPnvwX92e/56MY7LNmGx89kTaQ2dXZ6UunoRvBtp91mNjowlSdtMO9jDizx8RTsfUTdajOeVbowOHu8T2nDJ/U8fM7GA02kRFqDei2+SSaWXYfw1eEiHcXDO+f9xepfJCAS5xqzdMhGxjcdTMZBFZthKsj3teLxP0xBiaQQ8iaDFQ5JlIjBiBhR6/VJjHmiNA3S44LK24oogHrR/I+lVLMF5rbNiSybdfWH9OslCnq8wKq6+I0svrj/XO6nOyLxHpTa5i+5s2HMSQo2+bZah4p6r+nDapqNeZGlYMa4NVrxaQg/kQbOiiRF2LNma0sIqBbCoXWU4m3TqaYKOwZfbnfdY8MqfOcznhD0qZrVMVRg8BTHnmbMgymSVjC6RyaSAyaoEmZamDx5M0zlhG3n8FLxkwR2m0uimNiI4Tx8tZJvgRm31N8HjjNQFa36pRR6T8dj01tLxUDSgdblLWJ+URtQP3k/0aB/js/GYdgcunkll8JDVApcpGB1yHFO/M5PdR+U+hfcY6WoL6k30f8FTkbFNo7foa5qwKzGfPbG6ES6Q9DK050ITmt/Xu6vyTP51KGfDboSOPTjcCZG6YdAYi6/QEG/o142t+vbmrnkSJQjcXBQknDXGLhqHYdhsm3i/rn5l06AUyFcpO/nHpSOdYUk+tecZyhOsZxqqglsMoyqZIrSmM0LEGXM9aOEcz+LRZXOM6zouZa90URj3+m7OVUDpzNcRLQhwenr6TicdZMSdXO2bIpLd12Pt3YhkaQXlQud6BkKF6nBjmSb3ZLKSWF7VJ6e+6f9v+bO+11QCG+JVTdGNInJI5LzKfys/1NtipFFK+dWpouJpNVQiyCWtgYbg7bWgz+sqsIih8SVvCa1ki7iQQomjB2KXcCa6Co0zh+GXuLJ11hBM6tG8fhgadAsv7Cb4FQubMV7ee0SzrGyAyNGzhpZHHS+Cyvh6XKhna8n/nkQVpvi2Kmg028E8JE/FtA7K6RfFgzbZq7DnxUl5VS+LA91G6THpeB5lIH6oAHqb1MpkcLNF0SbSF6Wsv8hw/fzzuzefP5eF/VqYX2LPL6CXSOQ5z8eb3ZmKsAV35OtxcaR5155UvUYcTThx3JV2MXLwKEmGs0rQtsDGmA6FySU2VaE7yDChbXA0Iot/Ms+H1jeNGk4Z8jjJIjwXK9ufEmdk9+mC1l8WCoxFQDKIJ9lC1Nty/3OZgi2pZJFFVXzKeu9rrLKm9PF8Fo1GyaBvCJeooRYSUA3U91X+glqHNKJqjbJmoSalpZ+xqKtecHVlSJ4Q3IIiP77/+PYy4DxysJiQARxI4VbsKRO92WI6FRZBSXu/CH5UFhVJSTIR1hvxwWIaCI8rE9ajyvmK/ocqzJrSFwVhxhEtdCskoScDk+ItFRhEd7Qf33HFR1VbkXTZeZ1TOYVXnYwCXU9wVQRaq37z5GtE7EwsJ2aeKENPWc6StbhoVrCXYL6h4JKqx6tN5NvFXFJsfj9LF3f3pEzJDy7KdK+ZbyuN2aqkmXNuXprL1ffexiSKRR8yzV/phNlXZHj0pGnthpzvoY2r9Ci547wlKF+8vuee/j2di9oDrh4QqjMPtkurl1M2pTdJG/a01tPoVFpNwdnv8sk/RJG8bm2WPuTV5/VeTv99YvnwTRo8pQsl9cHtLH3MuEo2ug3SKRFLWPvEu2OWB5KbjC0bSzci58SqoJDPC/axpLdQ6CPjew58kOTcCR/k/yv32Su7usKZKu0rwhqNpI3e//CUzeMHZbGfO6NRt/Pw61+i8fQ++ktf+RFsM7+TZJQkPu/VDSElYFdWD755bZpmJbdboUKU4y1VpyhtZ/+Mhb/IUo/LYqgyFic2g8PHmDQNyvvqvrwVk84w69Rs6t+vaNhZwiZC9CyzmEUDpnc2jSbnDjowCa5Gp7/rApoKdf44P6t8lRAz9E4tZKWXyN5OxcTPe2ofpu1z/GRrIffsiTA9A2J7EtYHkcDMgp+eiIQkbKwwWdHxInwQ9Xb9WjdT8ax2pwdXH2cLS9xsHNMwrtw0+kg/4+/5of7rnz98fP/D2+sKyS9dCymLjq6C6DFKlCFAtvXTbSzDME8yvmOPlVW5tcI8bfEykaHnJ0Otha/80n3nveZ++j9FM3ni8cN8xjtByXKzjKLFxyg4wU4Hq1exhHdR9zLM9cg/tQ+iEF7JyI3BDJd0e+shc6hXJiu5H1WLcFVaKvvjFr3k9LC8Pa2s5Gq5Z+Q2zvo0yXgyPK917O6N9hJ68FIWSw7TWB6kI5uTDymRhUrmPFvog3QqAnKDxYw35fHTZUOPXAVyP59Ps8tvv70jnl3cct3Bt3KlXw7jr9+y4UpG27d8JijOvv0v/+O//o++s8P/5VkDKLlwtpiEo8VEpMTD+SPH++apLsCJQ1mQk7mpWziw1JEMQZ3r8h1y4lX7S3HRfVNFc8XGdtPLjMwbOk69urFZq2zXdqT2xzy43/xXJ81V/aPmbhq4M3eTtf43FqWhGdk9Jf8o+FOB/9W8ENLCMtDFGqSt19hTeQAV/DHbv3jsOTgR2Wke2FLKYzCOIzNRU7UfywUmcObgzMGZezZnzln4BbmEXEIun1EurbWTBxJ0sc/uCIMwVkIgKLNSUMbOXD5BmvmM3xjmWDSawYy4TUsZqyVi09YpgjhtQRxfbbGNoE7baiLOc9RxHrs+f5a4j30oW48DLScwzx0acuzLCBVtN1TUcvbnIK3h6iyP3iquEATW8Rqt4yqzLWUlx6qTzZjLrt5hN3ezm9v1yrPYz67lhSENQ9q5BeyAQV0d0vMb1t0kabcs7NoeD0t7y5a29Vz8oRjYtskdo11toQPM6dXMaRtreVnRbKqOUz7PI5uGI27rUyLYgElhM6ibXwQzutWM9tMeW7Gem9cSNvNx28w29f48prJtJNu3kJeRlme3i617NMzhZzWHNZgTiqJQFIWiqOc7eVYGRzuUE2ilWR3jSTSTAPBHVzuRVmImr5Np8Tx85CahPr3efkbNgj1oO6tm7xkeZ+uptRaNsA1X07F4cDGP+xxbSVU/z3m20hC2f66ti1w8tzNZ2VnhRW7Xi7QA8B6IzVqf2RHarTUiwHZdyXatM5WP/TqiViFzRhjrdisVIDX0B8u1zXL10QvbsF4bFhEW7FFbsHWl/SxWbH0YW7dkO8vIc1uzlv0WFu3zWLQ5RvGB2bN6XkdszeqUAmzZddiymqG6WbIqybMmO7bSG6xYXyvWrQ22a8NWFhAWLCxYQ1E/q/3qTEBvz3r1ko5dsV3z3RWW63Yt1+JaCxTxoIgHRTzPVsRTu9oP8gh5hDw+mzw6LpaEVEIqIZXPJpX2S2UPJNpqndwRhlxtdEDcdaW4q5W1fIKvfPESTVC11AESn2rYhvucLWHZ5vcgNtsWm/XUHdsI0DYvJaK0Rx2lter2ZwnVWkey9XjtMsLy3EFb+/6MyO12I7c5SMyryRDOKpxVOKvP76xWVQb4D/xnXxvWd6N0MfFjv58n7LHcR7fjWDqxJXZ8eJo+9e0XRD8syseBnvWGaG8Tbvu3OZfuEPa4XlcFlTzcYNnc7viWe+nk5L5QdyQ/xuyipQ8kLkwa1h9zYgux7iRAaounXTfWu3SlG6l7Hu+JiI+8ebM+utELNpsORFBrkb2mrb3/84+v/vHq3fev/vb92xsSy0pPItqiFozHQMovGXCn5PyQH8ZfyJeVzYRKL/OUFM2EXBAy2QZfvh2nWSbWPZ1MxB08yfypvMe/qHTw8f2b9+e38eS+d0kD+ZpkibooexgPEqGbaH1pVDGpKuFZ0SJk6aQ+DKZncFOSo96NZCX25cR92UHKmomJPGEazuJKN48xMRoZMWSasUGuCHAe9+/6F1qTXpA4k3P9a+0q74rFdBHE80GvPHkeY3hLhEpHI2tgUn3X/5v8WWHAF8Gr4Ma860gYY9e8fDe0nk+kT76QfcjUEGtaaZw8PMTDhAgzfpLBNSYr6Ulx63aghyVMRL5em6zkCVuUVSJJdhlEs1kSS4knQQ7EdhEHo2RGAhbN51zadyE+yjgK+xhVR3PzM18VzoNP4uFrIsyN8L/LBFODCsUwScCD78jpLQ+I7FLiPo77XVqCjJ84rPiFN8LRYjx+OSIj+Y46urv+6bVYjYsgUzeKJ6PSreuWvh6jLHhIMhJLNnXPk37cN+905w2c94nSbe6WbuT97rF0OXsXQcLWA/HuJH0M7lJePCGUyd39XHJtn0Ollo7Iro9JwohPiyiA7EqJJA1ucpcF44QIIH1LSy/a/+Ttm9abyEEDnN/3LUE6cfu8/SZ5PXl2r7jXvy8i4tM5X+5++xTcqH3ppm+JSy9uGxSyVGrl6NkHanLujvXRxkvKZ5xHD/msq/5snrpjBqKxIPgDiW84GCf0ox8Nh7ShZSERJSSpS2fNQQc7dS682uijuCP343avuXfS/olQj1eC3GqTs09EhwXLm519RLTtRsQ6kY5L9uepWK9Qf2Gzvaxg2ZcnrXEgnkDtKelvBuYGyGbkqyS9ng7eskXIYUlhGtpfQVIvvu3zLnfeYxOifTd1Bxoy8Xwef9EKnkgivwmFxdfnXSnkCZ3zf9yhEOlth1LjXgXNrCdEj+ajxkACKT6Jxw1hE9OYrlvhyv6WpnUoBq2MQmNGQ1rrZJyde4XYFll7jOyXFuvevgF+bouadf+GaEkWyITGTbth8/zMhbrwonanyTUohOagF02hfWFy6S3eLWcS8sau+Yg2h/YlNsjQL7r4E9nlZ83Lc+k7ysJsYgUzGPOuxBuHUNztczV6uvB62EoUnUpcLJJh/+ef373xe7GbRF7Ne+0j7q3ODZUBsrFNWrG12VJ83f/p+u2Hn394+yZ88/bVm+/fv/63VbmkLYRj+3cqxiLcVOU9BrfxIFqQC5vMM0tsxNqJwSgsM1OyGhZkb5MfEw3H6eBLPLz07Gp0+rvck7Rq7f1x+lwrT56ge3/4eP3qxw+vXn989/7H8MP/fv/z92/C67cfr/8P/ffVh/c/fgg/vftIH38M//bq9b+9/+671hGwAcpWZNnsX5Unak4EOwuNrdqzCWK0uV2i/bbz3goJik7dcWIrmdA0Tuw5yOtYQOonc/JVhD8hOEp6OsL5kC7L/H4WP16InW4u/JuI/e4xORJDZRedbNjMKRks2oNwE0oGDnVIVIqrNlPE62RnLbu1eMa9p8qoAQ/kZKkxCBuY3Xn+KcjoHo/4+qR1HG40QR4Gcke+sXsRH5LxtnjZ4H0eH5a030zgXkToS9F7kmZy4dYSwz+U+P1yqaJa7bD7yvAsnoeR/s4nfmz2ZY8iW7tEMBnBZASTEUxGMBnB5D0LJps7XnNI2brzIbKMyDIiy4gsI7KMyPIhR5ZLTibiy4gvI768+/FlU2ifN8rsHMk2Y82mqnXHzMx9bQPxs9buEUtDLA2xNMTSEEtDLG3PYmmODbY5rNa6ISLEhhAbQmwIsSHEhhDbIYfYXO4pom2ItiHatvvRNof8Pm/gzWdQ243BPX1MczARBReH+s9nqf+0rwXqQfe8HrS8rG9/k1hbELXdEbXqmkDk9l3kiDe+Tyd314sJ89R38XxwD0l7HkmzLQUE7LAE7NMsYXTjSuKWk6RjeohBJPmp8FE8tvQFXm0dIlOLTC0ytcjUIlOLTO2+ZWpt+2lLnrZlN0SaFmlapGmRpkWaFmnag07TWl1RJGmRpEWSdg+StDbpfeYUbeuQtgrIE88/3afjWNwuhhj28wDzlNYAwes9D17ra8ffCkYkOkCsnkWs6usA0ToQ0VLDhWA9q2DpVYBY7blYfUpnX0bj9LEiT7t67U0x6XzgLB/SMczl+mui7z46Z26ZpI89X3q8iSYkVOki+47vyMkqZBnqb8OR+NrnoHClR/tZYVfHSDwj8YzEMxLPSDwj8bxniefKvteccnbtf0g1I9WMVDNSzUg1I9V8yKnmqtuJJDOSzEgy736SuSK3z5tebhrMNhPLH8iBiWn9F7OMnFN1C3P1vgp+hkRaPaTvbPZC3rN177jCovktiK4huoboGqJriK4hurZn0TXrJthyq0XzZohQG0JtCLUh1IZQG0Jthxxqs3unCLgh4IaA2x5cdGGT3me+8aJ1SNsMvl2T8mmJvaFYdjvFstalQMXsnlfM5thuryZDn0j3QD8fEmuGK8S9W19sj4F3ej8i4oiIIyKOiDgi4oiI71lEvHV7bI6Od9omEStHrByxcsTKEStHrPyQY+Xtvi7i5oibI26++3HzVkl+3hh6t+FtNp5e5b4tho6bI5SIFz8z+oBriVgYR+liUoshn8gQA0k4KYsRkSWbcoCyGDK758UA5lH25dISQOPPs/5H+u9bEfAoWnxT/MohrlDFPYi5qPFYh5bMh8Jxmk5DBh4Ti2J7XTKRl5Zk8sWhHjYx2/vJ99T8nW7NEa7odhyzMzaOHm6HUZD3LEOKxZvCjHoYLsY0NpY4Rfde8PJfuw2ByXAdZ1PSGPH7mfRIC4E9PT19o5+VcTzRAQegZAQ0DhaTMS1wcFYimJCzLJ6bIWVSSPEF7+syPzWIiCl/XZBUx5NsMYuzYo/gdwQk/gsR/o5/Szjuc1J4omJniVQMeLSYSNtHRLUK1Ipvbp++CarT/auOpOW9MbORsUWMI8MfRKq01qxPdCh0Gu0cZ69JP/E0yaPnh/uSeUOhiU4q20yZlSzhNTO+rZ8LzkS/SvMJeg7SGScIg/nTNK5vjyqcce5OeIgh67UmSZWMU01C/JzFUsWOE/LLlIbl2LloTtpoEj8G2YBUWxEXfYwFbMgiq8aBRV6UOZoJo6KMNwN5e8+NsLpuZNAxu2HOeFiM58mUHr8lm5ZZrhqdnsg1F+mGc1o66vtJZjrmIvXK0c28E8FGTKysJ3aOdFHNd94ncxHDj4KHp+lT1VTRgz/LRC/aTmD7hjiSA38n5dinVkyzxSSU1K5rUzV5m6JQX2V9Dcairjmqq9Rv6h/pEO3kLlQUdSkth/Eqhy92WBHlDGWoUUdImZjhoxqY3T4YuIarlbH9m5oSvap9Ym9Yn/JV/SNLiJCDdpyCGcdzh8HnjBlKQZMSlFuh58p20Mvmjj1XKHXVSDHTMhQhX/24XprmKHDfxYHmPzVyrRqEruF05U980cu5YlFifiJonxT2vF27yIBuYCqvXkto4TYmsZ2F8/RLPLkK882KWO8uGciPw7C5C/KvHqa0L0wGT1eW7a/4tv+u+L3dMSVuirKr0RlvksHvtbCMyOJeiakK8aDPxU9+ovfHWUvMsGHt3O6X8tUU954LqQrONUsqld5r4F25SVQaWJ8vR7+FeiCj8TWHK3mDfesOe0vlShYyq0sZXo6kNi78vYHuh3M/kdy0HU6f9tZYK9V25kTaNGHe37ljPZp9YA6ajOetUXAdCb/wjlh1NreXCH/la3LuE8TjPIrySHvLhrWdrCjp2GuhtWBC+egKcQvh13iwrjv3wDuB+uiy2eUNhQVwFYzOftd9hPo2LOkz98NQxIvDkH57SNk0D8M/+l6P/wdZumwhUYOz7hJVRFlYsLJpPEhGCU1OVmg09CdGFIyScdwoeAYBqEtlHOi3hIoPb59C5UuHhi3MidXzs9KmUc7Tqn3j7CL45bO3iAoJ1AtnsvOzMqxkx7I5XcoxNpmFMistvtR2oF01qPSCZZfTiRaVR3drlnLe+Uq82jcXXRgjFr+aTW2R1CQ7YFTWw3k7h8pxfCybcceCnaz1MMZrP9KvP9JzdpY76zkTzcSKV9qnu2gybsXbrlax3bUxfOW2iF8EZH9Nozv2twQFAmWFy+oL8YkQR+V/OTq5WUzmyZgrnHh3zYJzBnK8qQxQZYlEuC35GpOnqlv1HN2ypxezjaYqqUQrfotwCoWvSB/fF6939JNMvqaS4/qO/Hw+pJIrcmVxTy78ehCL11LdodUYa2iD/UJftu01FT6eCVbcq7CBGDGiBtuJGghiI2iAoMFzBQ0cDGiJGSi9sELIwOxhqxED+Nfwr+Ffw78+Bv9aGpzH4l47ti9418/vXStGhHMN53pTzvWHeP5q+Ks4U7ZfqXlz4HC1t+NqmzSHxw2P+7k87mY+tDjeZWWxgv9t6QiJeyTuEVhAYAGBBQQWWgILJWP7WOILzZs1wgzPH2YosyWiDYg2bCraYB46ReABgQffwIODbxCDQAziuWIQ3ixpCUc42iIygcgEIhOITCAygcjEliMTLsP8WIIU3rs54hXPH69wMitCFwhdbC508fQxzUFi1BrsYuBCAgL29T7XZ8TYJ2GgvOXfEKrYdKjCwicIVCBQ8XyBCi+GtIYpLC19ghQtKggHF+DFw4uHFw8vfu1evM1GPR4f3mujgwe/Cx68lVHhv8N/347//vY3aUXCj4cf7+PHV/gF/jz8+d3w51sZs9Wvr/QA/x7+Pfx7+Pfw73fdv6/asMfp57dugPD3d83frzEu/H74/Rvz+4ldv08nd9eLCV+e8l1MphDcfbj7VXffwibw8uHlP5uX78WPNufe0nClgwUNHcLRh6MPRx+OPhz9dTv6NqP1aPx7r60Pbv0OuPVWNoU3D29+S978pxl7GXDn4c43u/OST+DPw5/fEX/exZDtDr1suW9ZeqGDgQ6AcATCEQhHIByx3+EIZXUfaTzCtXUjILFzAQnNqIhIICKxsdsJ4/mn+3QcC+7dv1sKSZMhFLHZ+wlNBkEIAiGI5wpBtDCiJfRQarHavYWWnlA9AHcd7jrcdbjr676/sGSSHs09hs3bG9zzHbjPsMyYcMvhlm/KLf8uSsafyHd5K7YtmjuKBOCZVzzzGo/AO4d3/lzeuQczWjz0Wisc34dfDr8cfjn88t3zy+s26bH45h6bG/zz5/fPLQwKHx0++qZ9dLVDwUOHh+7w0J0WJPxz+Ofb9c+9nJmKd67awDeHbw7fHL45fPPd9c21LXpsnrlTD8Av3x2/PGdOeOXwyjfllWvq71Utux70tTIo4Zhv1jH/5HRd4ZEfnEcuydWw5t5EqjgSyzu+zd0vSbh2fwNuL9xeuL1wew/G7c2NvcPxd82P/pcFZ0QFQbPwIRkOx/EjGVX9h+jplpxAMmxGi4m4WDycPzIxaW7aaNX7hodV1GBHuMyYi/UbUpbldO77L4JPbGY+xmez2BhjoMZIXziaTeNZkg4T3kCegnnyEJMZWjWcx+mdo7V4Kgo0uYKH5O5+HtzGwf1icncRJP24f+GUohdskc+Ce9Yiwe3iru+0ywrvXO+jKqDBX7r3gGZDt7PRsxGrxP6pXogrsV2yFmHNVX+bUPPBf2daZjFNYphZu3u8JyUVfJwtGraEodAJ03gyZL7RpmOF7PxZMyV/4SX53ExINbsr9XMZQ+5F8Po+Hgj9TTz/NRZ9DgPujWc7uG9omZGrNR4KzzdIB4PFTPUya1L2dZlqVPrjeHLOFO2xE/7nZr1M21g8s64ue6CaFZR7x/zQ2BsJK7tDpBYZQaHdQBqdfZgn43HAS8uzG9FGqNxqtdfkWio4a+3tjF1xtUEE0YhDOLP45UzCObCfnocQNBXPVrChNG3+5apdBkxRTyaLuM3IV+4K71jn9VGMkglrTPvCKnEVPTATnDdszOIhaX2fN7H7j7GMe0WD+ULoaimfbLwIDUkqOxk1tJcBiIR5Stl3tEmygqcBns0DMjSCqKG5YifJXcMiCGF0FWUN7SfxV8EK81lCvw0vSN/Pi7cPODBC5shi3jwD43W38SCi7UPteExlERpoaS+o7V6LJq+6MIC4E7e5K0bY3M2UJL4lrO9hiRx7YF9sbJpMNKhuyHG7mywoTHpkCZAl2FSW4E00oeGmi+y7JB4PM9TuIUVQcYYrHIJMAWr3nqt2r5UVLbV7lTYrod/Y+wIALwB4kaZBmgZpGqRpWtI0VWv7WKoTWzduVCc+f8ChxpyIOyDusKm4w4d5OiMxGSxmGQ3shzjLaPh7VaponQHqFrcTlLASH6EJhCaeKzThyZCWAIVDj6wQpmjqEcEKBCsQrECwAsEKBCtaghV2E/1YQhaeGzoCF88fuHAwKsIXCF9sKnxxTbK619EL2wQQvNhO8MJGe8QuELt4rtiFHz9aQhd2JbJC5KKhQyAmwc2Hmw83H27+mt18qyl7LF6+39YHJ//5nXw7m8LHh4+/KR+fqJ7NZ4vB/NVkuP/lCq2zgfe/He+/dSEQCkAo4LlCAUswpyUu4KFrVggS+PaOUgeUOiAGghgIYiCIgbTEQNpN/WMJiCxhACA68vzREQ8GRqgEoZL1hUpOjPhF7mBPUsEDmQCPEv64emtBCnr3bB6SJs8jHVfBqfjwVOMllQImEtnsVP95elLSZsE1r8ZDLMzAMgVGp6/mc4aKkGv3e+3Ff8it6+z3agTnj7PgtNJVOgnOtCRKXLFgmMbS649/I5+/aKBI80L7QnorHChZzeQmUsQEwvC10J3F8HnBihXwcv5niXS7ysIpFvoycHpSaohFA+UrNTSRY9Ue1okluNCMjNgLXv5rDigmO3urnjpxetJiHrS7x9zpQKs62lqj4fBcO7iSq8nGLjVlLh+GihD6vULhEuPp631yN1Q8dxGQOZ9MknlC7p/45Kr2EmGDOEbV61X32Nz3rwupicxciGiVIzrHAeSwjcm7VIlYxyv1s13qTyze/sdUEs98mxxAhRCu/U8C34k/zk9ckZP6BH5pZVLZsoJCWJ6ToLyCDWWNonhWawm2KcRWUh+YBNi7kj/qozPc/VzFO5fM0D5XZ2XpOPMJ23nFsBoZp2czC61yajEABbM52Eyv35V7IcWeUQSqxJ/1p0jExryzEo8tpswwRpPaV67J2XyysiqVs/xHvvzXcU0dsQ9UAEAGBatcBL8usnlA1rvc/aba3imbAmWXcWU38UXwTrpfMnyhHwqGi1ggBUpXTQTbhZskR3lS88KUacY96S4SUmpkkgfpKH+AJ37z8+TLJH2c3FQ60VH/KBiMEzKmhFE1n0WTbErmwWQ+fpJj6VdzJO7JkyrOh3+uPrT4YdIaUN9XRvV9ekcW5lNAJuA9WZpj4hL5JDPu4AsPcEB7OZHqIfpC3mWVNHGUJURWtmmG8e3i7o5DlOVnKi1+fP/x7WUBa0gqIocW1R4zLSbHoBhx8zZWcIr1nMbNdHFLvs23kjDfEmG+zXGPv61FoaZPN3rFKgkISRehYS8roP3vBY5iNP6Fv/yskGadrYtNUymFVxaSc3wt44FwREgv2oVvMKpny5H9mAoyMullVodzDkygSTqMb5iaRO1oTEMaPgl6i6xP3QKv8lrI7X/NwukTKeBJX0LChtMZUTkU3CGYwwXc6YuxOjr9WbNecE6jtrp4Wt/3Ah2t+eOvJamjSZ4pwTv798lp8C/O952d9X8lDZVH1XkOtzSZPvHwQzQPc/jMXKJ8QYmlnK0UVmwJI6oZuqKC5XSpyLgNSTiJJ3jFA5JRtsmJGR4j0j/z1OmlDcaLoVR2Z1MiDe3Pfe2syN1YG/pkHDg6YbBUGgFvPJNI+hl3chhMZ5k+/JJMWH06ejg1NNDpXxU+czI/I8dpMWVM7Hg8HS3G3J+jh1wjXbA+EU5J/Ns0pUVKOIz0QFpXbE1OOkiWcLqrDzJ8cDU6XSzFwqctNqU9wEpiameeki6iHVbAYjuIw4xg00NmH3UO77mA1delgtavhrqooudQR+tUSe6MgDKDiCkeo4y33YiEYzAmw2NY5O8nDQj4uQVEgkSTy40cRxxndU24ujZcm0Zcm1Zcj2Zcj3Zcg4b01JKb0ZSVSFub6+CTHCUhYfpNyaaePxFj0KwE/biw5/qn12wE38ZFWvSvktzMQIssZlpX+IfFhpQULaexVv7ejoR2LZJSiob9NzEX8ojxsygOxZ8yyVOdz6eYhiah0LM4lgpA5aHkTRgiMkkehAKezwM1NGbx3kp/agiKzRP2C1IaQDylF0xoJcn7CvR41Z0V4+SBOIt8pL/8+c+V3mQL3WnWDz7EUrxEmyzgLaI6oyC4n8+n2eW33+aQt8P4K/9xN4seWHpe3i1IxjP5/UvZ1bcnJ5vZYXx2lm4bip3TR6e/iwiQudi9fhiqlOTvZ5fBWfAvxGez8iP6moXaF73gX4M/y/jx2RltXvbXnn5kjqH/aS4SePKqIKC07sWyq+W8KJiEJYSU0lS6zdQ2XzraGu3vtXHCcivv2nv999wy3VpMthV3vuV3vGU1rDk7Jx88Jy+smx+ag19/i7L4bX6BQpQVtylUNdE6TN79VUQ5WRxaqPjeVEHFp576p7tN7S/XxmB2VahXNl9XNltXM1dXM1NXME9bzNJllaWT9S+D3/OP/3CpGOt9OM703Sx+SL/GlgyeaG659I1pzEHL/Ha3bBpNzk9K1iBRj6PyZNDeWGP5N4W++6sIVysDl/P/oibKyMPOVeVOSK/KW12J2uiTYuJGLrc5lbt0enWFHLB3Zpb/3c2mg7D6smqgWNvu9KxQER9U2lK9WseQjXyvZ6Lu0iwqmD2Ja6LiWTJ6knf2cAkua9pI/Sq+48i8yMAb93BpfooW8/vK5bcy0yd7lUW9ZV2mS5TyzJL64KKotJGScmIvheCSONITpNTjcRoNT3kOqTAFFhMapLpfj78iynPVvMhEUxOjkzxzOA8eFlL4s2A0Sx8EGWgBo9soE1Vw5HXRyoxjo/EsXUyGL+ezZNoPtDUzSmbxS3rHS1IXpNf+SnrpNmMWExkarqEx1OqL4Cbk8XHpiziGMeAL1kJqWlQwz0M9MFEgI+9RI9E3Z8FjVVTgXBSNWpb5fEmm/F1Cqv1xkr++NLViJV+clLeJS178GfWYjnQ+5SH6wgpaX2ulT53we9toGn+VDDVXdBLJO06X8ZKL0T6apJXJnIm4gOs+fugHr/VmJa6QU5PVd6c9CnHMKmsrkmHRQL6frQbVwjq+JDNaLiaTeMA6fZawq8vXsJ3LIZIXShOhoaUkoQ/JP/W9XFwXFZnj15yTcYEYMeA4JZ4aJWMaZ89O80+cwpL0CcUtbqGSSOFM50LJl47lN9OVXhlPkmj8Mh29VNtxEM3FZvmVtA9nIuXNkIJ+MnuZla/vUhfuyfdkvH0TCRO2AzW9M2rt4B7bkRTVqiz15Q0oL9m7sD5kO0hRUgLGjYS5ccxLxHds8oYt1oeIpRf6T62kv42pXRwKEjHlzww2YoVy3jvTF6GZPK84m1sJNcDBFJMD9RmukPgolPcnGs310M1Rx6XmcxVgkYJRtc9e8JDSh7jyzmk0IzWYTPnpc7J7EzKfqQ8he/Uu9CV85TfTjq2rCYrVtminivIvc0KzXrMtvW25OddpebFxS+OlqxjIc1c871k76P8UzbKYS5c+kESQP2QZRl8/bK3u0F8Wk2k7zlXhupPWg1zW0xIXzuzylTW3bIgZO0jGKC5POhxGkwrZebju4qRT3aTj8ea5ilGSUZLOSEtfmRZJ/ul5Q5mvqg9qLGR31Qw1Gjf2VBsN6co0pbxKyCyVo5aCn2IJr4zf6w+y1VN4DOnsiu+utdUY/ceCbJys5VHBPrrGT7JD7/Kk1pu+dbWsPHxq8hpq8RqJt96jiieOIkM5435+vkD1YHleKQh9NWtZURjeTkYsLo6YNLs936zBA1KsavOAKocHWrwZl9tiuisLItAv3q6WryL/fLm8P0fM2HrMQou3Vao3ehqh4htZ7ab2IwZ2/7V3stLWuTsuJTxJeJLwJOFJbsCT1PvwnzhjE5cPT73gxhN1a7heAuEKklfIQe2MM9fqbEp+nbZiZKMXaQyIY0eMiqEdnfPiIvLgRnLqzYXIxN8SeR49uAHO7cE5tx1903pFh9oIBK8LkdYcPsx3KlFG/aeKA8i1/yITZ3uhOs+Z9Ri25y+2lqbBaM6y9Kz5UJ9TBLR2CXMuHzmOWHfUfYRSm/rzPUuiz+5otBeS1e3ij68+/Fv47k3IaBFNp2Nn5w5siSZi/vLnzwa8QW/l44SG+6GdqoMIVOxhpMLbS0dIY/VIxTKBCnGQRO8C+jYhxQQMFpOteoDQG0Co12+KjmhUINOzL85canwexziU4q+tsNQ6+muvMEgR2Kkry5IE6lNgDgJ6HGlrPRZXnHv7hX989ovjyG1Kx2XkWWtzn1o58tO2ETbvbJ674ZI7YvP+11zyvuru2LJDOtB+GkrYLzwP3Lijcw3bo/sJdTb97WQ+e5qmXLk7EhU2k5caVYB8hTlDtml0Bfar+BQ1BxyCO64RFl8ow74IBm6o8mHpGF7XkgPFD1blUIkw9oWyN0d2bv7RO6lIk25eBiox5UrgBSwi2mTnsawZvFHvuumXHMJ0MkpmD3l1lI43sAtBzuz9XAAu8BeijltYBMK/LrlyajH67gP3au9mW+9rHKo+VQhyOo4GoiwplIc8+/Jr4WxEvJ/VJdFOgAvnc46dxuMYbz44XXL2qnhlQzl8mmUJn4/NER7J2ZwFQ3HOfyh8Zz5vFE1M/Jng3ZtKX6I1V3CxxygiiBfB7WIua8GicZYGtPmTf159XVJFs1QLJJA+aH+j0QTSS5axMD1H/m0y4QqzaBjccafTae0UabqQMzKKxdiUpU9lRZwxo0wOOjh/ZNaJa7Pjyvr+XT8Q8ZvgZnZLs42/3tDkBvdRmgUP6eRLzEd8BdYGqYjgO4WaWZtflPFpaXkKV9jBtVPKlROsYh8rbRqisbMSUaiID6J463U6jPs///jqH6/eff/qb9+/tRhvpwabBGe/2/n1jzMhryOOi/b5sNFTurAUdZ7yeYMBC+qQ10gcpzZ6l5HlC1UCED2xnOqoi6Uzbp6J2kuW82zOB4YFebkk67TxDL+o6GTc1ongI0FaZkcd/XsSup/xTfumx2+V/T8p4VeyntSOoOsI8Y/vP8qz6AqtVjYgTqAdfrtL+kGO/Oz38sD/OMvDi+ZEC8iaU0tfSiD/qtXr2e82Komu17goeUtLJWR+DDx8SIbDcfxIXKdxLBaTMC+QnD8yGNo8zWFvdOKw4kuLfB61LFO/vWJwuc3WlgNzlBnaUkWVSsMy4IsNhpXY2uo2uENZVZ+7juCqnG5XCtTlqTY6qF7ep800ujL/8LUtG2tBKgTwSUB2mup24dGaYggrJijd9FXmn5cfVQLik6zVxFGNzNHIBktWFXRkuMoh73Wgrsh9ZjXklfp5RNfwOgN1ykJxg42JPKp4nBWsgQLphQv5IvhR5Wyi4dCVY5CnhGrZkaIPnVO5qW+zIZtd+QBuBBSJ7YzB3YTtTsZPSaXLoXz1QPvq/eC9TFoqils6cQ5f96EBRBWCzYA2s6xv6ei1yuwJw5mfkoc779NMGdPyz/iBJOhrXArBWvsT1n/ywFl1mZ0REipYKYsnKrtmWs6MAkg7/RPJ8F8t/WWcEpJukQAXPuM+xwxIHkvCiQIAsq1trF2c+7yjpVnccrxGIb+85GNfZF6n3yZZRoL/7X//8//8i22Xs+gakX7Od7+CIBy9b9//yjqs0t6ZI6kJhfylT8IlvBf3NlkLBV2pprUvgn/JR2XyFIuV4Pbm+FOhSKNhKBAHIzah9J5FtE9nw2QSkT8bVp656AhM0HNE5VpkUv5wQbB0tOuXOy2+iRPjnqfGGzW17wlG+a6fxLsEPnHexnivmIzCeCrwnUQm3abKVFWITAubJ8/MLrmiRh0n0gexLH1Jl4Nasv0jfWLZvwiz6UDCMOWqiNsnNtGjxXhuO0LH+XaL8mAOk/9RauMv/+1//r//jwxKZDT2uB58UP3J/KtIvfLhOIlPpesjlBPEFSuqWiOLRpb18zmweVYc2MxX598nZ8uffDzvLX3kVJ7V/KXp/Gf5ENxnr3jti+A6fimltsyEvP53SoYkEf5Ub+w4MHkpWwoAMYsw6Sov6+oWI5AhoHKVQ45UFv8WDxbiWOrXJLJicpET/mvmI7fWY4FaOnPgOYeVcAHr4DCtg2VzRyvkj8zyq123GvKPRYDUfRhW+68iK6FGcq5+9i7dcO8i3NOrFXWHwqdeBY34Wrx7G2jEosmKYMRtnVdjVzXHdD8hhiurvFyBwNEiDJd4Y18BhsXP58QXzqOOaw0UAZ4X8LyA5xU/gc67NnReqSwBzgtw3n0F561xMLB5bb3tAzbv2pTROhWS25cFNC+gedeuHz115Eb0pO3QCpB5gcy7p8i8muMBzBsAmHfjwLy5fgUu71JZ7YPF5fVTQ4DlBSzvscDy5qpyA6i80yjL9hdotzFJuWzicIXk5k7D7DoymTuMsisZH9BIgEYCNBKgkerFATsDAGKm2byBSjUyRn6mth0ywxsuw5XU90fK8EDJaDyj1OuCdSL1wOawTgpskoLqFlRQWb3jLA2pYoG2F8/sCBSo13EvG6Jno331zeqm1l7ieZarfg4eztOmSraK5lmi926DecJghcEKgxUGK7A8geUJLE+TOYDlCSzPvcDy9HXlAeW57thEt/iEZ4yiNU7hYOcakqfIQhwRlGdDcEONzHTpAeQJIE8AebZH3vYGyHMjmdW1w3g6UppA8axv5kDxBIqnMTugeALFEyieQPH0R/F07LW2zNeeg3g2uD6tKblOfqfNLgKGZyOGZ1PwwDcr6Sjec5N3RQjPBn4CgicQPIHgCYyu6hYHBE8geALBs/wuIHgCwRMInkZ7IHjCOgCCJxA8HQieH+L5q+GvssRrFSBPRxHvBoA8zRGviOeZI3AaXaos8MGBeNoXerkKgaPF8izz3n5DeppzeU5kzwYhPD/pVF/hUaMhyy/yuhLxZ/0pEr1xymfJh+FiyixkNKl91TllCYBSAJQCoLQLQKmpGoBTujac0tIOALhSwJXuK1ypi5GBWmrrbR9QS9etmtapntxuPMBLAV66dm3pqTE3qTVth3WAYQoM0z3FMK0wPqBMA0CZbhzKtKptgWi6VJb/YBFNOyklAJsC2PRYgE2rihP4ppUcrk8Kd8W06goZ4J1GO7Xl8/YC9LQkFICSApQUoKQAJWVRAr5QUnqh/wTcpuPDbWrCVbTtkOe9dcA/eR1L2xnEH0sK2hvDdy9wfzYL59NSbNRo9Gwb1ccbAWll+J+LZfB/CkSbEs6wd33fjsANrwxbo3SGBsZpxyn28ZO+WZvLtJeoxdb6xoMHL25QTlvFMHbstTsMZQw3FG4o3FC4oUA0hmcMRGMgGgPReF8RjTvGNwBsfAyRkKPHN24PquQDrIUCgHYMtGOgHbcXzu8N2vEW6izWjn3cXOAACOT6tg8IZEAgG7MDBDIgkAGBDAhkfwjk5i3XlkbbcyTkdiepNc3XyVG1GUsARG4ERPYIOqyY6XRTeUVc5HbuAjwy4JEBjwwAxOq+B3hkwCMDHrn8LsAjAx4Z8MhGe8AjwzoAPDLgkR3wyB+LVVwXUrLR5Z7BJS8Z8joQAOVWVliuGgFYygeApezgjeeEVc4jmmsNPAGPGHjEwCN2iDugidcGTexSqEApBkrxvqIUe/A0AIttve0DYPEGFdY6lZbbxwZ2MbCL165DPfXolnSp7YQOYIwBY7ynMMZuGQCicQBE440jGjfoYIAbL5WjP1hw42VVFXCOgXN8LDjHDeoUkMeVvGzHtOwW0I+bsrqAQN4EBLJLXgBDBRgqwFABhsqiBICGrHoA5hPQkHM5XAItqDkB7g+MLComTR50lUn6z3xzOEPPCBrkX1/UaDsdEH6QRnqxIQg5DqwuVcG322jJOd5NYzHBchhARYViw2xNcreABfU8zopaNZ8Ny7mjAwhY5yOEdfZTmkB4tq0WvGx42fCy4WVv0ssG2DMcf4A9A+wZYM/7E74B7jNCOMcFAd0paKQPW9rbABi6tMIAhgYwdHN4cE+AobdbjQKMaGBEAyMaGNHGJgeMaGBEAyMaGNG7ixHdyYtqTR92cmptdhPgohvhorvFKnwzqE0l0iVf9bfBeJHR+yx3ZNtXZkWI6U7MCbRpoE0DbRp4ktUdFGjTQJsG2nT5XUCbBto00KaN9kCbhnUAtGmgTTvRpp8+pq91Av11NWjQHWv6WoxljTDTEmCon4NjxA/T+ZNo85Z/WxZZuqXbA8SSblzo5YoaDh1JuoVJ9hc72sILQI4GcjSQow8ROdoi7MCNXiNutE2ZAjUaqNH7ixrdwtHAjLb1th+Y0RtSVutUWG4/GYjRQIxeu/701KFb0aO2Qz7AiwZe9N7iRdslAGjRAdCit4AW7dC/wIpeKsN+wFjRy6gpIEUDKfp4kKIdqhQ40ZWMaqeEavck5wop2F3AhPbOuu40CrRNFoBOBXQqoFMBnapeyLBDGCzuTKA3gK7GJskPIbeDlnQALPGrS/CHKvGAKWk8zdXrgj4j9cTm0GcKtJhiFS7qYCeyMqkDRG3XwqAdAaj1OihnR3LtYKJ9s4q1tsvQrW21TUcA1tqubTYB1dpC+F0HZ4XxC+MXxi+MX0CzApoV0KyAZgU0q7VqY5+gWZcLCwCYddNxjm6xDs94R2vMw8HugGX1D5TkoKyWFoBkLa0uIFkBydoU1dsjSNaNJn6XDQt6Z1yBulrf/4G6CtRVY3ZAXQXqKlBXgbpaQ1313mRt6bS9x1n1dota836dfFSbZQSU1RaUVf/Ag2/q01Ft6Cb3ytCp3vwG4FQApwI4FdBo1S0RwKkATgVwavldAE4FcCqAU432AE6FdQDgVACnegGnvv1NRqMAoHokAKrOBV+uDAFAqu657A2QaoUnAKgKQFUAqh46oGpF6AGsuiFg1apyBcAqAFYPA2C1gbMBtGrrbf+AVjegvNapwNz+NQBXAbi6dn3qqVO3qldtR3gAvArg1YMAXq1LAgBYAwCwbhmA1aKPAcS6VMb+SIBYu6otALICkPU4AVktqhXArJWM7VIJWwC07j1Aa1U2gFUFrCpgVQGrql4osaOILPYM4w4CtrbXPwC4dWPArV0Kkg4LwNXTlAOQ63EAuTZrIQC6wliGsQxjGcYygF0B7ApgVwC7Ati19SiFxUnZP2DX7mEEALxuKy7SLTbiGR9pjZE42B9Ar90DK1bA10pLAL+WVhvArwB+bYoG7inw68YSywCABQAsAGABAAsAWADAAgAWALA7CgDr5S615g07+bA2CwlAsB2AYP0CFPsBCOvFfwCGBTAsgGEB/VbdKgEMC2BYAMOW3wVgWADDAhjWaA9gWFgHAIYFMKwLGJYcy+/Tyd31YsJ6+7t4PrjfKTxYZxPbyK+rnjJAYk0jtAYS27j4y1UuABvWPZddxoa1sAIgYQEJC0jYA4SEtcg6kGDXhwRrU6UAgAUA7N4CwLYwNHBfbb3tBe7rhlTVOtWV22sG3CvgXteuPT016Da0qO08D1BegfK6ryivdgEAuGsAcNfNg7s6tC8wXZdKth8upusySgpQroByPRooV4ciBYJrJbXaJbO6pmwn0FyfH83VJh7ApQIuFXCpgEtVr2jYHfQVd05wN7Bb/eoTANm6TsjWruVBe4/U2sFk+2bt1htQW3cZtbVd/wCsFbYwbGHYwrCFgdEKjFZgtAKjFRitriMNFvdkLzBal4sSAJp1w2GPbqEPz/BHawjEwexAZPWOm+jDTO7wAPBXgb8K/NX2GN/+4K9uPy0MLFZgsQKLFViswGIFFiuwWIHFujtYrN6OUmsSsJPTajOMAMHaDMHqH4jYWeRVb24D4CoAVwG4Cki16n4IwFUArgJwtfwuAK4CcBWAq0Z7AK7COgDgKgBX/QBXP1XKHbojrjrKiZdHXPW+468buKqjhkQOX+WRDx1h9ZOjuKVbKQIgVt1z2R+IVckLz4mx6iOR5yedyjU8Sj5kNUdepiL+rD9FcjhO+Zj9MFxMmY2MJrWvOqc6gRkLzFhgxq6AGSt1BEBjNwUaqzYHoMYCNfZAUGPrHA3YWFtvewgbuz5ltU6F5Xb+gRsL3Ni1609PHboVPWo7ZATgWADHHgZwbC4BQI4NgBy7beTYQv8COnapsoFjgY71VFPAjgV27JFixxaqFOCxlTRxpyxx98ztCnllAMVuBChWyQLQsYCOBXQsoGNZlIAvOpZe6D8Biur4oKi8ICNtDTtiWHkdgNtV2KJS8tob3XgvYIu2ikbkrGBqtIC2DUfkjeS0Mm7RxTLARQXYThP2skfh4I6AL68MraPUiQbv6Yza3OwrfbOK2wSE5v1BaLYqJ0A0wwuFFwovFF4oMJrhGAOjGRjNwGh2nomyOCV7iNHsHewASPNRhUWA0uwfYbHDNMsWwGmunOwDTjNwmt319/uK07zuCgxgMgOTGZjMwGQGJjMwmYHJDEzmXcVkbnKLWvN+nXxUm2UEUOYuoMyNgYcVU59ucq8XlbmJ3wDLDFhmwDIDeLG6JQKWGbDMgGUuvwuwzIBlBiyz0R6wzLAOAMsMWGYHLPPf4/mne+JL4ZWvAsfsuNVoeThmdxNzyLVLP7uBM7eN6+CAmR3rvVzVwaEDMrdxx74iMpeY4DmRmPM45VqDR0AuBnIxkItLQg7E4rUhFpeVJ5CKgVS8r0jFTk4GQrGtt31AKF67clqngnL7v0AmBjLx2vWlp87cqN60HakBIjEQifcUkbjK+UAiDoBEvHEk4pq+BQLxUhnyg0Ug7qaWgDwM5OFjQR6uqU4gDlcyoF4J0FWTkiskUHcBd9g/S7rDwMNlUQDUE6CeAPUEqKd64cHOAJrYEnjeqK0a4iM/7tuO/eGN+9FWPuCP9eGB89F4fqrXBbxF6oXNgbcUYCsF9S3QqLJiyFmGUgVE9S/Y2REgVK8jaTY8Uy9L7Jv1GWW7jGraWnl08LCmTUpmE3CmbRTfbTxTGLcwbmHcwrgFjilwTIFjChxT4JjuLY5pV7cf+KWbimN0i2V4xjNaYxoO9j563FKPQIgaoc3tB04pcEqBU9oerdsbnNKt5G2XDvd5J0wBV1rf7gFXCrhSY3aAKwVcKeBKAVdagyv132VtebI9xyv1cIdaE3mdfFKbTQSc0kacUp8Ag28u01Ee6CbzivikHvwFXFLgkgKXFMhj1a0PuKTAJQUuafldwCUFLilwSY32wCWFdQBcUuCSOnBJOXD3iV6Z77A7hU3qfd1dNzRS7/t3DgSMtGGRlysnOHRA0hYG2Vc80hofAJMUmKTAJD08TNKaoAOXdG24pHUlCmxSYJPuKzZpIzcDn9TW2z7gk25ESa1TUbl9YWCUAqN07XrTU3duXH/ajswApxQ4pXuKU2rjfmCVBsAq3ThWqVXvAq90qcz5weKVdldPwCwFZumxYJZaVShwSysZUu8Eafek5Z6jlXpnUXcYrLQuA8B0AqYTMJ2A6VQvTNgZ5BJXdm8nQEt9agwAXLpG4NJuxT37Dl7qbY59s4pltsuQpW21SQePWNqmYTaBWtpC9N0GLYWRCyMXRi6MXACXArgUwKUALgVwabDPwKXLuP8AL91kPKNbTMMzrtEa23Cw+dEDmHoGRPRprerTADItrSqATAFk2hS52xsg0w0mcpcN/XlnUIFeWt/vgV4K9FJjdkAvBXop0EuBXlpDL/XeZG0psz0HL/V0hVrzep18UptVBADTRgBT3yDDroKYevIZgEwBZAogU0CVVbdBAJkCyBRApuV3AcgUQKYAMjXaA8gU1gGATAFk2gJkWjuuChjTQ4MxbQTjAYip+nfoIKaKCwBhCghTQJgeLoSpYk8AmK4dwFQrUMCXAr503+FLLby8YfBS0xVdHsHU2dp8incpDYEpwa3ybIzE9PLHQf0UG1txGVZTRSAeRKUWn4JwdCGOoIhATTSRyRU2DPRhKBKEogd6wtHJjVqwGxkDTudFiYM6Q3MrS4Na2+vQpnifAO+bFDChc3swSfahXqSpoE4c0lzSx0zAgH2Nx+lU1Ks5esiY5Z9krus+rsGUpuqo4I20wW8cvYxYBmeRqpmj4dNUNLIhb70i2DFTwThHHyJEJyES2e0ujihqU0vwkQvONo9IsOmggHnXhVb7k7GhFBLNq1sh15qEvDk+8SK4ZioKa9fgNtJ/JrG0oenmP7XCM2K6saxwfExUBdwjn/IrunaqUTF5NtM0opw8TjZ9GtJGkgyCVz+9C0SkjjccRy9Rjm2Zjurz+athtp+5pECZ0iJoLvHzpCJoQss1lZN7/Us66qIVb1U/rnH27AaC0jwWa1DqdIBP7w749BoNzHUamU3aAdDTgJ5es83rafdu2Pa1HXkE8DSAp/cceLrgfcBOB4Cd3hrstKFzATq9VJXTwYNO+6omQE4DcvrYIKcN9QnA6Uoli2chC+Cm9xhuWvM/cPiAwwccPuDw1QvIdg5tqlyHsVNQ0+5KMABNbwBo2qf88lBgpluMMIBMHzrItF23AGIahi0MWxi2MGx9DVvjvBsApgEwXT4LAoBpAEw3lrYAYHq3XX7AS28uhtEtjuEZy2iNZzhYHODSPkGQCrS0ehbA0qUVBbA0gKWbYnV7Byy99oQtYKUBKw1YacBKA1YasNKAlQas9M7BSrceTQKotM3b3DKodHNoYdchpRt5DIDSAJQGoDQgIx2ABgCUBqA0AKXVuwAoDUBpAEob7QEoDesAgNIAlHYASn9KZ19G4/RxFSRp3UfNbd40NLQTpFqP6FrFPhpAomtFS5wLkOaSAhkVwk+GrRYoPoZqdclfsEt6lskQ8UxqZJaaxYNUwLStq0LVbDGLbeHzmzCvAAlDjd9UwdVRYlivF8kb9mkX550xq0tjUysSyvPy971Vsazr3NW5dKE7OvVG4aa9WW5fgaf1PIA4DcRpIE4fHuK0lm9ATa8NajpXmcCYBsb0vmJM25gY4NIWugNcuugD4NKVaMuugkv7SXdzkAKo0jU5Bqr0cjobqNLbsCXXaU82qQXASQNOes3mraeJuykz13ayETjSwJHeUxxpg+kBIB0AQHrjANKmlgVy9FLlTAeLHO2tjAAZDcjoY4GMNhXmBrCi29L+7ND3LOjSTuTAtrKRg4UM9M//Hzx4oKNSYBOogd5U3238wJxiAA4EcCCAAwEcaFECAA4EcGCllg/AgQAObExiADhwm8CBlQo6IAZuAjGwoQzZNLEBFfjcUIHNJf5qcIWbBnBAYw0BDghwwKbyir0BB2wLB24PFXCJI2HAB6zv6sAHBD6gMTvgAwIfEPiAwAes4QMusd3aMmKbRApkpZOn011n1oMHDtfxxqmDTn9ymcetsINOD74VcbDZl/LC3vOCGFwa2812RhfgbwB/s2WoAP4G8DeAvwH8DeBvAH8TVZMAfwP4G8DfAP4G8DenItky+NubaEJqO11k3yXxeJithAFnr+aUl6+7wwQqP2jJFDibVAZ9XXV0u0HI6aR+pVeVAmzAjeONYxiq+eleRDVtAbZT5DlVSjfJwmSSzJNoLFtenZeLx0TYWRItC29jHnieLxZHc1cFZHOu+HJ54iuDCuuCb7Okjz+mkorm2+QAeptFe2u7IH5PMd4qXPCcUG/N8nd+0imv7pGbl2n3vJ5A/Fl/iqRunPJxlGG4mDLrGE1qX3VOVQG0DqB1AK3rAlpX0Q7Arlsbdl11KwCEHSDs9hXCroGXN4xkB0CkjsrpWRXUOpWU260HLhJwkdauMz315oZ1p+38BuCRAI+0p/BIdd4HSlIAlKSNoyRZdC7AkpZK/x8sWFJX1QTMJGAmHQtmkkV9bgA6SQIhOWqxdWI2L7rOppFRSC2MQKIMR+7Jjr2xxvtvCqX2VxHSVnatLisyESnmutCUXpW3kkdOT4q5GClezwzv6lnXFXLE3glb57kwR/m467iYjjwbaWDve+6fHVSoduI5RxeqygNAhgAyBJAhgAxZlIAvyJBe6D8B0ef4EH1oaC3b4nlvHVBAXoeLdgb9xZ6KbgKBKZdR7gMGzGahXdqrjxrtnW0jvHgD4qwMBXOxDBZMgWti6pFOhX4NBX6NZLR/uWTpWG91/BKlPDRCSlmJ2FBsPb2jb9bpKO0yuG1buePBQ9o2q6ZNINu277A7jGcLjxMeJzxOeJyAtYUTDFhbwNoC1naPYW27BzaAbnskIZCjB7n1iqaoMdoDAIC8BeQtIG/bK+f3BvJ2a5UVywb/vEsagH9b3/eBfwv8W2N2wL8F/i3wb4F/W8O/9d5kbUmzTaLeEju3AtVeNiaFW9FqvZyi1rxeJ9/UZhO1ANi6D2g2AtkalPBJXXaa6kZTmd1SmmtKbboJXcYNa/atSphVktm8eKyRXRoZY8lahY4s2ANEMiCSbdlOQCQDIhkQyYBIBkQyIJLFIUlAJAMiGRDJgEgGRLJTkWwZIvkDlwVek+zPsuRr/IPcvvYDKNk69DXBJVv7PlTQ5BYeWK764NChk7uypexoXxGVrZPaBVzlJkEFujLQlYGuDHRlq44AxvLaMJbtmwOQloG0vK9Iy60cDbxlW2/7gLe8MWW1ToXljhQAdRmoy2vXn546dCt61HbICNjLwF7eU+xllwQAgTkAAvPGEZid+hc4zEvVGBwsDvNyagpozEBjPhY0ZqcqBSZzJafcKaW8rjTvnuMzL5dN3AvYZrvgAEoLUFqA0gKUlkUJALxZ9QDcqkbw5uX2zGPEdG5KgAPZ2R/WyLcKqtEwAr5z6Z8D37l7TeLRojx38re+Wb/rtcuIz0tWaR48ELSPJtsEHPTSe/YOo0TDwYWDCwcXDi6wouFzAysaWNHAinaUce0PVvSyARMgRh9VaOXocaM7RGn0SBtCCsCQBoY0MKTbzwHsDYb0s1SCLB1aXLEEAzDTdWMBMNOAmTZmB5hpwEwDZhow0zWY6VX3Xlumbs/Rpzu4Vq0pxU5+rs2OAgZ1IwZ1l+DFriJRd+A34FEDjxp41ECcrG6JwKMGHjXwqMvvAh418KiBR220Bx41rAPgUQOP2oFHfU1N1wlHfS2Gsg04atvIV0Sj7viualTsQOCpm1liuRqHo0WnbuKcfQWnts3pObGp82jnWkNQwHIGljOwnG2yDijntUE5W1UpkJyB5LyvSM5tDA0gZ1tv+wDkvClVtU515fawgeMMHOe1a09PDboNLWo7/wMYZ8A47ymMs0MAgOIcAMV54yjOLu0LEOelEvMHC+K8lJIChjMwnI8Fw9mlSAHhXEnDdsnCrikzukIyd6cBnP1StTuM32wVGqBbAd0K6FZAt6pXP+wMhktDptAb81aDm+Rnl9tRT7wRTzyrFvzBTjyAThoPf/W6oNdILbE59JoCbaZYBAu+rKxlclbGVFFlO5cS7QiorNexOhs2bBdD7pu123R7iQzbWCF18MCwHlppq7iwTaux27CwsJthN8Nuht0MVFigwgIVFqiwQIW1V4XsDyrskhEFgMJuOETSLUziGSppDZc4mP3oMWH9YyxqoA2hBCDCAhEWiLDt8cC9QYR9hsTy2vFg/TK6gIOtmwmAgwUcrDE7wMECDhZwsICD9YeD9dt6bem5PUeD9XeqWtOInRxcmxEFMNhGMNgOQQvfTKqj7tFN7RWxYP25DVCwgIIFFCzA3qr7IaBgAQULKNjyuwAFCyhYQMEa7QEFC+sAULCAgnVAwb7WifFXk2GnmwR9SrM/FiyyDXDY1rlsCinW48UHChvbgX2Wq4k4WgxZb57aV0DZ1gkCXRboskCXPTx02VbBB9Ts2qBm25UscGeBO7uvuLOduBsgtLbe9gGEditKbJ2KzO3oA5EWiLRr16ueunXr+tV2EAnwtICn3VN4Wh9pAFZtAKzajWPVeullANcuVUZwsMC1q6svoNgCxfZYUGy9VCwgbSvp5KWzyZtI7q6aod5pxNslUs47DH/bLm3A9AKmFzC9gOllUQK+mF56of8EAK3jA9Bqgr/03kvPe+sA5/I6rbczeEy+2XpvuGdZRWqyqKt01J8Gm8NyekZgpmUKpBrNrQNCadL4OTacJhcu9Wq1ijsCUu2oy8zxhBprIJbDWCpqMRtmaxK+BYypt07s7aU9zm8263zuJSq3f83pwUN0d1W+W8Xr7mKw7DB4N7x+eP3w+uH1b9TrB5I3AhFA8gaSN5C89zFyBFhvRI+OFeN7yXiVGrVvyALo30D/Bvq3T4xyT9C/d6oGZ+244EvUvQAkvG50ACQcIOHG7AASDpBwgIQDJNwfJHyJfdiWLdxzxPAlXbTWFGcn39lmawE+vBE+fNngiG+Wt6msvOQI/zYYL/i1ImCxBdDxJRkWCORAIAcCOTBGq/srEMiBQA4E8vK7gEAOBHIgkBvtgUAO6wAI5EAgNxDIRUzKWe/gLNQ3ih8uOQu4Wrk9v7lDIIof77+i/3y2pMwcveSXb4vHOGaRWQ55Nw9Bfczahm2vX35pflceHfn8+aLS8yteB9EHD+DzZ6OK//T09FosFuNB6RCjgJsSZZZ6kaJ8I2EFeZdwaa9cFCOmec36OAtufopnD6QhqMWbeJLEQ8aYJT1E2vGVXvNZIJznOON4+q3KZ1SBvMtB3X/GBkYtDdusXU6LhwIdRpVZ0gvedTgQT3ZS/s1DdJcMZNFrKU6uOeY2JkGayZJ2rosL89hsKJrKb8LQyvTlkIzSXDIIE5WmX4/fFHHbQjgUMLzv2gu+qitS2rREvC5XzXopiyEVBe1RcFO6E++mBjM8jKe0MUl85rTYNHkP11qv1KYo3aKlcMcMdbzw3AGC+Pc4z7wG2UKytERZFtGaErP2myKSpMumTyK9KVdSnn5QaSGujS11dd7zKVvaeBxTxTANXegEPF/lzkNRMKXD9a4X5MdB6IfNEv17PK+wF2PhJZl1YUrEDvVzldC7wagdKuUaidWtgOvK/yqC1lIirv8g7hsUSTULoUSGut+e7ljqZgI33e0z/GVZjND3Xy6WhxflEZKWYcmMh0v3U92P7B199gsus9zm+I5WC5r2U6mlacurxgNoY53O0q/s0T6ks9iuLUs1ojONoq7dxao4sNf4kIqsVPhH3/2M8ixPHYGefF7nDigwY+/Oc6V6eH+cORHE5K7IFQ8TiVCkSy/O5FDtTGgM2N21CD/JAw1nvxuSTk2I1K5WNzZ9e15UCOSVKn3OLPduLPDR0uuNT+yXKuTyq/b4G07x3FzoGweCmxKC2I3cHONERL2jSpcWW0pGe861SUXb740okL3pBTJadlORm+r2banFINunClVt1w3t0t6z5mNX77kyqTWA6Jf6k2dmSDy9OWld3OSqMVwdwbmLftcgaQ6h+T/pQkQ1yva48BOYbtsVv1qZZT6i2nHxpiOqTm9zGZ9Szt9wTj0cPKuPWXLN/lGc2JU+iToRyMEU2+Hdwqky3TLl33Ev56kaQy+4MZlKv/4mSG9/JSWdN6bdargYyALG4kRi8cKR8Snf3XIb6y8d3hq1kLuTaXmXHaLLE0c1x3J+mdM3255nYlJtcAzuyTN4JsT3i/G84jWUmazvPqveyR8Q7a9sXOlTyVHeDuWw17T9WTYNqV66wf6rMbWCycvn+hp5nNi9CHC106GoOKJOajpdiurJi4Z/wWt5Z9SH+eI2C5qePFHVjFmcAw/N4nH8NVLl9zpYHg04tSlhTq8F+QKNnhp84ETWyQv9AZ89L4f509GclaDuapylqiSU4Zj5lXfxRAThhwIAVZzhfxDPkbI+GYzJXwvCPKCzuD23nZGhmfb5S32GqXR2TVrMq4q2EakVlwyGocee6YMGonFA/tPyEH0uFHn/rfrFfm8kGwaXzdO7NmvMTdl0BtFoz64EZ03szE8SBDpnCB1BE9kssWcxdKvOWcrc0VlW2q8vxPFGzgw9cEW/0bk4zJtxKVYyfxI4t3nh9kt+A22pAl+bv+Gz+QJCYfKkmVDfEqCDb5XD/brsncu5ZzHH6xJit37wTl75daHcla/xOJ2KhBdLI4f01JF/mQjmWueXeqM1j4vzqT8W+pTU6iwZ6uQXw1DEElf2N54PKWOTGPbD7+80+ZRLU2EDcp/u00dOejE4cBbcmAt7w3eqiHdm5GCKnXI8fjKPpT9VZqqjn9PFTAAM82F/CXRBn2aSniYGilhULpHuUL6q2/RluvDdm1oBa3kjyGtP/YWjZ0EwV6sgUuo1KkpMDnn5Q4WEtD+OK5fAlc2tPFZhfuy4VpBjzcwY8s/6MKr8oTKu794QP93GJAiViEhOTGMY+WfFEZLaRU5mO58lstx+WjovUJx4bTj2YvgnAvb6nIMZVUUqRnfPZz3G1Ws0+5XPy717379ZnDp1nL2pmDr+7FhV6Kqgob73m5xy5TaT8nW4yn9zYH+8Yh+dGUxSqMDsUPowkywnjlVwtkOULdylGgGHC2CM3kSJ2AVXvUhNK1PuXIeS4ymoF0mlds+qlq9fGszSjHd4UxvKrfmksra6WjqsrGmf3pJ/pgo0K1FaBV5X294vipW1oEgps5c3dr1kqnpfoZkIG6IBY0qeySifKRfWiBptL7dV8hwnm8HiEdN60QaKjx3hYzyU/AKrCeFAHfvPbjDgLV2nsy+jcfq4minzzXNbNT4pg1wB/OLtrQX+UHTdaug7LEmX/dOoq2rR1E1eYaui9VCDPX0uWElQbsloEKLLamhLPNh6oldDcoifTbeg63qUDhaOZJm/k7r4QTUu89vynFrZ5zqMyWjVf1f83gVgX5GqeohpzfETY+HEztXaqXzM3aVS1UbPKjVyFcibt89OzKAe7Tn6SGp+Qa/JJPpe9JPG0yA9W+0Cb+LVC21qCC7iobYglQ2KpaCWKwTlwntp2xQlJeutS9Sqf72YRLMnxzEeiXXn/FLymAyJ+fGjBUzGhsAjftZQdqqyfqV/qT/iabnJiBwt5aXrvJJpUdJzzsqkXvMhJm574nCcFEN13ypq7tPPqnTW0CKBMtjyy76zxazplLfANkzY/RfFMGzPcrhnTG/VoH6zxbhaV2oKhnICCnypKlaTRVCu2gWn2KTEa1rO5Vdl7cpH8JyxXw2Q1YTkw+UTLZLmwbfGyl0Zv9tq2cVpIo0BKEI4N6Ys3cjTDRotst8seHXfR4iG6ax9iZ/cUmIwXFM1q4F+KLycgt9ERpqTv/1o/Bg9ZRpfNBlZC4QvVCX2Q/yQJv+01IObKHe0l8pOL5tOjhaCeu6GtakQpHGypX7rUv2ohJms1nk4jqNsHqYT15Gf85YLai+tpzPMcxcNHaSz5I4Lz8kjTBhsisvt81Cv/CyZtPSRB776U3aA59xaAcA+fpsKnAruqNd4D6yI6nEvwpG9qRD7xn077Ojs97Ih8kf/d20//BGc/87AO5Xeen/0zpqu/f3x/ce3l8VtZffiQlJOD9789PY6/PT++t+++/79p5uGHjSEAsc7OWiXE0XcUBZzSlMesWjoQ8RXNa7lbRzTMkQyVTkT5L7VwKgNfSxEQqC+MP0OsIMFs5qz9wUGLGyYxrSU2GDtCatVLIzeSaOkVx2Tj7Onj2l+3Ph1NaPa4qhYW8NxMRwXefVwP78ik56dP4l1fMu/HYbHYmWDdg+miXuO0aOx0uO5PJwWxvV0baxTgqsDVweuDlwduDpwdeDqwNXpbGq0+DhNHk4lp7Skp1PpBR7PcXs8FXbo6vnYuQkekDMjv/+eUGVq8IjgEcEjgkcEjwgeETwieEQb9ohIZX+fTu6uFxM+d/tdPB/c+ztClsbwf47O/7FwgYfb4+ado/R2LOTYcyfHMiP4NvBt4NvAt4FvA98Gvg18m3X7NtWTNvH80306jj+Uz+i1nbgxW8Gd8T55E88O5MyNuf4eZ28s7HKUZ3BMOuzmWRzb3c/2UzjmXOC0wGmB0wKnBU4LnBY4LXBautsYnTIyfDkrI1fl1xd5Oy61lnBeji0XU2OBdv/FxTXH6MPUaLHfKZjadODKwJWBKwNXBq4MXBm4MnBlNltbps2PGmq1px+j2sGLOVYvRjGAvw9T5phj9mCclv4++i9qMvBe4L3Ae4H3Au8F3gu8F3gva68eqzowjJF9zVd8ZMnX+Ad5V463F2NrDFfGp5rMTrlDgnW2zbDdy2ngqGN0dWzk2Lm6syZe9vSCbF3AFYIrBFcIrhBcIbhCcIXgCq3J/mh3kEoXSMmbgTZ+gRSuelrtqidcy2S9lqnsBr3mmw/9vXv5eM2f36DPvMvhgmZ/XtOq6sE73NwSaX0dW4u1bblvscHyrlrda7xju6N9XrLNVw8/lDtX1vyZJHJll89t+brL62HGt5jwXua71QGWY625vO1WuGcYY83Xqa97yfiffb06BEtk+02ER5x+n1d8pKwbPCMiDoZYzpdktrmq/G2hk2kgmo+XTceKb2X6QPKqVQe1pA92VXfLlu1w+0Gei0BaJPSQd8DnOC5FXOrWQg/dtUa9tW6dpS4uvDhZ5iBx/TI/32sOrcaBxfFyqTVnxHf1G/863vbXosN8LGC7aK9NrFtF+gNNbfhrTH7HV3+72mwE69pHf5Qp5mljW8gMS3szlrZJ6v2wt80RH7fV3bB2HTY0s5fds8Bt+sPTDm9kFFjj+2SN4yrAJevs99xOt1/Xt5Td7nFl3bKX/W3Jru9UULbiHXcHYODjNh0oDcuNN2tQHo23vax6b86eKhOfa2IOQakcLSD9cakQG2j8cpqjFTl9ScT5/dETvkjrh6ceZAXKsvpBtkaYcRn943etQ4nCiDBuJsJopfl+hBqtQz/umKPPai6/Pcruni0KuZGrRRxcgwDkHpcDHBFye0do9X0vDCihqy9XIOBGGu+Kyb4TBQNVfbwkJPkBWPfHiH16VG5/HZ90KQ3QgtO5DLLp3nj7fqCeB6QMjgU+7CgVgYb4WkkNWCWgOzTY3qmAJlysvVQAFQ3wJprcxbN0kX2XxONh5q0BKu0Q4FtjgM9OW4T2NhPaq1B7P4J6lUEfdziveQU7bHaVjvY8hNfGIwje7W/w7sM8ncVL42ZZW2ML9zoKYCed75mABsJjf9/Q4QAbzffklIBt6Ed+XMBjNbucG7B1t4MHCJq0ju9JAi9mglGwv0bB8WJprgPscs+jfVa8y6VCfu2gj0uCZT53JtAfqGk1kMj9jAtWcKcUQtFKyFPf7AMIFZCngDwF5Km1I09VHZKWmSwWybD/88/v3nzeCHYVvGaAVwG8CuBV8G0BXgXwKoBXAbwK4FUAr9qkmb4C/BWMdeBfAf8K+FfAvzpgg96IWy5lCDjawybYYZugec1gHmzq8Lqd7HtyfN0++CM/wO61op2woawdHpQp4ctJsCr22aoAqCZANVfBxQOoJkA1l1AWANXcO6UBUM2tKBOAagYA1QSoJkA1AaoJUM3n1z+bC26uAZYToU3gcgKXE7icq3INQph7XOkIXE7gcgKXE7icwOUELidwOYHLCVxO4HIClxO4nF4aALicuxwjXA3ZE9FBQHsC2nO5WCCgPRH/A7QnrIDVoT03d2JyDeCgMBGADgp0UKCDAh0UdgXQQYEOqhUj0EGBDrq+9ERe2/1qMlzNXWntCa6LFwhjOxm3h8/ouaRwaTYF3di2AHuC6tg2jSMHfOy4yl2wINu63kGYSF8F6Isg2Zn54Brtk2tUQTv/GGVfspWgzncX3/wbQJ0fE9T5OoBSj9nG1i+8nYdf/xKNp/fRX/pzVg9in2FF8W64BSu6FcoUlvLqlrINhHZHrWE7EuxRWby21epSOl+HDd4Fy7UBErgjM8AC3aIFarA2c1fW/5kZ5TXbn422qGGEVr8apbPgnKkffI3Gi7gXJKbN2p/PomRMm0qol/W8Vx+1WNxRQL0EV1eWsWqt+/HVh38L370JeS+y92IYzj5b4rmzk/K+crVmTdNpi+nPebXImmvuh+cmtuqr6rZ9Llemf/tE43N3YnFBooSYtTT3Ps29r8S7/+Epm8cPtXJvm041VyGezdKZXIZ3E2nBuib3IP1WgQYo+CjXE8FDkmX8ATMgzz3IBvfxcDG2hRB6APE+fOMT4JxbLEABdjewu4HdDWsV1iqsVVirm7VWATp/NDYssOaBNQ+seWDNA2seVjCsYFjBsIK3ekkCLOAdsIA73lYA+3cd9m/7vRQ7a/363AFxZLZv+2p2snxbbxrZOygC/5tDYOfCzoWdCzv3mezc7dzzA7t3x+zeDhfswP5dt/3bfMXSXtjBbdcXHbE93Ly6S9vFjZdo7bl97HMZFuxk2Mmwk2Enb89O3vjVdbCKn98q7niLHIzhtd9OZbsscD8up7JfzXfMd1PZ1rKLxdt6+eP+Gbq+tznCvoV9C/sW9u1z2be4e/UoLFxcwIoLWLsYLLiAFRewdjdzcQEr7FzYubBzd8HO3cTNwbBrnx8KzPdGX9iza4AEa7ijeVehwRqvRz4uiLCG1etgtzbcsr0L59KsN2cvyR4wVGGowlCFobpVQ3WTd93DYH12g7XT5fMwWlc3WmsE3w/DtTbs4zZe21axgwFb62rPg67tnAI7FnYs7FjYsc9ix9aG7mnFqnawYXfXhi0vESzYDVuwitz7Zb+qQcN6da/gErar08TbS8vVxSOwW2G3wm6F3bpVu1XfjOZtsOoGsFR3z1KtrA1M1A2ZqJrO+2Gb6tEet1HqWLMO1qjuYfeqAAq574RM62QMWKKwRGGJwhLdqiX6JpqQkZEusu+SeDzMvA3SSjvYpbtnl9qXCObphszTCrn3w0qtDPq4jdXmFexgs1Y62vMIahuPwG6F3Qq7FXbrdq+9naez+DoeLGZZ8jX+Qb7E//5bW2vYsDt4EW7DQsGS3dSNuDai78nVuLahH/kduR6r2cG2tXa3g1eH2RVHt+tzvZgJ5i/MX5i/MH+3av5eE42Xtn5tjWH87p7x27BOsH03ZPvaaL4fpq9t5Mdt+XqsZQfD19bb7tm9dp3Ryez1YiRYvbB6YfXC6t2q1Zvf4vJqMlwtANzaE+zh3bOHfRcNxvGGjOPWBdgPS7l1GsdtNndd5Q42dGvXu2dQeyidTtZ1d+aDqQ1TG6Y2TO0Nm9onJ4MxCUeeeZdbyIzZILuUtlI4kLcmXlo4UH2V9SUgt7pfUbZj2z0Mk0kyD0OXid65a6vtnLPEZfNWe23aT0taxoV8uV4ldU0o1YYadfCL7wQ/907K26t6jEahfqt8n0+ensh/lyvwQi9rkE3jQTJKBsqoyy6rPhbtmh3Ai+XjNW/JXBLFdG1+ALFsPE8e4vyX4D+D6lf8n2E8rro3JSfFWARmXaHH3o5G8WB+WRsT9RJPssUsDu+jTPT+T+r0/PGedhf9TLEKQoauPF7kchI26R84/AK5ytItOJOLdWa3xLWTZS6o1ZOyelNiGSojVAS8Oi9PW6zkG54w/cJH8/nn/yW69yfp43kv+Je8ZU+YCcVOXTc71YMXbk6p2AXCuMib2ZzBkqz11dpG02k8GZ7zH8ajah/lT0+qUOBMTX8IcP4JIdoLIRJdNcuQuZwQoWVF6EM8fzX8lTiBfCP/yk6jEQRqLwTKXLJmubIsLsRrWfEif2GSRQNm96UkzdEeQrcXQudYvWb5a15yiOLyovj0Mc0Dg8r96yCIltYQwz0RQ8vatQmhe7khgusRwbe/yaDbaqJY6QUiuYciWVnDLqJpX36I6NIiarnffNlLhEVjCOR+CKRl6Vrk0L3YEL81id9GLvGGAO6BAFovJW6WwParwCGCPkmFDdwvCpHbySRDwz2K1WSD7+2kEDEPEdvkzWgQtV0UtbZbnyri1uluNYhcB5Fb9yUuELddFjf7NRUOYfO4BAai5iFq68Odh3DtonA54LYrUuUDWA9x8hCnTYHnQrh2Ubia4UErMtYBfBei5lMMtgW8P4jdTpaHeRxBq9aJdT0cChH0EMHNYw5BAHdRAD1gVCry1xW4COLnIX7PCX4AwdzJ4zwdD2pXT/qsAqcAkbWK7MnJi4Z/wasFLd8s+Wc8y4KmB09e0G47jr9Gk3kwTzW4wyz7a5DMZsYXg3EST4i3Tk5yy0dxXlU8+bNX4yTKiOOdZ91VJye5Gpfrzzzd1N+/FyLlPEVvniozGvxny2A6tbDUJJcatlyH4PeShtoSz3lZ8nV+Le0+pSdtGgTcr4eGTd2vA199UzmIXMiMFP260o3oCfEfJVr9oskvVbm4CCzM/fniRJ3m9ZKfap+ipa+wWF4v2r+JB6Tk0klT205T7+se/c9gG9u8FFjnJn/SjELSMKxrUrm/VHR44abTOy8cXzpOGvO/AjmoDns0OJSJiOa7NA/7odW2adwdxjTMvWaXZtN4FKttUllMAzu4WTlOLe3S/HzP0rVNdV70E+7sYq5rstaDMLs1UZ+DWe1r+hTOBUaI7KcGwnIwM208PrG702075tN5gWPV4e6v9KpTtzlTOzVbn1MjretLT4dj6iWcyW7C0UHO01rzvcOzdJxB6L6cjwc601KkYqdM9saK9lYPhAyjR24ug6yHM7FaaeouTa29PLpteiPqIWSEVdogD3KClWrHXZycq9bWf+2iw5ucrqfbpTk5CzfbJvN4SJOpRMx3aU5tNYBtUxvq9uHo4OZmzQ7sVDzKK2veGm7jXmioqpvw4VAnaksd7dIsvYqT2ibJaOO7vZhrmWZrFm+nUi2dK11a00l5lCaaDMM9kOD1k+BF8OP7j28vg4UAl74Jb4LpLB4lvwmc6ZtwGI+ixXh+E2Qpo7AzrDtXKqTjcTKMjU7EXQnR5EnVtARc05IF1OcgDiLVZTwU/ScZ932bDIfxJLh9MjpJFzN5Q8AgmI4Xd8kk6+ff6pFcrkrptnqJC9uyymKDUBcbaNbo1y46+OyX2I3GZACFyahc/0KfXv3i0TrJwmg6DRMFJv7ZKHqpoVknI5U0LaHyE7urpLD5cRljXqKh/4Ox1N8ygnm9Vmd0+jqacGMJQ/0U3KbEBRqYWLzkbKD/yMcfzGhNstNyFU+1VkeO7UqPnXhR9mrOSyxebVp/r366pllJpFg5qTv1e6c5yeFeqWHTjESP5oRKSZ7axMz0ygbmVwIOlNMsjafrdMuTuapMjqZvvtCkgjPtVaOII/e0AeK4ABYlnZwj7koz99SvGshCtHSMr0xWe+bJQlVL+mcjNLWh5WmK2gfbnaCOSV+56SHIaRlaIzGrWZ4WqlZSLRunbhX4zEHl6ixWJneNLFcepKstQGX0pYWwp2Pq5LfkRDZBdRu6lSK2faSdSeyY8JWTFExOy7CaqSizIG1k/FR7ajN0VCBFLkI+6q9XpKSa9JWbHnVayqGVzJJyRqJuoJhpgU0YKiW0GWWwlMfU2XSpTOmqNkk2Z8z3mgSxhPprRKnF2zdAmDo2iCSOZXxdCWSb4pV14kSo2jjsxFKxdSepXtW/XzOhNKpDlUxR/vmSRNJTu7JM1yCQer9JHh3QrlHlk+WLNZEjP4cv6fBY/Nlp+vnQr4pZ0GR17+Ysq+Hg2mwrMdkNTLp6PlrOvTqwrjSoTeyqPleiSeXlJR/JHqSpe0u26Mgm3CbrUR3lP9nH2tmTckz5ykkM9q5s4zIJaY9w1uj4/7P3bt2N49a66Hv9Csb1YGnFzSTrnLEfnKO94q5Lp87q7upju1J77Ro1aFqCbKZkSoek7FZ69X/fmABIgSQAQiIpkeLskdguicRtXoD54cOECmZsYRiVxxL5KKobuusgaro70Y0DHUJVm3K4ig16WIZdqiC8NhCZyrNlAqyx6dHOWI7VME0shxOQoKreFBqQQoe0jvTP4nHMrEcWhymkU3uX1AKj3W69u2bXHZZuvTOTV4pnVL4qzoOaXy0ckMm69W/fXvzoITYe1bQ5lpIDHKURggsuTXfWivMT5wVF56fw+L2aTIjFi+wKQz6ZFge0eEwyPzxTP05GdufbLtIiCmcht2pOFjv2mUOJVV0uXDpm3WOmSjv1N0W++avjZgYxdxKj+THMwXBVQ6m+EqdvI6ri1zc/sDqos2qMK28gwuFWD7cKBa0ebOMdMx0d6ooju62PbhEF3W2UtdeI4Gino61CPysH2XgRRN+chol73/qAC5h0xxEv5v5HdU6XaTkgtXK5pk7n3rtlm4q03vzYlrHYqvE15PJGjS2Magrc2o6p9kr7wY9ohv1WDWU5GS+OoRjDIpRcNZTaRKx986Ua5nQLwbAS06uMis15x3oXr5n4kM2PuRKxrhpyc9bFvo24iYLc/IBXg9iVIKJ90r2+icKaGGwhl5goBzIFhu8T7/kv/mL16P/FJbANEbMW/EKipyAGLPgtCQO6mBBZ1V4775eRFQbsFnMkFjBfLSJfA3cvp1Ms5/NpBBbPaeMox3Klw5PfqBi75FcqvmIYYdRFrod5bresTKX0fvbi4XB1UToFeLoN4YhNEQ0zvnw1Vin3T2uSyzi8TQkuLrP+G5BcDsAtCtDmnvijyFGbR6Y1cZb4tN0Wqw6id0vXIFdA8h0Qtk3+oNbkbuRUd10HVPsGbp276I8k/6pkQy1KX88A75Pwi9sabhO3oXdAGUz5iA6nFCp6ese1Q7UN49a4f/s4ulCVxag9FdAT6XsleLEd5Na5+rkLolckPDqg7LfM/24LP79b5e5z2fBxojZtlqT2orfy4YVuy7a8W+bue9PtUWRszqbUmpw15y/6Iet0D8/d74LVo8pZlXvpAFKWjpB0W8bZrqK745WeR5GqMmFTa+KUz8Z0W4rFfU13vwsljyJTU1Kn1kSrOurTcQBVuc/k1rnO8DiQamWumPawVf1Bjm7LXrnB69a4Ru8okq9ME9Wa4PUHq7ot9+p9Zrepy9yOohG75ZBqb/PT9rjXkbSl4vKvazYWzk16mVfVDWDf+zFx2FVIhOW/YteAkei7OJgRJ3haLcgTCWkL6bjReXGelp9dFubSMj5orgvL3bAEFaWtGpUFty0wfUgki9oK0OLCo+3Dwqp+Xs7Id/f+9BtdfmdVOH6S+NNHx3f+3xvnPgpmINB72GKh3zjROoQr3VznM6FWRPsQ0YFIRHk0UkseiXOfjRokIHvarDaOP4VQLma/2WDChYC0irRWOD4JF/fNqIGKwu4UQ3PnjIj74DpByMsXecvS1Wc85kbu/TPOhgwu8CMRCaelg3pX4Ya7F2/7sJc9JHTy2Y+Yc4G//+FHX8wH9uS2fpWyiqkL2xrD+S/R8pnqVDpAoCny4PBxpWZGO5JwHxYsU/NxnfNtQVQsIaHDmDz6TN/uiePfLwj8OVvSghZBSByGjsXs9Cj4+5h+zjRaKsfPBlW6wVBYs0RYGBdGkJGCYs+jXd8mcNPe0cjf0d/QKJx7elHj17Su7PpHVh2rrdY9kOVyPZs7+vhb82BBqJ+Lp1Gwov7Q/Orbdzdvrj/8cvvxWnElGPhMKQlcvF5RZzB2s+/Hpfx/XNRL53G5mDHrWzJFeQpmswV5AdukBvhCNccPt+KXEwByRaA1E0gcRl02+2Tkuu74fLzN4/daeud7MvXX1MDPvW015+nxZ6pOi8XGWUXBM2B0ySP9fLakVTwRP5QKoQVQT/Pkb6BZq2UcB/f0tSzUgBfDh/jCuV8nvBBWvvNE5xuplEXwjdDXHujcwyxkQ01iTUfi0X+mar8A3d44S+qwI5a3UHpTZLiTujAan7uFI8jbLyvP+ApL/Sl7I83ZuBVzucbq9YW/Wi2CKZtfvGB2qdXyq+1zH2byZVIwWxnfvGGP5F5iVvDkh3Qmj1Qv5h4QFvYT/9e2lNXCn7LJ0eMznqqg7Bn3l/SvN+xhaYH16IchWZiakyZUjL3Cw673hn9Qahy7S9Sb0lmOmEuUHmSX0cZv4E+poOU3Enp0AAMaG0dV9/EWV2L5t2P3Fv79D/FP6bw3YVfges/+Ipj5uZz7qvUmvzD3H9nD+fS4m+xdMYu4756zEWfLRq1KX2rNQ7qQsfRW4eZe8f0kr/JlXZ/k/3lRKoXp9ST7S3WVr9CDSe5f+QeLajopfpB/vKBhk8K/8w9LyjOR/i48lNOBSf6f+UdLajApfVJcKFN5T9hPeZFcWN8Xhbn1WNtIgU9NUlBhqeHqWGN7DbV9Otivpbgk713zA7dve80WaWiCB9ld1zIFgdrEe+pCCMQkWSvpWtTC698TKoaIN0brU2gtiiu703DRu6GFfyb+t+ts9VsMWpWLpsyLiFWq+0CSkXTTMk+gkmY/1CU7ueZBgibdyflPwDgOH4rrWIcujwO2WL0Tn9z9VVqSbpem1OFslmuR/JitDniwAdsJS7pg4FHYf5wXuNJF6enHKt/m187tx7cfR49Jsoov//SnB1rL+t6dLp/+xAfuuxl5/tPTMlz+ifaLRqR/+r/+/d//x/jS8WczWMOtllHCYscpXRpBi5d0pRLJ7k5KmLxFO8LlC++bv3jxNzG4tA3voogGpAL4ap8vMGIeKgjxmTxsmXbMHSX9Krt1O7sD3S26WBrYzllVsJRzZsEsPN8msPGFDnOzhBUoLPXiJFgsHEKjjvUqkx7ryHfplJt7r1ghXwz6yXkMoScNWGYQkUIR7HL7JW8PDHO+37I9TeR/XNjMTUJxuIrxyTUeVa6KxIPScl59+2/ZERScgYQV7ZYEOyLxiuoWqVqVVGTJLicfz+Y2bcmLIE4ULpZf4Q7rKD46X9VlUye0WFI1JTNvvaJCSSoqStarBQF/eKF77H5Dh+7rV0V948uKfPB8lQwAUJSwf4w4IuV8qZLGV8njKMM5GeDKpDVJ/7jgY8xXDheKQZmUP9rz8AZXbf5RquBl/d3qU2UKHv7gqw6ovmVTUbl3V+5di94q9hdLqRzHguqc0+CWJH9Ry57y3PoeWJWqwWhb3bAtlWyOZWGvGmHHcmtTPmFjdhVn6rtgaFXH/tG0DmlaFdLovjGpuU/cjArfoQGhAQ3EgBpglYl1n+qJegtANdOjDytBU8vR7DqyJDQJ6XjTGesi26rmi7k3/mIBuDBtGU8IXWa6AJviXP/O+YUzXTJ4OUwmt9Ga5EA91XujfB2/sAvulosv+jq+SvLfssw8D/DIarO0tMOtsklov8w6cfUNzKun67ryGKR0cX7R/H6uJQVQtSaRntsXtJZJ9sYrxcjBvpWiRivOXdqb4t1DuT0S0VW5hrOzM6Dr5dg2/LSRAN63tBiXPqvPXFPe9WB951j+aCzto7i8ZA+2TBajcek9yOyiKC4rcgXbn7Q7DNZXlrxYLleKgrPCs2LSrikezn8ydplwRD1jlfQ4j6RCYYIZXQEsExJON54PXLVCanZbimVB3PkC+FHAS2tj+bKbVX0tTDjeks0UsUQlk5sMmxN8LonVG3DSA6OxceoGN6+qI2PDMc+o3GzdPuJ9or5avRcoP/Tzzbvbi+acD7WdX0g0X0ZPjh86ZzIt7UxhavmJ6A46PmFXki7FrHzJ+YTLpyCh08mFc8eFfnceC7PM74PBZQt+el/ROiYzZzQXm3PAhgQaFatkBBP8mNY0zw/8I4nEhQ/0a7fYs5KQvITOf1VDTOfN5eKZMAWAYfN4w/lkXrJH3r8LVrwuJ5StU8p7kJJN7uBSNO6kXGTBmyichWT6F1lvJePiXZ/w4dVt9PKpzfuQ1p8sNpd5XdJPb2qPpTBDeeZTepny48LXGXb2y+88Ll/Mxv735UtBEy7V8lZOwOonfUEgZr81zzyyy5Hoz/zImibyZiZzmwm97qSuTknnqbtUHuEL5TOpMUl2oS5MyH2ioKhtX3Wvfvx89V836qrG/IbaTE5mJ8RL4ma8UyOZfkwknbkw9idrkKbRxmG7UCxOch/9DYQbTDk3XKOTnk4pd7JjaWyUPEJJSB+2f1/oHN3+a5xDmIFN0Jl57C/2PSnGmYJmlIoixzNUco524R5lJCJxUkMq+0XclM5pNDMV9agmBUmjrwpvyeRZFQuqR4GLQzt86R1V6hHMe7pyCW6e5uLq/WBu/t4WlePY2w4O1QbZlHgQdWnqgRih99HyiUXuI94lPraKGgonCmqfJyhV8Nr5FBNmelJPHDGMsN588r/RpdM6IuLkBlUpRSERO0sGcrwnoHmwWKSr1/kSbqZP+VTsdi+3vGSkqln26nRJpJnI8kMyKfz7wvBSROYKBpn6DTiElGTUOF/kloVjC3fykZI73dt3/IU7uuYX58HonySZOkzfs6NXrmay3tagoMOl//EqTA+seTgxYYzPC41m8lNrxmr8mZ/4hkck5ZkEphmFD87HcLHJzoiswD/diWwLTJB3jJaYNj5Wj5H8gqZlY+p0crH8N7IxOqfCs5V+KeOmpRfZcnM2LWX8xFsQP068ZYnPKf+n/2bL/Lxkw0QLC4DoSO7XDw+gq0E4XaxnzKgrCllGAX3DX/BlkjOipT2QEAIuYDCyz4KwogzObIwZy/GuCPrcOS9/Wjp+VRlpOBfGCSwEaEn/XMdJxUt3BWHducYX5mkwL1wVreT8t5J//f3cGf1G45xRofDx7+Ozi4oG8ZNPLzBhh+JwED/ndvfLu2vv88fr/3z/48fPdxWl3ItTTH64cVbgUtPRBBdJp6owriggfiwfNboncA7JB8rrFPzPcl7Vig134ZFYSZQlax5tkwXIo6EtZHxROXtrH4A+67/l4flO20qGJYBpbs97h7EuDNWADOoYv/aK/PDIY9voowb6OB4KuT2UQ6bfPN4O+tqCFgNbPPoIaS/IUnjDXbBH5QKOr7CrEUhd5SkmySo1IZEtoo9mBLKMQmpQFI1FVjofUbXyOxkifKXzS9BdOMcshkfdgkyrJts/K7EHCWFAf9OavxHyq3Y7Ft6iBTexDuXwiqGsOwFwJpyJljbqBKhY6OTRMcNXFqsInQ/KTlCGDx4RfJ290d3KuOyAvo3/XcvBlRV6kv+nofTVMgiz7C7u9iOVqVuDuH8zHdiWoKonf3NPICGsN1+HPFt88gLRfrJM5U1SaRt9uJV2lJ9RuZc+Y8w4wzQyw5TtSffU1l6qBP8me7KF2cwG989tzH4xS0GF9+PeQot7CymuuEN6Cj76P0Sr6U/i5Xw+k8J4SuKXsTz1UOafd9PWVb8o94W2RlWIsnVyDfrSpZJHikF8ZHCW2seI79y/899qzSgcvk4nRVOai/1RdQ4qQT1qW2TfuW/YXx/eGtZo+zdagyyl3lMuTvrMiGQDRHC3fThFyRiMrdseyOFpd2xgWFYysctCNO+loDjoDMtyN/tTRKaQSoiG6mCImve2MGI8XTIrqxiF9PlJ5TaaW35J+0phxyw3CHyprsXaq5dmOWv54yQ1DZeuqx6ox/DS71RmVNwlqHBJ6zVV00+fPrz92vR2Vq39vabMtLz/xPIqhDMwLpagLZexLXIrt6f2ej/dvSqjZsrNqz3byPe20j8a2N8q70zt2jL1xpVu1vLDzSj58uev6iA+tYIPb9/R727f/fzmv7z/fPdf3t/fXb19d822kBJI5JcOwFg/yfHFxj/8xbpqqcF3XN4u2cwJ7vH8t11b9vv51pjpsiOCEPdMv1+gHR3Dnp7FdP7HScVW3GjXfsFNneX9JcN+h6ZrzM8ouRDrmKQLTwPSwhs5qVw1uPNo+VRwoJmu6FvdMHPhwiQq8DLnOZM6r9w+4tZpWrHzIMSEiTAz5RWm7+lV6rXDoiFQyZftzhzbpltxyjHLjknVM/V7f9CXZagF8p8ueUHePZlDItyMxnAuXVEH+RBH4/N0w9FQYjAXq336CpgPuAzfkYpKyREs9y7t3fmzqbi063KvSa645JHn5pktIXcP305dvjLumS6piuXbtPKjJJgGK3h75D/4QTiGMmFn2aJIgcgVWsZo2/wYkX7/czvne9lqrcqL2DObeBBPB85T1GOuZAuUpNpqfHy8q0cqOlyp/1ZOVyJiLIhE+N6W46ajP3b+MHH+bCwpfXTreYoJhV4iGi8QceHw93B8jk1to7FVue4vPp2TYLf3JomocZnbW1Ukw3R2Q0S2HVsF028L4i6W/izOzte5z9AZg6iEuLaoEMu7C2IKYqBi+EBQEUCteZNu+zxHRCSgajy+rNRJvqyAGcBiVbFdXbBDgjMxeCzJFvTh/Lf0lCFL7+2JTLx0NQHzmHMu5gfnzLIWobm0ePLrikyBGSPqMQ4JeDY/KQ/H7+d/5T4fkBTI0vhAC7Rryxk4o3Mo7JxHiVAEb5Tjz+FWMVoweHkeF1J3yOv8j+riK7REOENenP5Rjk/r1yUFT1aci17Z+y0zFUdZOU90OQvilZ9QlY/MRViQy3KLAKkvVf5tpzF6KVyn18Tw5IcoR3zd5cW9x1YmsL1l6fLEmkjMyrB8AfbTtyBkXLA09yafSWDxUUgXra+ED0vMMxu+gJcBsiEjNIFQ75yUpjCn5bmVBWZZQCtUIgPst1oxkf42v8j0qcAdusgnjhW3CFq41tdwpUDgL2ib2VqG8xS3ubchvzZM2Unqi1wbDeAFzjLWY76xblbl7VJMjVb+bQZz31MQBjFdtxli/h0cV7prsm3qbiQt/WSdcT2FhfIz51JdFiWJttwueUukly+cnZvViZl879mcz7XX+03l1H7Pdqil6encvu6zWTBjs3aWjhSQoOkyimAO51P7f9gVZ6P41CvvsrVSTFxBVTzFC+G76grF2h0elhf8F46dDpzdcOaqyCvLCay8NMYpE1eo0s8yrP3urAkPwaPXFKaYn6XnlX6Dul3p29/zuN2ZlVXmT4gwTrVtMKRq4B8nDj+JnCPf8ILPz5w/Kur7o3N2Xj1QZFForDVYtltTabETaGcBBYPqLGSlXH8IRgU4Hq+UehwYg9HGTgUXywfIns5/XVi9IgN5WfZ122VYYcQm0t92L5fZHZPyR3ZFGe880r4ksWk0e/17GqUAsgAAYgdEpOTR4jYR6/XfhVjw8NJExMQZqgYMSIaX2Ho0pj2creFYE3OVf7D1h4BlZBsv7NUxIPV/rh4DIT8ldqpO62yn5nyxYj8zv3Z+YWd0+Jo5mEtLyUc/hkEVq8c/WBdZODnDuQ/5deUfmlpY1llgVoNhZT9q2sW03I3WgU6THaEs61YzsGiSx5Nm66dVnC6/muqNhekLMFQR8UBy+9WCinEkTMNqva4EL4BGl0sGwc/9V2dAEHyTwmo4fwYkh+DlMhi5uaQP+oPekypGJ2epavipahqt+gjOhS5JRTpC21M/QxuiD7fvrq9uP3z8+aIikceV4uTv2dnZ38kCjnDxhwC4WLHb1NhhCpIAYsd2wNhX/HTGHUf22ExVulswiCT8gp+ThBe3Yd8dOx9/5DwiO2X36Ghmjhwfu7bC7qS0W8XVY0xVuqvjyGvTY+VHHw+I1KPvNsJuPVkV7MbpKn5arfIAgubcfGGWFNnzCtck7jbn8Slkz9luz/s10hML/v2U/p/O3P40kQ42SOcN+Gu6K6KsfICaTmF523DlxQzFO4Ytb3KQkt4y2PLnZfIhvT2XzBiAaT207J87jyx7q87A1rvG2XwQeodxFc83P6yK2yzsR1d+uYPam7/6wHqsVTcmNDnkt9u9qlqjrymnjiCkIocjjc3tMrtmXfR6D1koSjme37HKf8/GveLJ9kb63a/88F4zI14oDUfedJvKe5JMH3cfcEUhHZxZVc0su5vjDX7uKpu9R/9zgbly6Dm3k2r+A0k+Py4XhDV696Wi/HYXl4xy+3ZdOsppA+sP9Hs/WHwOksd3v04JCwx3HuxSCeixlSN8xZlye4+veB9HNze6KTiw87CmL9ZyvDq4bo8x0xp9WkkbK2b1dVL2g1h4v4OBY6GFR10+mO4f2iFSV5XSxZBdfTWNfbRoutqmSbGAV6wtFVUhHVx5qJq5g0zUrzcvkiwYvApnzVhNZYldxVoqG74LpFtd1g6yfPWK79eKrt3QWGZBEkCwOPI+UoD5Y3E492/U365IlGxepVsDbJyKOwO2uwIj/TXwr2pC/6+dW5abFJL6vfjRLHaAWuEnwf2COLN1lOVsJqH/BP/g5CmWDTrLAf06PfjH85ye53X1/CLLZxCSF1r+jOeQFq/OloRRh4JUAoyFTvUsCKngoUjYTcpay44LsOrpY/mKBD00bWkQQ2MFnX9rK8fewki/1+1YFL8vquxr5+1WLE/Bg0iawKnQv/jx1F+8oZp0DiN3Hod0pLwp+3chVdVrJx2n0PllQ78KM82KL/i5gMWCVZIr5Zl+LWd2YDli6bj6jFROBQ0yBuIi5IOhBbAzqEDZ4+RmSOT/APITPZDK4Yqh10ZgR8RwvhNS3DBmO5x5L98Q8tqBNBhRMCOcLZgbFNF85ztQH9bA9OGtTuZUGuphz/EDo5kqlvZm2b7ctKBc2s3MOK8dkoZclE36kCZKfgVaHKRur2GnW2ubtmxt9gl8GzPAZncIh+eAj7zTmX6v2dgsfI3et0fe9yGvWQN1vk3Y6EOfbbQVrsHw/HQ3OBPZ98ZNefVT6Lx75LxjQvWmrG+DX0FrxqVDC+kmTLNtstLw3Hc3SVfp95rW6dVH+wI6+R45eSn7hYcOX+3wLcboRE23XY7kEKeATnE9t/qgaJZJfZSPo9/vld/fwLUW01SK6rykCNbsZebVg3taln4YgvfQp4vOENXV2lFonq1SlV7DaaTP0wgR4sT5pM35RD/Kp+0LWj3PMsD5pVPncjKdsDqGY34aJ5E+TSJUhN6CytATmQS9eV4TcerYf+qoGttTsvJ2T9wNfn449slBjTLwQq11J30cp4heTxGqBOzD3qWoHKIO7VC3Y8LtnAMeICG0G+eZM1aZ+fiy5jH0730iipLEewHh8YSyuPRvgjKqG9N+23F7OQiG5+g7lEsh/b7UJL2iKB5Fp98jpz+n8vPgGgKPlPUPHf/eVm0c19Ow67bSpAx3Cjh6upei9EWDqtUkexCdfy+dv1/UPHT9Dbh+//TsufHsTUPx9n9jiTOUiUrKaammi7jprFSphLeppXQ6oE8+hc68m86cqov7UlIirQs/IX9tsKqXvlhVWyndhreO7kxquvT7ykx02gfR9fZoHT1LpefNC4o3+B1R/dB0aCe0OTNtN2HkANMtdCvx5fZ7q6R8FY+jj+9TJgaQIVUpIUTvqaiLmJOhaoS6lJ2hFQNuNS/t8Jx/t/Lrpt/bpdM1P42ev0eeH66FRMffioVXDe0p2fjhMmQPMH1xxzN9Z9lTd0/svcOrOKv0KSlydpCUvudhdFGZM3m38RqQmZvS9e+T/X5QN9u+dj5H/oo7HubFuBOakWeygNsKzuNU36nz8527eOWHd5mOB7IboHMTWAKZOWt2C32QxM58vVhsvvv/1/4imAf0G+E+wettnQNwBRRjCIXRclyoUnH1MQyZBwVN5mcq2Y7OfxNScPmzwez38/GZ4vp6Wn5a0G/6ZmSdYJc/sxf41Q2/i8EdqQpfwEBO9KXewoj9CA+5bz7d3H786d11uZAVGzUvXpEpbcF0chutJW0p3CoNrYNFJVMNZ5LqWE5j3tMp8Be4/WcknhsbLqbOq87tkr9YaqTk298oEt5b3eKtcObKbinu3C7ceL1P1vXhXLyMVt+A1XMd6bTRy+pSafNcSejLqnvmqVX/UE6k3qhRX1Ratd5H5fQ8dVHcI6UdG9dJ9D3wW8PRXzTgL3KK02m3odChnVYMKmWyWTeoTavDqwdzemm87B6dSNNORKdInfYn5uTAO7mWirTBNl6m0hY77XD0qYxz7qZTOX5buEUZnUkjzkSlJh13JfrksbUjnAqz6VTEY0yLWzcCskmFq3U3nckRi26nD26nqC49cj/qFKMNuyGtOXXYHWmSqNZ2S/rEqbI36lRGUW2wZJd8ED3TQT2TSnW67ZD0WlTfDxkNqVvux5Cbs2Gvk8vHqXc7x05UiYufXrgYoSZ98jG5RIm7gTemFIpW0I3Zxrq8z6xI6ijvN3cj26F+H9mcNq3qJAL6kGZ3nnPa0u0daIXi1N+JVltLt3akVRkE6y5FdFkDJU/SoXR6uATppvsoq0inXYgua1ttN2IwlU65Em0uuqbcST7/nMKZHD0xG7qSbruSVEF64UjyWcAacyNXqhxynXMihcxmdV1IIZuZ5DvKWb32gEAqExDZOwZtjGLK94UuoraLyPSg076hkMBqJ1ijqEA2SMZnZboyK2+xo0uomUVLsujOpJfSmnJlIhtcHRzS9IsK02kPoNadnRyBJj2SjT/Q2laHMU3TGWyZMN+tHEZ69qrdScVd38dFRRtceqVOdZtUb1Cv3dj1Jj2zotmbDbLDHseQHkhyON3Km6P1F3ZJNnZ8Hb1NC95GqVCddjYG3aqNd5jNq1Ogh8lG6iIfttlo5HQCHU/Tos8esHtChzploRNrI0lBpfJ1O3+BpQrultrAVhetsh7YW/cxllivXrFc8dszmjwZ0Ej8+3s/JulnVCLsdU/4DSF+0dJnP2LeD/7+hx99yWoSj9GGgWZ8ZFtV/uJLzut8ZU9/pXI1FrodqnM68M8sQ5E/ndJxBONnzWJZjog/fWQ+4cIJXOJegF+IiPPkb1hynm0pT+tFEqwWhKVcI1HskF+pdER+npDKKSJhsqBvrRNe6FPw8Jg4j/5zrhjfmQXzOYGHqZuBZtydb8UjkjtNfl6GQmhiOmHeP6Dq4YdTbpAXTmrvl/SvaCw7u6vQSZ91lnPh6iKqRzOHizDrOSvDdW5z2aGegtlsQV58Og7fCFmx1E5P27xE9F8bZ0FLozOTA3f1wm+oA9JD5ZJDMcWmn8UstVO4TIpvrKIliOSSfr+EgRdF0NZLpbCiqR9Kn3ZGvrOgzY6cu2vmT+641wb3SFvpb8ZMfKwoVTFc+MGMe2S5ZlBdPkJbt03/QSJhoJ40MnQegA6BpLJn00GPqXYWX3Az8cWl5+nj2Zdwi+goFe3WCIP59mlaNVSb93pSWbxqj3XE80Zj5XO5zpSbq3wn/pI27KvU5GKOruxzfsEElRqdYZNNpsf8Ik82qeRTxIKryK845BPlXDwudylslHKjI6SqGhqe3+l6HUI2M5bYqexIz4QxOmlzoahlSA06InQK88OEqQtfHqSNuROrhjPNelIMCCtZjAZvfUySRFhKfkQuIKebp1ptjU9raHhT3yxXG5hvR1mvx/ul3Bpgxsa2MouVk7FpUoUVv8fsiX3KnqjIsHXqdx1JuRA7bzz1k93KicmG5x7byr9Wvg9cnVCt8DX6xh75xodynrLhuMaHbhtOA/cDlfMsDfBaoHZz0JWvCzHmg1I/hT6zT7f7EKoZ6kxIw/GdmkHotlnV96jmJHbDc64HztVX0gpztjSFglTkREMX3AsXnGyl6KE7pnZoMSC9tcQmvLY+E+AQffZhEh4qVESfj06pIIasbeioe+KoN17CVEVcyDJVZeYakp+uGo++mV/T3lmdQHHoXrr9PJEV6qJO31epNprkdui9++m9iRAnunHrgem7gTbg3/WZKAfo1g+TcLOsLFYZNM1Po+/uk++mIvSAgOhFXIjevJyTckAeu2o4+mV6jXvlXKbOwbvl1hKSVilHLl9ktXbks0KiZ+6pZ35R5OYcsmt+6bn5NcBoU6RAHSCzreVMr2Wijjl1q+Yx9L59YryRxHsB4XES/mC5b7ph6Lpx1fetusSww/Ovh8h/W1IDXYpShSpok3mir+2Fr51T+XlwYMoj6rSxw/G3xqHoi7E153vzWXSH63nbSxasVYV8RleDIhSyn6LP7ZnP9VU5dofocf0+Gll9X1tINzwUJ/s3lgxAcjVblSgnkp0u4qazLKcSLmTJVeiAKZkyetgueliqLu6LMhvxqftVg1W99MWq6rtUddrn4S1f289uXRJ8Zbpq7YPoXHu0fJ2l0vPmiuTOw1m96sehDybWwNFlQ5bIAZ5hPlBa8PKpS7sElhWPowfu0/FmkCFVGiFE70mVkHFAB52rhqNvxlffNxsyiw/PNR8ogXpJOewyopufRr/cI78MyVjRLadmVzUa/TK8+j7ZNsP6ALNHHiuRfDlB3u6Z4Xd4FZ15n3JSZifH6HseLrnzKSt3G5yTslrDTLBXtmD5Ro22MoHWvjFDkzi08gXF3RfEiR+X68WMZ6P3Qz4AAVVUP/7GjDR5XMdpb50Vico29NpZkOScPTQPoidmEJAcff3EeDHgyIRjitdRyR/cebkk1Hel/OqmXNbpW9k7mofjNHP6Ns10Em3yCa8buwmk5m0gypTtWYL/4pUe+RTue90k0uxtIjVvFEk7CreKcAPUVdLI9SHVV4gorhExXSUi26bivpBSOYVLQ3KWqr0ZZHs7SJaz/40ia7P1VSAWFyOVL/7IfzIPQmo0BZMyWCNY7XivjMWSi24rlW9dD61JYFr1PPpn9M898s/c+nrlnmXD3N0758x0F+f8Qzlt9On4ZkViT/mG3nbTCde+mNeYe8/yNfTb6Ld75LdzJtkr962w1t29uMp2d3Hmao92Wj7dnLdZcu8HTmiM7h7dPbr73dy9zkR75fnN6ZJ3nwQqsinvMh9UusBTmxr0yaFzE8NhsiZbzggPy+XDgrgrkOr9eu4S6lQ3zLe/g7+kSaDiSXT76PZ74vZVBtgzp6/PwLyPyzckaN7N4Rtd2ym7e3W2aa3bbz8NM7p/dP/o/ivdf9EQezwNqBM3150ONHmd958WtK7vxKYHfbJqeVY4TBbnuuiQXeZZnCFwhjiJGUJllP2aGPT2usd8YEgkvdM0YPR1J+39c0mx9e6/tWzRGAygq0dXX+3qhQH22dfnMk/Xdvb5xNQ1vP1nRWbyE2JhKrJsy2zMltNP12ZlmhPqmtmZJEJvj96+H7zMnB32i5+pMNE9eJqqlNg78TXVnuy0vLkur7fk0Q+R8BoX7ejG0Y0r3HjZ+HrlynWptHd359pM27u4dIMrO023nk8ZrnDq7eXSRpeOLh1dusGlp6bXS4eez9W9vzsvpPLex5lfqVK2n44rL2Qkl3x4OTP3HiB6ZRJhewetxU5MObsbck41HNM+Tmkvh9ScM2rGEWX6o6qiEe9j9jwFr6PxOIXk1VWuJu9mipqn9S8F3/JZma/cyqFUOJO8IxnXzKIteYP200vXhV4rU+XiCg9XeKewwiuaYq9WeGor3X2Fp8l3vcsKT+vSTuzsvCH1oHyI/kD5rGsfr7TL97Xr+3jgEueAPp2vV1prvw7aGwx5jxP3JrPe6ei92Q+e1txgSBsuTQ0Hyqddd2awywK84+s4L+C80KN5QWmqvZoWDFa8+6xgsuldJgWzBzytOcE2bbmcxvZY+bxrp7ndPZFwnbJwMsHJpE/JcSvNul95cy2NfY+Uuramv1O2XXun2pMJ6NWr14b/nDeLgITUSE0PvXrt3MLdCT51AZlj+G7OtMqhb0eb1TKAQuDGAT/cONdM+ViHXfoPqph+mLDs+cvkkZY2FZWCp83uUHBGL49L6jbYBRf0WdrfGc/NHzw8Jtlzzr1PH4Gi4wvqLJ0XsljQIulfy3lCqN8lLAG/qIG+/0R9yTOJxy4dCecqSfzpI7h88utqEUyhqiC9IuFfdMSg5rPQpwI/c+5mdCzhmztneQ/Zf2LXuVJ9m6b359MJrSYrznVu1rQ+8brjR6zpAbjaDdU6KroV1WrqFGn7I0L/jknIbhBYLOkzrJwL534NlwXAfHVP2HxDB2lGa4HhTkvOvfzp9o1LRUad8SNZwOw1X4dsLndmQew/3QcPa9r2GOaodBhoc3w2NumNCKwBcldgZMojwucBfmuCv4DbaDbZrJofYj4cH+as9FJBr9jckZYA38Dz31HzjAi7XSNO4FIJ2vtnmB65iizXkTNdx8nyybl7Swu8pa8BfQB+/2+YVrkKvoL1EglhHvYe/dhLS+e2/G/cFOEOlWxJBDKiHvMjm8r9xRfxcdro7A/nv53iV/BjRhaJ/5U6QbDBi1dsCWMuWbhrVoKqJ8aKuEsI5nQEsxkTunPh6Not+W/hVC3b4cK1KVkxrBbuoUQx8AF1OcIteZ+oPi7eUGX37xfklsqCjkl+IODDf/h0otW+ck6dGLt0OXN29D269lqGvBOp77tUlHy1CKhhTUpvpu+8KhR9KW6X2KXMrCi2BsjatkNr+Kvv5nMwKIsXv6ceMPP44jVextWaztxR8C+rlm8fFp3m63r9e1UHaXgxuUz5exWXKyFXpljL1ymUF8GbKmeN3r/jckPzCd9rFCk3U5EYb6+iFeUoyq/RdlVBvAvmNH+N9qYiA2DjHdOnsjJVVcGLMJVd3Y+qwhWlq7OvNNsDTS6W+j3RpwvYS9qG8gz1tdOZ3HnY2uIwnY6t3XLVGa/9XKCiIFUNdb1sOmPpTjTUHW7t+YbaQ62m7DbV3gKBt3ZrC3S/us0sUU/3UYBiIbylaqLMXhWoi1LX0tA4m/CV/aY9Q4GmGuvMtKYSeTcNmxV7VWkoz1BfjT6aChRraEvUbL+VsGXhti2psyi3LZ0Pi8fhrS1w6nnbgFJGPAEd4hsT0IyfAWJV4rtnAmXkQSAPEW79+Ns2PD47O7tOoZUYbs+cPpLZekFmfK8g4jMpg2Lk2zk5DAf3F3Lon28P0P+Fy4SWMl1S808CGtffk6kPmNcL4eBQtKHFbeH6JUc8Ngw0icmTT6PjaZwWSXgjJOAkbc9oGUnE9sXCiZewJ0HGrtyzLcT6NzYChRtP+f3CSRSQYtbr6SK+UF3KadxTEsu+LZQhPUTE0tAtrBHztfxb/p/QeS+YbSu9T7znv/iL1aP/Fxe+jPlyjv71YablqAvkgnYp3Wa4SEueiN8SFs223rwgDBLPy49JfpOtd4MCGBXAVcXtobdkRcIZ6BRVIH4zLW8xGJkDOxdwFywgkeuE/emn8K+/AviP3bY7LhT6AmjyBt6CX2AT38LlCyteesv58JYBhvRpDjCyhwKQD8BM+SIZqlgYKPeBWuGLv7kTV+uCyT+B1QVJfufpdaEwfttywDs8Xyewg0dbQX5dsTt5l068Xq3oIsmZRss4/k5uM0C78QV9t1CksMXHYProTBmELW+zsXGQsNgV+CPYcQsLA6Is9ZFEha00vn8mvSqrhBmD3DrQq+3rH2YpnJnfscthjpn5VOu7YgNJ1WRaZ7r/lv9C0dnpox+GZOFRH0knjkh6tfCN4l1hNDBV8b8kz0jXXFRAYu2ZugDx2Ahel+Fdo7Up/U6uAUU/w3anqKMpViMk+AMJSeTTefMLA5o53Ly9dTeHeH3N1069/xUUzjdt2DTC91yC+JHty/DmxWwHNxJluDBn5HbPMjoCaygtivVklL/9V3NLbeYmuXiyXd+CuGDPO/ssWfIlgHobzm4lkBtxd7uiGF/sXug1mSvLi8h8rDoopDhAtr6X1jBK9fEeotWU6VB8Qx8ficFQlFba3s/GGPb2VUslqD92P4V+tLlmU/0MsHfDLif9dsL1DGgM0jt39Dvq/piwt3wCqj4wPNryoH6Przsm8Lf7mSqSfg+VP8l32c/g0TP9s2KndWI2TShELHhH6bSfk+jY2Bp/5ie+YtP9kdEtY/fv/Ld+QLc8BKozkwaVLWenOec5UblafQFjl1odqKCX9ndkqM7n4AFrd747Lu2OK752bzZxQp4E0qDbDFd+nPM0XuqaqHLzrXzQutJ7hCEwjmVzYDOWwF3jaluikx771mW3vE8yq2JWCoJax2/oN+7PH2+99x8//fz2Uq+i7JZzy2aZdUil5ayZXM0/hbB4Cm+Zd9aL2oH9PT7Pv9I2uDy8C5Vf5zbIxeNRefEhrViEcKDDS4EOzw85zHEVbpQrkEwoMS+fPvPeX8Sa5gdzjfq4pYa6n2Gp9jEky/norPTt2RgEn31+ZhBx8VXaQus2pJ8oS9ePemFAgL/TTvvYT/VQCx5buXgRBGslqXvRzSbwsfMHOvZnr4waZ78XOBprlUVvctCFbIj5esnc3mwU3767eXP94Zfbj9cuMOPYXKb2f13wGx/CZ38RzK6ih/UTCZNRxUTzxGGbifGh+RlbbzLa3qdPH946KVtuvaZzGnwyut9Q4eXnYTZns0fGvztnFRU8+gDWZLqwnPNw9fw3k5h+P68o9wyYODwIZDQZVqSllp3/tapwwH82yzWzPhFv+3xlvpyLyDuKIP7ki6D/MCx9Kv04C9w8wyRXnMq3tAHRL6Fcr7Rvv3Y+hCkU8D8nzp/d//vP7r/LUTTtETcfIIYBbnAnUO7tPHqnXzgGc4XJfYhH+XkEVi0xK0qgy/CnZIIGG0sXZut4u3A2lWqYVpV+lk7JK3/6bcQLqniZ2bssD07E4e9mRVjJ4v/JRCG2QABOjJYvoHIzMl1QNZxxwcRULMDlmjmr5TJabP5qKD/DaPzgCQRKntYLRnBORCkB7TFtxQxWnAITzeM6MnxaLp/qXEwNQuCsfCjc7qyrTH5RIxfz9K1Vl/SLseHVHE0254Vkmm1ajgqVKITz7haKGMssnz05S7mXywh8Khe9/MQT45SvxfhTYvGSb8qnkC4vv7zSBvS5Yn+ghs2KubB8gZtU4ZWv2zala172RPYpP/Txi1jidqjdWbNFmJ2twkU3FA3f9vWnd7d///jW++X64+3H7z+9995dX3+89m7/65d3N5fOIoiTL+C3vijK+Aor+y+q8atfGEPIDU0rYOmGMb7+5c1eL16/+/4jjQSVr8qqAtHkpSaWlCXDFljaMCpOoq/77VboZWzcb7BpUMaELWwtLNkyOiZie4yuNNeEUUgBuuUbg+wQSegsoxmBhUKhBObnBdWZ/m8ZLjbAIJ9xajXjy5fLK5TBVkpCWBy9d8vjwmGYYidvADcKp8SsjOX5xV4haynlWLvnFa9XcE+Am+lGYRbgC28h2jTsVjyRBowk59/kEhR+JHv+lQ3MysNB9g8BfuVLu5AFVOgGB2h4Wx6kRRt87rEFFHtXWW6hKLrcZKWJo1flifu189M6TvhCVqy00gM0sM+VrazEaSo+p5excN5iDaJ09T399N1blSTEi/DLLMr8v2m3Ch9so3O2Qkntu2pDZDuQDPvnk5phw6OgAepCCyLZFq8wNUNdSi2sqhtGsrTvUhCIoc68INRViKHV7e7kXKixe0UJ6Tbz5ZgBtvBFfHNpE94UPEhqybQYvhzm9lQuYUYSP1jE6tR567js7qDEasdYME9Jv3mIJyn4goSj/Kdj5386f+bqXfZsKbwrm8Kl7iwasAaEG0qhD/E755cmuk4VumE9qlw7VWGfgM/KWJtii3t0T8LH8aXjL2JGNIH9+8h5IEmSngJioT8gVDFTnkIZd2JYhYzvGBAWhNPFesYLgCOioXMnhuQOAsMn/xspFDMj9+uHB3aYzI8DGh+8erXTUI9tVZ/NATC1wG/uUpgZ5D7Kr8Fgtr0Kltdiga3njij1WJZhue7cvxQBZNrN3HPpYBcjTptBCMAc+TwkmmBm9RTGowDNi+a5gqpVpLC4/ipwf6J6uiiwTOiXC+UwSsC9dCoH+VjIx0I+FvKxkI+FfKxe87FyJ/uOR8fKH1FENhaysZCNhWwsZGMhGwvZWMjGOgIbK7cgQTIWkrHaIGPllOx0uFjsN1KxkIqFVKzuU7FyPqgRJlYRK0fmFDKnkDmFzClkTiFzCplTyJxC5hQyp5A5hcwpZE4NjDklJyxFAhUSqJBAhQQqJFAhgarXBCpVFu7j8aiUycWRToV0KqRTIZ0K6VRIp0I6FdKpjkCnUq1LkFWFrKo2WFUqXTsdcpXcO+RYIccKOVbd51ipPFJjSa/kwvdMfaUoQofbI5kLyVxI5kIyF5K5kMyFZC4kcyGZC8lcSOZCMheSuQZG5tLcaI28LuR1Ia8LeV3I60JeV695XZr57fgUr4qGIdsL2V7I9kK2F7K9kO2FbC9keyHbC9leyPbqK9tLs9hH4hcSv5D41X3iV0Ws3nS6LbO3QM4WcraQs4WcLeRsIWcLOVvI2ULOFnK2kLOFnC3kbA2Hs7W5Xb5Jl26CTICMLWRsIWMLGVvI2ELGVs8ZW4rZrQt8LUOzkK2FbC1kayFbC9layNZCthaytVpkawl+R6pLLnlaJVyb3sFfyM9CflYNflaFdp0SI0uxnEc+FvKxkI/VBz6WIRZvno2l9xTIxUIuFnKxkIuFXCzkYiEXC7lYyMVCLhZysZCLhVysYXKxCkQO5GQhJws5WcjJQk4WcrJOiJNVMI2ucbM0zUOOFnK0kKOFHC3kaCFHCzlayNFCjhZytJCj1R+OVmFZj1wt5GohV6tvXC1NbN4uZ0vtOZC7hdwt5G4hdwu5W8jdQu4WcreQu4XcLeRuIXcLuVuD4W6ROPlxGT5cc6bTe5JMH5GyhZQtpGwhZQspW0jZ6jdlSzG5dYCpZWgVErSQoIUELSRoIUELCVpI0EKCFhK0kKCFBK1OE7QUq3nkZSEvC3lZPeBlGSLxxulYej+BLCxkYSELC1lYyMJCFhaysJCFhSwsZGEhCwtZWMjCGigL63MUQHSKNCykYSENC2lYSMNCGtYJ0bD47NY5Hla+WUjEQiIWErGQiIVELCRiIRELiVhIxEIiFhKxekTE4st5ZGIhEwuZWL1jYuVj8UaoWPCcspZ38zk19BLlAfzu1SLw462L+d6PyQ2JnoOpzt2IsiqhfSR+IfELiV9I/ELiFxK/kPiFxC8kfiHxC4lfSPxC4tfAiF8/kOTz43JB+NYvEr6Q8IWELyR8IeELCV99JnzlZrXjE72UzUGCFxK8kOCFBC8keCHBCwleSPBqkeCVUJ8eu8KsHviihCmTWKAgwwsZXjUYXlXqdToUr9xCHqldSO1Calf3qV3K6Lvp7Foqz4DsKmRXIbsK2VXIrkJ2FbKrkF2F7CpkVyG7CtlVyK4aCrvqPe3o5yB5fMe2XagzRIYVMqyQYYUMK2RYIcOq1wyr0sx2fJaVtknItEKmFTKtkGmFTCtkWiHTCplWLTKtMJUWEq0wlVZtnlVpKY9cK+RaIdeq+1wrbQzeNN9K5yGQc4WcK+RcIecKOVfIuULOFXKukHOFnCvkXCHnCjlXQ+NciXAPGVfIuELGFTKukHGFjKuTYFyJea07fKtCg5BthWwrZFsh2wrZVsi2QrYVsq2QbYVsK2Rb9YFtJdQKuVbItUKuVX+4VoX4uy2mVd472PGs8uQla9KSNqEgKwEa8w9gfSgpMdaVSG26OAmq186jNiR+2A4DhJSy7lDKuPL/NxLMkGCGBDMkmCHBDAlmSDBDghkSzJBg1jDBLO/lADv8Ye1Hsy/SOrTg7vJsCaEEmsrGWlvlmxnK7ScVoAy7EvmE+/ng5VxbUWmTQEeg+yzQI2TOIXMOmXPInEPmHDLnes2cSye041Pmii1Brhxy5ZArh1w55MohVw65csiVa5Erp938LK5JkDWHrLk2LoMs6tnp8OfSniFxDolzSJzrPnGu6ImaZswV/AFS5ZAqh1Q5pMohVQ6pckiVQ6ocUuWQKodUOaTKIVUOqXJIles1Ve6tHz6QaLmO3wdkMYuRMYeMOWTMIWMOGXPImOs1Y64wrx2fOKdpEPLnkD+H/DnkzyF/DvlzyJ9D/lyL/DnMNYesOcw1V5srV1jII2UOKXNImes+ZU4TfzfCnIPnCuW/m8+pcZfoGuBlrxaBH28dyvd+TG5I9BxMy85FlGIA7PHSULw0FGlreGkoEtWQqIZENSSqIVENiWpIVEOiGhLVBnZp6E2yjMg1ma6jOHgmoh6kcyGdC+lcSOdCOhfSuXpN51LObscndRmbhdQupHYhtQupXUjtQmoXUruQ2tUitUub7MK4QEHGFzK+2siTZlS60yGCKbuJdDCkgyEdrPt0MKOPaowUpqxlT2qYqazKjQCkiSFNDGliSBNDmhjSxJAmhjQxpIkhTQxpYkgTQ5rYwGhi18SfIUsMWWLIEkOWGLLEkCV2Uiwx1eR2fJKYqVXIEUOOGHLEkCOGHDHkiCFHDDlix+CImdYnSBFDilgbFDGTzp0OQ0zVSySIIUEMCWLdJ4iZPFTT120a/AQytpCxhYwtZGwhYwsZW8jYQsYWMraQsYWMLWRsIWNrKIytN+mq7SqcYZIvpG8hfQvpW0jfQvrW6dG3Kme643O5rJuIxC4kdiGxC4ldSOxCYhcSu5DYdQxil/ViBVleyPJqg+VlrYCnQ/mq7DLyv5D/hfyv7vO/rH1X02QwWw+CzDBkhiEzDJlhyAxDZhgyw5AZhswwZIYhMwyZYcgMO21mmBQqfib+t2syJxGssi73W9e+dj7DCjBP2kjn8QtaNy0+Bs30+f4dAy0F0UR+6YEGqKFzv5EpN/kJvFFyR74TfINQJhEpdxY/zIxr9XtCRU9d0vIbCXdfsMciUbf2TUVS73JJxZWommNSyS3JdkyVu+H5zVYOiQUlPCeFND1vSx5gWL3nFY0xHf+izZUbRl3o02qZUIXdpMyHHTRBetv9sP37J16QcueMVxux/WlGA6iSzzV7FBgIhvJeoiCxLO8ze7SqPIEp2pUoHq4ok2/+2xSYcS4MpcnGQZ+S/6nSP6HgbEXN/6xa7qU6VKYoaWzZsObL1N8tUZSAZiNpQxOUSK4xJmJk9ihXBqtHbyM/jP0pSMquaKEV9QiaMttpawmXxSVgyar0kV/50Um5AjWWLPo2mapopGVWSUH26sdlxZ2UVVvFZlKsH5X9V+73ZoOl8HxVg6Z6JWMJ5pciC2M9f8jeUizVy5g/Vyx/sXB/Cn4lM6Ek8bvymijbn2MY011uQXLHdh3uhKzv+G4nXVuod/rmZ+e/sQ6kfuD3cwf2MFcReQ6W63ixoaKjrofhV3SZ4WvKOZsFc9aAxLkTDb8DCAzW2oLNvqBWQmauroAPYZxQwaYcL98JyYuya+SZRJttLdAqGDRYqev6mI6GS/VzVOrw+M49q9C/nJuT9E/h5aQ5qgkvd3x/tJ1JNf5I6nGVacmPTsoV9NMfFfqP/gj90UH9kaR/Kn8kr3FPxCNJK3GdT5J7XemVcg9PVNX01DMVRwF9E/qmw/omWQML3olFyqfhkbJQXuOOtqBAlUFJT05KpffTC+U7jy4IXdBBXdBW/bb+hwP53jUBr/FMFpvL/O6OHspXeykFrN0y9p6z6ctKtLn8cj3Y3f5gpgE0VwPn2d+aZ02QaO6Vv+U7taSKuFj6s5KgmbaVpex5wP8po+7wjfATnne5w9RhnpR2gTPz85eqgeJ4GvAxl0yYMbQ1tSv2W5xLU70tvWKtsswT8u9jjc6U2QRXcPrzQyJOpybr1YJ8KTSSkzv5odWvdFz4Q/kjrOy3oF9+/VpWTdd1UTXMqtGgnDXOEPawzI7mv51PIfDuJs6nn2/e3ar2nvkRQW0xs2CaQFlAIgGem7HEDunj9hS0RuMYJZ5vnsciOwCczZgRn82kbNVAJ326WApX6+TCGQUucS8UxbCN8oyZMg/IYsapFOMLYLjHj8s1/QRSjZx73my5vl8Qbx3CKdPpEnbovXNFoc9+FPj0Sb5j/bykjt8PNw5bYCWBv2A1wOJqTqeCJObNhR1r3qPzWNVQP6IvJXDMVfHt7SNrIMwItEnbh1mSE54MJWQb5EHo/LKhlYRFniYvJ8hR/BnhU3DhWEH3S9p38QnVqSUM0VpxYu41NIb7hHMn4Esjdwe38dp5lyV1+C4SqxLO++T8USCo0PkPzhQF+fway7lD6HBSrXNVAzW6GkN2iNTx0JVPQEfmwlnqnv9+nOkZGxPIOMGPM1AJs8wxbFnnO4slsGmCJ6r3XCGD7NDGE6EB2aXDgfIYmIbZ6Q335F2mapJVt8DKk3ropY/kpQ06I/i/qeIyHrAymJGUWx1of9kBerBW+Isd9P2rul3PgT85j7L46Fz9lMitcM6OH55XoQLcw3z6X07wRKehZwIHOy+d6SOZfuO+JuSejE4cccB1hc5y/ACo8wInK6dTGriHCVDoFSVzMpTvPFz/8iZN0MDIgq6FbHPEbhoBZ0bPhCvL0ZG/majMfdxAfZnVW9VncFq7eaqvSmJ9dj4zS+KjdooXyhBDc2xRgETqkmxPcnv5VxhFnHFMpZZKzTN7yrHGhrOhpIOjbq7xmDpb/dDGMe9mejD1nPqH9cfw9OOx3+ArR1It8/0GdVvbboOaF4fQN1nd4GjgB1gGv4fVrSE7Ckv0Aj8skrCkf1hnE/GyhCY7TdzcLcDZuZ/E69rMFF4OCjHUIqE4qtUXlRUtJJjtvMBgb7lv2F8f3ho9h6e27MudkiLJp25yVl21ABrrDpxLpbiy8ZnbVxQvU+ByQTaV5sAsy4rzUi9UrofDstoL72vhdW1tPIrJI3G7VMUZ+bJfkSZX+/WQZlp57XzmXOnsyFMaKrET3GyIWd68NFEh09/zWCCJDt/ggDQ9PP4JHh4TTUVw3JxGZdN1FCQbWNWkSGfsfAe1Tf2QnSWEbzZOEsFZLAiMBTkzzeaZ4uEQFmtqgoZCfE+bOaVhOA+rYziizmLNi0KaQEiWFdFlW9rHGZn76wXLtfhdegpRU5O/Th4vWKLGZxJFkKmRDQOIDNboLJbkoWpuwNSn21+/0p7v50PPc2QUEzLeXTiPyxfYObhgR/LvZD26Y0tBaEt6lE25HOQVCWb8dmTSI/mrdURXmax2GluLkyWxiLnljKwQfmsKLzUbNjtCh+cAKbSZIS2uvY1lFmFj0ZIrqrDmnNNSJaAprvKMlmmRrrE0xyip8eXZRD9rF9KNyUNlk3TMMBekfq2wh2EcUq4JP7DIY7mO1GlPlblOhYPIbFOBT20r2Opo7vhHTKhZJpE/hwOdybIyIZ62j3mVq9izYfuorfnvorbIDcu+Ua23RFY8jYpZ5czLbXsX7bJqY307uBWb6yUNVgvlQptskQ3BJDdQVvkgc/b/x4k8Zoo0fKr36QI72nj3/vTbcj7XjLT41v2e/1Zkmnl5DBaEZQ4zqQArXhvAaLNRbvF0BjPn1Gfv5J9VS9N8EtB8biYRopxXpLCyVh+OitFJxssa712+qig7G1BVhhiG82yTgbJtcT3fpFBw2gTjs2P3/wPNqS7Q2DxeSJpQs7IsGaH6QYNQqf5Lc3sqYsvbJU86Y1VOIVq1emfs3pCIru2Cf5Hb5U0SUa9flfuskFWhMpSVvYD5tbFZq7iVwYoqdQxZHiAPdgNSrbusbNtr582C+lo2vwn3IXZbeMolSNljUQi1Cb4rQYsJ2SwcPLFVNjV0i9dnQUx9RUimkMXCQvULztCdQh9GFYO23b+CF2H+hh0WEUmECV3l820oVrhFSdtcc7BPRNcAC8IKEVmqYOkO3ByLkiROlPONbNg6lrGJIjKFVCezv8LARiwnu0VxEPncp8ygLAthuhvHp66Yy9eitBENsoCvtNiM6bsRy6m1piHAGnZCQ7bwTsQOnUVpIiILHsJlVE7zrlkgQofKiu7+3Y8Z0LRN5Hk2vrSydZiYgnBNXr2y8SKZZRlyT+Z2PypSvBXLdX/xI55XS7gdRV+r03ml/23YzvIo70KLqbvk6sd8s0aXfiyXY1d1CL4ir65ABuTk/NQp5EyeJ93hN2hEz4UE8Ply+JPgXGg5fA+UuA/uBc/rEzAW3T0ppvXJl7FeURdMaOgOyR0lTxcm3GzTbIOGIuBEpw+XF7C9+38CvMDfX7ILOTbGfIT6BD50FcKWgqwM2Nf3+PDTZSlPdlCh34vlA6yuWAaF6pnyLGXhsf1iaLty+cSzq8T8n1UJMzmPcO4HcAMLWwb6TtabNIPA+W/sj98r02CyVrKrIfiouu5ZxbRpnDVZJunS7FFhrdW+gk8qXHWpS4xfCGT2AXVm48pHIeSdvzCUwhXZL2RX5AzYWQqo8K19+pihoBkJA8h3vaaCi+h6JmKwUprQgOk4TDF8nlAgiNuSskRZtLjRhiRjwVXlveRUDZ6ny2guW7TvgtXKcnrSCVjkMoU+XXL7hxYao/ENu1jggcCMk92yw5YcbLDptDQlZAbJbJbmNJTfCFmxd6izuODAKPMe6xVzLVmLzT2Lk+XKCdiOuLjWh/kAENkYbH2bvTSITW4tgC1XAZE96b3Ha0MZ14RJK0jWIlO/8GPpIAkFTR4j8mJSQ4AYxK5vQRVN+f5FAtSRhQWm/m+bv4atZ3leBhj0Ubp+NVsmg45EeFVKVKUNX81+IpinfbHaE+BTeZpwVdoWy3EccklYKx0ef25PP2fOFrpLcxUZaiqbXk78tkNgIxYunCoitdLwit6jF3K+/CcYOxgB9YcP3NbW4ZRvGKS7EYKfRf3KkraDZVCDqedVySOy6QDMHLhVfBWxFvcFwYr7PA79b8QDiP0847SpbkOCh6GavFmxVWUqmb24s7fR5naZpVUVmN+gaNbKEeg67VrTaBtClfLVNmjZw1WtYerFlh5tKXmkSyNdGunSvaJLmybLDtKnu+s9kbZsTVtO6HI9YXXwwU1rGzaT2WSJh2A2m+uvxXQ2Fd0U89nY/CEyoZGzrOYsmxTFisOMrGNkHSPrGFnHyDpG1jGyjpF1jKxjZB0j6xhZx8g67grrWBni7cdCNkWLyEpGVjKykpGVfFxWsrgPO72KyaVySzbMgb6DvzpERzbuxiA9GenJ+9OT1TM+0pWRrox0ZaQrI13ZzP81cR16QF+ubj7SmY9DZ9YxPajwlEJrgJZawB0HzHwuNLNfDOhS43fnbBWKaJ8RPUTVQ30xMaUrNQIZ08iYRsZ0jxnT6kn21JjTB/WuyKTen0md9gEp1bamenhqta4dDVKs1VW0Q7XWdAcp10i5VlOu1QqD1GukXiP1GqnXSL1G6jVSr5F6jdRrpF4j9Rqp10i97jH1uuCJmqBgq6NHpGIjFRup2EjFRir2PlRszfYOUrKRkt0UJbu4EkBqNlKzkZqN1GykZu/CbVaTKHpH0TZ1A6naHaFqF6kkJc52QYr7EWjpAuJHGhper8OQPvieJNPHYVG2FQPQeaa2ss1WlDDFm63wsoeqVg0qBfz3b+WP4gX1aR6EUl4MK4VZrK01CBNQhE9hzHLas6vVe6p4EsHbSrWQ1428buR194vXrZ+JO0jnHrJ3RoK4PUEczAAs34v42HpzGNyB08L1ln4QNrip+nokcH3JjXG/DY0fIuVbamPZ90JTmV9FprgtU1yvXlYEcfUcOCl/dIH8cuSXI78c+eXIL0d+OfLLkV+O/HLklyO/HPnlyC/vNr9cESDuSSvXh5rIJkc2ObLJkU2ObHJLNrlh5wdJ5Egir0EiV033yB1H7jhyx5E7jtzxCtK1nlbRB8p4VeuRKX4kpriaUwL8cIXI9uLv/kCSz4/LBblRIzknzAfP9bzrRPBCY22oXrlX2qB+D091hiH/LQO7QsJIvUbqNVKve0W9Vk16/U+h3aJ3RAa0NQMa9gZfYEz5dtywmc8qQzsE5Vldby2us6rIpkjOyuZiQmukKacaolIQTGCNBGMkGCPBGAnGSDBGgjESjJFgjARjJBgjwRgJxr0iGOdCu/2YxaroECnFSClGSjFSio9LKc5NNw/cWzF/KTxXhzjFyt0TJBMjmXh/MnF+akcWMbKIkUWMLGJkEZt5uCpOQg/ow/pmI2/4OLzhAhMDZCXLaC+253s6P8MuzrtslTEksnCp910nDCsabEOLKr3WBnF4mKo0LF3YkogtpI1EYiQSI5G4V0Ri3YTYfzLxAbwlkoqtScUAC3ngUbfw1rCJxTrDOwS5WF93LYKxrtimSMbaZiPRGInGqZbolATJxkg2RrIxko2RbIxkYyQbI9kYycZINkayMZKNkWzcK7JxKbzbj3CsixKRdIykYyQdI+kY8xjbcY61myzIO0be8f684/Isj9xj5B4j9xi5x8g9NpN4dfSFHvCPzU1HDvJxOMgK4gaVWUlWtQikQtCDZCKLvveFh5w1dxculXipTQ7ykFRoOFpQZh9r5YzcY+QeI/e4l9zj/BR4Oszjlrwkso73YB2L5TtyjssGd0jGcbHmRvjG+UKbZhsXmoxcY+QaF7nGeRVBpjEyjZFpjExjZBoj0xiZxsg0RqYxMo2RaYxMY2Qa95JpfKVFjnbgGecjRGQZI8sYWcbIMkaW8W4s48KGCnKMkWNcn2Oczu/IMEaGMTKMkWGMDGM7mm6eqNAjfrGq4cguPja7WIyAxC0WAtqLFgq0k2vYZonpeuAnzuUbFL1YNQBd5xir22xDnlK92QbbeLBqNUSl2JKP7cSODGRkICMDuVcMZMMs2X8a8sE8JxKSrQnJYG60MjG0nvDxw2YlG4zwENRkY/W1+MmGkpsiKZsaj0xlZCqnimLQE6QrI10Z6cpIV0a6MtKVka6MdGWkKyNdGenKSFdGunKv6MqqCG8/zrIhVkTiMhKXkbiMxOXjEpdzk88Dd1rMe5p2PDpEZzY1EznNyGnen9OsXAQgsRmJzUhsRmIzEpvN/GAD66EH7ObK1iPF+TgUZzXlg0pOJbFtP4F3uKWVjAD2LKws6AS7jsJMAT4T/9s1mdOZLJwS17vevvuqAp9jkGolNrfFAfnzBhAnhzLyp+WPCqymbZ+p54pjx/uQRmI03CngPt4L7SVUyrt5qe79qxJx1/OCMEioJpW7RZtX7sG/lT+yqrn8mhRWqqhz0tfuh+3fhSG6VDbbLYwG1an8B5q35Eh3IjewPG7x9JHM1gtSZ9zoqr9q3x0W+xApZH9s2XfZV/BjRhZbvoCCHKexhRvRi/Iwmm3oRtt7nQjsIG71m4kff4vVL8AYTuCH+mtJhJOSiCuBcybnlf8S9lzI0IWdJazu9ymJd0tjh5nIVsZiT+Fyb1ZuTlRs9+BStRerHivBH4jMW5Nsze5cr0PQmnfmFc3ZHev9+A6KzMA0jhrG69WKHz564cSKjAltinbPflkQ2N6HSfrRATQOIhIZftzAfuk6FjQAFlrQyg0l0m+DJ2gK4BQQWtAS/nBmS8gSms7XUGLkv6c134jBzOTFpOHmplnXUyuHXp1TEZlMwKimkpbtoMMvUZCQgykxM06oMbpUjuiHcBGE5DN7Ajb2ATL5YvvgNYnXCxWtWOFfYRNO1Y0tZx/25pSc9e0j3qcQWCWTiod+vnl3q7dly24d2di5mpyytb927hiNmXVxKabaS46xLp+ChKGnfByiO+XpndRfAIWLsy0AS4lVmz9Qk0djKa9KeSISLxfPhMX4DBzllRiI/7yFF6wKqz3+em6OVec9+4tgxvAfj8znZJrE3XF90qCoeQEgi4gZ2UTIRV0BnA7gVHfG0Ss2y/UXL/5GsyJZh4E0bJPdXmY1r5ZBmExEL93tR6rt3PHupzG3MwJTgQYPYWYzw23kh7HPQIV9DikpH9YeWdn5gC/7fZwTvYUm8E2qhk7ZDlauDQpJs4aAA55mCv1/O+kKQbEIkEkU2mJmwTSBsi4cKLCixFrKVKkoeBy3vON1QsdxT9LaVc69gwdRT9HBnOzxSlmXDnGeMl9frQOUclHaA167HZjMta7vJyTzRwS3/6IVmQvUsfRE49ncQ1vNTMr0oHykjD+8/1lO+43QEzzKub/IlMc9ZS23Ot+Zuu8J/NBTDTISbfqH7RGUFk48moGBLdm8EL1rVouFJcVF1VhfVIla94AURHuedDRiF0i/V/vfjKCZqmaNePCGJFezfxK2qT28cF/u/XGj/nxLWgr+hyns9pfofjqoNdfpfnQfJJEfbVI+i7Y8LVlbodHuz/QHmQkujEUzIjhCS4dkDoX+hca2VGAzbVNoExa7RAx7arqtFiNAgQBFXwEKhfH2B6dAJ9i4EzxZ9EQhoEOAKMpqa2EpihIbglRUbUVkRd34zPVYwSslB2P1ltIfIELTLYRGYTTWQE2mRJPsLz1kU9KhSekT/ctKVZooP+0fEmRenSMg1BYgRNcd3tYPTnJRUg3IQFpHDxsq0gzEcVEjbaNaApAGrw0YRnUqjKqv/3voNiJMiDD1FWEyz2IINqGXPGncyaz+h4CgqlpQC40yF94QMFXRA8SoEKNCjMqAUZntB+Gqw8JV1qt+RK7aQq6SrQi8IoqlEU8tCGNzu3yTpnMS6+shwlmKYTg2mKVsUmtQ1qD1oKtC3FlAiMYgGtNfNEbvhLt6U96ehn7CkIJehocBFEz114QT9EU3BiYYWj9oKAGD9W4E63r9tLzircuxr9UKCyPf9iLfDVwgkiUXTgeZBb4K2TQW7hQWNEMPfwvFdSkMLjXtIOHwYPWj60LdW2AYJmOYfBphstpZ9ytctnYAAwmb1TI9fPisa0eDYbS6ilbCaU1vMKzGsLpTYbVaT08svK5coWGYfbAwO12xaOPtgrDqxFVUVj8uw4frdRjSx9+TZPo4wHBbMQpHjrKVLWoruB60ErTPBo4X1BmxWw4EDynW1hqEyU7U2XpqsqsKYJSOUXpvo3S9j+/PuYKueJLTjfv1WnKQcN9Ufb0oX19yU8G9oe3Iulc3vmzPSIfvGBSg12prLnxZypPyRz3kplutGRE3aA03gPFaUAF4EZeANwcRAFqgkExz8SG/+WfwKAEfhk7BBGmTDoMTDE0PuirEnQWEYTyG8ScSxueccOc32Xcz9KEE2TkZHiHKLtTfZJidK7qdODvfetw8x4i5WxFzTj/7v2lut8LCoPdwQS+/NrMc9XLZ1LmLkCSfH5cLwq4UHeBdk3L3j3znZL4pbd09OUx5d01o1gLBMBbD2N7e9ahwrl0PXy0N+nTvVFTI7CB3KyrrrXfHoqLIpu5aVLUWw1IMS48clqr0svfhaMUKCcPQ1u43JIn3AiPvxTD0oGayKGpEIe/9YPGZTpLvfp0SNuzDizxLQ3Dc6FPRnJYi0AHLvovC20kwGI1iNNrXaFTncLseke5g3Ccblepkd4jIVF93rehUV2xDEaq21RilYpR65ChVp5u9j1QtVlAYrbYVrc7p4HuwpKNLCTH8VOVKImkgcrm6X0YJmQ03ZhUD0I2INWtMy/Hq4KTePcHtIBSMVDFS7XukmnezfYlTK8365KPUvNwOGaMWa24kQs0X2nB8WmgxRqcYnXYkOs1r5snEptoVE0am7UemPh98KS4V4qgRn6RLljYCk8OGl2ltx40rt61oKaDsv8A6NPQ2w4qxIMaCXYntCj6u60FdtUWC6ZEoooMg7MKL16vVgkV2I816noYKVMVHX3KLRim6SsbOnC7qElDALyaJstMvqYh2wwG+ftU0TlpSzc/O0wE45zr9Iv5J209Ve00FeE/tnsavs/WCzutzukqkT53/VowYx67ngR173u/nznPgO3d8ufaFOrSvblrAiP1znI36aJp2jX9xd6ZssX61b9+XqR+yKIp2B1Qk7Yu5J2ev9lrw7rf0/KLtob3NX+xQhr0rgP++qj/WWcZEbzKqte9gIJSCezwEdlKqsiayUSwPIQ1jwGq4XTkf0MYr/yUcSc5R+6KVOzHP41XvWDw4toQIEKuxwmo6pTTC1gumbp0rjSlCiyrWX6gkW5NMsniuRqT91g8fSLRcxzqBnPqGfWEAjguslBrTEr4yWKm3n5qXGrQ/8xO/RkJe7stZ82uXIhSoXjEAg9QsQsi5Zin3xI9I5CXLbySsPTQg65qFrNfBrO7YJuv7mkVIuwLakuIksmqMnxDP0KfqYhryZzv4KsQuEbvsK49FvfroTyJ6nO1wtsPZbtfZ7mSxSbU7OwREqau5Fr1LXWhD9C5Ni/GKBHXj05lmezGC4eFU7+2e5WZq9TDMDVYPple22Twr+3nLJsMIWj0KPtuuZ9QzWz0o+V/LgrmXxRstukXiU/sfa4A2tcdJ+seFYXuVFT2JdNhacQE3Sf/QPwqGOIEf+keECU6mVRubsv1N5H+YWgoCmPBf+sfA+ibww9ARancT+KF/RLK4iZEBWFzYTNI/+nepSGXUj1zMtjYYZunQewwCianLKEijBvJ8kywjck2m6yimC9WfONYyvF0H5TAcd+9B06SWdiAGrgeHQGbYkGqrggTKsctrch+4Dnir+393i0LZJQKuq0M76wdiv4j99hX7Nc0BfUKAu+9nThZvM6nQIVA3c/21sDdT0Q0hcMbWIw6nw+H4FIloTqfQHJMu74DpsNcm4nf/UAPLVSNiB21hBzEIgA6ckEDK3qd6qhRNjQDymi4lEUdQjcJxYQR1i1pCEYatBB0V4a7iwRgeY/i+xvAG/9v1c6u7WfnJhtAGCR4igjZWXyuANpTcUPxsajse6cOQ+MghsUE9e5+qyG5lhXFuW3FuRMdfGeaqBFMjwKHrlTiJ1tPkKpzh1jmbdSqH5Ljxr0XzWgqGUVcOuO01I6vksQaTvTWdqaUPGIpjKN7XUNx2XujP1npXfMzJxv62KnMIIMC+LbVQAdtqGoIIrHuF2+3qxjMfgJvt3UIWbLXaeuOdSXnCfvZv032PdSYCE20BE9NUGJ4fzjz9dnyl0LZjMF1QnXK8G7oI/pAOW7LYjDz5X9SB5w8R0AAky9moPGJttQR6eTQcfRYfz+jCOgmeSPbHdoWXfQU/ZmSR+DYJPal6X2fazfp9I3pyqTMRi3fVVgAjUbIoz1+tFhAw0H5qT++o30z8+FusfgHGcgI/1F/Lp4x42bZGUgVTgC4EsuYw8Ts0pvRj89lrISuqGc7j8kUVs0htdP/OkmKZn/nl3bX3+eP1f77/8eNnk9Rl3c5LPRdx79l12p9vZHt8HU6IuZ8+fXjb1W6WuvHKbM32on1lcADyEGlsPxs5dYHyaFYHaoVBLhe530iaXcQH7bAym82Zt+bAo2y5hihdBNyu9LjaJzHpTdhPtauggpnQ/6u/pGM+of+vytE6zmvXikRemtluV/8wVo4382E5pWUFKuqFDMnM17ZV8SvlCJdHCIau2q4/3L67vrr98PHnC9OA+osXfxOzHu3dzOr2XP34+eq/brQNEUuHT3TRs3jzCIcI4xs60vE8IPEoP74/kJBEwTQNVMU7dIEKiN8tXc1+LS4xcos7ITMqnPwzxUwsFvBVoQDRhKI+pE378uXrReGrK1gvs+/0nfmarwWW65cM9zC8U15h0QVuGND1cY0VlnoQq1Pa7JVKuq3BLNdkNaAFvb18pV5jlYaImn/pM827aR6ISTqAuudEu+BB8afmSegTfQp+6ZD/KTc1lfGXwrqyOFM3HLtrGDEvLc2wCi2NhmnJajyPnx8N9TMMN9sORmUAtx2YOHM+lgZD2zpjsKZeYw3q5dAxXZS1rDwdbCUHWwoRDZk1gFiWrGQixJcfr9FYd5lA1pFRWkR1bv/0SVOy4ff+IiavaqrYYVQrHdv6SiVPa8VJKb9iu1Qv+6zmsTa8vVXr9psktO4zXyfV3PwHtZxuaYyAmLGDcdeb0kzxgHLNI51u8xPy9dIC1ctaIoC9FDTTXxNhNIIv9n3V3NfwHPiTc2a25+oHOGg1OQdRnFc654L/yxzZZXWKcyUCwhRAdEkPae4itFEVXMJ1cbKTv7JKTpOOxsRiPsxpVuWo2zBLQB6s1APcwrU7DYj9PvI1aLtYvGgvn1G/NkT+6aaI2t8ZB6JHzeSPlZlLZ8E0gbIuYKr7ustWe7t6YZA50neQvtOC4apcbn9YNAPyFU2sHqsvGTvcCpKlC7FbQu7CgZH1uCGei1wkclk0jWf+3SZlaDnXK/JeusB7kbXcmtsCUp/Aj4u6uUSbixy1XBbNwsraOVrxVqy4K4eNXZXMGJv4tXJE9olhc/PcafFz2JSWWtRe8d5ttLldZvQdMdN2MkRXtrRHIbum/c2H8N0X6WnIY4exxlAaQ+kWQ2mTa+z8hedt2uyphbBJtPESVryg5YqKmo9qTSrVUJRrqgIzPmB8euz41KSflikfWo8wLdcfGHEeNOI0TlOnFYHqZiRqRspRaCCiKRz57UGwWmhxb4PWUj/aDl67LOrTks8eY49BLQa1Bwtq1S70hINbe1s++SA3TfZxqGhXrWutRL3qqjD6xei3W9GvWk+7GQVXLlwwGj5iNKyZ1048Ki5OYaXwuDAs+8VOVEt/XIYP1+swpA++J8n0sZvRsaKhfQqKlc1vIRbuujzbp1vGC2r0LN8Gjavg1FncVAazg0rcXpoYVGNQ3WZQrfe8/eFg99MpnFyYDsq3oP33Ij4A3hxGoIXgXK+zTcXk+hqQfq1pfNkIkV/dsQher9XWdOuylCflj47Gr7ZbUmG4f9hw3zAtnliUr54BIbZXjMF+x3FJ8vlxuSDsHHY3T07LLezTCep8u1s4Sd1Z0fV7/C3GFoNoDKLbPLmscHkntRNta5snd0KYJN4LdNyLoectnBVWaE5TZ4YVReM+MkahRz/lq9DLruwbVywjMHA87Dld1axzYud18xMMWInc6b3ijPd+sPhMl4jvfp0SplydDBNLrexRqKhoe/PhYrfF2H85WI4xho4YOrYYOurc4EmFj7vY6amFkHPadw/MziNp75sPI3Va1FAoqSsew0kMJ48dTup0syshpcUSA8PKg4aV2tnotEJLxcRDrabU+VqxydX9MkrIrNMBpmhjD8PLrOXtBZddFGDfZWA1vhhWYlh5gLAy7/xOMqisttDTDSl93vf2Asq8/jQcTuYLx2ASg8muBJN5zexaKKldVGAgeZRAsjADnWoYKSYbKYgUHd8rArmmK6rqm9w7EEeqGtqjYFLd/OYjys7L8ySkYT/SGGBigNligGnwiicVZe5osKcWasJ1h7Qe0X9PeIHm402DOjUUdBpqwMgTI89jR54G9exK+Gm37sAY9KAxqGl+Oq1AVD0VUQtSDcG2n6D//BZwdkuzs71fumAMFiozqrjweqK+CLqsQwptGeebHE8fyWy9KBhYufxCNoyXRxJWrZxmdPXKTmunf2wXbNlX8GNGFolfXk+Z1lI3otW7jGz6zohfcOyvVgtYYNMmUwO7ELcwJ378Lb5g3ZvAj/Jt6duqa19snm/CDgtRsMzYvdq+/mGmWICxvhRLfSNM/otpcXcb+WHsM/MU6zv1WluzGFQ+nCYicwsJx75mS6dbaO9Nsr7/ancHfPsqqDCsHaQkveV+2P5tiBzgY93183lloWXkP9C8xXSAPsx+6y62pwNJHyFhvI6I9+jHbEj+RdsykuxA/a7Ux/zF9sUJQMg4m3uEdu4MAW0XG61dGF3W/l5d652+eJ94z3/xF6tH/y8uG2xvdf/vLhjZh1lDeFzHhTHUS3kb0oB+Shdvee6KQr12PoaLjeM7d8lWzHfOaElrfg7ox2wKoYva0fjuAh57iQIqubuxoiSB/t5ly9Xx3V/ZK2Llcbd9YuW/hPRrt3uYWVnbTbBZ2tW9L5cuj+Kn/+UET6uI+vInGmpdOrSG6TcOMIckoCFR5KyWccD1xPGjhzU857z4seNPp3R2DxOq2BtFyQ80JKKBvfNw/csbR9grCyBtxMCXs0IGIf0wNXgmB3nIHfmbifLW6gbqk1Adi/rwDu9GEEe8cbtLqGOvb9P2vNR3Wk/aLBJ8S0PCW/oHUA7g9/+mcgCjHFk+64bLl9HY+aMMbULsVDBgzdDKr1zoo9Syo2eaWShANSjpOO60kuG+8odoNf1JvK51U14OqPSaiZSVKKii6nviRyTykuU3EhrqZkso0X6Vn/XUflBt9xUzS3k2qVopqu013yxX9nHm9hXFnt+1yQqyqVQeXtuK8yIpVC5/+UqxoLiazVJsEmgEQThfRk8M7ADgV+zQs+a7ryr6rDa4UVkWj8QHOoF7e3Xzn97Nm7+/e/vpx3cXGnPduhg3iJe8daMxH7ftd9w2z8/HigUadRSjXFOpy0/WK1jcKp0arLipFbA+FbdQ2Gq8cslaboOrCe2sNk0ki5wUjF+7ZuUuXe62+lFZPyZFXbLaFhZosDRufc7fAWJK59waOM0NSa5m/yS0k8+kq9iZ3MYBQWhdFk37wIefdr0m+uFH90ES+dEm3bjTlgdJVGOXt9194LrH5KvQP/dn+oPMxKafRTMi8gxLAH8Ohf5F5CvWNoU2YXEUYK+HOmfwEv2B+VDbEXXsNepIJedlSjxs9FFhQIcAIZXV1sIiFSU2BEmq2noayGRmA1bwZMldW72l9K6IcB4O4VSorzXQmSnIJPtLD3mW9GNS+kT/slJNJspPEUlFJBWRVERSEUltEEk1x9IIqHYLUM0FMFQNZOnVAPGkYKsPUKumuQNCXXsiMISkThOA7bf62bkRhGXRBhCWPQgsK42thxDtxM4/HQKtrWpBvXuKjYU3dVWxuQcI5yKc2xM416zJiOwisovILiK7iOwisiuQXesgHUHejt2TrguH4KZ0tVBrQYmb2yWN5aj/XE8TEdR1F/lVNHZQuG8PhNXRkT6NUbSxhK6mGEQMrssY3IbOuFAJ16i0uqFDcHorOwwAZ6q/JvymL7ox8M3Q+h5BbwhutQ9u6TVl3wSPiBUhVoRYEWJFiBXZYEVWEREiRV1DitSLdgYUKSTaGPJQyIbZD7io0OjBwkYdF17P4KN+juYuFoJwEsJJteGkNJEy4kq2Znd4fEnXjgZxJnUVreBNmt4g7oS4kwZ3UmsM4k+IPyH+hPgT4k+Hwp8qQyrEoTqOQxVX+yVAqiDiOtgGVYEfl+HD9ToM6ePvSTJ97CwepWjrkGCoHoiq/eN68YIaNl++cfZ7rK01CJPjnO/sr6AsTK0/Jzu7oiqImR0EMwMlX1Cd9SKutN4ctHbgSJnejg8CkJmqr4eL6UtuCg4ztP00Dj6W/SOeSDwgeKbXL+vjiGUJTsof4fFAhNwQckPIDSG3JiE3qxgPkbaOIW3qGAHwNYU8m8NqPrOArie4Gm/scIG1bgqr+7yuHo+ijSUgjwsxqfqYFB9GBKV0VnYEVKpQf5OwVK7odnCpfOuRnoUIkw5hymkK0rIQI0KMCDEixIgOhhHpIiIEiboOEvFFexkl4hKtgTz8QJLPj8sFuUnoXNRVeCjXyAHBQp0WTufhoD6OnknjEf5B+GdX+OeBJDRioIrkxaBJw0Z9VEZ1CLRHXW8tlEdVZEPojrK1iOogqpOhOioNQTQH0RxEcxDNQTSnPTSnIqBBFKdbKE5h7Q3zpyzAGrjAez9YwGT27tcpYVbaVeCm1NABgTedF1LnAZy+jmCV9iOQg0DOrkDOnOqS90KVySOpNg0bzNEZ1yEAHX3dtUAdXbENATvaViO4g+BOBu7otAQBHgR4EOBBgAcBnvYAHouAB0GeboE8inU51YiSIBvAEa7ul1FCZl2HekQzBwj0dFRAvYF5+jV+Zr1HiAchnv0hHp/rEgI8ZcM6JLxTrLkRcCdfaMPQTqHFCOwgsFMCdvI6grAOwjoI6yCsg7BO+7CONsBBUKeroI5YiUuQjhBiDbzgs4h0uorkpO0bEITTVZF0Hrvp2cBpVBzRGkRrdkVr0hEYNkhTMKRDoDOlKmvBMoXSGsJjim1EIAaBmAyIKSgHIjCIwCACgwgMIjDtITD6MAWhl25BL+mymko/FVqNuP6tHz6QaLmOdXNrNxCXQjMHBLx0XEDt3xCVuoca90JxH8CaX7uUeEU7QGoWA/hCzSKE9GqWIjvT2kMDsq5ZyHodzOqObbK+r1mENH+ZV5AWjaELd8/Qp+pi2oEl++lWzNNBf269Q5+GPg19GmL3ncXuZ6mD9ebMww4bw1dPN4eA8nU110L01YU2BOxrWnwatzHKmBu/g9HwcKqlds/yOdjqYfBwVg+mV5PbPFtE9iyaDANo9SjMgHY9o/Oc1YPSbGZZMJ+z8PLMw+3iqD2B9b2ZGUKY/nGhfVRUPol0sFBxqTtJ/9A/CkY2gR/6R4R5Taa66EaJYMr/MLUUBDfhv/SPgWVN4IehI9SmJvBD/4iM3kp/m8rk5jRJ/8D7S3FPDvfkcE8O9+Qa3JOrxOhwa65bW3PFqJkqQ0GGNTaCbpJlRK7JdB3FNBb+icSx/9DZ+yiUjR3Qrl0vhHUInJt1XFsVXOMSu7wm94HrDhNLceiOskfSZyHaGGKf9ks6r0eISx8Cl45BnWl1QqqeUIxhw9MmGz8ESG2uvxZUbSq6IcDa2PpTga1ZpxD8PBz4adKqHSBQ9tpE/EaQDUE2BNkQZEOQrUGQzTLIQ6itW1CbJhCgmqEUaA0o55oaRV9gN1VbB4S69UFUnU9Y0ONBtDADTGSAoNOuoFNE1QkxpzzmYzCxQ0BOxuprIU6GkhsCnExtxzQIiCFlGJJBUTAlAiJDiAwhMoTIUHvIkF0ghMBQt4Ah9WKd6oVKnDWwBhpeUI+5niZX4axX1KzKhg8IMOqdENun2szIKnmscda0HVDqVAS1qxH2h6J1RL1BFOwQKNg0VVnPD2ceErEUqJStVR8CIbNvSy24zLaahrAz616dBnGLOVWkbR0OcrPVL2sKF5PghP1E+haCdAjSIUiHIF2DIN0egSEidt1C7KwCC6ozlaLejgG1P+fuM4vyRAB050z9kJk9eCzHDzeipTFtqnPn3QiVv6PdlIpZReQZIg/f4TGjM6cTvzNbgk3TqPD9ciniSlrizEmiDXyRKyG1Jdf5+/KFFkZj0hc6zj4tlA4obcvyZVs6/SR9XioCJkR4iarJdrBECz4T/9s1mZOI6iZtPDRPelOOfEHOMIdTJwGFCRXyoe/0IW3/l89U+VkE5cT+nCQbHqaxhsesBflhVnbeGc1hCZhAc8Zb6U8XdKpxcvWPMknQJXz+cC0B1xSEAbXZkTL7XNl0/NVqEUyZ2zUlLNNNhFfb1z/MFCE081rFUt/QofHvF+TLbhG6GulJn08z/Zoepp+TiHbHfSf+yGL/dHULAEp8k6zvv1pBOqB3VWOWLfDSP7ZNK6/99ICSTXa6ndZdGpRZPeczK+FzEH2V/dY8w0xx4pAwXlMv9ejHrHP/oqWO4KsJWy9r3pVzFk3kHhd9t5AW81SgSULPauDcrMQ2INKc8ZtVuIm9C/Z7QPsTfZdb+7Bz6D+RmvksK5OxzoJpAmXRpRIt8Cj7HyeqCCq77s+WxynpnthDSbdGYraeze2nxKq9kQvHVxTVr92SnAlcOIfeV2HpCs6twr6T3TiR7f8QmyP5+mptgMhFNbTJkWvdaWxkgKu0StRZzrCKmx5tb3rI+ma9sQESncCPi7oZPMevKu1F8h+2jlxjOAL2GHEAMj2sT6LnYCri41Flvs/K2YYfUITMmBGZy4+7XvaxZixczUrPGrhkdYuZZ1LYlVFXOXYFiog7UbgThTtRuBN14jtRKfLd1BaUwWP3eJupV1tILIZKFzR10jaS5Gr2T0I7+UxOAC6VuzOk5JunIcX2ASw/HaWaKJYf3QdJ5Ecbb+9EjQpVdX+mP8jMLnMjd+zPsFrw51DoX7yYUDHoN/1oExbHSSt60upp8D39QXbRMBBoPjmgmUrTyxR74ICzwqoOkilVVW29BKnlEpvKi6po62mA0ZkRWCHSJR9ueTuWwuUiqH3ABKxl9bXGtjMFmWR/6cHWkn5MSp+YrnlSqMlE+SmC59XguXlpjRg6YuiIoSOGjhh65zD0aseNUPphoPRclAjpdCXJ1MBkpYj2xEB2Tc8GhLefnmwRYTxN6H0wmmrnnBCQR3NBQP5ogLw0xh6C81uU3Oy0DoHTV7WgFmRvLrwh9L6iBwjkI5DfEyDfrMmI6Z86pm+9Zkd4H+F9hPcR3kd4v3Pw/k4+HJH+wyD92vCTqrFGYLVA4s3tMkvhJNYkJwH/K/o1KPD/tOTa+fv5BjLgNvZ1kpf5IRB7BCB2Q6d4b5uIUFQ3eBxWb3qHQWFN9dfEYPVFN4bAGlqP9/whwikhnHpN2feiv0EDhlYLJIQLES5EuBDhQoQLOwgXWntwBAsPBRaqQySGFSqk1RiiVEhmfXKIYaF/g0UOT0fOPUMQT37gd7E7RBQRUWwFUUwvZ0Bo0doWDw8x6trRINSorqIVyFHTG4QeEXrUQI9qjUEIsiYEWbnCQigSoUiEIhGKRCiy41CklSdHSPJIkGQxxiphkwXx1cGuqHh/XIYP1+swpI+/J8n08RSgSUW3hoRInpZU2z+WHS+ou+ArPX6gKdbWGoTJcY78D0KmFgbcn8P+XdEqhE+PBp+C4i+oHnsRV2RvDpo8dNBUb9wHwUpN1deDSPUlN4WMGtp+Gmfhy04TD6kfEEfV65f1CfWyBCflj/DEuAX6arXkQ9AVQVcEXRF0RdC1e6CrtQNHrPVAWKs6IAOEVSGr5iA4vh45PWSV1z5caLX3cu0+yXMYA25jX0jqRFSyHVSSywBhSa3pHQGXLNTfJDCZK7odZDLfeuRqIsaowxhzmoIczboooW6BhDAhwoQIEyJMiDBh12FCkwdHnPBYOCEPkcpAIZdWDUTpB5J8flwuyA1M9CeAEOb6MyBk8FTk2HlE8MQH2mRHiAAiAtgEAvhAEhqbUOXi4eXAgT+VpR0C8FPXWwvoUxXZEMCnbC0CewjsZcCeSkMQ0NsZ0KtY3yCQh0AeAnkI5CGQ1zkgz8JzI4B3GACvEOHAIkUWTg2c570fLGCGevfrlDDTOwHMrtSnAeF2pyTPzmN3AxjsKptCDA8xvCYwvDnVL++FKphHUg0bOI6ns7hDYHn6umvhebpiG8L0tK1GXA9xvQzX02kJYns7Y3sW6x/E9xDfQ3wP8T3E9zqH71l6b8T4DoPxKSIgqrolITWADV3dL6OEzE4I6RM9GiDO139Z9gblO9mhNlsTInyI8DWL8PlcvxDfU1jbIdG9Ys2NYHv5QhtG9gotRlwPcb0SrpfXEUT19kb1tOsdxPQQ00NMDzE9xPQ6i+kZfTcieodG9ETEI+F5QkA1EKDPIvY8ARgv7cqA8LsTkF7ngbvTHWON4SBUh1BdE1BdOlYDR+gK1nUIaK5UZS1MrlBaQ2BcsY2IwiEKl6FwBeVA+G1n+E2/akHcDXE3xN0Qd0PcrXO4m9lpI+B2GMAtjVuomqYCqQHRvPXDBxIt17Fu7dI7nK3QowHBbacjy/Yvek0dSo3rXbmLZc2vXUq8oh0gNYuJyWJeswghvZqlyO639tCArGsWsl4Hs7pjm6zvaxYhzXjmxaZFYyC8MvSpuph2wOiT90DmSaY/91yj+0P3h+4Pd2x6tWMzS52uN2ded+A7N+o56BAbOLqaa+3jqAttaDtH0+LTuH9dhvf4reuGh1MttXuWT8xWD8P0a/Wg0GurZ4sgokWTYQCtHoVp0a5ndPKzelCa4iwL5hPZ9mHcu2t7707tCay28HKYZPqHfnNKVD6JdAhUcf07Sf8wbHhRI5vAj4vK/bupLuRRYqbyP0wtBcFN+C/9Y2BZE/hh2jhc30/gh/4RGS+W/q7ajKRVp39c4E5s5U5sZciOG7K4IYsbsrghixuynduQtfLduC97mH3ZIjpBtbYgnxpbezfJMiLXZLqO4uCZ/ETi2H84hZvHlP0a0Jbtqcn1EDsXbIy0VcE1gLHLa3IfuJoxCRZH+SgbZAORt41592mzrPMqh5sSx9qUiEHFaXVC0p5QloHvTZgM/xA7FOb6a+1TmIpuaLfC2PpT2bNgnULk+3DIt0mrdsC/2WsT8RsR1mqE1XLNhzgr4qyIsyLOijhr53DWHTw4oq2HQVs1YRdVYaWwakB011TTTxB5VXVrQMDriUm182lqhjHeFsaF6WsQd2wCd4yoiiHsWID9DHZ3CNTRWH0t0NFQckOYo6ntmPwGYcQMRjQoCibC2RkctFsXITaI2CBig4gNIjbYOWzQ3oEjNHgYaFAdGVEFVomqBoREVx7UDa6nyVU4O1V+ZmUfBwQZnrK82yfRzcgqeayRQqAdWHKAMt3VtPvD0zyiiiEOeiwcdJqqsUeH3EM2pgqXtDX1Q2Ck9m2pBZjaVtMQemrdq9NgbzJPi9zNw4GutvplzeNkEpywn8jhrIZp91gnImaLmC1itojZImbbOcx2T2+OAO5hAFyrkI4qd6UYt2MAWA+PofMs0lImpQKsAPNJlTPP5qn0jy1iUp7CyoAGQx2ya4eI/+2azElEtYa43g00+bIwcDDtBhBLbnGCC4e6UufsnurE2RYscMDB0sg0IoUS4g2NU6nsp068fvAjh1qwc7ei6pQWyKCJdbigw+i8kPNSAS9pE0AXouXCWSyXqwsqYzpgwfTRAcmDgDdQ+ba6YjPylcMykXm5Es6RZoybmNaZYoXpPhDqi14V/LmUc07vvvNLlakFopEm4Ldb3RqzermFIZBa7fLh9mCQR2NtKczdZkVtRalZ0nItAQWfsJWaIhazHhD6MYmoSbgfwiAJ/EXwL2I1JKy1mZ9MFpuRol2vFC+a7GWkzAzsev5qtQimbHghN5j4lE0iF05W3yuNF50u6NLGSS0yn/mDwMQX0K57nrrysn/ON2bnRenV9vUPMwWKxnpVLPUNdQf+/YJ8+bITSGdGqAsmoHw4U4934o8M/ksFyWK8m2R9/9UK6T2AW1bM6c2s6jVbWmqXpNJcWkb+A81bTAfow+y35hkYSPoICeM1nWQf/ZgNyb9oW0yegb8rZ7ucyONUXHoIGbPpCPRPaGeNrThWYitbMzW0effdVfb7ODuouSaA9TW+XdpzGbW/XRX6T6RmJvTKNP6zYJpAWXS2owXa7H/toxinLnSVvfZnW7S3eiY2VeVAxxnRaIEFpst1EgfwG84WwSCNxWapakM1jYj+ygrje7QAOeR2aFUbtF3cb81bwsVO6y3DdisMUcVeK8ttpNxLHcxWquwCDrFdmq+v3p6oXFZD+5655p3G3ia4S6vs7eW0+7gP2vY+qKxv1nudINEJ/Liom9Z9jPttuN+G+22433ba+22eJ/gFrE+NbbtpgsOeb60pUOksptlz+S9GfyLJ4bR2+Fggkc7qddInk+Rq9k9CO/lM+g8Hyr05Lioot6QVcPA0BNc+duOng1QTwPGj+yCJ/Gjj7Z3MWKGd7s/0B5nZZTfmfvIZViv+HAr9ixcTKjD95hdtwmIXKGkPrR2IRho8TH9wTLSFRm0B0dWOoatUsF6m48NGWRX2dZCs4apqa2YLLxfZVJJwRWNPA4HNjMAKhi25c8t7QhXeF5HcA2YjL6uvNaCbKcgk+0sP7Zb0Y1L6xHThpUJNJspPETFGxBgRY0SMETFuMPG2MSg/PeC4GLUhfqzJ/i2HSpDzWxq3GqikxH0+LWRZ07HjgsyaRrWCN5+cZBFu6xTcVk+Xh6endo4JsWk0FoSpOwZTS6PlIWQ9sfNkh0Cvq1pQD8g2l94Qpl3RBYS3Ed7uCbxt1mREuhHpRqQbkW5EuhHp5ki3deB/eqC3IRxE/FuNf2tjMKqSmuGsBZ5ubpdZsiURRp4CKK7o1rEhcUWTWgLET0qmXRTI0Abbxq66evvlHvJGYLJzwOSGLkO8bfZA0aih45J6azwMKmmqvy4mqS+7MUTS0Hy8FxMRPwnx02uK5cWYCKAhgIYAGgJoCKDtA6BZxVinCJ9pQhYEz3TgmTpOYNiZYiwbQ1kK8c6pIWiF4rqEpBWadgBE7WRk3WUBDXXwd7G/fiFuVnqAyFvXkbe0IoTgbM308FCcrh1NQnLqOlqB5jTdQYgOIToNRKfWGITqEKpDqA6hOoTqDgTVVQZrpw7ZKWIehO4sobtioFHC8AqDWwffodr34zJ8uF6HIX38PUmmjycA4Sl6dWTkTtGidgC7kxJo+2dc4wV1FHwlys+BxNpagzDZ6UDo/iIfmDgtzLY/h6a7oFCIJXYNSwRbWFDZeREXnjcH6Q0cQdSb+0GAQ1P1NfFCfdFNwYSGxp/GgeKyH8WTvgcEFfX6ZX3MtyzBSfkjPHaLUCRCkQhFIhTZIBRpFTSeIAKpCZAQeNQAj+qoBOBGxUg2B0p9ZnHkycGMvFudwhl5kw4BNPZdpl0UyNAG28auOs/8s5c3onSdR+n4WCJMp7PGI+B0hfobBepyZbeD1OWbj0Q+xNx0mFtOU5DAh6gZomaImiFqdijUTBdjnTxstg1ZEDezxc14nFAGzvhY1kBZfiDJ58flgtwkdPrrP2KW685xkbJcU1pByE5Edl0SwFAG12QvXUfALOSKyFfHkK8HktBgiQrNi0Fqwwa8VEZ3CKBLXW89gEtVZkPAlrK5CGghoJUBWioNQSALgSwEshDIQiCrNSCrIjQ6PQCrFHEgcKUGrgrLfJip5aGrgXW894MFzJvvfp0S5hD6j1WVunRcvKrUnFYwqxOSY9cEMaRBrrKhrmNYljJGHKtjONacys17oYKjNQjJDRvL0hngIfAsfd31MC1duQ3hWtpmI7aF2FaGbem0BPEtxLcQ30J8C/Gt1vAti/Dp9DAuZUSCOJca51KEAVQBS0PYAE5ydb+MEjI7HbRLdKgbWJdoTKtIV+8l2C0hDGeAzZbTF4TLKF3EtzqLb/lcbohulU3vkNhWseZmkK18qQ3jWoUmI6qFqFYJ1crrCGJaiGkhpoWYFmJarWNa2mDpdBEtKQJBPKsKzxLLfgnNEsNXAwlJ45n+g1hpbcdFr9JWtAJb9V9YHRn2AQypxiy6Dk2ZBYmYVMcwqVQMw4aiCjZ2CAyqVGU98KlQXEOoU7GRCDch3JTBTQXlQJwJcSbEmRBnQpypNZxJH+ucHsAkxxGILKmRpXTxTnUsHa4a4MRbP3wg0XId6ybwvgFKhQ4dF1cqNKYVeOlkJNj+RX+pP6txvR93Wqz5tUuJV7QDpGYxMVnMaxYh5FyzFNn71x4akHXNQtbrYFZ3bJP1fc0ipAnXvOS1aAyNNDxDn6qLacA3DcfvmCeU/txuik4PnR46vV2cHu5XdGy/YpZKzZszsQ1730I9IR1i+0JXc71dDHWpDW1maJp8GhfuykAjv2bX8HCqpnbP8mna6mGYjK0eFIpt9WwRzrRoMgyg1aMwSdr1jE6FVg9KE55lwXxaw/uRD7dzpfYE1lcjZ7Bo+seF9lFR+STSYU/F1fAk/UP/KBjZBH7oHxHmNZnqAiAlbCv/w9RSENyE/9I/BpY1gR+GjlCbmsAP/SMyZC39bSqTm9Mk/QOvqMZ9SNyHxH1I3Idsbh+yEu87ve1IBVqAu5LqXcn/0963NTeOI+m+61cwXA+SZtXsM73nnAdvKGY9dZnxTlVXh+2KOnNqHDQt0Ta7ZFJBUnZ7Zvu/byYAUiAJkOBFsi7ZEe2SZRKXzEQi88tEouiig+QVqNchxHWZhJF34c1WUQyO9ycvjt37A7haRzmt1w1YKoe0kbDlgfF0Gzg+I5G2K7ziKrZ5T/Y956ezvP3JLhK5CV7aRR6Ojdcmy3qfwka7LW4E0u8YSB8j76AjwTxHCNBxY/VVumAbiH11/91w+6q2e0LvK4d/KBg+mxQhwdtDgqukqgEezF6bin8JcSTEkRBHQhwJcewPcTR0Gw8Pd9S6QYQ+qtFHje8BwqgkZQfY6gLW4eEhkapZvS4QqRrRRnDIw2LoDrLjyEhtsKR2vZqHObMJhNsxEC4C1hEGl8fAKlbiNiC4yu67IXAVTfcEwFUNnuqCEKaWYWoVgkI1QggpI6SMkDJCyjaGlJl5VocHlOk8FcLJ1DiZ2j0ASVQRsgOoAt4M6OjVLDkL5geavFc7xdfFz2qHtxEw7YD5vvmMq7m3TB46nLzeCP+PmbdNl/r+JPftgqgRdrhj2OEs5aPjBnOH0vkUWJ6pJtgGrmg+lm4go2k/PSGOxtM6jPQ/pokp+W97QKWpfBknAjIOTtlPSgIkaJOgTYI2CdrsD9ps4XYeHs5p5GIR6KkGPY38GhDZWiKvabBGRRBRzRO+XKSlWGrQxO8baM7HwXZ7OlBICl9vI2WlRNtdPLsvMV/8okcb7ybzA2cFxF+MxkrzUaOYWJNLEGh0tJnGU7a8CMPlSL1hsMazZlL3X/Fw/puxzagt+hmr2MG8/43yA//jGEOGBf8ZBPPSi578GbDoPID9wPvKnngLe6d7u/C+mT544cWrRdGRL+A3uGurhp6SEbYHeEKJRa0fcVJwp/qhPPIji6LhVPKyenJy8osX4VZkuYF14rPXODVPLC424NmnAyggkTfM+73BzT0U1tKphaakFT76SeLNJxn4M4zFsshDmQEYBXyHhjZAwczt4ugKOuWrZ8Fgn91onvXuLkLY7cUO7weBF4leb6zR84M/eyg04S5A/YFxANs2rhE0S5Zofs3HtvULfIB2onB1/2Cxl70nLyo0wKiFncGAIyteLZegVufWDz9Y3m/wcQarfrbAhnBzfvAKb99wHt7AKkAt6y3Y0EFl30NjbFiw5XnWPHxG3ee5j/bxKheF7pC0xUSs+glbgFP8MdDskG/SRWLFS2/m3/kzsWvF6+VQF1dZqzTWVn5YalzdFFO/YFZkFaK+1oJ8SZs8erXGWs2a7g3Zr4vUsX+V0bhNoe5/KHazAb8z32vOShATFpWWB9r4DsngxmVwr4UK/wvcR69D8eXa4uNzf5ZgO+AmQGMVrbWScJLgTUmwSrm2jH86tGBec8FsJlhnHKjrP0gni+S4Y191Qbh8X4O2MTa5GTX82yyIlhtWGQJtHyTbUoBMdINrSV9PWVsEe9A5gKYOnjUInL1m0KxdwEwZLJPlyCgghhyb4o8aDFVfRLmENH5NcYF1nsgE3OqFdXLrRt6JhcQARRSVXN+8+3fDH5xYq2Dhgbv87A0jbw06oFKJwiI2iW7mBPxk7p1biECik/2C3VlgWyS4Vc/AK793I/TUVUOQHNlCwsmboh5OR8aaPxFjY070SWEQ6/kX0dSUGtZN5pnbg1LgJLcVpvJ4Whu6l1SvuVGiidTXYAuluKOMM0gjqcMaDDCHUlcK/EHRYwUGkes012wFHqGPF3N8QmHCNgL6jcIiRQUCKqpa/4zGplFvb9FInDKz9TwA08Nd+P/0GghURvRM0pPFy2j/iDjYXoi8VYy6bXh6C6Hp1mHpNiHpTuHoJqFofZQwZ+Pjbv1LFCZhWdaLodl7D81e9GYdrMsvr8vK9VK7DDYXMW0cwC1gvYN+A5k9BDF1AUxWWTM1yFogd5decjb/1YMJPXl9wh+7C/fKMz4m1Dc/7x7B3+MRob0Hn9yUTx0QKDe69ZPIjV6c1iWAFUvQ/hl+eHOzmsARxkFh+nfY4B+d2AMZ0F8BCN0vTHGwhouEFkG56muZt4T70tLrY+kdHBKtYMamAWlll61xaUVrOs+vSVVnxRj3F6TOFn4tUl1a3rVvKFcjAd39A90KkTTCuzPmT7NPam+1xPtp6ZuJBtVSiMBU+e1Rg+n7Cmv3gjU3xpnHtt6gJVC5Kai8p7QkbJmwZf0xpzy4rLLeG2LMPH9WgTHXL5/9Os2jTQvecawZfDhnbc1Oc5hHC9xQgjaOD4XWTP6YAGktCXrEpo9SxggrO3SsrP3SoaVRhWdVa2XCsWlt9rw2Dw7Srl5Bm0a363pvDXRXN9wD5l0zcoK/Cf5+Rfi7WjoJCSck/ICRcCNDmUDxpqD4/pOV8HHCx03x8RqvoClULnSWAixvtKwIN98Gbi6VGXaKGLqGXa2gzperMKtRJRQ0nWjvAtErCHpcAL2SAL3C8ySzBPn3InQkVNsHy/X68eih8rYyfYCAsF5KNg8HV/XdAQzWN9tHdY7KYe8BEky4a3+4q14SalFXqpRBlTKoUoYa0a21EAnPbY7n7jdRCc0lNNewkkalPd9XZY0G64kqbWwFxX0BMjjr2wIErxiIq2BVZzis4LMTgtEXlFto6ngh3RIhNgbtkiwTxNubEJKQ7Qbkq9ajBP12lPUDh4DVUrNdKFg3hp4gYXXz/UPDmmkQRHy0ELFaIggqJqiYoOIeoOJKC5Mg426Q8f4Sl6Bjgo5bQccaf2AzELLR+iIo+TWg5FS9ajHlAu/a4HHA049hcH+xCgJ49IOXzB4IIekAKSvoeVRIsnL+fQLIJLCEG7OyQwvQ5k7iP3ri9Gas7ckPEuNj+u3kl+Rz25CzXs9SPY4dWB2Hh1brBW7jIHVV1+2xaX2rvUDSFYPe37IV5WVFdSU2AF7rZceoqESZS9PyV3SHIMHdBHcbwt21Ri2h3I1R7v2mKYHbBG6bgtsVXkNvmLbxaiIoextQNtJ3AfxwIs4Q5w45ggC2glHdYUAOdRxJjWjV1I8YY04JsDmQ+Riki8SD2G8MFuV0DmX2tpS+Q8dIc1KyZZC00HdfKGmu2T7q+1aNmhJ2jxfzzEkCJeruP4b4amVq620Zwu46Ynd7R1QC7wi8My5RW2XQ9nWXW4MFRcVpXwfA47wrI3icVy1Alr94ydeHcOFdJm7iUYpUe0AwR8hjAgILE+8RACTZJDixpZCREG0LlFTpPQIjG8ruwYGQKqnYNPio7rM16Khqro+cTOUwCWU8IpRRJQGELlJeJOVFtsqLrLDwCFRtCqruKzEJTCUw1TATUmmP95UCabB+KPdxC9ApA7qREcAj4AQaXzJnWqBRH1x/gTbX+99mHhM5AhPao6UlYh4TYqqYfI+oKckpIacdhY2EaZsIqk4XEoraQo4PDknVScem0VR9v60RVV2TfaCq2uESsnpEyKpOCghdJXSV0NVW6GqNBUgIa1OEdZ8JSigroayGKKvWXu8LaTVcR4S2bgFtvQNeOLhBgc4U3ACpKXGoA5p1dhtGiTcn+KE75ipIeYyIazb1DeCtJKGEtrYQNBKk7SOteQ1IOGtjCT5YlDUvGdvCWIu9dkZY8w32ia8Whkro6hGiq3kZIGyVsFXCVjthq0qLj5DVtsjq/pGTcFXCVRviqgX7vG9UtXINEaa6VUzV5byQEFXBnRZoVbqT94Au6Fz1RiBAMwgzfXlr2GXONV733iN8uJ8MeWXy1pHvjXUeiKUWCyMbDei5B6ZGcM98BFyi4HCh4zKxRr7t2ZNCE0tUp9BKHLv3nnWH3o0VuPD7eIIWffwQruAbXOlDx5mHq9uFBzYrqNV4Fkbe3HGGhQaf3Mh34akYdYX7FPpzyw1eLG7BgBXEWkeFcrfwZ0nMh4nKgc9kGBcH6EbwApAuLngh1tUDG1TsLe5gGOsHcZNintET9ghKDnyQX16gcVB3YaENP5j7M0ydZ6AOimOmvLCR2xDmKr5hChJIArQoNDJMBXlooW0Iu459CHKu0Uc7hCQ2WFm4jLwogokLWXfi1XK5YMDeaKx0IUFsR9905n4yRsfZSlC4vpkizZNmQPP1dbWjcHcyTCc95PKaumkwdhDbFTDrFtbw7MGbrxawt96B/QRPDf9VBAzHtuPgunSc34fWk+9aN9ye+gYK6dpOGxixX8cZpUezdFr8DzcnA5Un2WUOMzdgBidMA0XBdA4ng0FTC33QyH/61gDUb7Ber8s96YR2qpfmyaASmTowVLugnjYNZ5e664A3F9vafaC5DnhtBBQoYGsDdK3g6cVL9zkYSUqpL0AkxzITbMQURhofF+5uJgk7JwhijRaWqNGlYIzJPYvM/rj02f49zfyWFh7jOze496JwFasIfaj3bRQmfUzJS6Wp94g+HJUs7f19simW2vIWWb55MMp0akHIX/smEJfo8LoQmQ4tyChzJ1IgHzs0sFr58y50TFa3HV6XZK86ClQzCDfxnIp5VDfRUdWRKlPhUurdku7kJh1KOpR06CFCXWqNt2nES9dr6wROdYM93HGkGen+XgIvJ3rwq981D6ZSWP8cXyi1D6LmrX1IyGvtc8UUkpohIpFqH0ONWD8L0Hu1D0nazaBBrsPWD1LmbV+Zt+rVa4S4Zak46YeJJubEmpxGKmClaLZM0w/qx3CBTPGH+s9iaUxnKoNXmRYk/6IbGTJlyv9RP4KrYoo/NIOG9TDFH/U5R9JnXVt8KUzTDxO6LIwuCzO9LKzSkaWs4KZZwftLTsoKpqxg0wvCNF5fX1eDGS0iuhRsG0HEecoKh6UkxiAwBe60iANdJmHkXXizVRSDB/+JZ84cR2RROfVjii9qCNBjlPEIpesAcHLGJW3zeDdhbPPW7XsuSs7y9ie7yGdT3LKtGJKY6eHEKt1G0aAdl/KDw+irpHHTSH11363x+qpme0DtK0e9z9g9P1NDSHHvSHGVxBjixeyVqfiXkEtCLo2RSwMDjPDLpvjlvhOVUExCMU1RzErruC8ss8GCIkRzG4hmjAwBSguOpAf3QIaUrGoBQGH9w00CA8dWSlZFz2OCTNXz7xExJYElGLYXkSOR2jLkWqEaqdBsO4E+OCC0QkY2jYNWdt0aBq1otY/is1WDpgq0R4RuVggClaGVHqAytFSG1gTg5LBtvWVIqG1T1HbPaUqgLYG2hgVpq+z4vqrSmq8mKk27BcAW+aTEa1V8aoF+gf6Fxb6aJWfB/IgzU2vJcEyQqwExesRfj1wC9z6vb+4tk4eWx/p7FzsSKzPo1FTfUebqDkj4wYGyptK3aYTWfByt4VrTLnrIYDWezf5ms7KVSLms/aO9prJjlNfKuDRlPymnlXJajXNaG5pshJQ2RUoPicAEmxJsaprramx3N817FRpNAaO2XGqUBbsNUHWWMsdxg7mjz4mtZSKf82wBi9NyLr3F3VfP/X7h3XmRh0o+9xso7nVhAe8uuxBlVKo1WenzPj9U1IAUXwOTvcR/9LIPazc++xP+mHuLtcrTXWgjz8Fmk7wUIz+tWHJV741wkrbjLpcLvPYIho51myz+beLG38GKw2lO8cfYHFNEquZ2PEZMsCV9NzbR2ROgtfUQPqugHhkw+CsrK1/9zC/vL5yvny/+9uHj56919DyXxtwBUtVMH+b03VtXzMSyXPaXL+fvdnmqpanUrBFzFlctLZlMmpWVUU/doEzRZiAUELr5QtRTs34xnmvJy7QMvABDFW9oKszJe1GFkyIMV1t6XHOVBnJxyn6qNyhg0BT+V/8RaD+F/w33KaGzP4QR2EqSZgamlATpHH2h24XHBCkvpLAFg4HuOGKt1b1cMN65xvNZYRn42SZ6wjhMucXtI3/s3+1ecrnw4+RboX9uf173ElEjmdi5WBxeCdehaHVtJfW5P0uwHbCioLG6eEQ7AawUMLoG9JCvASVNkI/qyJvGbodI91TxNIt8yew4vusLNYNmqq2ukni5tHv1HXhiNGwr8EP73sXYs9qa/8O3ulvtbHAwqrO5/bk+w9pW7EKtUGu9Hqh7x+BBfkEvlmoPJPDQn8fKN67pmsbO1zQeqoiKEcm6zvgeSHk3mOKPSe2jhsXss7nuxFrZHwiaFbhL4+9t6nx6ydn8Vw8m9HQsxWOlGb+iv54fRp9u+/GwdHPmrpsSsIPN60a3fhK50YvTumSlQlbtn+GHN6+vYck3tCcM9rp32OAfwasE5uhvrILuF40s76YybCKjBAAcBQCwf3V5y0txtz12UmE9qbCG9V/L8yUoQQw6E8laPKEkeAYXrSnkZB/hCP3WSKgEoRIHLqlpUcmyEm2MUWTKZpp9qkcrSnpnWvqmvhGlKpoqvyUwpNeqlB7QN9tjpjkvo4UjLdmoxweTaCb/ioiJdkR9gidHyXNyQl7XCekg2Q0ll9AVQld2EV2p3m0IaDk2HdcMc6mWHoJfCH4xd2qNtlFCYgiJOR6hFWOs1rKEzxA+U4fPJGsJcopYjUa6WrnwL1dhduRSWKl0jKELFKQg6KsCQcrx9AsDkQztErTUoxA0YjLhJXQc5XiOo1Qp+h3CYLopg6bQgp4kxwcs7JNHVKvbyYknJ/5YRDZz4fXarJEDT55vU8/3xUnYVi8KBgm+McdXwZPOLkvBPCDXpS/3t9DUzrjBpXFtzh0m2doXt7iFULRiOrnJ5CYfq5us3hD2yF02UxJd3GY1ich93hdfpFL3kxtNbvSxia7SnVZrOXKrt+lWp/u+1r8uMKmNLwRM/RgG9xerIIBHP3jJ7IFcoA7utYKer+lVK4fTqzNNArTjpxbiBag9VtlapAHFXW5t6kW8mogPeePkjR+RN67fP3b73MBuaJmGfr2e2JRmLwZd5ute5sHXbjPk+JPjfyQSm/r7eu3XOP29rCWm5a8o/bxXtAAXwAL450Scgc4dchAxAgVju3t23Oo6knIBqqnvjhufjmeDfvwxcHv32NWIHeQY0+n3PXBhc8pztwPJDZZtJ0czRxIKHO+NEa7SwuQ3kt94LCKrdhxz2owCxFt1+Z4Z7cs+H+dJm1vSvOTrQ7jwLhOwiiiO1+EGPZmQr3mTXn4cvd6oR7Kyow5oY6YbMZUcTorEHtFtdgoFvtPuq8mib3iDnIIE5K7u8MVaet1Nbiq5qYcuquldcAqtRW7pJm9t8xLnGSnuxEhyvL9NZkELz+KD6y++gp32/reZx2hN3kV7T7REzFf0RhVj6dMjJbnZZa+0FfONmUveKXmnx+Od6pT6TnuopgqgmZeqIwV5qrtr/tfocvJWyVs9BnEVo9NpMPJaN+i13gHRHTS3YKMWZAdxLrGigxdydhtGiTcnH6S77ypIuQOeazaSTfitJDG767U2YLwhY8ljJY/1+DzWvCrfC3+1eum381bzZCBfdfeNf6UOJ0+VPNXDF9aCn5rXXeSlbsVLdTnRJR9VsKGFv/HODe69KFzFKpYd6qHOwqRf0ZcsjaRPX/KoeLu5eiawRN25m7gtq5jwTYINuVMLXDI6NIHeVYfXBS87tHDrgVMbOUn43Qs6kQJ52aGB1cqfd6Fjsrrt8Lo/9x6ZCz176XCxLsuvcSrmUd1EL5rIUNMQuEGnk3cRhlBbAbtdW4v2ItqLaC9qg7apVzsVdxODThWLwYXoXE3WP8eZVvsgqoLah9Kyx3XPycvaYIhIpdrHcInWzwIWYu1D0nIzaJAvqn2ssVdpDhJOSjjp4QurGJt612lcVC/VztP0g8ll8KyraaQCt9QvcIU9TT/Uv4Kqe4o/6h8VZJvOVAa86j9Zk0/lX0xmglI55f/UP476fYo/DCYMWn6KP+oflXT9VPps0gdX/NP0AxVL7BNGn6cr0mEgQgxqrrBIWyCtl0kYeRfebBXF/pP3iaMUx4GlK6f+ioi6Zjx94upHyO1NIhqMfNousNJNbPMe7HvOZGd5+5NdZEAjD7O1lDSSAkI+CfncReSzSmfvOv6569qiGSpVxQnCpjJsiuu+PURCDDYJwkMIDzkWkRUjrNJ6LbAR9vpU/Evecp/ecoycArEWrHJSVTxVm78tnCnMid+kL3Vs56RU9HxFd1w9nD69cRKgHT821VYEmrCYPG06QHU8B6gqdPxOn6JqoAmaudEVBKHzVLvratTrdXKOyTk+EokVA6xQZXS8aoOebgR0Vzq6Koa0cFNg/4+TaDVLzoL5EYeLa8nwir6qwdj6dFyPXCI2FySae8vkobc7p3uRitZcJ8eWQsi76IKa6vHdDifvhqZo5uuaUp7Cx2LQjMn7GDxuuFWQr0y+8jGKrxitqV5sHGBm+mPKflJwuU+Xe5ZyzHGDuaMPNddyls/5P2cLWOG8+wFn3B1SE9bPaLaIJ0DVuLjXn4PgoCHLjiiyHT2VfecDe/N0UFhnhb+PoNFxRf+5JYSjGBifmiyrAnjCi212lcb5vGzgSMaN0fFWdixTbiRHgK+e+/3Cu/MiD/TgqcTMr+AxrJbLEI/lAQXQDbmRNcb4htn70htBaN2k073BdRAsXlDjBrEP4uYyqUJrFiXsFr4AhuBHbB38ioFsyUN3IKAstjNJf41YVAi1Z4jqLpVAfB0E24fhS01kfTHb/0bi2Q30NUdRhUlAW+AFzNxgmOClJpYrtRClRMExhqsEfJMn8ITcGCYJboqgwVrMwbyTD/MhuU9Vp5mBFRUWvzDebRhNcReADqTzkeX2mfS6PizYixUs5UfvfRSFml1h+MmPY2Sp2EKyllOXD0jGv7n5D2uobgId1JdwBSoCG2L+FiMzEwsgmHXB5venYZX2EhML2AHNbDtOjw818I3GHYhxI+QZRcmbZ+N3ZXEGIbFQoFFyQSnyp0B7u1Y6ELt2omCXPPkzdn2rWEl/Bl16Kb610f/lH2EzUAtA1sI2JCDtbAsiUNS6l7DCcpqpPIk31tXnd59HD0myjE9//PEeelzd2rPw8UcuLT/MvacfH8Mg/BEmChbBj//+00//d3xqufN5pthQAaTKjSsVd7lcIIqAm6et6BO2AxDWZz5Xd/HsvsS47F/iVB5wD5Qa4WDEDHRXgjDKg5fSudy49BaeCyt7tbljY2kz/AomWCF3tuoM2Rvr/I51y9CjuT9HVRcvvZl/94KgCNtALH6QGlTho/sCXYBhYHmgJFfLjLNsUj+Aq8wghtx7qk7RdMCZD2PYHmeg/ucWw2RAmYJYWiEfE7N5Bx2OBKYSOk0/5B+RhKwgYBWytW252phM1cpTzRFEAz6kJlEFGF4ylySMlM1gTX1wBRY5q3m3YTXHSemG7l1H9Dtn88GAMhiI0Uj4NGVbUOlhwkfpKKoJyid30gLKc5p3Xd2FcgxSw/b5+rNqOG3HYNQFM5+T1RLcCaU6mZSYV4IDs6ABrZzeV05z4e2yhDYrxz0Mx7g3ya1M/GThtSzzgyGhlq+68189EMWnNu/3uihp4fW2ZW19QbYbxQ4s1L3Z/0hZcHws9f9vUqzpZmIhlHVyC6byCbP/Y4ziS+/cLMGGTh9PEYd4Yq2ChYdeszeMvDWwgIs/CmWMdhGGS8TDRIoAIrFo/7+wZAFQUglqlBm4IfduhE5IsWvE05hDkEOu3kiPfUlHwpo8EWNBNGFxUuh4PVcZRU5nbd3Y3JVhXSkWd8MlnMqgSpc5XcHVQf8B6cFAF/etU8Eq1Cs36gLUJROCBZ3qOmgalS4qtYla1SsQOInbunBYsfH6yF/xjdoQdXn8fUWszQdvNuLaYWoUtD4qzrRzbRU6lsdT91CmcdVP1sRtDVjfJDbbP093Vza1TC9PKd95pajWLNY03CqvcKOYKpO4Kfupjn+isE3xh/rPmZhNs0+TipQBb9Fcv5qor6LqaqRUd1Pqu0r8Dkl7I0nXaygxo5FiLdTxW5t+Upx7m+1ez8PxxDo5D57cBeZiRverRy8AJQ/WgW29g68wGLOEWZ3+Izix/pF788SyfrDOrGE6niGHkUU6GCLy0Io1FEVVYBR2zugY/knT5FDMRLSHpp+uQXlawz+dVArn3qy31vJqsvwGPSvoSuVcoZhrlfI4Z+9q7J2ihgUBZoY2d8Xy5vZZ8DJBSAbtadX61GQNjYvGbc46lnIfTxVRq3chRsf8YLZYzT05+ItbDFsqN/jqDcujQWlXtAGe0zNr5hYY851FZ5Zh7HPfYb1k5958xdAfWzE3Thfr32Dm8vAn44H2uardfDIwzlEaV/oGa5p3DMzLuWxqK0IAa5kPyVmZDcDmjqnDHNPRWNkEqntLn/eV9lDwizUdoeet6SfrS25x7eQr3yl/O7aL2GIuiy9ldm3yZCOeZYjheeBjQr//T8+Qa+lcs3WeLF5G7ecgOeBp7dsWXv1fouXsk3hd4drLMcyK1qV8qYJSUyZR5wmlGxrfodgv+eTpOjhBodCyt225nLtesck0zSdcZw1UdVIstl7VUZ7Ehc7kPxYom9fR5dZN9xQFHgLsHAkaY/VfG3/879HYJOm4hKys1cK9F6DK8NaDSrKH1eLP/4oC4LCNNl1BaSfZX3R5oyLHgb+thYj4Qz/DM6NhrkyesBc+8UNGQ00WK496TId8IQ/VD8lFj4ugRfXizpLqZBOmnICc2/XyiQhFGRuUFSG+vbrNrKysR9u59xKHZxWyR2T1OC6mioxKtlfWUH6SBUOMQ8Voif2C57HKwpAqUD7ISpVZuYk35oTgLy8xLisF9aOVZJ/UbETjUpJI9zzljjnKqvxknkSDycfsQ4ugPEYFc5sgy0GGrdSNjTJyrT9MrIfw+bTGs/hr+KxMHJWf+eX9hfP188XfPnz8/DWf5JylVp9LI+2ajqCeOUznu7e+Zoap3C9fzt/t0ixrZ6JO5TZnqipOJlNFY9BkxCo3JBOvWRwPaFqR/l1HtGJipvLxgqqUlZJBqrP0uEJZIs2n7GdZ5QBJp/B/+Q9ArSn8P6lRSUpByFnvvQjCuEROaC1vObMW60a19lK2NaxBiRV5kiKd61fr+dX7i7Or888/mzFAuHwwmKYjrB/O2cevZ3+/1CYw4nbIhgSWVPZ5dBeF/4Qt8CpaeXyT4znOuqUzUC2EU3PkqFWRAYURsb9HlV8/r7LLkemO6S8bLYTRLemhSxUMEtDNpC++Tu2NLkk/HRN/uib/bGotkKy/WsbgAWprWnOaNffG+vL/LP9xGcFmg5GUU2v24M2+8+Bj4PnstI0q4vLsxpY7w7NIQQKkfym0eg8zw6S7+4tf3ma3X7LAahN8N4AvUzkUWK8EwMt/maqTEDp2JgHLJp1pQbfeEur6yfmrjEr1nU/XPaeuRbWXmkQ6w2Q6Rw0SamMX7Ch04extk9Iup9qAGD+GegVk5mdQ707e/7ZE/RHcW3fhKkoelIuUnwyvzR2YWPcw6OG/hNSrKDG2HYGm/z48UeTHmefIGefJmefK6UMOGb/qaveoWdcqwaQdF8GeieY7wESTkisDgwXVOuHNKOnNIPHNOPnNJOzbTxJc50S43RHnXRdlIzGu1x/5aGpF7lo14TsnrTVnQuyBpaTlgjDsZGaAuTnEJC5TrtTNqSmHahfCgWTYNsjVGrTPvsqymab6jKDqQlG5oHG7cGpt7Sa5VlPFZb9myQXdJ7y16Qy0iUD5baQ8kyzrR5svuPsFrIpB4sGbiv+stJ4LCDqWPZq7S6x4alW9MwCvFmvK3L6wl+xfY6nSyyMsOFSDvHgEK8U6m+EhLVEIldECtTg+/8MT9OXa0OCFt/CeXK4908awOlYUSX/gZI3twYDHNNKbu8TzOJgznADo6pTRWBBk4SVhkOaaROPTNMJ/I7aDwEWlcgP9JqxABfBA8DFe3fKe/HUFC6yW4bmzB9FIkQKcEc66jNivcVYop+hPvgX9zwp9fbueWCUldV1syV0BBSP/nxUNZVJQ1nnXa5E29paxR6nb2D7LPovmxCCTyIUFiYWvDIamQg0k3VwDKhQjssrn01qDH1aw+L1vqMSvC/VCXoCZ66/K1Ck0wZ7PT1ri7Drf5rQ8o9pz2g7qJgcECxY7NIFlnTRB0zs2mFP1GNeP8V5OMZusFD19fvDBf8TwYF7Lz1l+x9IL5mjfTNW1G/G7stb8xod1PVFkcD964SqZ/p8JrhVuNMUVObxvrLcMH4PN+NkbPvECPHOL1bcCnbEI77EymxsF3BDmVXr8qNAGq9H24MZggHmBldGUaVieGc2rBkWrABuyi3bAwgtGSI6xNZ1a/6u8GcIw7mGli3Go98O7E5R8i5W4Zqp7+C/+4fehcmgvWY0hLCJ3omzz5M9frqyv762zi/fW5dX5x4/W17Pzq/Of/8LrM4KOClH9Jp5t/T1csSJg6YayBFMNrVlNw2n9NDsb0Q1TuCkz1mNjg1+PG3Y4PMWhaXbOcsvnoQWE9nAXcKMXttuhJczkCwceh0iZjKNY1SnwnrB43my2iuyTQX0+crqb5pc45rTLO/fP4TO0DKNmu1KyQmDVumGCfsOmyOU4zZfH7Hg2A6mJB/cJty+YENgVkQ/DnFvebzNvuS51dI/bCBORufrU8s+fr96f8vpJz0wMmZ8Bja4bEiQXosMegH6evPz2H67uHzLWMMa4C6w7+KIR/EewJ3Avkxp5DCM0Vzw3ypZTodeUGDjahxdx6hss49wx6mTG+IdrNH6GwYTP/NeX9ZzWtOCahdN6kCVSOI4fgBZ0RlivUNJXrHyhWtdiviz7q3K3TQvSsSyNbN/izSO638suWMr5KA6o0LNmJmKo0paAfBzliDAZFGoznjYIqq1f/jUOg9TSlncIJAn8tp6QeGad4oZv2hgxj0dyI5JxzJJu4AXxF1YWcMi+HMpPcdRx+BA+Y9369Gk5e2zdxjf22LWcgM3+rkq8SxOhYpE5ozw+x8eoOg8nOCjavQ9DsBwddk3B7eqOzR736Ec3sUWJ16vwv2I5vykv4PFqiUJoMz8vOxpiM8YKNo11XoYYK84UCPStxiRaz1tON5w0ekuR9nRdKkjXjTS6EzR5QuUy2kSmmQI3MhACmRhKQFvR8zprTdG1jnnl1cvStjeyfHlCuN6TwLBmyZlAwmcVha8b6AJFvoBISR8xmp3qREIUSk7FoYCwsas3FHGuyJ3heOOlq1hVHC9haNHdyb9Sg6VwHOH30bDwJx8srvGJohojdMJbOxFTQq9P8iFPVKUi8eoPeIntbrfhE9aghL3PS91b7sUjboSw4eUs8peK2plL9qzDC1v6M5arV+4M/F5vMdVT6Qr+9T7iQ/bbL5dXnz+9vyigFmXLlTE88uLVQhwAyQx9wVWlHdd42bOmx3XITGtJ2IA0KCXC+sFiQVfrbbh8qZeOHiXEXEp6kRSNtHDNnxMWjSkgP6WJfHEdi5RE2FgfnDIQtl/cKPbe+bOkuk6+PKhv/CT58Lq6HD430eQzTs6oooK+7rhkVbB1yIfFLB95hBXUB7rn5yKauK6ME2McgT/I/FjQ55ou2NbOnxzsqPW3RfOv0ngr7OuFHV1xdFlUhd8zO09lqTWz0jpaaE2ts5QzWSn2lPBsGUxB9rNzXQIZtlK9ml5kdlpTPLGFDSff9ly4YwH8f/m44z0flLO8/Sk9+jiRmMLiJhWv5KJyctW4uhd40poEDu6WYSbtt4Ife22U7bYVzAnMMRwv4ufrrZurDNlHH+PmEI1iBu2zhADpON9t4jz90V0sH9w/OgGI4a8xWzh5cqjtj+9+MJ/WtKPaFwq6pa4JoVj0NpDR6ei1TEll+tUl1qvOh2sEUd8AR5Nz53SnaxC69LeKhsLwu78eAP+1ImdpuXTSiwGyl+QvK15dJQ/TapOT5aisrz6x8RVt7aXShie/ZSchN34dJp4V1Twq7NN0p0XeNhu49Kb5+LF4gaKBVkNP1ocInAhXeeMpKFpoNxVFQ42npPmaLRd+owEGqLnSvQovkwgDS5qXhD0wFf+avThWPZZ3VLJ4wWlVGHWtI/N/LbbGtarwWwpxSw3mrgy5qtOqk+jldF/AhHVw/FhAAwXvs1jNmhr65VwRKanaCDROWEm+9Y+sTYGJYSUkOaT37GXhxZtUluMHzI27kWOKGJdlAWhNY7MwirxZsnhZh0hZsFAQEuOyIs7LQoI8WK5pCwvcZfO2q/ACFc+qbl8t8lmXMsAJMFI0X8g7Y4HC4ttv07GzFMyytK3nFnuJaH6E41WAMBKbPoFEr6l7oxjcjXXrzVwePvdjRVv8qjZux91gPPtG2if4tW3Q0duzn7FXmJ03WylAnjfWI/TpAzet2MePbuCFq3jxYquCHjU8Ui9GAWiwJVWVaGKwiPULZ5jPrBtOTJExFmVWCIKq4t0n9zuiAlh1PJVqFrC+kbIWBFVEBi7QTLqrb92SFGnHlK8ofA5YhUUedhcCDX/CSa2igIXBFc3ksgSs75gY6Ebs5m5oIlxFMw+bWABBmFLwE10dvkf//gFvLkR5W7GsuWgVsLSX8A7s+McwemEpE2EUexPeEfrGipbuovARpuezLOVUhHnSCzKfn2iJxL5iV6wn/klhdyo4pkwZVTS1Lzu2EACGMyNaze2l44L8m/jCF+wNe00qM61iqiP8OzEm+69uzHLNRwLO18ygtVhtSLQK4sWDKWbS1bOENZOy3iStQtqaxIaY5V+DmxpJYV7UbX0Aptrwayivq5hFUYaV501GdTdga/8u9t6z2zCCDUf/GG4RDh9PNYVMQ3GN6CyIMKl9J997tJyJMTNmX/Lh19xuPe4euRPWcYmfkcDOh3u1q7EhG2ge7c7AwkOGYQV5JQr6pUOQ6heWb4A9+RJ47KCVN0/3ImbViAhAKduGrYsugZoLdlfzNgI17JUGcRrxfDFM0xdibYJU84usJ4M+EeoUmWbTGxrcG6sHpFsD0Z0BaEPguQXgXAE0NwaYWwDLCqVaDyS3BZCbAceKoZkDxV0B4nbA8Fhb168xANwI+K0BfPsDezcH9JZA3ra4YiM8UYsjVuCHOtyweLqlB5ywD3ywEhdsgQf2hQM2xwBN8b+U9Ktg4X/3GM0q0LsJkv/dZ3yn0IqDjHPYoU1z9JBhhYWG+LaawoQzdvqDQYRrQJA/EhdeLMCE4BqCtNx67FC6CzskNsePNz2LY5NYLKhYPygM59YdTOXWTasRIfCF1YTKh5MmbJSIpxWbYfIAb0SPGbiUzptfJC6msBZl+LvisFZRBNtAnW1gTmOIM4M3dRZL8dBxDiNTIZr9oJk9IJm9oJj9IJid0Msa5LLAkRJiWYdWbgQU04Jh41JtgqaAQhWYUAUkcAmvwhDM8IN+sIOmuEFHzMD4+pPBoAtGUOdG57y+vr1o1njZib4Epqf1NfYj6VEecQOXOv/aHiVAygOnNEhKg6Q0yGZpkPL6oWRISoakZEhKhqRkSEqGpGRISoakZEhKhtxAMqSByUkpkZQSSSmRlBJJKZGUEkkpkb2nRMo7MCVGUmLkKyVGqoIOfQd2cvGBUnxHupSrr1BP+Z4vivf0GO/RcIxCPxT6OYTQjwQQbCf+o1lPFAqiUBCFgigURKEgCgVRKIhCQRQKolDQBkJBzaxPigpRVIiiQhQVoqgQRYUoKtR7VEizGVOAiAJEBxwg0gUUFLGil6vwbXqFVQlg3YECG1y07XRh2d7jMnlh77zHT1JcqObJw6upoWQe1dhoAFpTjY32oDPV2KAaG1RjoxZjpBobVGODamxooVIzC4ZqblDNjcOouaGUeKrBUfltPzU4atzD/l1wBaPrHPD3v3EnhhzxPXbEC0wkh5wccnLIySEnh5wccnLIySHfI4e83pIhx5wc80N0zAuSTw76oTvoBYYrHHWwSD+GwT20HcAQPnjJ7GE/bqJQjbx8qvL4nHYFWchXJ1+dfHXy1clXJ1+dfHXy1XfbVzczYMhFJxf9QFx0hcCTZ36AnrmCz7UOOb+NYqfus9hAxHyXixip+EEljKiEEd1e0bB6kWohUe2itgiWAZLVGtHqgGxVwEjmSFdXxKsd8mUwdKpdRLWLqHYR1S6i2kVUu4hqF7XFEdtiiY3wxCpMsdL2pMpFVLloHzZwqlxElYuoclGPklYhbRnJqXJR58pFqq2Y6hYZMdGQtVS3aNdiPSJqUAr2/MVLvj6ECw9Fw9uPtMvckBvcYiG6OryEyxxBKNOSMi0p05IyLSnTkjItKdOSMi13OtOyznKhFEtKsTyMFMucpFNu5RZyK5sgYH043DkOlx3tD66/+AoK532qWagG0X541yXGkYdNHjZ52ORhk4dNHjZ52ORh77SHbWK9kJdNXvZheNklaSdPewue9pYj2yUm651twX5ytffL1RZsI0ebHG1ytMnRJkebHG1ytMnR3gtHW2+7kJtNbvZhudlC1snJPlwnW/A2dbH/c7aA8XN/reBzfxXm+ZpHs0XcsFCQaKLkbbdwnrWeedpJekXw67jRqTOzGUc6nSN50ORBH60HvZtO8Rvrox98t1ZL7gAoLDl2EAotM0GLzPPzE6mV1NbBp/1AmDvWkw/OS8ZueGQ0voFHQKNlvqHUBsjq0r3HU5Y3eVcKvBRu/oONd//ArDD719guKnN7bUbD1LPP20AAUn8d+13EtrN24B373kukpSf2Wz/2A1BcMMRR+ugktXIuxRdS1bXxxEIFlz07bgE+8DfrAIj0KQIhCIR4LRCiSP5sU6qEIdKH9hqI4ETeIhDB1NXmcIgK048ACAIgDgOASIWckIeekYcmefRFR7pvCCJtvxzef+cG9x6sfj6BeKdqE2tfKQy6w0VBO1yruDBJqlJMVYqpSnGzKsWFJUT1idtCfQaQX2vorwMEWIG3mUOCXaHBdhChwdCpPjHVJ6b6xFSfmOoTU31iqk/cFilsm7bUCDLMwYZmVidVJqbKxPuwdVNlYqpMTJWJe5S0CmnLSE6VibtWJi5swlST2Ih9hkylmsSvnlRajA6UAjuXSRjBZjRbRbH/5H3y4ti99/YjvKMceoPqxJr3izmqOxz7Uc6AIkAUAaIIULMIkHIhURyI4kAUB6I4EMWBKA5EcSCKA1EciOJAG4gDNbE9KRpE0SCKBlE0iKJBFA2iaFDv0SDlVkwxIYoJbTYm1C5C0XeoSB1MKAWMsDpnn/Gi7d1iqRp5g3CR+vXXrGiyycKgqtlSbZMGADfVNmkPUFN1UKoOSoU5avFIKsxB1UGpOqgGVjU0YKhCB1XoOIwKHSqBp2odld9u+NrLKo+xb+9d1VfZeQe3D8zi1Sw5C+a9Z35erfflbbjztXNp4NsbtLVHaaG1s6EUUUoRPYQUUckT2E6eaO3KopxRyhmlnFHKGaWcUcoZpZxRyhmlnFHKGd1AzmhbO5TyRyl/lPJHKX+U8kcpf5TyR3vPH63dlimXlHJJXymX1DjE0Xdkqj4aAWwaDN5U/GddpI4ps7osFwMdmK1Q9dLgjfUlhrHcvqS3KVlfPff7uikf3btHLwA+gSHKjD53BhZjqtTBAZwzJB9aQv/4hyfo0rVhMKCSRcbGbOFDA7E9GLBr+lIVketICs2MsjtD5AeAo4U4HXOOdbG4P0hhOXjMvV2UMJ+34vtv3zR64pGT3hYsuJ4UGjhDWxVbuF535nLlxaT9lN3V9C23kGxYSLZ4yBaa7roU0VO8Xju4rA2m3rLQIIiVFNyD306LnYENJXc7qrpTylijyoOYpO0XL3IQyzl111NGjUqP5z3y2t7ZWgNJsZb4m+OVHfaUTexPkhFZ5tHlS5x4j4JTZa2nsD5t1ihX81+C7wG4bSo9LxiIilIa5u//YZ3olP7Jlci+WsUrINULd8XY4nVhRXhL+CoAusFXKW3SXibW84M/e0hd9Hi1XLIJ4btZmaV/BNqurZNLz2Nu58J/9JPYwvSpU+shSZbx6Y8/Zk3MvSf85R6MbrQDf7hf+XMv5n//gb/640ltfhHX0oK0yF17vnpcKjb7f6nTm/g+Ozw1ERixfq7Cd/6sIriVExiMiAj7wzSL4ndNIqWQ7D+7ILWZuw+Sm/n+p8VcGenGuOyhSU7vqBJmjEmqJ+umSLsmA8yklrR64+f3QfVzdUlSncUuM6n6pE7aaEs5K+6ZMThk89XCM9g3eTxX2kFMc1xy1c2s/26WDlP9fOEqXuXD8D0Ln9rvxYdyoo0gQnEWaKc578AivYIPeM0w/vv/w0ByPEGdPS7DBCySl7oYkjQk6S37fP15dzf+rvv8QK2w0sCIsfQUVFnixt8zc+HeAz2RROWlU7g+8wpe0ii6NPWhMmDDfZTIu8uC9E721cTkTAdfSIXkkFFGtFQap+mHvrdDpNr5vFethE3a+ANEu4tm4sDR2XyeUgHBIz/gg8GtMAmZ1QEkBH8mcW1ZO7FvVJoIpTm2/wIu9yfxFAhNfjKj8lsPPLvbvjq7/Jtz+fav7999+fh+zR7bj0M+rtFYPpgiWcucHiUBBWvLi0Zj20mYJAopGk+EYIxHqmMxeXGRFMhU+px/KCXJNP2gHKWZOJVFqYMYCcLkZeL3gX6X4on2uj2q9caUO0ZZs9Hs+h62wQ0j+1PIdrS4ci8Rz6x9KCZRi9CdxyO5EXlP6HUPLSVlwJYzlB4egj5JR3mqW1RFFzDPMUF8W3qhrBrdhe/GU9HRt9wIrtndz0P2xFCxQXz3XipfhL+rXnsInzWJSNXUO/v49ezvl8oXgXbVM3h2X+LhxPrgLmJvrD9XWD2AX95fOOdX7y/Ors4//9xmHKBPz2FdsC1iWDEMZbpA8QjjoKBYnAc3mC+8tUjcrYJZEoaL2AZHPfHdQjJmSc3fs/g/qhowFFa3ZYWfH0Au8VDMmk3zhP/lCv9wMm64IYyLCl8Ovs9KGaUp9jLN0WCiBE1Q2UzrrK90sta/WUOBngyrjo7K+mwq/5J/TFZZ05zxWbGd8NSI3rcTUvyk+EnxH4LiR8lJ7Xy92Dw/eMFaXoqrDcED8AsflzztIP2tAGNhGyx49F+wREQAKZtwNoTrb0N8cHitvPpY1uRlPKeQjq9yPo1c38wtNcRIeFi2TI4RzkQhxEYuTYOdwXB32NyWz3cZoy3faO6N7QLa8tdbvpQBSfs+7fu079O+T/s+7fsb2ffT82W08++Esy/Y0fu2T5AwWQhkIRyZhSDSZ5VWwvqprhZCY+tg0Ng0qDALKk2CTZoDRpthr3vF4I314i7vTi0vwA1w8D9NvmdRg+YZAA==");
}
importPys();
