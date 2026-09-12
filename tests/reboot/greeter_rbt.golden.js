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
