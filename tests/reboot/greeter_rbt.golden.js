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
