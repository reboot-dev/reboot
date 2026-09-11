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
