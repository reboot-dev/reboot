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
