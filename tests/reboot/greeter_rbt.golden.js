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
