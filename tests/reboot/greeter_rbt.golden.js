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
