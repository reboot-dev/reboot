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
