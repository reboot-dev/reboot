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
    reboot_native.importPy("tests.reboot.greeter_rbt", "H4sIAAAAAAAC/+y9bXfbSLIm+F2/Ai1/EFlXZt2anZmdVR/Orq/L1eszXS/HdrXPjq8PBZGghDJF8BKkVeq69d83Il+ABJAJJMAXkeLj012SSGQiXyIjn4iMfOJF8BguplfBJE7Dm1l09iKI02S5ugrSL/FiNI3FR8v1lB6ZJ/8R0h/3j4vH7PmX0XKZLF+Ok0k0PJ+u5+OXy2i1Xs7Tl1/D2To6P6N/L4IPCRVeBbfRPFqGqyjgx4OHu2gZBfH9gl4XTYJ5eB+lwX18e8cProL0LpwkD/QFPTcPwmCdRkuqKl1E43ga06Npch+JUkE8D1Z3UbwMFstklQTc6IB+3kT8cZDyI2EaJPMoSKZBsl5mL6X6xGsvg940WQbR7+H9YhZd0duW0X+so3RFdUUz2bZJcL1ex5PrfvAQBTfxfBKEs5mqKaXX6broneEqCKlrVOVNPJlQ66mBF6JtF0FIBVfcc/qWBiKcB/Poa7SkIZnN4kk04OF6v6KnwuVE1z44my6T+2A0mq5pbKPRSH1BldGwhqs4mafcw7c//vLzuw/6KeNLMQd33KLZLHmI57fBj7++/xCEi0UULmmcRFt4rJbcZxok/l29/DJI4/mYv07S7EMWg/CRRzie00THk6B3s0y+RPN+EMvSeq4ncrJjntr0PlyN73hK49WdfMc8XdEwipmYxTfLcEkzOzhT3VtGN0myGtDwpNQLbnbeSfndKP/uzPXFgF45/jLKGjTiBtF/7hc0OCTCvfPvBv918N15n0fp1YcPb3768Pbnn1jcg9XjgiZUiBd1QMhVepesSSJuDMnVvSEBXM//Y03DQVLDPTL+CTntRYPbQXAtJpOq5g6pnr6aP173BzRHJDoP4gXjkAQ+GM/C9C5Ki3WJ9/FyeDmJpvGcWnAf0exMlOjdhV8NwecXD4Jf06hYx3Q9mz2+zBqrRFc1UI2kbOJAtE3MVBROsrkJ08f5OE6MGVGf6Adu1vFsFRcEU3+kHxkn81X0++pruDSfMj7VD07CVchDkUbmg8an+sHbJLmdRQOx1m7W08EkSsfLeLGixZ2Xkw+N9EOj/CFXNb+lyXxEi+SeV7azHuMpV0U0yGl4G9VUop7IKlguxubT9Kf51YiWz2qdDuTgm8sj+05+JTWIUURLnvGJtbQorJ7lDhpP8Z/6q8QsnmTzsVqG4+gmHH8xvs0+0w+xWjW+5z/1V4t4/GVmDpf8oKggKlpBfz1Lbgf0f+N7+ov/TwvghVjcV0F8Oyfl90mW+Jy1W65Oo9Hig5JiCuNkwB1JptOqZqIvR+pLXYz3x1WSzIrKWn0mZyi8GWfK/SbloVrJxW0utJvxqPilLEvrIVrF91oz5X8Xloz4KPvFXpJ/n0SzVWgrmn3pLvtP3msdRfk7JY3FxWFWQMJ3vxgtbv5LzUopPFdb48OSd7pl2lCh+Zi1vkF0v1g9ilpUzW/4g5oqswIj8aRFfngWrTsby4/6stAYVgiqGrVErb0ylnDWndU/Z8k41KCFUdZIfFCaLvXYqPC9peljBkDWdvM3jgLRclRY7aVS4mtbUbkppI6S6ltLwTvatKKlo5z60lKMoBh9torm40d7UeMBW3Fqz3IezlICH4TDotnoPpyTWl86KtOPj0qP11Z9T+ByFj0w1GyoNX+ytsJVmH6hJoQEmJpqNB71qJKMhYWAfku/evPnLZUvZrR/3Efzlb2u7GtLUcJMX+OxUxyyr21FaS1Felpc5QvPWCtZ3zjL0lc2/cAD4tAO/JWtiECt9iL8laUILR4xAfZS+ltLwYdk+WVKNoXjfdnXlqLhmmCstRR/4ygg/pMs4386J4EfGBlPuSpasbnCZgID4NrKSk/aKryRloC9DvllqVgarQgK31req78pFZiT1fJbOlg8Us/m1VLy65H8Wqp7VdDcnL8nAf1Af38kE4J//u+i5ld1ib3a9mjWpBuyyr4LZ4u78Duz+A3ZXepj26MD3cjChmWWGuVPuCB0OH9s2MfVE7qC9NEcZPpLf3E/XgiNEC0H0zBd0Z/Gc/TXSH45Ul+W5oNLq32nOoJcWn1pKbaO7SXWsTBBJ5OYrXbaDR+p1MvodwkHabNVxkEqvAjRfH1PRqnY2Elh85jcJ5M1jZXa7QkdpQP12ttlFNEiNrFL74wNwdfJLFleql/Jxluux6tX88l7soaid9F4TVb01+hH+d530ini/XS6oGci9fgyIoEq1qA+Mh/7PpyT7kzW6Q/seEkLz79hVxOL4z/YtSQ/+1u0+niXzKL3q3Ltf+Me2z4xX/cj7zJiCApPmh+bj78jvFA7KPYHilUUv5Wfvo9Wrya/ReMVfVGosPiFWRGN+eKB21l8Pv+09HDDdHpM4Qd6+O/J/Pbdes5+lR+i8stZTcjfPiq9n1cgvCu/0ooKtNOCbPJlNI2WBKEiw9VVXPbhIh4YjiyLYuAn7larhYfOaPYS1D2VYXnXA0WDxKb/kkWlF4XvJfpp/LbgBnAt86bvZSVnZA0zLB2WLOSBBP/8XW80Yu/QaCSm8GMUPCTzi1Ug3H7szP3lcRLOV/FYmCMR66CILNyHO+GFvYsehS90PZ8IJ6fSGTQKgzPxfDq6iUiYRtlX0eQqoC3wE/31mZpFv/boxcLPE/xKorS6EhK2oL/Pzn796f2bD/SU+IKfOzsj8ZIrPVp+SH7huemJF13pTwdCV1wG2X6hvnYN1ECV65svNt7yAylb+R7xvWdtcp3EKWFf0vZkbaly9PyMOvQDgWFeNcHL/1lst2yEdLLLd5ltKapU3X9VRH6Yj0PxYfkuZ7OLDxdaoWs+c7ekNEZ5WzzfVxyIrm0Rqqo0KOKz6piIjz2HRFZRbIUs72xEZTxUM/zeZR+Njs14O1+sV3K3lY1ZxSs+Ayk6gX9eSEgil+V/ygUnZZiVQ4vHQ72deZZRy47dvKTNrJ3m0wU+X/qJIapcV1PxQZyKAwbaYHqiV5ey0r48heFPzKLi01KxM+0wl+WzP6mN8g/VPDHqYZxGwQcysQRSycsKh/v5az7rSVa5Esw0kMZ14uSFigfnpaIXfnJxcaXOqy5Eay9058rV0WtYNOIl7bvifRfUoIv8qb5jDHmmC0MoT988R1CUPpYB5MZuffwy0S8MYvap90jm9RzLcGYt3mBM5coejcLlbToa8Qn0WKCEy6ByXsXA4Y8/vVRBPly65k9q9XAl4jeP1WCrRYgQV8K/+EqEraJ88Li27K8zU9Vb9WI+4998o6tTUlLYEwqGUQNoKDzbsEEWnm3epguPt0cMlpZZG+3dEA+4YD7pNxh+u7T5cGusUG2Urbmt21ABCi03/vtoFfKRrbNIvqC5cCMEMNvngwCe4+5ljsGONy89fYUh1B96D2NWS/YJz/oBj6VucIvxLMrxbvawbWw+5Rm11ZN1n+vSf1h3HnP4fDcem3erYf+xFWnQvLYizZuArVT7Tcnd3LoOtW2dx05lKdBq2Pz2DEuZ1tuXs6U1XenasMqe1tY6FWWWN/FqGS4fdfCOs2ybPg9+ov9EE+WJLb1yyTGDq1E45Qq+G6URacKJ87XsU2rcTi1N8NlVT8CmsYzMdi0bx8iWxao4wuVv/Ue6Um/u5Ogsn0cwUeVut5iw7uPiMc/WtVyYa+sT3vNtrz/7mpXD4c+etRMtZpB7uRsktpEJ33LlW6uuyLV4RfnTLsJne519IviV1m+sUNEy076I8cMynKehOEDqAB4bSu8ERza8cxeQsuGVG7TZA2jWl90B5qx/4fbhZ/37ttBcgFLPsQY+BT4FPgU+BT4FPt0mPq3fdfyh6uOHJIuSfC2jQb2Bak1ZCUec4WkDcdXEB+TVvMMJSxteW4ZKNa/o3EIvEOou2WX4bDDO/QYX5tzG2PmCzPrWFSCmC3q5qygCrw6qyr7q3C/stubeqHsLm6w9Rx07WYOOd+1iLTpetXGLW69New27WKP2N+1grdpftLXWtl679qr2sIbtL/Zey9Zwc78lXFN0Wyu35hVbWrA1b+jaPp/l6S7Y4LypKdks/O6yrT04jT3w6OqmDa74cNJZFC3kzSqJPFOnZySer5odI+7X+3hFqq0pGHTVr72tOUvN2XfUsYOw5GoGL7foqh1pYc5RT3djzbknzmYMWfog7lRUPrYrc/cwddThH5cxfdhNiRfL7kaLF9+xEzVefEXnFrZX5IWSW8JXNW/YDq6qecHGrfPBUTVV7AY/1bzQO5q3eCXSL6rXVsYnoDVaeoTT2irvGN8bLUsRrba6WzfJJ9LXUqJpgCxFmqNuLYXaRwA7G1vXnc5t81hJtqI7WUG2F/munB/CeMb3i9/8Po4EGPNcPc5yW9qlnPVvZ4dyVt+pZR5ryVVqO7uSq/at7Eiuyjdqlcf6cRXfyRpyvaztOnolmS9arqJSqS2voVLt211Bpco7tKrF6imW2e7aKda91ZVTrHqDFrVYNcXCO10zxVf5rpgyX0LDUik/3gBEyo83y2W5RHu0Zm+iqwNtWuSxREoPb2dtlCrdyqIo1dmlDR7LoFRqJ/Jfeoev4Ff4Xrzk31FqS1uFo/btbBWOyju0ymMd2Ms0aAt7oUbRtBdrbbrUNbm+Wxu0sOKtbbyrWPTRFrrWooSWIO8iaTSbtnhcUVC1KHEThUuaCUF51qorPJEtCjDJa5t+r9Y3LR43yBlbhExK+r6advkQU9iFzMcnv6sLlofidbePzEY3LctudlcMkeSoKoasVealIUjN4Lk6plFVDd/BoCpmr+Koyg9bDKtJMHZc4ypbvvWBZRVfPIyjD/yP37j00Q0mt3rrA6k2v8JYasJG3+HUdRzdiKqGb31QTXxQGFnzC+/hLdR2dGNstn4H+pXbU9Kugu3eX7eKGo5Qs3KRrQ8oI87CcIq0A76DKUof3VByq7e/QREWL25Q9IH/BsWlj2+DolZvfSANK6Uwnib3vO+wmnUd3AWlptE1Gr/1W0raqCtJrPywhdSqWo5ubHXLD4F4rTvhjJdhZ78OIsdDXgCRPiE/g8ZemwL9sjrlpWvG8dbYLMa8kuF2NvWDsLZqNNDjmjTjuD90s9VYgDVcrfmBF1qxD53Y1eXAiSQ9zdu0rR6xpXEtIk1Q8w5lHXrW5mLo6Rd/5WyrylRdXKOZFsRPIdkbqBatbKT8w+p2ty9/b/6lOtLvJiKmurJN17zrynqQH9UV73ChvrknXp3u3HAf+qaakt0G25M3qaZw+6v1jZ3w6e7GbbZ4+zvekC+/pJlkqaZpfj7i6k3rtver/W9V23MVPPU13JohNJ3JW7tDXX7XrrBR401a8/6svjVrpVepGSHfnaEukUXDxlBXtEFV1RVt1q51pdvvCs3d8Olw11Z7bAk1BTsNs59yrSnbej9o7IFHVzdtsEf4RE0NOwmlqHmf7/L1Ts7TlCLCt56mVAm+9Xgkc/CtqkPOiXa9bT1IW+mcTxILz1o2nzTPnBOeFbXPitGqo22HZ6v9qoDOSbRY3W10B9D39T7AUrSmACvFJ96gUpY/OL+u7xDlwFF05BBu+hVmxAYHZUu5EvGbPR2AZ/9r95WzFzX/gr9Ht+H4Mbh998vr4H2WX7OuiEhGTwOcRoJihcd6Gc2ir+F8FfSS+eyxH0yTZZAn6xRpzeP7xUyl/Qxm+TupMvUg52kPg3fykEy5wgbBWyH+8TJ7wyoJxrOY6kkHcjH/GH6JZCf+tlyMVRdCTgwvBuBF8Mp8X9YsOf/jkHNh3XDaq2UUpItoHE/jMbd4HlzzE9eXqpabSKZ0t9WVBr0wDbIM9cHNo0jpJ565FstgfK2qWczWt/G8H0wSITDpnUj/On+kHt/f02DehCptfBokK064KpuS3DCJzfVARZHJ145kCmz+r9SQNSlRB8bAXGmRjdN0fSNe1ivUeVmfdWzwepaMv2hhMVWElF7zazERhcr7G7+dE/v9KPPL1jSi+pSrLVKziayEUrVNz3+df5knD/Maybn4o1DTnxfnvNTkzFUGwHNiVC/Oz89JaOXn/LFcQPck57QSSK8maRqLj5PgLknLC4pruC7M0HVAgiUX1oDqPlP715SUEWcvG42Us1vWMpJZ5qsy9qmFUHw2JoQrH4yclZMCdH6XN1V9LFLZpaK9QuJncbr65MiTq0f2JyryuSIfPqV6xZ1J9PCi/9lolfDtcjnRsLxdvOHmryxq2VxrTEQmvrvwK6sAhgfJOBYKRKbi43oH5XbnKIAbMI1n0SjPf5g3wJFbNX908AMV/T77szI+7hOrN+9fv3v7y4ef3+XNkLveihufN2G1Jo3/qdFNZZGeHIg44FXx49fhbMbr5FNht/8kdWa2cYvXcLbf9yIt7OfLwtNiWPUfnz+LXz+bMqzW/rBJnHt9g3NyMlolOg3tfbS6SyaclKh2ILhQYTDyKspTpN97aX1TpowcinD/Osmit/ekmixvfp4ayugoFNVuFJVFlk5eX1nGpLvaqrdXlIGgXxP8GE8ms+iBYPSWrZbMYKEpyw0T/T1bJlSlyza5DCJx+VbUybbANCSLWOjMNLmP9GMit+4onKXJKEjX47vcGlqyefMi+IGKk4kqaLjIWJnNqOYHYbYEbIyEpIFv2V4RYZv0+ptHzm+r/pYp78ci9TJb/1RfuKYxXsb/lJ/RfI2/pAMamEgVofX3Naa1R8aJeJZeTj24l4/3osHt4JJqudbmmXwkFdJ43R+csdaWjR2JhsmgA7ajyYwlUZpe6O9f/qHEnOMABvyf/9rr/3mhN60s7YscjHySLduWrjId3WePDfISpOeru4oj4Pqby8oKytxy/0aWWXXBh4vFTA2xefWkorNf5c+9nRTfQqJfV1Iu/0Ihoczvw3l4y+2zbOTmA6lMPPyj/CuvZTELx0K+R1IYbRVlzwx+0b+9Fg/n1YzJPp1Hs7rm5BNUengwei0/qDRO5soehySh9TUaDw4+8O+v+VejIiGAciUYrXMoaOMVLNqjYul08IH//of609DI0XRKamWkcmpTlbZGq0WTDt6Ip/+RPXxpaMhwkl95CtPH+Zg2gDdfI4s/Ll0vomWvP6jKdFUuh8U/i1tJJoPD7LfSA0XwkCcbr8oqP8kuQgs2Ucvool99ewabqOripmjsqbUw6Nz2qh/FhpKel95Y2knL62BY/qD4eEmEh6W/iw9X5GJY+aRYgNO2c8Qcu4FGeUL6+3Q4C+9vJuFVcfEPZpyCfVV48tL0ZhYRbgEVyF/LT5i1Z8FL6u/is3LlTeJ0ITd+q1iUF2r+uFyt32d/dxZfXeVQtEr/VXzG0BJD4/fiQ2LxDcV/S1OeMBTgJUBFh5aBGhSesE7Ai0D4bwUWEDZFMg0iakMgUc9Fml1pSxOFE/j57KZbKvb8m8iokLZp0kQkSP+kx2igE1H5OCE8wlijgMlFo1VVciXfPCrANZJ5QHNHtzCoHLBcufIHOmBG+MALg3UhU9he+CZDLw71hVi6F57ZUUtlTbLvi3YpQko1ORjEN63UQpB80Xj/vLaWEkVr+9osHIEX3bg562uWVGit21egg7poSZlVqqtCi9O6NSWSkNblNclC64KlMNGL1hfwyyvFdpZ00TH0r1S3LfzholsUSanmxtOwiy2cNefv/NPU3iRfmfHEpms85VObSz6o4rQEbCNOl8k9WWTL9SwS54HRmCtePg6MU9apLjDKKxtxiVE8HWUlSnth/mQiH3bCWA/sJHBtXiVZJtnvwX+2e/7dehYVkVW+89mPo2oquzorVPUieDvVRqhqHZnCcmxTbaZOLjMnEO18NLrherYqVWNU8HAX04ZLRnTykIoJXCxy45pqz7+J56VaJtHX4D6ZREGPT9FnyW0q7XgyMFm7pcLvGc0WoiFkmS9L5WnH432amhBJEPAoTP/7OE2Fe8E0y/uDQmFuaEUCtNF9VZlxNSAeY/+9HK98CnqVyvItmXT3pfXrOB1xfwWoGP5ASC+qPtc/K/fIzEZS6dxlezHsOwdCtb6plyMlPcNqc5q6o15kKVgC14YoDjvogcz1lBcxnHcFrCkRVsENROVKzdmlaUwddDS+WK7X54VX/MwBn2MSFrG0UnVO/xhEfFqbBmEqY010oEkqF5g825eHu/TBvQmdY8bIs8fgJS/cSSJBN5URLm76aC3LBNdqq78OHpakLljzSy3yEM9mRoUEPSaiAM3Lbcz6pNCiQfDzXLf2IbqYzWh34BCURLrgWC3wYb9RIXsD9TtTWX1YrFO4FkMds0C1ifovuSvSQ2jUFn5NYjYlVstHVjfCBJJWhrZcqEOru2p1ZZnJvh7J3rAZoS14hzkhDkCYesViK9RY7YMq2Kpub+7IIXGQz8XFsf5FrQegthkGZtvF+3UMKUODgjtcHXzJP64chwKWI5xmb32xg1V/fXnh5s0or0zhoNLnKiQZK91oYRwvo+lVvafoXVQ4A9KhVVzr2xXH0iRLX0M0H4Dz8/O32nUv/dZkal/n/uCBbmv/Whw5lrgi9InJWKhQ7bQrjskdQVZalsNq59Q3g/9X/qzuNSXHhnhVnXcj97/RcA6z34oP9ffor5OrfHiuRvG87CoRwyXRQI0L9J0Yn9dleg5D40vZElrJ5nEhhRKF9yQuo6WoamTc3Bt9iUpbZ4UHpOoTG4xGxriNLu0QfMiLzWgv7z2iWFoEILL1rKHlhcHLoNS+Poe72Uryv0cRyyi+LS806u14NSJLxUQHxUMMJYO2tVcSz8uz4qxe5deijQBe0vHcykD8UG7oplUrj1TrEUXTkr4snJ2Lc6Jff337/efPxcX+TsAvsefnBEa05Pm0jDe7C+VhC27J1uMQQzNjnVS9hh9NGHFclTYxMgomOQwXYlKF507OT8YwsZgIyCU2VaE7CJjQNjidEuKfr7KmDUxQwwdv3E5ChD0xs4MFSUZ6l6xp/uVx+0w4JINonq5F1CrXv5IHmQWVLM4ilZyy3vsaqbNH+ni1DKfTeDwwFpeIRBYroOzuHqhTACo9ohaVI321CNUpLf2MRV31g+HQWHli4eYj8tPPH95cBXwaG6znBIADubiVeMrj0nS9WAhEUNDeL4KfFKKiVRLPBXojOVgvAmFxpQI9qpNTUf9EuVkT+iIfmFlIE91I7OcpwKR4C8f04S3tx7ccN1HWVrS67LLOByK5VR1PA30qP8wdrWW7ef41JHEmkRM9jxXQU8hZihaHngrxEsI3EVJStng1RL5Zr+SIre6Wyfr2jpQp2cF5sOs7lttSYUaV1HM+4ZZwufzem4iWYl6HPCwvVcLiK85JdKdp7iZ8akIbV+FRMsd5S1C2eHXPPf9bshIn+HwGL1Rn5myXqHdOyrjwJolhzys1Tc8lagou/pBP/ilCzXVpM4Agi+Gu1nL+73PLh98nwWOyVqs+uFkmDynHmoY3QbKgwRJon2R3xuuB1k3KyMZSDQfZ85o31ucl21jSWsj1kfE9Oz5o5dwKG+T/LtbZL5q6wpgq7CsCjYYSow/eP6ar6F4h9p7TG3WzGn39Lpwt7sLvBsqOYMz8Vg6jHOJevwqE1AIbWi34+rmp65XcboUKUYa3VJ0iQJztM178+VnvrLgM1YnFmQ1w+IBJE1DelfflvUA6A9ap3lS/3xDYWdwmYulZerEMxzze6SKc9xzjwEMwnJ7/ocNQSqPzZ++i9FVMwtA/twwrvUTWdi463uurfZi2z9mjrYTcs+cCegYk9rRY78UBZhr88khDSIuNFSYrOp6E9yJqbVCpZiGe1eb0ePhhubb4zWYRNWPoHqMP9DP6Oz80eP3r+w8///jmXWnIr1wTKUN3hkH4EMYKCBC2fryJpBvmUfp37L6ysrSWhKfJX2ZAy5rossJBX6/vqmHwS7iUdwXfr5as/QtozfLmBrsin317362WRAeLompZmHOQfWpvRL5gpfDWOjBcK9pb95hNHZri435UTcJwaTvHcVittfaUt12VFgwrd1/cUGxA3Yvmk16lYndttHPQg1cywHCSRPLyGSFMvthDeJTAO+PxcbIQ7rfxeslb8OzxqqbGNIqCu9VqkV59++0tSev6hqMMvpVz/HISff2WYSpBtG/5Hk2Ufvtf/vv/8d8Hzgr/H8+4OSl/y/V8NF3PxQH4aPXA3r1VooNWopEMYkndo5ubq1SRdDj1dMgLmeyq/JVIDl8XBVxC1O7xMv3whkZTr64t1riqK/tP82O1cm/+qw7KsPpRfTU1cpmZw1rPG9NRU4zwTcEOCv6Ss2XVT4FEUgYXV80669fWVGxAia3L9i+aeTZOeHDqG9ZJbYxnUWgeyJRxYjGQBEYbjDYYbU9mtDkDvLAusS6xLp9wXVpjJJ+Jc8XeuxN0tlgHAs6XjZwvduFq54xpiEqFG6a7G8Z37cMtA7fMftwydiX8JG4ae1PgtjHdNo49E26c/bpxGu7fPEukWu7lySPW0oAAuW4RuZaFDQj2IBFss04AkgWSfQokW1bOB4Boy00CsnUj28reCoS7Z4RrvRP+XICtrXOniGct4wAYuxmMtYnWloLhangXAGk3gLR+2gBIFkh2T0jWppafBsDaWgLcWsCt1j0UcPVJ4aomGkIgDwJ5EMjzdLeiisRdz+V2VKFXp3hLyhwA2Iub3ZYqCNO2bk1ZePBgIXa3EJtWPExDmIZ7ukVVUL1Pc5uq0AQYg4VbVcWdEVbgfq1AC7nrM8Gc1Z6dIO6sDAKw50bYsypUCLM5EMTps96BOoE694M6q4r3SZBntRlAnyb6tOyPQKBPg0Azvtpnhj91v04YfWoXPrDnNrCnFiggzwNDnu6VDtwJ3Llf3KlV7pOiTufRLTCnuSsCce4XceapCRDsgmAXBLs8WbBLJT0b1iPWI9bjk61HR3JArEqsSqzKJ1uV9sSgz8RLau3cCbpKbeMAf+lG/lKraG0pXLQm+S48qd09qZ7aAO5UuFP34061quUn8alaWwLHqulYte+h8K7u17vqkW0eBiUMShiUezQoyyoD8gf5s88N67tpsp77id+vc7ZB7sKbWSQNzYI43j8uHgf2RLz36+JVmCfNxOuN1fafNbeQq9UjjamH6SrL2Y3VLobqC5V99iFiMyu5pwXCg8EaY0WCIGaaloza1GmfjfS+XKpGapuHOxq2B96uWQNdm/nb2dW0Tl/TZj749adX/3j19u+v/u3vb65pIZZqEj4QNUXcBlJ38ZgrJbuGTCz+Qr6sCAxKtawSUi1zsi4IpI2/fDtL0lTMdDKfi6wn8eqxuKu/KFXw4efvf+7dRPO7/hU15GucxioF8SQax0Ib0YxSqyJSTsJooplJk3m1GTyewXVh5fSvpfCwmSYyEQcJ6yIe5DmP4TIqVfMQkWgRbCEwxhBcDUAvGtwOLrXuvKQFTAbyb5UkySWMdBlEq3G/2Hlu4+iGBiqZTq3uQvXd4N/kz5LkEeiigWbH05XFy/WR/VpfWMtP17PZyykhwFtaLLfvfnktXnwZpCotcTwtpG621PVAdvp9nJIEMo7rxYNoYCaG5t2JlWAhJbSlGpkkOpKGU5+Med4aaZrmyUNwm/CsCfmLb+9WcoIG7KuzVESgNSJhoinJbVlZlZI+atz8Ng1mMQ2ANJwstWjjivem+YSHgxq4uhtYfEoihbU9HbXuPNsOXOvf1uGScDlniL55DK6V0r0eWByj65sapSPXb9HZ856K9NyuKdpVaJ3NMmcX6YOR/myVuC1fe27ucDIhbZ26knM7HEu1ybpdZSzJu6uWrd+n1U+EJhiK4VaK3N4RLy8WbSYhyUyo/WeDVSImaqS/sCGKaptIw16dNboxuOWVp6QVFZhKnsHRqzh5txi/YZzDXjUBeOyvoOUuvh2wJu+JJOnNO4bbfM6bqtVVz22+s28lnq8juxnN+9mYTeF4tRb57SPZUp2JPtL6hjbD6OGSe8IqhLob8v4wCzlrvezbmcths04zB4jWtzR78puRgFwD3iRG3KEe/6fvGkRVm7H83YMkIa0G61IKFYCVr5OV1a8w+Yx7hcjdrZAGvlUbhBzztsM/xTC62yO+PmtsR2Mma3g1vKxKgWMkLoy6mpWZ5SLHfjcmpbAdC3YlrWbSv1uxLp+LZdnNidEiyaeHSWOWhmEDwwaGDQwbGDZHa9iY6hzmDcybpzRvTFl8WiPH2ZJ9mjp++Z8B2QDZANkA2QDZTgWyOfYFoDegt6dEbw6xfFog59Oo/WI6W4ZtuLOfwp1tnwu4t4/cvd2U/BhL7amXWnlOsOSOfcnZszFipT3BSrNNBRbY81pg1vxRXenn4PuD7w++P/j+4Ps7Bt+fbSOA5w+evyf1/NmE8on9fo1N2mvQainRIAyjJwheLcwBLKIjt4hsuZSwrPa/rKrzgKX1TJZWniQCC+vpFpaeBSyrI19WDibsQyUtyDudNZzXh1hhN9m6/hpr5ooeS8s8eej7jkc9IbFHWGOpAkQ2wrsJ7ya8m/BuHq13s6TR4deEX/Mp/ZolcXxaj2ZdY/bpy/ShGfS5k2KrBhAOEA4QDhAOEO5oIZxVrwPIAcg96cVim1A+8Q3jxibtE9Q50p7A779/v791KuD8P3Lnf1uidh9u2aYqYU3BmoI1BWsK1tTRWlONOh6WFSyrJ2WkbRLQJyarbdW83VpcHfOCbMO42FtiEFgUe8kPUkrzMYnTBcNhV4qPVZh+seX34M/TwQf67xuBOfIS3+S/soWepXSTuddI7fwQkjybD41mSbIYcZS9mBTb6/JEcuLFI91sEraf53+n4m916dc0pSLPyTDozcL7m0kYZDVLAJu/aZRSDZP1jNrGK65fTTni1wQehncqycjPS7l1FLKRfK+flQlJRAWMASXejoL1fEYTHFwUBkyss5TsHMOAWXHGTzZSpAdjHJJQ/ramVR3N0/UySvM9gt8R0PJfC2Mr+j1m6JXVw8kE9bP0Fp2ITwLLPETrm5vHb4Jyd/+qwWxWGwtbvGLBkQiEhiqpFBMpUswcKTozCm+9/PDASD9ZVHf0cFGUbAlWDWtKPxdciHqV5hPjOU6W7EISKZgGZw7c0WtMyiLnmlaqFJyyyftrGkkVO4sJKSsNy5aaKE7aaB49BOmYVFtumjxEIkZunZZNM+E5Y4nmgVFA/1olDLwWcP5a5em7Zsm4X89W8YIT/RA2Z5ErVScsXDESZNz2aOqo7kdpV6+Ec44NjKwSIUYig3Bf7BxkFpXqu4tXwmIMRR6hMlTRjb9IZdYrhRMY35BEMvY+K5ofZlpHV+YE1XmbosgyDOvIw9euzIrfVD9yJYysKi2hJ67aJoLlwRw9qIZ1yAXL5e3fVJTosPKJvWDH/I8iiyob/LNo5QB8TnAvF1opMWRPYQc9bW7zrzRSQ6/UmZnVlWWXHfkYYrW5O/Q/1fJCviZ2jv3Cd+h7SkRJ+DnXGynsVc8v5dNlYCqvfr++gzcRLdulzL88HGWbFYnebTyWH7vSBWdaNs8gackebXw7eJv/3pzalKQpTIfTC94kgz9Uxet1PBn8+uvb73vCZzgUXRXLgz4XP/mJ/p8XDalHa+au32SrKentiVVlJgkVKr1fI7tykygVsD5fNFOFeiDQ+JoUc8Qb7Bu3fSqVKyFkVpfSTxlKbZzbe2NdD7tfQrlpLwd1eVSFVqrszLHENKOsvp5jPprS4aa0bTDwahQKkfS08anOcLuuMgcEz+ak129uWJ8dHsoi7Tdlx61dHDZRlOPY90k9LB/dIAmtsGs8RNcyB2r0eSdQH13Vm7wiaTmJx/TiD11HnsxPOixGo/EsTNPRiH67Txiaj0Z/Drwe/w9CuoyQqMBF+xWVe1l4YXHW63gaU+fkeUBNfaJFwTSeRbULzxgATh4uwYF+y0jJ4c2jTvQ+MrAw+zZ7tenYFZC+DD599l6iKu2wGlhDnJ9UYKU4np05nYF1sFA6hsWXGgfaVYPOR9+YttKtWYqu36F4ta87OAcjFruaobbwPhIOmBb1cFau753tPn8dVyzEyXr6Yrz2A/36Ez1nF7mLvtMjTKI41DbdZR24FW8bboLdNRgeuhHxi4Dw1yLk5NhyBAKFwuUBiPhELEdlfzkquV7PV/GMz9N4d02DHt9aui41cCC0yUi42+KvEVmqulTfUS1behFjNHVuJ0rxW4RRKGxFTtiav95RTzz/mkiJGzgc6VmTCqbI0GKeXPrVICav4YBFqzHW0Ib4jXzFtl93NK5zSR2R20C0GF6D/XgNxGDDaQCnwVM5DRwCaPEZKL2wgcvArGGvHgPY17CvYV/Dvj4F+1oCzlMxrx3bF6zrp7eulSDCuIZxvSvjupAu7phs7GKmOpja+zC163NIweKGxb0fi7s5l1nJ8Laktexmf1sqwsE9Du7hWIBjAY4FOBYaHAsFsH0q/oX6zRpuhqd3MxTFEt4GeBt25W1w5amH4wGOhzrHg3cea/gg4IPYjw+iVWr1kjvCURaeCXgm4JmAZwKeCXgm9uyZcAHzU3FSeO/m8Fc8vb/CKaxwXcB1sTvXxeOHJCOJUXNwiI6LxpTecFXs1lVhkRM4KuCoeDpHhZdAWt0UlpI+TooGFYSLC7DiYcXDiocVv3Ur3oZRT8eG99roYMEfggVvFVTY77Df92O/v/ldokjY8bDjfez4krzAnoc9fxj2fKNgNtr1pRpg38O+h30P+x72/aHb92UMe5p2fuMGCHv/0Oz9iuDC7ofdvzO7n8T178n89t16zslTfogICsHch7lfNvctYgIrH1b+k1n5XvJoM+4tBTe6WFBTIQx9GPow9GHow9DftqFvA60nY997bX0w6w/ArLeKKax5WPN7suY/LtnKgDkPc77enJdyAnse9vyB2PMugWw26GXJYzulFzoY7ABwR8AdAXcE3BHH7Y5QqPtE/RGurRsOiYNzSGhBhUcCHomdZSeMVh/vklkkpPf4shSSJoMrYrf5CU0BgQsCLoinckE0CKLF9VAosVneQktNiB6AuQ5zHeY6zPVt5y8sQNKTyWNYv73BPD+AfIZFwYRZDrN8V2b5D2E8+0i2yxuxbVHfESQAy7xkmVdkBNY5rPOnss49hNFioVdK4fo+7HLY5bDLYZcfnl1exaSnYpt7bG6wz5/ePrcIKGx02Oi7ttHVDgULHRa6w0J3IkjY57DP92ufexkzJetclYFtDtsctjlsc9jmh2ubayx6apa5Uw/ALj8cuzwTTljlsMp3ZZXr0T+qWHbd6HcKUMIw361h/tFpusIif3YWuRyumjn3HqSSIdHd8K2vvuPANdsbMHth9sLshdn7bMzeDOw9H3vX/Oj/sfCMKCdoOrqPJ5NZ9ECganAfPt6QEUjAZrqei8Tio9UDDyb1TYNWvW94oKIaHOGCMZfbB1KW6XTu+y+CjwwzH6KLZWS0MVBtpC8cxRbRMk4mMW8gj8Eqvo8IhpaB8yy5dZQWT4WBHq7gPr69WwU3UXC3nt9eBvEgGlw6V9ELRuTL4I61SHCzvh04cVlunet9VDk0+Ev3HlAPdFuDnp2gEvuneiKGYrtkLcKaq/o2oeaD/8ZjmUbUiUlqre7hjpRU8GG5rtkSJkInLKL5hOVGQ8fSsPNn9SP5iafkc/1Aqt4N1c8uQO5F8PouGgv9TTL/NRJ1TgKujXs7vqspmZKpNZsIyzdIxuP1UtWyrFP21TVVq/Rn0bzHI9pnI/xf6/UybWPR0jq7bIFqUVDmHctDbW20WNkcIrXIDArNAGl68X4Vz2YBTy33bkoboTKr1V6TaangorG2CzbF1QYRhFN24Syjl0tJ58B2euZC0KN4sQGG0mPzL8PmNWAu9Xi+jppAvjJXeMfqVVsxjeesMe0Tq5arqIGFoFezMYuHJPru1Yn7T5H0e4Xj1Vroark+GbwIDUkqO57WlJcOiJhlSuE72iRZwVMDL1YBAY0grCmuxElK1yR3QhhVhWlN+Xn0VYjCahnTb5NL0ver/O1jdowQHFmv6ntgvO4mGoe0fagdj0dZuAYayovRds9FnVWdAyCuxA13RQvrq1nQim9w63sgkVN37IuNTQ8TNaodc9zhHhbkkB6nBDgl2NUpwffhnJqbrNMf4mg2SRG7hyOCkjFckhCcFCB276li9xpF0RK7VyqzEfuNvS4Q8IKAF8c0OKbBMQ2OaRqOacpo+1SiExs3bkQnPr3DoSKc8DvA77Arv8P7VbKkZTJeL1Nq2I9RmlLzjypU0doDxC3uxylhHXy4JuCaeCrXhKdAWhwUDj2ygZuirkY4K+CsgLMCzgo4K+CsaHBW2CH6qbgsPDd0OC6e3nHhEFS4L+C+2JX74h2t1aP2Xtg6AOfFfpwXtrGH7wK+i6fyXfjJo8V1YVciG3guaioEYxLMfJj5MPNh5m/ZzLdC2VOx8v22Phj5T2/k28UUNj5s/F3Z+DTq6Wq5Hq9ezSfHH67Q2BtY//ux/hsnAq4AuAKeyhXQQTgtfgEPXbOBk8C3doQ6INQBPhD4QOADgQ+kwQfSDPVPxSHSAQDAO/L03hEPAYarBK6S7blKzgz/RWZgzxMhA6kgjxL2uHprPhT07uVqRJo883QMg3Px4bnmSyo4TCSz2bn+8/ysoM2Cdzwb95GAgcURmJ6/Wq2YKkLO3R+VF/8pt66LP8oenD8vgvNSVck8uNArUfKKBZMkklZ/9DvZ/HkBNTQvtC2kt8KxWqup3ERyn8Bo9Frozrz5PGH5DHgZ/8tYml3FxSkm+ipwWlKqiXkBZSvVFJFt1RbWmcW5UM+M2A9e/s+MUExW9kY9dea0pEU/aHePuNKxVnW0tYaTSU8buFKqCWMXirKUT0ZqIPR7hcIlwdPpfTIzVDx3GRCcj+fxKibzT3wyrLxEYBBHq/r98h6b2f7VRWoyM+dLtCwRrf0AstlG512qRMzjUP1sXvVnFmv/QyIHz3ybbEBpIFz7nyS+E3/0zlyek2oHPjUKqSxZYiEs9kmMvKINZY2iZFZrCcYUYiupNkwS7A3lj2rrDHM/U/HOKTO0z/CiuDoufNx2Xj6sWsHp22ChdZ1aAKAQNoeY6fkbuidS7Bm5o0r8WX2KltiMd1aSsfWCBcYoUvnK1TmbTVZUpbKX/8im/11UUUdsA+UEkEEuKpfBb+t0FRB6l7vfQuOdIhQomowbm4kvgrfS/JLuC/1QMFlHgilQmmrC2S7MJNnKs4oVpqAZ16SriEmpESQPkmn2AHf8+tf5l3nyML8uVaK9/mEwnsUEpgSoWi3DebogeDBfzR5lWwblMxJ350kVZ83vqQ8tdphEA+r7Uqv+ntwSwnwMCALeEdKckZTIJ1lwx1+4gWPay2mo7sMvZF2WhyYK05iGlTHNJLpZ396yi7L4TKnETz9/eHOV0xqSisioRbXFTJPJPihm3LyJFJ1i9UzjerG+IdvmWzkw39LAfJvxHn9b8UItHq/1jJUOIOS4CA17VSLt/1nwKIazT/zlZ8U06yydb5pKKbyyDDn711JuCHuE9KRd+jqj+rYzsp8SMYw89PJUh88ceIDmySS65tGk0Q5n1KTJoxhvcepTReBlWRtx+d/S0eKRFPB8IClhR4sljfJISIcQDhdxpy/H6vT8Vy16QY9abTXxtL7vB9pb8+dfC6uOOnmhFt7Fv8/Pg39xvu/iYvAbaajMq859uKHODEiG78PVKKPPzFaULymxXGcbuRUb3Iiqhy6vYPG4VJy4TWhxkkzwjAe0RhmTkzA8hKR/VonTShvP1hOp7C4WNDS0Pw+0sSJ3Yw30CRw4KmGyVGoBbzzzUNoZt7IZPM7y+PBLPGf16ajh3NBA539V/Mzx6oIMp/WCObGj2WK6nnF9jhoyjXTJ+kQYJdHvi4QmKWY30j1pXbE1OcdBioTTXL2X7oPh9HzdSYTPGzCl3cFKy9QuPAVdZFAhswvBWoAfsCkjs6K+s7T5FG9Fk2g8o51M+Rt1bVJ8q4ul7+Roj4z9VtcpN+dU7qCSQP0u/OqiTB8n91EwJcOF2p4ImePdX1Otk/znNdATLleKWqjXgoaXhyoz3NXxPn/u5m3Py+vDfvE+weQ+Lx6ax6mjDvUiPQqD4AO/nvqSPDAf/CT6Gs0SXgvOtZyypD8GZAuK5VwcT97W6dN4GVxLBkmX34Yd0KTexFBSm+fcFcVVPeb9VTipmMPa6e9/YfrA+UhcvpeUWYan7LEbSuI1mpUe9VTItdvj3Ibfe3r+i7GP5AuZZ7c0XJut7fozmxfBOx48gWQNISNtZ46RBpFusVMTuyRZm6Vi0B/ipdTlD+GjWbVTaYo+MwRTNPFC8MNg8TihbSMeB69+ectTEIvtxVFLqJUjw+NKf/5qQPILl/ArmCwo6KlRhEXk+ne4Dk2Q6zCXS5pLqia3T1yrd/24+tvh6FYKxwL5sqgpP7UtVLZjT/PS2P66dlvIcfvosf0q3i+K3CaSrFMKb9XqeQhTtpbCigZnbexOXJJtpIR/qHOZbVq3hjY+F98MxG4NyG4NzG4H0G4H1G4B2HqC290A3NIBSZPHxyemhRYJj99iGa1WjyQY1KuZ3LLmwbtfXjNIuYnyaJa/yuFmAVqnEY91SX542ZCSouk05srfSSUZufNYAjWGg+/FFibaz0tR7mgSK5f7QxB4ncoMFmkUSQWgoJNMYCQOlFbLR43BtH+dd2l+71kZRsqtWIp5zO6chBoQMTKc00xGk6tAt1elGprF9yRZtHd/96//WqpNltCVpoPgfSSXlyiTBrxFlHsUBHer1SK9+vbbjKmcwCv/cbsM73n1vLxd0xpP5fcvZVXfnp3tZofx2VnabSh2SZ+e/yGQiDnZ/cFopCJJ/ri4Ci6CfyE5WxYf0dlxKl/0g/8Z/Ks89ru4oM3L/tpzYSbQ/7QUiTQgKo6rMO/5tGtwkwsJrxBSSguJPKlsNnW0Ndrfa5OEbjPv2nv999ziuDVY2hvufN13vK4a1uydUw6eUha2LQ/1Zxb/FqbRmyzvTZjmSXDKmmgbkPd4FVE2LA4tlH9vqqD8U0/90x5T+69rozGHuqg3hq8bw9bN4OpmMHUDeNoAS7sqS6foXwV/ZB//6VIx1jRmzqiLZXSffI0sgReiuCVXJ48xnzVlSTnTRTjvnRXQII0eH6YSoL22HsFe5/rur8JHogCudjQaIUbRSgVcjuhVWamhuNJylnfcCMGpj8DpHBWzQeiOd0AN/7tdLsaj8svK53sau9OzQkW8V9Em6tX66M8I0/GMr7gyY8GWjyK7X7SMp48y1RrfnGBNG6pfxXd8oCoCp4z0iVqewvXqrpSzXAZoyFrlXYyiLtORpVlAgPrgMg+QlCvlzB7BxpHMpCdIqUezJJyccx8SAQXWc2qkSovKX9HI82UnEUBknhq8yAM+VsH9Wi7+VDrMhFc6XIU3YSqCl8nqopmZRUbhZbKeT16ulvFCOcDpf9N4Gb2kd7wkdUF67a+kl25SFjFxsM6hj4ZafRFcj7h9HLEobs+NOS/miIrmF09WI90wEdco01/S0jd7wW1Vo8AhBNRqGZ35JV4Y/mz9+kLX8pl8cVbcJq548pdUYzLVx+D34RdW0DoboT4/4Pc2jWn0VQrUSo2TiLngKAeectHaB3No5Rn8XORNvIvuB8FrvVkJt6vqrE55+SCWY1qaWxHDEI7l+xk1qBLW9hlHHS+C9XwejVmnL2M2dTl7Zk82UZyVcNMSWqH38T91OkUOZw3N9mvJSTmulwRwlpBMTeMZtbNvH/OPHHkgx2ckkm+O1IoUxnS2KDlXZJZQtPDKaB6Hs5fJ9KXajoNwJTbLr6R9OIBEnjKJ8ZMe7rSYdVHlSZXvSXn7piGMGQfq8U6ptEN6bDcJVaniqi9uQFmk9aX1Idv9t4ISMBLJZuBYHGcRGOANW8wPO/nVRP+lcehvIioXjcQQ8chfGGLECqXXv9D5K02ZV5LNpYQaECcTRlF9ZDYiORrJtLdGcd10s9VRofhKOVjkwijjsxfcJD5cLL5zES5JDcYLfrpHuDcm+Ex1iLVXrULnTi2+mXZsHQSWz7ZFO5WUf1ES6vWabept080hKpYXGyfKV64YTs9dsde3VjD4JVymEUecvqcVQfaQpRkD/bA1KE9/mXem6RZuSerOGu/fWi+5XTqDgobWkCBjmYkDv7wVV2ct7hBLhey8E3151irc3fF4fV9FKwmUJEvS0kMTkWSf9mpuZ6iwztr7R65Qz1pwYz9qoyYNTSjlFflrCfi3xGnmUzg0fq8+yKgntxiS5ZBTjttCQ/9jTRgnbXhUiI8OzZbi0L86qx4/qmTZReXhE0pdE0JdO3jbvWF+5ogNlz0eZNfCVA2W5zXYoj1IwB2NM7VFlV5L01Zc+ZP7Cm0x6lqC4GywnLK9CB4ETpyrxNMqRpKwMu8IrFDOyRCfE7wYBz2xiukNL9UWRYhVvCxKz6wRF2JbTGSMCSu2lTxKj7Ia6SW0eBiR9Rk5J8uJiAShsr+LXdJJhKHTimeKm1GcCH+Mb+e0K3+Sz72kqVlHn8/KBmFKWkBcnqy3DL/ZgpGoVrPNSCxdi2sw+FyWnWnRrUmGPnlbo7573eer7iYvrdfGC4RaA1oV307v2ZXMRyu0bL48Zzfx+2cboYvDsbphbMPYhrENY3sHxrbeh//Ch1pR8VrwCy6sYYmeAo1q2O+fMppQ8EYb2lqQjVokVBAXajmmT9uCPRJBeZwYBtdSUq8vRbDCDQ3Pg4c0wP5/dvZ/S/O9GvSiNgIh62JJawk34Dpbo38p2ch8q00cVtpeqJgKCCMPh8F3tpImYDR7WXjWfGjApyg0dzFLLpNphKw7qmZUoUz1+b7lLNRuizXH2lVx8YdX7//X6O33I+ZBquN9WPYcrEl1g/npXz8bxD39jS/KG8aJtjufhS/nCJ053o4MeH02d+Z08eWIKxB6F9B58pQQMA1auunVeG9qvP6gzoGk+e5Myz5nE9DMc452KMVfmWGpdfTXXp6i3PdVVZaFFajvNzsG0OOyduOF7/xG9yf+8dnP1SW3Ke21kSwi5j61sXOsaSOs39k8d8OOO2L9/ld/K2DT3bFhh3Tw2NVE+V96XiW1zFHz9uh+QrGuvJmvlo+LhIObpyIIaf5S8+WQrbBiMlLNG8R2FfsE2eEQ3HIYtfhCAfvcGbij4JDOPry2URlKHqzKoeRhHAhlb7asZ/7RPyutJl28SMFVuJjJTDjrkDbZVSTDKq/Vu64HBYMwmU/j5X0WQKb9DcIxLK4yMgiQzt+bSPIKCfu6YMqpyRi4qWTU3s1Y72s0UnUqF+RiFo5F5NZI3ssayK+FsRHyflZdifYBuHQ+59hpPAgqssbpqLxX+StrbgwkaRoz80PGXUzG5jKYCAabSaSuJHIQldGD4O33Z+WLjaEMcmOLUXgQL8XlQREuF87SJKDNn+zz8uviMk+zmiDBYUX7G7UmkFay9IXpPvJv8zkH4YWT4JYrXSwq/Aj63MCIp2MoS5/KoEGjR6lsdNB7YNGJKr3jyweD20Eg/DfB9fKG70V+vabOje/CJA3uk/mX6FGcUJAdTCoi+EFdba30L0yZB0TySwgcXOHfKHEziH2ssGmIws5gTaEi3ov4ttfJJBr8+tOrf7x6+/dX//b3Nxbwdm6ISXDxh11e/7xQl3/X88mA72M9JmtL3Os5X8kY80Kd8BwJohCjdulZvlRREuEjr1PtdbFUxsVTEZ7K6zxdMRWGGF6OWjuvZacRQa/MSD4XciSGVtxgVt6/R6H7mbl7YFr81rX/F7X41VqPK+Qq2kP8088f5JVOxcMuC5Ak0A6/3yl9L1t+8Uex4X9eZO5Fs6P5ne5zS11qQf5Vq9eLP2yjJKre4qRkJS3BohnByeg+nkxm0QNJnWZoWs9HWQzp6oFpPldJRuimz1ZLtrQ4z6OSxdFvDqrsttnazsAckZi2o6JSMGaRysxGME5ibTUb3K6sss1d5SZXRrfrCNRlqdYaqF7Wpw0aDc0/fLFlbbhMaQB8DiBbdXW/xJ91PoQNDyjd46vgn5cdVaCYlaJVJ1G1wlErBh0DL1oKXIm+ZBt8YnKf2YxTrHpl09W81hTUMpbeEGMaHhVfzwrW4Df2Yjx+EfykzmwEY4f9jEFepKqcjhjMCepM5bq6zY4YdmUNuBYkW7ZrGCIORDCDSQIVbasH2lYfBD/LQ0s14pZKnM3XdWhqbMXNNmbaiYGlotfqZE8AZ35K3n+9S1IFpuWf0T2toK9RwQVrrU+g//ieT9Xl6YxYoUKU0miuTtdM5Mz8trTTP9Ia/qulvpSPhKRZJGjzL7jOGafaiOTAiQAAwtY20c6vxt7S1Kxv2F+jOM1e8s04gtfJt3Ga0sL/9r/96//4zrbLWXSNOH7Odr98QNh737z/FXVYqbzzjKSyKOQvA1pcwnpxb5MVV9BQFa18EfxL1ipTpnhZCWmv9z/lijScjASXbsgQSu9ZNPbJchLPQ7JnR6VnLltyN/QdXrmGNSl/uMjFWuL6bhfqd3Gp3vNifa2m9r3kKd/1i3iXYB3KyhjvFZ1R7IU5c6E4SbepMhUVIo+Fzct5ZpUcUaOpndRdNVtonzA5qCTjH2kTy/qFm007EiYJR0XcMPXNNFzPVrZbhnzeblEeLGHyP0ptfPdf/8f/9X9Kp0RKbY/slFMv9PmrOHrl+4OSeVHHRygjiCNWVLRGGk4t8+dzp/Uiv9Oazc6/zy+6Xw7t9TvfypXXWT/VXZEt3hP87OWvfRG8U4RYJSHk+b9Va0gOwl+qhZ3xq6KkoMa0LCYd5WWd3bwF0gVUjHLIODij36PxWtzc/RqHVrZJMsJ/S33WrfXmpF6dGaWqAyVcAh08T3TQ9exog/MjM/zq0FFD9rFwkLrvC2v7VZxKqJb01M/+lTuRiXD39CtB3SNhU2/Cs/9OvHsfPPuiyIY0+02Vl31XFcP0OMnzS7PcLUDgZLnzC7JxrNT54udTMudnXsetOopAPA/ieRDPi5/gnd8a77xUlqCdB+38sdLOVyQYrPOWQQfrfF4HWOdLnpNDZZ33WNr13gaQzlcWMUjnuylskM7vHEJuE0bW6QRwzoNzfsuo1hPZ7gTd2q4agnIelPNHSjmvJR6M8wEY53fOOJ/pVxDOd4pFeraE835qCHzz4Js/Fb75TFXugG5+Eabp8TLI14aWdA332CAk5aD54x3xJwdMHy8FH4R2ILQDoR0I7aohXQdD22QGR3gzcGs+o4wJoZnoyJvkyBWK5c9v5MFtVHuztN+GoUrqgd0xVOWMUvmoW+iuZcylM6CvTHLdHPJ4IBzXXpd0bTzMtfjqm82h1lGyMBdjNZ89CbNNleyVg7kw3odNwQzACsAKwArACgZmMDCDgdkUDjAwg4H5KBiYfU15EDBv2zfRzj/h6aNo9FM4xLnCvyxOIU6IgLnGuaFaZpr0oF8G/TLol5s9b0dDv7yTk9Wtky87jjTBvVzdzMG9DO5lo3fgXgb3MriXwb3sz73s2GttJ19HTr1cY/o0Hsm1sjttuAjMy7XMy3XOA99TSUfwnnt4NyRerpEn8C6Ddxm8y2BWdPADgHcZvMvgXVbvAu8yeJfBu2yUB+8y0AF4l8G77OBdfh+tXk1+kyFem9AvO4J4d0C/bLZ4QxbmjDfZqFKdAj876mX7RHeLEDhZBuai7B03EbPZl6fkY65ZhL2zVvEVHjEaMvwiiysRf1afoqU3S/gu+WS0XrAIGUUqX7U+sgStNGilQSvdhlbaVA1gl94au3RhBwDJNEimj5Vk2iXI4Jq2jD24pvM6wDVd8hYdKte0/wqvd7SAcrqylkE53U1vg3J6X7hym9iyTjWAeRrM01uGup5wd5eQ13bTEgTUIKA+UgLqkuCDhzoAD/XOeajL2hZ01J1CtJ4tHXUrpQRWarBSnwordVlxgpy6FIDjE3+zYUzMBuE7B01VbQvGOArG6sKiAA8geADBAwgeQIsS8OUB1BP9F5DunR7pXh0prm2H7PW3wd3ndaf4YOjaLPFD3gTsR0HatlsutoZI0VrQs29KNm/6uo252y67kLfldGQFknjv4OwD4YrfmHNMo7CPiqQ2o/dUJlh6LY3c8Yysu4y3VtHVXjJOeLBdsnsQAFLT3qoYSwLRvFWwjjknk3xOuGMc9MSSpje8VHsXQVnxssh2iYqwjdgvNbcOM97II/coq5FeQiuJoVqfIXWynEhapmn8u9g+By4WAE3tlml0hncifFLex/4kn3tJU7OOPrt5+H1MyW+2ZlUeJSu/NX7/2ZPz1+jvvXL0O+DIAVP1w1KHpQ5LHZY6GPvhPABjPxj7wdh/rIz9LV1AIO4/BWfRyfP3N/udsgZWXAFg8webP9j8m+8WHA2b/x5CUbbO7V8fAwKK/+q2D4p/UPwbvQPFPyj+QfEPin9/iv/6Ldd2jHbkTP/NRlLjMV8rQ9UGlkD4X0v47+F02PCk0z3KG/L+N0sX6P9B/w/6fxD8lvc90P+D/h/0/8V3gf4f9P+g/zfKg/4f6AD0/6D/d9D/f8hncVuZAIwqjywdQEeX1zNJENAoCt2iEZAr4BnkCnDIxlOmDcg8mlt1PIFvH3z74Nt3LHdQ72+Net+lUMHCDxb+Y2Xh95BpEPJbpgGE/HkdIOQv+W8OlZC/02Kv94KAm7+yrMHN302Fg5v/CYDnNsFnnZYATT9o+reMhT3x8J4wse2mJRj7wdh/pIz97jUA8v4A5P07J++v0cHg8e8Ua/Vsefy7qipQ+oPS/1Qo/WvUKdj9S/E1LcNr9kD0XxedA7b/XbD9u9YL6ARBJwg6QdAJWpQAiP9VDeDuA/F/tg47sL7VBzL55wAQke+mDLrC3f17vju+uCckf/OPE63FTs+IB04zdtmY4BzEA50isQ87MUDGW1YbFNaNyy2PNK/prTncDaRvfY87/1bNZ+Pkb2kAgp7/BOn5/ZQmmPptswUrG1Y2rGxY2bu0skHaD8MfpP0g7Qdp//G4b8DfDxfOaVH5t3Ia6Uvz9jIg+C/MMAj+QfBf7x48EoL//UajgOsfXP/g+gfXv7HJgesfXP/g+gfX/+Fy/beyohqPD1sZtTbcBNr/Wtr/dr4K3xPUuhBp96hvmAagleAhIwAyAiAjADh/y7sjMgIgIwAyAhTfhYwAyAiAjABGeWQEADpARgBkBHBmBHj8kLzWh+Ovyw6B9vkA3om2bDEVgCQPGmTEF9H9YvUoyrzh37qy/zdU+wz5/msnulvAwnNn+28QkuPl97fIAtj9we4Pdv/nyO5vWezg9t8it79NmYLZH8z+x8vs3yDR4PW3TAJ4/fM6wOtf8sIcLq9/66Ve78kAq39lUYPVv5sCB6v/3iHnNmFnnY4Apz84/beMgj2R8F7QsO0aJhj9weh/tIz+9hUAPv8AfP574PN36F+w+XeKk3rGbP5d1BS4/MHlfzpc/g5VCib/UlxMq7CY9qEqGwTSHAJrv3fszEHz9NvWAvgDwR8I/kDwB1bD0Q6IJcsdz+FNca7ZozKaiGZaqRaUUn7RZf5kUh5EUrX3bftt+MGkntgdP1jO55XPwmWVjkrGl7YgEW8b3nkgFOJeV5ntXNstINo3m6C1QybXbopQPQE67WZtswsy7YaBP3T6bIBfgF+AX4BfkGeDPBvk2SDPBnm2NWrjmMizu7kFQJ29az9HO1+Hp7+j0efhEHcQZ/s7SjLabEsJkGYXZhek2SDNrvPqHRFp9k4Pfru6Bb1PXMGLXd3/wYsNXmyjd+DFBi82eLHBi13hxfbeZG3HaUfPhO1tFjWe+7WyUW3ICDzYDTzY/o4H36NPR7She7g3JsD2ljfQX4P+GvTXILh0UCuA/hr016C/Vu8C/TXor0F/bZQH/TXQAeivQX/tRX/95nfpjQIN9onQYDsnvFsYAuiw3X05GjrskkyAFhu02KDFfu602KVFD3rsHdFjl5UraLJBk/08aLJrJBt02ZbJAF12Xgfosktem+Ogy2615Os9IKDNrixu0GZ3U+SgzX4yKLpNOFqnK0CfDfrsLaNjT4S8V5Rsu5AJGm3QaD8LGu3qSgCddgA67T3TaVv0MWi1O8VfnQitdlu1BXpt0GufJr22RbWCZrsUf9Mp/AZ020dPt11eG2AeBPMgmAfBPFgNeztQfi17vMgB0m83R7OBhntnNNxtwkufFx23J5QDLfdp0HLXayHQcwMsAywDLAMsg6YbNN2g6QZNN2i6Gy/GWYyU46Ppbu9GAF33vvwi7Xwjnv6RRh+JQ/xB293esWKl7y6VBI13YbZB4w0a7zpv4JHSeO/sYBl03qDzBp036LxB5w06b9B5g877QOm8vcylxnPDVjasDSGB1rsFrbefg+I46L295A8036D5Bs03iDwdlBCg+QbNN2i+1btA8w2ab9B8G+VB8w10AJpv0Hy7aL7JsPx7Mr99t56z3v4hWo3vDord21nE1vJ3ZUsZlN8mCK1QftdOfrfIBTB9u/tyyEzfFlEAwTcIvkHw/QwJvi1rHbze2+P1tqlS0HmDzvto6bwbBBos3pY5AIt3XgdYvEtOmYNl8W690uv9GiDvrqxpkHd3098g79433twm5qxTEeDsBmf3liGwJwzeBxS2XcoEVTeouo+Vqtu+AMDQHYChe/cM3Q7tC2LuThFTz5eYu4uSAh83+LhPho/boUhBw12Kj2kTHrOlkBVQcj89JbdteYBcEOSCIBcEuWA1LO1wKLTcgR2HQcDtF2QG3u1t8m63jfE8errtFpDtm62jN1BvHzL1drP+AeM2sDCwMLAwsDCItkG0DaJtEG2DaNt1L81inhwF0XY3LwH4tXfs9mjn+vB0fzS6QBzCDlptb7+JvpHqdg+ARBsk2iDRbvbxHQ+J9v6PhUGoDUJtEGqDUBuE2iDUBqE2CLUPh1Db21BqPARsZbTagBF4tOt5tP0dEQdLn+0tbWDNBms2WLPBi+mgYABrNlizwZqt3gXWbLBmgzXbKA/WbKADsGaDNduPNftjKdyhPW22I5y4O222d6LWdgzZjhgS2Xx1jvzcabI/OoJb2oUigCfb3Zfj4cmWsvCURNk+K7J31ipcwyPkQ0ZzZGEq4s/qU7QOZwlfs5+M1gsWI6NI5avWR50g/gbxN4i/NyD+ljoCzN+7Yv5WmwOov0H9/Uyov6sSDe5vyySA+zuvA9zfJdfSkXB/+yz1evcMyL8rixrk390UOMi/9w45twk763QE2L/B/r1lFOyJhPeChm1XRUH/Dfrv50H/na0A8H8H4P/eN/93rn9BAN4p+OtUCMA91RQYwMEAfqIM4LkqBQV4KdinVaxP+/ibDaKDQPe9E7pvtRbAcQiOQ3AcguPQogR8OQ71RP8FhIKnRyjoRfxrK9iSidDrGvOhks8VQpC8OeqPgnxur5xyzjjUWgS0b1I5bz6+jdnnLrvQz+WUaXUM+h7h3wdCob8xQZqGZB8VG2/GY6rMsPRaWrzjGVl4GUGv4uW9ZNDwYLvU9yDQpOb3VRGchKh532D1c072+ZxAyDjoiUVOb3ipNjLCteJlke3SFgEdsXlqxh/m4ZGH9VFWI72E1hbjtj7j62Q5kWRR0/h3sZcOXCQEmocuU++M9URwprz//Uk+95KmZh199k5PUG9OfrOJZYlUBMeTisCqv5GLAIY6DHUY6jDUkYwAvgMkI0AyAiQjcF7+tZgsR5iMwNsfhGwEJ+U5QjoCfyeUPR+BLIGEBKUr7EhIgIQE7isKx5qQYNtBKkg+gOQDSD6A5ANIPoDkA0g+gOQDh5p8oM4sajz3a2Wj2pARsg+0yT5Q63jY8OjTPdzbTT9QJ2/IP4D8A8g/AIbh8paI/APIP4D8A8V3If8A8g8g/4BRHvkHgA6QfwD5Bxz5B/4WrT7ekVwKq3yTvAOO9H3d8w64i5hNrmS3bpeFoKldzy4DgWO+u0UdPPfMA03ScaypBwpC8JQpBzI/5VadR6DoB0U/KPoLixzU/Fuj5i8qT1Dyg5L/WCn5nZIMKn7L4IOKP68DVPwlL8uhUvG3WOL1HgpQ8FcWMyj4uyluUPDvDVpuE17W6QZQ74N6f8to1xPx7hT12i5EgnIflPtHSrlflnxQ7Qeg2t851X5F34Jiv1N807Ol2G+nlkCtD2r9U6HWr6hOUOqX4le8wlc2DSnZIPzlEIj1/WNcDphZv7gUQNQHoj4Q9YGorxo2djB0VLbwC29ack3QlJE1NDM3ebM2NQV/+TM1ebA01d5+7beh3pJ6YXfUWzlVVj76Fu5vGe/pDCIsM377h1seCNO314ViGxu1FxL7Znug7JA5qRvjRp89KXWdktkFGXXTiB82GzXALcAtwC3ALViowUINFmqwUIOF+mhZqNua/WCf3pUfo50vw9Of0ejTcIj3ybNOezhCVAttZj9YpsEyDZbpZm/d0bBM7+XctrO7z/vAFGTT1e0eZNMgmzZ6B7JpkE2DbBpk0xWyaf9d1nZOduRs0x7mUONBXiub1IaJwDJdyzLt42DwPct0hAe6h3lDdmkP+QKrNFilwSoN3kgHowFYpcEqDVZp9S6wSoNVGqzSRnmwSgMdgFUarNIOVml23H2kV2Y77EExS3snK23HJe2dPe2ZUEnXTHK3cILnTifdICDHyiZdkQMwSoNRGozSz49RurLQwSq9NVbpqhIFszSYpY+VWbpWmsEubZkAsEvndYBduuRtOVR26ZbLvN5bAYbpyoIGw3Q35Q2G6b3CzG1CzTr9AJZpsExvGfl6ot+dI2DbpUcwTYNp+kiZpm3SD7bpAGzTO2ebtupdME53in16tozT7dUTWKfBOn0qrNNWFQrm6VKMi3eIS/uwkyPnm/aOgzlguunqGgArH1j5wMoHVr5qaNnBcE+54jMOgnbaJ0oM1NNbpJ5uF5557PTT3nDsm02Q2SGTTjdFlz57zukmDbML3umGQT9s2mmAXIBcgFyAXFBPg3oa1NOgngb1dHDM1NNdzH/QT+/Sn9HOp+Hp12j0bTjE/OQpqD0dIvq+bflpUFEXZhVU1KCirvPcHQ0V9Q4Pcru6/rxPUME/Xd3vwT8N/mmjd+CfBv80+KfBP13hn/beZG1HZkdOP+1pCjWe67WySW2oCBTUtRTUvk6GQ6Wh9pQzUFGDihpU1CCbdNAfgIoaVNSgolbvAhU1qKhBRW2UBxU10AGoqEFF3UBFXbmuCiLq50ZEXUvGAxpq9e+501ArKQAJNUioQUL9fEmolXiCgnrrFNRagYKAGgTUx05AbZFl0E9bhh/003kdoJ8ueVgOnX7aa5HX+ydAPl1ZziCf7qa6QT69R4C5TZBZpx1APQ3q6S1jXk/cu2Psa7vyCOJpEE8fOfF0LvugnQ5AO7032mlD54J0ulOU07MnnfZVTaCcBuX0qVFOG+oThNOlSBbPQBbQTR8x3bSWf/DwgYcPPHzg4asGkB0c21QxDuOgqKbdkWAgmt4B0bRP+OVzoZluAGEgmX7uJNN23QKKaQBbAFsAWwBbX2Br3HcDwTQIpot3QUAwDYLp2tAWEEwftskPeund+TDa+TE8fRmN/gyHiINc2scJUqKWVs+CWLowoyCWBrF0na/u6Iilt35gC1pp0EqDVhq00qCVBq00aKVBK31wtNKNV5NAKm2zNvdMKl3vWjh0SulaGQOhNAilQSgNykgHoQEIpUEoDUJp9S4QSoNQGoTSRnkQSgMdgFAahNIOQumPyfLLdJY8bMIkreuomM27poZ2klTrFr1Tvo8akuhK0BKfBUi4pEhGxeInYKsXFF9DtZrkL9gkvUili3gpNTKvmvW9VMC0ratA1XS9jGzu8+tRFgEyGmn+phKvjlqG1XiRrOCAdnHeGdPqaqwrRYuyV/y+vymXdVW6WocutGen3indtLfIHSvxtO4HGKfBOA3G6efHOK3XN6imt0Y1nalMcEyDY/pYOaZtQgxyacu4g1w6rwPk0iVvy6GSS/ut7nonBVilK+sYrNLddDZYpfeBJbeJJ+vUAuikQSe9ZXjrCXF3BXNtNxvBIw0e6SPlkTaEHgTSAQikd04gbWpZMEd3Cmd6tszR3soIlNGgjD4VymhTYe6AK7rp2J8N+r6FXdrJHNgUNvJsKQP9z/+fPXmgI1JgF6yB3qN+2PyB2YiBOBDEgSAOBHGgRQmAOBDEgaVYPhAHgjiw9hADxIH7JA4sRdCBMXAXjIE1YcgmxAZV4FNTBdaH+KvG5WYayAGNOQQ5IMgB68IrjoYcsMkduD9WwA5XwsAPWN3VwQ8IfkCjd+AHBD8g+AHBD1jhB+yw3dpOxHbJFMhKJztOd91ZD+7ZXccbp3Y6/cUFjxtpB50WfCPjYL0t5cW950Ux2JnbzXZHF+RvIH+znVCB/A3kbyB/A/kbyN9A/iaiJkH+BvI3kL+B/A3kb05Fsmfyt+/DOantZJ3+EEezSboRB5w9mlMmX3e7CdT5oOWkwFmk1Oh3ZUO3HYWcPtQv1aqOAGt443jjmIxU/3QtIpo2J9vJzznVkW6cjuJ5vIrDmSw57BWDx4TbWQ5aOrqJuOHZebG4mrspIZtzxrudEw+NUdgWfZvl+PhDIkfRfJtsQH+3bG9NCeKPlOOtJAVPSfVWv/56Z63O1T3O5uWxexZPIP6sPkWrbpbwdZTJaL1g0TGKVL5qfVQF0jqQ1oG0rg1pXUk7gLtua9x15a0AFHagsDtWCrsaWQaTnWX4wWSX1wEmu5Lr6FCZ7Fot8nrHCwjtKssZhHbdVDcI7fYIMLcJMuu0A3jtwGu3ZczriXt3jH1t9+9Abwd6uyOlt6vKPljuArDc7ZzlzqJzQXbXKXzr2ZLdtVVN4LwD592pcN5Z1OcOqO8kkZ3jLo0OrMkuzaSL0LgII0AgjQyfvBKOvbae117nSu2vwlmicK12PZqMQit9UYBelZWSlAFneV+MEB3PCJ3No2Y2iPHxDrhx3ut1XP9xXffVJ4dGGE9DoMbV4ZDCVRgrMna48noASRxI4kASB5I4ixLwJYnTE/0XMLKdHiMbNa1hW+z1t0Hl5nU59GDYu+yhRHUkXsUw+GPg8NotNVdz9Ggt3tk3Q5c3odnGVF6XXbi8cl4qU4+0CtSuCdCuHUb7lx1Df/ub809pAPZRkZdmtI/K8EqvpXU7npFNl/GZKhrTS4YID7bLdw8CO2o6VBV3SfiZdwlWNudki88JcoyDnljY9IaXatsiFCteFtkuVxGsEVul5llh9hN59B5lNdJLaD0xSuszmk6WE0nRM41/FzvnwHW9XtN8ZcqckZ0IqZT3tD/J517S1Kyjz26idk8D8ptt2pKHzN/eFNH/7Fnb67X3Lsjbm0HIAVO2wyiHUQ6jHEY5mNvhJwBzO5jbwdx+xMzt7X0/IHA/ES/RyfO4ezmcVBvtDgCwuoPVHazuzZcLjobVfW/BJ12df95RH6B4r+77oHgHxbvRO1C8g+IdFO+geK9QvHtvsrZDs10Su5M4N3KxX9WemzcSsnsZRY3neq1sUxsmauBod99hreVqN0bC5+iyVVd3epTZ7khzS0eb7oEuUmPW21YFWkYpbF4yVisutYLRMZyjpQj2kQUAWQBsp53IAoAsAMgCgCwAyAKALADiHimyACALALIAIAsAsgA4FcmeswC857DAd7T2l2n8NfpRbl/HkQvA2vQtZQSw1v1c8wI0yEC36IPnnh2grVjKio41aYC1U4eQOqBuoSKBABIIIIEAEghYdQTSCGwtjYB9c0AyASQTONZkAo0SjZQClklASoG8DqQUKPmhDjWlQIelXu/LQWKByqJGYoFuChyJBfYOObcJO+t0BNILIL3AllGwJxLeCxq2XRVFkgEkGTjSJAOuFYBUAwFSDew81YBT/yLhQKdIsWebcKCbmkLaAaQdOJW0A05ViuQDpcigVoFB2wrWOfJEBN1iQo4iP4F94YAQEYSIIEQEIaJFCSBLgaoB7IO1WQq67ZmnmLygLowJKQz8yel8Y1lrgRESGRRPRe2JDNpHliOdAdIZlCzRjJCjlUn6zfat00NObdDxOsKzz3jgo+x3kfegM6w54HQI8AHABwAfAHwASIoAtwSSIiApApIiOCLdjicpQlefElIjnJT36eQTJLRwZOmW1rgUkCwByRKQLKH5qsTRJEt4kmCZzq7FDaNUkE+hChaQTwH5FIzeIZ8C8ikgnwLyKVTyKWy699pO6o48zUIL06rxSLGVnWvDUUi2UJtsoY3z4lBTLrSQNyReQOIFJF4AtXJ5S0TiBSReQOKF4ruQeAGJF5B4wSiPxAtAB0i8gMQLjsQL76joNvMuvBNN2UfeBVvLN0y70PJdZa/YM8nDUC8S3WIcTjYNQ53kHGsWBlufnjIJQ+bt3KoLCkkLkLQASQtsax05C7aWs8CqSpGyACkLjjVlQZNAI2OBZQ6QsSCvAxkLSg6cQ81Y0H6l1/tAkLCgsqaRsKCb/kbCgn3jzW1izjoVgXwFyFewZQjsCYP3AYVtlziRrgDpCo40XYFjASBbQYBsBTvPVuDSvkhW0Cm66tkmK+ikpJCrALkKTiVXgUuRIlVBKZamTSjNlsJbNojIOehEBX7xNgecp8C6aEBRCIpCUBSCorAawnYwRFw14R7e3O6aoSojoGimrvKmrfIMPfNnrPJgq6q9wdtvQ0EmtcTuKMhyyrB8Eiw86jIg1RneWGZPbx0PeiDk6V53o20E322A3Ddbx3RHSe9dG+b67Nm9PbTSXsm962bjsLm9gZuBm4GbgZtB7Q1qb1B7g9ob1N72qJDjofbu6FEAs/eOXSTt3CSerpJGd4lD2E+e2Nvfx6IaWuNKAK03aL1B693sDzwaWu8nOFjeOqm334kuOL2rMAGc3uD0NnoHTm9weoPTG5ze/pzefluv7XjuyCm9/Y2qxmPEVgauDUSB0buW0buF08L3JNUR9+ge7Q0Jvf2lDXze4PMGnzcYOx2ED+DzBp83+LzVu8DnDT5v8Hkb5cHnDXQAPm/weTv4vF/rg/FX80mrdLA+odkfchHZB8N3Y192Rfft8eJnyv3dQny6xUScLBG4t0wdKyt4YwdBEQ6KcFCEPz+K8MaFD77wrfGFNytZkIeDPPxYycNbSTeYxC0TAibxvA4wiZdcR4fKJL7hsq93xYBWvLLAQSveTZmDVvxJYek2oWmdvgDHODjGt4yUPdHy3hGz7WopCMdBOH6khOM+qwHs4wHYx3fOPu6ll0FF3ikw7NlSkW+uvsBLDl7yU+El91KxICkvBQh1jg/aRbjOpjFHB81h3iGI6IAJzZtXG1gawdIIlkawNFqUgC9Lo57ov4AS8fQoEesIjb330l5/G3SLXvevD4Zhzzf+ypvAX94LMEXUdRnAfwx2x873hFR7XUJea+HWM+Ld04xoNuY9V6aBzaLPDyTtgCPSPmOIq41q68aal0fX1/TWHPgGer3+NrMpdLY4v9mt8XmUeRb8bxE8+6QLbZXvXjMwtAEsB5yOAVY/rH5Y/bD6d2r1IzcDHBHIzYDcDMjNcIyeIyRqgPfoVLM2dPRXqVb7uiyQzwH5HJDPwcdHeST5HA4qBmfrmR46xL0g7UMVdCDtA9I+GL1D2gekfUDaB6R98E/70GEftp0WHnkOiI4mWuMRZyvb2Ya1kBCiNiFEV+eI7ylvXVi5e/w3TBHRURiRLwL5IpAvAozQ5b0T+SKQLwL5IorvQr4I5ItAvgijPPJFAB0gXwTyRRj5IoS/yRnL4AzCNwIbrviEb7NQen5zCycTPz54Rf/5bDkOc9SiXA3qyIv9EanlAnd9E9THrG0Ye336VP+uzPPx+fNlqeZXPA+iDm7A589GhP75+fk7MVnM9aTdh4JKSoRQ6kkKs42EFeRtzGG7clIMf6Vgu0yD61+i5T1pCCrxfTSPmUk15jBj0o6v9JwvA2E8Ryn7yhUfa1BOu1B02P4zMhjFqdlmXHKSPxRoF6k8ARW0sexkJ5yUfXMf3sZjGdBa8IFribmJaCEtZbg6x7yNMr/rSBSV34xGVqEvumSU5pJOmLDQ/ar/JvfJ5otDpfHwnXshV1VFSpuW8MVlqllPZd6kPFg9DK4LGUyvK6Twk2hBG5Nk00/yTZP3cK31CmXysCyaCrc/UPsCew6Cw79F2alqkK6lSEtOfOGtKQjroM7bSLps8SiOLuVMypsN6siH414LVfX6PiFJO/dRKv+koQud6Sk2yVArgqG0K971guyqB/2wIdG/RauSeDHPXZxaJ6Yw2CP9XMmtbghqiyi42sFqF5w19E8c0xgmxLEdJH3j/MDMMlAWYmWrs7JTHhn3uNt7+Kkr/+fPXy67U4dyCyMmKA4LoaAt6ynvR/aKPvs5l3ndZtyNVgRN+6nU0rTllf0BtLEulslXtmjvk2Vk15aF+M+lznmhzcXycmCr8T4RJ06jPwfuZ5Rlee5w9GT96jlovoy9OzsH1c3788LJDiZ3RY5mmEv2IR1WcSGbahdCo8HuqoX7SV5WuPjDWOlUhIbaVerapm97+el/FoUy4FPj/rWF7F9avdGZPQVOtn7VHn/N8abXl5rOOrgusINdy80xioXXOyxVacFSOaW5gFS0/V6L4NfrfiC9ZdeldVPevi1xFoR9yjTUdt3QvNr71rPWzWsudWoLKU8K9cn7MLQ8vSVpW9Lkih/cnJ25jX7XBGiORfP/JWvh1SjicZlHgMZtv8uvEkKZtahyFbzu+qnT2uxiU8r+G8aph4FntTELptk/8tu40iZRt/3YmWK7mJsbVaZZpuw7rqWXqDb0g2tTqPTrr4Pk5jdS0llh2q0m67EMTsxvG+YvnBqfcqatm0h/6bDWqITcnUzkXTSIrs4ckRrd7DKnbbY/y8QctfEpmCdPYJmQ3K9nq5LVUBSygfseeit7QJQf2qTSJ5KjuB3KZm9p+7NsGlK9tKP0V21qJIqXzw2ytCBLw8HVPA55NBFVUtHpcqmevaj5F7yW6UTer9Y3aVD35JmKVEyjjFRoGc2ir6EKrdfO8nDMR5uSwvSdGL5AM6MG7/kg6+yF/oDvlRfd/Ml0xUpQVzVLExXuyVTL/MrbaC6c8BNBbiru59+L50hZn41nZK8Fo8yhs77p2e6/UE8H/KW+n1S4lyYR86ZL2/DUipSwo5HHnunD9KE5Pv7T8hB9LhT54I36xZ7ll4HBVX333pnx4+badDrRaM8uOWdNXsyPkuA5EwjtQROnWWLPYlpWfWapE+AU9utLmQFIp8AyKhcXdVMOxYpXj4LDNgvKfslvoC1VcGfLbFCrpaBHmD9qIdQZALTzrXRxX4e0c6j2MmJ/XUziNgjeygSNl8pc0cmoeP9e8jV1fZ1fHgRzHPNLvdGaV8H5Rh8v+oTU6jKe6MMvppiIJGfs79wfUsbmYNgvtr/Vw6dMmpIYkPl0lzzwoRcT/6bBtTmx15wvRbwzJQNT7JSz2aN55fyx1FPt/Vysl4I8mC/ySxIL+jSV42nym4hJ5fDnFqGpusxAHhe+/b4SnFrcCLK4Uv/F0bewk6tZEEfqlVGUfBsysUNpCGl/nJVSdhbhVuarMD92JIFlXzMLhvyz2oyyfKgT17ffkzzdRLQQSh6RbDCNZmSf5ddDKmn3zHI+U2TJVV24C5DfZq250mLYJ4LSusfOjLIiFa2743scs3LS40Hp82Lt3tmS8xuljns1JajjL45lha4CGqp7vykpQzdMyuZhmP3m4PV4xTY6C5gcoZyPQ+nDNEtNJll9RNjCbaLZbTgAxqhNhIhdctSL1LTyyJ3jUDKuBPUiqdTuWNVyaqXxMklFOj+jMrk1n5XmVkdCj0pzOqC3ZJ+pAM2Sl1YR01W298t8Zi0MUQr28saup0xF5iumEoEhavij5H2L4n1xgUZUa/sZVsnOOBkGi0dM9KIBig+O8AEPBbvACiEcjGL/2Y7iu6HqZPllOkseNoMy3zw1qvE5MsgUwCdvay3wp5lrFx/fYkra7J9GXFWDpq6zChsVrYca7Os7v2oFZUhGEwxdlV1b4sHG27qabkP8rFzALUZYiHiUFghHiszfSF38qAoX5a27pJb2uRZtMkoN3ua/tyHPV0NVvqC0Zf+JMXFi52qsVD7mrlKpaqNmdTQyDC7EIxdnplOP9hx93TRLp24KyYdE8j6c1d4G6dtiF3gTLyerqbCziIeanFQ2mpV8tFwuKBeXS9OmKEeyWrowWtWv1/Nw+Sg4RWz0I6wenV9KGZMuMT95tBDF2Nh1xM8Kg055rQ/1L9VHPJGb9MjRVF657iuZiFLkcnZEJvXrLzFx2TOH4aQEqv1WUTGfflWhs4YWCRRgYwhJJiJhyPWy7ga34C2M2fwXwTCMZ9ndw5mfNWHfcj0rx5WaC0MZATl3VJmHybJQhs0LJ9+kxGsa7tyX19rQZ+E5fb+a/KqOpYfDJxpWmofcGjM3NH63xbKL20Sa30+4cK7NtXQtbzdoJshB/cKr2j5iaZjG2pfo0b1KDIGri2Y1mA2FlZPLm8qaHlwPwtlD+Jhq7tB4ag0QvlSR2PfRfRL/0xIPbjLY0V4qK72quxWaL9Sem7KmNCC1nS3UW13VD2oxE2pdjWZRmK5Gydx15afXkHz2yno7w7x3UVNBsoxvOfCcLMKYiaQ43D5z9crP4nlDHZnja7BgA3jFpRW568O3ieCg4Ir6tTlehVePaxGG7HVpsK/dmV+nF38Ugcifgz80fvgz6P3BpDql2vp/9i/qUvr+9POHN1d5JrI7kWyUjwevf3nzbvTx53f/64e///zxuqYGTY/A/k522mWDIrKPRXykKa9Y1NQh/Kuas/ImimgaQnlUuRTDfaNJT2vqWIsDgerEDFpQCubCavbel/QvxzC1x1Jig7UfWG2CMPpntSu9bJh8WD5+SLLrxq/LJ6oNhoq1NAwXw3CRaYUHWfpLenb1KObxDf/2PCwWqxg0WzB10nOKFo11PJ7KwmkQXE/TxtolmDowdWDqwNSBqQNTB6YOTJ3WUKPBxqmzcEpnSh0tnVItsHhO2+IpiUNby8cuTbCAnCfyx28JlboGiwgWESwiWESwiGARwSKCRbRji4hU9t+T+e279Zzv3f4QrcZ3/oaQpTDsn5OzfyxS4GH2uGXnJK0dy3AcuZFj6RFsG9g2sG1g28C2gW0D2wa2zbZtm/JNm2j18S6ZRe+Ld/SabtyYpWDOeN+8iZbP5M6NOf8ed28s4nKSd3DMcTjMuzi2vM72WzhmX2C0wGiB0QKjBUYLjBYYLTBa2mOMVicynHiVmauy9EXehkulJIyXUzuLqYhAs/3ikppTtGEqY3HcRzCV7sCUgSkDUwamDEwZmDIwZWDK7Da2TMOPCmu1px2jysGKOVUrRgmAvw1TlJhTtmCcSP8Y7RfVGVgvsF5gvcB6gfUC6wXWC6yXrUePlQ0Y5sh+xyk+0vhr9KPMleNtxdgKw5TxiSazj9xzonW29bDZyqmRqFM0dWzDcXBxZ3Wy7GkF2aqAKQRTCKYQTCGYQjCFYArBFNoS/mg2kAoJpGRmoJ0nkEKqp81SPSEtkzUtU9EMes2ZD/2te/l4xZ7foc18yO6Centej1XZgneYuYWh9TVsLWjbkm+xBnmXUfcWc2y3xOcFbL65+6FYuULzF3KQS7t8huWrJq8HjG+A8F7w3WoAy7ZWTN5mFO7pxthyOvVtTxn/s89XC2eJLL8L94jT7vPyjxR1g6dHxCEQ3WxJFpth6W/LOJkA0Xy8CB1LtpVpA8lUq47RkjbYsGqWda1w/06ey0AiEnrI2+FzGkkRO2Ut9NBdW9Rb29ZZKnHh5VmXi8TVZH6+aQ6t4MBieLnUmtPju3nGv5bZ/hp0mA8Cti/trS3rxiX9nro2+S0iu+OrP642CwFd++iP4oh5YmzLMANp7wZpm0N9HHjbbPFpo+6auWuxoZm1HB4Ct+kPTxxeKyhA48eExpEKsGOc/ZHjdHu6vk643SNlXddkf3vC9a0CyjbMcfcMAD6y6UBpWDLebEF51GZ72TRvzpEqE580Mc9BqZwsIf1pqRAbaXw3zdHInN6Rcf549IQv0/rzUw8yAqWrfpCl4Wbson/80joURhgext14GK1jfhyuRmvTT9vn6DOb3bdHWd2TeSF3klrEITVwQB5xOMAJMbe3pFY/9sCAArt6twABN9N4W072gwgYKOvjjpTkzwDdnyL36UmZ/VV+0k4aoIGnswuz6dFY+36kns9IGZwKfdhJKgJN8bWRGrCugPbUYEenAup4sY5SAZQ0wPfh/DZaJuv0hziaTVJvDVAqBwffFh189rGFa283rr3SaB+HU6/U6NN259XPYIvNrlTRkbvwmmQEzrvjdd69XyXLqDNvlrU0tnCvqwD2ofO9E1Az8Njfd3Q5wDbmR3JLwNb0E78u4DGbbe4N2Ko7wAsEdVrH9yaBlzABFBwvKDhdLs1tkF0eubfPynfZyeXXTPrYkSzzqU8C/YmaNiOJPE6/YIl3SjEUbcQ89c0xkFCBeQrMU2Ce2jrzVNkgaejJeh1PBr/++vb7zzvhroLVDPIqkFeBvAq2LcirQF4F8iqQV4G8CuRVu4TpG9BfAayD/wr8V+C/Av/VMwb0ht+yExBwlAcmOGBMUD9ngAe7urxuH/Yjub5ub/yJX2D3mtFW3FDWCp8VlPCVJKCKY0YVINUEqeYmvHgg1QSpZgdlAVLNo1MaINXcizIBqWYAUk2QaoJUE6SaINV8ev2zO+fmFmg54doELyd4OcHLuanUwIV5xJGO4OUELyd4OcHLCV5O8HKClxO8nODlBC8neDnBy+mlAcDLecg+ws2YPeEdBLUnqD27+QJB7Qn/H6g9gQI2p/bc3Y3JLZCDAiKAHRTsoGAHBTsocAXYQcEOqhUj2EHBDrq944kstvvVfLKZudJYE0wXLxLG5mHcHz+j55TCpNkVdWPTBBwJq2NTN06c8LHlLLfhgmyq+gBpIn0VoC+DZGvhg2l0TKZRie38Q5h+STeiOj9cfvNvQHV+SlTn2yBKPWWMrV94sxp9/S6cLe7C7wYrVg9in2FF8XayBxTdSGUKpLw5UraR0B4oGrYzwZ4U4rXNVpvQ+Spt8CEg1xpK4JbCAAR6sAjUgJ7lr6bJMujxmAdfw9k66gexiVQHq2UYz+hNIz2Zvf4VwwF+2VUQ387JNvl0H6fjyyBcrZYvCQLE82jyufIeMe3TgN4UDIeWBar18YdX7//X6O33I96lrqy1GJDaZ7PsOSsp7jjDLeugVpvPgHQA4YFeQz3cN7GJD8sbek/O3uDmkdrnrsRinIQxiXGh7wPq+0At/MH7x3QV3VcCwW3a1pyFaLlMlnIa3s4ltnV17l5atIInUMhapkECEqyUP2Ah5b4H6fgumqxnNudCH/Tezx+WgrZzj6EpYPUGqzdYvYFjgWOBY4FjnwrHgqj+ZNAt+OnBTw9+evDTg58e+Bj4GPgY+NgLH+8+5QKw8QFg45a5D4CMt4GMm7NcHCwu9skocWKouHk2W2HixrwlR0ds4J+HBAgYCBgIGAj44BDwfvIJAREfGCJukcgHyHjbyLg+ldNRIOSmNEknjJTrZ7czYq5N1nXkyNkn6RYQNBA0EDQQ9CEg6J0nzwNefnq83DKPHWDy1vNj2dIVHkd6LHtywFPOjmWbyzZYuDH95PFBYN98kkC+QL5AvkC+h4d8kRf2JLAvksMiOWwbKIPksEgO2x4AIzksEDAQMBDwYSPgXeQ7BuJ9egIz3zzEQLpbIDKrySx9qIRmtUmdT4vYrGb2WiDamtzgh3Azzprvu6N4AMICwgLCAsIeCISt5CVvnbC7nKcdUPaAoKxrkgBndwRnKwN+HJC20uzThrVNs9gC2laqOnJHbbOkAOEC4QLhAuEeGMKtNN0T36pyQLeHi26LUwRsu2Nsq4b7uJCtajRwrXsGO6BaJ/g7SkzrkhEgWiBaIFog2gNBtDo7nDeU1QWAYQ8Pw5bmBuB1R+BVj/NxoFbd2tOGq445a4FTdQ2HF1OQr/tWTLtOwQBGBUYFRgVGPRCM+n04J/iRrNMf4mg2Sb2haqkcEOvhIVb7FAG47gi4lob7OPBrqdGnDWPrZ7AFmi1VdORe1yYZAaIFogWiBaI9lKTAKxLNd9F4vUzjr9GP8iX+2YFtpYFuDzBNcM1EAePuKl+wbdCPJHGwreknnkHYYzZboF5rdQeYPs2uONolF/YSJgBjAGMAYwDjAwHG72iMO+NiW2HA4sODxTXzBFS8I1RsG/PjAMW2lp82JvaYyxaQ2Fbb4SFiu85oBYi9BAl4GHgYeBh4+EDwcJbJ5tV8spnTuLEmIOXDQ8q+kwbYvCPY3DgBx4GhG7tx2oC67Sy3QNeNVR8e1PZQOq1wd3vhAwgHCAcIBwh/MhB+djae0bLJzvHl5rJkMUivJIoajWVOySuLBKqv0oGkHlfZJ2U5RvWjUTyPV6ORC7y3rtqKqjORuKrfhN+ZyKojZs7Xl+tVUguNpGpRrQ4++Xbwc/+suPGqx6gV6rfS91nn6YnsdzkDL/S0BukiGsfTeKzgXnpVtr5oP21Bxiwfr9hR5pQooWuyEEhko1V8H2W/BP8ZlL/i/0yiWdnwKZgvxiSw6Ao99mY6jcarq0qbqJZonq6X0eguTEXt/6RKew93tO/oZ/JZEGto6PEil/mwS8vBYTHIWZYGw4WcrAs7RtfmlzmhVhvLameJaSi1UA3gsFfstpjJ77nD9AvTBvDP/03jPpgnD71+8C9Zyb4AEPkeXgWk6sFLt6SUEIOAHVkxm5lYWGsDNbfhYhHNJz3+w3hU7aP86VmZ2pxH05/SnH9iER3FIhJV1a8hczqxhLouoffR6tXkN5IEspr840SNQlhQR7GgzCmrX1eWycXy6rq8yF6Yp+GYxb3TSnOUx6I7ikXnmL369Vc/5ViK3Zfi44ckcxkq86/FQrSUxjI8kmVombumReiebizB7SzBN79Lp9tmS7FUC5bkES7J0hy2WZr26ccS7bxELTneu6ZLFoWxII9jQVqmrmEduicby29Ly28n6cqxAI9gAVrTL9evwOak51iCPocKO8iXiiV3kIcMNXkhy4cNvtlWscQ8ltgu87lhqR3iUmvKVVVabq0ywmHJtVhy204wg+V2yMvNnkLDsdg8EtRgqXkste0x32NxHeLichB+l1aVD2U+lpPHctoVSS8W1yEurnoa0tIaa0Hyi6XmEwy2B/ZALLuDDA/zuJxWjhNre20US9BjCe6epwgL8BAXoAf1Smn9tSU7wvLzWH5PSYuAhXmQ13laXuEu3/TZhGgBS9a6ZM/OXtT8C16tafqW8T+jZRrUPXj2gnbbWfQ1nK+CVaJpH5bpX4N4uTS+GM/iaE6ydXaWIR8leeXlyZ+9msVhShLvvAWvKjnL1Licf5bpuvr+PV9Szvv15q0yo8B/NjSmVQlLTHKhYEPaBb+X1MSWePbLcl7nV9JuU3qOTc0C96uhZlP3q8BX35QuIudrRi79qtIN6QnxH7W0BnmRT+V1cRlYhPvz5Zm6zeu1fsp1ipK+i8XyelH++2hMSi6Z15Vt1fWBrtH/DraxzcsF69zkz+r5SWqa9Y5U7qeSDs/NdHrnpeNLx01j/pfzJVQJkcbPpSOi+CH1w35ptakbt8+jG+Zec0i9qb2K1dSpNKKGPbteOW4tHVL/fO/SNXV1ldczOtjJ3FZnrRdhDqujPhezmuf0cbQSHCGyngoJy7Ppae31icPtbtM1n9YTHKkKD3+mN+26zZg6qN763BppnF96ejSjWkZLWc1o+iz7aY35PuBeOu4gtJ/Oh2fa04Kn4qAge21Ee6MFQsDogYtLJ+vz6VglNPWQutYcHt3UvSnVMGLuVdogn2UHS9GOh9g5V6yt/9yFz69zOp7ukPrkDNxs6szDc+pMyWN+SH1qigFs6tpElx9Nn13frKcDB+WP8jo1b3S3cS3UVFXN6P65dtR2dHRIvfQKTmrqJPOQH/ZkbqWbjad4B3XU0jrSpfE4KfPShPPJ6AhW8PaH4EXw088f3lwFa0EufT26DhbLaBr/Lnimr0eTaBquZ6vrIE2Yn50J3zlSIZnN4klkVCKyKITzRxXTEnBMSxpQneMoCFWV0UTUH6dc9008mUTz4ObRqCRZL2XugHGwmK1v43k6yL7VLbnadKSb4iUubdMqgw1GOthAi8agkgLhs9/BbjgjADSKp8X4F/p0+MmjdJyOwsViFCsy8c9G0EuFzTqeqkPTAl8/ibs6FDY/LnLMSzb0fzCX+htmMK/G6kzPX4dzLixpqB+Dm4SkQBMTi5dcjPUfWfuDJc1Jel6M4inH6si2DXXbSRZlrWa/xORVuvW38qdb6pVkipWdulW/t+qTbO5QNZt6JGo0O1Q45Kl0zDxe2UH/CsSBspuF9rTtbrEzw1LnqPvmC81RcB57VUbEcfa0g8FxESzKcXK2uO2Yubs+rBkWGktH+4rDaj95soyq5fhnJ2NqY8vTI2pvbPsBdXR66B4PMZyWptUOZvmUp2FUS0ctOx/dMvGZY5TLvdh4uCvDMvQYusoElFpfmAj7cUx1+C1nIrsYdRu7lRpse0tbD7Gjw0PnUPBwWppVP4ryFKRpGD9WntrNOCqSItdAPuivNxxJ1emhezyqYymbVoAlxROJKkAxjwV2AVQKbDMKsBTb1Bq6lLo0rHSS4Yz5XnNALK7+yqBU/O07GJgqN4gcHEv72g6QrYtDa8dpoCrtsA+W8q07h+pV9fstD5RmdSgPU5h93nGQdNeGlu4aA6Tebw6PdmhXRuWj5YstDUd2D1+Ow0P+Z6vuZ00f5r2gzurazV6W3cGV3pZ8sjvodPl+tOx7uWFtx6DSsWG1rzQmpZcXbCS7k6ZqLdm8I7swm6xXdZT9ZG9ra0vK0eWhczDYurK1yxxIu4ezMo42N+MOhtF6LVGOor2hbQfR0d2haxxoCG1tKvhVfLyHVbdLkwtvFx6Zxrtlylnj06PWvhyvYRp6Did7gpp6U2qAdh3SO/Sv5euYWY88LlMYt/auaAUu22W9eyfSHVay3tUHr5TvqHy23AetL1q6IJN165svD+HyNq29qulzLaXgcDRGiBNc1mWzVfcnLkqCLm/hydybYhLLiexKQz4clwe0fE2yODzjMF31/O63XeoqSnchczGPZi37LF2JTV0uJR3z7rEQpVb91Z5vWbS/nUEs3MTY/hgW3HBNQ2lPiXNsI2qLr9/+wLpcnU1j3JiBCMNtH26bF7R5sGtzzBzoUDdc2d356Ja9oO1G2ZlGBKOtR9vm/Wwc5NpEEMemNOpi73c+4MpN2nLEy9z/EGcN0wqO1Ea4ZqdzPzrYZgta3/7YVn2xTeNbw+UNiS2Nqnbc+o6pM6X9yY9o5vttGsoqGS/GUI1h2ZXcNJROItZj06WOyOkdGMNWn16jVVzPO3Z09lpdPOT2x9zqsW4a8nrWxWMb8boQ5O0PeLMTu9GJ6E+6d2xT4R0Y7DEvaWQdSO0YvlmNvn4XzhZ34XeDiI8hUtGCX6LlfZyyL/j7aB4TmFCsai+CH5Kllw94UOZILPl8nR75DfzuVTrFKp/PVtziBWnsFaJcaXiKBxX9QfQ7TV/ZjKiVRSmHxdhuU5gq9H7+0yPd1eXZKbmndzE56lDEERlfTY1V4f7Z2cxlMbzbmri0GvW/hZkrOHDLE+iTJ/5J5tHJI7Oz6azE0x72tLpc9INKGuQGl/wBTLYPf9DO5r02pvrQZcB2bjDYJBf9E81/E9nQDmffHQH+/7P3bt2N41i64Lt/BcvxYKtLybrMrPPgHp0uZ1yyYjozI8Z2Vpw+sWLRtATZrKApDUmFU5Wd//1gA+AdACGRlEhq56qyHRKJ274A+8OHjSEJv7ytYbdxG3oPlEGXj+hwSiGjp/dcO2TbMHaD+7ePowt1WYy6UwE1kX5QghfbQXaTq5/7IHpJwqMDyj5j/vdb+MXdKnufy4aPE7UpsyR1F71VDy/0W7bV3TJ735tujyJjfTalzuSsOH8xDFkne3j2fhesHlXOstxLB5By7ghJv2Wc7iraO17peRSpShM2dSbO/NmYfkuxvK9p73eh5FFkqkvq1JloZUd9eg6gSveZ7CbXGR4HUq3NFdMdtqo+yNFv2Us3eO0G1+gdRfK1aaI6E7z6YFW/5V6/z2y3dZnbUTRitxxS3W1+mh73OpK21Fz+dcPGwrpNLvOquwHsezciFrsKibD8V+waMBJ+F3kLYnnPa588k4C2kI4bnReXSfnpZWE2LeO94rqwwg1LUFHSqsuq4LICk4dEsqhMgAYXHmUPC6v6ebUg3z248690+Z1WYblx7M6fLNf6f2+th9BbgEAfYIuFfmOFmwCudLOtT4RaEe1DSAciFuXRSC1+ItZDOmqQgOx5u95a7hxCuYj9ZoMJFwLSKpJa4fgkXNy3oAYqCruXDM29dUnsR9vyAl6+yFuWrD6jCTdy559ROmRwgR8JSTCvHNS7DrbcvTjZw076kNDJb27InAv8/Q83/Kw/sJdv65dcVjF5YZkxXHwMV9+oTiUDBJqSHxw+rtTMaEdi7sO8VWI+tnWRFUTFEhA6jPGTy/TtgVjug0/gz8WKFuR7AbEYOhax06Pg7yP6OdPoXDluOqi5GwyFNecIC5PSCDJSUOQ4tOtZAjflHY38HfUNjcK5Jxc1fknqSq9/ZNWx2hrdA1kt1zG5o4+/tfR8Qv1cNA+9NfWH+lffvL19ffP+492HG8mVYOAzc0ngos2aOoOJnX4/qeT/46JeWU8rf8Gsb8UU5dlbLHzyArZJDfCFao4bZOLPJwDkikBrJpA4jLps9smlbduTi0mWx+9V7p3vydzdUAO/cLJqLpLjz1SdfH9rrUPvG2B08RP9fLGiVTwTN8gVQgugnubZ3UKz1qso8h7oa2moAS8Gj9HUetjEvBBWvvVM55tcKb73ldDXHuncwyxkS01iQ0fiyf1G1d4H3d5aK+qwQ5a3MPemyHCX68Ll5MIuHUHOvqw94yss9af0jSRnYybmao316wt3vfa9OZtfHG9xpdTy6+y594v8ZVIwW2nfvGWPFF5iVvDsBnQmD2UvFh4QFvYT/1dWytp352xydPiMJysofcb+mPz1mj2cW2A9uUFAfF1zkoSKkVN62HZe8w8qjWN3iTpzOssRfYm5B9lltNFr+DNX0OorCRw6gB6NjcO6+3jLK7Hi25F9B//+h/hn7rw3YVfgOt9c31u4hZz7svUmvzD3H+nDxfS42/RdMYvYb7+lI86WjUqVvlKaR+5CxspbpZt7xfezospXdX1W/Oe0UgrT61n6l+wqX6EHs8K/ig+W1XRW/qD4eEnDZqV/Fx/OKc8s93fpoYIOzIr/LD5aUYNZ5ZPyQpnKe8Z+5hfJpfV9WZiZx8oiBT415YIKQw2XxxrZNdTm6WC/VOKSonctDty+7dVbpKYJDmR33eQpCNQm3lEXQiAmSVtJ16IGXv+BUDGEvDFKn0JrkVzZnYSLzi0t/BNxv96kq99y0CpdNKVeRKxS7UcSX+ZuWuYJVJLsh6pkJzc8SFCkO7n4CRjHwWN5HWvR5bHHFqv34pP7f88tSbOlKXU429VGJD9mqwMebMB2woouGHgU9h8XJa50WXrqsSq2+ZV19+HNh8unOF5HV3/60yOtZfNgz1fPf+ID992CfPvT8ypY/Yn2i0akf/q//vrX/zG5stzFAtZw61UYs9hxTpdG0OIVXamEeXeXS5icoR3B6oX3zfVf3G0ELm3LuyiigVwBfLXPFxgRDxWE+HQetko75o6SfpXeup3egW6XXSwNbJesKljKWQtvEVxkCWxcocPcLGEFCku9KPZ83yI06tisU+mxjnyXTLmF98oV8sWgG19EEHrSgGUBESkUwS63X/H2wDAX+523p1n+H1OTuUkoDlcxPrlGl7WrIvFgbjkvv/236ghKziCHFe2WBDsk0ZrqFqlbldRkya4mH0/nNmXJvhfFEhfLr3CHdRQfnS/ysqkT8ldUTcnC2aypUOKaiuLN2ifgD6eqxx62dOi+fJHUN7mqyQfPV8kAAIUx+8clR6Ssz3XS+JLzONJwLg9wpdKaJX9M+RjzlcNUMiiz6kd7Ht7gqs0/ShS8T/pbm/JHjBhq6M4aumvRmXZ+NpTKccygyWELbg75LwZlFEVCPppGn0xDJptjGchZKwxVbizSJ/poNXXn6NFODmknNdLov2XIyUTcJkrfoTWgNQzRGlrgXIkFleyJYa2s5LwLXGL1aomlE9LxZhTWRbb9yhdHr13fB6yTtownOa6yN4AhcKF+52JqzVcMMg3i2V24IQWgSvbeZbGOj+zStpX/WV3Hl5z8M+aU4wDGVm+WhnaYKVsOwc4zKWx1A4vqadt2fgwSCjS/PP1sL9eSgIJKk0jOoguqxix940wycrAXI6nRiEeW9KZ8n04B9xddzddwfn4OFLQCg4SfoBFgckb1sOmz6mwsVSSf9Z3j05eT3N6AzUt2YBvAv5xU3oNsJZLi0iLXsKVHu8OgamnJ/mq1lhScFp4Wk3RN8nDxk4nNhCPqmcikx7kRNQrjLei8vYpJMN86LvCvSunGTWmDJXEXC+DH266MjeXzblb1pTThOCs2U0Q5elS+yQC487kkkm8q5R64nGinbnDzsjpShhfzjNINxOwR5xfqq+X7W/mHfr59ezdtz/lQ2/lIwuUqfLbcwDrPU63OJaZWnIjuoeMzds3mSszKV5wjt3r2YjqdTK17LvT7i0iYZXFvBy4QcJM7eDYRWViXS7HhBAw/oAaxSi5hgp/QmpbFgX8iobjEgH5tl3tWEZIT0/mvbojpvLnyvxGmADBsDm84n8wr9sj7N2XFq/IcmTqlogep2OQOLkXhTqpFlryJxFnkTH+a9jZnXLzrMz68qs1LPrU575P6Y397VdQl9fQm91gSM8zPfFIvU31c+DrNbnX1nafcHfdSDfr76qWkCVdyeUsnYPmTriDFst+KZ57YhT/0Z3FkdRN5O5O5yYTedFKXp1lz5F2qjvBU+kxiTDm7kBcm5D6T0K6yV+3rHz9d/9etvKoJv3U1lZPeCfGSuBnv1EimH7Oczky1/UkbpGi0dtimksVJ4aO/gXC9Oec7K3TSUSnlTnacGxspNy4npPfZ31OVo9t/jXMIMzAJOlOP/dm8J+U4U1BnElEUuHNSHs0ufJqUGCNOH+TKfhG3f3NqyEJGp2lIq1Hoq8RbMnnWxYLyUeDiUA5fcu+SfASLnq5agl2kbthqP1iYv7OiCrxx08Gh2pA3JR5EXel6IEboXbh6ZpH7Je8SH1tJDSWWfGOOfKWCV9YvEWGml+uJJYYR1pvP7le6dNqERJxGoColKSRk56NAjg8ENA8Wi3T1ulzBbesJR4jdWGVXl4xwgX3Fq9MlkWIiKw7JrPTvqealkCwlrCj5G3CwJk7pXq7IlwpU/Pv8MYl71dv3/IV7uuYXZ5zonySeW0zf0+NEtmKyzmqQULyS/3gVugc2PJyYMRbjVKGZ/CSWthp34cau5pGc8sw83YzCB+dD4G/Tcw9r8E/3IoMAE+Q9o9oljY/kY5R/QdGyCXU6hVj+K9lqnVPp2Vq/lPKtkstZuTnrljJu7PjEjWJnVeEo5v9Tf5OxGa/YMNHCPCDvkYfN4yPoqhfM/c2CGXVNIavQo2+4Pl8mWZe0tEcSQMAFrDz2mRfUlMHZehFj7t2XQZ976+VPK8utKyMJ54IohoUALemfmyiueem+JKx7W/vCMgnmhauilVz8VvGvv19Yl7/ROOeyVPjk98n5tKZB/DTPC0zYgTjwws9u3X98e+N8+nDzn+9+/PDpvqaUB3Eyxw221hpcajKa4CLpVBVENQVET9XjMw8Ezta4QOOcg/9ZLetaseUuPBQriapk9aOts4D8aCgLmUxrZ2/lA9Bn9bc8PN9pW0mzBNDN7UXvMFGFoQqQQR7jN16RHx557Bp9VEAfx0Mhs4MmZP7V4e2gr/m0GNjiUUdIe0GWwhvugj1KF3B8hV2PQKoqTzBJVqkOiewQfdQjkFUUUoGiKCyy1vmIqqXf5SHCM5Vfgu7C2VwxPPIWpFo1y/6sxR5yCAP6m878jZBfvdsx8BYduIlNkA+vGMq6EwCnw5loaZe9ABVLnTw6ZnhmsIpQ+aD0VGDw6BDBstkb3a2Nyw7o2/jfjRxcVaFnxX9qSl+vvCDNWGJnH8lM3RjE/ZvuEHIOqnp2tw8Ekpw6y03AM6DHLxDtx6tE3iSRttaHG2lH9RmZexkyxowzTCszTNWeVE9l9lIn+Nfpkx3MZia4f2Fj9rNeCjK8H/cWOtxbSHDFHVIu8NH/IVzPfxIvF3N0lMYzJ/48licfyuLzdtK6+hfzfaGtkRUibV2+BnXpuZIvJYP4xOAsuY8R39l/57/lmlE6UJxMirrUDfuj6hxUgnrktsi+s1+zv96/0azR9m+0AllKvGe+uNxnWiQbIIL77OEEJWMwtmp7oICn3bOBYZm2xC4LUbyXgOKgMyxz2+JPIZlDehwaqoMhKt7LYMRovmJWVjMKyfOz2m00u/qS8pXSjllhEPhSXYm11y/NCtbyx1liGjZdVz1Sj+Ek38nMqLxLUOOSNhuqpr/88v7Nl7a3sxrt77VlptX9J5YrIFiAcbGkY4UsZKFduz211/vJ7lUVNZNuXu3ZRr63lfzRwv5WdWdq15bJN65Us5YbbC/jz3/+Ig/iEyt4/+Yt/e7u7c+v/8v5z7f/5fz97fWbtzdsCymG5HTJAEzUkxxfbPzD9Td1Sw2+4/JmxWZOcI8Xv+3ast8vMmOmy44QQtxz9X6BcnQ0e3oG0/kfZzVbcZe79gtun6zuL2n2OxRdY35GyoXYRCRZeGqQFt7IWe2qwV6Gq+eSA011Rd3qlpkLU52owMtcFEzqonb7iFunbsXOgxAdJsLMlFeYvKdWqVcWi4ZAJV+ynTm2TbfmlGOW8ZGqZ+L3/qAuS1ML5PRc8YKcB7KE5K4pjeEid+0a5Pi7nFwkG46aEr2lWO3TV8B8wGW4Vq6ohBzB8snS3l180xWXdD3fa1IoLn7i+WYWK8hHw7dTV2faPdMVVbFim9ZuGHtzbw1vX7qPrhdMoEzYWTYoUiBypZYx2jY/RqTe/8zmfCddrdV5EXNmEw/i6cA5knr0lWRASaKt2scnu3qkssPN9d/I6eaIGD7JEb6zcuxk9CfWH2bWn7UlJY9mnqecJOclpPECEZfofg/H59jUdjkxKtf+6NI5CXZ7b+OQGpe+vXVFMkxnN0Qk69jam3/1ie2v3EWUnq+zv0FnNKIS4spQIZZLFsTkRUDFcIGgIoBa/SZd9jxHRHJA1WRyVauTfFkBM4DBqiJbXbBDggsxeCxxFPTh4rfklCFLWe2I7LJ0NQHzmHUh5gfr3LAWobm0ePLrmsyBGSPq0Q4JeDY3rg7H7xf/zn0+ICmQefCRFmjWlnNwRhdQ2AWPEqEI3ijLXcJNWbRg8PI8LqTukNf5H/XF12iJcIa8OPWjHJ9Wr0tKnqw8F52Z+y09FUdaOU/euPCitRtTlQ/1RRiQywqLgFxf6vzbTmP0Uroiro3hKQ5Rgfi6y4t7j22ewPaGpYATayIxK8PyBdhPX72AccGSfJJ8JoHFRykFsroSPiwRz9b3Al4GyIaM0ARCvbcSmsKSlmfXFphmtqxRiRSwz7Rilvtb/yLTpxJ3aFpMhipuxjNwra8gTb7n+rTNbC3DeYpZPmnIGQ1Tdpz4IttEA3iBi5T1WGysnVZ5txJTo5F/W8Dc9+wFXkTXbZqYfwfHleyaZE3djaSlnqxTrqewUH7mPFeXQUmiLXcr3pLcy1Nr52b1Yibfezbnc+3NflM5td/zHWppezo3r/t84S3YrJ2m2AQkaL4KQ5jD+dT+H2bFmSg+9cq7bK2UE1dQFU/wQviuvkKxdoeH8wv+qWWmA+e3nLkqcqVyAisvjXHKxLWg9LMUa78/b8ND8Og1gSmW58l5pd+gbjv37e9F3O7cyCqLJ0QYp9o0GJI18I8zi59ELpBveMEX59YfJfX90Tq/qB8o4pcaawyW7dZUWuwM2llCwaA6A1lJ1x+CUQGOx6mk0wbGYLg1U0F/9QgZwfmvqdEreSAvzShuugwrjdgs97fZy1V2x6z6kVlR2nt8lC/l2DSKvf49jVIAWQAAsQMiuYTI4oYM4/XfVCx4eGkiYuIMVQ0GlIeX2Ho0oj1cbOBYE3OVfzD1h4BlpBsv7NUJIPV/rh8DIT8pdipPVWym5nyxYj4zv7I+sjM6fM3sLXNLySc3gkEVq8c/GBdZOjnDuQ/FdeUf2lpYNllg1oNhVT+q28U03I1WgU6zHaEs41YzsGhWxJMWm+d1lCy/2uqNgekLMFQS8UDC9rVPxXgpTMNovS4FL4BGV0gGwc/912dAEHyT0mq4eAakgOAVMhjZhaQP6oPeszpGJ2epKvipchqt/AjOVJWkIhmh7NTPqQ3R+7u3N9d37z/8PK1J5HEtOfl7fn7+d+LDES7+EAAXa3ZDGDtMQWJA7NgOGPuKn86458gem6kq9+V5YQ6/4Ock4cUs7Ltn5+OPnEdkp+wePc3MUeBjN1bYnZQ2U1w1xlSnuyqOvDI9VnH08YBIM/puK+zW0apgP05X8dNqtQcQFOfmS7OkyJ5XuvpvtzmPTyF7znZ73hmRnFhwH+b0/3Tmdudx7mBD7rwBf0117ZGRD5DTKQxv0K29p6B8b67hxQa526AYbPnzKn6f3AhLFgzANB5a9s+dR5a91WRgm11NrD8IvcO4iufbH1bJ5Q7mo5t/uYfaW7xKwHisZTcQtDnkd9leVaPRV5TTRBC5Ik9HGtu7VXp1uOj1HrKQlHI8v2OUtZ6Ne82T3Y3021/54b12RrxUGo687naSdySeP+0+4JJCejizyppZdTfHG/zC1TB7j/6nEnPl0HNuL9X8BxJ/elr5hDV696Vi/u0+Lhnz7dt16ZhPG9h8oN+5nv/Ji5/e/jonLDDcebArJaDHlo7wNWfK7T2+4n0c3cLoJuDAzsOavNjI8arguj3GTGn0SSVdrJjlNzqZD2Lp/R4GjqUWHnX5oLs1aIdIXVZKH0N2+dU05tGi7mqbNsUCXrGxVGSF9HDlIWvmDjKRv96+SNJg8DpYtGM1tSX2FWupbfgukG59WTvI8uyM79eKrt3SWMYnMSBYHHm/lID5E3E492/U365JGG/Pkq0BNk7lnQHTXYFL9dXmZw2h/1fWHctNCkn9XtxwEVlArXBj78En1mITpjmbSeA+wz84eYplg05zQL9KDv7xPKcXRV29mKb5DALyQstf8BzS4tXFijDqkJdIgLHQqZ55ARU8FAm7SWlr2XEBVj19rFiRoIcmLfUiaKyg82e2cuwtjOR71Y5F+fuyyr6y3mRiefYeRdIEToX+6EZz139NNekCRu4iCuhIOXP271KqqldWMk6B9XFLvwpSzYqm/FyA77NKCqV8o1/nMzuwHLF0XF1GKqeCBhkDcRHywdAC2BlUoOxxcjMk8n8E+Yke5MrhiqHWRmBHRHC+E1LcMGY7nHmv3hDyyoI0GKG3IJwtWBgU0XzrO1Af1sDk4UwnCyoN9bDn+IHRVBUre7NsX25eUi7lZmZU1I6chkyrJn1IEyW/Ai0OUrc3sNPM2uYdW5t5At/WDLDdHcLTc8BH3ulMvldsbJa+Ru87IO/7WNSsE3W+bdjo45BttBOuwen56X5wJtLvtZvy8qfQeQ/IeUeE6k1V305+Ba0Ylx4tpNswza7JSqfnvvtJukq+V7ROrT7KF9DJD8jJ57JfOOjw5Q7fYIxGarrdciRPcQroFdcz0wdJs3TqI30c/f6g/P4WrrWYJ1KU5yVFsGYvM68f3HFZ+mEI3qc+XfSGqC7XjlLzTJWq8hpOI0OeRogQJ84nXc4n6lEety/o9DzLCc4vvTqXk+qE0TEc/dM4iQxpEqEidHwqQ0dkEnSWRU3EqWP/qaNubMdk5d2euDv5+eHYJwcVysALNdad5HGcIgY9RcgSsJ/2LkXtEPVoh7obE+7mHPAJEkL7cZ45ZZXpjy8rHkP/PiSiKImdFxAeTyiLS/82KKOqMR22HXeXg+D0HH2Pcikk31eapFYUyaPo9Afk9JdUfg5cQ+CQqv6h49/bqrXjOg677ipNyulOAUdP91KWvmhQvZqkD6LzH6Tzd8uah66/Bdfvjs+eW8/edCre/m8scYY0UUk1LdXcj9rOSpVIOEstpdIBdfIpdOb9dOZUXeyXihIpXfiI/LXGql6GYlVdpXQ7vXV0b1LTJd/XZqJTPoiud0Dr6EUiPWdZUryT3xFVD02PdkLbM9NuE0aeYLqFfiW+zL43SspX8zj6+CFlYgAZUpUSQnSey7qIORnqRqhP2Rk6MeBO89KenvPvV37d5HuzdLr6p9HzD8jzw7WQ6Pg7sfC6oR2TjR8uQ/YJpi/ueabvNHvq7om9d3gVZ5UhJUVOD5LS9xyMLmpzJu82Xidk5rp0/ftkvz+pm21fWZ9Cd80dD/Ni3AktyDfiw20FF1Gi79T5udZ9tHaD+1THvbwboHMTWAJZWBt2C70XR9Zy4/vb7/7/jet7S49+I9wneL3MOQBXQDKGUBgtx4YqJVcfw5A5UNBseS6T7eXFb0IKNn/WW/x+MTmXXF9Py08K+k3djLQT7PJn9gK/uuF3MbiXssJ9GMiZutQ7GLEf4SH79S+3dx9+entTLWTNRs2J1mROWzCf3YWbnLaUbpWG1sGikqmGNUt0rKAx7+gU+BFu/7kUz000F1MXVeduxV+sNDLn219LEt4b3eItcebSbknu3C7deL1P1vXTuXgZrb4Fq+c60mujz6tLrc1zJaEvy+6Zp1b9QzWReqtGPa21arWPKuh54qK4R0o6NmmS6PvEbw1Hf9GCvygoTq/dhkSHdloxyJTJZN0gN60erx706aXxsnt0Im07EZUi9dqf6JMD7+RaatIGm3iZWlvstcNRpzIuuJte5fjt4BZldCatOBOZmvTclaiTxzaOcGrMplcRjzYtbtMIyCQVrtLd9CZHLLqdIbidsroMyP3IU4y27IaU5tRjd6RIotrYLakTp+a9Ua8yiiqDJbPkg+iZDuqZZKrTb4ek1qLmfkhrSP1yP5rcnC17nUI+TrXbOXaiSlz8DMLFCDUZko8pJErcDbzRpVA0gm70NtbnfWZJUsf8fnM/sh2q95H1adPqTiKgD2l357mgLf3egZYoTvOdaLm19GtHWpZBsOlSRJU1MOdJepROD5cg/XQfVRXptQtRZW1r7EY0ptIrV6LMRdeWOynmn5M4k6MnZkNX0m9XkijIIBxJMQtYa27kWpZDrndOpJTZrKkLKWUzy/mOalavPSCQ2gRE5o5BGaPo8n2hi2jsIlI96LVvKCWw2gnWKCuQCZLxSZquzMhb7OgSGmbRyll0b9JLKU25NpENrg4Oafplhem1B5Drzk6OQJEeycQfKG2rx5im7gx2njDfrxxGavaq2UnFXd/HRUUXXHqpTvWbVK9Rr93Y9To9M6LZ6w2yxx5Hkx4o53D6lTdH6S/Mkmzs+Dp6mw68jVSheu1sNLrVGO/Qm1evQA+djTRFPkyz0eTTCfQ8TYs6e8DuCR2alIVOrIskBbXK1+/8BYYquFtqA1NdNMp6YG7dx1hinZ2xXPHZGU2eDOhS/Pt7NyLJZ1Qi7HVH+A0hftHSb27IvB/8/Q83/JzWJB6jDQPN+MC2qlz/c8HrfGFPf6Fy1RaaDdUFHfhvLEORO5/TcQTjZ81iWY6IO39iPmFqeTaxp+AXQmI9u1uWnCcr5Xnjx97aJyzlGgkji/xKpSPy8wRUTiEJYp++tYl5oc/e41NsPbnfCsW41sJbLgk8TN0MNOP+IhOPSO40+3kVCKGl08l1QH0TfSGYE2u1FO4rpLqxsLhY0t6wUrnfcZJXoita7zz+TPVrWhYgjOVvv/N62CyTvMQMf2olfuWK/hXmbC0tO3/ulxdpZxVXHqdPp1/ClZmXSfmZxnnL7Gnqb2E0iiaeK4tZjuOwMXCcy4n0Odt59hYLn7y4YfZO9lG1S5+TRn3JNbecjCr9nN+ksA5hKom36UDyGyuZ9yzmQgWbKE6tsiHkcoQRKowMf146LDyR0c0mgLRdLINR1WOcC62zkuZCUauAam5IqK92g5jNVHweTBpzL6bHc8XCSQwIK1mMBm99ROJY5AsrjsgUkpc5smXFZFxDw5v6erXewsRymfZ6sl9uqRNMTdhVCq1q1jFFTqzy95gmcEhpAiWppMZ+qU8u6V/vjaeF6+5zGbhO8Jr7jhKNVS++lmcOK32NvnFIF9ZXE3Kdjmt87LfhtHARTjWh0Anef9NtsrXqvRjaxEfyp9BnDukaG0I1Q57y53R8p2IQ+m1WzT2qPlvb6TnXAyelq2iFPi2YREFqkn+hCx6EC44zKTrojqkdGgzIYC2xDa+tTnl3ij77MJn9JCqiTrwmVRBNejJ01ANx1FsnZqoibh6Zy1JQnZKfrhuPoZlf295Zninw1L109wkRa9RFnqeuVm0UWdzQew/TexMhTnTjxgMzdANtwb+rUy6eoFs/TGbJqrIYpYrUP42+e0i+m4rQ8akMnZAL0VlWky+ekMeuG45hmV7rXrmQkvLk3XJnmTfrlKOQGLFeO4rpD9EzD9Qzv0iSUJ6ya34ZuPm1wGiT5Po8QWZbxylNq0QdfY5SxWPofYfEeCOx8wLC4yT8k+W+qYah78bV3LeqMqCenn89RKLXihqocnFKVEGZtRJ97SB87ZLKz4EDUw6R50c9HX+rHYqhGFt7vreYLvZ0PW93WXGVqlBMXapRhFKaT/S5A/O5riyZ7Cl6XHeIRtbc15by6p6Kk/0bSwSQczWZSlQzps79qO10womES+lgJTqgyxqMHraPHpaqi/0iTbs7dr+qsaqXoVhVc5cqz298esvX7tM4VwRfm5dZ+SA61wEtXxeJ9JylJIvx6axe1eMwBBNr4eiyJh3iCZ5hPlD+6+qpS7NMjTWPowce0vFmkCFVGiFE51mWefCEDjrXDcfQjK+5b9ak0D4913ygTOEV5TBL/a1/Gv3ygPwyZB1Ft5yYXd1oDMvwmvtk01TiJ5g98lgZ06sJ8nZPgb7Dq+jMh5STMj05Rt9zcMldTFm52+CMymo1M8Fe2YLzV0d0lQm08dUQisShtS9ILnkgVvS02vgLnnbdDfgAeFRR3egrM9L4aRMlvbXWJKza0CvLJ/EFe2jphc/MIGg50eaZ8WLAkQnHFG3Cij+4dwpJqO8zN0CLIGGszWWdvJW+o3g4SrKmZ2mm43BbTHjd2pUXDa+9kKZrTzPMl++uKKZv3+vKjHavzWh4dUbSUbg+gxugqpJW7smovytDcl+G7s6MvG1KLsaolFO6HaNgqcorMLJrMNJ8/a8lWZuN77wwuAGoesNF8ZOlF1CjKZmUxhrBaid7ZSzOueiuUvk29dCKBKZ1z6N/Rv88IP/MrW9Q7jlvmLt754KZ7uKcf6imjR6Pb5Yk9sxfRdttOuHGN9Bqc+8ZvoZ+G/32gPx2wSQH5b4l1rq7F5fZ7i7OXO7RxuXT9Xmbc+79wAmN0d2ju0d3v5u7V5nooDy/Pl3y7pNATTblXeaDWhc4tqlBnRy6MDEcJmuy4YzwuFo9+sReg1QfNkubUKe6Zb79LfyVmwRqnkS3j25/IG5fZoADc/rqDMz7uHxNgubdHL7WtY3Z3cuzTSvdfvdpmNH9o/tH91/r/suGOOBpQJ64uel0oMjrvP+0oHR9I5se1Mmq87PCYbI4N0WHzDLP4gyBM8QoZgiZUQ5rYlDb6x7zgSaR9E7TgNbXjdr7F5Jiq91/Z9miMRhAV4+uvt7VCwMcsq8vZJ5u7OyLiakbePtPkszkI2JhSrJs59mYHaefbszK1CfU1bMzSYjeHr39MHiZBTscFj9TYqJ78DRlKbF34mvKPdm4vLkqr3fOox8i4TUu2tGNoxuXuPGq8Q3KlatSae/uzpWZtndx6RpXNk63XkwZLnHq3eXSRpeOLh1dusalJ6Y3SIdezNW9vzsvpfLex5lfy1K2j8eVlzKS53x4NTP3HiB6bRJhcwetxE50Obtbck4NHNM+Tmkvh9SeM2rHEaX6I6uiFe+j9zwlr6PwOKXk1XWupuhmypqn9C8l3/JJmq/cyKHUOJOiI5k0zKKd8wbdp5duCr3WpsrFFR6u8Mawwiub4qBWeHIr3X2Fp8h3vcsKT+nSRnZ2XpN6MH+I/kD5rBsfrzTL97Xr+3jgEueAIZ2vl1rrsA7aawx5jxP3OrPe6ei93g+Oa27QpA3PTQ0HyqfddGYwywK84+s4L+C8MKB5QWqqg5oWNFa8+6ygs+ldJgW9BxzXnGCatjyfxvZY+bwbp7ndPZFwk7JwMsHJZEjJcWvNelh5cw2NfY+Uuqamv1O2XXOnOpAJ6OzsleY/67XvkYAaqe6hs1fWHdyd4FIXkDqG75ZMqyz6drhdrzwoBG4ccIOtdcOUj3XYpv+giukGMcuev4qfaGlzUSl42vQOBevy5WlF3Qa74II+S/u74Ln5vcenOH3OenDpI1B0NKXO0nohvk+LpH+tljGhfpewBPyiBvr+M/Ul30g0selIWNdx7M6fwOWTX9e+N4eqvOSKhH/REYOazwOXCvzcul/QsYRv7q3VA2T/iWzrWvZtkt6fTye0mrQ427rd0PrE65YbsqZ74Gq3VOuo6NZUq6lTpO0PCf07IgG7QcBf0WdYOVPrYQOXBcB89UDYfEMHaUFrgeFOSi68/Mvda5uKjDrjJ+LD7LXcBGwutxZe5D4/eI8b2vYI5qhkGGhzXDY2yY0IrAH5rsDIVEeEzwP81gTXh9totumsWhxiPhzvl6z0SkFnbO5ISoBv4PnvqHmGhN2uEcVwqQTt/TeYHrmKrDahNd9E8erZun9DC7yjrwF9AH7/b5hWuQqewXqJBDAPO09u5CSlc1v+N26KcIdKuiQCGVGP+YFN5a7/WXycNDr9w/pvq/wV/FgQP3a/UCcINjg9Y0sYfcnCXbMSZD3RVsRdgrekI5jOmNCdqaVqd85/C6dq2A4brk1Ji2G1cA8lioEPqMsRbsn5heqj/5oqu/vgkzsqCzomxYGAD//h0olW+coFdWLs0uXU2dH36NprFfBOJL7vSlLyte9Rw5pV3kzeOSsVfSVul9ilzLQotgZI27ZDa/irb5dLMCiDF7+nHjD1+OI1Xsb1hs7cofcvo5ZnD4tO83W9+r26gzS8mEKm/L2KK5RQKFOs5ZsUyovgTc1njd6/4/mGFhO+Nygy30xJYry9ipaUIym/QdtlBfEu6NP8tdqbmgyArXdMncpKV1UNL0JXdn0/6gqXlC7PvtJuDxS5WJr3RJ0uYC9pa8rT1NdNZwrnYRuLQ3c6tnHLZWe89nOBkoJkNTT1ssmMpTrR0HS4lecbGg+1nLLbVntLBN7GrS3R/Zo2s0I93UcByoXwlsqJMntVIC9KXktL46zDV/ab9jQF6mpsMtPqSuTd1GxW7FWlpjxNfQ36qCtQrKENUbP9VsKGhZu2pMmi3LR0PiwOh7cy4NRxsoAyj3gCOsQ3JqAZPwPEKsV3zwXKyINAHiLcudHXLDw+Pz+/SaCVCG7PnD+RxcYnC75XEPKZlEEx+ds5OQwH9xdy6J9vD9D/BauYljJfUfOPPRrXP5C5C5jXC+HgULilxWVw/YojHlsGmkTk2aXR8TxKiiS8ETngJGnP5SrMEdt934pWsCdBJna+ZxnE+jc2AqUbT/n9wnHokXLW67kfTWWXcmr3lMSyL4Mycg8RsTS0S2vEYi3/VvwndN7xFlmlD7Hz7S+uv35y/2LDlxFfztG/3i+UHHWBXNAuJdsM06Tkmfidw6LZ1pvjBV7sOMUxKW6yDW5QAKMCuKq8PfSGrEmwAJ2iCsRvpuUtBiOzYOcC7oIFJHITsz/dBP511wD/sdt2J6VCXwBN3sJb8Ats4muwemHF596y3r9hgCF9mgOM7CEP5AMwU7FIhiqWBsp+pFb44m7vxdW6YPLPYHVeXNx5elUqjN+27PEOLzcx7ODRVpBf1+xO3pUVbdZrukiy5uEqir7Ltxmg3WhK3y0VKWzxyZs/WXMGYee32dg45LDYNfgj2HELSgMiLfWJhKWtNL5/lns1rxJ6DDJzoNfZ6+8XCZxZ3LErYI6p+dTru2QDSdZkWmey/1b8QtLZ+ZMbBMR3qI+kE0eYe7X0jeRdYTQwVfG/cp6RrrmogMTaM3EB4rFLeD0P72qtTep3Cg0o+xm2O0UdTbkaIcEfSEBCl86bnxnQzOHm7NbdAuL1pVg79f7XUDjftGHTCN9z8aInti/DmxexHdxQlGHDnFHYPUvpCKyhtCjWk8v9rq1N/SaXV7oNXJIfbIKnn8UrviaQ78uZLQ0KIrCzJcZkunuhN2QpLS8ky4ns5JDkRNnmIbeokeqT8xiu50ypolv6+KUYDElplf3+dIxhs1+2doL6I/uXwA23N2zuXwAYr9n2pN/OuOIBryH3zj39jvpDJuyMYED1CYZHWR7U7/CFyAz+tj9RzVJvqvIn+bb7OTx6rn5WbL3O9LYKhYgV8GWyDihIdKJtjbtwY1eyC//E+JeR/Xf+Wz2gGTGB6sysRWUrGG7Bm85kvlddwMSmVgcq6CT9vdRU53I0gbW72B2bdscWX9u32ygmzwJ6UO2OSz8uuB4n8VVUufnePmhd5T3CIBnLsDmwO0vg8nG5LdFZkH1rs2vfZ6lVMSsFQW2i1/Qb++cPd867D7/8/OZKraLs2nPDZul1SKblrJlczX8JYDUV3DF3rRa1BRt+fOI/Uza4Ory+zK9zG+Ticai8+JDWrEo48uEkyIfjBhz3uA620iVJKpSIl0+feef6kaL53lKhPnalofYnWLt9CMhqeXle+fZ8AoJPPz/XiLj8Km2hcRuST6Slq0e9NCBA6OmmfeynfKgFsa1avIiKlZJUvWinE/jE+gMd+/MzrcaZbw5eTpTKojY56EI6xHwBpW9vOopv3t6+vnn/8e7DjQ1UOTaXyf1fH/zG++Cb63uL6/Bx80yC+LJmonnmOM5M+9DynC1AGY/vl1/ev7ES+txmQ+c0+OTyYUuFV5yH2ZzNHpn8bp3XVPDkAnqT6sJqyePXi990Yvr9oqbcc6Dm8KiQ8WZYkYZadvHvdYUDILRdbZj1iQDc5Uv11VKE4mEIASlfBP2HZulT68dZJOdoJrnyVJ7xCES/hHKdKd9+Zb0PEmzgf86sP9v/95/tv+bDatojbj7AFAMg4V7A3tk8eq9eOHpLicm9jy6L8wisWiJWlICb4c+cCWpsLFmYbaJs4awrVTOtSv0snZLX7vzrJS+o5mVm73l5cGYOfzctwkgW/08qCrEnAvhiuHoBlVuQuU/VcMEFE1GxALlrYa1Xq9Df/rum/BS0cb1nECh53viM8RyLUjzaY9qKBaw4BUhaBHryeGq1fKpzETUIAbzyobD7s67S+UWFXPTTt1Jdki8mmlcLvNmCF8rzbpNyZDBFKb63M2xikqf97EliKrxcheQTuajlJ56YJAQuRqgSi5diU34J6PLy85kyoC8U+wM1bFbM1PAFblKlV75kbfrp7d3fP7xxPt58uPvw/S/vnLc3Nx9unLv/+vj29sryvSj+DLasWvuKydQWmyNfYAH8WVZNi+UXjUHTfuuPpoN68/H1Xi/evP3+Aw2hcq+eSUwqCSveFpei/KTNR9HVHulG2m4BZaTSEP2QNDzXWQg5rxQBZ75oJlBlrBXF4Zf99jhEI3cfp9K2hUkLU0JtaYdixRbfERG7bHR9uiGMiQoIMN9fZGdRAmsVLggsL0olsNlBMKbp/1aBvwUi+oIztBntvlpeqQy2vhJ95psAdnWgOHhT7uQtoE3BnHDblMhbYoi1xriDARaPdig3yqLNGi4XsFPVKM0UfHEuBJmE5pInkqCSx4qyEiR2kD5/ZgLF8pCR/UMAZMXSpnlxlLrBQRzelsfcwg4+d9gii70rLbdUFF2SstLEea3q5P7K+mkTxXyxK1Zjyakb2BxLV1/iCBaf96t4OW+xAnW6/p5++vaNTBLiRfilF2Xx37RbpQ+yCJ6tYhJrrttFyQaSbRhwp6zZJSlpgLzQkkiy4iWGpalLqoV1dcNIVjZrSgLR1FkUhLwKMbSqLaGCw9R2rywhFQMgH1fAvr+Iga5MQqCSB0ksmRbDl8zcnqolLEjsen4kz7e3iapLayhR5genZ5qFd06/eRiYU3CfBJfFTyfW/7T+zNW76tkSCDhvCleqA2xANRBuKIFHxO+CX5qpOlXqhvGocu2UhYYCYqvicZJ98csHEjxNrizXjxg7BTb9Q+uRxHFydIjBA4BiRUx5SmXci2EVMr5nYJkXzP3NghcA50oD614MyT0Ej8/uV1IqZkEeNo+P7ASaG3k0hjg722moJ6aqz+YAmFrgN3cpzAwKHxWXYDDZXnurG7HwURNOpHqcl2G17sK/JEFm0s3Cc8lgl6NSk0HwwBz5PJTvfqnb+kiCOSo6vfnSkcjh87nTOMjDQh4W8rCQh4U8LORhDZqHVTjR1yMaVvGsIrKwkIWFLCxkYSELC1lYyMJCFtYRWFiFBQmSsJCE1QUJq6Bk4+Fgsd9IwUIKFlKw+k/BKvigVhhYZfAcGVPImELGFDKmkDGFjClkTCFjChlTyJhCxhQyppAxNU7GVD5BKRKnkDiFxCkkTiFxColTgyZOybJu94g/Jc0ujjQqpFEhjQppVEijQhoV0qiQRnUEGpVsXYJsKmRTdcGmkunaeEhV+d4htwq5Vcit6j+3SuaRWktylS98z1RXkiJUQD6SuJDEhSQuJHEhiQtJXEjiQhIXkriQxIUkLiRxIYlrnCQuxc3VyOdCPhfyuZDPhXwu5HMNms+lmN+Q2oXULqR2IbULqV1I7UJqF1K7kNqF1C6kdiG1q1NqlyIWQZYXsryQ5dV/llcNlNB2Ti29t0CCFhK0kKCFBC0kaCFBCwlaSNBCghYStJCghQQtJGiNjqC1vVu9TtZagjmA9CykZyE9C+lZSM9CetbA6VmS2e145CyxbZJM3TZ5Xsd8S/0t/IV0LKRjIR0L6VhIx0I6FtKxkI7VIR2rZiWCBCwkYDUgYNVo15goV5L4AglXSLhCwtUQCFcacKB9upXaUyDZCslWSLZCshWSrZBshWQrJFsh2QrJVki2QrIVkq1GTbYqMTWQdIWkKyRdIekKSVdIuhoR6apkGki+QvIVkq+QfIXkKyRfIfkKyVdIvkLyFZKvkHzVmHxVijOQhIUkLCRhDY2EpQALuiVjyT0HkrKQlIWkLCRlISkLSVlIykJSFpKykJSFpCwkZSEpa2ykLBLFP66CxxtOYXpH4vkTcrGQi4VcLORiIRcLuVjD5mJJJjekYCEFCylYSMFCChZSsJCChRQspGAhBQspWEjB2oeCJQkvkHmFzCtkXg2AeaWBBlonXKn9BPKskGeFPCvkWSHPCnlWyLNCnhXyrJBnhTwr5Fkhz2rcPKtPoQdBKBKtkGiFRCskWiHRColWIyJa8dkNmVbItEKmFTKtkGmFTCtkWiHTCplWyLRCphUyrZozrXh8gVQrpFoh1WpwVKsiONAK1wqek9bydrmkhl5hJ4DfvfY9N8pczPduRG5J+M2bq9yNKKsW1EdmFzK7kNmFzC5kdiGzC5ldyOxCZhcyu5DZhcwuZHaNk9n1A4k/Pa18wnd4kdGFjC5kdCGjCxldyOgaMqOrMKsdj8kVk4jKXcACj7xtbFBEO5HKhVQupHIhlQupXEjlQioXUrk6pHLVLUWQy4VcrgZcrjr1Gg+ZqxBaIIkLSVxI4uo/iUuKB7SdKEvmGZBHhTwq5FEhjwp5VMijQh4V8qiQR4U8KuRRIY8KeVQj41G9o2395MVPb9nuCvVnyKVCLhVyqZBLhVwq5FINmktVmdkwMxbSqZBOhXQqpFMhnQrpVEinwsxYmBkL2VSYGWsPMlUltkBCFRKqkFDVf0KVEhRom1Sl8hBIrEJiFRKrkFiFxCokViGxColVSKxCYhUSq5BYhcSqkRKrRFSHtCqkVSGtCmlVSKtCWtUoaFViXkNSFZKqkFSFpCokVSGpCklVSKpCUhWSqpBUhaSqBqQqoVZIqUJKFVKqhkOpKgECXRGqit7BjE5V5M8Y82aUyQFZCdCYfwBNQ0qSMq4k16bpGBldOwwkksA6JIHtrMzIHDNmjuX9yn8jjwx5ZMgjQx4Z8siQR4Y8MuSRIY8MeWQGPLJ0t0eG38ImQDFXfXHVfqG0rwomr+KrfRJgDRLVkKiGRDUkqiFRDYlqgyaqJRNaD69RLDcNuWrIVUOuGnLVkKuGXDXkqiFXrUOumvGaBFlryFrr4mLFsp6Nh7+W9AyJa0hcQ+Ja/4lrZU/UNmOt5A+QqoZUNaSqIVUNqWpIVUOqGlLVkKqGVDWkqiFVDalqSFVDqtouVLU3bvBIwtUmeucRfxEhYw0Za8hYQ8YaMtaQsTZoxlppXsPUakhXQ7oa0tWQroZ0NaSrIV0NU6thajUkqWFqtT2oaaXIAhlqyFBDhlr/GWoKQKAVoho8Vyr/7XJJjbvCcwAve+17bpQ5lO/diNyS8Js3rzoXUYoGsMerMPEqTLwKE6/CRF4Y8sKQF4a8MOSFIS8MeWHIC0Ne2DivwryNVyG5IfNNGHnfiCgDWVvI2kLWFrK2kLWFrK1Bs7aks1sPk45p24mULqR0IaULKV1I6UJKF1K6kNLVIaVrvwUKMr2Q6dVFOjKt0o2HACbtJtLAkAaGNLD+08C0Pqo1Mpi0lj0pYbqyancGkB6G9DCkhyE9DOlhSA9DehjSw5AehvQwpIchPQzpYeOkh90Qd4HsMGSHITsM2WHIDkN22KjYYbLJrYfkMF0zkRuG3DDkhiE3DLlhyA1Dbhhyw47BDdOtT5AahtSwLqhhOp0bDzNM1kskhiExDIlh/SeG6TxU27dZavwEMrWQqYVMLWRqIVMLmVrI1EKmFjK1kKmFTC1kaiFTa2RMrdfJMus6WGBSL6RtIW0LaVtI20La1vhoW7UzXQ85XMZtRkIXErqQ0IWELiR0IaELCV1I6DoGoct4sYLsLmR3dcHuMlbA8VC9aruMvC/kfSHvq/+8L2Pf1TYJzNSDICMMGWHICENGGDLCkBGGjDBkhCEjDBlhyAhDRhgywkbBCMtFhJ+I+/WGLEkIy6Kr/Vamr6xPsGQrkjWSqXhK66bFR6BcLt+mY9ikIJjkX3qkcWhgPWzzVJviHNwqqaPYCb4PmCcPSTcQ3y+0i+sHQqVHvcrqKwl2X2FHIv+28k1Jru5qSeXFpJxbUsspSTdGpZvexT1Vjnx5FdgmQS4dJ+MIMEjeccr2lIx/2WyqDaNe8Hm9iqnCbhOCww6akHvbfp/9/RMvSLpBxqsN2TY02+2vk88NexSIBpryXkIvNizvE3u0rjwBHZqVKB6uKZPv8ZsUmFIrNKXljYM+lf+nTP+EgrNFMf+zbsWW6FCVmqSwZc2yLVV/u0JN4prQBgOSK4qOB5k+ynXA6NG70A0idw4CMitaKEMzPiYb74oBXJUXbxVjUsds1Udn1QrkSLHo22wuY41WOSMlkcsfz+vrrKrRMq6SZOUn7b90NzcdLInDqxs02SspKbC4pvW19fwhfUuyyK4i+lyxXN+3f/J+JQuhJBFbnMkldc6woPvCOuSe7SncC1nf871MuqSQ7+Mtzy9+Yx1IzP/3Cwt2KNch+eatNpG/paKjHofhTHR14SrKOV94S9aA2LoXDb8HqApWyYK87lMrIQtbVcD7IIqpYBMGl2sF5EXaNfKNhNusFmgVDBqssVV9TEbDpvp5Wenw5N4+r9G/gnfL6V/JufFpqQ3ndnw3lM2bCjeUm4PrLCr/6KxawTDdUKn/6IbQDR3UDeX0r+yGhDMYiSPKLbdVrii/fK91RoWHZ7JqBuqQyqOALgld0mFdUl4DS06JhcPj8EhpvK5wR1nkX2dQuSdnldKH6YWKnUcXhC7ooC4oU7/M/3C03rkh4DW+EX97VdyFUeP1ci8lwa47BtgLNn1VCylXX26GrZufutQg43J0PP1b8awO9yy88rdip1ZUEf2Vu1CcLWQ6V5W14wA3pwqwwzfCWzjO1Q4TiH5q2gXCLM5isgaKA2fAsFwxkUbQ1sS62G9x0kz2du4VY8Vl/pB/Hyk0p7r3fw1CeB+LA6il5kkPlsJ/tm2jvE3k3aLwFH4O9qD0PuS/rV8CILrNrF9+vn17J9v+5Sf5lMUsvHkMZQGPA4hl2hK7U7KyAkG+AOppryzvMViF5POzF82/nEnZ6XyPOhIn9+GYxIK4bCJkkz6ds+laJ1hv4ql16dnEnkqKYRvVKQFk6RF/wRkLkymQzaOn1YZ+AmlALhxnsdo8+MTZBHDgc76CjXDnQlLoNzf0XPok31X+tqJ+2w22FlsfxZ7rsxpgbbSknjyOeHNhV5n36CKSNdQN6UsxnDiVfHv3xBoIDp02KXuYJSDhiUoCtontBdbHLa0kKJMfeTlegW3PWJSCcsYKeljRvotPqN6sYIg2ksNrr6Ax3O4vLI+vbOwdXMMr622acOG7UCwqOJmSkzKBB0KnLzje4xVzX6yWFqHDSVXRlg3U5fUEMjckzoUuXDw6MlNrpXr++0mqZ2xMIBsEP1lAJcyyurBVmWv5KyCteM9kKhTSS89PPBMaT11ZHNWOgNCXHqSwR+8WZbOjvAVG3tJBT9yOJzahzOZ0cWp93iGoN9bF6Q6q+GUiMdBf/pflPVMv/o3AEcUra/5E5l+5qQbcEVC/G3l8qOkkwY8yWi9wRnA+p2FrEAOtW1Iy5/u41uPNx9dJqgE2N9m7jiWN/1KbqY5r/puZzFomLdSXGo1RfRqb383Qv0jp3+lJwzQ/jdynTKVLa8UBPAGRyEsyPZPsFF9hRGbGhMy1NNc8vaORn7fKDSUdHHlztQeu2eJBNE73XOJ3lM+qj5OpR2O/oZeOo1zi+w1pVttuQ1oUhtC2vLLBEbf3sIZ8B0tDTZYPlrAEfhgkE0n+MM6K4aSJOXaa9bhTgHM3P4nXlRkWnAIMoKklh2DIli5UVrQQb7Hz7Mzesl+zv96/0foNR27XVzsl9ylOczkFrFs9TFQHp3Ol2Hnb07evLF6mwNWCTCotADmGFRelXqpcDQWltZfeV0LLytp4CFBEoXapirPG834lN7War1gUk8or6xMnA6fHcpI4g51EZkPMEsIlGfiY/l5EAkWzOLgP6WZ48OA9PsWKiuDYNA1p5pvQi7ewpklQvsj6DmqbuwE73QbfbK04hPNCEFUK9mGSpjLBgiGmVNQEDYXgmDZzTmNYHpNGcNSaBWrTUv47SPoUElqn6CON1d2Nz5IIfpeci1PU5G7ipynLQPiNhCGkIGTDACKDBS4LxHicVxgw+SntV2fKc+p86Hmuh3Kmwfup9bR6AdR8yo6W3+f16J4tBKEtyXEr6WKQVySo39nIJEfL15uQrjFZ7TQwFacfIhGw5lONQuyqKLzSbAD6A4vnsii1mcEUtrmNpRZhYtE5V1RjzQWnJUukUl7jaS3TIA9hZY6Rcr+rs4l61i6lzcoPlUnyLM1ckPi1En6vHVKuCT+wuGO1CeX5PKVJPIWDSG1TAu5kFWQ6WjjfEBFqlnHoLuHQYbyqTeym7GNR5Wr2K9geYmf+u6wt+Yal38jWWyK7m0LFjHK/FbZ8y3ZZt6mcDW7NxnJFg+VCmSqTBrIhmBUGyiivYcH+/zjLj5kknZzsfbrADrfOgzv/ulouFSMtvrW/578lGVNenjyfsAxYOhVgxSsDGGVWxQyhZhhtQX32TmJZtzQtJrMs5hgSIcpFTSomY/XhkBKdZJy08c7VWU3Z6YDKMp0wuDZLasm2hNVci1LBSRO0z07s/w80p75AbfN4IUliyNqyRAAHWSwvmBAupkbvJDkqJbHl3YonTzEqpxStGr0zsW9JSNd23r/I3eo2DqnXr8vhVTr5XxvK5r2A/rWJXqu4lcGKKnEMaT4bB6D0ROuuatv2ynrtU1/L5jfhPsRWBU8dBKlnDAqhNsEhfVpMwGZh75mtsqmhG7y+8CLqKwIyh0QLBqpfcob2HPpwWTNo2eYPvAjzN2xPiEgiiOkqn+/hsMINSspypsEmC10D+IQVIrItwdIdeCkGJeX4QNZXsmXrWMakCckckm8s/h0GNmTJxg2Kg8jnIWHFpNn0kq0sPnVFXL4GpV3SIAu4Ov52Qt8NWW6oDQ0BNrCNGLCFdyy2twxKExEZ36+s5C9XLBChQ1VFt//uRgxoyhJSnk+ujGwdJiYv2JCzMxMvklqWJodiYQOhJlVZuVz7oxvy/FDC7Uj6Wp+WKvlvy7Zlix60nIEqX7sqfVYhR6zsgHZNXliBCOSzzVNnUDB1nv6FXwkRfitlNC+Ww58Ep0LL4RuHxH60pzzDjMeYYw+knGCmWMZmTV0voSE7JCfMebgg5uaaZMvTFAFHFV3Ixs82vP8JsAJ/f8VumNhq8+mpc8vQ1QdbArIyYDPc4cNPl6P8IH6NXvurR1hVsdP99TPkecI8Y5us0Hbpsoln/oj4P+sSPnLu3NL14EoRtvxzrbQ3ybH3i9/YH7/XpnFkrWR3HfBRte3zmulSO1uyTMiVWaPGSlMfoZFolvj4cqJJfSySyehl+IqGqixTkhdvRMpwoZDJJSncSCCbIHmZMrxAbM2V8graZjkX+bAkSpklvGCLC34KHOaKy2QxoR8ub5mUbASmFqmthZ0rkZWukIHRyKvzZ+tXbLm8nk2aJkkzUVt3NXuTrnX6/IvlNCP/Scia6ckq9B492MBdboI5B0UTxFUQOOhsvaKTBMtkBGZWKilRfXANQL7gHnMjLvuAVcVFFLhfiQMw4kVKepFdZQIPQzVFnWQzZ7KH1IBGdxdu71ZpIkSBbpwUjVI6Av2lVSqa2xXN8nT1Y5DCrRMc0h2R7oh0xxHSHXWzWA/pj515RKQZ9plmqNPSQ9AO9fU3oiHqim6Llqht/inSFJFSKKcU6hTFiGKIpEAkBSIpEEmBSApEUiCSApEUiKRAJAUiKRBJgUgK7AspUBri7UcS1EWLSBpE0iCSBpE0eFzSoLh2Nbnmw6Zyi/k13m/hr/6wBbXbFcgeRPbgHuxB+UyPbEJkE3bOJpSqXj/ZhfVNRbbh3mxDavMQT6bXkCYhKNVa6bi3RjgrISwnTEwsNXMoBMVKsw9DVDxFvRm0sE0FiQRGJDAigXH0BEb5bDceIqO5p0RC43AIjXKtPTyxUdWOFgmO8iq6IToquoOERyQ8ynFXucIg8RGJj0h8ROIjEh+R+IjERyQ+IvERiY9IfETiIxIfB0x8LHmiNgiQ8ugRiZBIhEQiJBIhkQi5BxFSsd2BhEgkRDYmRJZXAEiMRGLkgYmRJRUcAkFS12QkSrZHlEwgEyVjsiSIJgw46jJ/pIvgm00Q0MffkXj+dFqESckA9JgnKW1tZ/TIU1WO7u9sjXzqnxxYAjoRTIyLSFmrF8Rt3bfaVH1qVAN5lsizRJ7lGHmW6klyONdkD8LlInOz18xNtR0chLCpq74ZT1Ndcmv0TE3jT/y27Kpnwvuwd+VyqrXL+Hrsqhhm1Y/wPmxkgCIDFBmgyABFBigyQJEBigxQZIAiAxQZoMgA7TkDVBIg7kn8VIeayPdEvifyPZHviXxPM76nZm8EaZ5I89yH5imb5pHdiezO7tmdEs3rKamzrqXI5dyfywlreVhlOiEfXWcJwwsMTsmoN+Dm/UDiT08rn9zKY9YRMzYLPe8vVbPUzK44mqenB4MSpkpQSJVEqiRSJUdIlZTNTkNOQWnq+ZC42GfiokwrD8FYlNfbiKooK7ItjqK0uZgyEmmGiYbIFARTRCJBEAmCSBBEgiASBJEgiARBJAgiQRAJgkgQRILgoAiChdBuP2agLDpESiBSApESiJTA41ICC9PNI/dWzF8Kz9UfTqB0vwHJgEgG3IMMWJzSkQWILMDOWYAFlesn/U/dROT97c37g0DxBUaVx2awY5Qf5gYEr3fUIwFe/Tb1q6dE9qv0vr+EP0lTuyL9naZODE6oOoEhARAJgEgAHCEBUDVjDZkEuIsXRCJgn4mAKu08BBlQXXcjQqCq2LZIgcpmIzEQiYGJlqiUBMmBSA5EciCSA5EciORAJAciORDJgUgORHIgkgORHDgocmAlvNuPIKiKEpEkiCRBJAkiSRDzBhpxBJXbEcgTRJ7gHjzB6uyOXEHkCnbOFayoXT/5gvpmImdwb84g+A8HvEfmC6miVoa7BZ6YkNhJMgdF3/vPG0wb2jVr8JS0YWACVQsL+YLIF0S+4Ij5gsV5agxswXr/h1zBIXAFi5p5SKZgueZWeILFQttmCZaajBxB5AiWYcuiiiBDEBmCyBBEhiAyBJEhiAxBZAgiQxAZgsgQRIYgMgQHyRAUwV0zfmAxQkR2ILIDkR2I7EBkB+7EDixtPyA3ELmBDbiBybyOzEBkBh6MGSiUrt+8QFkjkRXYAitQ+MccJ1CMcQMOGGx83wCgHFEP+BOn95wULVA2AP3lBspb2xVB8GSVY4iirREb8gWRL4h8wRHyBTUT2JBJgzu6Q2QO9pk5qNHRQ9AHtdU34hBqSm6LSKhrPLIJkU2YKIpGT5BSiJRCpBQipRAphUgpREohUgqRUoiUQqQUIqUQKYWDohTKIrz9eIWaWBHJhUguRHIhkgt7ej+xblugP5RDXSuRd4i8wz14h9LJH8mHSD7snHwo07x+MhBrW4o0xL1piOCkqGcUg+skzJ6ZlG2U9RP4SAnRxN9eArRT8qLUmWzCIJXhJ+J+vSFLugoL5sR2brJ3z2owCAYb1eIPGdbBn9cEqgUkhT+d/6hEbMj6TM0+opHt+2S1SZd0pdjWeaG9hEp5N6/kvS++AyPpOF7g0UCrOhbQvGoP/q36kVHN1ddyS2cZeyb3tf0++7s0RFfSZtul0aA6VfxA8VZ+NT/LN7A6btH8iSw2PmkybnSFU7e3CAsbWBWlf2QEnPQr+LEgfrYnKuHHKGzhVvSiOox6G7pV9l4lAjMYT/5m7EZfI/kLMIYz+CH/OifCWUXEteAgk/PafQkGLmTows4Slvd7TOLN6K0wE5nKWOCmV3sT8wqiYgjplWy/ST5WYo801G+/8DXMzSYArXmrX5Sc37PeT+6hyBQw4MhItFmv+QGBF755nJIhdSv7848+gS1MmKSfLEAcYJs0D7FsYU9oE4mtTtpZht5oSqTfes/QFIjJADyjJfzh3JR0IjSdL4TFyH9Pa74Vg5nKi0nDLkyztiNXDrU6JyLSmYBWTXNatoMOv4ReTA6mxMw4ocbwSjqi7wPfC8gn9gRsXkJ4+Nn0wRsSbfz4i5F/5Qz0ajcy2i7sP0hpq9kjzi8B7JzPah76+fbtndqWDbt1ZGPnajJma39l3TOqJuviSky1VxxPWj17MUOK+DiE91ICf+IvgKbCd5RpSbQDEoAbanJoLOXUKU9IopX/jbAYmwFBvBJO25LPfayFU1aF0T5mMzfHqnO+ub5H1xx0leKQ5ZLM46g/ri83KPK9T5BFyIxsJuQirwAY0JzOy3hI5WbZrv/ibhUrkk3g5YZtttvLrOb1ygvimeilnX0k27KaNDlrxVSgxcNV6cxwF7pB5DJQYZ9zCtKHlUz5nY/fsd/HOW9XagJH4ls/Q3dicm1RSIo1BJzx0tOE/9tKVgiSRUB+o1hZzMKbx1DW1IICa0pspExlRcFjenhMb5wuQObxe3hAbYxeZ7TnyvK6dIiDZMX6Gp0cyxelPNmy20mxQuuGfjSseDYq+xetSF+gip4kGs/mHtpqZlK6B/NnafjD+x9iq7KPT+gM2/4ik55zy2u50cG2xH3P4IeaDpiyB5M/TLn3HRz10qMFGcu2FNIrYo3SkmJaN9bTOlGrHshF1o6T44TvgvMPalOcMdMS1WwQJN6S+HrxT8J2uk8PA8j3/rhQQLElHSECpyns7pfobjKoDdfpbvjgxaEbbhOSi7I8JUtVotH2z/QHWQiCjEEzQjg7SIdkCYX+hca2VGALZVNoE/xdIoY9NV2hxYhaIGoxbtRCYtHDAS/QM7buGUcLqUgEdAhkRVptI4BFUmJLOIusrQi3yBufuh4jzKXiYIzekvoDhG36BdtIjMYYvUmVaJb+pcZxKjo0q3yiflmqSjPpp8ODh/SBJ6JEXaFEdN3hZH5wVgidGuAIuXX0aeNHioE4LpSkbFRHqNLJawOGUb0Ko5rrf71uI+yEsNO4YSf91IYIFLrOUYNRevU/BC5V14JGEJW+8JbQqpoeIHCFwBUCVxrgSm8/iGEdFsMyDnMRzuoKzoozEThlaEshnka4xvZu9RpS8ISbeSzW16eIcUmG4dgIl7RJneFbJ60HfRVinYAQokGIZuwQjdoz9/UCrj2tf8Q4g1qGh0EZdPU3xBjURbeGMGhaf9L4Akbw/Yjg1fppeDVWnwNio3UxhsPdhcNbuHhhnoggGWQWDUtk01oMVFrQnHpMXCquT7FxpWkHiZFPVj/6LlRTgWHsjLHzKcXOcg8+rBja2CucSCwtl+nhY2pVO1qMreVVdBJjK3qDsTbG2r2KteV6OrKYu3adjbH3wWLvZMWiDMJLwmoSbFFZ/bgKHm82QUAff0fi+dMJxuCSUThy6C1tUVcR90krQfe84cinzohdpyAYS5GyVi+IdyLZNlOTGhXA0B1D95GH7mrHP5xjCX1xL+MFA9RachAMQFd9s9BfXXJbEb+m7Ujalze+as/Ipu8ZPqDWamMqfVXKs+pHA6S2G8USCCZ0BibAeMHt6k7IJeAsQQQAIUgk017QyO8dOnnogA9Dr7CDpEmHAQ9OTQ/6KsQ6AWFsj7H9ScX2Bc/c++343az/VCLvggyPEHqX6m8z9i4U3U3wXWw9brNjGN2vMLqgn8PfXjdbF2MkfLhImN/kWQ2FuWyaXI9I4k9PK5+wW05P8PrLfPePfA1msSldXYd5mvLum9BUAsHYFmPbkV8/KfG4fY9pDa18vNc8SmR2kOsepfU2u/ZRUmRb1z/KWouxKsaqR45VZXo5+Bi1Zh2LsWlnVy6S2HmBkXciGHpQs7woGoQm71zP/0Qnybe/zgkb9tMLRytDcNyQVNKcjsLSE5Z9H4WnEwyGqBiijjtEVXnhvoepO1j8aENVlewOEa6q624UsqqKbSlsVbYaQ1cMXY8cuqp0c/Dhq8F6F0PYrkLYJR18B5Z0dCkhhp+qXEUkLYQz1w+rMCaL0w1kxQD0I4xNG9NxEHtyUu+f4NRCwfAVw9fTCF+LvncowWutrY8+dC3K7ZCBa7nmVsLWYqEtB62lFmPIiiFrT0LWomaOJmBVrm0xXO0+XHX54OeCVSGOBkFLsmTpIlo5bMyZ1HbcYDNrRUdR5vAF1qOhlwwrBogYIA7DYBSOr++RXr2Zgj2SMKSDIOzCiTbrtc/CvUvFIp/GD1TFLz8XVpK5kCueWEu60otBAT/rJMpO1CQi2g0c+PJF0bjcOmt5fpEMwAXX6RfxT9p+qtobKsAHavc0qF1sfDrZL+nSkT518Vs5jJzYjgN27Di/X1jfPNe652u4z9TLfbGTAi7ZPyfpqF/Ok67xL+7PpS1WhwDmfZm7AQutaHdARZK+6HtyfrbXKni/9ehnZQ/NbX66QxnmrgD++yL/WGUZM7XJyBbEJ4OrlNzjIQCVSpUN4Y5yeYhzaKNYzS3QxSg3WrsvwWXOOSpfNHIn+nm87h2DByeGuAECOEYATq+URth6ydSNk7IxRehQxYaLn6Rrklka5DUIv9+4wSMJV5tIJZCxb+2XBuC4aEulMR2BLicr9e5zAFODdhdu7DbI/Mt9OWt+41KEAjUrBmCQhkUIOTcs5YG4IQmdePWVBI2HBmTdsJDNxls0Hdt489CwiNxWgbKkKA6NGuPGxNH0qb6YlvyZ2lchoImA5rgZL/IlyXDS4OMUiFMgToG7ToGjBSzl7uwQuKWq5kZEMHmhLRHBFC3GCxrkjU9mmuxaBs3Did6bPcvN1OhhmBuMHkxukTN5Nu/nDZsMI2j0KPhss55Rz2z0YM7/GhbMvSzep9Evup/c/xijtok9zpI/ppo9V1b0LFQBbuUF3Cz5Q/0oGOIMfqgfESY4m9ftdubtb5b/h66lIIAZ/6V+DKxvBj80HaF2N4Mf6kdyFjfTcgXLC5tZ8sfwrjSphS2RtdnVrsMiGXqHQSARdRklaTSAo2/jVUhuyHwTRnSh+hPHWk5vK0I6DMfdkFA0qaNtiRPXg0MgM2xIlVVBpubI5jXZj1wHnPXDX+2yUHaJgJvqUJ1+ICCMgPC4AWHdxDAkWLj/zme0IJxOhQ4BxenrbwTI6YpuCZbTth7BORU4x6dIhHh6BfHodHkHoIe9NhO/hwclGIYaCCh0BShEIAA6cEICCc+f6qlUNA2iyhu6lERwQTYKx8UW5C3qCFo4bSXoqQhrxIOBPQb24w7sNU6578dedzP90cbVGgkeIqzWVt8oqtaU3FJQrWs7ngjEOPnIcbJGPQef/shsNYzBb1fBb0jHXxr7ygTTIOqh65UoDjfz+DpY4CY7m3Vqh+S4QbFB8zqKkFFXDrgXtiDr+KkB570zndlFHzA+x/h83PG56WQxnE34vjie0QICpipzCHTAvC2NoALTalrCDYx7hRvz8sYzH4Db8v2CG0y12niLnkl5xn4Ob3t+j2AE0Yqu0Ip5IgzHDRaOeuO+VmjZGMx9qlOWc0sXwe+TYYv97aWT/xd14MUzCDQqSfNASk9oGy2BXp40J6fFxwu6sI69Z5L+ka3w0q/gx4L4sWuSJJSq902q3azft6InVyoTMXhXbgUwEhWLctz12oeAgfZTefhH/mbsRl8j+QswljP4If86f0iJl21qJHXYBeiCl9ccJn6LxpRupD+6LWRFNcN6Wr3IYpZcG+2/s0Rb+mc+vr1xPn24+c93P374pJN6XreLUi+E4Xt2nfbnK8lOv8MBM/uXX96/6Ws3K90401uzuWjPNA4gP0QK209HTl5gfjTrA7XSIFeL3G8k9S7ivXJYmc0WzFtxXjJvuZooXQTcdu5xuU9i0puxn3JXQQUzo/+Xf0nHfEb/X5f3dVLUrjUJnSRb3q7+YSIdb+bDCkrLCpTUC1mXma/tquIz6QhXRwiGrt6u39+9vbm+e//h56luQF3/xd1GrEd7N7O+Pdc/frr+r1tlQ8TS4Re66PFfP8EZxOiWjnS09Eh0WRzfH0hAQm+eBKriHbpABcTvjq5mv5SXGIXFnZAZFU7xmXIiFwP4qlSAaEJZH5Kmff78ZVr66hrWy+w7dWeK2KvDsVn4qXmnusKiC9zAo+vjBiss+SDWZ8TZKz11V4NZrcloQEt6e3UmX2NVhoiaf+UzxbtJGolZMoCq50S74EHxp+JJ6BN9Cn6ptgPm3NRkxl8J66riTNxwZG9gxJykNM0qtDIauiWr9jh/cTTkzzDcLBuM2gAuG5godT6GBkPbumCwplpjNepl0TH1q1pWnQ4yycGWQkhDZgUgluY6mQnxFcfrcqK6oCDtyGVSRP19AcmTugTG71w/ImcNVewwqpWMbXOlyk9r5UmpuGK7ki/7jOaxLry9Uev2mySU7rNYJ9Xc4geNnG5ljICtsYNxN5vSdPGAdM2TOwfnxuTLVXv3TWg1/7N5B7/UetOSw0o9z1V9nnMpZMEkJpqjxiB3GeXLOnyDK89sJwdjlIwmGY2ZwQRWUIXaUd+NH8LKPsAtXbtTetjvI1+TtouhivbyifBL60Se/gmq+21tYGk0TPxYm7V04c1jKGsK89SXXfbJu9WOTOZIyEFCztGsWeaNh8OLOSEH0uH9Y22vCXdhoeT1riWmSb5IZJMoGs/8sUnOz2qyVmSe9IF5ktdyY3YJSH0GP6ZNk4G2Fwoq2SSKFbGxXzNijhixRw4bjEq5KSYBae2I7BOUFualcTFkWLaqxKIahG534fZuldJoxFTZy5hb2tIBxeCK9ncVk/dfsOOQinqsMTbG2PjosbHOa/b+nvMuDXmkMalO3i3FqLoqMI0CRpfHji51+mmYR6Hz+NBwdYbx4kHjRe0cMq74MQ63TswmJnHQIqN4SUehtUikdHB2AKFmqcWDDTkr/ThM6NlngY9LSvVjjyEphqQ9C0nl3nXEoam5gZ9EiCqXfyehqrwqDFkxZO1XyCrX036GrrWrOwxhjxjCKuaakYeySZImZUxbGpYmoQ7V1R9XwePNJgjo4+9IPH/qZ0graeiQIllp8zsLYPsu1e7ZiZFPHQBLOEHjHjh2FbWVwuugcldKEyNhjISPHwmrnfJweMzD9BRjja3VGtVWSK2uAQnLisZXTQQZyT0LwNVabUxQrkp5Vv3oaIxkszUtRuuHjdY1k9bIgnRQE5921Ql5X50ldBZCc8kYNDmLSuJPTyufsAPJ/Tw8nG/hkA4RF9vd2WHi3gpw2FKoji3GwBgDH//wrsQbjmr319Rgx3pIViLftg7LSorG3VwMJo9+vFWil33Zva1ZXWH8d9gDqrK5YWQHVUnsvEAfnQg6CVaS73SDQOGd6/mf6HLu7a9zwlSsl9FepZUDivgkbe8q6uu3MIcvDfkYYwSIEeDRI0CVhxxVFLiL8Y40ElTJuaVoUFU8RoQYER47IlTpZl+iQoPVF0aGB40MlfPFuKLDJe2mAysyhyQdpVZT6XwLgcX1wyqMyaLXMaJo4wAjxLTlXceHfRTj0CUhG1+MDDEy7E1kWPSLo4wL68125FFhUcYtx4TFwjEixIiwLxFhUTP7Fg8qV1sYDR4lGizNEmONBV3ezVwkKDreIIC4oWuf+iu9exAMyho6oIhQ3vyuwsLeS3UUMlGONEaJGCUePUrUOMxRhYo7WvFI40WNtFsKGjU1YOSIkeOxI0eNevYlfDRblWEMedAYUjd9jCuQhLtYqbqIrjrJenEmXcNm/QT95xc5s4t2reyK4JIxGKjMZc2dxTP5Xb5VHZJoy6TY5Gj+RBYbv2Rg1fJLqRtenkhQt7BZ0MUlO7yc/JGtp9Kv4MeC+LFbXe7oljq3otW7jGzyziW/8tZdr31Y/9ImUwObJhfLu9HXaMq6N4Mf1Quvs6ob301dbMIO60S+FLvOXn+/kCyVWF/Ud7ZrlmF3oRtELjNPsRKTL4UVyzbpw0laLbuUPutLunS6g/bexpuHL2bXeHevghLD2kFKubfs99nfmoU9fKy6QbyoLLSM4geKt5gO0IfZb9Xd5HQg6SMkiDYhcZ7ciA3Jv2hbLnN2IH8318fi3eTlCUDIOJ17hHb28drgqvYP6orn5MWH2Pn2F9dfP7l/sdlgO+uHv9pgZO8Xw7nDuYkwTvUW1pY0oCxdM7iulyLHu377omUmuFI+gLF2W6d8mUgAyl/+l+U9r0Pqwp5phHFl0RXc/CuHPQPi0UggtNaryOMjYbnh4waes17cyHLnczqpBTEV3VZS8iONBGg8az3efHxtCY1kRmLv2vGAfpiodHUQ8t/MpLf9tlBfDswwqA/vPm4FaMObivsEtg36FmLHSYJ542mJBUBvaCR0R/+AnXL4/b+pHMAoLw2ftYPVy+XE+mMe0YOQoWTAiqHNvzJVB2dViIlpZqkA2aAk47jTXM195Q/hev6TeF3pppwCPue0EyBKwT9J1Q/EDUnoxKuvJNDUzRYJov0yP+vI/aDc7s2m8Jy11q2F5PZabJad93H69pXFXtysSAsyqTQ/vKYVF0VSqjz/5ZlkQXG9WCSQHGxue8FyFT6zGB/wTrFvzJpvn9X0WW5wl1VZPBEXNrntu+vb/3RuX//97Ztffnw7VZhr5mJsL1rx1l1O+Lhl33HbvLiYSKBh6iguC02lLj/erGHXQOrUYE1JrYD1qbxzwNabtfuQ1Tbobliv3SvIWeSsZPzyF1KXnu+2/NG8fszKumS0GypA0Ny44T3l1i2Jrxf/JLST30hfIaN8G08IOeqzaLoP7d2k6w3jezd88OLQDbfJfpWyPEilGdm87fYj1z0mX4n+2T/TH2Qh9roMmhGSb7AEcJdQ6F9E1lplU2gT/KPgWQWdGwGsJRHdcNAtNAEE2/oPtklU4xCYm7TaRtCbpMSWEDhZW8cBxKUuygiNqzgio7ekfgMBvcMBehL1Ncb1UgWZpX+pEb6Kfswqn6hflqrJTPopAocIHCJwiMAhAoctAod6uALxw37hhzSocrLF26wQ+De54TELhYaALCqae0Ig40AEhmDLOPFGlfqNAHrU+xZEIdEwEIVsD4XUW9shAMm6FjS7f1RbeFtXkOp7gIglIpYDQSz1mozgJYKXCF4ieIngJYKXArw0hkEQx+zZ/ceZ4JwypqkQaiO0bHu3otEV9Z+beSzCrP6Cm5LGnhS0OQBh9XSk60ZxFPic2jz6mt8MYaajw0xqpTkMyKSrvyHEpC66NYBJ0/oBwUsI4HQP4Kg1Zd9sbIiHIB6CeAjiIYiHmOAhRrEToiF9Q0O2tPMgWS64RMYMDJFItLXoupS6bhiQSKnRJwuN9Fx4A4NIyqM5OqhEbjYImSBkYgBZyJXn8NCJqh0tQijyKjqBUhS9QUgFIRUFpCLXGIRWEFpBaAWhFYRWDgWt1MZeCLH0HGJJ0vcrsZaSiJuE7VQFflwFjzebIKCPvyPx/Km3UIukraeEsAxAVN2fHYp8ath8+cbJy5GyVi+Ij3MCTSaoMWA2avsbztmzvugPwkHtwUFqvTwICqSrvhn4oy65LcxH0/ZxHM6q2juemjogQqTWL+MjU1UJzqof4REmxJUQV0JcCXGlNnElo4gT4aSewUkgBp+KzQm53JwlCA5AJIk82wMkPoUenfEHAh7xxp4uetRPYfWflyMdxfFhOwXzQB4OAi8myEdBaY6AvJTqbxN6KRTdDfZSbD3ybBBFUaEoBU1Bfg3iIIiDIA6COMjBcBBV7IRASN+BkBcmuSoSwiXaILr+gcSfnlY+uY3pXNRXCKTQyBOCPnotnN5DHsXRGwHUITMDhDgQ4pBCDDJlOQS0Ia+3EaQhK7IlKEPaWoQwEMJIIQyZhiB0gdAFQhcIXSB00R10URP7IGTRL8jikcTUv1N5OREIDObPvAAbBMHvXM+Hyeztr3PCrLSvKEWloSeEVPReSL1HK6ojOALEQmUSiFogaiFFD1QKcwjkQl13I/RCVWxLCIay1YhiIIqRohgqLUEkA5EMRDIQyUAkozskwyA2QjSjX2jGkorMeaEyc0giNKoRFUG2EDBfP6zCmCz6jmmIZp4gotFTAQ0Gz0jGb0RoRtEYEMtALEOLJxTV5ZBIRrnmVnCMYqEtoxilFiOGgRhGBcMo6ggiGIhgIIKBCAYiGN0jGMpYCPGLvuIXLhdZDr0QQmwQGn+iTV76dBrrKWiRtO+E0Iq+iqT3MEU6cCPAJ0p6j8AEAhNSeKCkJ4dAJCpVNoIiSqW1hEGU24jgA4IPKfhQUg5EHRB1QNQBUQdEHbpDHdQxDcIN/YIbXoSkqPQToTWIZd+4wSMJV5tINbf2A2UoNfOEwIaeC6j7qzgS99DgAg7uA1jzG5cSrWkHSMNiIuIvGxYhpNewlLwzbTw0IOuGhWw23qLp2Mabh4ZF5OYv/QrSoDF04e5o+lRfTDdQXNmtjACRk88Rw7lzCB0dOjp0dIhXHxevlnvRQ8DWqpobodfyQlsCsRUtHseVWHl8iV+EpXk40VKzZ/nUYvQwTCBGDyaXoJo8W0axDJoMA2j0KDh2s55R9230YM5JGxbMXTHeYHa4HQu5JzC+vCxFw5I/pspHReWzUAWBlFdws+QP9aNgZDP4oX5EmNdsrlq0S9G6/D90LQXBzfgv9WNgWTP4oekItakZ/FA/kkcqc3/ryuTmNEv+wEvkcP8J959w/wn3n1rcf6qFuXEbql/bUItEYM6SSYwqQ0mGDTY9buNVSG7IfBNGNBb+iUSR+9jbhOnSxp7QDtUghHUI+JZ1XFkV3DMQ2bwm+5HrDhNLeeiOsh8gF+IIdgV01jmkvYHeKxdisK1hsDqdPQQSq6+/ER6rK7olVFbb+rFgs6xTiPAdDuHTadUOOB97bSZ+I5KESBIiSYgkIZLUIpJkGI4intQvPCkCsVF5CLk5yRJnJg9NG+AVN9QohoItydp6QtDSEETV+1PX0kEcAbKjsQ08jY3IihTZ0OjMIYAVbfWNcBVNyS3BKrq24+ltREpSpESjKHiSG/EPxD8Q/0D8ozv8wyxmQvijX/BHSKUmRT9k4mwQUdM1P/WYm3l8HSwGxbKpbfgJwSKDE2L3BIkFWcdPDU7DdQO91AtqBDiMqWUOh21zRGVCrKc1rMdULw8B/Ji3pREKZFpNS5CQca/GwbphbgE5N4dDkkz1y5h/wyQ4Yz+Re4PYE2JPiD0h9tQi9rRHYIpAVL+AqHkiQscNFo6alVMr6mwMqP1Z959Cj8/ooDz31twNmNmDx7LcYCtaGtGmWvfOrVD5e9rNXDHrkHyDyMO1Xlhp1pJO/NZiBTbtWvfvVis7JMvLyT0tcWHF4Ra+KJSQ2JJt/X31QgsLp9YLHWeXFkoHlLZl9ZKVTj9Jns8VARMivETVJBss0YJPxP16Q5YkpLpJGw/Ny715D0fskxZSOcMcTp0EFCZUyIW+04eU/V99o8rPIigrcpck3vIwjTU8Yi0oDrO089blEpaAMTRnkkl/7tOpxirUf5lKgi7hi8f/CLgmL/CozV5K0z5VTcddr31vztyuLlOQaiK8zl5/v/hSLZ55rXKpr+nQuA8++bxbnCzHKpLnk7ybuofp5ySk3bHfij+SCDwNnwACiG7jzcMXI1AC9K5uzNIFXvJH1rTq2k8NiZikhdpp3aUAT+VzPrMSPgfRV9lvxTPMFGcWCaIN9VJPbsQ69y9a6iV8NWPrZcW7+awqs3yPy75bSIt5KtAkoWcN4FtWYhcQbcH49SrcBiTPfp8Q7D50uXUPnAbuM2mYSK42C+LCm8dQFl0q0QKPAutzRTgUdH9c7ZAZ+3CQ/DEp5CvrQ+BvrXu+Or2P2CL3Ps5ETj+KnlYbGj3c3ydrPbrUnFqupKz7JI/4ffpStHZfAvqC3e2uREGfp9au+xens4GRN7lDbFIU62u0EZEvqqXNhkLrxrGhAN7JKKVfNRcjbj50vfmQ1zfjDQaQ6Ax+TJvm+puc1dpLzn+YuluF4Qj44ZIDgcmJZxJ+8+YiTr2szQyYb09NMr2QLPOP2076sWIsbMXS2xhAZHWLKXFW2h2RVzmxBZqHO0K4I4Q7QrgjNPIdoQSBbmsrSOOxB7zdM6itHJYHKlnQNEnwRuLrxT8J7eQ3MgLYMt+dU0rTNw4pdo8ZuckoNQSO3PDBi0M33Dp7Z2+TqKr9M/1BFmbp3Lhj/warBXcJhf7FiQgVg3rzjTbBP04Cwrx6nha0KpHycBBWtBYEfBHwbSnvY1WBD5LuUVZtsyyP1RLbSu4oaes4wODUkRohwhV3aXiPjcS7Iah8wCySVfU1xpZTBZmlf6nBzop+zCqf6C5kkajJTPopgtf14LU+8kIMGzFsxLARw0YMu3cYdr3jRij7MFA2Da+dbIE8K6BFDTDRXLw5MpBb0bMTwrvHJ1sE88YJfas09bRQcL3HQkAcbQgB8VMDxPU+4RDYeF0LGsHk+sJbQsxreoDgOYLnAwHP9ZqMOPrYcXTjiA4hdYTUEVJHSB0h9d5B6jv5cETXD4Ou5yJop4y0KwTWCJjd3q3S9EFiTTIKyF3Sr5MC3Mcl195f7CUf8FNDjdVGN65bwBD8PDnwU63ah4E+dfU3BD7VRbcGe2paj/eVIayYgxXVmrLvhWUnjdIZLQMRo0OMDjE6xOgQo+shRmfswRGhOxRCt6Udc7Lk3EJ+DKCTSKs1GKeUvXh0MF2pfycL141HzgOD7coDf8rwndwYEcZDGG80MJ5cxQ8P56na0SKsJ6+iE3hP0RuE+RDmU8B8co1BuK8h3Fe7jETYD2E/hP0Q9kPYr+ewn5EnR/jvSPBfcruYEgcsia8JTkTF++MqeLzZBAF9/B2J509jgAEl3Tol9G9cUu3+WG/kU3fBV3r8xE6krNUL4uOcI5fJ9MTwRLVVD+cEeV9UDaHKU4Mq1dZzEIRSV30zYFJdclt4pKbt4zhiXfVKePb5gOilWr+MDz5XJTirfoQHkQ0wT6PFM0KdCHUi1IlQJ0Kd/YM6jR04IpwHQjhhiH0qEifkMnGWIBTANSWyag/44uuR8eGZvPbTBTQHL9f+0xilA37ScGPB6JC2iFjgeLDAgmofAQws1d8mGlgouhs4sNh6pCUisKcC9gqagnTEptCcahmI2Bxic4jNITaH2FzfsTmdB0dw7ljgHA8Dq+gcl1YDGOcHEn96WvnkFib6EcByhf6cEBw3Fjn2HoYrDvRpwW8y40LYDWG3AcNuMpU+BNwmr7cRzCYrsiV4TdpahNUQVkthNZmGIJy2M5xWs4xDGA1hNITREEZDGK13MJqB50b47DDw2SOJqdOmsuDzLSxS8sJpgLK8cz0fZqi3v84JM70RIGaVPp0QajYmefYeOasO9mmhZypDQwQNEbQBI2gqtT4EiqauuxGSpiq2JTRN2WpE1BBRSxE1lZYgqrYzqmawzENkDZE1RNYQWUNkrXfImqH3RnTtMOjakorDeaHycEgiEKq6FSG1gMpcP6zCmCxGhLGJHp0gwjZ8WQ4GX0uG+jTRtaKJIbaG2NoIsLWiUh8SWSvX3AquViy0ZVSt1GLE1BBTq2BqRR1BRG1vRE25rEM8DfE0xNMQT0M8rbd4mtZ3I5p2aDTN5eLIYWlCQA3Ql08iwhsBhJZ05YSwsxFIr/egWTrGp4WWlawJYTKEyQYMk5W0+RD4WKXKRsBYqbSWELFyGxEKQygshcJKyoEY2M4YmHp5huAXgl8IfiH4heBX78AvvdNG1OswqFcSUlE1TQTSACd54waPJFxtItXaZXBgV6lHJ4R5jUeW3d9bmTiUBrdVchfLmt+4lGhNO0AaFhMRf9mwCCG9hqXk3W/joQFZNyxks/EWTcc23jw0LCI34+kXmwaNgfBK06f6YrpBhMse6LSAYfnMM5y7fNEnok9En4jbJrhtUr9tIvf1h9g9UdXcaBNFXmhLeymKFo/jquk8tsYvmNY8nGip2bN8AjR6GKY5oweFXhs9W0bwDJoMA2j0KEw/Zj2jk4zRg7mpxLBgPmHgzeCH2ziTewLjS8FTQDD5Q70zJCqfhSr4p7zOnCV/aHabqJHN4Me0dvNsrgotpIBl/h+6loLgZvyX+jGwrBn80O3abR5m8EP9SB6szf1dtxNIq07+wMvZ67dBaxE73A3F3VDcDcXdUNwN7d1uqJHvxk3Rw2yKLhJhOEsmDaq1Jfk02Fe7jVchuSHzTRh538hPJIrcxzHc9yTt1wntl45NrofYIWBjpKwKLl+LbF6T/cjVjEmwPMpH2Z2Sy/u09qh0Nj+knare6yHuCJzYjoDOsg6xL6Cvv9HugK7olvYItK0fy04B6xTizYfDm3VatQPqzF6bid+Ia9bjmoYra0Q3Ed1EdBPRTUQ3e4du7uDBEeM8DMYZgUjoWAuZOMl6ciYHNhoAYzdU00eId8q6dUJw58ik2vv0KNLxPi20UWNxmDYF0b4Bo30azT4E2KetvhHWpym5JahP13ZMs4LoXYreaRQFU67sjMmZLf8QkkNIDiE5hOQQkusdJGfuwBGROwwiF1KJSAE5magaIDd05UHd4GYeXweLsZIRa/t4QkjdmOXdPTlsQdbxU4Nz6d2ggfUyPS1o0NTeh0NKPKLeIfx4YvCjqfUcAos0b0sjYNK0mpZQSuNejYOcyJwXUhMPB26a6pcxTZFJcMZ+IkWxHg7dY42N2Chio4iNIjaK2GjvsNE9vTkCpYcBSueJeBwamDpqImOtGLMxAEyFR6VFkmQlPU8pUof5pM6Zp/NU8kcGQlSnsCpGwAL59CIZ4n69IUsSUq0htnMLTb4qDRxMux7EklnkTSNz37fOH6hOnGfhtwUOlkamISmVEG1pnEplP7eizaMbWtSCrfs1VaekQBbsbwKfDqP1Qi4qBbwkTQBdCFe+5a9W6ymVMR0wb/5kgeRBwFuoPKuu3Ixi5bBMZF6ughwkachmunWmWGHaj4T6orOSP88lMlO77+JSZW6AKyQp1c1Wt9pUUXZpCHKttvlwOzDIlxNlKczdpkVlolQsabmWgILP2EpNEosZDwj9mITUJOz3gRd7ru/9ixgNCWtt6idjf3spadeZ5EWdvVxK07rajrte+96cDS8knBKfsklkaqX1nSm86NynSxsrschiOgkCE59Hu+448sqr/rnYmJ0XpdfZ6+8XX6rFs16VS31N3YH74JPPn3eCyvSgb8kEpA+n6vFW/JGAcCmAwmK823jz8MUIPD2AW5bM6e2s6hVbR3KXJNNcWkbxA8VbTAfow+y34hkYSPoICaINnWSf3IgNyb9oW3Segb+bT6E4y49TeekhZMymI9A/oZ0NtrxYiZ1sazXQ5t13Mdnv4+xUFpoA1tf6tuTAZdT9DlDgPpOGaaxrc7AvvHkMZdHZjhZosqW0j2KUhX6wvcljaoLMiIez/ThY5Wt3B7GoQNNd1i6T09k/zKv4IfYIi/U12wjMl9XSZl+heePY0AN3YJQHu5rAHDf/ut78y+ub8QYfSHQGP6ZNE2RPcJMJN5lwkwk3mca9yeQ4YlOd9am1vSZFGDzw/SQJFJuu2WtHSd4gMfqznBzGta3FMksms3qTRLQkvl78k9BOfiPDx8DyvTkuFJZvSSeI2DgE1z024SaD1BCgcMMHLw7dcOvsnQFWop32z/QHWZilhOV+8husVtwlFPoXJyJUYOodH9oEfxeoZA+tVWjkSaF2EsEOB7xDA2nVQBBSPEL+46reHCTtsazahumOq0W2leVY0thxwI2pAzPCHCtuyvB6QYlXQdjygOmUq+prjF6mCjJL/1LjmBX9mFU+0d2TJ1GTmfRThEcRHkV4FOFRhEdbzBysxUTGh5KWoxEESxXpiwm1iXSVOCsgFQ0guBy7dVwwqqJjx0VUFY3qBFwdnWQRRuoVjNRMl+v19KTQV723QiAWLQgx2cNjsnqrPAQ8W9eCZkitvvSWQNuaLiB+i/jtQPBbvSYjlItQLkK5COUilItQLodyjRGY8aG6mtAGAV45wJtLN+qUwV7FcDZCB7d3qzRfjIjtxoD6Srp1bMxX0qSOEN9RybSPAqkb7BMDLdXG1tf76fZQAkTejoG8qVXrMLibrv6mqJu67NYwN03z8ZI4xLRymJZaUwxviUOICCEihIgQIkKIaB+IyChkGyNApFh/Izykgoe2dLydLBVwlgNWOpat4QilKGRsGFGpuD5hRaWmHQAzGo2s+ywg08E/YSxJbpTDwpSMlAOxpWNjS3JVOzzGpGpHm1iTvI5OMCdFdxB7QuxJgT3JNQYxKMSgEINCDAoxqANhULUh4NixKMm6HTEpQ0wqCS+U4FRpcJsAF1T7flwFjzebIKCPvyPx/GkE2JSkV0eGpCQt6gaJGpVAuz9qF/nUUfCVKKfwR00vT29B5DXiPC1IS23LwznQ2QctQ5DsCCCZWnkPgo3pqm8IiamLbgsJ0zR+HMcdq14BzyEeEDdT65fxIcSqBGfVj/BQIKJtiLYh2oZoW4tom1GYO0KQTbHcR2xNga2B4H06YE7IR8xZwpABoiYZyfZwl08h3Lk9OiSNd6tXUBpv0iGwtKHLtI8CqRvsU4a6CsbWe9aWuRIgEHV0IKqgWkdAokr1twpFFcruBosqNh/ZWIgqqVClgqYgCwtxIcSFEBdCXOhQuJAqZBs9MJStvxEZMkWGXtiYVaEhPpYNcIQfSPzpaeWT25hOf8PHhArdOS4WVGhKJxjQSGTXJwGoBveksB6ZEfUd4zEQNmI7h8d2ZKp0CExHXm8zLEdWZksYjrS5iN0gdpNiNzINQcwGMRvEbBCzQcymM8ymJsQaH1ZTWUcjRiPHaB5JTKcSOlJOBEMFM3V+6BqE9e9cz4d58+2vc8IcwvBhmUqXjgvNVJrTCTwzIjn2TRC6QT4pqEZlWH2HawwFj5DN4SEblUodArZR190MulGV2xJ8o2w2QjgI4aQQjkpLEMZBGAdhHIRxEMbpDMYxCMXGB+VI19gI58jhnCUdLOeFjhaNAcRwUQWsDGELcMD1wyqMyWI8oI7oUD8gHdGYTgGdwUuwX0JQD/BJQjlFcxoKkKMVOcI4x4Nxiup0SBCnXHM7EE6x1JYBnFKTEb5B+KYC3xR1BMEbBG8QvEHwBsGbzsEbZdg1Xugmt6pG4KYOuHH5YOVgGzF8DUL+JNgYPlqT1HZcmCZpRSf4zPCF1ZNhlwzpSUExJVvpOwajly6CL4cHX0oKdAjUpVJlM7ilVFxLOEu5kQiwIMCSAiwl5UBkBZEVRFYQWUFkpTNkRR0wjQ9SyS+SEUuRYykvYoyojiXD1SAcf+MGjyRcbSLVBD40CKXUoeMiKaXGdAKojEaC3d+ilPizBncncafFmt+4lGhNO0AaFhMRf9mwCCHnhqXkvX/joQFZNyxks/EWTcc23jw0LCI34eqXvAaNoZGGo+lTfTEt+Ca13zkp8FE+ywznPjn0hOgJ0RPu4gkRoT88Qi/3socA6lU1N8Pr5aW2BNsrmjyOmw7zkBq/31DzcKKmZs/yucfoYZhhjB5M7t02ebYM3Bk0GQbQ6FHw/GY9o/7d6MGcFzcsmPtqvJjycHs0ck9gfCdlCgAmf0yVj4rKZ6EKZSkv8WbJH+pHwchm8EP9iDCv2Vy1qpcClPl/6FoKgpvxX+rHwLJm8EPTEWpTM/ihfiQPzub+1pXJzWmW/IF3g+KOG+644Y4b7ri1t+NWi6iPb+NNEgLj/pt8/22RDJWzZGNFNa80eg02c27jVUhuyHwTRjTw/olEkfs4ghsfpN067tactEmdbNCNTKaHAKfZECmrgptXIpvXZD9yeTrrh7/a5UHeBQRsog91sj6prRGdrQ9pg6TfOohw9OHhaJ1mHwKU1tffDJrWld0SQK1t/lhgatYpBDsPB3bqtGoHyJO9NhO/EVRDUA1BNQTVEFRrD1QzjILHB60pF/UIsMkBtggGjKqAGDEnWVTN5NF1A2Tmhtrh+MA2Wa+Oi7XJWtQJ1DYugfZQHDVDfVJAl8bO+p6MwFwDEGc6PM6kUaxDwEza6puhTJqiWwKZdI3HRAaIG6W4kUZRMKkBokGIBiEahGhQZ2iQWaA2PjBItfBGLEiOBYV0vKRQkGwgGwAHNMqgPnozj6+DxUg5WLVdPC5GVNu8TgCjEcu9e47MgqzjpwanQjuR/y6yPSm4ytT+h8PR6oP+IT52eHzMVJMPAZaZt6UZcmZaT0swmnG3xsHbYp4EWVuHQ99M9cuYwcUkOGM/kb2FeB3idYjXIV7XHl63R5w8PvDOKERAJE+O5M2TwXPcYOGoOV61g5yNQRbqA0xYHPhqAolybi+TAOxMcUyHTrdXZxJN4fZ2KU1NZrv+i7uNuPGLGm24E8cLnA0dfP9yIl0+KhwTK3JNFdqjTWIeT1qyv1qtL+UTBis8LSZJKyt5uPjJxGajLeqZyMTxEtJGdSoP+I/VEqYA5/dUMW9J+M2bUxG9D+h8QD6xJ17TudN98Mln0wdvSLTx4y/F2kr4A8eNqk1PhpFOD/QJKZaSPeIk4IT+oSJykVdFw64UdfX8/PwjCWEqstzAOvfYa3w0zy2uNjSyTxpQgtfuWfR7D5P7SqyWrixYSlqrZy+OyWJq3XPB3F9EwiyK+FxAFwV8hqZlUAezsMutK/mUT8SijX1xw0Vau+uv6GwvZngvCEgoar23Ll+evPlTqQjXp+6PLg7otA02AsuSNSy/FhPb+kj/oOWEq83jk8VeJt9IWCqAjRZURhscWtFmvaZudWF9951FfqV/zqnVz30oCCbnJ1J6+57L8J5aAXhZ4rOmU5f9SAtjzaJTHrEWqxfwfcR9tk/XuUh8R85bTIXVT5kBzuDHmWKGfJUYiRWtydxbenMxa0WZOdRtFmQujZVVbJYcFzbFhG/YKlKHCGdekJu0yaN3oRtELlsBmBXdGjJdt/3Efku3mLpCjf+tXE0HcWex1sIqQXRYpDY9U25aoA52roODVir4L3CfSYNsp7XZfhfePIZyaJhAC9OUtpeGlzW4ftsN1bqFDb+8x91zU89BKzqmFXWzg2e8e9f+zl1eJScN66rbmSvWdbbvxlu+GDkmvNvOWqFZVVx0/52zA+2aiWrAltQJYJVZe88a76rJd9R22E075k7afrto0h20vB4Z7ZKBxGbwowZYVWd9rcCPnxKw4D4J8O6nNNb2rfMHNyTnFgwGdURhJR4uxoT3/MGptQl8QmPoF3IRkgyJAKcSrsqAJcSeUxo885DdAlgSIu8tVGfRBUcMU/WchuqPbgjhu6wJuej2vuj6XpX9cNIyVvy5aBuLrM9Ljcj6X4ZYk9Gw7tNw3T6r7KYUpsJEH69q9/Nzrtd8UaLYvq8BHCqbkXnwIdeSOgDCAIioVCUBJSQ1aoCJQqWFYjUghXoTmYMWkshsJ/TfaK+k7ECoi9L7n8uJ6VY48XdSp3TZ+j6gSw/X9/5Pe9/W3DiOpPuuX8FwPUiaVbPP9J5zHryhmPXUpcc7demwXVFnjsdB0xJts0sWFSRlt6a3//tmAiAFkgAJXiTrkh3RLlkmQQCZSOT3ZTLxL6+GQqWTnmp6PFsN9m8Se9uLmzcKXDeNWW8hXt04Vt0kTt0qRl0nPq0PHWZ8fNytfwmDOCjqej5eGzIkKy/H0mVSqf2bi57WDubmeN9et0HNDgKaumAmK/aX+GENWLxLLz6b/urBgJ69Lsm83aV+5REfEwOcHXeHRPDxqNDec05uIqcWxJMb3vlx6IYrp3FVUsUStD/DD29qVqY0xJgoDP8eG/yzE3mgA/rzt+DxM1P6q+Yi0SyCTVPKe0f+KgROHDCtxy7W48Gx0gphbJqcVj6yMUetaE2HAuvU61X0cX8J63ThV7LWheVdeYdyNRLp3T3prVBJI+47Ff44/aSGsAXZjwvfjDQMl0IFxspvj5pY31eKuxPeuTbnPLT1UI8I5roE857OJfHMxDPr34PKEs0q770G38yTa7N8c/Wq2a+3fLTpwjvOOwN0c9ZO7DjDfzTgECVG4/gYac3gj4mc1k5Bhzz1UeoYUWSHTpE1XzrVS4OI7By3VW6qidOmBdvxgj04ert8BW2a6a56emPSu7zhDvjvip4TFU5U+CtS4eXaSaw4seIHzIobAUsiyOsS5Ps/rcSVE1duypVXoII6tHlirzLEea3VRBz6Njj0eC0SJ8+na8TViPZcXQVpHSthl6luQxu6XjGhx0XWKyegU6qedJbo/06UrkqpqPzHlohzvdE8etq8qaIfIDms15LNU8Nlz25BDOub7aKCR2m394AVJg62Ow5WrwmVDCxV06BqGlRNQ83uVmIR4nbrc7v7PanE7BKza1hto9Sfb1l9o8YyomocW2F0VzANzvp0ASErRugqRNWaGstBdaLIuqJ1c00dL71bmIiN0byky0T3dqaEpkpG9O8r0L9q40o0cMsFcOB0sFprtksL6/rQET2sbr57mlgzDKKLj5YuVmsE0cZEGxNt3AFtXIptiD5uRx/v7+QSjUw0ciMaWYMHOqWTjZYV0cqvQSsnVlXLL+dk14SbA5l+DOYPF8v5HC794MWTR6LkWtDLivk8KlZZOf4uyWRSWOKQWWmiGVhzJ/afPPEyZ6R9kj+Pjd/ab6a/FfpJ9PN26Ge98aWaHTuwZA6PudYr3MYJ67JHN+ep9a12Qk+XdHp/S1sUlxXVntgAka3XHaPCE0UpjYtf0fmDRH0T9W1IfVciMWK8azPe+z2nRHQT0W1KdJeghrb8tvEiIlp7G7Q2zu8M5OGEXCDOPUoEyWyFoNpTgpzhOJKa0qqhHzHfnEzA5gjnY9AuUo8q8VPF5HLiKGOIKOO3oUoeOl+a0ZItE6a5Z3fFmGaa7aIecFmvKZH3ePnPjCZQAu/+84mvVta22r8lHq8lj7d3k0pEHhF5xiVtyxzalufA1VhHVMz2dcg8LrYim8dl1YBw+dmLvz0GM+8ydmOPUvuak4OZiTwmUjA38A7JQNJNohYbKplOiSg3dCsEpcoYEjFZU6EPjpBUacWmiUj1MxsTkKrmusjVVHaTGMcjYhxVGkBMI+VLUr5ko3zJEuxABGtdgnVfJ5OIVSJWDTMklf54y9RIg2VDOZFboFEfvNh5QUE4EUoCfS5ZMg2YqQ+uP0NX6/1vE49pGrFTzZnTwmQeE3uqGHyHDCrpKbGoLZWtTJmITd0Km6ozkMSoNlDug2NVddqxaWZV/9zG7KquyS4YVm13iWU9IpZVpwXEtBLTSkxrI6a1AmMQ21qXbd3nCSXGlRhXQ8ZV66+3ZF0Nlw8xr1tgXu9BFg7uS2AqhTRAWQoSasFsnd0FYexNiddqz7+KqTxG9jUd+ga4V9JQYl4bKJpekYh13SrrmjWLxLnWVuuDZVyzmrEtvjX/1NZsa7bBLrnWXFeJaT1CpjWrA8SzEs9KPGsrnlWJJ4hlbcqy7t90EsdKHGtNjjXnn3fEsJYuHeJXt8qvulwWErsqpNOAuUo28A4oKx1Cr4X969GZyc1b4zEziHj99A6pxP0UyCtPr2L6qpmzN9b5XKy/SDjc6ExPPXA75g8ML+C6BfCFIGZkDXzbs0e5JhZoWqGVKHIfPOsekY41d+H34Qi9++gxWMI3uPz7jjMNlnczD/xXMLPRBHo1dZx+rsFnN/RduCpCA+I+B/7Ucucri3sz4BGx1tHK3M/8SRzxbqLF4CPpR/kOuiHcAPMZ5RCJdfXIOhV5s3voxvpC3LAYSnrGJ4LlAzzyywoaBxsY5Nrw51N/gnn2jOBBHU0tGjZyF8BYxTfMasKUwFzkGukn2t230E+EXcg+BOXXGKkdYhVrLDdcW14YwsCFrjvRcrGYMZJvMFTCSVDbwbXO9Y+HCKKtGJXr2pR1HtUjnW9uykHD/Uk/GXSf62sC2aDvoLZLENYdrOHJozddzmDDvQdfCq7q/54nD4e24+C6dJw/+taz71q33Le6Bit1YycNDNivw3SmB5NkWPwPtyc9FapsM4aJO2fOJwwDVcF0DCe9Xl1vvVcLS13XIPhrrNeb4pN0SjvWa/OoV8pSHRjDnTNPm6a2C49rwT3n29p90rmKhK1FGigobAOmLYf6ooX7Mh9IRqkrciQjMhOexJRSGh4XB2+mCTunCGKN5pao0YFiTMgdq8z+4Px0/x6nYKYBjHznzh+8MFhGqok+1EM7coM+puymwtA7pCSOSpf2/izahGBteAIt3zzYzLRqQehf8yaQl2hxu1CZFi3I1HOrqUA5tmhgufSnbeYxXt61uF3SvfKIUEUn3NhzSsZR3kRLU6c3ZXTcTI6sUm+hdMg3GVYyrGRYD5H/Ulu8TdNguqc2zvBUN9jBQUmanu7vqfJyJgg/S15zYaKF1dfxhVJ5IVreyouEvlZel88xqegiTlLlZWgRq0cBdq/yIsm6GTTIbdj6QkrN7So1V716jWi4NGkn+TDSBKJYk+NQxbbk3ZZx8kF9GS6QMf5Q/1ksjfFE5fAqE4jkX3Q9Q6GM+T/qS3BVjPGHptOwHsb4ozo7Sfqsa4svhXHyYUQnjtGJY6YnjpUSdZQ2XDdteH+nk9KGKW3Y9JQxDepreb6Y0dqhk8W2EVCcJqJwWHpiBHqSk06DmNBlHITehTdZhhEA9088i+Y4oozKoR9TrFEzAR1GHI9Quw6AHmdS0jaPBxxGNm/dfuCq5CzufrLzcjalK5uqYZWaUUwoRy2WGTyKDO246h8cX1+mjZtm7cuf3Zi7L2u2Awa/tNf7zOPzl26INe6cNS7TGEPumN0yFv8Si0kspjGLaeD8E5dZl8vc90klRpMYTVNGs9Q7bslr1lhHxG5ug92MUCAw00IiyQt9oDpKUTUgo7BG4ia5qGOrQauaz2OiT9Xj75A9JYUlSrYTlatQKSpOuxX6tcReUoXaZlp+cKRoiY5smhMtfXRjSrSk1S6q1pZ1mkrXHhHTWaIIVL9WuoDq11L9WhOyk1O41QiEGNy6DO6ezykRuETgGlayLfPjW5azNV9EVNN2C+QtikjJ3ark1IAJA7MLa3w5ic/m0yPOWK2chmOiXw0mo0Mu9sg1cO9T+6beIn5s+JZ/52pXR60oizXHKJkaQcpo3QG1PziC1lT7Ns3WmvejMXVr+ogOMluNR7O/Wa5sJVKOa/fMr6nuGOW7MimN2U/KdaVcV+Nc15rwgFjTuqzpIU0wUahEoZrmwBr73XXyYRNrlqFUG64wyo7dBsE6SYTjuPOpo8+VrRQiH/NkBmvSci692f03z/1+4d17oYe2PfMb2Ot18QHvPj1AZVAoQ1kKdV8eS8pDiq9ByF7sP3nphzV6T/+EP6bebG3pdAfgyGOw2SAvRc9PS1Za2X0DHKTtuIvFDI9Jgq5jSSeLfxu70Xdw3nCYY/wxNOcXcVYzGx2bTHAhfTcyMdUjmGvrMXhRMTwyT/A3Voa+/Jpf3l84375c/P3Dxy/fqubzXOpzC3pVM3wY03dvXUwTK3bZX7+ev9vloRaGUrFGzEVctrTkadKsrHT21A3KM1qPe4KJrr8Q9bNZvRjPtdPLrAzcAF0Vd2iKz8l7UQk2Ef6qLV2uOXoDpThmP9UbFAhoDP+r/whzP4b/DfcpYbM/BCG4SJJlBqEUFOkcIdDdzGOKlFVS2ILBL3ccsdaqbs757Nzi+az4DPxsEklhEqY09uZRQPbvdk/KnPlRfJ17Pnc7bzqJrpFO7FxcDo+Qa1HPurLI+tSfxNgOeFHQWFUYopkC5hWMzhIVHTzSs0TJPGQjPPJOstvh0j21RvWiYLI4ju8MRE2nmWmrqjxeLAVffpCe6A3bH/zAfnAxDq128f90XXU0ng2oozzL25/qM69the/TiMHW24Gqewwu5Kf8Ymn3uUQk+tNIeccNnfXY+qzHQ1VR0SPZ1hkfJinvBmP8Maq81LD4fTrWnVgr+8NLsyJ4SSy+SYFQLz6b/urBgJ6PpeqsNOJXBPHZbnSJ5Y9HpJtzd91kAlv4vG5458ehG66cxmUtFbpqf4Yf3rS6ziXf0J4x8OveY4N/BlQJwtGfcAWPn9XyvOvqsEZHiRUgVmBPC/oW1+duw3iyax3ZtZqFY4vjJX5BdDpVyUqSoaB4Bqe1KfRkHzkKvU9HVAVRFQeuqUk1yqIRrU1cpMZmnH6qpjAKdmdc+Ka6EaUpGiu/JYak07qWHsxvuseMM9CjAbqWfNTj4040g39FGkXboy4ZlaOUOYGQ1wUhLTS7WnOJciHKZT8pl/ItiNiXYzN89YiYcu0hToY4GXOka+QVEj1D9MzxKK3oY7mVJdKGSJsq0iZea5CTJ3A02tUI16+ugvSNTeGl0lsQbfghxYS+Kjuk7E+33BDp0C7xTR0qQZWQiUQhEoWW6OzaxPrvEDHTzkLU5Rv0U3J8bMM+waTKXZ2QPSH7Y1HZFNfrrVktVE9wuC4cXjkx2+pFESIhN4aGFTJpjWNy7gHhma4wca6pncHGhX5tDiOTbu0LVm6gFKZCJ+xM2JmW7Oy6zi6xRxjazHK0wdLqKSJMvS8ApdQLIGxN2PrYVFeJsdVWjrD2NrF2su9rQXdOSE0AEgj1YzB/uFjO53DpBy+ePBIuaoG5FfP5mlBb2Z1OETYp0I6/9BDNwOyxEtoiYShqcypUJ+pVoT4E0Qmi0+KfXRtsKrv92sFumJ6aYF8/2ZSlLzpdlOteptFXui7EBhAbcCQam5AAeutXO3u+aCXGxa8oe71TCgEXwAzk54RcgM49ShCJA4Vg28M97nUdSQkC1dB3B9sn/dkguD8Gae+euKrEQWiZ0PJB4NqMRd3tkHONtdwKfWamhELMe+OZq3ZKApMEJo9FZdVoMmPNKJS8VRz4wua+CAS5TJoc3ObF3x6DmXcZg1dEEb8Wh/rJE/mah/tl+9HpIX+kKzuKSmsLXSdUQqGEQmlJzq7LrPpOY1oTS1DzUDvFFBCG3eGzvvS7NGFXwq6HrqrJ8XQKq0VYdZMHyXmx84Iz7kQ45XiknCyCBnDjg+vPvoGf9v63icfmmiBHc3hamMxXhKiKvnQJU0lvdhmqNhJ+mXAJshJkpaU5u66y9DsNW02tQj3oqpsKgq+7iwkqdm+CsARhj0FdRe90Foyg7Aah7D1MuoPuFmzUYtpBnQuiaAFNzu6CMPamBEzaA1oxlTsAZ9OebALMksbsLpStIXi9YAnGEoylZTm7LrfvewFiy+1BMwibnQYCsLuPCJQ7NsFXgq+Hr6w58Jq1XQRdtwJdXT7pEnAVYmgAQt658wcvDJaRSmSH+qJobtCvCDALPekSYB6VbDdXIwWWqDt1Y7dhZRS+SbAut2qBa0aLJhBdtbhdyLJFC3cegNrQiYPv3rzVVKAsWzSwXPrTNvMYL+9a3O5PvScGoSerFmf9skwcp2Qc5U10Yon0loYYD2I89pObULsGu13EizYo2qBog2pCwalXO1WRE51ODIvBwe3cTFZfx4VWeSGagsqLkqLLVdfJy9qgizhLlZfhEq0eBSzEyouk5WbQIF9U+1jMrxSNEnlK5OnhK6vom3rXqV29L7HO4+SDyaH17FHjUMV4qW/gBnucfKi+BU33GH9UXyqmbTxROfCq/2RLPpZ/MRkJauWY/1N9Odr3Mf4wGDBY+TH+qL5UsvVj6bPJM7jhHycfqCpjl9z6NFmRDiMRIjBzuUXagH69jIPQu/AmyzDyn71PnKU4DoJdOfRXpNk1/emSbD9CaW+S0WDTp30EVs+JbP4E+4EL2Vnc/WTnBVALYTbWkiotIDqU6ND9pEPLDPmuk6K7bkLqUVVlkiDCKiWsuO3bQ3rEwH8gkoRIkmNRWdHDMqvXgDBht4/FvwShu4TQEUoK1FqIyklM8VjtEzdAWJg9v0mAdWyvWanm8xUxuro7XUJ0UqAdf+uqqQpUiJjgN8FvWqCzawPDv9MvYdUwD/WwdcmE0OtYu4s/qvdzQsyEmI9EY0UHS0wZvZ21Qfgbwrwr0a9KIA2wC+z/URwuJ/HZfHrEgeXKaXhFAGvQty7R7JFrxOYiR1NvET92dgx2J1pRR+qEdgnt7icuNTXuux143g3zUQ8Am848BZpFp5mQ9zHMXNNrIABNAPoY1Vf01tQu1g5FM/sxZj8pDN0lDp8kEnPc+dTRB6UrJcvH/J+TGaxw/vgeF9w9ziasn8FkFo1gVqP8Xn8OioOOLHvDke3oie47H9idp73cOsv9fQCNDkuen1lC2Iue8UuXRVOAWCGy2UEe59OigyM5N0Zvx7K3OuVGMhPwzXO/X3j3XuiBHTyVhPkNEMNysQjwrT6YAYQht7LFGN4yf1+6Yx5Yt8lwb3EdzGcrtLjzyAd1c5lWoTeLGnYHX4BA8CO2DriiJ3vy8DhQUBbwGSW/hixUhNYzQHOXaCDeDortQ/elJtJnMd//VpLZLTxriqoKg4C2AAVM3Hk/xiNVLFdqIUwmBfsYLGPAJs+AhNwIBgkwRczBWs3BvZPfBcTpPlW9DA2iKPH4hfNuQ2/yuwA8QHq9stg+017XhwV7sYSl/OS9D8NAsyv0P/lRhCIVW0jacgL5YMr4N7f/YfXVTSBAXQVLMBHYEMNbbJqZWsCEWRdsfH/pl1kvMbA5e78z3Y6Tt49qYKNhi8m4FfqMquRN0/67sjqDklio0Ki5YBT5VWC9XSvpiF05UPBLnv0JO1FWrKS/gi29FN/aiH/5R9gM1AqQtrANDUgetgUVyFvdS1hhGctUHMQb6+rLuy+DxzheRKc//vgAT1ze2ZPg6UeuLT9Mvecfn4J58CMMFDyCH//9p5/+7/DUcqfT1LChAUiMGzcq7mIxQxYBN09b8UzYDkBZX/hY3dmLu4pw2a+iRB9wD5Qa4WTEBGxXjDTKo5fMc7Fx6S58rayIajNvnSXN8AOgYIXc26pX0N5Y5/fssYw9mvpTNHXRwpv49yskRdgGYvH3sMEUPrkreAQ4BpYHRnK5SCXLBvUDQGVGMWTuUz0UXQcceT+C7XEC5n9qMU4GjCmopRXwPjGft9fijcJEQ8fJh+wlkpLlFKxEt7atVxvTqUp9qniD0UAOiUtUwpAX3CWJOGUjWM8+QIFZxmvebVrNcZJ5Q3jXkhLP+HzQoZQGYnMkME3RF1QiTPgovclqwvLJD2lA5Tn1H13+CGUfpIbt8/VnVXea9sHoEcx9jpcLgBNKczIqCK9AB6aRBFo5na+c+srbZgltVo876I7x0yRYGfvxzGtYJQhDQg1vdae/eqCKz03u73RRVi688oAercaKfWzrq7RZL3Zg9e7NpkgWhJNmCSlwmxBQtyML+a2TO/CfTxgoiDC0L91zuwDHOrk8oSGikbWczzyE0l4/9NZsAy7+MJCJ21kQLJAkE3kDSM8iKFixDAKwXDFalAlgkwc3RGSSfzSSbAwlZOisN9JlX5OesCZPRF+QYpid5B68HqtMLSejtm5tjm/YoxSLu+YSTnRQZcuctoxrr/soda+nCwZXmWAVFZbpdY7/kieCRaKqHlA3VJ03aiO1qVfQcpK0dTGyfOPV4cD8HZVx62L/uwpjm3ferMeV3dQYaH2onFnnysp2LLmn6qLU4qqvrAjmGoi+TsC2e5nurm5qhV4cUvbhpapasViTGKy8wo0CrUzjxuynOiiKyjbGH+o/p2o2Tj+NSvIIvFl9+2pivvKmq5ZR3U2tb6vxO6TttTRdb6HEiAaKtVAlb21OSn7sTbZ7vQyHI+vkfP7szjBBM3xYPnnzmAFU23oHX2GEZgGjOv3n/MT6Z+bOE8v6wTqz+kl/+pxbFjliSNNDK1Zf1GSBXtgZp6P/F02TfTES0R66froG5WH1/3JSqpx7s94a66vJ8ut1bKBLjXOJYa40ysOMv6vxd/IWFhSYOdocimXd7bP5aoQ8DfrTqvWpSSUa5p3bjHcsJUSeKkJZ7wIMmfnzyWw59eSIMG4xbKnc4q23LLkGtV3RBiCnF9bMHQjmOwvZLILI59hhvWSn3nTJ2B9bMTY+L9a/wcjl7o+GPe11Zbv5qGecuDQsxQbrOW8ZrZcT3NRehCDWUgzJRZl2wObA1GHAdDBUNoHm3tIngyVPyOFizYMQeWuekz5LbnEN8pX3FL8d2nmmP5Palwi7MqOylsxSxvB87mOWv/8vz1BqyVjTdR7PVoPmY5AAeFJPtwGq/zlcTD6J2xXQXg5slrQuJVHljJoyszo7Ubqu8R2K/ZLNqK6iExQGLb3blkvE6w2bPKfZLOy0gbKH5Au4lz0oO8W5h8l/zM1s1kYXWzfdUxR8CIhzIOYYKwrb+ON/D4YmmcgFZmVtFh68OZoMb92pOL1Yrf78r6gADttokxWUPCT9iy6ZVCQ+8Lu1FBG/6DNcM+hnquwJf+ETf/Oor0lt5aGQcZ8v5L76IrmQcp60KF/caaad7MIUs5Izu142OyGvY72iIcS7l3epl5U+0XZ4mqFsFYf5tJFBweVK78+OLed/cYYYHbBf8N2sog4kdpP3rdRSlu7dtQUgxMqrlcu2QH1p6WyPKvafYSFhpH3Ocst8ZVWuMk+owURk9qFBgB4jhJm9j+Ujww7qRkbZudafRtZj8HJaASj+Frwok0jla355f+F8+3Lx9w8fv3zLJjynadbnUk/bpiaoRw7D+e6tT6xhlvbr1/N3uzTKypGo07rNhaoKj8mzovFj0skqNiRPXr3wHcxpSSp41aTlkzSVl+dMpWyUDNKepcsVxhLnfMx+Fk0OTOkY/i/+AWZrDP+PKkySUhEyTnsnijAsTCe0lnWYWYtVvVqDk211q1cQRXZKcZ6rV+v51fuLs6vzL5/NBCCQHnSmbg+ru3P28dvZPy61yYy4HbIugQOVfh7ch8G/YAu8Cpce3+R4vrNu6fRUC+HUnDBqVIVA4UTs72vLr59j2eb16ZZZLxutlNEu16FNmQxS0M2kMr5OcY42uT4t833a5vxsai3UTBikBbDh7MEDNOG0EDUL8Y319f9Z/tMihB0Ioyqn1uTRm3zngci557PXcVTRlxc3stwJvqw0j2HqV7lWH2BkmID3cPHL2/R0TRZkrcP1zuHLRA8F7yuR8fJfxuqEhJYPk0hmk4dpCbjOkuu6yf8rjVB1nVvXPr+uQTmYiqQ6w8Q6R80cauMY7F3p3Mu5dWq/nGqDY/w91SuYZv6S6v3J+98WaD/mD9Z9sAzjR+Ui5a+OV+YRjKwH6HT/d6H1qpkY2o5g1v/onyhy5czz5Yxz5szz5vThh1ReVcV91KJrlGzSTIrgz4TTHRCiSU2WnsGCapz8ZpQAZ5AEZ5wIZxIC7iYhrnVS3O6o866rspEaV9uPbGS1JI+tfOJbJ7DVF0LkgaeklYJw7GRhgLvZx4QuU6lUjamuhCoXwoFk29bI2+o1z8RKM5vG+uyg8kpSmQBysxhrZXEnuZhTyWHCZokG7Qe8teH0tElB2W2kOJI0A0ibO7j7Fa7ykePem5L/rKTgCyg61kWaugssiWqV3dMDVItFZ+5W7Cb710gqBfMECw7NIK8uwWq1Tib4wpaolMrmAq04Xv/DMzzLtaHBC2/mPbvceiaNYfmsMJT+wKc1sns9HuhIDgET12NnznAAYKsTQWPFkJkXB/Mk7yQcnla+WOugrjj3YB4nuMNgHR5NZOt+Ccq15hiSGngf2Nfry/hTTjHTpxDienn0wZ/HGE521U1ZEH7hzae434zVxfbwu6IWX/Nu3YwU2bVPXrCMx/9nhArEN7GoJL/yjfWW8RVgHF+8/jOvmDK1WEEikOEseMBSWm44544JL6vih7k2WFGtRzeCDdGbW+mcMo3nWau8zEu4nGNDdt4uz7z5AKdjaI3H1v8qGifoxgPIWvRDbZ/uT95iL1hNYraU+r/zD3/0lV1bpUVhsOrXibLNk79+vbK+vbfOLt5bl1fnHz9a387Or84//8wL6sWg7LgcYs+2/hEsWdWmZIEvYOtE70LTcFLwyk57dMsWQCKMdd9Y59f9BouDGfaaZqcs73caWDDRHq5KN1wx64OeCdMv7HgU4MykEsUyPHPvGaudTSbL0D7pVeeKJtYtW8MF841lS/o5eIGWodfMSsRLJLqsW6bot2yIXI+TXGbMXGYjkJp4dJ/RnMCAwM6HPnRzanm/TbzFujbNgxdHXEWm6jdKP3+5en/KC968MDVkfh80um5ITLlQHXYBPOfZy5rjYPnwmIqGCcadYaG4lUbxn8C+R/BBauQpCHH78NwwXU65pyaTgb19XIk3csFTybziGk+Y/HCNRi/QmeCF/7paj2k9F9yy8LnupdFux/HnYAWdARaYk+wVqzfn/Bqt64Oti9ONxV/XVRal6wZDKx95cOM4/AEe5s+96c360e4SBhz6/4J72MORizVm+PBmZ91CZJ+ln28KYft8d3NP1ozTaCDSdoI6MMhM4KiXK8R3WiNAsr751yiYJ16TvLvghMFv6+GKa9Y5THinjSHRaCA3Ijk6LKsCbhB/YTXg+uzLvnwVZ5D6j8ELFilPrpbTg9ZtXLPLbuTEWvZ3VWZVkukSidQI5WtRvI+q95yEfEW7D0EAXoDDatLfLe/Z6HF/f3JjW9TzvAr+K5ITWLKLI1ouUIFt5rOnKf82E6wQ01DnMYq+4khhgq4rOPP1uOV8slGtuxR5LTeF6mPtpkb3ZkR2ojIpSyKVSMEBGCiBPBlKclLx5HVakuLROuENC6uXpeRuZPnyZN98lAH9FFYfloWoRrm/nuHEp+Vjb2rYAkVAOEk3ZnN2qlMJURU3UYccW8LOWVDELEJ3gv2NFq5iVXHsy5D//cnvibOTSzP/Y9DP/ckHb214oii9Bw/hrZ2IISESk/DAiaouIJ7zADexnfEueMaCg7BveglU4YgMOQCkgC4nob9QFEpcsGsdXsXQn7BkrOLDAMN4s7F+lq7gX+8jXmS//Xp59eXT+4scAi16vUzgoRctZyKxPwUJQqpKH7D2smdND6tQdmNN2IA2KDXC+sFiATTrbbBYVWtHhxpiriWdaIpGW7jlzyiLxhWQr9JEMbiNxZlEClAfaDBQtl/cMPLe+ZO4vCi63Klr/oZw/6a89jl34OR3V5xBSbl03WtwZYGzPu8W83zkHpbMPsx7diyiiZvSmB9ywvxChoHBnmsewbZ2fmVvR72/Lbp/pc5bbl/P7eiKV1JFCfA98/NUnlo9L62lh1bXO0skk9bdTiaeLYMx6H764o5g+azErianVp1WlKhs4MPJ5/3mCuqfWpnX2B54p5zF3U/JK20jSSiMAy+5JRNhkauBVd3AE5AkYnG3HDNpvxXy2GunbLe9YD7BnP/xQv7etHULA3paBHh+AWKM20N0iu9WsE5YcFd6X+sudp7/7M4Wj+6fnTmo4a8RWzjZ6VD7H9/9+XRc0Y5qX8jZlqomhGHR+0BGb72udUqqya6up1323q9GEfUNcCY68yLmeE1gF/5W0lAQfPfXHeC/luSfLBZOUgU+vUn+suTWZfw4Lnc5Wb7B+pwLG2/R1tQpbHjyXXYccOfXYepZUqWhxD9NdlqUbb2OS3ea9x9fSlc00Kjr8Toh3AlxldcegqKFZkNRNFR7SJqv2XLh5esx2MiN7lVwGYcYlNLcJPyBsfjX7Mah6rIsUEljDZrY5DVO3c3aRmb/mm+NW1WBW3IxTw0jn3scI6uUCbJxuDrdFyohTneMY6EMFJJPozzr2RhUBETKIboyxlK2SWgAWkH39Zes3YSRYfUbOVT44qVhy9tEz6NHzIG6lWOVGO9lgW1NY5MgDL1JPFutQ68sCCmmGeO9In7MQo08CK9pC4uapeO2y7gElUTLjuHMa4EuFYFPwEDRfC6/iAUg83e/TfrOUu2KurgeW+TFovkB9ldB0Ehi+gT6vp7dW0Xnbq07b+LysLwfKdriZ3ZxH+8W4+S30h7Cz++CB709+4xPhdF5k6WCAHpjPcEzfZCmFfn40Z17wTKarWxVQKRCRuqlKsgOtqTKElgMlrh+4fSzGVT9kSlrxqLXCkVQVTn75H5HxgArTSdazQLht1I2hJgVkWkJcyYd2rZuSYrg4+E0YfAyZ1X1eDhfKDT8CQe1DOcsvK5oJpN9YH3HBDA3ZEc4QxPBMpx42MQMJoQZBT/W1V578h8e8Qg71Lcly44Kl3OWThPcg4//FIQrlooRhJE34g9C3Kxo6T4MnmB4PstGTVSYJ9Og8PmbC6HYdeyS9cQ/KXxShcSUqYGKpvZlPxcKwDhoZLK5L3Vc4YA6OPmC3WGvp8rMqpjaCP9e9Mn+mxuxnOKBoPo1I2isVhtSrZx68UCLmXZ1rGH1tKwzTSvRtjpxI4YLKjhVIy3MqrqtD86UO3419XUZsQhLv/S9gkHVUcjav4u99+wuCGHD0V+GW4TD+1M+Q6ZhulrzLCZhVHlP9unhYiL6zIR9ybtfcczxsH1UT3jHBXmGglfv79WuxrpsYHm0OwMLHRmGHOSVKOYv6YJUvK54FOjJ17nHXqjxpslexLwaER0oZOKwddEmiHPBDu3dRhCH3VIjhiOuz4dwumKzTVhsfqLxqNcle52w1mx4fYMDRPVkdWOSujU5bUhKNyCjS0jo2uRzA9JZYVSrSeam5HI9UlnRNXMSuS153Iw0HmqLutUmh2uRwhVkcHdE8KZI4AIBvBnOsRbXqOUYS7hFHaeYf6OmAw6xC+6wlDNswBV2xRHW5wdNucFk6pfzmf/dY3NWwuyNcPrffcF7cq04KDiHvbhnziwyHjHXEN9yEwpxwt44YfThmizkl0S5G3MUIsBG0JY7j72Y7MLuic3xV6pexKtzWDAmX0MmCKbWPQzlzk0q0iAphhVlii9EjVgvkWvLN8P0Ae4In1LiKRk3P21aDGGtyvB3xQtieRVsQoM2oUCN6c+U+tR5M/kXTzP8mYrt7Ibp7IDl7ITh7IbdbMVsVrCaOYkU2MwqJnMjhJmWKBsW3k+vSzaUEQ1lJAPX8DJ+wYxb6IZXqMsptOQTjI/D6PXa8AdVEDuDCLtG2KzxIsC+BKEnNRb2I1lS7nENuJ29bY8SJ+WOU/okpU9S+mS99El5/VASJSVRUhIlJVFSEiUlUVISJSVRUhIlJVFuOYnSwB2lVEpKpaRUSkqlpFRKSqWkVMrOUynlHZgSKimh8pUSKlUBia6DPpnYQSH2Ix3a1FUYqHgOFMWCOowFaSRGYSEKCx1CWEgiCLYTG9KsJwoTUZiIwkQUJqIwEYWJKExEYSIKE1GYaMthonqeKUWMKGJEESOKGFHEiCJGFDHqPGKk2YwpeETBowMOHumCDYo40uoqeJscqFUgX3egaAdXbTtZWLb3tIhX7J73+EmKGVVceXh1OpTCo7odNQhtqtvRnJCmuh1Ut4PqdlDdDqrbQXU7NlG3w9S7oToeVMfjMOp4KDWe6nqUfttNXY8K6Ng9PFcIugqcv/+NAxwC6XsM0nNCJLBOYJ3AOoF1AusE1gmsE1g/ELBe7eUQaCfQfoigPaf5BN4PHbznBK4A8eCtfgzmD9D2HLrwwYsnj/txKoaq58U3NY8P0CumhXA84XjC8YTjCccTjiccTzh+f3G8mXND8J3g+4HAd4XCE2o/QNSukHMlWOcnY+zU2RobiLTvctEklTyoZBKVTKKTNGpWS1ItJKqV1JTdMmC5GrNdLVivEorJnAVry4Y1Y8UMuk61kqhWEtVKolpJViv6s5IGNaBDq2jRckRFtZKoVhLVSlLyjaV+KVVKokpJ+7C9U6UkqpRElZI61LQSbUunnColta6UpNqKqU6SkRANRUt1knYtDiQiCoVA0M9e/O0xmHmoGt5+pGtmulzjRA3xqMNL1MxMCGVoUoYmZWhShiZlaFKGJmVoUobm3mZoVnk1lJpJqZmHkZqZ0XTKydxCTmYddqwLMJ6RcBGEf3D92TcwOO8Ty0I1j/YDeRcER+ib0Dehb0LfhL4JfRP6JvS9t+jbxLMhBE4I/DAQeEHbCYVvAYVvOSJeELIeiAvxEwzfLxguxEYgnEA4gXAC4QTCCYQTCCcQvvcgXO/XEAQnCH5YEFzoOgHwwwXgQrYJ/P7PyQz6z7FcDo9/E677WkaTWVSzMJFoooDEGwBrLWpPHpIcc/w6EDsBOpsB2ckYCV0Tuj5adL2bgPmN9dGff7eWCw4AFJ4ce7kKPTMxFyny82OplcTXwav9uXB3rGcfwEsqbrhkMLyFS8CipdhQagN0deE+4Jubt1koBSiFu//g4z08Mi/M/jWy88bcXrvRMPT08+bZgQSt41Nnke2s4btjP3ixtPDEbpveIAPV+mQDb6Qd4ZC0QaQDkQ6vRTrkpz/dhEpph+SivSYe+CRvkXhgBmpzvEOJq0eEAxEOh0E4JEpOTEPHTEOdfPs8cO6ackjaL4b637nzBw9WPx9AtFO1j7W35Drd4pCiHa6FnBskVUGmKshUBbleFeTcEqL6x02pPQOKrzHV14LyK+HXzCnAtlRgM0rQoOtU/5jqH1P9Y6p/bLXKrKokOw1IzyrysxxMUf1jqn9M9Y85pWjmkVLlY6p8vA8bO1U+psrHVPm4Q00r0bZ0yqnycdvKx7lNmGoeG4nPUKhU8/jVE0zzkYNC0OcyBrB5AS53GPnP3icvitwHbz9CP8qu16h+rLk/n6+6w3Eh5QgoOkTRIYoO1YsOKRcSxYgoRkQxIooRUYyIYkQUI6IYEcWIKEa05RhRHb+UIkUUKaJIEUWKKFJEkSKKFHUeKVJuxRQvonjRZuNFzaIXXYeR1IGGQjAJK3x2GUva3gmaqp7XCCWpb3/NyiebLC6qGi3VQKlBflMNlObkNVUYpQqjVGGUin1QhVGqMLqJSh+Gzg1V/aCqH4dR9UOl8FQBpPTbDR+5WYYmu0b2qmcVgT1AQnDvlpP4bD7tPGP0ar0vbwPqV46lBu43aGuP0kkrR0OppZRaegippRIS2E5+aeXKolxTyjWlXFPKNaVcU8o1pVxTyjWlXFPKNd1yrmlTH5XyTinvlPJOKe+U8k4p75TyTjvPO63clikHlXJQXykH1Tj80XXUqjpSAWLq9d6U/GddJMCUeV2Wi0EQzGQou6n3xvoaQV/uVslpTdY3z/2+bspHePfkzUFO4Igyp8+dgMeYGHUAgFPG8kNLiI9/eIZHujZ0BkyyyOaYzHxoILJ7PXYMYGIiMg+SwjaD9IwS+QKQaC6Gx8BxEdfDxhOG/tS70UTw/iQF86AB925WYIreiu+vrzUW5IkLxRbCuRnlGjhDLxZbuFk/zOVmzeGdxZ/XmSVmwxKzxUW2sIE3hTig4vbKzqVtMMOXBhRB4aSQIPx2mn8YeFfyY2XfuMCJGdtauROjpP38kRJioSdAPhHUoHB5FqtXPp2tQtAha4G/OV4RyidiYn+S3MuijC5XUew9CUkV7aHCL7VZo3wD+Dr/PgdAp9oBhADRhErd/OM/rBPddnByJXK2ltESpmrFQRpb1i6sFW8BX81h3uCrZG6Sp4ysl0d/8piA92i5WLAB4b1pUad/zrWPtk4uPY8B0pn/5MeRhUlXp9ZjHC+i0x9/TJuYes/4ywO44+gh/vCwhDUa8b//wG/98aQyK4nbbzG1KF17unxaKNyA39VJUXwH7p+aKIxYP1fBO39SEhLLKAzGUYRnYpp78Ycm/VJo9l9d0NqUCADNTVmB03yGjR/5sIsgjB2kF40ydkeVZmM8pfpp3dTUrqcBRlI5tXq36I9e+XVVqVWt1S51trqcnaTRhnqW300jgGrT5cxrtaPy+LC0t5jmzGSqrFn/XS+9pvz63PHAyovhexaOtd+LD8XEHTE9+VGgb+e8Ay/2Cj7g0cf47/8P5hJYhal7WgQxeDGrqpiU1CXpLvt8/Xl3XYK2HkBPbcqSYIqx9uSMXOxG31NH4sGLMe5TXFTC57wUUZ4ruEljApNUitIgD8c1oXefBv2d9KuRyfsjfCHlkk0G6aQl2jhOPnS9UeKsnU87tVfYpI0/QLXb2CxONp1Np8ksIOHkz3lncJOMA+aPwBQCBopdW7ZO7BuVJUJtjuyfAaZ/EleB0mQHMyje9cizxe2rs8u/O5dv//b+3deP79fisf0o4P0aDOWXYCQ/ms9HQUHBD/PCwdB2YqaJQouGI6EYw4HqFZysukgGZCx9zl6UTMk4+aDspZk6FVWphRqJicnqxB89/f7FE/fr716Nt6zMy5wVW9Cu724b3ErSPwVsr4tKdxlxzRp3MV2bBe40GsiNyLtFp7trIQEENqO+dHEfLE3Sy1PdcsvDxqzExOTb0g1Fo+nOfDcaiwddZ3pww86q7rMr+oqt47u3Kr0R/q667TF40aQ8lc/e2cdvZ/+4VN4Ic1c+ghd3FfVH1gd3FnlD/duN5R345f2Fc371/uLs6vzL5yb9AEt7DuuCbR79km4okw/yL1L2cobFeXTn05m3Von75XwSB8EssgHcx76bS/ssbADCrhV2gOxzM5mNYrBsdCf8L1f4h5NhzR1imN8B5Aj+pJCymtA048zQR0p+BW3MuModSwZr/ZvVF0RLv+y9VdmMjeVfspfJlmqc8UZL9heeX7HF/YV2AtoJaCc4hJ0ANSeBBHq1eXn05mt9ya825BkAQj4teFZD8luOC8M2WGzqv2CJiPhUOuC0CzfXfbywf6M8yVm28SkppKudocKpRig5RbCGdAqP+hanY4AjUSixEfqpsWcY7hub8QHE3lPhAxgNubajQD7A2geQ8irJESBHgBwBcgTIESBHYIuOgDDt5Aq8Oh2QSGJ7fgCxyOQykMtwZC6DyN9Vug3rq9q6DLXdhV5tX6HETyj1ETbpHxhtk53uIr031spd3J9a3hy3xt7/AJCvMsh8qBkA");
}
importPys();
