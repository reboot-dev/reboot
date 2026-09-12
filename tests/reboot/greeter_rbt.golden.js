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
    reboot_native.importPy("tests.reboot.greeter_pb2_grpc", "H4sIAAAAAAAC/+1dW3OjOBp951doeh7s1HrIbO/MPnRtttaVkGy2knTK8Wz2jcIgO2xj5JHEpL1d/d9XF7ABC/BFuOlYeUj5Ih3BkY4QRx+ffwQ3MIbYozAAkyWgLxDMRo+X4HFJX1AMFhhR5KMI+Gi+CCOIwSJKZmFsg6uP4OHjGDhXt+MfrHfv3l1GIYwp8OIAEIj/YCX9yCMEElYVY0gWKA7CeAYokqCTZPpTAKdhDGWF0IfEZjhWOF8gTMEML/zs9auHY1aXWNYUozmYITSLoJ3BgLQUnC/o0l1M3gOPpGXcAFE3KyfeyEK8lMSikFBiYzhBiIJV0xBSiDMoUURUlsXEy6yMQLJuGGXujfPgjIZj58r9tzN6uv34AC5A78/2X3+x/9KTJdaf87OzXZfRREIUu67l/OfRueR1ndHo48gdOXfO8MlJEX61f+5ZT5f/dK5+u2NF0i/dK9YYL/GvJIbg/a8D8P7n97/0rBVqzI6TJAt+TozkC3DtRQRaFsXLDxZgf5JMcSQJDaOQhqy3Ug6mISZ0hRQSN0KvEItqlfjqOv38qQ+AmqozC3724YKCW9G8gzHCH+pbG+OEnUw4rSgha2cjx+Yv+uIjcea9MR/o7NTBwvM/eTMIwphQL4oYdEiAR0EKCr7kD//roLfC+BNDAZOESs2sROSjgIPJUXMuR8x5bkS5gvDFEgRwAeOAABSXMHmBEP394ouaqq92qfxjBD0CQbKYYY+1vUQJlqc2R0ESQa64JsgSIsIgQK9xHq94fgnhUpaoP1GEIvK3iyJR5YMcvzBa094Ar2EUgQlkcwpkEwaAvLc5Z1/UKthgnfgvkJ9aAKasIoaSAN5ZapGwoxmsEEZJTMM5fJbHIj4+syxLzFbgRnbUPWSzX0CeaDLpo8l/oU/P5HhiE9R9SMTZs+LIDwUnAfKTOZv9PMpHDDst/oafkJyjmDDYdMXnNoHBZj3gumEcUtftExhNB8B/8eIYRmkjaUOXiA1JnPgUYdtafTHEM7Iuxv/Syh/AUIr5Ur6381ir17w9+xJDdtxMQ2lVO4k9vHTF/34Bm//1zvOTpF2k6Fxi5fjN/jD8PWH1XDa5h14U/g/ii8aZND2ykaxqP2VVx+iJYka6qhV+ZSFspod7NSRr29dsKqxqgmHMQsJqwsCdi7O+4HPPWZFTQYseSsVbXYwKsCMQmrajjc8nSIcBV174h6aRmkfUxW4e8wgkF5vTxvUYezHxfD576ae9Atz0QLEHlmO0mvDZCwo/U138K6C3Y795EW07/OX+hG/dgm6Knc+sfOxFLVJdauIUKWcnd4fiGVty8bXWNaT+iyamFci6ZhQV9sEzy7dj/RmHrEYrtEvoExzYN5A+v6AIPlFt6+gCpLbFXx70WItAiDUwfO2F0XNIXxxhC/DbKi0sb8Ce4ODNOBhOMitFI7Ep6AnS+ozwp2mEXvXwmaF1hchm7WdHrHFVfOXFM4hRQq5DGAVED7MlUF1TbQn2e1owPFGE2dXBTzBhdzX3kBBuiOq551ZBa7v1U4Ef4x5Q3a62YT+CXtBOd6iQdfWGCvsInaFuVltfrO7mhnHQok4am9FmsDY1dAzvtfkYDum/Ci9f7jHidvx8aSenbn7aMQNWU9z5F239Q9pbWf4S2CaQunxDpi+Mf77KT8gle2//9nB7/3jn3DsPY+fqTFkvgJSt2Ui/JwkCsdwAjSBvHAY/9NbVsBcSCB4QvV1/L7bo6iqvuBH9YKhRUZN3Ew1DKoYq3GNDlposhdVrqGqmqmTVGsqUlCl8UcPUFkxJm9RQpVwc5B1KQ5GKog3P0tBUR1PqQBqSVCRlJp1hR8VOycMzJCnvWVR37IYqFVUqb8owpWKq0RIytOVpszhnXhC4ao/LpciVQfj9NLQeD9Ko/JQwdk6paea+eHEQQcx3V74UTLZeGtr5QYaV5txNd7P6puEpLVTZehpuOVAWynzMPSM4pV1Z5xQWvMpDokQbPNGz4tuejOPUQZ9A0speISy0HfKKEaE7clcIFdRBYR5QK5OqAMR2CFXGHu7Ia1U0pg6KK7BPmm1V7KUerhXIOzCtZXu5ilxd4Qj1dJbjK/XTWmrhzdOrCqrUwqoCWOusUBey2WGG0/jJFiiWyG99wBZjJrUstPKIehdcqlDMFhdeYsmzE5ubsZE6GN1AfeuDshwJqZPEFPOtU7gKftTBXQbWFdL2iKTckb5yhKMOFkuYWqfGitDJLo1IdUyWlvtSFbLeW6a6MK+W7p1qo7p25F4ZtKiDehWwVubrQiLbIb42GnJH3ptjErU4g02t6DUNtw1/bMlP3Drycbu++ir+i+QMoZ8RnqUXKfm7bqlYsV96NdGpvYHKL5YetnSVbe5FZ/i8bFao3y+1OjjbqLcRx7muvc9RWRb4UaabkGGg7MXCwxSgKc81wTNMjG65eT+8A8PHW1sZLKo/SPQfhBf05dGWw0azXY1Cj1APz8qmLxIraHLRL2k1jUB2fUYiOwo2csjFA4pL2vG9qKlIyMYeG5HwQuSKKVVH8wUb9jwriqLmqxdSd4ow604vWCoK8KQbKKGKbxgpXuBRT3yV29HBkCY4loMZfl6wYST4rgm03prIPXJaaE5eoS1FRTomGgeEuqPrR0jlAKjre2W3q3u8+Gl1RHe1gmRwsRFQtwSkymCiN1WJroQkp62eQki1EVG3RFSTLaWVtCiak5+ctrKqnlswIuuWyLbLTmT01n29qR59MWrrmtqac1HpsnAPNvGNoKofkDLC6rKw6jOPGYF1Q2Cqx+mMrjqmq+Y8c60mlDMa06mx9EFMI7JOi0yZVdBctLphtxce1zVC6pjtXpNDsp1kkYenhDxtPW0+22001S1NNWUMNRemTgkpe/rfyKibMlLnhzUi6oSIVtkhjHq6pZ6KbMC6ZKMxue9pC6icQMToqFs6qs/93FaSZ3NVOixISZkPxEirY9FKW2Qtbjeld1uJu09bfcocRkZ83RLfFnndW03g3lKa9tNWXnNOLCPDjj03smMW/+Ol6z9GUv5TUGv6tNhlhPxPb/bXgROM2RGOGV97/riFoOc8h/P9/IoRP1otP6nDRuC8jkkiSmxJ5QbcCRKKFq9e8fcjJYU7jckVjMbfIJKAx/ndoawtfT+zLDisYXePcWpILl8p2v3tmfW0YLKkqjMWl2ZPQ1NFYmc58ov0uDway2PLDMNTfjgZtrZMUVyYAXVlJs6thLQkIVnjfT9posTKauc8RuWFZIG+9Jq/RxKjEuxbZzFb4KTs5Veie6WAknC60z4VF02tpXoqrZf2GpJVlB42Ik+S2baSAomJvCu5gGoPZr8UQALyaJl/cqtRY+N+Yxu3ya86XpxNrVty6mEA5bs4o5t9dKMydA4TTpM7aeTTjSia9H51407V6Gc7/VT7zbtTupM7rd8h1emDmstS3g0y6jpMXTWXp8PlVbc7YUTWlc11FCF8z1mB+K3usYvTEye67xZ7jqTzNZquHbc14hG23PKNadlzyw+gVrfe1kdutpTU5r+iKzTtAeQGvY4tgDWcVq9wU0jtmIUKDX1jtzDX850xDbc4pj29wxzysSzE3ORjnJBv7SBudTlu4bqr9ep6AovM/wNf+HyF8KYAAA==");
    reboot_native.importPy("tests.reboot.greeter_rbt", "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");
}
importPys();
