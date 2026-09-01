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
