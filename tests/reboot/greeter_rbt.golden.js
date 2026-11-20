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
