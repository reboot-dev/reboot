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
    reboot_native.importPy("tests.reboot.greeter_rbt", "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");
}
importPys();
