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
    reboot_native.importPy("tests.reboot.greeter_pb2", "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");
    reboot_native.importPy("tests.reboot.greeter_pb2_grpc", "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");
    reboot_native.importPy("tests.reboot.greeter_rbt", "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");
}
importPys();
