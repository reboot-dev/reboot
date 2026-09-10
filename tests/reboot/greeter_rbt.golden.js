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
