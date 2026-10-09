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
