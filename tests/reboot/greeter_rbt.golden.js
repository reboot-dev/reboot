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
