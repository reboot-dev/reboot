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
