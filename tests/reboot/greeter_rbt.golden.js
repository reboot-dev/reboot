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
    reboot_native.importPy("tests.reboot.greeter_pb2_grpc", "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");
    reboot_native.importPy("tests.reboot.greeter_rbt", "H4sIAAAAAAAC/+y963bbRrYu+l9PgZZ/SMySme599u2oh9bZbtvp7bGSOEN22mPvLA8IIkEJMUVwEaQVdVbe/cxZF6AAVAEF3sTL59EdSUBVoS5zzpq3+upF8BRNR5fBMMmi23F88iJIsnQ2vwyyL8k0HCXi0WwxoiKT9D8i+uPhafqUl38Zz2bp7OUgHcZXp6PFZPByFs8Xs0n28ms0XsSnJ/TvRfAxpcrz4C6exLNoHgdcPHi8j2dxkDxM6XPxMJhED3EWPCR391xwHmT30TB9pBdUbhJEwSKLZ9RUNo0HySiholn6EItaQTIJ5vdxMgums3SeBtzpgH7exvw4yLhIlAXpJA7SUZAuZvlHqT3x2YvgfJTOgvi36GE6ji/pa7P4PxZxNqe24rHs2zC4WSyS4U0veIyD22QyDKLxWLWU0ed0W/TNaB5ENDRq8jYZDqn31MEz0bezIKKKcx45vaWJiCbBJP4az2hKxuNkGPd5uj7MqVQ0G+rW+yejWfoQhOFoQXMbh6F6QY3RtEbzJJ1kPMJ3P/z0/vqjLmW8FGtwzz0aj9PHZHIX/PDzh49BNJ3G0YzmSfSF52rGY6ZJ4t/Vxy+CLJkM+HWa5Q+ZDKInnuFkQgudDIPz21n6JZ70gkTW1ms9lIud8NJmD9F8cM9Lmszv5Tcm2ZymUazEOLmdRTNa2f6JGt4svk3TeZ+mJ6NRcLeLQcp3YfHuxPWiT58cfAnzDoXcIfrPw5Qmh0j4/PQv/f/R//Npj2fp1cePb3/8+O79j0zuwfxpSgsqyIsGIOgqu08XRBG3BuXq0RABLib/saDpIKrhERn/BJ2ex/27fnAjFpOa5gGpkb6aPN30+rRGRDqP4gODiAg+GIyj7D7Oym2J7zE7vBzGo2RCPXiIaXWGivTuo68G4fOH+8HPWVxuY7QYj59e5p1VpKs6qGZSdrEv+iZWKo6G+dpE2dNkkKTGiqgnusDtIhnPkxJh6ke6yCCdzOPf5l+jmVnKeKoLDqN5xFORxWZB46kueJemd+O4L3jtdjHqD+NsMEumc2Luop4sFOpCYVHI1cyvWToJiUkemLOd7RilXA3RJGfRXdzQiCqRNzCbDszS9Kf5KiT2mS+yvpx8kz3yd/KVlCBGFU15xhNrbVFZleUBGqX4T/0qNaun+XrMZ9Egvo0GX4y3+TNdiMWq8Z7/1K+myeDL2Jwu+aAsIGpSQb8ep3d9+r/xnv7i/+fdk0xo9E08qMifKEn73N90NKoLIHoZqpe6Gm+D8zQdl2WyeiYXIrod5DL8NuMZmUseNvnpdhCWX8q6RPbxPHnQAqj4u8QZ4lH+i70m/z6Mx/PIVjV/6a77T95SHVX5nSK6Mg+YDRCNPUzD6e1/aWCIUrnGFh9nvKHNspYGzWLW9vrxw3T+JFpRLb/lBw1N5hVCUdJCP7yK1g2M6Ue9LHWG+V41ozjROiqDU/PhzP85TgeR1k1YmQrFg8pyqWJh6b2l6wPWc6z95jeOCvEsLDF1pZZ4basqZX/mqKneWire094Uzxz11EtLNdK46Nk8ngye7FWNArbq1J/ZJBpnpGOQuhWPw4doQtJ75mhMFw8rxRubfiAdchw/skbZ0mpRsrHBeZR9oS5EpBe1tWgU9WiSbIKp0PBmfu0W5S2NT8e0TTzEk7m9rfy1pSqpRl+TgZMc8te2qsRLsV4WV/1SGWsji1tnXXplkw88IQ7pwK9sVYRyaq/CryxViHnEAthr6beWio/p7MuITAfH9/LXlqrRgrRVay1+46gg/pPOkn86F4ELhEYpV0NztkrYGmA9t7GxSklbg7dS4be3IV9WqmXxnDTeO8t39ZtKhQkZJ79m/ekTjWxSryVfh/K1FPeqork5vyEC/Uh/fyJLgX/+37LkV22JvdpWNO/SLRlff4nG0/voL2b1WzKv1GNb0b7uZGnDMmuFRQmXphxNnlr2cVVCN5A9mZNMf+kXD4OpkAjxrD+Ksjn9aZSjv0L5MlQvK+vBtdW+U59Brq1eWqotEnuNRSIszeEwYeOcdsMnqvUy/k2qg7TZKhsgE86CeLJ4INtTbOwksHlOHtLhguZK7fakHWV99dm7WRwTE5u6y/kJ23uv03E6u1C/kik3WwzmrybDD2T0xNfxYEHG8tf4B/nda+n78C6dTalMrIrPYiKocgvqkVnsTTQh2Zkusu/Yv5KVyr9ljxKT4z/YgySf/T2ef7pPx/GHebX1v/OIbU/Mz/3Au4yYglJJ87FZ/Jr0hcZJsRcoN1F+K59+iOevhr/Ggzm9KDVYfmE2RHM+feR+lssXTyuFW5bTYwk/UuHv08nd9WLC7pPv4urHWUzI3z4puV80IJwoPxNHBdo3Qab3LB7FM1KhYsOjVWb7aJr0DX+VRTBwifv5fOohM9qdAU2lcl3eVaBskNjkXzqtjaL0Xmo/rW9L1r6Lzdvey0ZOyOhltfSqYgj3pfLP787DkJ1AYSiW8FMcPKaTs3kgvHvss/3paRhN5slAmCMxy6CYLNzHe+FsvY+fhMtzMRkKX6aSGTQL/RNRPgtvYyKmMH8VDy8D2gJ/ob8+U7fo13P6sHDnBD8TKc0vBYVN6e+Tk59//PD2I5USL7jcyQmRl+T0ePYx/YnX5lx86FI/7QtZcRHk+4V67ZqovqrXMz9sfOU7ErbyO+K9Z2uST5KMdF+S9mRtqXpUfkwD+o6UYeaa4OW/lvstOyF96fJbZl/KIlWPX1WRD4t5KBeW33J2u1y41Avd8om7J5U5Kvri+b3yRCzbFyGqKpMintXnRDz2nBLZRLkXsr6zE7X5UN3w+5Z9NpbsxrvJdDGXu63szDyZc6ij7Ot9P5UqiWTL/5QMJ2mYhUOH4pHezjzrKLZjby5JM+ugOYjAYaQfWUWVfDUSD5JMxBFogzkXo7qQjfZksIWfmFXF00q1E+0Xl/XzP6mP8g/VPTHrUZLFwUcysYSmUtQVfvXT1xzSSeeFEMwlkNbrRICFqgenlapnfnRxdqnCUmeit2d6cNXm6DNMGsmM9l3xvTPq0FlRqueYQ17p0hTKIJvnDIra+zKB3Nm1z19O+qVJzJ96z2TRzr5MZ97jFeZUcnYYRrO7LAw50DwQWsJFUAtLseLw+x9eoqCYLt3yL4p7uBHxmwc32FoRJMSN8C++FGFrqJg8bi3/68QU9Va5WKz4N9/o5hSVlPaEkmHUojSUyrZskKWy7dt0qXh3jcHSM2unvTvioS6YJf0mw2+XNgt31hXqnbJ1t3MfaopCx43/IZ5HHJl1VikYmiu3qgBm/3w0gEPcvcw52PDmpZevNIX6ofc05q3kT3jVd3gudYc7zGeZjjezh61j86muqK2dfPjclv7DuvOY0+e78di8Wy37j61Ki+S1VWnfBGy1um9K7u42Dahr7zx2KkuFTtPmt2dY6nTevpw9bRjKsh2r7WldrVNRZ3abzGfR7Enn6Djrdhlz/0f6TzxUntjKJ2ecGjgPoxE38Jcwi0kSDp2fZZ9S63Zq6YLPrnoENo1lZtZr2ThmtkpW5RmuvvWf6Vq7hZNjafrcg4WqDrvDgi0/Lx7rbOXl0lpbS3ivt739/DULh91fPesgOqwgj3IzmthKJnxHzrc2XaNr8Ynq02WIz/Y5+0LwJ61vrKqiZaV9NcaPs2iSRSKAtITy2FJ7I3pkyzc3oVK2fHKFPnsoms11N6BzNn9w/epn8/fW0F0opZ5zDf0U+in0U+in0E+hn65TP23edfxV1aePaZ4l+Vpmg3orqg11pTriTE/ri6MmPkpewzecamnLZ6uqUsMnlu6hlxLqrrnM9NnUOPcXXDrnOubOV8ls7l1JxXSpXu4myorXEqLKznXuDy7Hc2/VuYVVeM/RxkZ40PGtTfCi41Mr97gzb9pb2ASP2r+0AV61f2htve3Mu/amtsDD9g9787I13dyPhRuqrotzGz6xJoZt+MKy/fNhT3fFFudNQ8124nfX7ezBaR2Bx1BX7XDNh5ON43gqT1ZJzTNzekaSybzdMeL+vI9XpN6bkkFXf+1tzVlazt/RwHbCkmuYvMKiqw+kgzlHI92MNedeOJsxZBmDOFNRe2wX5u5pWlKGf5ol9HA5IV6uuxkpXv7GRsR4+RNL97C7IC/VXJN+1fCF9ehVDR9YuXc+elRDE5vRnxo+6J3NWz4S6ZfVa6vjk9AazzzSaW2NL5nfG88qGa22tjt3ySfT11KjbYIsVdqzbi2VumcAOzvbNJyl++bBSbaqG+Eg24d8Oee7KBnz+eK3vw1ioYx5co+z3pp2KWf769mhnM0v1TMPXnLVWs+u5Gp9LTuSq/GVeuXBP67qG+Eh18e68tEriXzRkYsqtdbMQ5XW18tBlcaX6FUH7inXWS/vlNteK+eUm16hRx24plx5ozxT/pQvx1TxElpYpVq8RRGpFm+ny2qN7tqavYuuAXTpkQeLVAqvhzcqja6FKSptLtMHDzao1NoI/Ve+4Uv4NbwXL/p31FrTVuFofT1bhaPxJXrlwQf2Oi3Swl6plTTt1TqbLk1dbh7WCj2seWtbzyqWfbSloXWooSnIu0oWj0cdiisIqg41buNoRishIM86DYUXskMFxnLtMu754rZDcQOcsUPKpITva+iXDzCFnch8fPKbOmC5K153+8ysdNKy6mZ35RBJjKpyylptXVqS1Aycq32aVdXxDUyqQvYqz6p82GFaTYCx/ZpX2fO1TyyL+HIwjh74h9+49t5NJvd67ROpNr/SXGrARt/p1G3s3Yyqjq99Uk39oDSz5gvv6S21tndzbPZ+A/KV+1ORrgLU3l+2ihb2ULJylbVPKGucpekUtwv4TqaovXdTyb1e/wZFunh5g6IH/hsU196/DYp6vfaJNKyU0nya2PO+02q2tXMHlNpm1+j82k8paaOuQrHyYQeqVa3s3dzqnu8C8NrygDNehp39OIicD3kARPqE/Awae2tK6ZfNKS9dux5vzc1inVci3I5HfiqsrRmt6HFLGnHcX3WztVhSa7hZ84GXtmKfOrGry4kTd/G0b9O2dsSWxq2I24Dadyjr1LM0F1NPv/gLZ1tTpujiFs1rQfwEkr2DimllJ+UfVre7nf298ZeaQL/bgJia6rYd826q6wF+1FR9iQP17SPxGvTSHfeBb2qoudxke+ImNVTufrS+dRA+w125zxZv/5In5KsfaQdZauian4+4ftK66/lq/1PV9rsKnvsYbsMUms7ktZ2hrn5rU7pR60la8/ysPjVrhVdpmCHfnaHpIouWjaGpaouoaqraLl2banffFdqH4TPgZXvtsSU0VFxqmv2Ea0PdzvtB6wg8hrpqhz3SJxpa2EgqRcP3fNnX+3KetisifNtpuyrBtx2Pyxx8m1rizoluo+08SWsZnM8lFp6trL5onndOeDbU/VaMTgPtOj1rHVdN6RzG0/n9SmcAfT/vo1iK3pTUSvHEW6mU9XfOr+s7RYXiKAayCyf9SitiUwdlT7kR8Zv9OgDP8TfuKycvGv4F38d30eApuLv+6XXwIb9fs6mKuHOeJjiLBcQKz/UsHsdfo8k8OE8n46deMEpnQXFZp7i9PHmYjtW1n8G4+CY1pgrydexRcC2DZMoV1g/eCfJPZvkX5mkwGCfUTtaXzPxD9CWWg/j7bDpQQ4j4/ncxAS+CV+b38m7J9R9EfBfWLV97NYuDbBoPklEy4B5PghsucXOhWrmN5c3ttray4DzKgvwi+uD2SVzpJ8rcCDYY3KhmpuPFXTLpBcNUEEx2L65/nTzRiB8eaDJvI3U7fBakc75wVXYlvWUQm5u+yiKTnxXXgV6KgUgJ2XAlat+YmEtNskmWLW7Fx85LbV403zrWfz1OB180sZgiQlKv+VosRKnx3spf54v9fpD3yzZ0ol7K1Rcp2cSthFK0jU5/nnyZpI+TBso5+73U0h9np8xqcuVqE+C5MGoUp6enRLTyOT+WDPRAdE6cQHI1zbJEPE6D+zSrMhS3cFNaoZuACEsyVp/aPlH714iEEd9eFobK2S1bCeVl8nUa+6UDUXw2FoQb74fOxkkAOt8VXVWPxVV2meivoPhxks1/cdyTq2f2R6ryuUYfPrXOyzuTGOFZ77PRK+Hb5XqiY0W/eMMtPlmWsoXUGIqb+O6jrywCWD1IB4kQIPIqPm63X+13oQVwB0bJOA6L+w+LDjjuVi2K9r+jqm/yP2vz445Yvf3w+vrdTx/fXxfdkLvenDtfdGG+IIn/S6ubykI9hSLiUK/Kj19H4zHzyS+l3f4XKTPzjVt8hm/7/SCuhf18USotplX/8fmz+PWzScOK96/ayPm8Z2BODsN5qq+hfYjn9+mQLyVqnAiuVJqMoonqEunvXli/lAsjhyDcvkyyyO0tiSbLlw9TQhkDhaDajKCy0NLRyyvLnCwvtprtFWUg6M8EPyTD4Th+JDV6zVZLbrDQkhWGiX7Plgk16bJNLoJYHL4VbbItMIrIIhYyM0sfYl1M3K0bRuMsDYNsMbgvrKEZmzcvgu+oOpmoAoaLjJXxmFp+FGZLwMZIRBL4ju0VkbZJn7994vtt1d/yyvuBuHqZrX9qL1rQHM+Sf8pntF6DL1mfJiZWVYj/vibEe2SciLL0cRrBgyx+Hvfv+hfUyo02z2SRTFDjTa9/wlJbdjYUHZNJB2xHkxlLpDQ60+9f/q7InPMA+vyf/3re++NMb1r5tS9yMopFtmxbusksfMiL9YsaJOfru4oj4fqbixoH5W65v5FlVmf4aDodqyk2j57UZParoty7YfkrRPpNNSX7lyoJYf4QTaI77p9lIzcLZPLi4R/kX0Ur03E0EPQdSmK0NZSX6f+kf3stChfNDMg+ncTjpu4UC1Qp3A9fywe1zsm7sgcRUWhzi0bB/kf+/TX/ajQkCFBygtE7h4A2PsGkHZZrZ/2P/Pc/1J+GRI5HIxIrobpTm5q0dVoxTdZ/K0r/Iy98YUjIaFgceYqyp8mANoC3X2OLPy5bTOPZea9fp+k6XV6V/yxvJTkNXuW/VQqUlYfisvE6rXJJdhFadBPFRme9+tdztYmaLm+Kxp7aqAad2j71g9hQstPKFys7aZUPrqoPysUrJHxV+btcuEYXV7Un5Qp8bTtnzLEbKCwupH/IrsbRw+0wuiwzf3/MV7DPSyUvTG9mWcMtaQXyV0P1ezUJtPdSuGppU9ClzkgFJKr/ShqflM+8rcXEaUoBTOZGO/dRJmlq+Ff6GQc3FWHeD3Mnae+mX+mifpWZrtdKA8rxWhmbOS952pX6u1xWyoxhkk2lymIl6KqIKYpLOfMm/3tpxtNNXole6b/KZQz5dmX8Xi4kxMaV+G+FWFNWYph5qeqVZaL6pRJW0nkRCM+zoAdhDRFtiKWX+tpZlh/Gy1Kl4XD5/IxeJrSV29hokBQMoiZigX9SMZroVDQ+SEmTYi2pZE2ITqumpAy6fVKqYihvMC3oRJiCDoNCBSH6OtVHEFFpss7k5btnvte4l6f6TBDpmee9rpW6Jkz5WbfLTSotObDPV23UAu181npyvrGVCrhs99Ys6IZny6GKNrcsQdw6968EZHXWEeyr0lYN0KdzbyrwJp3ra3iIzhUrCa5nnaEDqpxii4KdLZm0WGnblrhxtlz+S6Xl1jje2Rqi5MU3/zClN9FXbvax0Z2MON50wSE2vlCBrdvRLH0gW3K2GMcikhkPuOHZU9+ID490hbBoLOQaYTIK8xqVvbAomcrCTgXcQ+sTGnnRJNlU+e/Bf3Yrf70Yx2WdsNj57IG0hsYuT0pNvQjejbT5rHpHypKc20wb2MOL3H1FOx/NbrQYzyvNGA083ie04ZL5nz5mYgGn08ItQK0Xb5JJpZVh/DV4SIdxcM7x/3F6l0kPBJnGLN0y4bGNx1PRkUVm6EqyPu14vE9TF2KpBDwJp8VDkmXCMWI6FHr9UmXuaI0CtLvgsrbiakI85v6NnK9iCc5rjRVbMsnuC+vrJAt5vEKpuPqONL24Xq53Uh2ReY9KbXAX3cmw55wI1fu2UYaKeq7q3WkbjvqQpWJFuTZI8WoJOZA7zYoqhtuxpGtKDavkwKJ6le5s0qinATo6X6533mPGKz9zqM8JW1RMapnKMHgKYo4zZ0GUySwZnSKTSQaTWQkyLE0PHkzVOWEdefwUvGTGHaZS6aY6wjlPjxayTnCjtvqb4HFG4oIlv5Qij8l4bFpr6XgoKtC63CUsT0o96gfvJ7q3j/HZeEy7AyfPpNJ5yGKB0xSMBtmPqb+ZyeajcpvCeox0tgW1Jtq/4KFI36bRWvQ1TdiUmM+eWNwIE0haGdpyoQHN7+vNVWkmfx3K0bAZoX0PDnNChG4YNMZiKzT4G/p1Zau+vblznkQKAlcXCQlnjb6Lxm4YOtsmvq+zX1k1KDnyVchO/nHpCGdYgk/tcYbyAOuRhirjFt2ocqZwremIEFHGXHdaGMezeHTZ7OO6jkvRK50Uxq2+m3MWUDrzNUSLCTg9PX2ngw7S406m9k3hye7rvvZuRLC0gnKhYz0DIUK1u7E8J/ekshJbXtUHp970/7f8Wd9rKo4N8akm70bhOaTpvMp/KxfqbdHTKLn86lTN4mnVVSKmS2oDDc7bazE/r6vAIobEl7QlpJLN40ICJY4eiFzCmWgqNM4chl/iytZZQzCpe/P6YWjMW3hhV8GvmNmM/vLeI6plZQVE9p4ltDzqeBFU+tfjRD1bTf73JLIwxdsqo9FoB/OQLBVTOyiHXxQN2nivQp4XJ+VVvSwOdBupxyTjuZeB+KEc6G1cK4PBzRpFG0tflKL+IsL188/v3nz+XGb2a6F+iT2/gF4iluc4H292Z8rDFtyRrcfJkeZde1L0Gn40YcRxU9rEyMGj5DScVZy2BTbGdChULrGpCtlBigltg6MRafyTed61vqnUcMiQ+0ka4blY2f6UKCO7Txe0/jJRYCwckkE8yRYi35bbn8sQbEkkiyiqolOWe19jFTWlx/NZNBolg77BXCKHWnBA1VHfV/ELqh1Sj6o5ypqEmoSWLmMRV73g6srgPMG4xYz8+P7j28uA48jBYkIKcCCZW5GnDPRmi+lUaAQl6f0i+FFpVMQlyURob0QHi2kgLK5MaI8q5ivaHyo3a0oviokZR7TQrZCEngRMgreUYBDd0X58xxkfVWlF3GWndQ7lFFZ1Mgp0PsFV4Wit2s2TrxGRM5GcGHmiFD2lOUvS4qRZQV6C+IaCSqoWr1aRbxdzOWPz+1m6uLsnYUp2cJGme810W6nMWiWNnGPzUl2ufvc2JlYs2pBh/kojTL4iwqMHTWs35HgPbVylomSO85agbPH6nnv693Qucg84e0CIztzZLrVeDtmUviR12NNaS6NTqTUFZ7/Lkn+IJHld20x9yLPP662c/vvE8vBNGjylC8X1we0sfcw4Sza6DdIpTZbQ9ol2x8wPxDcZazaWZkTMiUVBwZ8XbGNJa6GQR8Z7dnwQ59wJG+T/K7fZK5u6wpgq7StCG42kjt7/8JTN4welsZ87vVG38/DrX6Lx9D76S1/ZEawzv5PTKKf4vFdXhBSDXVkt+Oa1aRqV3G6FCFGGtxSdIrWd7TNm/iJKPS6zoYpYnNgUDh9l0lQo76v78lZUOkOtU6Opv19RsbO4TQTrWUYxiwY839k0mpw75oGn4Gp0+rtOoKnMzh/nZ5VXCRFD79QyrfQR2dqpGPh5T+3DtH2On2w15J49EapnQGRPzPogAphZ8NMTTSExGwtMFnS8CB9Evl2/1sxUlNXm9ODq42xh8ZuNY+rGlXuOPtLP+Hsu1H/984eP7394e12Z8kvXQsqko6sgeowSpQiQbv10G0s3zJP079h9ZVVqrRBPm79MROi5ZKil8JVfuO+819xO/6doJk88fpjPeCcoaW6WXrTYGAUl2OfBalUsYV3UrQxzPfKn9k4UzCsJudGZ4eJubzlkdvXKJCV3UbUIV6Wlshe3yCWnheVtaWUlU8s9Irdy1qdBxpPhea1hd2u0l1DBS5ksOUxjeZCOdE4+pEQaKqnzrKEP0qlwyA0WM96Ux0+XDS1yFsj9fD7NLr/99o5odnHLeQffypV+OYy/fsuKKylt3/KZoDj79r/89//nv/edDf4vzxxASYWzxSQcLSYiJB7OH9nfN091Ak4cyoSczD27hQFLDUkX1LlO3yEjXtW/FBfdN2U0V3Rs93yZnnlDxqlPN1Zr5e3ajtRezIP6zX/1qbmqP2pupoE6czNZy39jURqqkd5Tso+CPxX4X80LITUsA12sgdt6jS2VO1DBH7P9i8eenROeneaOLSU8BuM4MgM1Vf2xnGACYw7GHIy5ZzPmnIlf4EvwJfjyGfnSmjt5IE4X++iO0AljnQg4ZVZyytiJy8dJM5/xF8Mci0YTmOG3aUljtXhs2hqFE6fNieMrLbbh1GlbTfh5jtrPY5fnz+L3sXdl636g5RjmuV1Djn0ZrqLtuopazv4cpDZcHeXRa8WVCYF2vEbtuEpsS2nJsWpkM+qyq3Xozd305na58iz6s2t5oUhDkXZuATugUFe79PyKdTdO2i0Nu7bHQ9PesqZtPRd/KAq2bXDHqFdb5gHq9GrqtI20vLRoVlXHKZ/nkVXDEdf1SRFswKSwKdTNH4Ia3apG+0mPrWjPzWsJnfm4dWabeH8eVdnWk+1ryMtwy7PrxdY9Gurws6rDGswJSVFIikJS1POdPCuDox3KCbTSqI7xJJo5AbBHVzuRViImr5Np8Tx85CqhPr3efkbNgj1oO6tmbxkWZ+uptRaJsA1T07F4MDGP+xxbSVQ/z3m2Uhe2f66tC188tzFZ2VlhRW7XirQA8B6Izlof2RHqrbVJgO66ku5aJyof/XVEtUKmjDDW9VZKQGpoD5prm+bqIxe2ob02LCI02KPWYOtC+1m02Ho3tq7JduaR59ZmLfstNNrn0WhzjOID02f1uI5Ym9UhBeiy69BlNUF102RVkGdNemylNWixvlqsWxpsV4etLCA0WGiwhqB+Vv3VGYDenvbqxR27orvmuys01+1qrsW1FkjiQRIPknieLYmndrUf+BH8CH58Nn50XCwJrgRXgiufjSvtl8oeiLfVOrgjdLna5gF+15X8rlbS8nG+8sVLNEBVUztIfLJhG+5ztrhlm78D32ybb9ZTdmzDQdu8lPDSHrWX1irbn8VVa+3J1v21yzDLcztt7fszPLfb9dzmIDGvJkMYqzBWYaw+v7FaFRmgP9CffW1Y3o3SxcSP/H6esMVyH92OY2nElsjx4Wn61LdfEP2wKB8HetYbor1VuO3f5ly6Q9jjel3lVPIwg2V1u+FbbqWTkftC3ZH8GLOJlj4Qu/DUsPyYE1mIdScGUls87bqx3qUrzUjZ83hPk/jImzfLoxu9YLPpQDi1Ftlr2tr7P//46h+v3n3/6m/fv70htqy0JLwtasG4DyT8kgE3SsYP2WH8Qn6srCZUWpmnJGgmZIKQyjb48u04zTKx7ulkIu7gSeZP5T3+RaWBj+/fvD+/jSf3vUvqyNckS9RF2cN4kAjZROtLvYpJVAnLihYhSyf1bvB8BjclPurdSFJiW07clx2kLJl4kic8h7O40sxjTIRGSgypZqyQqwk4j/t3/QstSS+Incm4/rV2lXdFY7oI4vmgVx489zG8pYlKRyOrY1K96/9N/qwQ4IvgVXBj3nUklLFrXr4bWs8nkidfSD/k2RBrWqmcPDzEw4QmZvwknWs8rSQnxa3bge6WUBH5em3SkiesUVYnSZLLIJrNklhyPDFyILaLOBglM2KwaD7n1L4L8ShjL+xjVO3Nzc98VTh3PomHr2liboT9XZ4w1alQdJMYPPiOjN5yh0gvJepjv9+lxcn4id2KX3gjHC3G45cjUpLvqKG7659ei9W4CDJ1o3gyKt26bmnrMcqChyQjtmRV9zzpx33zTnfewHmfKN3mbmlG3u8eS5OzdxEkrD0Q7U7Sx+Au5cUTTJnc3c8l1fbZVWppiPT6mDiM6LTwAsimFEtS5yZ3WTBOaAKkbWlpRdufvH3TetN0UAfn932Lk07cPm+/SV4Pns0rbvXvi4jodM6Xu98+BTdqX7rpW/zSi9sGgSyFWtl79oGqnLt9fbTxkvAZ595DPuuqn81Tt89AVBYT/kDsGw7GCf3oR8MhbWhZSJMSEtels2ang312Lrzq6KO4I3dxu9XcO2l/IsTjlZhutcnZB6LdguXNzt4j2nYjIp1I+yX781SsV6hf2HQvK1j25UmrH4gHUCsl7c3A3ABZjXyVpNfTwVvWCNktKVRD+yeI68XbPu9y5z1WIdp3U7ejIRPlc/+LFvA0JfJNKDS+Pu9KIQ/onP/jdoVIazuUEvcqaCY9wXo0HtUHYkjxJB43uE1MZbquhSv9W6rWoei0UgqNEQ1prZNxdu7lYltk7T6yX1q0e/sG+LnNa9b9Dc0laSAT6jfths3jMxfqwmu2Ow2uQSA0O71oCO0Lk3Nv8W05kpA3dk1HtDm0L7ExDf2iiT+RXn7WvDyXvr0s1CYWMIMx70q8cQjB3T5Wo6ULr8LWSdGhxMUiGfZ//vndG78Pu6fIq3qvvce91amh0kFWtkkqtlZbiq77P12//fDzD2/fhG/evnrz/fvX/7YqlbS5cGz/TkVfhJmqrMfgNh5ECzJhk3lm8Y1YGzEIhXlmSlrDgvRtsmOi4TgdfImHl55NjU5/l3uSFq29P06fa+XJEnTvDx+vX/344dXrj+/e/xh++N/vf/7+TXj99uP1/6H/vvrw/scP4ad3H+nxx/Bvr17/2/vvvmvtASugrEWW1f5VaaJmRLCx0FirPZogepvrJdpuO++tEKDo1BwHtpIJDePEHoO8jgWkfjInW0XYE4KipKUjjA9psszvZ/Hjhdjp5sK+idjuHpMhMVR60cmG1ZySwqItCPdEScehdolKdtVqivicbKxltxZl3Huq9BpwR06W6oPQgdmc559iGt39Ea9PWvvhRhPkbiB25Ou7F/4h6W+Ll3Xe5/5hOfebcdwLD33Je0/cTCbcWnz4h+K/Xy5UVMsddl8ZnsXzMNLvfPzHZlt2L7K1STiT4UyGMxnOZDiT4UzeM2eyueM1u5StOx88y/Asw7MMzzI8y/AsH7JnuWRkwr8M/zL8y7vvXzaZ9nm9zM6ebNPXbIpat8/M3Nc24D9rbR6+NPjS4EuDLw2+NPjS9syX5thgm91qrRsiXGxwscHFBhcbXGxwsR2yi81lnsLbBm8bvG27721z8O/zOt58OrVdH9zTxzQHE1Fwccj/fJb8T/taIB90z/NBy8v69jeJtQVW2x1Wq64JWG7fWY5o4/t0cne9mDBNfRfPB/fgtOfhNNtSgMEOi8E+zRJGN64EbjlIOqZCDCLJpcJHUWzpC7zaGkSkFpFaRGoRqUWkFpHafYvU2vbTljhty26IMC3CtAjTIkyLMC3CtAcdprWaogjSIkiLIO0eBGlt3PvMIdrWLm0VkCeef7pPx7G4XQw+7OcB5imtAZzXe+681teOvxWESPMAtnoWtqqvA1jrQFhLdReM9ayMpVcBbLXnbPUpnX0ZjdPHCj/t6rU3xaDzjjN/SMMw5+uvib776JypZZI+9nzn4000IaZKF9l3fEdOVpmWoX4bjsRrn4PClRbtZ4VdDSPwjMAzAs8IPCPwjMDzngWeK/tec8jZtf8h1IxQM0LNCDUj1IxQ8yGHmqtmJ4LMCDIjyLz7QeYK3z5veLmpM9sMLH8gAyam9V/MMjJO1S3M1fsquAyxtCqk72z2Qt6zNe+4wqL5K/CuwbsG7xq8a/Cuwbu2Z9416ybYcqtF82YIVxtcbXC1wdUGVxtcbYfsarNbp3C4weEGh9seXHRh495nvvGitUvbdL5dk/Bp8b0hWXY7ybLWpUDG7J5nzObYbq8mQx9P90CXD4k0wxX83q0ftvvAO30fHnF4xOERh0ccHnF4xPfMI966PTZ7xzttk/CVw1cOXzl85fCVw1d+yL7ydlsXfnP4zeE3332/eSsnP68PvVv3NutPr1LfFl3HzR5K+IufGX3AtUTMjKN0Man5kE+ki4E4nITFiKYlm7KDsugym+dFB+ZR9uXS4kDj51n/I/33rXB4FDW+KX5lF1eo/B5EXFR5rF1LZqFwnKbTkIHHxKLYPpdM5KUlmfxwqLtNxPZ+8j1Vf6drs4cruh3HbIyNo4fbYRTkLUuXYvGlMKMWhosx9Y05Ts17L3j5r926wNNwHWdTkhjx+5m0SAuGPT09faPLSj+eaIAdUNIDGgeLyZgWODgrTZjgsyyemy5lEkjxBe/rMj41iIgof10QV8eTbDGLs2KP4G8ExP4L4f6Of0vY73NSWKJiZ4mUD3i0mEjdR3i1CtSKb26fvgmqw/2r9qTlrTGxkbJFhCPdHzRVaa1an+ahkGm0c5y9JvnEwySLngv3JfGGQhKdVLaZMilZ3Gumf1uXC85Eu0ryifkcpDMOEAbzp2lc3x6VO+PcHfAQXdZrTZwqCacahPg5i6WIHSdklykJy75zUZ2k0SR+DLIBibbCL/oYC9iQRVb1A4u4KFM0T4zyMt4M5O09N0LrupFOx+yGKeNhMZ4nUyp+Szotk1zVOz2Ray7CDee0dNT2k4x0zEXolb2beSOCjHiysp7YOdJFNd55n8yFDz8KHp6mT1VVRXf+LBOtaD2B9RuiSHb8nZR9n1owzRaTUM52XZqqwdsEhXqV9TUYi7rmqC5Sv6k/0i7ayV2oZtQltBzKq+y+2GGFlzOUrkbtIeXJDB9Vx+z6wcDVXS2M7W9qQvSq9sResT7kq/oji4uQnXYcghnHc4fC5/QZSkaTHJRroedKd9DL5vY9V2bqqnHGTM1QuHx1cb00zV7gvosCzX+q51o0CFnD4cqf+KKXc0WiRPw0oX0S2PN26SIduoEpvHotroXbmNh2Fs7TL/HkKsw3KyK9u2QgH4dhcxNkXz1MaV+YDJ6uLNtf8bb/rvi93TAlaoqyq9EZb5LB7zW3jIjiXomhCvag5+Inl+j9cdbiM2xYO7f5pWw1Rb3ngquCc02SSqT3GmhXbhKVCtbyZe+3EA+kNL5mdyVvsG/dbm8pXElDZnEp3cuRlMaFvTfQ7XDsJ5KbtsPo09YaS6XazpxInSbM2zt3rEezDcxOk/G81QuuPeEX3h6rzur2Eu6vfE3OfZx4HEdRFmlvWbe2kxTlPPZa5loQoSy6gt9C2DUepOuOPfBOoB5dNpu8odAAroLR2e+6jVDfhiVt5n4YCn9xGNJvDymr5mH4R9+r+H+QpssaElU4685RhZeFGSubxoNklNDgZIZGQ3uiR8EoGceNjGdMADWplAP9lVDR4e1TqGzp0NCFObB6flbaNMpxWrVvnF0Ev3z2ZlHBgXrhTHJ+VoKV5FhWp0sxxia1UEalxUutB9pFgwovWHY5HWhRcXS3ZCnHna/Ep31j0YUyYrGrWdUWQU3SA0ZlOZzXc4gcx2NZjRsW5GTNhzE++5F+/ZHK2UnurOcMNBMpXmmb7qJJuRVfu1pFd9fK8JVbI34RkP41je7Y3hIzECgtXGZfiCeCHZX95WjkZjGZJ2POcOLdNQvOGcjxptJBFSUS7rbka0yWqq7VczTLll7MOprKpBK1+CvCKBS2Ij2+Lz7vaCeZfE0lxfUd8fm8SyVT5Mpinlz4tSAWryW7Q4sxltAG+YW+ZNtrSnw8E6S4V24D0WN4DbbjNRCTDacBnAbP5TRwEKDFZ6DkwgouA7OFrXoMYF/DvoZ9Dfv6GOxrqXAei3nt2L5gXT+/da0IEcY1jOtNGdcf4vmr4a/iTNl+hebNjsPU3o6pbc45LG5Y3M9lcTfTocXwLguLFexvS0MI3CNwD8cCHAtwLMCx0OJYKCnbx+JfaN6s4WZ4fjdDmSzhbYC3YVPeBvPQKRwPcDz4Oh4cdAMfBHwQz+WD8CZJizvCUReeCXgm4JmAZwKeCXgmtuyZcCnmx+Kk8N7N4a94fn+Fk1jhuoDrYnOui6ePaQ4So9ZgFx0XEhCwr/e5PiPGPgkF5S3/BlfFpl0VFjqBowKOiudzVHgRpNVNYanp46RoEUE4uAArHlY8rHhY8Wu34m066vHY8F4bHSz4XbDgrYQK+x32+3bs97e/SS0SdjzseB87vkIvsOdhz++GPd9KmK12faUF2Pew72Hfw76Hfb/r9n1Vhz1OO791A4S9v2v2fo1wYffD7t+Y3U/k+n06ubteTPjylO9iUoVg7sPcr5r7FjKBlQ8r/9msfC96tBn3loorHSxoaBCGPgx9GPow9GHor9vQtymtR2Pfe219MOt3wKy3kimseVjzW7LmP83YyoA5D3O+2ZyXdAJ7Hvb8jtjzLoJsN+hlzX2L0gsZDHQAuCPgjoA7Au6I/XZHKK37SP0Rrq0bDomdc0hoQoVHAh6Jjd1OGM8/3afjWFDv/t1SSJIMrojN3k9oEghcEHBBPJcLooUQLa6HUo3V7i20tITsAZjrMNdhrsNcX/f9hSWV9GjuMWze3mCe78B9hmXChFkOs3xTZvl3UTL+RLbLW7Ft0diRJADLvGKZ12gE1jms8+eyzj2I0WKh12rh+D7sctjlsMthl++eXV7XSY/FNvfY3GCfP799biFQ2Oiw0Tdto6sdChY6LHSHhe7UIGGfwz7frn3uZcxUrHNVB7Y5bHPY5rDNYZvvrm2uddFjs8ydcgB2+e7Y5TlxwiqHVb4pq1zP/l7lsutOXyuFEob5Zg3zT07TFRb5wVnkcroa1tx7kiqGxPKGb3PzS05cu70BsxdmL8xemL0HY/bmyt7h2Lvmo/9lwRlRTtAsfEiGw3H8SEpV/yF6uiUjkBSb0WIiLhYP5488mTQ2rbTqfcNDK2rQI1xqzMX6FSnLcjr3/RfBJ1YzH+OzWWz0MVB9pBeOatN4lqTDhDeQp2CePMSkhlYV53F656gtSkWBnq7gIbm7nwe3cXC/mNxdBEk/7l84uegFa+Sz4J6lSHC7uOs79bLCOtf7qHJo8Ev3HtCs6HZWejaildif6oW4EtslSxGWXPWvCTEf/DeeyyymQQwza3OP9ySkgo+zRcOWMBQyYRpPhkw3WnWsTDs/a57JX3hJPjdPpBrdlfq5jCL3Inh9Hw+E/Caa/xqLNocBt8ajHdw31MzI1BoPheUbpIPBYqZamTUJ+zpPNQr9cTw55xntsRH+52a5TNtYPLOuLlugmhSUecf00NgaMSubQyQWGUGhXUEanX2YJ+NxwEvLoxvRRqjMarXX5FIqOGtt7YxNcbVBBNGIXTiz+OVMwjmwnZ67EPQsnq2gQ+m5+Zerdh4wWT2ZLOI2JV+ZK7xjndd7MUomLDHtC6vYVbTARHDesDGLQlL7Pm8i9x9j6feKBvOFkNWSP1l5ERKSRHYyaqgvHRAJ05TS72iTZAFPHTybB6RoBFFDdUVOkrqGhRPCaCrKGupP4q+CFOazhH4bXpC8nxdfH7BjhNSRxbx5BMbnbuNBRNuH2vF4loVroKW+mG33WjRZ1YUCxI241V3Rw+ZmpsTxLW59D03k2B37YmPT00Sd6oYct7vBgkKlR5QAUYJNRQneRBPqbrrIvkvi8TBD7h5CBBVjuEIhiBQgd++5cvdaSdGSu1epsxL6jb0tAPACgBdhGoRpEKZBmKYlTFPVto8lO7F140Z24vM7HGrECb8D/A6b8jt8mKczYpPBYpZRx36Is4y6v1epitYRIG9xO04J6+TDNQHXxHO5JjwJ0uKgcMiRFdwUTS3CWQFnBZwVcFbAWQFnRYuzwq6iH4vLwnNDh+Pi+R0XDkKF+wLui025L66JV/fae2EbAJwX23Fe2OYevgv4Lp7Ld+FHjxbXhV2IrOC5aGgQiEkw82Hmw8yHmb9mM9+qyh6Lle+39cHIf34j306msPFh42/KxqdZz+azxWD+ajLc/3SF1tHA+t+O9d+6EHAFwBXwXK6AJYjT4hfwkDUrOAl8W0eqA1Id4AOBDwQ+EPhAWnwg7ar+sThEllAA4B15fu+IBwHDVQJXyfpcJSeG/yI3sCepoIFMgEcJe1x9tZgK+vZsHpIkzz0dV8GpeHiq8ZJKDhOJbHaq/zw9KUmz4JpX4yEWamB5Bkanr+ZzhoqQa/d77cN/yK3r7PeqB+ePs+C00lQ6Cc40J0pcsWCYxtLqj38jm7+ooKbmhbaF9FY4ULyayU2k8AmE4WshO4vu84IVK+Bl/M8SaXaVmVMs9GXgtKRUF4sKylZqqCL7qi2sE4tzoRkZsRe8/NccUEw29laVOnFa0mIctLvH3OhAizraWqPh8FwbuJKqSccuVWUqH4ZqIvR3hcAlwtPX++RmqCh3EZA6n0ySeULmn3hyVfuI0EEcver1qntsbvvXmdREZi5YtEoRnf0AstvG4F2iRKzjlfrZzvUnFmv/Yyonz/ya7EBlIlz7nwS+E3+cn7g8J/UB/NJKpLJmBYWwPCYx8wo2lCWKolktJVinEFtJvWMSYO9K/qj3zjD3cxHvXDJD+lydlbnjzMdt5+XDaiScnk0ttPKpRQEUxOYgM71+V+6FFHtG4agSf9ZLEYuNeWclGltMmWCMKrVXrsHZbLKyKJWj/Ee+/NdxTRyxDVQAQAYFqVwEvy6yeUDau9z9plrfKasCZZNxZTPxRfBOml/SfaELBcNFLJACpakmnO3CTJK9PKlZYUo145Z0EwkJNVLJg3SUF+CB3/w8+TJJHyc3lUa01z8KBuOElCmhVM1n0SSbknowmY+fZF/61RiJe/AkivPun6uHFjtMagPqfaVX36d3pGE+BaQC3pOmOSYqkSWZcAdfuIMD2stpqh6iL2RdVqcmjrKEppV1mmF8u7i7YxdluUylxo/vP769LGANSUTk0KLaYqbFZB8UI27exgpOsR7TuJkubsm2+VZOzLc0Md/muMff1rxQ06cbvWKVAIScFyFhLyug/e8FjmI0/oVfflZIs87axaaphMIry5Szfy3jjrBHSC/aha8zqmeLkf2YimnkqZdRHY458ARN0mF8w7NJsx2NqUvDJzHfIupT18CrtBZy/V+zcPpEAnjSl5Cw4XRGsxwK6hDE4QLu9MVYHZ3+rEkvOKdeW008Le97gfbW/PHXEtfRIM8U4539++Q0+Bfn987O+r+ShMq96jyGWxpMn2j4IZqHOXxmzlG+oMSSz1ZyK7a4EdUIXV7BcrhURNyGxJxEE7ziAfEo6+REDI8RyZ956rTSBuPFUAq7sylNDe3PfW2syN1YK/qkHDgaYbBU6gFvPJNI2hl3shs8zzJ8+CWZsPh0tHBqSKDTvyp85mR+RobTYsqY2PF4OlqMuT1HC7lEumB5IoyS+LdpSouUsBvpgaSu2Jqc8yBJwmmuPkj3wdXodLEUCZ+26JR2ByuxqZ14SrKIdlgBi+2YHCYEmxwy26hTeM8FrL4uEbR+MdRFFD2HOFqnSHJHBJQaRETxGGW87UbEHIMxKR7DIn4/aUDAzzUgYiQaXK7kOPw4q0vC1aXh2iTi2qTieiTjeqTjGiSkp5TcjKSseNraTAef4CgxCc/flHTq+RMRBo1KzB8n9lz/9JqV4Nu4CIv+VU43E9Aii3muK/TDbENCipbTWCt/a0dCuxZBKTWH/TcxJ/KI/jMrDsWfMshTHc+nmLomodCzOJYCQMWh5E0YwjNJFoQCns8dNdRn8d1Ke6oLiswTtgtS6kA8pQ9MaCXJ+gp0f9WdFePkgSiLbKS//PnPldZkDd1o1g8+xJK9RJ0s4C2iOqIguJ/Pp9nlt9/mkLfD+Cv/cTeLHph7Xt4tiMcz+f6lbOrbk5PN7DA+O0u3DcVO6aPT34UHyFzsXj8MVUjy97PL4Cz4F6KzWbmIvmah9qIX/GvwZ+k/Pjujzcv+2dOPTDH0P01FAk9eJQSU1r1YdrWcFwWRMIeQUJpKs5nq5ktHW6P9uzZKWG7lXXuv/55bnrcWlW3FnW/5HW9ZCWuOzkkHz0kL66aHZufX36IsfptfoBBlxW0KVUm0DpV3fwVRPi0OKVS8N0VQ8dRT/nTXqf352ujMrjL1yurrymrraurqamrqCuppi1q6rLB0kv5l8Hv++A+XiLHeh+MM383ih/RrbIngieqWS994jtlpmd/ulk2jyflJSRuk2WOvPCm0N1Zf/k0h7/4q3NVKweX4v8iJMuKwc5W5E9Kn8lpXIjf6pBi4EcttDuUuHV5dIQbsHZnlf3ez6SCsfqzqKNa6O5UVIuKDCluqT2sfshHv9QzUXZpJBbMncU1UPEtGT/LOHk7BZUkbqV/FO/bMiwi8cQ+XpqdoMb+vXH4rI32yVZnUW5ZlOkUpjyypBxdFpo3klBN7KgSnxJGcIKEej9NoeMpjSIUqsJhQJ9X9evyKZp6z5kUkmqoYjeSRw3nwsJDMnwWjWfogpoEWMLqNMpEFR1YXrcw4NirP0sVk+HI+S6b9QGszo2QWv6RvvCRxQXLtrySXbjMmMRGh4RwaQ6y+CG5C7h+nvohjGAO+YC2kqkUG8zzUHRMJMvIeNWJ9cxTcVzULHIuiXss0ny/JlN8lJNofJ/nnS0MrVvLFSXmbuOTFn1GL6UjHUx6iLyyg9bVW+tQJf7dtTuOvkqDmap5E8I7DZbzkoreP5tTKYM5EXMB1Hz/0g9d6sxJXyKnB6rvTHgU7ZpW1FcGwaCC/z1qDqmHtX5IZNReTSTxgmT5L2NTla9jOZRfJCqWBUNdS4tCH5J/6Xi7Oi4rM/mvKyThBjAhwnBJNjZIx9bNnn/NPHMKS8xOKW9xCxZHCmM6Zki8dy2+mK30yniTR+GU6eqm24yCai83yK0kfjkTKmyHF/MnoZVa+vktduCe/k/H2TVOYsB6o5zuj2g7qsR1JUbXKXF/egPKUvQtrIdtBipIQMG4kzJVjXiK+Y5M3bLE+NFl6of/UOvW3MdWLQzFFPPNnBhmxQDnvnemL0EyaV5TNtYQYYGeKSYH6DFdIdBTK+xON6rrrZq/jUvW5crBIxqjqZy+4S+lDXPnmNJqRGEymXPqc9N6E1GdqQ/BevQl9CV/5y7Rj62yCYrUt0qki/MuU0CzXbEtvW26OdVo+bNzSeOlKBvLcFc971gb6P0WzLObUpQ/EEWQPWbrR14Wt2R36ZTGYtuNcFao7aT3IZT0tceGMLl9ZY8sGm7GBZPTi8qTDYTQpkJ2H6y5OOuVNOoo3j1X0kpSSdEZS+srUSPKn5w1pvio/qDGR3ZUz1Kjc2ENt1KUrU5XySiGzZI5aEn6KJbwyfq8XZK2nsBjS2RXfXWvLMfqPBek4WUtRQT46x0+SQ+/ypNaavnW1LDx8cvIacvEaJ2+9RxVPHEmGcsT9/HyBasFSXgkIfTVrWVAY1k5GJC6OmDSbPd+swQJSpGqzgCqHB1qsGZfZYporC5qgX7xNLV9B/vlyeXuOiLH1mIVmbytXb/Q0QsU2supN7UcM7PZr72SlrXN3TEpYkrAkYUnCktyAJan34T9xxCYuH556wZUn6tZwvQTCFCSrkJ3aGUeu1dmU/DptRchGK1IZEMeOGBVDGzrnxUXkwY2k1JsLEYm/pel59KAGGLcHZ9x2tE3rGR1qIxC0LlhaU/gw36lEGvWfKgYg5/6LSJztg+o8Z9Zj2J6/2GqaCqM5ylJZs1CfQwS0dglTLh85jlh21G2EUp16+Z4l0Gc3NNoTyep68cdXH/4tfPcmZLSIptOxs3MHtkTTZP7y588GvEFv5eOEhvmhjaqDcFTsoafC20qHS2N1T8UyjgpxkETvAvo2IUUEDBaTrXqA0BtAqNdv8o5oVCDTsi/OXGp8Hkc/lOCvrbCUOvq1lxukcOzUhWWJA/UpMMcEehxpaz0WV5x7+4V/fPbz48htSvtl5Flrc59a2fPTthE272yeu+GSO2Lz/tec8r7q7tiyQzrQfhpS2C88D9y4vXMN26O7hDqb/nYynz1NU87cHYkMm8lLjSpAtsKcIds0ugLbVXyKmh0OwR3nCIsXSrEvnIEbynxY2ofXNeVA0YNVOFQ8jH0h7M2enZt/9E4q3KSrl4FKTL4SeAGLiDbZeSxzBm/Ut276JYMwnYyS2UOeHaX9DWxCkDF7PxeAC/xC5HELjUDY1yVTTi1G333gXu3drOt9jUPVpnJBTsfRQKQlhfKQZ1++FsZGxPtZnRPtE3DhLOfYaTyO8ead0ylnr4pPNqTDp1mW8PnYHOGRjM1ZMBTn/IfCdubzRtHExJ8J3r2ptCVqcwYXW4zCg3gR3C7mMhcsGmdpQJs/2efVzyVVNEu1QALpg/Y36k0grWTpC9Nj5N8mE84wi4bBHTc6ndZOkaYLOSIjWYxVWXoqM+KMEWWy08H5I5NOXBsdZ9b37/qB8N8EN7NbGm389YYGN7iP0ix4SCdfYj7iK7A2SEQE3ynUzNr4ooxPS8tTuEIPrp1SrpxgFftYadMQlZ2ZiEJEfBDJW6/TYdz/+cdX/3j17vtXf/v+rUV5OzXIJDj73U6vf5wJfh2xX7TPh42e0oUlqfOUzxsMmFGHvEbiOLXRuvQsX6gUgOiJ+VR7XSyNcfVM5F4yn2dzPjAsppdTsk4bz/CLjE7GbZ0IOhJTy+SovX9PQvYzvmnftPitvP8nxfyK15PaEXTtIf7x/Ud5Fl2h1coKRAm0w293ST/Inp/9Xu74H2e5e9EcaAFZc2ppSzHkX7V4PfvdNkui6TUuSl7TkgmZHwMPH5LhcBw/EtVpHIvFJMwTJOePDIY2T3PYGx04rNjSIp5HNcuz354xuNxma4uBOdIMbaGiSqZhGfDFBsNKZG01G9yurKrNXUdwVUa3KwTqslQbDVQv69OmGl2Zf/jqlo25IJUJ8AlAdhrqduHRmnwIKwYo3fOr1D8vO6oExCdJq4miGomjkQyWzCroSHCVQ97rQF2R+8xqyCv184iu7nUG6pSJ4gYZ0/So5HEWsAYKpBcu5IvgRxWziYZDV4xBnhKqRUeKNnRM5aa+zYasduUduBFQJLYzBncT1jsZPyWVJoey1QNtq/eD9zJoqWbc0oiz+7oNDSCqEGwGtJllfUtDr1VkTyjOXEoe7rxPM6VMyz/jB+Kgr3HJBWttT2j/yQNH1WV0RnCoIKUsnqjomqk5Mwog7fRPxMN/tbSXcUhImkUCXPiM2xwzIHksJ04kAJBubSPt4tznHS3N4pb9NQr55SUf+yL1Ov02yTJi/G//25//519su5xF1ojwc777FRPC3vv2/a8swyr1nTGSGlPIX/rEXMJ6cW+TNVfQlapaexH8S94rk6aYrQS1N/ufCkEaDUOBOBixCqX3LJr7dDZMJhHZs2GlzEVHYIKewyvXwpPyhwuCpaNev9xp8U2cGPc8Nd4oqX1PMMpv/SS+JfCJ8zrGd8VgFMZTge8kIuk2UaayQmRY2Dx5ZjbJGTXqOJE+iGVpS5ocVJP1H2kTy/aFm007EoYpZ0XcPrGKHi3Gc9sROo63W4QHU5j8jxIbf/mv//P//R/SKZFR3+O680G1J+OvIvTKh+MkPpXOj1BGEGesqGyNLBpZ1s/nwOZZcWAzX51/n5wtf/LxvLf0kVN5VvOXpvOf5UNwn738tS+C6/il5NoyEfL63ykekpPwp3plx4HJS1lTAIhZmElneVlXt+iBdAGVsxxypLL4t3iwEMdSvyaRFZOLjPBfMx++tR4L1NyZA885tIQLaAeHqR0sGztaIX5kpl/tutaQPxYOUvdhWG2/iqiE6sm5+tm7dMO9C3dPr5bUHQqbehU04mvx7W2gEYsqK4IRtzVe9V3VDNP9hBiurPJyCQJHizBcoo19BRgWP58TXzj3Oq7VUQR4XsDzAp5X/AQ679rQeaWwBDgvwHn3FZy3RsHA5rW1tg/YvGsTRusUSG5bFtC8gOZdu3z0lJEbkZO2QytA5gUy754i82qKBzBvAGDejQPz5vIVuLxLRbUPFpfXTwwBlhewvMcCy5uLyg2g8k6jLNtfoN3GIOWygcMVgps7DbPriGTuMMquJHxAIwEaCdBIgEaqJwfsDACIGWbzBirVyBj5mdp2yAxvuAxXUN8fKcMDJaPxjFKvC9aJlAObwzopsEmKWbeggsrsHWdqSBULtD15ZkegQL2Oe9kQPRv1q29WV7X2Es+znPVz8HCeNlGyVTTP0nzvNpgnFFYorFBYobACyxNYnsDyNIkDWJ7A8twLLE9fUx5Qnuv2TXTzT3j6KFr9FA5yriF5iijEEUF5Njg3VM9Mkx5AngDyBJBnu+dtb4A8NxJZXTuMpyOkCRTP+mYOFE+geBqjA4onUDyB4gkUT38UT8dea4t87TmIZ4Pp0xqS62R32vQiYHg2Yng2OQ98o5KO5D339K4I4dlAT0DwBIInEDyB0VXd4oDgCQRPIHiWvwUETyB4AsHTqA8ET2gHQPAEgqcDwfNDPH81/FWmeK0C5OlI4t0AkKfZ4xXxPHMETqNJFQU+OBBP+0IvlyFwtFieZdrbb0hPcyzPiezZwITnJ53yKzxyNGT6RZ5XIv6slyLWG6d8lnwYLqZMQkaV2qvOIUsAlAKgFAClXQBKTdEAnNK14ZSWdgDAlQKudF/hSl2EDNRSW2v7gFq6btG0TvHkNuMBXgrw0rVLS0+JuUmpaTusAwxTYJjuKYZphfABZRoAynTjUKZVaQtE06Wi/AeLaNpJKAHYFMCmxwJsWhWcwDetxHB9QrgrhlVXiADvNNqpLZ63F6CnJaYAlBSgpAAlBSgpixDwhZLSC/0n4DYdH25TE66ibYc8760D/snrWNrOIP5YQtDeGL57gfuzWTiflmSjRqVn26g+3ghIK8P/XCyD/1Mg2pRwhr3z+3YEbnhl2BolMzQwTjtOsY+d9M3aTKa9RC225jcePHhxg3DaKoaxY6/dYShjmKEwQ2GGwgwFojEsYyAaA9EYiMb7imjc0b8BYONj8IQcPb5xu1Ml72DNFQC0Y6AdA+24PXF+b9COt5BnsXbs4+YEB0Ag17d9QCADAtkYHSCQAYEMCGRAIPtDIDdvubYw2p4jIbcbSa1hvk6Gqk1ZAiByIyCyh9NhxUine5ZXxEVupy7AIwMeGfDIAECs7nuARwY8MuCRy98CPDLgkQGPbNQHPDK0A8AjAx7ZAY/8sVjFdSElG03uGVzyki6vAwFQbiWF5bIRgKV8AFjKDtp4Tljl3KO5VscT8IiBRww8Yge7A5p4bdDELoEKlGKgFO8rSrEHTQOw2NbaPgAWb1BgrVNouW1sYBcDu3jtMtRTjm5JltpO6ADGGDDGewpj7OYBIBoHQDTeOKJxgwwGuPFSMfqDBTdeVlQB5xg4x8eCc9wgTgF5XInLdgzLbgH9uCmqCwjkTUAgu/gFMFSAoQIMFWCoLEIAaMiqBWA+AQ0558Ml0IKaA+D+wMgiY9KkQVeapP/IN4cz9IygQf75RY260wHhB2mkFxuCkOPA6lIZfLuNlpzj3TQmEyyHAVRkKDaM1pzuFrCgnsdZUavks2E5dzQAAet8hLDOfkITCM+21YKVDSsbVjas7E1a2QB7huEPsGeAPQPseX/cN8B9hgvnuCCgOzmN9GFLex0AQ5dWGMDQAIZudg/uCTD0drNRgBENjGhgRAMj2tjkgBENjGhgRAMjencxojtZUa3hw05GrU1vAlx0I1x0N1+FbwS1KUW6ZKv+NhgvMvqe5Y5s+8qsCDHdiTiBNg20aaBNA0+yuoMCbRpo00CbLn8LaNNAmwbatFEfaNPQDoA2DbRpJ9r008f0tQ6gv646DbpjTV+LvqwRZloCDPVzcIz4YTp/EnXe8m/LIku3NHuAWNKNC71cUsOhI0m3EMn+YkdbaAHI0UCOBnL0ISJHW5gduNFrxI22CVOgRgM1en9Ro1soGpjRttb2AzN6Q8JqnQLLbScDMRqI0WuXn54ydCty1HbIB3jRwIveW7xoOwcALToAWvQW0KId8hdY0UtF2A8YK3oZMQWkaCBFHw9StEOUAie6ElHtFFDtHuRcIQS7C5jQ3lHXnUaBtvEC0KmATgV0KqBT1RMZdgiDxR0J9AbQ1dgk+SHkdtCSDoAlfnkJ/lAlHjAljae5el3QZ6Sc2Bz6TIEWU6zCRR3sRGYmdYCo7ZoYtCMAtV4H5exIrh1UtG9W0dZ2Gbq1LbfpCMBa26XNJqBaWyZ+18FZofxC+YXyC+UX0KyAZgU0K6BZAc1qzdrYJ2jW5dwCAGbdtJ+jm6/D09/R6vNwkDtgWf0dJTkoq6UGIFlLqwtIVkCyNnn19giSdaOB32Xdgt4RV6Cu1vd/oK4CddUYHVBXgboK1FWgrtZQV703WVs4be9xVr3Nota4Xycb1aYZAWW1BWXV3/HgG/p0ZBu6p3tl6FRvegNwKoBTAZwKaLTqlgjgVACnAji1/C0ApwI4FcCpRn0Ap0I7AHAqgFO9gFPf/ia9UQBQPRIAVeeCL5eGACBV91j2Bki1QhMAVAWgKgBVDx1QtcL0AFbdELBqVbgCYBUAq4cBsNpA2QBatbW2f0CrGxBe6xRgbvsagKsAXF27PPWUqVuVq7YjPABeBfDqQQCv1jkBAKwBAFi3DMBqkccAYl0qYn8kQKxdxRYAWQHIepyArBbRCmDWSsR2qYAtAFr3HqC1yhvAqgJWFbCqgFVVT5TYUUQWe4RxBwFb2/MfANy6MeDWLglJhwXg6qnKAcj1OIBcm6UQAF2hLENZhrIMZRnArgB2BbArgF0B7Np6lMJipOwfsGt3NwIAXrflF+nmG/H0j7T6SBzkD6DX7o4VK+BrpSaAX0urDeBXAL82eQP3FPh1Y4FlAMACABYAsACABQAsAGABAAsA2B0FgPUyl1rjhp1sWJuGBCDYDkCwfg6K/QCE9aI/AMMCGBbAsIB+q26VAIYFMCyAYcvfAjAsgGEBDGvUBzAstAMAwwIY1gUMS4bl9+nk7noxYbn9XTwf3O8UHqyziq3n11VLGSCxphJaA4ltXPzlMheADeseyy5jw1pIAZCwgIQFJOwBQsJaeB1IsOtDgrWJUgDAAgB2bwFgWwgauK+21vYC93VDomqd4sptNQPuFXCva5eenhJ0G1LUdp4HKK9Aed1XlFc7AwDcNQC46+bBXR3SF5iuSwXbDxfTdRkhBShXQLkeDZSrQ5ACwbUSWu0SWV1TtBNors+P5mpjD+BSAZcKuFTApapnNOwO+oo7Jrgb2K1++QmAbF0nZGvX9KC9R2rtoLJ9s3btDaitu4za2i5/ANYKXRi6MHRh6MLAaAVGKzBagdEKjFbXkQaLebIXGK3LeQkAzbpht0c314en+6PVBeIgdiCyevtN9GEmt3sA+KvAXwX+aruPb3/wV7cfFgYWK7BYgcUKLFZgsQKLFViswGLdHSxWb0OpNQjYyWi1KUaAYG2GYPV3ROws8qo3tQFwFYCrAFwFpFp1PwTgKgBXAbha/hYAVwG4CsBVoz4AV6EdAHAVgKt+gKufKukO3RFXHenEyyOuet/x1w1c1ZFDIruv4siHjrD6yZHc0i0VARCr7rHsD8SqpIXnxFj14cjzk07pGh4pHzKbI09TEX/WSxEfjlM+Zj8MF1MmI6NK7VXnUCcwY4EZC8zYFTBjpYwAaOymQGPV5gDUWKDGHghqbJ2iARtra20PYWPXJ6zWKbDcxj9wY4Ebu3b56SlDtyJHbYeMABwL4NjDAI7NOQDIsQGQY7eNHFvIX0DHLpU2cCzQsZ5iCtixwI49UuzYQpQCPLYSJu4UJe4euV0hrgyg2I0AxSpeADoW0LGAjgV0LIsQ8EXH0gv9J0BRHR8UlRdkpK1iRwwrrwNwuwpbVApee6Mb7wVs0VbRiJwZTI0a0LbhiLyRnFbGLbpYBrioANtpwl72SBzcEfDllaF1lDjR4D2dUZubbaVvVjGbgNC8PwjNVuEEiGZYobBCYYXCCgVGMwxjYDQDoxkYzc4zURajZA8xmr2dHQBpPiq3CFCa/T0sdphmWQM4zZWTfcBpBk6zO/9+X3Ga152BAUxmYDIDkxmYzMBkBiYzMJmBybyrmMxNZlFr3K+TjWrTjADK3AWUudHxsGLo0z3d60VlbqI3wDIDlhmwzABerG6JgGUGLDNgmcvfAiwzYJkBy2zUBywztAPAMgOW2QHL/Pd4/ume6FJY5avAMTtuNVoejtldxexy7dLPbuDMbf06OGBmx3ovl3Vw6IDMbdSxr4jMJSJ4TiTm3E+5VucRkIuBXAzk4hKTA7F4bYjFZeEJpGIgFe8rUrGTkoFQbGttHxCK1y6c1img3PYvkImBTLx2eekpMzcqN21HaoBIDETiPUUkrlI+kIgDIBFvHIm4Jm+BQLxUhPxgEYi7iSUgDwN5+FiQh2uiE4jDlQioVwB01aDkCgHUXcAd9o+S7jDwcJkVAPUEqCdAPQHqqZ54sDOAJrYAnjdqq4b4yI/7tmN/eON+tKUP+GN9eOB8NJ6f6nUBb5FyYXPgLQXYSjH7FmhUmTHkTEOpAqL6J+zsCBCq15E0G56plyb2zfqUsl1GNW3NPDp4WNMmIbMJONO2Gd9tPFMot1BuodxCuQWOKXBMgWMKHFPgmO4tjmlXsx/4pZvyY3TzZXj6M1p9Gg7yPnrcUg9HiOqhzewHTilwSoFT2u6t2xuc0q3EbZd293kHTAFXWt/uAVcKuFJjdIArBVwp4EoBV1qDK/XfZW1xsj3HK/Uwh1oDeZ1sUptOBJzSRpxSHweDbyzTkR7onuYV8Uk96Au4pMAlBS4pkMeqWx9wSYFLClzS8reASwpcUuCSGvWBSwrtALikwCV14JKy4+4TfTLfYXcKm9T7urtuaKTe9+8cCBhpwyIvl05w6ICkLQSyr3ikNToAJikwSYFJeniYpDVGBy7p2nBJ60IU2KTAJt1XbNJGagY+qa21fcAn3YiQWqegctvCwCgFRuna5aan7Ny4/LQdmQFOKXBK9xSn1Eb9wCoNgFW6caxSq9wFXulSkfODxSvtLp6AWQrM0mPBLLWKUOCWViKk3gHS7kHLPUcr9Y6i7jBYaZ0HgOkETCdgOgHTqZ6YsDPIJa7o3k6AlvrkGAC4dI3Apd2Se/YdvNRbHftmFc1slyFL23KTDh6xtE3CbAK1tGXSdxu0FEoulFwouVByAVwK4FIAlwK4FMClwT4Dly5j/gO8dJP+jG4+DU+/Rqtvw0HmRw9g6ukQ0ae1qqUBZFpaVQCZAsi0yXO3N0CmGwzkLuv6846gAr20vt8DvRTopcbogF4K9FKglwK9tIZe6r3J2kJmew5e6mkKtcb1OtmkNq0IAKaNAKa+ToZdBTH1pDMAmQLIFECmgCqrboMAMgWQKYBMy98CkCmATAFkatQHkCm0AwCZAsi0Bci0dlwVMKaHBmPaCMYDEFP179BBTBUVAMIUEKaAMD1cCFNFngAwXTuAqRaggC8FfOm+w5daaHnD4KWmKbo8gqmztlmKdykNgSnBrfJojMT08sdB/RQbW3EZVlN5IB5EphafgnA0IY6gCEdNNJHBFVYM9GEoYoSiBSrhaORGLdiN9AGn8yLFQZ2huZWpQa31tWtTfE+A900KmNC53Zkk21Af0rOgThzSWNLHTMCAfY3H6VTkqzlayJjkn2Ss6z6uwZSm6qjgjdTBbxytjJgHZ5HKmaPu01A0siFvvcLZMVPOOEcbwkUnIRLZ7C6OKGpVS9CRC84290iw6qCAedeFVvuTsaEUHM2rW5muNTF5s3/iRXDNsyi0XYPaSP6Zk6UVTTf9qRWeEdGNZYbjY6Iy4B75lF/RtFOMisGzmqYR5eRxsunTkDaSZBC8+uldIDx1vOE4WolybMt0VB/PXw21/czFBUqVFk5ziZ8nBUETWq4pnNzrX5JRF614q7q4xtmzKwhK8li0QSnTAT69O+DTa1Qw16lkNkkHQE8DenrNOq+n3rth3dd25BHA0wCe3nPg6YL2ATsdAHZ6a7DThswF6PRSWU4HDzrtK5oAOQ3I6WODnDbEJwCnK5ksnoksgJveY7hpTf/A4QMOH3D4gMNXTyDbObSpch7GTkFNuzPBADS9AaBpn/TLQ4GZblHCADJ96CDTdtkCiGkotlBsodhCsfVVbI3zbgCYBsB0+SwIAKYBMN2Y2gKA6d02+QEvvTkfRjc/hqcvo9Wf4SBxgEv7OEEq0NKqLIClSysKYGkASzf56vYOWHrtAVvASgNWGrDSgJUGrDRgpQErDVjpnYOVbj2aBFBpm7W5ZVDpZtfCrkNKN9IYAKUBKA1AaUBGOgANACgNQGkASqtvAVAagNIAlDbqA1Aa2gEApQEo7QCU/pTOvozG6eMqSNK6jZrZvGloaCdIte7RtfJ9NIBE15KWOBYg1SUFMiqYnxRbzVB8DNVqkr9gk/Qsky7imZTIzDWLBymAaVtXiarZYhbb3Oc3YZ4BEoYav6mCq6PYsJ4vklfs0y7OO2NW58amWsSU5+X3vVWxrOvU1Tl1oTs69Ubhpr1Jbl+Bp/U4gDgNxGkgTh8e4rTmb0BNrw1qOheZwJgGxvS+YkzbiBjg0pZ5B7h00QbApSvell0Fl/bj7mYnBVCla3wMVOnlZDZQpbehS65Tn2wSC4CTBpz0mtVbTxV3U2qu7WQjcKSBI72nONIG0QNAOgCA9MYBpE0pC+TopdKZDhY52lsYATIakNHHAhltCswNYEW3hf3ZoO9Z0KWdyIFtaSMHCxnoH/8/ePBAR6bAJlADvWd9t/ED8xkDcCCAAwEcCOBAixAAcCCAAyu5fAAOBHBgYxADwIHbBA6sZNABMXATiIENacimig2owOeGCmxO8VedK8w0gAMaawhwQIADNqVX7A04YJs7cHuogEscCQM+YH1XBz4g8AGN0QEfEPiAwAcEPmANH3CJ7dYWEdskUiALnTyc7jqzHjywu443Tu10+pNLPW6FHXRa8K2Ig822lBf2nhfE4NLYbrYzugB/A/ibLUIF8DeAvwH8DeBvAH8D+JvImgT4G8DfAP4G8DeAvzkFyZbB395EExLb6SL7LonHw2wlDDh7Nqe8fN3tJlDxQUukwFml0unrqqHbDUJOB/UrraoQYANuHG8cw1CNT7cismkLsJ0izqlCukkWJpNknkRjWfPqvJw8JtzOctKy8DbmjufxYnE0d1VANueKLxcnvjJmYV3wbZbw8cdUzqL5NdmB3mbR3touiN9TjLcKFTwn1Fsz/52fdIqre8TmZdg9zycQf9ZLEdeNUz6OMgwXUyYdo0rtVedQFUDrAFoH0LouoHUV6QDsurVh11W3AkDYAcJuXyHsGmh5w0h2AETqKJyeVUCtU0i5zXrgIgEXae0y01Nublh22s5vAB4J8Eh7Co9Up32gJAVASdo4SpJF5gIsaanw/8GCJXUVTcBMAmbSsWAmWcTnBqCTJBCSIxdbB2bzpOtsGhmJ1EIJpJlhzz3psTdWf/9NIdT+KlzaSq/VaUUmIsVcJ5rSp/Ja8sjpSTEWI8TrGeFdPeq6QozYO2DrPBfmSB93HRfTnmcjDOx9z/2zgwrVTjzn6EJVfgDIEECGADIEkCGLEPAFGdIL/Scg+hwfog91rWVbPO+tAwrI63DRzqC/2EPRTSAw5TTKfcCA2Sy0S3v2UaO+s22EF29AnJWhYC6WwYIpcE1MOdIp0a8hwa9xGu0vl0wd662OX6KEh0ZIKQsRG4qtp3X0zToNpV0Gt21Ldzx4SNtm0bQJZNv2HXaH8WxhccLihMUJixOwtjCCAWsLWFvA2u4xrG13xwbQbY/EBXL0ILde3hTVR7sDAJC3gLwF5G175vzeQN5uLbNiWeefd0oD8G/r+z7wb4F/a4wO+LfAvwX+LfBva/i33pusLWi2SdRbIudWoNrLxqBwK1qtl1HUGtfrZJvadKIWAFv3Ac1GIFtjJnxCl52GutFQZreQ5ppCm+6JLuOGNdtWJcwqSWxeNNZILo2EsWSuQkcS7AEiGRDJtmgnIJIBkQyIZEAkAyIZEMnikCQgkgGRDIhkQCQDItkpSLYMkfyB0wKvifdnWfI1/kFuX/sBlGzt+prgkq1tHypocgsNLJd9cOjQyV3JUja0r4jK1kHtAq5yE6MCXRnoykBXBrqyVUYAY3ltGMv2zQFIy0Ba3lek5VaKBt6yrbV9wFvemLBap8ByewqAugzU5bXLT08ZuhU5ajtkBOxlYC/vKfayiwOAwBwAgXnjCMxO+Qsc5qVyDA4Wh3k5MQU0ZqAxHwsas1OUApO5ElPuFFJeV5h3z/GZl4sm7gVss51xAKUFKC1AaQFKyyIEAN6sWgBuVSN483J75jFiOjcFwIHs7A9r5JsF1agYAd+59M+B79w9J/FoUZ472VvfrN/02mXE5yWzNA8eCNpHkm0CDnrpPXuHUaJh4MLAhYELAxdY0bC5gRUNrGhgRTvSuPYHK3pZhwkQo4/KtXL0uNEdvDS6pw0uBWBIA0MaGNLt5wD2BkP6WTJBlnYtrpiCAZjpurIAmGnATBujA8w0YKYBMw2Y6RrM9Kp7ry1St+fo0x1Mq9aQYic716ZHAYO6EYO6i/NiV5GoO9Ab8KiBRw08aiBOVrdE4FEDjxp41OVvAY8aeNTAozbqA48a2gHwqIFH7cCjvqaq64SjvhZd2QYcta3nK6JRd/xW1St2IPDUzSSxXI7D0aJTN1HOvoJT28b0nNjUubdzrS4oYDkDyxlYzjZeB5Tz2qCcraIUSM5Act5XJOc2ggaQs621fQBy3pSoWqe4clvYwHEGjvPapaenBN2GFLWd/wGMM2Cc9xTG2cEAQHEOgOK8cRRnl/QFiPNSgfmDBXFeSkgBwxkYzseC4ewSpIBwroRhu0Rh1xQZXSGYu9MAzn6h2h3Gb7YyDdCtgG4FdCugW9WzH3YGw6UhUuiNeavBTfKzy+2oJ96IJ55ZC/5gJx5AJ42Hv3pd0GuklNgcek2BNlMsggVfVuYyOTNjqqiynVOJdgRU1utYnQ0btosi983adbq9RIZtzJA6eGBYD6m0VVzYptXYbVhY6M3Qm6E3Q28GKixQYYEKC1RYoMLas0L2BxV2SY8CQGE37CLp5ibxdJW0ukscxH70mLD+PhbV0QZXAhBhgQgLRNh2f+DeIMI+Q2B57XiwfhFdwMHW1QTAwQIO1hgd4GABBws4WMDB+sPB+m29tvDcnqPB+htVrWHETgauTYkCGGwjGGwHp4VvJNWR9+ie7RWxYP2pDVCwgIIFFCzA3qr7IaBgAQULKNjytwAFCyhYQMEa9QEFC+0AULCAgnVAwb7WgfFXk2GnmwR9UrM/FiSyDXDY1rFsCinW48MHChvbgXyWy4k4WgxZb5raV0DZ1gECXRboskCXPTx02VbGB9Ts2qBm24UscGeBO7uvuLOdqBsgtLbW9gGEditCbJ2CzG3oA5EWiLRrl6uesnXr8tV2EAnwtICn3VN4Wh9uAFZtAKzajWPVesllANculUZwsMC1q4svoNgCxfZYUGy9RCwgbSvh5KWjyZsI7q4aod5pxNslQs47DH/bzm3A9AKmFzC9gOllEQK+mF56of8EAK3jA9Bqgr/03kvPe+sA5/I6rbczeEy+0XpvuGeZRWqSqCt11H8ONofl9IzATMskSDWqWweE0qTxc2w4TS5c6tVyFXcEpNqRl5njCTXmQCyHsVTkYjaM1pz4FjCm3jqxt5e2OL/ZrPG5l6jc/jmnBw/R3VX4bhWvu4vCssPg3bD6YfXD6ofVv1GrH0jecEQAyRtI3kDy3kfPEWC94T06VozvJf1Vqte+LgugfwP9G+jfPj7KPUH/3qkcnLXjgi+R9wKQ8LrSAZBwgIQbowNIOEDCARIOkHB/kPAl9mFbtHDPEcOXNNFaQ5ydbGebrgX48Eb48GWdI75R3qa08pIh/NtgvODPCofFFkDHlyRYIJADgRwI5MAYre6vQCAHAjkQyMvfAgI5EMiBQG7UBwI5tAMgkAOB3EAgFz4pZ76DM1HfSH645Cjgaun2/OUOjigu3n9F//lsCZk5Wskv3xbF2GeRWQ55N3dBPWZpw7rXL780fyv3jnz+fFFp+RWvg2iDO/D5s5HFf3p6ei0Wi/GgtItRwE2JNEu9SFG+kbCAvEs4tVcuiuHTvGZ5nAU3P8WzB5IQVONNPEniIWPMkhwi6fhKr/ksEMZznLE//VbFM6pA3mWn7j9jA6OWum3mLqdFoUC7UWWU9IJ3HXbEk56Uv3mI7pKBTHot+ck1xdzGxEgzmdLOeXFh7psNRVX5JgytRF92ySjJJZ0wUWn4df9N4bctmEMBw/uuvaCruiClTUv463LRrJey6FKR0B4FN6U78W5qMMPDeEobk8RnTotNk/dwLfVKdYrULVoKt89Q+wvPHSCIf4/zyGuQLSRJS5Rl4a0pEWu/ySNJsmz6JMKbciXl6QcVFuLc2FJT5z2ftKWN+zGVD9OQhU7A81XuPBQJU9pd7/pAfhyEftg00b/H8wp5MRZeklkXpjTZoS5Xcb0bhNohU65xsrolcF35X0XQmkrE+R9EfYMiqGaZKBGh7reHO5a6mcA97/YR/rIsRuj7LxfLw4tyD0nKMGfGw6Xbqe5H9oY++zmXmW9zfEerBk37qZTStOVV/QG0sU5n6Ve2aB/SWWyXlqUc0ZlGUdfmYpUd2Gp8SEVUKvyj7y6jLMtTh6MnH9e5AwrM2LvzWKnu3h9nTgQxuStyxsNEIhTp1Isz2VU7ERoddjct3E/yQMPZ7wanUxWaaletG5u8PS8yBPJMlT5Hlns3FvhoafXGJ/ZLFXL+VXv8DYd4bi70jQPBTQlB7EZujnEivN5RpUmLLiW9PedapaLt90YkyN70Auktu6nwTXX7tuRikO5Thaq2y4Z2bu9Z47Grt1wZ1BpA9EvtyTMzxJ7elLQuanLlGK6O4NxFvmuQNAfT/J90IbwaZX1c2Ak8b9tlv1qaZd6j2nHxpiOqTmtzGZtSjt8wTj0MPKuNWTLN/lGc2JU2ScPB3cKgMk0yZdtxCzcmFenv3fB+NFwMZIpifuawAEDLmx8ZJxL5lpbbWL8cXkiPpviIbFS6wYpmoun0Zckw4xOGrKAIZy/JsmSe6efv3ghPXDR5ku3mjdywXXNjNwKpgtz0TIW+bGddnjiSRJYz95wm3/YMHpMCBsdg9TyDwUMstRjPK8ZImcj67iPwncwMUf/KRpU+CSLlXVZ2e027qmUvklKr220Cqk+tGPWyXF8DmhO5F34zr3lQa9bqVi5ynqi4mZT9npWxRxo0H55WScJl+XURLKoSTwcOTsy8iNkskTLuNr6PxiNW1x7vU/bey9JDknxC3CVzozQf5C4dzB0H5xx7u5Ghh3dvhAC/MQ4Sy0+zN/yqYHf9zJSSVoiGsgjUl5qwy75ot+LML2f36VLSL9BUtD3Rj2/wovnOhbBTbF5Ibiyn9DoyNe0O6nK/a3qFlOsnLxr+Ba/lvWUf5ovbLGgqeaIyarM4B7+axeP4a6SOgOiATTTg8LqE2r0WsxRoBN/gAwdTT17oB4x/UA41paM5b8+6qXGWqrRkhgTnT97FExEIGgoQXoEj8SDKkdJwMhjTlhyEuVNxcXtuO6dFI+3zS32OrnR+Ulptq+4DRrRAXHQZhh56mw8ijcai+U9LIXouCK7/Vv1iv7uUldPL5uFdm+ccTN5yOnJJb6wECEz81k8SiDwnCO3FFRFVwWusTOm4uaTqs6ykM16II7aslj3wqRKjcXGgPON0wGT+JLCW88MDL/kLpOwJjHd+w/gQAsZj8qSJUN9UoR3AFYAJffSCjxTMYvYZJ0Ru/eCdvHbuQpnMX+NxOhVCkeUxu5UV7IRMRigJYFMy8slT3iFSkqizZKgDsAyFEkts4994PCRdzclwADDkORd6Oi9YNU0Xs5JqmpUn+cZ0id5ozA0S8lzspJwjF4gDAsO4tCGw4z3K0xvykwNsycutRcdBjAm8MC8dfKHgAKKnTH9XdzghIRlNhsUjBR1wn05IBeBNx7W/mbASakS8NXBwe5awqBEqLs8NA82cC7IgBcKcKYlbIgPQt4IKhkw4j5xMaIJokI7fV86TmUrSrsyqBJ6gSbgXaC5ZYTvwxSRziRhfrHUJkcIwmzSR8MAvzTkRzSt1TnGJ2grVdZY8h3fxnLtmQvmUOym8QouM1zMu5oFNG5JYxlkPWsILefNlnFOFeGUStrEgdmp9p5ldOYEqQoso8T59ZEXjQhhXN6YYuuFbqASHZNN4IIyA8fjJnLanCl/qeNF0MROQ7AyPIqGB6Gkmx5FZ1JEuCf/5Zqy1nFrKf1nHzbP1/UV5z3Lng5IZgi9qsyhRjOR1OZUpJFoZV67NLFuSuXfXfOy4iJWjcyzG5J/1blSlmcFm6W1MYrviQzb1Qd2Nuj5Yv/rOrOezRJb7okvqWIER0HBQ0PDoiIsCztn9W932Re/u+XTcuHrxcL/yvNy6943FxTl9x2nFihXnT45V9UOlgNXNGpNSrtwWYL4OV/lvDrSkV+zVZAKTM1SgHKndO5MkJyQQx4dFotddqjHDOGXQaE0k1QrZJfUCmaTEmXs5Ao36kNyC71kx4D1jMEsz1kdNEScVyZPK2urzJWFlTfv0lfyZSmmvxLUU3GdNGb0oVtaCu6cselZD9ZKp804K/0lovA2ofPIUWxmFQ+jOqre9XLPOs0LYfBFFTF1bq9M+Wq+PqltyeVgVXgdO4392uzihpel09mU0Th9XU7y/eW4d3CfImguAX7wdUYE/eGe3U0cdlqTL/mlkorZI6iaHV6ug9RCDPY2koDgo12Q0bNtlNRggCrZiIGgQI/GzBmtQzkkTGXwdNBxJMn8ncfGDqlymt+UptbLPdeiTUav/rvi9y5Ukaqqqxz7X7Bo2Fk7sXK2NymLuJpWoNlpWweSr4EwUOSs2UnHhWKgP8edXmptE8jGVaDonjefnerZsL97Eq1eA1TCvRKE2/7sNvKqYLZd33YWQ1bYpypms1y7NVv31YhLNnhwHHyU6qPOlpDHp7fejRwv8lg2zTPys4ZJVef1K/1Iv4qm5yWADLeWl64SnqVEKR7Mjl7PXfOyT6544DCdFUN23ipr59LNyghtSJFAKG6uQZCKSDrmYNeFiCDTYhJ1VIn1QOsVH6Zi+qmFQZ4txNRPfZAztNs4R+arodhZGuWpnnGKTEp9pQTKp8tqVD+M5w1oaUrAJ+4wTzlo4zYNujZW7Mn63nf4R5y81aqrwkN2YvHQjz4NpfN1+M+PVbR/BGqax9iV+cnOJQXBN+f8GXqywcgp6E94adrL1o/Fj9JRpROZkZD1ScaHOrjzED2nyT8sJGhMXlPZS2Whj3Klg1HM3EFhlQhoHW2q3ztWPiplJa52H4zjK5mE6cR2SPG+50vvSep7NPKnW0EA6S+74qA5ZhAnD8/EBpTwwIZ8lk5Y2csdXf8oG8JxrK8jsx29T4dTkhnqNN2dL7x61IgzZm8pk37jv0x6d/V5WRP7o/671hz+C898ZqqzSWu+P3lnTRek/vv/49rK43/FeXOHMjtObn95eh5/eX//bd9+//3TT0ELhOhYgvkE+KeJOx5gTQeShtIY2RDRAIwHfxjEtQyRTPmZium+fqmHOehsLEb6qL0y/A1BrQazm6H2hVAsdpjHiXvZ0l2Lxq2gYvZNGTq8aJh9nTx/THKDhdTVZpMVQsdaG4WIYLvKy9n5+qTCVnT+JdXzLvx2GxWIlg3YLpol6jtGisc7Hc1k4LYTradpYhwRTB6YOTB2YOjB1YOrA1IGp01nVaLFxmiycSkxpSUun0gosnuO2eCrk0NXysVMTLCBnRH7/LaHK0GARwSKCRQSLCBYRLCJYRLCINmwRkcj+Pp3cXS8mjFTwXTwf3PsbQpbKsH+Ozv6xUIGH2eOmnaO0dizTsedGjmVEsG1g28C2gW0D2wa2DWwb2Dbrtm2qJ23i+af7dBx/KJ/RaztxY9aCOeN98iaeHciZG3P9Pc7eWMjlKM/gmPOwm2dxqiey3adwzLHAaIHRAqMFRguMFhgtMFpgtHTXMTpFZPg6a8ZZyy988zZcajVhvBxbLKZGAu32i4tqjtGGqc3FfodgasOBKQNTBqYMTBmYMjBlYMrAlNlsbplWP2qA/J52jKoHK+ZYrRhFAP42TJlijtmCcWr6+2i/qMHAeoH1AusF1gusF1gvsF5gvaw9e6xqwDBG9jVfSJMlX+Mf5DVg3laMrTJMGZ9sMvvMHRKss22E7VZOA0Udo6ljm46dyztromVPK8jWBEwhmEIwhWAKwRSCKQRTCKbQmvSPdgOpdIGUvBlo4xdI4aqn1a56wrVM1muZymbQa7750N+6l8Vr9vwGbeZddhc02/N6rqoWvMPMLU2tr2Fr0bYt9y02aN5VrXslZ4KTnn3085Juvrr7ody40ubP5CRXdvlcl6+bvB5qfIsK76W+Ww1g2deayduuhXu6Mda41I3NLblk/M++Xh2cJbL+JtwjTrvPyz9Slg2eHhEHQSxnSzLZXFX+tsyTqSCaxcuqY8W2Mm0gedWqY7akDXZVN8uWbXD7Tp6LQGokVMjb4XMclyIudWuhh+xao9xat8xSFxdenCxzkLh+mZ/vNYdW5cBieLnEmtPju/qNfx1v+2uRYT4asJ2118bWrSz9gYY2/DUmu+Orv15tVoJ27SM/yjPmqWNbphma9mY0bXOq90PfNnt83Fp3w9p12NDMVnZPA7fJD089vJFQoI3vkzaOqwCXzLPfcz3dfl3fUnq7x5V1y172tyW9vlNC2Yp33B2Ago/bdCA0LDferEF4NN72suq9OXsqTHyuiTkEoXK0gPTHJUJsoPHLSY5W5PQlEef3R074Iq0fnniQGSjLygdZG27GZeSP37UOpRmGh3EzHkbrnO+Hq9Ha9eP2Ofqs5vLbo2zu2byQG7laxEE1cEDucTrAESG3d4RW3/fEgBK6+nIJAm6k8a6Y7DuRMFCVx0tCkh+Adn+M2KdHZfbX8UmXkgAtOJ3LIJvujbXvB+p5QMLgWODDjlIQaIivlcSAlQO6Q4PtnQhowsXaSwFQkQBvosldPEsX2XdJPB5m3hKgUg8OvjU6+OxzC9feZlx7ldneD6depdPH7c5rXsEOm12loT134bXRCJx3++u8+zBPZ/HSuFnW2tjCvY4C2KfO90xAw8Rjf9/Q4QDbnO/JKQFb14/8uIDHanY5N2BrbgcPEDRJHd+TBF7EBKVgf5WC48XSXAfY5Z57+6x4l0u5/NpBH5cEy3zuSKA/UNNqIJH76Res4E4phKKVkKe+2QcQKiBPAXkKyFNrR56qGiQtI1kskmH/55/fvfm8EewqWM0ArwJ4FcCrYNsCvArgVQCvAngVwKsAXrVJNX0F+Cso68C/Av4V8K+Af3XACr3ht1xKEXDUh06wwzpB85pBPdjU4XX7tO/J8XV754/8ALvXinbChrI2eFCqhC8lQavYZ60CoJoA1VwFFw+gmgDVXEJYAFRz74QGQDW3IkwAqhkAVBOgmgDVBKgmQDWfX/5szrm5BlhOuDaBywlcTuByrko1cGHucaYjcDmBywlcTuByApcTuJzA5QQuJ3A5gcsJXE7gcnpJAOBy7rKPcDVkT3gHAe0JaM/lfIGA9oT/D9Ce0AJWh/bc3InJNYCDQkUAOijQQYEOCnRQ6BVABwU6qBaMQAcFOuj6whN5bveryXA1c6W1JZguXiCM7dO4PXxGzyWFSbMp6Ma2BdgTVMe2YRw54GPHVe6CBdnW9A7CRPoKQF8Eyc7EB9Non0yjCtr5xyj7kq0Edb67+ObfAOr8mKDO1wGUesw6tv7g7Tz8+pdoPL2P/tKfs3gQ+wwLinfDLWjRrVCm0JRX15RtILQ7qg3bkWCPSuO1rVaX1Pk6bPAuaK4NkMAdiQEa6BY1UIO0mbqy/s9MKK9Z/2zURQ0ltPpqlM6Cc5794Gs0XsS9IDF11v58FiVj2lRCvaznvXqvxeKOAmoluLqy9FVL3Y+vPvxb+O5NyHuRvRVDcfbZEs+djZT3las1S5pOW0x/zqtF2lxzOzw2sVVfVbftc7ky/dsn6p+7EYsJEiVErKWx92nsfcXe/Q9P2Tx+qKV722SquQrxbJbO5DK8m0gN1jW4B2m3CjRAQUe5nAgekizjB0yAPPYgG9zHw8XY5kLoAcT78JVPgHNuMQEF2N3A7gZ2N7RVaKvQVqGtblZbBej80eiwwJoH1jyw5oE1D6x5aMHQgqEFQwve6iUJ0IB3QAPueFsB9N916L/t91LsrPbrcwfEkem+7avZSfNtvWlk76AI/G8OgZ4LPRd6LvTcZ9Jzt3PPD/TeHdN7O1ywA/133fpv8xVLe6EHt11fdMT6cPPqLq0XN16itef6sc9lWNCToSdDT4aevD09eeNX10Erfn6tuOMtclCG1347le2ywP24nMp+Nd8x301lW8suGm/r5Y/7p+j63uYI/Rb6LfRb6LfPpd/i7tWj0HBxASsuYO2isOACVlzA2l3NxQWs0HOh50LP3QU9dxM3B0OvfX4oMN8bfaHPrgESrOGO5l2FBmu8Hvm4IMIaVq+D3tpwy/YunEuz3py9JHlAUYWiCkUViupWFdVN3nUPhfXZFdZOl89DaV1daa1N+H4orrVuH7fy2raKHRTYWlN77nRtpxTosdBjocdCj30WPbbWdU8tVtWDDru7Omx5iaDBbliDVdO9X/qr6jS0V/cKLqG7OlW8vdRcXTQCvRV6K/RW6K1b1Vv1zWjeCquuAE119zTVytpARd2QiqrneT90U93b41ZKHWvWQRvVLexeFkDB952QaZ2EAU0Umig0UWiiW9VE30QTUjLSRfZdEo+HmbdCWqkHvXT39FL7EkE93ZB6Wpnu/dBSK50+bmW1eQU76KyVhvbcg9pGI9BbobdCb4Xeut1rb+fpLL6OB4tZlnyNf5Af8b//1lYbOuwOXoTbsFDQZDd1I65t0vfkalxb14/8jlyP1eyg21qb28Grw+yCo9v1uV7EBPUX6i/UX6i/W1V/r2mOl9Z+bZWh/O6e8tuwTtB9N6T72uZ8P1RfW8+PW/P1WMsOiq+ttd3Te+0yo5Pa60VI0Hqh9ULrhda7Va03v8Xl1WS4mgO4tSXow7unD/suGpTjDSnHrQuwH5py6zCOW23uusoddOjWpndPofYQOp206+7EB1UbqjZUbajaG1a1T04GY2KOPPIut5AZk0F2KXWlcCBvTby0UKB6lfUlILe6X1HWY909DJNJMg9Dl4reuWmr7pyTxGXzVntt6k9LasYFf7k+JWVNKMWG6nXwi+8AP/dOyturKka9UL9V3ueDpxL573IFXuhlDbJpPEhGyUApddll1caiXbMDeLEsXrOWzCVRRNdmBxDJxvPkIc5/Cf4zqL7i/wzjcdW8KRkpxiIw6Qo59nY0igfzy1qfqJV4ki1mcXgfZaL1f1Kj54/3tLvoMsUqCB668viQy0jYpH3gsAvkKkuz4Ewu1pldE9dGlrmgVkvKak2JZaj0UE3g1Xl52GIl3/CA6Rc+ms8//y/Ne3+SPp73gn/Ja/aEmlDs1HW1UxW8cFNKRS8QykVezWYMlnitr9Y2mk7jyfCc/zCKqn2Un55UocB5Nv0hwPknmGgvmEg01cxD5nKChZZloQ/x/NXwV6IEso38MzuNSmCovWAoc8ma+cqyuGCvZdmL7IVJFg2Y3JfiNEd9MN1eMJ1j9Zr5r3nJwYrLs+LTxzR3DCrzrwMjWmqDDfeEDS1r18aE7uUGC66HBd/+Jp1uq7FipRWw5B6yZGUNu7CmffnBokuzqOV+82UvERaVwZD7wZCWpWvhQ/dig/3WxH4bucQbDLgHDGi9lLiZA9uvAgcL+gQVNnC/KFhuJ4MMDfcoVoMNvreTgsU8WGyTN6OB1XaR1dpufaqwW6e71cByHVhu3Ze4gN12md3s11Q4mM3jEhiwmgerrQ93Hsy1i8zlgNuucJUPYD3YyYOdNgWeC+baReZqhget8FgH8F2wmk8y2Bbw/sB2O5ke5nEErZon1vVwKFjQgwU3jzkEBtxFBvSAUanwX1fgIrCfB/s9J/gBGHMnj/N0PKhdPemzCpwCWNbKsicnLxr+Ba8WtHyz5J/xLAuaCp68oN12HH+NJvNgnmpwh1n21yCZzYwXg3EST4i2Tk5yzUdRXpU9+dmrcRJlRPHOs+6qkZNcjMv1Z5puau/fC5ZynqI3T5UZFf6zpTOdalhykksVW65D8PtIQ26J57gs8Tq/mnab0nNuGhjcr4WGTd2vAV95UzmIXPCMZP260I2ohPiPYq1+UeWXKl9cBBbi/nxxok7zevFPtU1R05dZLJ8X9d/EAxJy6aSpbqeh93WL/mewjW1eMqxzkz9pRiFp6NY1idxfKjK8MNPpmxeOl46TxvyvQA6qwx4NDmUgovoujcN+aLVtGHeHMQxzr9ml0TQexWobVBZTxw5uVI5TS7s0Pt+zdG1DnRfthDu7mOsarPUgzG4N1OdgVvuaPoVzgREi26mBsBzMSBuPT+zucNuO+XRe4Fg1uPsrverQbcbUTo3W59RI6/pS6XBMrYQz2Uw4OshxWnO+d3iUjjMI3Zfz8UBHWvJU7JTK3pjR3mqBkGL0yNWlk/VwBlZLTd2lobWnR7cNb0QthIywShvkQQ6wku24i4Nz5dr6r110eIPT+XS7NCZn4mbbYB4PaTAVj/kujaktB7BtaENdPxwd3Nis0YGd8kd5Rc1b3W3cCnVVNRM+HOpAbaGjXRqlV3JS2yAZbXy3F3Mtw2yN4u1UqKVzpktrOCn30kSTYbgHHLz+KXgR/Pj+49vLYCHApW/Cm2A6i0fJbwJn+iYcxqNoMZ7fBFnKKOwM686ZCul4nAxjoxFxV0I0eVI5LQHntGQBtTmIg0g1GQ9F+0nGbd8mw2E8CW6fjEbSxUzeEDAIpuPFXTLJ+vlb3ZPLVWe6LV/iwrasMtkg1MkGmjT6tYsOPvsFdqMxKUBhMirnv9DTq188aidZGE2nYaLAxD8bSS81NOtkpIKmJVR+IncVFDYflzHmJRr6PxhL/e3/z97bdjeOG+ui3/tXMO4PlnY8TLLvXeeDc3V2PP0y6btnpufa7vTZp1cvmpYom2mZ0iUpe5TZ898PCgBJkARAUCQlUqxZiduWSLxUFQqoBw8KkMG8zNVZnr1xA3iZpaHeWfdrYgVJYmJayfk8+SNtvxUSnURneRZPkavD2jZL2k5skZUq9osqr9StH4qfttQrlimWdeqB/16rT6y5M95s0iNaotih3CZPqWPi9koH/cslDmTdzLWnbnfznZkVOke6L1YoSkG57VWSiGLvqQPhqBIsMjkpW1xXZuquzzRiIbJUtC8vVvnOk0Sqku2fTmQqy5aXSFTe2PoCVXR6ppYHFaekaVphFnd5KqRa2GrpXLrFxGcKKRd70VjcJbHMDERXUkCh9TlFyLdjyuKX7Il0IXVZdisubHlLa4tY0eGZUhQgTkmz9FJkuyBVYvxceqobOfIkRSpBviRfN5Qk7/RMLY+yLFnTcsuS/I5EeYEibgt0sVDJZZvhC5Z8m2ovXQpdmpU6CcsZsV5RIBKovySUEt7egWDKuUGYcCTtqysgWRdn0o4TQZXaIRcWx9aVoroqf9+yoJKsDkUxuennewop6dpM0l1BQLx+UTwJoF2SymfJFy2JIz2Hz+Twkv1Zq/tp02dZL0hnk9LFXhbh4FJvC5hsB50uno9mfS82rK4MSh2blftKZFKoPBcjyUGacrQkQ0e6CJukR3V4/CRva+1IStHlmVIYEF3J2iUKUo5wluQogxk7EKP0WCKToryhdYWo6O5MJQciQlmbcriKCXpYhl2qILwuEJnKs2UcrDHpUW0sx0hMM0NxAhJU1ZtCAxLokNSR/Fo8jpn2yOAwhXBq75KMwLDerXfX9LrD0q13evJK8YzKV8l5UP2rhQMyabf+7duLGz5E2qOaJsdScoCjICG44FJ3Zy0/P3FeMHR2Co/dq0mVWLzIriDy2bwo0OIxybx45m4UT8zOt10kRRTOQmZm7q1q9plBiVVdLlw6Ztxjakq1+psg3+zVaTtCzJ3EaF+GORiuSpTyK3GGJlEZv759waqgzioZV95AhOKWi1uGglYLW3vHTE9FXXFkt3PpFlHQelJWXiOC0k6kLUM/K4WsvQhiaE5Dx73vXOAcJq0p8WLufzTnZJmWA1Irl2vydO6DW7bJSOvty7aMxVbJV5PLGy22INUEuDWVqfJK+9FLNMV+q0RZTsaLMuQyLELJVaJUJmIdmi9VMKc7CIalmF5lVKzPOza4eE3Hh2xf5lLEukrk+qyLQ5O4joLcvsCrQexKENE86d7QVGFMDDbQS+RJBZkAw/ex8/wXd7V5dP9ie7ANEdEW/OKFT34EWPBbL/DJYoJnVXttvV+HRhiwXcyRWMB8lYh8A9y9nE6xnM+nFVg8Z42THMuViCe/UTG1vV+J+ophhNYWmR3mud2iMZXS+5mrh8HVRe0U4OkulMM3RRTM+PLVWKXcP51pLuXwtqW4qMz6b0FzOQC3qECTe+KPokdlHpnO1Fni0/ZbrSqI3i5dg1wByfdA2Sb5gzrTu5ZT3XcbkO0b2E3uoj+S/quSDXWofTUDfEjKL25r2G3cht4DY9DlIzqcUcjo6T23Dtk2jN3g/u3j2EJVFqPuTEBNpB+U4vl2kN3k6uc+qF6S8OiAus+Y//1Wfn63yt7nsuHjRG3KLEndRW/lwwv91m15t8ze96bbo+hYn02pMz0rzl8MQ9fJHp693wWrR9WzLPfSAbQsHCHpt47TXUW75pWeR9GqNGFTZ+oUz8b0W4vFfU17vwslj6JTXVKnzlQrO+rTcwBVus9kN7nO8DiQamWumO6wVfVBjn7rXrrBaze4Ru8omq9ME9WZ4tUHq/qt9+p9Zruty9yOYhH1ckh1t/lpetzrSNZScfnXNZWFdZNc5lV1A9j3buRZ9Cokj+a/oteAeeF3kb/wLP9ps/KevIC0kMiNzIvLpPz0sjCblPFBcV1Y7oYlqChp1aSsuKzA5CGeLCpToMGFR9nDfFT9vF543927829k+Z1WYblx7M4fLdf6f2+s+9BfgELvYYuFfGOF2wCudLOtzx4ZRaQPIRFEzMsjkVr86Fn3qdQgAdnTbrOz3DmEchH9lwoTLgQkVSS1wvFJuLhvQQYoL+xOIpo7a+LZD7blB6x8nrcsWX1GUzbInX9GqcjgAj8v9IJ56aDeVbBj7sXJHnbSh7hNPrshdS7w+z/c8Iv+wJ7Y1q9CVjF5YdlgOP8lXD8Tm0oEBJYiCofJlQwz0pGY+TB/nQwf2zrPCiJqCTwixvjRpfZ271nu/cqDXxdrUtDKDzyLomMRPT0K/j4in1OLFspxU6EKNxjy0SwQFqYFCVJSUOQ4pOtZAjflHY3sHfUNjdy5Jxc1fk3qSq9/pNXR2hrdA1ku1zG5o4+9tfRXHvFz0Tz0N8Qf6l99++7mzfWHX24/XkuuBAOfKSSBi7Yb4gymdvr9tJT/j6l6bT2uVws6+tbUUJ78xWLlvcDYJAPwhViOG2TqFxMAMkMgNXuQOIy4bPrJxLbt6fk0y+P3Wnjne2/ubskAP3eyas6T48/EnFarnbUJ/WfA6OJH8vliTap48txAKIQUQDzNk7uDZm3WUeTfk9fSUANeDB6iC+t+G7NCaPnWE5lvhFJW/jePvPZA5h46QnZkSGyJJB7dZ2L2K7DtnbUmDjukeQuFN3mGO6ELk+m5XTiCnH1ZecaXj9Sf0jeSnI2Zmss1Vq8v3M1m5c/p/OL4i0ullV9lz31YiJdJwWylffOGPpJ7iY6CJzcgM3koezH3AB9hP7G/slI2K3dOJ0eHzXiygtJn7F+S397Qh4UF1qMbBN5K15wkoWLkFB62nTfsg1Lj6F2izpzMcp6+ROFBehlt9AZ+FQpaf/MChwjQJ7FxWHUfb3Elln87sm/h73/wP4Xz3h69Atd5dlf+ws3l3JetN9mFuf9IH86nx92l7/JZxH73nEqcLhuVJn2pHB7ChYyltwo39/LvZ3mTL9v6LP/nRakUatez9DfZVb7cDma5v/IPFs10Vvwg/3jBwmaFv/MPC8YzE34vPJSzgVn+z/yjJTOYlT4pLpSJvmf0p7hILqzvi8rMPFYWKbCpSQgqDC1cHmtk11Cbp4P9WopL8t41L7h926sfkZomOJDddStSEMiYeE9ciAcxSdpKshY18Pr3HlFDyBqj9CmkFsmV3Um46NyQwj977rfrdPVbDFqli6bUi/BVqv3gxRPhpmWWQCXJfqhKdnLNggRFupPzn4BxHDwU17EWWR77dLF6xz+5+6uwJM2WpsTh7NZbnvyYrg5YsAHbCWuyYGBR2H+cF7jSRe2pZZVv82vr9uPbj5PHON5El3/60wOpZXtvz9dPf2KC+27hPf/paR2s/0T6RSLSP/1f//7v/2N6abmLBazhNuswprHjnCyNoMVrslIJRXcnJEzO0I5g/cL65q5e3F0ELm3HusijAaEAttpnC4yIhQpcfToPW6YdM0dJvkpv3U7vQLeLLpYEtktaFSzlrIW/CM6zBDYut2E2LGEFCku9KPZXK8sjUcd2k2qPduS7ZMrNvVeskC0G3fg8gtCTBCwLiEihCHq5/Zq1B8Sc77c4nmbiHxcmcxM3HGZibHKNJpWrIv6gsJyX3/5bdgQFZyBgRfWSYIdetCG25VWtSiqyZJeTj6dzm7LklR/FEhfLrnCHdRSTzld52cQJrdbETL2Fs90QpcQVFcXbzcoDf3iheux+R0T39aukvullRT54tkoGACiM6R8ThkhZX6q08VXwONJwTgS4Um3Nkl8umIzZyuFCIpRZ+aM9D28w02YfJQZett/MnipT8LAHX/XA9A2bisZd37jrFp0Z9hdDrRxnBDU5p8FGkvhFo/GU59YPYFTJGoxjqx9jS6abY42wV62wY9lokz5hMuwqztT3YaBVHfvHoXXIoVWhjf4PJjn3iQ2jwnc4gHAAjWQAtcAq4+s+2RPNFoBypscQVoK6luOw68mSUKek401ntIt0q5ot5t64qxXgwqRlLCF0mekCbIpz9TvnF9Z8TeHlIJ7dhlsvB+rJ3pvk6/iFXnC3Xn1R1/FV0H/GMnMcwCOrh6XhOMyMTUD7RdaJrW5g3jxt2xZlkNDF2UXz+7mWBEBVDonk3D6ntczSN15JJAf7VpIajTh3SW+Kdw/l9kh4V8Uazs7OgK6XY9uw00YceM9oMTZ5Vp25przrQfvOsPzJVNhHsVnJDmyZrCbT0nuQ2UVSXFrkBrY/SXcorC8tebVebyQFp4WnxSRdkzyc/2RqU+XweqYy7TEeSYXB+AuyAljHXjDfOS5w1Qqp2U0plgV15wtgRwEvjQfLl3qj6mthwnHWdKaIBCqZ2GTYnGBzSSTfgBMemEy1Uze4eVkdKRuOekbpZmv2iPOJ+Gr5XqD40M83724v2nM+ZOz84oXLdfhkuYF1JtLSziRDLT8R3UHHZ/RK0jWflS8Zn3D95MdkOrmw7pjS784jPizz+2Bw2YKb3Fe0jbyFNVnyzTlgQwKNilYygQl+Smpa5gX/6IX8wgfytV3sWUlJTkzmvyoRk3lzvXr2qAGA2BzWcDaZl8Yj698FLV6VE8rUKeU9SGlM1nApCndSLrLgTSTOQhj6F2lvhcHFuj5j4lVt9LKpzfmQ1B+vdpd5W1JPb3KPJRmG4swn9TLlx7mv0+zsl995XL/oB/vf1y8FS7iU61s6AcufdDmBmP6reOaRXo5EfuYlq5vI25nMTSb0ppO6PCWdI+9SWcIX0meSwSSMC3lhXO8zCUUte9W++vHz1X/dyKuashtqUz3pnRAriQ3jWo2k9jETbOZC25+0QYpGa8V2IVmc5D76GyjXnzNuuMImHZVR1hrHgmykPEJBSR+y3y9Ujm7/Nc4hhoFJ0Jl67C/mPSnGmZxmlKgixzOUco7qcI9SEhE/qSGU/cJvSmc0moWMetSQgqSwV4m3pPqsigXlUmDqUIovuaNKLsG8pyuXYOdpLrbaD+bm76yoHMfeVDjEGsShxIKoS10PuITeh+snGrlPWJeYbCU1FE4UND5PUKrgtfUp8ujQE3picTHCevPJ/UaWTtvQ4yc3iElJCgnpWTLQ470HlgeLRbJ6Xa7hZvqET0Vv97LLS0ZimmWvTpZEioksL5JZ4e8LzUuht5QwyORvwCGkOKXGuTy3LBxbuBOPlNyp3r5jL9yRNT8/D0Z+9eK5Re09PXplKybrrAYJHS75j1Whe2DLwokZZXxeKCyTnVrTVuMu3NjVPCIYz8zXzShMOB+D1S49I7IB/3THsy1QRd5RWmLS+EguI/EFRcumxOnkYvlv3k7rnArPVvqllJuWXGTLhrNuKePGzspzo9hZl/ic4n/qbzLm5yUVEynMB6Kjd799eABb9YP5arugg7qikHXokzfcFVsmWRNS2oMXQMAFDEb6mR9UlMGYjRFlOd4VQZ876+VPa8utKiMJ54IohoUAKemf2yiueOmuoKw7W/vCMgnmuasilZz/VvKvv59bk99InDMpFD79fXp2UdEgdvLpBSbsgB8OYufc7n55d+18/nj9n+9//Pj5rqKUe36KyQ121gZcaiJNcJFkqgqiigKix/JRo3sPziG5QHmdg/9ZL6tasWMuPOQribJm9dLWjQBRGspCpheVs7fyAeiz+lsWntfaVtIsAXRze947TFVhqAJkkMf4jVfkh0ceu0YfFdDH8VDI7FCON//msHaQ11akGNjiUUdIe0GW3BvWwR6lCzi2wq5GIFWVJ5gkrVSHRHaIPuoRyDIKqUBRFCOy0vnwqqXfiRDhK5Vfgu7COWYuHnkLUquaZb9WYg8CwoD+pjN/w/VX7XYMvEUHbmIbiOEVRVlrAXA6nImUNukFqFjo5NExw1cGqwiVD0pPUAYPjsf5Onuju5Vx2QF9G/u9kYMrG/Qs/6em9M3aD9LsLnb2kWyoG4O4f9Md2Bagqid3d+9BQlhnuQ1Ytvj4BaL9eJ3o20u0rfXhRtZRfkbmXoaMMeMM08oMUx5Pqqey8VKl+Dfpkx3MZia4f25j9oteCzK8H/cWOtxbSHDFGukpmPR/CDfzn/jL+XwmBXkK6hexPLko88/bSeuqXxT7QlojK0TaOrEGdelCyROJEB8pnCX3Mfw7++/sX7llFA5fJ5OiLs3F/qg6A5WgHvlYpN/Zb+hvH95q1mj7N1qBLCXeUyxO+EyLZANEcJc9nKBkFMZWbQ/k8LQ7KhialYzvsniK9xJQHGyGZrlb/Cn05pBKiITqMBAV72UwYjRf01FWIYXk+VnlNppdfkn5SmHHLCcEtlRXYu3VS7PcaPnjLBkaNllXPRCP4STfyYZRcZegwiVtt8RMP3368PZr29tZjfb32hqm5f0nmlchWMDgognachnbQrtye2qv95PdqzJqJt282rONbG8r+aWF/a3yzlTdlsk3rlSzlhvsJvGXP3+VB/HJKPjw9h357vbdz2/+y/nPd//l/P3d1dt313QLKYZEfokApupJji02/uGutlVLDbbj8nZNZ05wj+e/1W3Z7+fZYCbLjhBC3DP1foFSOpo9PYPp/I+ziq24Sd1+wU2d5f0lzX6HomvUz0i5ENvISxaeGqSFNXJWuWqwl+H6qeBAU1tRt7pl5sKFTlXgZc5zQ+q8cvuIjU7dip0FITpMhA5TVmHyntqkXls0GgKTfMl25ug23YZRjml2TGKeid/7g7osTS2Q/3TNCnLuvSUkwk1pDOfCFXWQD3EyPU82HDUl+ku+2ievwPABl+FaQlEJOYLm3iW9O3/WFZd0Xey1lysufmS5eRZryN3DtlPXr7R7pmtiYvk2bdww9uf+Bt6euA+uH0yhTNhZNiiSI3KFllHaNjtGpN7/zOZ8J12tVXkRc2YTC+KJ4BxJPfpKMqAksVbt49O6HqnocIX+GzldgYix8gTCd1aOnUh/av1hZv1ZW1LyaOZ5igmFXkISL3j8wuHv4fgcndomU6Ny7V9cMifBbu9NHJLBpW9vVZEU06mHiGQd2/jzbyvPXq3dRZSer7OfoTMaVXF1ZagQzbsLavIjoGK4QFDhQK1+ky57niEiAlA1nV5W2iRbVsAMYLCqyFYX9JDggguPJtmCPpz/lpwypOm9HZ6Jl6wmYB6zzvn8YJ0Z1sItlxTv/brx5sCM4fVoRQKezY3L4vj9/K/M5wOSAlkaH0iBZm05A2d0DoWdsygRimCNstwl3CpGCgYvz+JC4g5Znf9RXXyFlXBnyIpTP8rwafW6pODJinPRK3O/pafiSCtniS4XfrRxY2Lyob4IA3JZbhEg9KXKv9WS0UvhOr02xJMXUY74WufFvWUrEtje0nR5fE3EZ2VYvgD76ZsfUC5YknuTzSSw+Ciki1ZXwsQSscyGL+BlgGxICU2g1DsroSksSXl2ZYFpFtAKk0gB+8wqZsLv+hepPRW4Qxf5xLH8FkED1/oarhTw3RVpM13LMJ5ilnsb8mvDlB0nvsg2sQBW4CJlPeYba6dV3q751Gjk3xYw9z35gR+RdZsm5q/huJJdk6yp9Uha6sk65XryEcrOnAt1GZTE23K7Zi0RXr6wajerFzP53rM5m2uv95vKyfg9q1FL29O5ed1nC39BZ+00HSkgQfN1GMIczqb2/zArzsTwiVeus7VSTFxBTDzBC+G76gr52h0eFhf8F5aZDZzdMOYqzyvLCKysNMop41eoks9SrP3urA0PwaLXBKZYniXnlX6Dum3h29/zuN2Z0ajMnxChnGrTYEjWwD/OLHYSOUe+YQWfn1l/lNT3R+vsvFpQ3qrQWGOwrF5TSbEzaGcBBYPqDHQlXX9wRgU4HqeUehwYg+HOzARX6wfIns7+uTB6RQTy0uzrpsuwgsRmwu9mL5fZHbPyR2ZFae88Ur4ksGkUe/17DkoOZAEARA+ICMmj+W0ixuu/C77gYaXxiIkxVDUYkAgv0fVoRHq42MKxJuoq/2DqDwHLSDde6KtTQOr/XC0Drj8pdipP62xm5myxYj4zv7Z+oWd02JrZXwpLyUc3AqHy1eMfjIssnJxh3If8uvIPbS0smywwq8Gwsh/V7WIa7karQKdZTSjLuNUULJrl8aTF9mkTJcuvtnpjMPQ5GCqJeCC5/WZF1DjhQ8NovS4FL4BGl0sGwc79V2dA4HyTwmo4fwYkh+DlMhjZuaQP6oPesypGJ2OpKvipchqt/AjOhSpJRSKh7NTP2ET04fbd9dXth48/X1Qk8riSnPw9Ozv7u7eCI1zsIQAuNvQ2NXqYwosBsaM7YPQrdjrjjiF7dKYq3S3ohwJ+wc5JwotZ2HdHz8cfOY9IrewePc3MkeNjNzbYWkabGa4aY6qyXRVHXpkeKy99PCDSjL7bCrv1ZE2wH6er2Gm1ygMIinPzhVmSZ88rXJNYb85jU8ies92e92skJxbc+zn5P5m53XksHGwQzhuw11RXRBn5ADmdwvC24cqLGYp3DBve5CAkvaWw5c/r+ENye663oACmsWjpn7UlS99qIthm1zjrD0LXkCt/vn2xSm6zMJeu+HIPrTd/9YGxrGU3JrQp8ttsr6qR9BXlNFGEUOR4tLG7XafXrPNe76ELSSnH8ztG+e+p3Cue7E7S735lh/fakXihNJS87jaV9148f6wvcEkhPZxZZc0su5vjCT93lc3e0v9cYK4ces7tpZn/4MWfH9crjza6/lJRfLuPS0axfXWXjmLawOaCfu/6q89+/Pju17lHA8Pawi6VgB5bKuErxpTbW778fZRuTroJOFBbrMmLjRyvCq7bQ2bKQZ9U0sWKWX6dlLkQC+/3MHAstPCoywfd/UM1InVZKX0M2eVX05hHi7qrbdpUC3jFxlqRFdLDlYesmTV0In+9fZWkweBVsGhn1FSW2FespbLhdSDd6rJq6PLVK7Zfy7t2Q2KZlRcDgsWQ94kEzJ/yw7l/I/5244Xx7lWyNUDlVNwZMN0VmKivgX/VEPp/bd3S3KSQ1O/FDReRBdQKN/bvV5612IZpzmYvcJ/gD0aeotmg0xzQr5ODfyzP6XneVs8v0nwGgfdCyl+wHNL81cXao9QhP9EAZaETO/MDongoEnaT0tbS4wK0evJYviJOD01a6kfQWE7nz8bKsbcwku9VOxbF74sm+9p6m6nlyX/gSRMYFfoXN5q7qzfEks5BcudRQCTlzOnfhVRVr61EToH1y458FaSWFV2wcwGrFa0kV8oz+VrM7EBzxBK5upRUThQNOgbiIuSDIQXQM6hA2WPkZkjk/wD64z0QymGGobZGYEdEcL4TUtxQZjuceS/fEPLagjQYob/wGFswJxTefOs7MB/awOThzCZzJg310OfYgdHUFEt7s3Rfbl4wLuVmZpS3DsFCLspD+pBD1PsVaHGQur3BOM1G27zj0WaewLe1AdjuDuH4HPCRdzqT7xUbm4Wv0fsOyPs+5C1rpM63jTH6MOQx2gnXYHx+uh+cifR77aa8/Cl03gNy3pFH7KZsb6NfQSvk0qOFdBtDs2uy0vjcdz9JV8n3itapzUf5Ajr5ATl5IfuFgw5f7vANZHSiQ7dbjuQYp4BecT0ze5A0S2c+0sfR7w/K7+/gWot5okV5XlIEa/Ya5tXCPa2RfhiC99ini94Q1eXWUWieqVGVXsNpZMjTiMfVifNJl/OJWsqn7Qs6Pc8ywvmlV+dyUpswOoajfxonkSFNIkSFzoro0OGZBJ1l3hJx6th/6qiS7SmN8m5P3I1+fjj2yUGFMbBCjW0neRyniEFPEbIE7OPepagUUY92qLsZwt2cAx4hIbQf55lTVpn++LLiMfTvQyKKerHzAspjCWVx6d8GZVQl02GP4+5yEIzP0fcol0LyfalJakORPIpOf0BOf0n058A1BI5Xtj90/HuPaq1cT2Ncd5UmZbxTwNHTvRS1zxtUbSbpg+j8B+n83aLloetvwfW7pzeeW8/eNBZv/zeaOEOaqKSclmq+itrOSpVoOEstpbIBdfIpdOb9dObEXOyXkhEpXfgJ+WvNqHoZyqjqKqXb+NbRvUlNl3xfmYlO+SC63gGtoxeJ9pxlwfBGvyOqFk2PdkLbG6bdJowcYbqFfiW+zL43SspX8Tj6+CFlYgAdEpPiSnSeiraIORmqJNSn7AydDOBO89KOz/n3K79u8r1ZOl390+j5B+T54VpIdPydjPAq0Z7SGD9chuwRpi/ueabvNHtq/cTeNV7FWWVISZHTg6TkPQeji8qcyfXkNaJhrkvXv0/2+1HdbPva+hy6G+Z4qBdjTmjhPXsruK3gPErsnTg/17qLNm5wl9q4L7oBMjfBSPAW1pbeQu/HkbXcrla77/7/rbvylz75hrtP8HqZcwCugESGUBgpx4YqJVcfg8gcKGi2PJPpdnL+G9eCzZ71F7+fT88k19eT8pOCflM3I+0EvfyZvsCubvidC3ciK3wFgpypS70Fif0ID9lvPt3cfvzp3XW5kA2VmhNtvDlpwXx2G24FayncKg2tg0UlNQ1rlthYzmLekynwF7j9Z8Kfm2oups6bzu2avVhqpODb30gS3hvd4i1x5tJuSe7cLtx4vU/W9fFcvIyjvoVRz2yk14NeNJfKMc+MhLwsu2eejOofyonUWx3UF5WjWu2jcnaeuCjmkZKOTZsk+h75reHoL1rwFznD6bXbkNhQrRWDzJhM1g3yodXj1YM+vTRedo9OpG0nojKkXvsTfXLgWq6lIm2wiZepHIu9djjqVMY5d9OrHL8d3KKMzqQVZyIzk567EnXy2MYRTsWw6VXEo02L2zQCMkmFq3Q3vckRi25nCG6naC4Dcj/yFKMtuyHlcOqxO1IkUW3sltSJU0Vv1KuMospgySz5IHqmg3ommen02yGprai5H9IOpH65H01uzpa9Ti4fp9rtHDtRJS5+BuFiuJkMycfkEiXWA290KRSNoBv9GOvzPrMkqaO439yPbIfqfWR92rSqkwjoQ9rdec5ZS793oCWG03wnWj5a+rUjLcsg2HQposoaKHiSHqXTwyVIP91H2UR67UJUWdsauxHNUOmVK1HmomvLneTzz0mcydETs6Er6bcrSQxkEI4knwWsNTdyJcsh1zsnUshs1tSFFLKZCb6jnNVrDwikMgGRuWNQxii6fF/oIhq7iNQOeu0bCgmsasEaRQMyQTI+S9OVGXmLmi6hYRYtYUT3Jr2UcihXJrLB1cEhh37RYHrtAeS2U8sRKNIjmfgD5djqMaapO4MtEub7lcNIzV41O6lY931cVHTBpZfaVL9J9Rrzqseu19mZEc1ePyB77HE06YEEh9OvvDlKf2GWZKPm6+htOvA2UoPqtbPR2FZjvEM/vHoFeujGSFPkwzQbjZhOoOdpWtTZA+ondGhSFjqxLpIUVBpfv/MXGJpgvdQGprZolPXAfHQfY4n16hXNFZ+d0WTJgCb87+/dyEs+Ixqhrzvcb3D185Y+uyH1fvD7P9zwS1oTf4w0DCzjI92qcldfcl7nK336K9GrttBMVOdE8M80Q5E7nxM5wuCnzaJZjjx3/kh9woXl2559AX4h9Kwnd0eT82SlPG1Xsb9ZeTTlmhdGlvcr0Q7PzxMQPYVeEK/IW9uYFfrkPzzG1qP7nCvGtRb+cunBw8TNQDPuzjP18OROs5/XAVcan06o9/eJebjBnA3ICysZ75fkt3AqOrurwEqetdZL7upCYkcLi6kw7Tktw7Zuc9mhnvzFYuW9uEQO3zxvQ1M7PWV5ichfO2tFSiMzkwV39cK/UAekh8olh6KGTT6LaGqnYB0X39iEa1DJJfl+DYLnRZDWC6XQookfSp62Jq61Is0Orbtr6k/umNcG90ha6e6mVH20KFkxTPn+gnlksWYwXSahzG2TP7yQD1BHkAyZB6BDoKn02UToEbHO4gt2qr6o9Dx5PP0SbhGdJKrNBqG/zJ4mVUO1ea8nlMWqdmhHHGcylT6X60y5udJ3oi9Jw74KTS7m6Eo/ZxdMEK2RGTbepXbMLvKkk0o+RSy4ivyKQzxRztRjM5dCpZSTDteqTDQsv9P1NoBsZjSxU9mRnvHBaCXNhaLWARnQoUemMDeIqbmw5UHSmDu+ajhTrCe5QGjJXBqs9ZEXx3yk5CVyATndHNlqa3paomFNfbPe7GC+naS9nu6XcmuEGRu7yixWTsamSBVW/B6zJw4pe6Ikw9ap33Uk5ELs/eBpnuxWTEw2PvfYVf618n3g8oRqha/RNw7INz6U85SNxzU+9HvgtHA/UDnP0givBeo2B135uhBtPij5U+gzh3S7j0csQ54JaTy+UyGEfg+r5h5Vn8RufM71wLn6Slahz5YmMZCKnGjoggfhguNMiw66YzIODQQy2JHYhtdWZwIco88+TMJDiYmo89FJDUSTtQ0d9UAc9c6JqanwC1nmssxcY/LTVfIY2vBr2zvLEyiO3Ut3nyeywlzk6fsqzUaR3A699zC9t8fViW7cWDBDH6At+Hd1JsoRuvXDJNwsG4tRBk390+i7h+S7iQodICA6IVOisyznpByRx64Sx7CGXuteOZepc/RuubOEpFXGkcsXWW0d+ayQ6JkH6plfJLk5x+yaXwY+/FpgtElSoI6Q2dZxptcyUUefulXxGHrfITHevNh5AeUxEv5ouW8qMfR9cDX3rarEsOPzr4fIf1syA1WKUokpKJN5oq8dhK9dEv05cGDK8eRpY8fjb7WiGMpga8/35rPojtfzdpcsWGkK+YyuGkMoZD9Fnzswn+vKcuyO0eO6QxxkzX1tId3wWJzs32gyAMHVZCZRTiQ7X0VtZ1lONFzIkiuxAV0yZfSwffSwxFzsF2k24lP3q5pR9TKUUdXcpcrTPo9v+dp9duuS4ivTVSsfROc6oOXrItGes5Qkdx7P6lUthyEMsRaOLmuyRI7wDPOB0oKXT12aJbCseBw98JCON4MOidFwJTpPsoSMIzroXCWOoQ2+5r5Zk1l8fK75QAnUS8ZhlhFd/zT65QH5ZUjGim45GXZV0hjWwGvuk00zrI8we+SxEsmXE+TVzwxf41V05kPKSZmeHCPvObjkzqesrCeckxq1mplgr2zB4o0aXWUCbXxjhiJxaOULkrsvPCt6XG9XC5aN3g2YAHxiqG70jQ7S+HEbJb21Nl5YHkOvrZUXn9OHln74RAcEJEffPlFeDDgy7piibVjyB3dOLgn1XSm/ui6XdfJW+o7i4SjJnJ6lmY7DXT7hdWs3gTS8DUSasj1N8F+80iOfwn2vm0TavU2k4Y0iSUfhVhE2AFWVtHJ9SPUVIpJrRHRXiYhjU3JfSKmcwqUhuZGqvBkkux0kzdn/RpK12fgqEIOLkcoXf+Q/WfoBGTSFIaUZjTBqp3tlLBZcdFepfJt6aEUC06rn0T+jfx6Qf2ajb1DuWRyY9b1zbpjWcc4/lNNGn45vliT2FG/o7TadcOOLebW59wxfQ7+NfntAfjs3JAflviWjtb4Xl43dOs5c7tFOy6fr8zYL7v3ACY3R3aO7R3dfz92rhuigPL8+XXL9SaAim3Kd+aDSBZ7a1KBODp2bGA6TNdlwRnhYrx9Wnr0Brd5vl7ZHnOqO+vZ38JswCVQ8iW4f3f5A3L5sAA7M6aszMO/j8jUJmus5fK1rO2V3L882rXT73adhRveP7h/df6X7Lw7EAU8D8sTNTacDRV7n/acFpes7selBnaxanBUOk8W5KTpklnkWZwicIU5ihpANymFNDOrxusd8oEkkXWsa0Pq6k/b+uaTYavffWbZoDAbQ1aOrr3b1fAAO2dfnMk83dvb5xNQNvP1nSWbyE2JhSrJsi2zMjtNPN2Zl6hPq6tmZXojeHr39MHiZuXE4LH6mZIjuwdOUpcSuxdeUe7LT8uaqvN6CRz9EwmtctKMbRzcucePlwTcoV65KpV3fnSszbddx6RpXdppuPZ8yXOLUu8uljS4dXTq6dI1LT4beIB16Plf3/u68kMp7H2d+JUvZfjquvJCRXPDh5czce4DolUmEzR20EjvR5exuyTk1cEz7OKW9HFJ7zqgdR5Taj6yKVryP3vMUvI7C4xSSV1e5mrybKVqe0r8UfMtnab5yI4dS4UzyjmTaMIu24A26Ty/dFHqtTJWLKzxc4Z3CCq84FAe1wpOP0vorPEW+6zorPKVLO7Gz85rUg+Ih+gPls258vNIs31fd9/HAJc4BQzpfLx2twzporxnIe5y41w3rWkfv9X7wtOYGTdpwYWo4UD7tpjODWRbgmq/jvIDzwoDmBelQHdS0oBnF9WcF3ZiuMynoPeBpzQmmacvFNLbHyufdOM1t/UTCTcrCyQQnkyElx60c1sPKm2s42PdIqWs69Gtl2zV3qgOZgF69eq35z3qz8r2ADFLdQ69eW7dwd4JLXEDqGL5bUquyyNvhbrP2oRC4ccANdtY1NT7aYZv8QQzTDWKaPX8dP5LS5rxS8LTpHQrW5OVxTdwGveCCPEv6u2C5+f2Hxzh9zrp3ySNQdHRBnKX14q1WpEjy23oZe8TvejQBP6+BvP9EfMmzF01tIgnrKo7d+SO4fO/XzcqfQ1V+ckXCv4jEoOazwCUKP7PuFkSW8M2dtb6H7D+RbV3Jvk3S+7PphFSTFmdbN1tSH3/dckPadB9c7Y5YHVHdhlg1cYqk/aFHfo+8gN4gsFqTZ2g5F9b9Fi4LgPnq3qPzDRHSgtQC4k5Kzr386faNTVRGnPGjt4LZa7kN6FxuLfzIfbr3H7ak7RHMUYkYSHNcKpvkRgTaALErIJmyRNg8wG5NcFdwG80unVXzImbi+LCkpZcKekXnjqQE+Aae/44Mz9Cjt2tEMVwqQXr/DNMjM5H1NrTm2yheP1l3b0mBt+Q1oA/Av/8bplVmgq9gveQFMA87j27kJKWzsfxvbCjCHSrpkgh0RDzmRzqVu6sv/OOk0ekv1n9bxa/gx8Jbxe5X4gRhDF68oksYfcncXdMSZD3RVsRcgr8kEkxnTOjOhaVqt+C/uVM1bIcN16akxdBamIfixcAHxOVwt+R8Iva4ekOM3b1febdEF0QmeUHAh/9wyUSrfOWcODF66XLq7Mh7ZO21DlgnEt93KSn5auWTgTUrvZm886pQ9CW/XaJOmWlRdA2Qtq1Ga9ir75ZLGFAGL35PPGDq8flrrIyrLZm5Q/9fRi3PHuadZut69XtVB2lYMblM+XsVlyshVyZfyzcplBXBmipmjd6/42JD8wnfGxQpNlOSGG+voiXlSMpv0HZZQawL+jR/rfamIgNg6x1Tp7LSVVXBi9CVXd2PqsIlpcuzr7TbA0UuluY9UacL2EvbmvI09XXTmdx52Mbq0J2Obdxy2Rmv/VygpCBZDU29bDJjqU40NBW38nxDY1HLKbtttbdA4G3c2gLdr2kzS9TTfQygWAhrqZwos1cF8qLktbQkZx2+st+0pylQV2OTmVZXIuumZrNiryo15Wnqa9BHXYF8DW2Imu23EjYs3LQlTRblpqUzsTgM3sqAU8fJAkoR8QR0iG1MQDN+BohViu+ecZSRBYEsRLh1o29ZeHx2dnadQCsR3J45f/QW25W3YHsFIZtJKRQj3s7JYDi4v5BB/2x7gPwvWMeklPmaDP/YJ3H9vTd3AfN68Rg4FO5IcRlcv2aIx46CJpH35JLoeB4lRXqsEQJwkrRnsg4FYvtqZUVr2JPwprbYswxi/RuVQOHGU3a/cBz6XjHr9XwVXcgu5dTuKfFlXwZlCA95fGloF9aI+Vr+Lf8ndN7xF1ml97Hz/Bd3tXl0/2LDlxFbzpHfPiyUHHWOXJAuJdsMF0nJM/6vgEXTrTfHD/zYcfIyyW+yDU4ogFEBXFXcHnrrbbxgATZFDIjdTMtaDIPMgp0LuAsWkMhtTH91E/jX3QD8R2/bnRYKfQE0eQdvwT8wJr4F6xdavPCW9eEtBQzJ0wxgpA/5oB+AmfJFUlSxICj7gYzCF3d3x6/WhSH/BKPOj/M7T68LhbHbln3W4eU2hh080grv1w29k3dtRdvNhiySrHm4jqLvxDYDtBtdkHcLRfKx+OjPH605hbDFbTYqBwGL3YA/gh23oCAQaamPXljYSmP7Z8KroknoMcjMgV5lr39YJHBmfscuhzmmw6fa3iUbSLImkzqT/bf8F5LOzh/dIPBWDvGRZOIIhVcL30je5YMGpir2m+AZyZqLKIivPRMXwB+bwOsivKsdbVK/k2tA0c/Q3SniaIrVcA3+4AVe6JJ58wsFmhncnN26m0O8vuZrJ97/CgpnmzZ0GmF7Ln70SPdlWPMiuoMb8jJsmDNyu2cpHYE2lBRFezLJ3/6ruKU2dZNMPemub0FdsOedfhav2RJAvg1nthLISdzOVhTTi/qFXntLaXmht5zKDgpJDpBt74U1jNR8nIdwM6c2FN2QxydcGJLSStv7qYxhb1+2VIL6I/tT4Ia7azrVLwB71+xykm9nzM6AxiC8c0e+I+6PKjvjExDzAfEoy4P6HbbumMHv9mdiSOo9VPYk22U/g0fP1M/yndaZfmhCIXzBO0mm/ZxGp9rWuAs3diWb7o+UbhnZf2f/qgWa8RCIzcxaNLbcOM05z5nM1aoLmNpk1IEJOkl/J5rqXAYe0Hbnu2OT7tj8a/tmF8XeE0caVJvh0o9znsZJXBMxbraVD1ZXes+jCIxl2BzYjPXgrnH5WCKTHv3Wpre8z9JRRUcpKGobvSHf2D9/vHXef/z089tLtYnSW84Nm6W3IZmV02YyM/8UwOIpuKXeWa1qC/b32Dz/StngsnhXMr/OxiBTj0P0xURasQhhQIeTAB2OGzCY4yrYSVcgqVIiVj555r27ihTN95cK87FLDbU/w1LtY+Ctl5Oz0rdnU1B8+vmZRsXFV0kLjduQfCItXS31gkCAv9NN++hPuag5j61cPA+ClZpUvWinE/jU+gOR/dkrrcWZ7wVOpkpjUQ856EIqYrZe0rc3leLbdzdvrj/8cvvx2gZmHJ3L5P6vD37jQ/DsrvzFVfiwffKCeFIx0Twx2GamfWh5RteblLb36dOHt1bClttuyZwGn0zud0R5+XmYztn0kenv1llFBY8ugDWpLayXLFw9/02npt/PK8o9AyYOCwIpTYYWaWhl53+tKhzwn916S0cfj7ddtjJfL3nkHYYQf7JF0H9olj6VfpwGbo5mkitO5RltgPeLG9cr5duvrQ9BAgX8z5n1Z/v//rP972IUTXrEhg8QwwA3uOModzaP3qkXjv5SMuQ+RJP8PAKrlogWxdFl+FUYgpoxlizMtlG2cNaVqplWpX6WTMkbd/5twgqqeJmOd1EfjIjD3k2LMNLF/5Oqgm+BAJwYrl/A5BbefEXMcMEUExG1AJdrYW3W63C1+6um/BSjcf0nUKj3tF1RgnPMS/FJj0krFrDi5JhoHtcR4dNy+cTmIjIgOM7KRGH3Z12l84sKveinb6W5JF9MNa/maLI5LyTSbJNyZKhEIZy3MyhiKrJ89uQs5V4uI/CJXtT6409ME74W5U/xxUu+KZ8Csrz88koZ0OeK/YEMbFrMheELbEgVXvmatSlZ89In0k/ZoY9f+BK3R+1Om83D7HQVzrshaXjW15/e3f7941vnl+uPtx+///TeeXd9/fHauf2vX97dXForP4q/gN/6IinjK6zsv8jk17wwipBrmlbA0jUyvv7lzV4vXr/7/iOJBKWviqYC0eSlIpYUNUMXWMowKorDr/vtVqh1rN1vMGlQyoQtbC2s6TI68vj2GFlpbj1KIQXolm0M0kMkgbUOFx4sFAolUD/Pqc7kf+tgtQMG+YJRqylfvlxeoQy6UuLKYui9XZYLg2GKnbwB3CiYe3pjLM8v5gbZyCinyj2vaLuBewLs1DYKswBbeHPVJmG35IkkYPRy/k0sQeJH0udfmcCsLBykf3DwK1/ahaigQjcYQMPa8iAs2uBzhy6g6LvScgtFkeUmLY0fvSpP3K+tn7ZRzBayfKWVHKCBfa50ZcVPU7E5vYyFsxYrEKWr78mn797KNMFfhH/0qsz/TbpV+CCLzukKJRnfVRsimSAp9s8mNc2GR8EC5IUWVJIVLxlqmrqkVlhVN0iytO9SUIimzrwi5FVw0ap2d3IuVNu9ooZUm/lizABb+Dy+uTQJbwoeJBnJpBi2HGbjqVzCwotdfxXJU+dto7K7gxKrHWNheAr2zUI8wcBXXjDJfzq1/qf1Z2beZc+WwLviULhUnUUD1gB3Qwn0wf/N+aWZqlOFbhhLlVmnLOzj8FkZa5NscU/uveBxemm5q4gSTWD/PrQevDhOTgHR0B8QqogaT6GMOy5WruM7CoT5wXy1XbAC4IhoYN1xkdxBYPjkfvMKxSy8++3DAz1M5kY+iQ9evaol6qmp6dM5AKYW+Je5FDoMch/l12Aw217562u+wFZzR6R2LOqwXHfuL0kAmXQz91wi7GLEaSIEH4Yjm4d4E/SsnoI8CtA8b57NqVpFCovtbnz7J2KnqwLLhHy5kopRAO6FUznIx0I+FvKxkI+FfCzkYw2aj5U72Xc8Olb+iCKysZCNhWwsZGMhGwvZWMjGQjbWEdhYuQUJkrGQjNUFGStnZKfDxaL/IhULqVhIxeo/FSvng1phYhWxcmROIXMKmVPInELmFDKnkDmFzClkTiFzCplTyJxC5tTImFNiwlIkUCGBCglUSKBCAhUSqAZNoJJl4T4ej0qaXBzpVEinQjoV0qmQToV0KqRTIZ3qCHQq2boEWVXIquqCVSWztdMhV4m9Q44VcqyQY9V/jpXMI7WW9EosfM/UV5IiVLg9krmQzIVkLiRzIZkLyVxI5kIyF5K5kMyFZC4kcyGZa2RkLsWN1sjrQl4X8rqQ14W8LuR1DZrXpZjfjk/xqmgYsr2Q7YVsL2R7IdsL2V7I9kK2F7K9kO2FbK+hsr0Ui30kfiHxC4lf/Sd+VcTqbafb0nsL5GwhZws5W8jZQs4WcraQs4WcLeRsIWcLOVvI2ULO1ng4W7vb9Ztk6cbJBMjYQsYWMraQsYWMLWRsDZyxJZnd+sDX0jQL2VrI1kK2FrK1kK2FbC1kayFbq0O2Fud3JLZke0+bmFnTO/gN+VnIz2rAz6qwrlNiZEmW88jHQj4W8rGGwMfSxOLts7HUngK5WMjFQi4WcrGQi4VcLORiIRcLuVjIxUIuFnKxkIs1Ti5WgciBnCzkZCEnCzlZyMlCTtYJcbIKQ6Nv3CxF85CjhRwt5GghRws5WsjRQo4WcrSQo4UcLeRoDYejVVjWI1cLuVrI1RoaV0sRm3fL2ZJ7DuRuIXcLuVvI3ULuFnK3kLuF3C3kbiF3C7lbyN1C7tZouFteFP+4Dh6uGdPpvRfPH5GyhZQtpGwhZQspW0jZGjZlSzK59YCppWkVErSQoIUELSRoIUELCVpI0EKCFhK0kKCFBK1eE7Qkq3nkZSEvC3lZA+BlaSLx1ulYaj+BLCxkYSELC1lYyMJCFhaysJCFhSwsZGEhCwtZWMjCGikL63PoQ3SKNCykYSENC2lYSMNCGtYJ0bDY7NY7Hla+WUjEQiIWErGQiIVELCRiIRELiVhIxEIiFhKxBkTEYst5ZGIhEwuZWINjYuVj8VaoWPCctJZ3yyUZ6CXKA/jdq5XvRpmL+d6NvBsvfPbnKnfDy6qE9pH4hcQvJH4h8QuJX0j8QuIXEr+Q+IXELyR+IfELiV8jI3794MWfH9crj239IuELCV9I+ELCFxK+kPA1ZMJXblY7PtFL2hwkeCHBCwleSPBCghcSvJDghQSvDgleMfHpkc2H1QNblFBj4gsUZHghw6sBw6vKvE6H4pVbyCO1C6ldSO3qP7VLGn23nV1L5hmQXYXsKmRXIbsK2VXIrkJ2FbKrkF2F7CpkVyG7CtlVY2FXvScd/ezHj+/otgtxhsiwQoYVMqyQYYUMK2RYDZphVZrZjs+yUjYJmVbItEKmFTKtkGmFTCtkWiHTqkOmFabSQqIVptJqzLMqLeWRa4VcK+Ra9Z9rpYzB2+ZbqTwEcq6Qc4WcK+RcIecKOVfIuULOFXKukHOFnCvkXCHnamycKx7uIeMKGVfIuELGFTKukHF1EowrPq/1h29VaBCyrZBthWwrZFsh2wrZVsi2QrYVsq2QbYVsqyGwrbhZIdcKuVbItRoO16oQf3fFtMp7BzOeVZ68ZExaUiYUpCVAY/4BrA8pJca4EqFNFydB9aottTHxw2oICCll/aGUMeP/bySYIcEMCWZIMEOCGRLMkGCGBDMkmCHBrGWCWd7LAXb4w9YNF1+EdWjB3eXZEtwIFJVNlWOVbWZIt59kgDLsSuQT7ueDl3NlRaVNAhWB7jNHj5A5h8w5ZM4hcw6Zc8icGzRzLpnQjk+ZK7YEuXLIlUOuHHLlkCuHXDnkyiFXrkOunHLzs7gmQdYcsua6uAyyaGenw59LeobEOSTOIXGu/8S5oidqmzFX8AdIlUOqHFLlkCqHVDmkyiFVDqlySJVDqhxS5ZAqh1Q5pMohVW7QVLm3bvDghett9N73VosIGXPImEPGHDLmkDGHjLlBM+YK89rxiXOKBiF/DvlzyJ9D/hzy55A/h/w55M91yJ/DXHPImsNcc425coWFPFLmkDKHlLn+U+YU8XcrzDl4rlD+u+WSDO4SXQO87NXKd6PMoXzvRt6NFz7787Jz4aVoAHu8NBQvDUXaGl4aikQ1JKohUQ2JakhUQ6IaEtWQqIZEtZFdGnoTr0Pv2ptvw8h/9ng9SOdCOhfSuZDOhXQupHMNms4lnd2OT+rSNgupXUjtQmoXUruQ2oXULqR2IbWrQ2qXMtmFdoGCjC9kfHWRJ01rdKdDBJN2E+lgSAdDOlj/6WBaH9UaKUxay57UMF1ZlRsBSBNDmhjSxJAmhjQxpIkhTQxpYkgTQ5oY0sSQJoY0sZHRxK49d4EsMWSJIUsMWWLIEkOW2EmxxGST2/FJYrpWIUcMOWLIEUOOGHLEkCOGHDHkiB2DI6ZbnyBFDCliXVDEdDZ3OgwxWS+RIIYEMSSI9Z8gpvNQbV+3qfETyNhCxhYytpCxhYwtZGwhYwsZW8jYQsYWMraQsYWMrbEwtt4kq7arYIFJvpC+hfQtpG8hfQvpW6dH36qc6Y7P5TJuIhK7kNiFxC4kdiGxC4ldSOxCYtcxiF3GixVkeSHLqwuWl7EBng7lq7LLyP9C/hfyv/rP/zL2XW2TwUw9CDLDkBmGzDBkhiEzDJlhyAxDZhgyw5AZhswwZIYhM+y0mWFCqPjZc79de0svhFXW5X7r2tfWZ1gB5kkbyTx+QeomxUdgmS7bv6OgJSeaiC89kAA1sO53IuUmP4G3Su7Id4JtEIokIunO4oeFdq1+7xHVE5e0/uYF9RfsEU/UrXxTktS7XFJxJSrnmFRyS9IdU+lueH6zlUFifgnPSSBNx8nIAxSrd5ziYEzkXxxz5YYRF/q0WcfEYHcJ86GGJQhv2x+y339iBUl3zli1Id2fpjSAKv1c00eBgaAp7yX0Y8PyPtNHq8rjmKJZifzhijLZ5r9JgSnnQlOaODjIU+KfMvvjBk5X1OzXquVeYkNlipJiLGvWfKn52yWKEtBsBGtogxLJLEZHjEwfZcZg9Oht6AaROwdNmRXNraIZQVNkO2Uj4bK4BCyNKnXkV350Vq5AjiXzvs3mMhppmVVS0L38cdFwZ2XTlrGZJOtHaf+l+72psCSer0posldSlmB+KbLS1vOH9C3JUr2M+TPDclcr+yf/V2/BjSR6V14TpftzFGO6yy1I7uiuwx3X9R3b7SRrC/lO3/Ls/DfagcQP/H5uwR7mJvSe/fU2Wu2I6ojrofgVWWa4inLOFv6SNiC27njD7wACg7U2Z7OvyCjxFraqgA9BFBPFJhwv1wq8F2nXvGcv3GW1QKtAaLBSV/UxkYZN7HNS6vD0zj6rsL+cmxPsT+LlhDmqDS93fH+UzaQKfyT0uGpoiY/OyhUM0x8V+o/+CP3RQf2RYH8yfySucU/EIwkrcZVPEntd6ZVyD89k1QzUMxWlgL4JfdNhfZNogQXvRCPl0/BIaSivcEcZKFA1oIQnZ6XSh+mF8p1HF4Qu6KAuKDO/zP8wIN+59sBrPHur3WV+d0cN5cu9lATW7hh7z43py0q0ufxyM9jd/GCmBjSXA+fp74pndZBo7pW/5Tu1Joa4WruLkqKptZW17DjA/ymj7vAN9xOOc1lj6tBPSnXgzPz8JWsgP54GfMw1VWYEbU3GFf2Xn0uTvS28Ymyy1BOy7yOFzZTZBFdw+vNDzE+nxtvNyvtSaCQjd7JDq1+JXNhD+SOs9F9Ov/z6tWyatm2jaehNo0U9K5wh7GHpHc1/W58C4N3NrE8/37y7le09syOCymIW/jyGsoBEAjw3bYk9ssfsFLTC4iglnm2eRzw7AJzNWHgunUnpqoFM+mSxFGy28YU18W3PvpAUQzfKU2bK0vdWC0almF4Awz16XG/JJ5Bq5NxxFuvt/cpztgGcMp2vYYfeOZcU+uyGvkueZDvWz2vi+N1gZ9EFVuy7K1oDLK6WZCqII9Zc2LFmPTqPZA11Q/JSDMdcJd/ePtIGwoxAmpQ9TJOcsGQoAd0g9wPrlx2pJCjyNFk5fo7iTwmfnAtHC7pfk77zT4hNrUFEW8mJudfQGOYTzi2fLY3sGm7jtfUuTerwXchXJYz3yfijQFAh8x+cKfLz+TXWS8sj4iRWZ8sENbmaQnaIxPGQlY9PJHNhrVXPfz9N7YzKBDJOsOMMRMM0cwxd1rnWag1sGv+J2D0zSD89tPHkkYDs0mJAeQRMw/T0hn3yLlM2ycpbYORJHfTSR/LSGpvh/N/EcCkPWBrMCMYtD7S/1IAejA3+ooa9f5W369l3Z+dhGh+dy5/iuRXO6fHD8ypUgHmYT//L8p/INPTswcHOS2v+6M2/MV8TME9GJo7IZ7ZCZjl2ANR6gZOV8zkJ3IMYKPSSkhkZyrUern95kyRooGRB20C3OWI3iYDTQU+VK+rREr+ZyYb7tIX60lFvVJ/GadXzVF+lxPr0fGaaxEfuFC+kIYbi2CIHieQlmZ7kdvKvUIo45ZgKLRWap/eUU8UYTkVJhCNvrvaYOl39kMZR76Z7MPGc6ofVx/DU8thP+FJJynW+n1Cz2uoJNa8Obm+iucHRwA+wDH4Pq1tNdhSa6AV+GCRhSX4xzibipAlNak3czC3A2bmf+OvKzBRODgrR1CKgOLLVF9EVKcRf1F5g0LfsN/S3D2+1nsORj+zLWkmRxFM3uVFdtQCaqg6cC6XY4uDTt6+oXmrA5YJMKs2BWYYV57VeqFwNh6W1F95XwuvK2lgUk0fi6lTFGPmiXxEmV/P1kGJaeW19Zlzp9MhTEirRE9xUxDRvXpKokNrvecSRRIttcECaHhb/+A+PsaIiOG5OorL5NvTjHaxqEqQzsr6D2uZuQM8Swjc7Kw7hLBYExpycmWTzTPBwCIsVNUFDIb4nzZyTMJyF1REcUaex5kUhTSAkywrJsi3p48JbutsVzbX4XXIKUVGTu40fL2iixmcvDCFTIxUDqAzW6DSWZKFqTmDy0+2vXynP9zPRsxwZxYSMdxfW4/oFdg4u6JH8O9GO7uhSENqSHGWTLgdZRZwZn0kmOZK/2YZklUlrJ7E1P1kS8ZhbzMgK4bei8FKzYbMjsFgOkEKbKdJim4+xdESYjGjBFVWM5pzTkiWgKa7ytCPTIF1jaY6RUuPLs4l61i6kGxNFZZp0DGw8/yIYvWJmV3rxxA0Wtjy0GmCG8wMNVNbbUJ4lVZoalfuTdChL4Kysgsykc6dFIo+M4jh0l3D+M15X5s9T9jFvoRVbPHTbtTN3XzQusWHpN7LlGU+ip7BIoxR7uV3y4jCu2ofPhFuxF18yeLlSLpS5GakIZjlBGaWPzLmLP85EmUmy9sneJ+vxcOfcu/Nv6+VSIWn+rf09+1eSmObl0V95NNGYzgRo8cp4R5m8MoPfKSqdM5+9c4VWrWTzOUPzqZx4RHNekfHK2HwYiEbmJCdtvHP5qqLsVKCyhDIUFspyh9JddDU9pVBw0gTts1P7/wPLqS5Q2zxWSJJ/s7IsEdD6QQFoyf5LUoFKQtHbNctRY1ROIbg1emdq33ghWQr6//Ju1zdxSLx+Vaq0QhKGyshX9AL616Z6q2KjDBZgiWNI0wY5sHmQWN1lZdteW29WxNfS+Y27D745wzI0QYYfg0LImGCbGKSYgM7C/hNdlJOBbvD6wo+Irwi8OSS9MDD9gjO059CHSYXQsu0ueBHmb9iQ4YFHEJOggO1a0cINSspS08G2ElkDrDxaCE9qBSt9oPIYlCRQqKxv3o4ueyn5KPTmkBll8VcQbEhTuBsUB4HSfUIkSpMWJpt3bOqKmH4NSpuQmAzoTavdlLwb0hRcWxIxbGHjNKDr9Jhv6BmUxgM4/yFYh+Ws8IoFInSobOj2392I4lJZ3s+z6aXRWIeJyQ+23qtXJl4kHVmaVJW5zZKKjHDFcu1f3JCl4eJuR9LX6uxfyX87uhE9ybvQYqYvsfop29tRZSvLpeSVnZmvSMPLgQQxlz9xCrkhz3L0sAs3wudCvvh8OexJcC6kHLZl6tkP9gVLA+RT0t29V8wClC9juyEu2CORPuSCFDxdELNhmyQn1BQBB0BduOuAbvX/E9AI9v6a3t+x06YvVOf7IasQuhSkZQANwGHiJ8tSlhuhwr5X6wdYXdGEC9Uz5VlC2qPby9B26fKJJWOJ2J9V+TUZ7XDp+nBhC10GulbamyThwPlv9JffK7Nm0lbSmySYVG37rGLa1M6aNPF0afaoGK3VvoJNKsx0iUuMXjxIBATmTOXKpBCwzl9oSmGG7BaSMTLC7CLBXxgTgDymKWjhBT6kxyah+Dok65mQolBJ/gNq4zDFsHlCAjhmJaV5tUhxk50XTzm1lfWSMTtYWi/tcMnAwQtaK00BSiZgnvoU+nTJxj+0UBuN7+g9BA8ezDjppTx0yUGFTaaluectIPfNWp+18pvnbeg7xFlcMByVeo/thrqWtMX6nkXxemP5dAOd3wJEfQCobApjPUt26kc6t+bDDi1H1J7U3uO1poxrj2rLj7c8sT/3Y4mQuIHGj6H3ojNDgBj4JnHBFHXXA/B8qRODEZj4vyzdDV3PsjQOIPRJsn7Vj0wKHfHwqpTXShm+6v2Ev0z6YrSFwKbyJD+rsIuWo0TkcrZWOjz23J5+Tp9ctE5zJQltKptezhNXI7DhCxfGLBFaqXlF7dELKWL+EwY7DALiDx/YWNsGc7a/kGxecDoX8Str0g6acA2mnlclj0inAxjmQMViq4gtv14IVtznUeB+8xxA5M9TCpzs8iR4GKrJDyu6qkw0sxfV9jbc3a7TLKwc8xsVK1sqgb6ztBWNNuFfSV/tgsU9XtMap11kbGpDzSO7GtnVyK4eFLtaN1n2kG3dX++JLGdjlnNMlusxrYMJN6lt3MRn3Ug8BBFaX38jYrSu6LaI0trmj5E4jRRnOcVZZyhGlGckKSNJGUnKSFJGkjKSlJGkjCRlJCkjSRlJykhSRpLyQEnK0ohwP9KyLrhEEjOSmJHEjCTm45KY+W3byUVPNtFbvKMO9B381iP2snbzBtnMyGben80sn/GR3YzsZmQ3I7sZ2c16urCOGjEAtnN185H9fBz2s4oYQpQnVVoLLNYC7jhionShmcMiTJcaX5/iVSiiewL1GE0P7UVHrK60CCRYI8EaCdYDJljLJ9lTI1of1Lsi8Xp/4nXSB2Rgmw7VwzOxVe1okZEtr6IbZraiO8jQRoa2nKEtNxhkaiNTG5nayNRGpjYytZGpjUxtZGojUxuZ2sjURqb2eJjaBU/UBmNbHmwicxuZ28jcRuY2Mrf3YW4rdoOQwY0M7rYY3MWVADK5kcmNTG5kciOTuw4VWs65GByjW9cNZHb3hNldZJ6UKN4FLe7HtyULiB9JaHi9DQLy4Hsvnj+Oi+EtEUDvid3SNhsxyCRvdkLjHqtZtWgU8N+/lT+KVsSnORBKORGsFBaRslY/iMEQPgURzZhP73kfqOEJfHAj00IaONLAkQY+LBq4eibuIft7zN4Z+eTmfHIYBjDynZDJ1lmCcEfOIleP9IOQx3XVN+OMq0tujSquafwYGeJCG8u+F5pK/SoSy02J5WrzMuKTy+fAWfmjC6SjIx0d6ehIR0c6OtLRkY6OdHSkoyMdHenoSEdHOvpJ0dEl8eSeLHR1ZIrkcySfI/kcyedIPjckn2s2ipBzjpzzBpxz2XSPVHOkmiPVHKnmSDWv4GirWRhDYJhXtR6J5UcilsspKEAnl6hsL7rvD178+XG98m7kSM4J08dzPe87b7zQWBNmWO6VLpji4zOdceg/I2xXaBiZ2sjURqb2oJjasklv+Am6O/SOSJg2JkzD3uALyJRtx42bKC0baIdgSMvrbUSNlhXZFida2lxMl42s5sRCZAaC6bGRj4x8ZOQjIx8Z+cjIR0Y+MvKRkY+MfGTkIyMf+ZT5yLlIcD8isiyYRAYyMpCRgYwM5OMykHPTzQPzVtRfcs/VIwqydLMFucfIPd6fe5yf2pF0jKRjJB0j6RhJx3rarozCMAC2sbrZSDM+Ds24QNwAXYk62osc+p7Mz7Dp8y5dZYyJW1zqfd/5xZIGm7CoSq91wTMepymNyxYyzrGBtpF3jLxj5B0PinesmhCHzz0+gLdEDrIxBxlgIQc8agZvjZuHrBp4h+Aiq+tuxEdWFdsWJ1nZbOQlIy85sRKVkSA3GbnJyE1GbjJyk5GbjNxk5CYjNxm5ychNRm4ycpNPmZtcigb34yergkrkKCNHGTnKyFHGLMlmFGXlngzSlJGmvD9NuTzLI1UZqcpIVUaqMlKV9ZxfFdthAHRlfdORsnwcyrKE50F0VtJVI74pV/Qoicu870OhLafNrUO94i91SVkekwmNxwrKZGWlnpGqjFRlpCoPkqqcnwJPh6jckZdEkvIeJGW+fEeKcnnAHZKgXKy5FXpyvtC2ycmFJiM1GanJRWpy3kSQmIzEZCQmIzEZiclITEZiMhKTkZiMxGQkJiMxGYnJYyAmXymBphq05HxAiaRkJCUjKRlJyUhKrkdKLuy/ICUZKcnNKcnJ/I6EZCQkIyEZCclISDZj9eZ5DQOiI8sajmTkY5ORuQQEKjJX0F4sUmCpXMOuTETWAz8x6t+o2MgyAfSdkixvswnXSvZmF+Tk0ZrVGI0i4yqbqR0Jy0hYRsLyoAjLmlly+Kzlg3lO5C8b85dhuJHKuGgd7uPHTWLWDMJDMJm11TeiM2tKbovTrGs8EpuR2JwYisZOkN2M7GZkNyO7GdnNyG5GdjOym5HdjOxmZDcjuxnZzafMbpYFhPtRnDWhJfKckeeMPGfkOR+X55ybfB6Y06LeU7dB0iP2s66ZSIFGCvT+FGjpIgB50MiDRh408qCRB62nE2tIEgMgQ1e2HhnRx2FEyxkiRHMyjWX9BJpixkKZAOxZWFmQCXYbBqkBfPbcb9feksxkwdyznevs3VcV+ByFVCuxuQwHZM9rQJwcysieFj8qkKCyPhPPFUWW8yGJxEi4U8B9nBfSS6iUdfNS3vtXJZ6v4/iBHxNLKneLNK/cg38rf2RUc/k1IayUMe2Er+0P2e8FEV1Km20XpEFsKv+B4i0x0p2JDSzLLZo/eovtymsiN7Lqr9qmh8U+RArpLxlZL/0Kfiy8VUYvkHDpFGPhhveiLEb9GLpR9l6lAjOIW/5m7EbfIvkLIMMZ/JB/LahwVlJxJXBO9bxxX4KBKxm6UFvD8n6fknoz1jvMRKY65nsKl3uTeHOqorsHl7KtW7msON0g1G9N0jW7db0NwGre6Vc0Z3e099M7KDIF0xhqGG03G3ZW6YXxMFLitC7aPftl5QEbACbpRwvQOIhIRPhxB/ul24izBmhoQSrXlEi+9Z+gKYBTQGhBSvjDmSl/i1s6W0NxyX9Par7hwkz1RbVh56ZZ25Ebh9qcExXphoDWTAUrq2HDL6EfewczYjo4ocbwUirRD8HKD7zP9AngAQBk8sX0wWsv2q5kLGSJf4VNOFk3Moo/7M1JKe7ZI86nAEgos4qHfr55d6sey4bdOvJgZ2ZyyqP9tXVHWc+0i2s+1V4yjHX95McUPWVyCO+kh30SfwGML8a2ACwlkm3+QE0OiaWcKuMJvWi9evZojE/BUVaJ5pwAa+EFrcJoj7+Zm6PVOc/uyl9Q/MfxlktvHkf9cX2CUOS8ANBFSAfZjOtFXgEcJmDMeErpKzbLdlcv7k6xItkGviC2Wb2Xac2btR/EM95LO/tItp07rX94M5sRqAm0eGYznRluQzeIXAoq7HOmSfqw8oRL7fPA9N/jHAAuNIFtUrV0KHe0em1RSYo1BJwH1TPu/9tKVgiSRYBIolAWs/DnMZR1YUGBFSU2MqZKQ8HTu+UdrxM6vXuSo13m3Ht4bvUUHczJnsYUbekQxy/z9TU6bykWpTwPVu98Za51Qz9QmT9RmP1FKtIXqGLp8cbTuYe0mg4p3YPiCTT28P5HP803Qk/w5Of+KpOeDhWt3Og4aOK+Z/BDTTVISbTJL6ZHUDo4IKkHBjKyeSF6V6wWC0uKiypZX1SpWvWAEEQ7jnA0og6kP6j9b0rQTEyzQTx448VXi396dFN7fOG+2PvjRv35lnQU/I9T2d0v0d1EqA3X6W5478ehG+4SPouyPCVZW2LR9s/kh7fgXBiDZoRw4paIZAmF/oXEtkRhC2VTSBNWdSKGPS3d1IoRoECAYqgAhWTwDgenQCfYuhM8WfREoqBDgCjSahthKZISW4JUZG1FZEXe+NT1GMErJQdj9JbUHyBC0y+ERjJojIGa1Ihm6W+azCFFG5qVPlG/LDWlmfTT4SFB+tU5AkJdAUJk3eFkfnCWi5IaQAbCOnrcUJFCEMdFjZSN6ghAGr01YBjVqzCquf3vYduIMCHCNFSEST+LIdiEXvKkcSe9+R8CgqpqQSM0Sl94S8BURQ8Qo0KMCjEqDUalHz8IVx0WrjJe9SNy1RVyFWcqcIoolkI9jSCM3e36TZLOia+vxwhnScRwbDBL2qTOoKxR20FflVhbQYjGIBozXDRG7YT7erHengP9hCEFtQ4PAyjo6m8IJ6iLbg1M0LR+1FACBuv9CNbV9ml4I1yfY1+jFRZGvt1Fvju4QCRNLpwImQa+Et20Fu4UFjRjD38LxfUpDC417SDh8Gjto+9K3VthGCZjmHwaYbLcWQ8rXDZ2ACMJm+U6PXz4rGpHi2G0vIpOwmlFbzCsxrC6V2G13E5PLLyuXKFhmH2wMDtZsSjj7YKymsRVRFc/roOH620QkMffe/H8cYThtkQKR46ypS3qKrgetRF0zwaOVsQZ0VsOOA8pUtbqB3Et6mwzM6lrAhilY5Q+2Chd7eOHc66gL57kdON+tZUcJNzXVd8syleX3FZwr2k7su7ljS+PZ6TD9wwKUFu1MRe+rOVZ+aMBctON1oyIG3SGG4C8VkQBTsg04CxBBYAWSDTTXnzIbv4ZPUrAxNArmCBp0mFwgrHZQV+VWFtBGMZjGH8iYXzOCfd+k73eQB9LkJ3T4RGi7EL9bYbZuaK7ibPzrcfNc4yY+xUx5+xz+JvmZissDHoPF/SyazPLUS/TTZO7CL348+N65dErRUd416TY/SPfOZlvSld3T45T331TmrFCMIzFMHawdz1KnGvfw1fDAX26dypKdHaQuxWl9Ta7Y1FSZFt3Lcpai2EphqVHDktldjn4cLRihYRhaGf3G3qx8wKSdyIQPZiZqIoGUch71199JpPku1/nHhX7+CLPkgiOG31KmtNRBDpi3fdRebUUg9EoRqNDjUZVDrfvEWmNwX2yUalKd4eITNV1N4pOVcW2FKEqW41RKkapR45SVbY5+EjVYAWF0WpX0eqSCN+BJR1ZSnDxE5MrqaSFyOXqfh3G3mK8MSsXQD8i1rQxHcero9N6/xRXQykYqWKkOvRINe9mhxKnVg7rk49S83o7ZIxarLmVCDVfaMvxaaHFGJ1idNqT6DRvmScTmypXTBiZdh+Zukz4QlzK1dEgPkmWLF0EJocNL5PajhtXZq3oKKAcvsJ6JHoTsWIsiLFgX2K7go/re1BXPSJh6HlhSITAx4UTbTebFY3sJor1PAkViIlPvuQWjUJ0FU+tJVnUxWCAX3QapadfEhXVwwG+flU0TlhSLc/OEwGcM5t+4X+S9hPT3hIF3pNxT+LXxXZF5vUlWSWSp85/K0aMU9txYBw7zu/n1rPvWndsufaFOLSvdlLAhP45TaU+mSddY1/cnUlbrF7tm/dl7gY0iiLdARNJ+qLvydmrvRa8+y09vyh7aD7mL2qUYe4K4L+v8o9VI2OmHjKyte9oIJSCezwEdlKqsiGyUSwPIQ1twKq5XTkf0EYb9yWYCM5R+aKRO9HP41XvGDw4NYQIEKsxwmp6ZTR8rBeGunGuNGoIHZrYcKGSdE0yS+O5BpH2Wzd48ML1NlIp5NQ37AsCOC6wUmpMR/jKaLXefWpeMqDdhRu7DRLyMl9Om9+4FG5AzYoBGKRhEVzPDUu599zQC514/c0LGosGdN2wkO3WXzSVbby9b1iEsCugLCmKQ6PGuLHnaPpUXUxL/qyGr0LsErHLofJY5KuP4SSix9kOZzuc7erOdieLTcrd2SEgSlXNjehd8kJboncpWoxXJMgbn8w02cUImocTuzd7lg1To4dhbjB6MLmyzeRZ0c8bNhkkaPQo+GyznhHPbPSg4H8NC2ZeFm+06BeJT+5/jAHaZDzOkl8uNNurtOhZqMLWigu4WfKL+lEYiDP4oX6ED8HZvGpjUxx/M/EPXUtBATP2j/oxGH0z+KHpCBl3M/ihfkQYcTMtA7C4sJklvwzvUpHKqB+5mF1tMCwS0TsUAomIyyhoowHyfBOvQ+/am2/DiCxUf2JYy/h2HaRiOO7eg6JJHe1AjNwODoHMUJEqq4IEypHNarIfmA04m/t/t4tKqRMBN7Wh2vaB2C9iv0PFfnVzwJAQ4P77mZPF23QmdAjUTV9/I+xNV3RLCJy29YjDqXA4NkUimtMrNEdnyzUwHfrajP87PNTAcNWI2EFX2EEECiCC4xpI2PvETqWqaRBAXpOlJOIIMikcF0aQt6gjFGHcRtBTFdZVD8bwGMMPNYbX+N++n1utN8pPNoTWaPAQEbS2+kYBtKbkluJnXdvxSB+GxEcOiTXmOfhURWYrK4xzu4pzQyJ/aZgrU0yDAIesV6I43M7jq2CBW+d01qkUyXHjX4PmdRQMo60ccNtr4W3ixwZM9s5sppE9YCiOofhQQ3HTeWE4W+t98TEnG/ubmswhgADztjRCBUyraQkiMO4VbrfLG099AG629wtZMLVq4413quUZ/Tm8Tfc91pkITHQFTMwTZThusHDU2/GVSstkMF8Rm7KcG7II/pCILV7tJo74F3Hg+UMEJABJczZKj1gbLYFeHjVHn/nHC7Kwjv0nL/0lW+GlX8GPhbeKXZOEnsS8r1Prpv2+4T25VA0Rg3flowAkURpRjrvZrCBgIP1Unt6Rvxm70bdI/gLIcgY/5F+Lp4xY2aaDpAqmAFvwRcuh6rdITOlG+rPXXFfEMqzH9YssZhHaaP+dJsXSP/PLu2vn88fr/3z/48fPOq2Ltp3Xei7i3rPrpD/fvOz4OpwQsz99+vC2r90sdeOVfjSbq/aVxgGIIlKM/VRy8gJFaVYHagUhl4vcT5J6F/FBKVY6ZnPDW3HgURy5miidB9y28LjcJ1HtzehPuasgipmR/8u/JDKfkf9X5Wid5q1r44VOktmurn+YSuVNfVjOaGmBknohQzL1tV1V/Eoq4bKEQHTV4/rD7bvrq9sPH3++0AnUXb24u4j2aO9mVrfn6sfPV/91o2wIXzp8Ioue1ZtHOEQY3RBJR0vfiyZ5+f7gBV7oz5NAlb9DFqiA+N2S1ezX4hIjt7jjOiPKyT9TzMRiAF8VCuBNKNpD0rQvX75eFL66gvUy/U7dma/5WmC5fklxD8075RUWWeAGPlkfN1hhyYVYndJmr1TSXQmzXJORQAt2e/lKvsYqiYgM/9JnineTPBCzRICq53i74EH+q+JJ6BN5Cv5RIf9zNtRkg78U1pXVmbjhyN6CxJykNM0qtCQN3ZJVex4/Lw35MxQ3y4RRGcBlgolS52M4YEhbFxTWVFusxrwsItNV2crK00GmOdhSCEnIrADE0mQlM66+vLwmU9VlAmlHJkkR1bn9kyd1yYbfu6vIe9XQxA5jWolsmxuVOK0VJ6X8iu1Svuwzmse68PZGrdtvklC6z3ydxHLzHzRyuiUZATGjxuBuNqXp4gHpmkc43ebG3tdLA1QvbQkH9hLQTH1NhHYQfDHvq+K+hmffnZ3TYXsuf4CBVrNzUMV5pXMu+L/UkV1WpziXIiDUAHiX1JBmHaVNquASZouzWv7KKDlNIo2ZwXyYs6xKqZswS0AftNQD3MJVnwZE/z3yNWh1RjxvL5tRv7ZE/umnirrfGQeiR8Pkj5WZSxf+PIayLmCq+1pnq71bu9DoHOk7SN/pYODKXO5wWDQj8hVtrB6rLxk73AqSpgsxW0LW4cCIdtwSz0UsErksisZT/26SMrSc6xV5L33gvYhWbsxtAa3P4MdF01yi7UWOSi6LYmFl7ByNeCtG3JXDxq5SZoxJ/FopkX1i2Nw8d1r8HDqlJSNqr3jvNtzdrlP6Dp9pexmiS1s6oJBd0f72Q/j+q/Q09FFD1hhKYyjdYSitc429v/C8yzF7aiFsHO6cmBbPabm8ovajWp1JtRTl6qrAjA8Ynx47PtXZp2HKh84jTMP1B0acB404tdPUaUWgqhmJDCOpFFqIaApHfgcQrBZaPNigtdSProPXPqv6tPSzh+wxqMWg9mBBrdyFnnBwaz6WTz7ITZJ9HCraldtaJ1GvvCqMfjH67Vf0K7fTfkbBlQsXjIaPGA0r5rUTj4qLU1gpPC6IZb/YiVjpj+vg4XobBOTB9148f+xndCxp6JCCYmnzO4iF+67P7umW0YoMeppvg8RVcOosaiuD2UE1bq5NDKoxqO4yqFZ73uFwsIfpFE4uTAfjW5H+OyETgLMECXQQnKtttq2YXF0D0q8VjS8PQuRX9yyCV1u1Md26rOVZ+aOj8avNllQY7h823NdMiycW5ctnQIjtJTLY7ziuF39+XK88eg67nyenxRYO6QR1vt0dnKTureqGLX8D2WIQjUF0lyeXJS7vpHaiTcfmyZ0Q9mLnBTruRNDzDs4KSyynrTPDkqJxHxmj0KOf8pXYZV/2jSuWERg4HvacrmzWObHzuvkJBkaJ2Om94oz3rr/6TJaI736de9S4ehkmllo5oFBR0vb2w8V+q3H4ejCUMYaOGDp2GDqq3OBJhY91xumphZBL0ncHhp3jJb1vP4xUWVFLoaSqeAwnMZw8djipss2+hJQGSwwMKw8aVipno9MKLSUTDxk1pc43ik2u7tdh7C16HWDyNg4wvExb3l1w2UcFDl0HRvLFsBLDygOElXnnd5JBZfUIPd2Q0mV97y6gzNtPy+FkvnAMJjGY7EswmbfMvoWSykUFBpJHCSQLM9CphpF8shGCSN7xvSKQa7Kiqr7JvQdxpKyhAwom5c1vP6LsvT5PQhvmksYAEwPMDgNMjVc8qSiz5oA9tVATrjsk9fD+O9wLtB9vasyppaBTUwNGnhh5Hjvy1JhnX8JPs3UHxqAHjUF189NpBaLyqYiMIJkIsn6C/bNbwOktzVZ2v3RhMBiYzKTiwuuZ/CLosg1JrGWab3I0f/QW21VhgJXLL2TDeHn0gqqV04KsXulp7eSXbMGWfgU/Ft4qdsvrKd1a6oa3uo5kk3cm7IJjd7NZwQKbNJkMsAt+C3PsRt+iC9q9Gfwo35aeVd34YvN8E2osRGFkRvZV9vqHhWQBRvtSLPUNH/JfdIu729ANIpcOT76+k6+1FYtB6cNJIjK7kHDsa7p0uoX23sTb+69md8B3b4KSgVVDS8Jb9ofsd03kAB+rrp/PGwspI/+B4i1qA+Rh+q/qYnsiSPKIF0Tb0HMe3YiK5F+kLRNhHMjfFfqYv9i+OAFwHadzD7fO2hBQttjo7MLosvUP6lrv5MX72Hn+i7vaPLp/samwnc39v9swyD4sWsLjeq6MsV7K25IFDFO7eMtzXwzqtfUxWO0s17qLMzXfWZM1qfnZJx/TKYQsaifTuwt47CX0iebuppKSOPp7ly5Xp3d/pa/wlcdd9sTGfQnI13b/MLOytetgs6Sre18uXZbip/9l+U+bkPjyJxJqXVqkhvk3BjAHnk9CotDarCOf2Ynlhg9beM56cSPLnc/J7B7ExLB3kpIfSEhEAnvr4fqXNxYfrzSANFEDW85yHQTkw2TAUz2IIrfEb2bSW6tbqE9AdQzqwzu8W0Ec8cbtPqGOg75N23ES32k8adNI8C0JCW/JL0A5gH//N9EDDMqJ4bN2sH6ZTK0/itAmxE6FAawQrfjKhTpKLTt6apmFAmRCSeRYayXDfOUP4Wb+E39d6aacHFDptBMpS1FQSdX3nht6oROvv3mBpm66hOLtl/lZR+4H5eO+YmYpzyZVK0X5eM03yxZ9nL59RbXnd23SgkwqFcVrWnFeJYXKxS9fSRYUV4tFgk0CjcAPluvwiYIdAPzyHXrafPtVRZ/lA25S1sWj5wKdwL69uvlP5+bN39+9/fTjuwvFcM1cjO1Ha9a6yZTJLfuOjc3z86lkgUYcxSTXVOLy4+0GFrdSpwYrbjIKaJ+KWyh0NV65ZC23wVaEdkabJsKInBUGv3LNyly62G35o6J9zIq2ZLQtzNFgQW5Dzt8Bakrm3AY4zY0XXy3+6ZFOPnt9xc7ENo4IQuuzaroHPtyk6w3RDze89+PQDXfJxp2yPEiiGtms7fYDsz2qX4n92T+TH96Cb/oZNCP0nmEJ4C6h0L/wfMXKppAmrI4C7A3Q5jReYjgwH1o7oo6DRh2J5pzUiMeNPkoG0CFASGm1jbBISYktQZKytp4GMpmOASN4suSujd6SeldEOA+HcErM1xjoTA1klv6mhjxL9jErfaJ+WWomM+mniKQikopIKiKpiKS2iKTqY2kEVPsFqOYCGGIGovYagHhCsDUEqFXR3BGhrgNRGEJSpwnADtv8zNwIwrI4BhCWPQgsK8jWQYh2ZuafDoHWVrWg2T3F2sLbuqpY3wOEcxHOHQicq7dkRHYR2UVkF5FdRHYR2eXIrnGQjiBvz+5JV4VDcFO6XKmNoMTd7ZrEcsR/bucxD+r6i/xKGjsq3HcAyuqppE9DiiYjoa8pBhGD6zMGtyMzLlTCLCqpbuwQnHqUHQaA09XfEH5TF90a+KZp/YCgNwS3uge31Jayb4JHxIoQK0KsCLEixIpMsCKjiAiRor4hRfJFOwWKJBptDXkoZMMcBlxUaPRoYaOeK29g8NEwpVlnhCCchHBSYzgpSaSMuJLpsDs8vqRqR4s4k7yKTvAmRW8Qd0LcSYE7yS0G8SfEnxB/QvwJ8adD4U+VIRXiUD3HoYqr/RIgVVBxE2yDmMCP6+DhehsE5PH3Xjx/7C0eJWnrmGCoAaiq++N60YoMbLZ8Y+z3SFmrH8THOd85XEUZDLXhnOzsi6kgZnYQzAyMfEVs1gmZ0TpLsNqRI2XqcXwQgExXfTNcTF1yW3CYpu2ncfCx7B/xROIBwTO1fRkfRyxrcFb+CI8HIuSGkBtCbgi5tQm5GcV4iLT1DGmTxwiAr0n02R5W85kGdAPB1Vhjxwus9VNZ/ed1DViKJiMBeVyISTXHpJgYEZRSjbIjoFKF+tuEpXJFd4NL5VuP9CxEmFQIU85SkJaFGBFiRIgRIUZ0MIxIFREhSNR3kIgt2ssoEdNoA+ThBy/+/LheeTcxmYv6Cg/lGjkiWKjXyuk9HDRE6eksHuEfhH/qwj8PXkwiBmJITgSWNG7URzaoDoH2yOtthPLIimwJ3ZG2FlEdRHVSVEdmIYjmIJqDaA6iOYjmdIfmVAQ0iOL0C8UprL1h/hQV2AAXeO/6K5jM3v069+go7StwU2roiMCb3iup9wDOUCVYZf0I5CCQUxfIWRJbcl6IMTleYk3jBnNUg+sQgI667kagjqrYloAdZasR3EFwJwV3VFaCAA8CPAjwIMCDAE93AI9BwIMgT79AHsm6nFhESZEt4AhX9+sw9hZ9h3p4M0cI9PRUQYOBeYYlP73dI8SDEM/+EI/LbAkBnvLAOiS8U6y5FXAnX2jL0E6hxQjsILBTAnbyNoKwDsI6COsgrIOwTvewjjLAQVCnr6AOX4kLkA5XYgO84DOPdPqK5CTtGxGE01eV9B67GZjgFCaOaA2iNXXRmkQC4wZpCgPpEOhMqcpGsEyhtJbwmGIbEYhBICYFYgrGgQgMIjCIwCACgwhMdwiMOkxB6KVf0EuyrCbaT5TWIK5/6wYPXrjeRqq5tR+IS6GZIwJeeq6g7m+IStxDg3uhmA+gzW9cSrQhHfAaFgP4QsMiuPYaliI608aiAV03LGS79RdNZRtv7xsWIcxf+hWkQWPIwt3R9Km6mG5gyWG6Ff10MJxb79CnoU9Dn4bYfW+x+0XiYJ0l9bDjxvDl080hoHxVzY0QfXmhLQH7ihafxm2MIubG7mDUPJxYqdmzbA42ehg8nNGDydXkJs8WkT2DJoMAjR6FGdCsZ2SeM3pQmM0MC2ZzFl6eebhdHLknML43M0UIk18ulI/yymehChYqLnVnyS/qR2GQzeCH+hE+vGZzVXQjRTDFP3QtBcXN2D/qx2BkzeCHpiNkTM3gh/oREb0VfteVyYbTLPkF7y/FPTnck8M9OdyTa3FPrhKjw625fm3NFaNmYgwFHTbYCLqJ16F37c23YURi4Z+8KHIfensfhbSxI9q1G4SyDoFz044rq4JrXCKb1WQ/MNuhaimK7ih7JENWoslAHNJ+Se/tCHHpQ+DSEZgzqY5r1eGGMW54WjfGDwFS6+tvBFXrim4JsNa2/lRga9opBD8PB37qrKoGBEpfm/F/EWRDkA1BNgTZEGRrEWQzDPIQausX1KYIBIhlSBXaAMq5JoNiKLCbrK0jQt2GoKreJywYsBANhgEmMkDQqS7oFBJzQswpj/lohtghICdt9Y0QJ03JLQFOurZjGgTEkFIMSWMomBIBkSFEhhAZQmSoO2TILBBCYKhfwJB8sU7sQqbOBlgDCS+Ix9zO46tgMShqVmXDRwQYDU6J3VNtFt4mfmxw1rQbUOpUFFV3EA6HonVEu0EU7BAo2DwxWccNFg4SsSSolOmoPgRCZt6WRnCZaTUtYWfGvToN4hZ1qkjbOhzkZmpfxhQuqsEZ/Yn0LQTpEKRDkA5BuhZBuj0CQ0Ts+oXYGQUWxGYqVZ3JgIw/6+4zjfJ4AHRnzd2ADnvwWJYb7HhLI9JU68654SZ/R7opFLMJvWeIPFyLxYzWkkz81mINY5pEhe/Xax5XkhIXVhzu4ItcCclYsq2/r19IYSQmfSFydkmhRKCkLeuXrHTySfK8UARMiPASMZNMWLwFnz3327W39EJim6Tx0DzhTTHyBT3DHE6cBBTGTciFvpOHlP1fPxPjpxGUFblLL96xMI02PKItyItZ2nlrsoQlYAzNmWban6/IVGPl6p+kmiBL+PzhWg9ckx/4ZMxOpNnnykPH3WxW/py6XV3CMtVEeJW9/mEhCaGp1yqW+oaIxr1feV/qRehypCd5Psn0q3uYfO6FpDv2O/5LGvsnq1sAUKKbeHv/1QjSAburklm6wEt+yZpWXvupASWT7HS11l0KlFk+59NRwuYg8ir9V/EMHYozywuiLfFSj25EO/cvUuoEvprR9bLiXTFn0UzscdF3c21RTwWWxO2sAc5NS+wCIs0Nfr0Jt7F3Qf8d0f7E0PXWPewcuE9ew3yWlclYF/48hrLIUokUeJT9jxM1BNm4Hs6WxynZHt9DSbZGIrqeze2nRLK9kQvLlRQ1rN2S3BC4sA69r0LTFZwbhX0nu3Eijv9DbI7k62u0ASIW1dImR651p7GRAa7SKFFnOcMqbnp0vekh2pvxxgZodAY/Lppm8Jy+qhwvgv8wdeSKgcNhjwkDIJPD+l747M95fDypzPdZOduwA4qQGTP0luLjtpN+rJCFrVjpGQOXtG4+88wKuzLyKqc2RxFxJwp3onAnCneiTnwnKkG+29qC0njsAW8zDWoLicZQyYKmSdpGL75a/NMjnXz2TgAuFbszpuSbp6HF7gEsN5FSQxTLDe/9OHTDnbN3okaJqdo/kx/ewixzI3Psz7BacJdQ6F+cyCNqUG/6kSasjpNW9KTNU+N7hoPs4sBAoPnkgGaiTSc17JEDzpJRdZBMqbJqmyVILZfYVl5USVtPA4xOB4ERIl3y4Ya3Y0lcLoLaB0zAWjZfY2w7NZBZ+psabC3Zx6z0ie6aJ4mZzKSfInheDZ7rl9aIoSOGjhg6YuiIofcOQ6923AilHwZKz0WJkE5X0EwDTFaIaE8MZFf0bER4++npFhHG04TeR2OpZs4JAXkcLgjIHw2QF2TsIDifoeR6p3UInL6qBY0ge33hLaH3FT1AIB+B/IEA+XpLRkz/1DF94zU7wvsI7yO8j/A+wvu9g/dr+XBE+g+D9CvDT2LGCoU1Aol3t+s0hRNfk5wE/C/p16jA/9PSa+/v5xuJwE3G10le5odA7BGA2B2Z4p0sESGvbvQ4rHroHQaF1dXfEINVF90aAqtpPd7zhwingHCqLWXfi/5GDRgaLZAQLkS4EOFChAsRLuwhXGjswREsPBRYKA+RKFYo0VZriFIhmfXJIYaF/o0WOTwdPQ8MQTx5wdcZd4goIqLYCaKYXM6A0KLxWDw8xKhqR4tQo7yKTiBHRW8QekToUQE9yi0GIciGEGTlCguhSIQiEYpEKBKhyJ5DkUaeHCHJI0GSxRirhE0W1NcEuyLq/XEdPFxvg4A8/t6L54+nAE1KujUmRPK0tNr9sexoRdwFW+mxA02RslY/iI9z5H8UOjUYwMM57N8Xq0L49GjwKRj+itixEzJDdpZgyWMHTdWD+yBYqa76ZhCpuuS2kFFN20/jLHzZaeIh9QPiqGr7Mj6hXtbgrPwRnhg3QF+NlnwIuiLoiqArgq4IuvYPdDV24Ii1HghrlQdkgLBKdNUeBMfWI6eHrLLaxwutDl6v/Sd5jkPgJuMLSZ2ISnaDSjIdICypHHpHwCUL9bcJTOaK7gaZzLceuZqIMaowxpylIEezKUqoWiAhTIgwIcKECBMiTNh3mFDnwREnPBZOyEKkMlDItNUAUfrBiz8/rlfeDUz0J4AQ5vozImTwVPTYe0TwxAWtG0eIACIC2AYC+ODFJDYhxsXCy5EDf7KRdgjAT15vI6BPVmRLAJ+0tQjsIbCXAnsyC0FArzagV7G+QSAPgTwE8hDIQyCvd0CegedGAO8wAF4hwoFFiqicBjjPe9dfwQz17te5R4feCWB2pT6NCLc7JX32HrsbgbCrxhRieIjhtYHhLYl9OS/EwBwvsbCR43iqEXcILE9ddyM8T1VsS5iestWI6yGul+J6KitBbK82tmew/kF8D/E9xPcQ30N8r3f4nqH3RozvMBifJAIipltSUgvY0NX9Ooy9xQkhfbxHI8T5hq/LwaB8Jytq/WhChA8RvnYRPpfZF+J7ktF2SHSvWHMr2F6+0JaRvUKLEddDXK+E6+VtBFG9vVE95XoHMT3E9BDTQ0wPMb3eYnpa342I3qERPR7xCHgeV1ADBOgzjz1PAMZLujIi/O4EtNd74O50ZawYOAjVIVTXBlSXyGrkCF1hdB0CmitV2QiTK5TWEhhXbCOicIjCpShcwTgQfqsNv6lXLYi7Ie6GuBviboi79Q530zttBNwOA7glcQsx00QhDSCat27w4IXrbaRauwwOZyv0aERw2+nosvuLXhOH0uB6V+ZiafMblxJtSAe8hsVE3mrZsAiuvYaliO63sWhA1w0L2W79RVPZxtv7hkUIM55+sWnQGAivNH2qLqYbMPrkPZB+khnOPdfo/tD9ofvDHZtB7dgsEqfrLKnXHfnOjXwOOsQGjqrmRvs48kJb2s5RtPg07l8X4T1267rm4cRKzZ5lE7PRwzD9Gj3I7dro2SKIaNBkEKDRozAtmvWMTH5GDwpTnGHBbCLLHsa9u6737uSewGgLL4dJJr+oN6d45bNQhUAV17+z5BfNhhcZZDP4cVG5fzdXhTxSzFT8Q9dSUNyM/aN+DEbWDH7oNg639zP4oX5ExIuF36s2I0nVyS8XuBNbuRNbGbLjhixuyOKGLG7I4oZs7zZkjXw37sseZl+2iE4Qqy3op8HW3k28Dr1rb74NI//Z+8mLIvfhFG4ek/ZrRFu2p6bXQ+xcUBkpq4JrACOb1WQ/MDOjGixK+SgbZCPRt8nwHtJmWe9NDjcljrUpEYGJk+q4ph1uLCPfm9AN/EPsUOjrb7RPoSu6pd0KbetPZc+CdgqR78Mh3zqrqoF/09dm/F9EWKsRVsM1H+KsiLMizoo4K+KsvcNZa3hwRFsPg7Yqwi5iwlJlNYDoromlnyDyKuvWiIDXE9Nq79PUjEPeBoML09cg7tgG7hgSE0PYsQD7acbdIVBHbfWNQEdNyS1hjrq2Y/IbhBFTGFFjKJgIpzY4aLYuQmwQsUHEBhEbRGywd9iguQNHaPAw0KA8MiIGLFNVAwiJrDyIG9zO46tgcar8zMo+jggyPGV9d0+iW3ib+LFBCoFuYMkR6rTu0B4OT/OIJoY46LFw0Hlixg4RuYNsTBkuaTrUD4GRmrelEWBqWk1L6Klxr06DvUk9LXI3Dwe6mtqXMY+TanBGfyKHsxqm3WOdiJgtYraI2SJmi5ht7zDbPb05AriHAXCNQjpi3JVqzGQAWA+LofMs0lImpQKsAPNJlTNP56nklwwxKU9hZUCDog7ptUOe++3aW3ohsRrPdm6gyZcFwcG060MsmeEEFxZxpdbZPbGJswwssMDBksg09AolRDsSpxLdz61o++CGFhnB1t2GmFNSIIUmtsGKiNF68c5LBbwkTQBbCNcra7Veby6IjonA/PmjBZoHBe+g8qy6YjPylcMykXq5Es6RZIyb6daZfIVpP3jEF70q+HMh55zafeeXKnMDRCNJwG+2utVm9bILIhBabTNxOyDkyVRZCnW3aVGZKhVLWmYlYOAzulKTxGLGAiEfeyEZEvaHwI99d+X/yzMSCW1t6ifj1W4iadcryYu68TKRZga2HXezWflzKl7IDcY/pZPIhZXW90rhRecrsrSxkhGZz/zhwcTnk647jrzysn/ON6b2ovQqe/3DQoKi0V4VS31D3IF7v/K+fKkF0ukR6sIQkD6cmsc7/ksK/yWKpDHeTby9/2qE9B7ALUvm9HZW9YotLblLklkuKSP/geItagPkYfqv4hkQJHnEC6ItmWQf3YiK5F+kLTrPwN4Vs13ORDkVlx5cx3Q6Avvj1tlgK46W2MnWTANrrr+7Sv89zg5qrgkw+lrfLh24jrrfrgrcJ69hJvTKNP4Lfx5DWWS2IwWa7H/tYxinrnTZeB3Otuhg7YxvqoqBjjUh0QINTNfbOPLhXzhbBEKa8s1S2YZqEhH9lRbG9mgBcsjt0Mo2aPu435ofCRe11lua7VYQUcVeK81tJN1LHc1WqugCDrFdmq+v2Z6oWFZL+5655p3G3ia4S6Ps7eW0+7gP2vU+qGhvxnudoNEZ/LhomtZ9ivttuN+G+22433ba+22Ow/kFtE+tbbspgsOBb61JUOk0ptlz+c+lPxP0cFo7fDSQSGb1JumTvfhq8U+PdPLZGz4cKPbmuKig2JJOwMHTUFz32I2bCKkhgOOG934cuuHO2TuZscQ67Z/JD29hlt2Y+clnWK24Syj0L07kEYWpN79IE1Z1oKQ9rHYkFqnxMMPBMXEstDoWEF3tGbpKFOukNj5ulFUyvg6SNVxWbcNs4eUi20oSLmnsaSCw6SAwgmFL7tzwnlCJ90Uk94DZyMvmawzopgYyS39TQ7sl+5iVPtFdeCkxk5n0U0SMETFGxBgRY0SMW0y8rQ3KTw84LkZtiB8rsn+LoRLk/Bbk1gCVFLjPp4UsKzp2XJBZ0ahO8OaT0yzCbb2C25rZ8vjs1MwxITaNgwVh6p7B1IK0HISsZ2ae7BDodVULmgHZ+tJbwrQruoDwNsLbA4G39ZaMSDci3Yh0I9KNSDci3QzpNg78Tw/01oSDiH/L8W9lDEZMUiHORuDp7nadJlviYeQpgOKSbh0bEpc0qSNA/KR02keFjE3YJuOqr7df7qFvBCZ7B0zuyDLEybIH8kaNHZdUj8bDoJK6+ptikuqyW0MkNc3HezER8RMQP7WlGF6MiQAaAmgIoCGAhgDaPgCaUYx1ivCZImRB8EwFnsnjBIqdSWTZGspSiHdODUErFNcnJK3QtAMgaiej6z4raKzCrzP+hoW4GdkBIm99R96SihCCMx2mh4fiVO1oE5KT19EJNKfoDkJ0CNEpIDq5xSBUh1AdQnUI1SFUdyCorjJYO3XIThLzIHRnCN0VA40ShlcQbhN8h1jfj+vg4XobBOTx9148fzwBCE/SqyMjd5IWdQPYnZRCuz/jGq2Io2ArUXYOJFLW6gdxrQOh+6t8ZOo0GLbDOTTdB4NCLLFvWCKMhRXRnRMy5TlL0N7IEUT1cD8IcKirviFeqC66LZhQ0/jTOFBc9qN40veAoKLavoyP+ZY1OCt/hMduEYpEKBKhSIQiW4QijYLGE0QgFQESAo8K4FEelQDcKJFke6DUZxpHnhzMyLrVK5yRNekQQOPQddpHhYxN2CbjqvfMP3N9I0rXe5SOyRJhOtVoPAJOV6i/VaAuV3Y3SF2++UjkQ8xNhbnlLAUJfIiaIWqGqBmiZodCzVQx1snDZlnIgriZKW7G4oQycMZk2QBl+cGLPz+uV95NTKa/4SNmue4cFynLNaUThOxEdNcnBYxFuLrx0ncEzECviHz1DPl68GISLBGlORFobdyAl2zQHQLoktfbDOCSldkSsCVtLgJaCGilgJbMQhDIQiALgSwEshDI6gzIqgiNTg/AKkUcCFzJgavCMh9malF0DbCO966/gnnz3a9zjzqE4WNVpS4dF68qNacTzOqE9Ng3RYxJyFVjqO8YlqGOEcfqGY61JHpzXojiSA1cc+PGslQD8BB4lrruZpiWqtyWcC1lsxHbQmwrxbZUVoL4FuJbiG8hvoX4Vmf4lkH4dHoYlzQiQZxLjnNJwgBigCURtoCTXN2vw9hbnA7axTvUD6yLN6ZTpGvwGuyXEsYjYP3IGQrCpdXu/2nv25obx5F03/UrGK4HSbNq9pnec86DNxSznrrMeKeqq8N2RZ05NQ6almBbXbKoICm7PbP93zcTACmQBEjwIlmX7Ih2yTKIS2YikfllMkH41s7iW77gG6Fbxa23TWwrP3I3yFa2145xrdyUCdUiVKuAamVlhDAtwrQI0yJMizCtjWNaRmfpcBEtxQMhPKsKz5Jmv4JmSfK1QEISf2b/QaxktNdFr5JZbAS22n9m7QjZj4Ckhm2x69BUOSMJk9oxTCphw3FDUbk9tg0MqjBkO/Ap111HqFN+kgQ3EdyUwk054SCciXAmwpkIZyKcaWM4k9nXOTyASfUjCFnSI0uJ8Q4ylpCrBTjxzl/cszBYRaYDfN8ApdyCXhdXyk1mI/DSwXBw8xf9JfqsxfV+Qmnx6bfuJVrCAljLbiI2v2vZheRzy15U7d+aNMjrlp2sVrNpW9rGq9uWXSgHbrnJazEZ8DS8kjVVd9OBbjoevVN+oOzP7aak9EjpkdKro/QoXrFj8YppwjXvjrPtuOMW+gNpG+EL08jtohj6XjsKZhimfBgX7qpAo7hmt6RxIqZ2bcUxbdUYD2OrhlKwrdrm4UyLKSMBrZriIWm3MjgKrRoqB55lx+JYo/uRtxe50msC66uRU1g0+TAyNpWDj0MT9pS3hsfJB3NT3GRj/GFuIrfXeGJygLSwrfpL2UyRcWPxj7kZ7qwx/ihZCOypMf4wN1Eha+VzWZ9iO42TD3RFNcUhKQ5JcUiKQ3YXh6zE+w4vHKlBCygqqY9K5l10kLwc9VqEuC7jIGQXbLIKI3C8P7Eo8u8P4God7bJeN2CpndJGwpYHxtNt4PicRMah8IqryBUjufeCn97y9ic3T+Q6eGkbeTg2Xtts630KG+22uBFIv2MgfYS8g4Ek8zwpQMeN1Zfpgm0g9uXjt8Pty/ruCL0vnf6hYPh8UYQEbw8JLpOqGngwf2ws/yXEkRBHQhwJcSTEsTvE0dJtPDzc0egGEfqoRx8NvgcIo5aULWCrC9iHh4dE6lb1ukCkbkYbwSEPi6E7yI4jI7XFltr1ah72zCYQbsdAuBBYRxhcFgMr2YnbgOBKh2+HwJV03REAVzZ5qgtCmFqKqZUICtUIIaSMkDJCyggp2xhSZudZHR5QZvJUCCfT42R69wAkUUfIFqAKeDOgo1eT+GwxPdDkvcolvi5+Vjm9jYBpB8z3zWdcTdkyfmjx5vVG+H/MvK271fcnuW8XRI2wwx3DDicJHz1/MfUonU+D5dlqgm3givZzaQcy2o7TEeJovazDSP/jmpiS/7YHVNrKl3UiIOfgmP+kJECCNgnaJGiToM3uoM0Gbufh4ZxWLhaBnnrQ08qvAZGtJPKaBmtUBBHVLOGLRVrypQZt/L6e4f04OG5PexpJEfttoK2U6PrzZ/8lEptfjuji3WSzhbcC4s8HQ635aFBMvMslCDQ62lzjaXueB8FyoD8weOdpN4n7r2mc/WbocmrLcYY6dnDvf6P8wP8ExpBiwX8Gwbxk4dNsAiw6X8B5wL7yFm/h7PRv5+ybbcMLFq3meUc+h9/gqa2bekJGOB6ghRaLWjfxEnCnvFEW+VFF0XIpWVk9OTn5hYV4FDn+wjmZ8ccENU8cITbg2ScTyCGRN9z7vcHDPZDW0qmDpqQTPM7imE1HKfjTj+S2yEKZCzAKxAkNfYCCmbr52eV0ylfmwGSf/XCaju7PAzjt5Qk/WyxYKEe9cQbPD7PJQ64Lfw7qD4wDOLZxj6BZskTzazp0nV/gA/QTBqv7B4c/zJ5YmOuAUwsHgwmHTrRaLkGtTp0ffnDYb/BxArt+MseO8HB+YLmnbwQPb2AXoJZlcz51UNn30BmfFhx5zJkGz6j7mP/oHq9y0egORVuM5K4f8Q04xh89wwn5JtkkTrRkk9ndbCJPrWi9HariKmuVxvvKTkuPq9ti6hfciixD1NdaUGxpm6ZXa6zVruvOkP2qSB3/VxuN2xTq/of8MBvwO7OjZqwEuWBZablnjO+QDG5cBvdaqPC/hf/IWhRfriw+Pp1NYuwH3ATorKS3RhJOErwpCdYp14bxT482zGtumM0E66wDdd0H6VSRHLYcqyoIlx2r1zTGpnajh3/rBdEy0ypCoM2DZFsKkMlhcC+Z6ykbi2D3WgfQ9MGzGoGz1wyaNQuYaYNlqhxZBcSQY2P8UYGhmosoF5DGrwkusM4TGYFbPXdObv2QnThIDFBEYcH1zbp/N6LhyFkt5gzc5WfWD9kadEClEgZ5bBLdzBH4ycI7dxCBRCf7BYdzwLaI8aiegFd+74foqeumoDiyuYSTN3k9nMyMd38i58ad6JPcJNbrz6OpCTWcm9Qzd3uFwEnmKEzk8bQydK+oXnujxBCpr8AWCnFHFWdQZlKFNVhgDoWhNPiDZsQSDCIzaKbbEjzCHC8W+ITGhK0F9FuFRfIKBFRUuf4ZDG2j3mxeS5xSs/V8AaaHP5/9k9UQqJToqaTH85fB/hGxt70QeaMYddPw9BZC043D0k1C0q3C0XVC0eYoYcbGx9P6lzCIg6Ks50Oz9wzNXvRmPazLr+7L0v1SuQ02FzGtHcDNYb29bgOZHQQxTQFMXlkzMcgaIHeXLD6b/spgQU+sS/hjd+FedcXHhPpm190h+Hs8IrT34JOf8KkFAuWHt7M49MMXr3EJYM0WdH+GH2xqVxM4xDgoLP8OO/yjFzGQAfMVgDD83BYHq7lJaBMUq74WeUu4L229LrbewSHRGmZsGpDWDtkYl9b0ZvL86lR11sxxf0HqdONXItWF7V35hHY3EtDdPdCtEUkrvDtl/jj9pPdWC7wfF74ZGVAtjQiMtd8eNZi+r7B2J1hzbZx56JoNWgKV64LKe0pLwpYJWza/5pQFl3XWe02MWeTPajDm6u2zX2/zGNOCdxxrBh/OW1uz4wzm0QA3VKCN40OhDYs/JkDaSIIOsemjlDHCyg4dK2u+dWhrlOFZ5VqZcGzamx3vzYODtMt30KbR7arRGwPd5R13gHlXzJzgb4K/XxH+LpdOQsIJCT9gJNzKUCZQvC4ovv9kJXyc8HFbfLzCK6gLlUudpQHLa20rws23gZsrZYa9PIZuYFcjqPPlKkhrVEkFTW+0t4HoNQQ9LoBeS4BO4XmSWYL8OxE6Eqrtg+Vm/Xj0UHlTmT5AQNgsJZuHg8vGbgEGm7vtojpH6bT3AAkm3LU73NUsCZWoK1XKoEoZVClDj+hWWoiE59bHc/ebqITmEpprWUmj1J7vqrJGjf1ElTa2guK+ABm89W0BklccxNWwqjUclvPZCcHoCsrNdXW8kG6BEBuDdkmWCeLtTAhJyHYD8tXrUYJ+W8r6gUPAeqnZLhRsmkNHkLC+++6hYcMyCCI+WohYLxEEFRNUTFBxB1BxqYVJkHE7yHh/iUvQMUHHjaBjgz+wGQjZan8RlPwaUHKiXo2Yco53TfA44OnHYHF/sVosoOkHFk8eCCFpASlr6HlUSLJ2/V0CyCSwhBvzskNz0OZePHtk8u3NyDjSbBFbv6bfTH5JPrcNOZv1LNXj2IHdcXhotVngNg5Slw3dHJs299oJJF0y6f0tW1HcVlRXYgPgtVl2rIpKFLk0Ln5FdwgS3E1wtyXcXWnUEspdG+Xeb5oSuE3gti24XeI1dIZpW+8mgrK3AWUjfefADy8UDPHukCMIYGsY1R4GFFDHkdSI1i39iDHmhACbA5mPQbpIPIj91mBRRudQZm9D6Tt0jDQjJVsGSXNjd4WSZrrtor5v2awpYfd4Mc+MJFCi7v5jiK9WprbaliHsriV2t3dEJfCOwDvrErVlBm1Xd7nV2FBUnPZ1ADzBuyKCJ3jVAGT5C4u/PgRzdhn7MaMUqeaAYIaQxwQE5hbeIQBIsklwYkMhIyHaFiip03sERtaU3YMDIXVSsWnwUT9mY9BR110XOZnaaRLKeEQoo04CCF2kvEjKi2yUF1li4RGoWhdU3VdiEphKYKplJqTWHu8qBdJi/1Du4xagUw50IyOAR8AJNL5UzjRAoz74sznaXO9/mzAucgQmNEdLC8Q8JsRUs/gOUVOSU0JOWwobCdM2EVSTLiQUtYEcHxySapKOTaOp5nEbI6qmLrtAVY3TJWT1iJBVkxQQukroKqGrjdDVCguQENa6COs+E5RQVkJZLVFWo73eFdJquY8Ibd0C2noHvPDwgAKdKbkBUlPgUAs06+w2CGM2JfihPeYqSXmMiGu69A3grSShhLY2EDQSpO0jrVkNSDhrbQk+WJQ1Kxnbwljzo7ZGWLMddomv5qZK6OoRoqtZGSBslbBVwlZbYatai4+Q1abI6v6Rk3BVwlVr4qo5+7xrVLV0DxGmulVM1Re8UBBVyZ0GaFVykneALphc9VogQD0IM3l4a9hlxjVej94hfLifDHll8laR741zvpBbLZJGNhrQUwamxuKe+wi4RcHhQsdl5AxmLnNHuS6WqE6hlyjy75lzh96Ns/Dh9+EILfroIVjBN7jT+543DVa3cwY2K6jVaBKEbOp5/VyHT34486FVhLrCfwpmU8dfvDjCggEriPeOCuVuPpvEkZgmKgexkn6Un6AfwgNAuijnhThXD3xSEZvfwTTWDfGQ4p7RE44ISg58kF9eoHNQd0Guj9liOptg6jwHdVAcU+WFndwGsFb5DVeQQBKgRa6TfiLIfQdtQzh13EOQc4M+2iEkscbOwm3EwhAWLmXdi1bL5ZwDe4Oh1oUEsR18M5n78RAdZydG4fpmizSP6gHN19fljsLdST9ZdF/Ia+KmwdxBbFfArFvYw5MHNl3N4Wy9A/sJWvX/lQcMh67n4b70vN/7ztPMd26EPfUNFNK1m3Qw4L8OU0oPJsmyxB9uTno6T7LNGib+ghucsAwUBds1nPR6dS30Xi3/6VsNUL/Gfr0ujmQS2rFZmke9UmTqwFDtnHraNJxdGK4F3pzva/eB5irgtRZQoIGtLdC1nKcXLf3nxUBRSl0BIhmW2WAjtjDS8LhwdztJ2DlBkHs0t0WtLgXjTO5YZPbHpU/P73HqtzTwGN/5i3sWBqtIR+hDvW8jt+hjSl4qLL1D9OGoZGnv75NNsNSGt8iKw4NTplUPUv6ad4G4RIvHpci06EFFmVuRAvnYooPVajZtQ8d4ddvicUX2yqNAFZPwY+aVrKO8i5aqjlSZDpfSn5Z0JzfpUNKhpEMPEerSa7xNI16mURsncOo77OCOI8NM9/cSeDXRQ1z9bmiYSGF1O7FRKhui5q1sJOW1sl0+haRiikikymaoEatXAXqvspGi3Sw6FDps3ZAyb7vKvNXvXivELU3FST6MDDEn3uU41AErebNlnHzQN8MNMsYf+j/LrTGe6AxebVqQ+otpZsiUsfhH3wR3xRh/GCYN+2GMP6pzjpTPpr7EVhgnH0Z0WRhdFmZ7WVipI0tZwXWzgveXnJQVTFnBtheEGby+rq4Gs9pEdCnYNoKI04QVHk9JjEBgctxpEAe6jIOQXbDJKozAg/8kMmeOI7KoXfoxxRcNBOgwyniE0nUAODnnkrF7vJswckXv7r0QJW95+5Ob57MtbtlUDEnMzHBimW6jaNCOS/nBYfRl0rhppL587MZ4fVm3HaD2pbPeZ+xevFNDSHHnSHGZxFjixfyRsfyXkEtCLq2RSwsDjPDLuvjlvhOVUExCMW1RzFLruCsss8aGIkRzG4hmhAwBSkuOJC/ugQxpWdUAgML6h5sEBo6tlKyOnscEmerX3yFiSgJLMGwnIkcitWXItUQ1UqHZZgJ9cEBoiYxsGgctHboxDFrSaxfFZ8smTRVojwjdLBEEKkOrNKAytFSG1gbgFLBttWVIqG1d1HbPaUqgLYG2lgVpy+z4rqrS2u8mKk27BcAW+aTFa3V8aoB+gf6Fzb6axGeL6RFnplaS4ZggVwtidIi/HrkE7n1e35Qt44eGr/V3LnYkVnbQqa2+o8zVHZDwgwNlbaVv0wit/Twaw7W2Q3SQwWq9mv3NZuU7kXJZu0d7bWXHKq+Vc2nMf1JOK+W0Wue01jTZCCmti5QeEoEJNiXY1DbX1drurpv3KjWaBkZtuNUoC3YboOokYY7nL6aeOSe2kolizZM5bE7Hu2Tzu6/M/37B7ljIUMlnfgPFvS4swO7SC1EGhVqTpT7v80NJDUj5NTCZxbNHln5Yu/Hpn/DHlM3XKs90oY26Bpcv8lLO/LRky5U9N8BFup6/XM7x2iOYOtZtcsS3sR99BysOlznGH0N7TBGpmjnxODHBlpz5kY3OHgGtnYfgWQf1qIDBX3lZ+fI2v7y/8L5+vvjbh4+fv1bR81yZcwtI1bB8WNN3tq6YiWW53C9fzt/t8lILS6nYI/YsLttaKpkMOyulnr5DlaL1QCggdP2NaKZm9WY8N5KXaxl4AKYqnzBUmFPPohInRRqurtLccJUGcnHMf+oPKGDQGP7X/xFoP4b/Lc8pqbM/BCHYSopmBqYUBOkcfaHbOeOClBVSOILBQPc8udeqHs4Z70LjzXhhGfjZJHrCOUy5xc0jf/zf7V5yOZ9F8bfc+ML+vO4kokYysXOxOLwSrkXR6spK6tPZJMZ+wIqCzqriEc0EsFTA6BrQQ74GlDRBNqqjHhq7HSLdU8VTL/KlsuP4ri80TJqrtqpK4sXS7uV34MnZ8KNgFrj3Psae9db8H75V3WrngoNRns09m5ozrF3NKdQItTbrgapnLBqKC3qxVPtCAQ9n00j7xDVd09j6msZDFVE5I1XXWd8DqZ4GY/wxqmxqWcw+XetO7JX9gaB5gbsk/t6kzieLz6a/MljQ07EUj1VW/Ir+enYaXbrtx8PSzZm7fkLAFjavH97O4tAPX7zGJSs1sur+DD/YtLqGpTjQnjDY699hh38ErxKYY76xCoaf17K868qwjYwSAHAUAMD+1eUtbsXd9thJhXWkwmrWfy2ul6AEOelUJCvxhILgWVy0ppGTfYQjzEcjoRKEShy4pCZFJYtKtDZGkSqbcfqpGq0o6J1x4ZvqTrSqaKz9lsCQTqtSMqBvesaMM15GA0dasVGPDyYxLP4VERPjjLoET46S5+SEvK4T0kKya0ouoSuEruwiulJ+2hDQcmw6rh7mUi49BL8Q/GLv1Fodo4TEEBJzPEIr51iuZQmfIXymCp+J1xLk5bEag3Q1cuFfroL0lUtppdJrDG2gIA1BXxUI0s6nWxiIZGiXoKUOhaAWkwkvoddRjud1lDJFv0MYTDtlUBdaMJPk+ICFffKIKnU7OfHkxB+LyKYuvFmb1XLgyfOt6/m+eDE/6mXBIMk37vhqeNLaZcmZB+S6dOX+5rraGTe4MK/NucMkW/viFjcQikZMJzeZ3ORjdZP1B8Ieuct2SqKN26wnEbnP++KLlOp+cqPJjT420dW603otR271Nt3q5Nw3+tc5JjXxhYCpH4PF/cVqsYCmH1g8eSAXqIV7raHna3rV2ul06kyTAO34WwvRHNQer2wt04CiNrc2dSJedcSHvHHyxo/IGzefH7v93sBuaJmafr2Z2JRmLydd5Ote5sFXHjPk+JPjfyQSm/j7Zu1XO/29qCXGxa8o/bxTtAA3wBz454WCgd4dchAxAg1j23t2wuo6knIBuqXvjhufzGeDfvwxcHv32FWLHeQY09vve+DCZpTnbgeSa2zbVo5mhiQUON4bI1ynhclvJL/xWERW7zhmtBkFiLfq8j1z2hd9PsGTJreksfjrQzBnlzFYRRTHa3GDnkrI17xJLzuPTm/UI1nZUQe0NtOtmEoOJ0Vij+g2O40C32n31WbT17xBTkMCcld3+GIts+4mN5Xc1EMX1eQuOI3WIrd0k7e2sdh7Rop7EZIc729TWdDAs/jgz+ZfwU57/9uEcVqTd9HcEy0Q8xW9Uc1cuvRISW522SttxHxr5pJ3St7p8XinJqW+0x6qrQKo56WaSEGe6u6a/xW6nLxV8laPQVzl7EwajLzWDXqtd0B0D80tOKgl2UGcC6xo4YWc3QZhzKbkg7T3XSUpd8BzTWeyCb+VJGZ3vdYajLdkLHms5LEen8eaVeV74a+Wb/1m3mqWDOSr7r7xr9Xh5KmSp3r4wprzU7O6i7zUrXipviC64qNKNjTwN975i3sWBqtIx7JDfakzt+hX9CULM+nSlzwq3m6unglsUX/qx37DKibikOBTbtWDkIwWXaB31eJxycsWPdwycGpDLw6+s0UrUiAvW3SwWs2mbegYr25bPD6bskfuQk9eWlysy/NrvJJ1lHfRiSay1DQEbtDbybsIQ+itgN2urUVnEZ1FdBY1Qdv0u52Ku8lJJ4rF4kJ0oSar2wmmVTZEVVDZKCl7XNVO3dYWU0QqVTbDLVq9CtiIlY2U7WbRodhU+1hjr9QcJJyUcNLDF1Y5N/2pU7uoXqKdx8kHm8vg+VDjUAdu6R8QCnucfKh+BFX3GH9UN5VkG090BrzuP1WTj9VfbFaCUjkW/1Q3R/0+xh8WCwYtP8Yf1U0VXT9WPtuMIRT/OPlAxRK7hNGnyY70OIgQgZrLbdIGSOtlHITsgk1WYTR7Yp8ESnEcWLp26a+IqBvm0yWufoTc3iSiwclnHAIr3USuGMG9F0z2lrc/uXkG1PIwG0tJLSkg5JOQz11EPst09q7jn7uuLeqhUmWcIGwqxaaE7ttDJMTikCA8hPCQYxFZOcMyrdcAG+GPj+W/5C136S1HyCkQa8kqL1HFY73528CZwpz4TfpSx/aelI6er+iO66fTpTdOArTjr001FYE6LCZPm16gOp4XqEp0/E6/RVVDE9Rzo0sIQu9T7a6rUa3XyTkm5/hIJFZOsESV0etVG/R0Q6C71tHVMaSBmwLnfxSHq0l8tpgecbi4kgyv6KtazK1Lx/XIJWJzQaIpW8YPnd053YlUNOY6ObYUQt5FF9RWj+92OHk3NEU9X9eW8hQ+lpPmTN7H4HHNo4J8ZfKVj1F85Wxt9WLtADPXH2P+k4LLXbrck4Rjnr+YeuZQcyVnxZr/czKHHS6G7wnG3SE1Yf8MJvNoBFSN8mf9OQgOGrL8FUV+oiey733gT572cvss9/cBdDosGT+zhXAWPeu3JouqAFqwyOVXaZxPiwaOYtxYvd7KX8tUO8kQ4Cvzv1+wOxYy0IOnCjO/gsewWi4DfC0PKIBuyI2qMYY33N5XnlgEzk2y3BvcB4v5C2rcRTQDcfO5VKE1ixJ2C18AQ/Aj9g5+RU+15GE4EFAe2xklv4Y8KoTaM0B1l0ggPg6CPYPpK12kY3Hb/0bh2Q2MNUVRhUVAX+AFTPxFP8ZLTRxf6SFMiIJzDFYx+CZP4An5ESwS3BRJg7WYg3mnvsyH5D7Vvc0MrCix+KXx7sJs8qcADKC8H1nsn0uvP4MNe7GCrfzI3odhYDgV+p9mUYQslUdI2nPi8gHJxDc3/+H09V2gg/oSrEBFYEfc3+Jk5mIBBHMu+Pr+1C/TXnJhC/6CZnocJ68P1fCNhi2IcSPlGUWJTdP5+6o4g5A4KNAouaAURSvQ3r6TTMStXCjYJU+zCb++Ve6kP4MuvZTfuuj/io9wGOgFIO1hGxKQDLYFEchr3UvYYRnNVFzEG+fq87vPg4c4XkanP/54DyOubt1J8PijkJYfpuzpx8dgEfwICwWL4Md//+mn/zs8dfzpNFVsqAAS5SaUir9czhFFwMPT1YwJxwEI67NYqz9/9l8i3PYvUSIPeAYqnQgwYgK6K0YY5YEldC52rjyF74UVvdrMa2NJN+IKJtghd67uHbI3zvkdH5ajR9PZFFVdtGST2d0LgiL8AHHEi9SgCh/9FxgCDAOHgZJcLVPO8kX9AK4yhxgyz+kGRdMBV96P4HicgPqfOhyTAWUKYukEYk7c5u21eCUwkdBx8iHbRBGynICVyNa25WpjMlUpTxWvIFrwITGJSsDwgrmkYKR8BWvqgyswz1jNuw2reV5CN3TvWqLfGZsPJpTCQJxG0qcp2oJaDxM+Kq+i2qB86iANoDyv/tDlQ2jnoHTsnq8/66bTdA5WQ3DzOV4twZ3QqpNRgXkFODANGtDO6Xzn1BfeNltos3LcwXSsR1PcyngWz1nDMj8YEmr4qD/9lYEoPjV5vtNNSRuvsyNr6xuy2Sx2YKPuzflHykLgY4n/f5NgTTcjB6Gsk1swlU+4/R9hFF955mYJNnTSPEEcopGzWswZes2sH7I1sICbPwxUjHYeBEvEw2SKACKxaP+/8GQBUFIxapQJuCH3fohOSH5oxNO4Q5BBrt4ozb4kM+Fdnsi5IJowP8kNvF6riiInq3ZuXOHK8KE0m7vmFk5kUKfLvLbgaq/7gHSvZ4r7VqlgHeqVmXUO6lIJwYNOVQPUjUrnldpIr+o1CJzCbVM4LN95deQv/0RliLo4/64i1vaTt5tx5TQNCtocFefaubIKHc/jqWqUalx9y4q4rQXr68Rmu+fp7sqmkenFJWUHLxXVis2ahFvVHW4VU+USN+Y/9fFPFLYx/tD/ORWzcfppVJIywOb19auN+sqrrlpKdTelvq3E75C015J0s4aSKxpo9kIVv43pJ/m1NznuzTwcjpyT88WTP8dczPB+9cgWoOTBOnCdd/AVBmOWsKrTfyxOnH9knjxxnB+cM6efzKcvYGSZDoaIPPTi9GVRFZiFmzE6+n8ydNmXK5H9oeln6lBdVv9PJ6XCuTf7rbG82my/XscKulQ5lyjmSqU8zNi7Bnsnr2FBgLmhLVyxrLl9tngZISSD9rRufxqyhoZ54zZjHSu5j6eaqNW7AKNjs8VkvpoyNfiLRwzfKjf46A3Po0Fp1/QBntMz7+YWGPOdR2eWQTQTvsN6y07ZdMXRH1ezNkEX599g5er0R8OesV3ZaT7qWecoDUt9gzXNWwbm1Vw2vRUhgbXUhxSsTCfgCsfU447pYKjtAtW9Y877SkbI+cWGgdDzNoyTjqX2uHbytc8Uvx26eWwxk8WXMLsyebIWz1LE8Hwxw4T+2T+ZJdeStab7PJ6/DJqvQXHAk9q3Dbz6v4TLySf5uMa1V2OYJb0r+VI5paZNos4SyjQ1cULxX7LJ01VwgkahpU+7ajl3s2JTaZpNuE47KBskX2y9bKAsiXODqX/MUTaro4u9254pGjwE2DmQNMbqvy7++N+DoU3ScQFZWauFe7ZAlcHWk4rTxnrxF39FAfD4QZvsoGSQ9C+mvFGZ4yCeNkJEotHP0GbQz5TJk/bCJ/GSUd+QxSqiHuO+2Mh9fSO16HEetCjf3GlSnWrCFBOQM6deNhEhL2O9oiLEp1e3qZWVjuh69yz2RFYhb6Kqx2E+VWRQsL3SjrKLzBliAipGS+wXfB+rKAyJAhWTLFWZpYd4bU5I/ooS46pS0DctJfuo4iAaFpJE2ucpt8xR1uUniyQaTD7mHxoE5TEqmDkEeQ4yHKV+ZJWR6/xh5DwEz6cVnsVfg2dt4qja5pf3F97Xzxd/+/Dx89dsknOaWn2uzLRtOoJ+5bCc72x9zQxXuV++nL/bpVVWrkSfym3PVF2cTKWKwaBJiVXsSCVevTge0LQk/buKaPnETG3znKpUlZJFqrPSXKMskeZj/rOocoCkY/i/+Aeg1hj+H1WoJK0gZKz3TgRhWCAn9Ja1nHmPVbNaeynbmlavwIosSZHO1bv1/Or9xdnV+eef7RggXT6YTN0ZVk/n7OPXs79fGhMY8TjkUwJLKv08uAuDf8IReBWumDjkRI6zaev0dBvh1B45alRkQGNE7O+ryq+fV9nmlemW6S8bLYTRLumhTRUMEtDNpC++Tu2NNkk/LRN/2ib/bGovkKy/WsbgAWpr2nOGPffG+fL/nNnjMoTDBiMpp87kgU2+i+Djgs342za6iMuzHzn+BN9FWsRA+pdcr/ewMky6u7/45W16+yUPrNbBdxfwZSKHEutVAHj1L2N9EkLLwRRg2WYwI+jWWUJdNzl/pVGprvPp2ufUNaj2UpFIZ5lM5+lBQmPsgr8KnXv3tk5pl1NjQEy8hnoFZBbvoN6dvP9tifpjce/cBaswftBuUvFmeGXuwMi5h0n3/yWlXkeJoetJNP33/okmP84+R846T84+V84cckj5VVW7R8+6RgkmzbgI9kw43QEm2pRc6VlsqMYJb1ZJbxaJb9bJbzZh326S4Fonwu2OOO+6KFuJcbX+yEZTS3LXygnfOmmtPhMiBpaSkQvSsFOZAeZmH5O4bLlStaa6HKrcCAeSYVsjV6vXPPsqzWYamzOCygtFZYLGzcKplbWb1FpNJZf92iUXtF/w1pbTMyYCZY+R4krSrB9jvuDuF7DKB4l7b0r+c5J6LiDoWPZo6i+x4qlT9kwPvFqsKXP7wh9yf42USi+PsOFQDYriEbwU62SCL2nJQqicFqjFsf0PTzCW70KHF2zOnnyhPZPOsDpWGCp/EGSN3F5PxDSSm7tke5zMGS4AdHXCaCwIMmdxsEhyTcLhaRLhv5HHwcJHpXID48a8QAXwQPIxWt2KkWbrChZYLYP5kwfZSZ4CghHeuozYr1FaKCfvT74F/c8LfX27HjkFJXWd78lfAQXD2T9LOkqloKjzrtcibe0t44jKsJF7ln6W3clJxqEPGxILX1lMTYcaKLq5AlTIR2S17ZNagx9WsPnZN1Ti17l6IS/AzPVXRerkuuDts4tWOLvOtzktrqjyPW0PdZMHggWbHbrAsk6GoOkdn8ypfo7rZmKUU8wmK0RPnx9m4D9ieDCr5ac8v2PJFlO0b8b62o34XVFrfhPTuh5pMrgfWbCKx/9nhHtFGE1RSQ7vG+ctx8fgMH5m/SdRgGfq8PpWoDPmwT1WZvPDhTCERZWeWZjrg9doe/AjMMDYwklpyjWsyIwWVYPC1QI7cvN2wJwtBkiOoTMeO/+reBjCNO5hp8t56M/DuxOUfIeXuOaqu/8v8eH3vnZqL2mNISwid6Lt8+TPX66cr++ds4v3zuXV+cePztez86vzn/8i6jOCjgpQ/cbMdf4erHgRsORAWYKphtasoeOkfpqbzuiGK9yEGeu58cmv5w0nHL7FYeh2ynPLp4EDhGZ4CvjhCz/t0BLm8oUTjwKkTMpRrOq0YE9YPG8yWYXuSa86Hzk5TbNbHHPa1ZP75+AZeoZZ81MpXiGw6txwQb/hSxRynOTLY3Y8X4HSxYP/hMcXLAjsinAG05w67LcJW65LHd3jMcJFZKp/a/nnz1fvT0X9pGcuhtzPgE7XHUmSS9HhDWCcJ5Y9/oPV/UPKGs4Yf451B18Mgv8I9gSeZUonj0GI5grzw3Q75UZNiIGzfXiRb32DZZx5jTqecP7hHo2eYTLBs/j1Zb2mNS2EZhG07qWJFJ43W4AW9AZYr1DRV7x8oV7XYr4s/6v2tE0K0vEsjfTcEt0jut/JKVjI+chPKDeyYSVyqsqRgHwcZIgw6uVqM57WCKqtH/41ChaJpa2eEEgS+G29INlmneKGT7oYMY8GaieKccyTbuAB+RdeFrDPv+yrrQTq2H8InrFufdJazR5b9/GNN7tWE7D533WJd0kiVCQzZ7Svz4k56t6HkxyU/d4HAViOHr+m4HZ1x1ePZ/SjH7uyxOtV8F+Rmt+UFfBotUQhdLmfl74a4nLGSjYNTV6GnCuuFAj0rcIkWq9bTTcc1XpKk/Z0XShI1440pjdosoTKZLTJTDMNbmQhBCoxtIC2ZuR11ppmaBPziruXp21vZPuKhHCzJ4FhzYIzgYRPKwpf19AFmnwBmZI+4DQ7NYmELJSciEMOYeNXb2jiXKE/wflGS1+zqwRewtGiu5N/JQZL7nWE3wf93J9mYHENTzTVGGEQ0duJXBJ6fYoPeaIrFYlXf8BD/HS7DZ6wBiWcfSxxb4UXj7gRwoaXk3C21NTOXPK2nihsOZvwXL3iYOD3svnYTKUr+Jd9xEbu2y+XV58/vb/IoRZFy5UzPGTRai5fAEkNfclVrR1Xe9vzrodVyExjSdiANGglwvnB4UFX522wfKmWjg4lxF5KOpEUg7QIzZ8RFoMpoLYyRL6EjkVKImxsDk5ZCNsvfhixd7NJXF4nX53UN/Emef+6vBy+MNHUd5y8QUkFfdPrkmXB1r6YFrd81BmWUB/onl2L7OK6NE6McQTRkPuxoM8NQ/CjXbTs7aj1t0Xzr9R4y53ruRNd8+qyrAq/Z3aezlKrZ6W1tNDqWmcJZ9JS7Anh+TYYg+yn73VJZNhJ9GpykdlpRfHEBjacettz7o4F8P/V1x3vxaS85e1PyauPI4UpPG5S8kgmKqdWjat6QCStKeDgbhlmynkr+bHXRtluW8GCwALDYaF4v965uUqRffQxbg7RKObQPk8IUF7nu429pz/68+WD/0dvAWL4a8Q3TpYcevvj+2wxHVf0ozsXcrqlqgupWMw2kNXb0WuZUsr060usl70fbhBEcwcCTc68pzteg9CFv5UkIS2XXlLpP+1B/bLk0VX8MC63IXnSyfouExcfMRZTKpxg6lNuHAhr1uPyVlKeo8TgTI5OZFa9iStP2s8fqxFoOmg09Xj9VoAX4ratvQRND82Woumo9pIMX3P5F1cUYMRZaNGr4DIOMVJkeEge8GP5r92DQ12zrOeRBgBOy+Kia6WX/Wu+N6EmpSOSC0QaQHRtDFWfJx2HL6f7gg6so93HggJoeJ8GX9bUMG/nktBHyRFh8qoK8m1usj7bR5aljdQY3TNL44U3iSxHD5jsdqMGCTHQyiPKhs4mQRiySTx/Wcc8efRPEhIDrTJwy2N8Ivpt6Asr1qXrdssAAB3Pyq5TzfPZlAMgCDDQdJ9LJOORv/zTb5O585zKorSt1xaxWHY/wPlqUBWFTZ9AotfUvdFM7sa5ZRNfxMNnkaYvcfeaMMxuMEB9o5wT4h42GOjt2c84KqyOTVYa1OaN8whjzoCbTjTDj/6CBato/uLqohgVPNJvRolQ8C1VljlisYnNG6efTZXrj2yhLh421giCroTdJ/87uvlYRjyRah6BvlHSECRVZEot0Ey5fG/dkxI6xxyuMHhe8JKJIo4uBRr+hItahQse19Z0kwn7O98x088P+VXc0EWwCicMu5gDQbhSmMWmwnqPs/sHvIoQ5W3F0+DC1YLnsQR3YJg/BuELz4EIwoiNxEDo7Gp6uguDR1jejKcdJyIssliQ+eIVlVCeK27JfhKfNHanhmPaHFBNV/tyYksB4MAxws/CXjouDL+Oc3vBn3DXpLLTKrY6YnYn5+T+1Y948vhA4vOGFTQWqw2JVk68RHTETro6lrB6UtaZpJVIW51gD7f8K4BQKynMirprjqiUG3415XUV8bBIv/QFkkHVldbGv8uz9+w2COHAMTfDI8IT8ymnkG1srRadJRFGlc9kRw+XEzlnzuxLMf2K66qH7UNx0jou8DOUYHh/r041PmULzWM8GXi8xzJOoO5ESb9kCkpBwuKVridfFoy/OcWmyVnErRoJ6RfSZ/i+aBN5ueCXL28j8sIfqRF4ke3zcZeuIGgb6FncTD3qdQk5J1AzX17f4iJYM8LcGFlujSg3QJJLEOTayHEDxFijLasR4qbIcD1EWDM1ewS4LfLbDPEdGivw1UZ2ayG6FUhudyju5hDcAnrbFDCsBRQaAcISYNAECObfQ+kAAOwC+CsF/BoAfV0BfPXBPVtgLyH9ajGffWecZiWw3AjJ/+4zPpPrxUPGefz1SntYkIOAuY7EeZngfxP+ngbH/tZIn2gS5R7M4X/g84G03DL++rgPRx92J15EepYvOGJZn3ylnyCYOnewlFs/qRuEiBbW/Sm+RjTis0SgLN8Nlwd4InxMUaNk3eLKb7mEtSjD3zWvVeVFsAmG2QS/tMYuU9zSZIrkXw/OgF86qLIbmLIDiLITeLIbaLIVLFkBSeY4UoAiq2DIjaBdRpRrWKgiUBcpKEMJyhACIeFl4IAdMNANKFAXEGgJBlhfVNLrtXH+q/zjjDvXtXvMOy96x5fA9KQSxn6kJ6ozruErZx/bo1RFdeKUsEgJi5SwWC9hUd0/lLZIaYuUtkhpi5S2SGmLlLZIaYuUtkhpizZpixY2JCUvUvIiJS9S8iIlL1LyIiUvdp68qJ7AlMJIKYyvlMKoiyJ0HanJAP6FgI1yH1ZXsZviFVsUwOkwgGPgGMVyKJZzCLEcBSDYTkDHsJ8otkOxHYrtUGyHYjsU26HYDsV2KLZDsR2b2E49c5LCPBTmoTAPhXkozENhHgrzdB7mMRzGFPGhiM8BR3xMEQJN8OflKnibXAdVQEx3oLaFEG032Vgue1zGL/yZ9/hJCfRUtDy8chZa5lF5i0YoNJW36AxFpvIWVN6CyltQeQsqb6EApUdW3sLWNKFyF1Tu4jDKXWglnspflH7bTfmLCr+ve99aw+gqz/r9b8KJIQ97jz3sHBPJ0yZPmzxt8rTJ0yZPmzxt8rR3wdOuNlHI4yaP+xA97pzkk+d96J53juEaDxws0o/B4h76XsAUPrB48rAf1zboZl58sfH4vHENWcgJJyecnHBywskJJyecnHBywl/JCbezTMj3Jt/7QHxvjcCTy32ALreGz5Wetri6Yacuf9hAjHuXCwTp+EHlgag8EF31ULMykG4jUV0gpwY01RiiagFVleBC9tBVWwirGZRlMXWqC0R1gaguENUForpAVBeI6gI1BQabgoO1AMIykLDUmKSqQFQVaB8OcKoKRFWBqCpQh5JWIm0pyakqUOuqQLqjmGoCWTHRkrVUE2jXgjcyDFCI3vyFxV8fgjlD0WD7kSCZmXKNKx/kUIeXGpkhCOVEUk4k5URSTiTlRFJOJOVEUk7k6+REVpkklAxJyZCHkQyZkXTKgtxCFmQdaKsLTzrD4aIH/cGfzb+CwnmfaBaq77MfbnOBceQ6k+tMrjO5zuQ6k+tMrjO5zq/jOtuYJeQ+k/t8GO5zQdrJhd6CC73lWHSByWYvWrKffOj98qEl28iDJg+aPGjyoMmDJg+aPGjyoF/XgzYbJeQ/k/98WP6zlHXyng/Xe5a8TXzn/5zMYf7CEcs501+leb7m0WQe1SzCI7souNENvGKjy50MktyE+zr+ceLMbMZDTtZIrjG5xofnGu+mt/vG+ThbfHdWS2HZa0w0/rIRmlySFqlLN4uVXhIjBlvPFtKOcZ5m4JWk7IYmg+ENNAFVlTp9Sh8gq0v/Ht9kvMn6SOB+CLsejLf7B25eub9Gbl5Lu2v7GJaeft6Ga5844jjuPHK9tWfuufcsVraePEhn0WwBGgmmOEiajhLz5VJ+oZQqG44c1Fxp22EDVEE8WYUsJK0IXSB04bXQhTz500OpFF9IGu01wiCIvEWEgaurzQEMJTYdIQuELBwGspAIOUEKHUMKdVLa8x5y19hC0n8xIP/OX9wz2P1iAdFOFfQ1PpKbdItrc3a4wG9ukVTal0r7UmnfeqV9c1uIivo6NTC8xlheC0yvBECzx/jaYn3NMD+LqVNRXyrqS0V9qagvFfWlor5U1Lcp9Nc0wagWBpjBAe3MSCrnS+V89+HopnK+VM6Xyvl2KGkl0paSnMr5ti3nmzuEqZCvFfssmUqFfF89/TMP9xciNZdxEMJhNFmF0eyJfWJR5N+z/YjXaKdeo6Sv4fl8NukOB3O0K6CQDoV0KKRTL6Sj3UgU2KHADgV2KLBDgR0K7FBghwI7FNihwI5NYKeOMUnhHQrvUHiHwjsU3qHwDoV3Og/vaI9iCvJQkGezQZ5mIYeuYz/66EAhAoQVL7sMAG3vLkfdzGvEf/SPv2YxkU0W29StlsqKNEKsqaxIZ4gzVdykiptUE4NqYlDFTQVUPbKKm5aWCRXHoOIYh1EcQyfwVCij9NsNX/5Y5gp27Zbrxip65eDPgVm8msRni2nnOZpX63N5G3565VpqOO0Wfe1RAmflaiiZk5I5DyGZU/EEtpPRWbmzKLuTsjspu5OyOym7k7I7KbuTsjspu5OyO22yO5salpTpSZmelOlJmZ6U6UmZnpTp2XmmZ+WxTFmflPX5Slmf1jGLrkNN1eEFYFOv96bkP+cicUy51eX4GLnA9IOyh3pvnC8RzOX2JbmZyPnK/O/rrmbo3j2yBfAJDFFu9PkTsBgTpQ4O4JRD89AT+sc/PMGQvguTAZUsUzAm8xl0ELm9Hr/LLlERmYGUWMsgvX9DbQAczQXeuHNsCq79QYmzQTP/dl7AfN7K7799M+iJR0F6V7LgepTr4AxtVezhej2YL5QXl/ZTfu/Rt8xGcmEjubKRKzXddSFEp3m8cnJpH1y9pbE+ECslWge/neYHAxtKHXZQdj+TtUZVJzFK+s9fiiC3c+KuJ4waFJpnPfLK0fleA0lxlvibx4oOe8Im/ifFiCzy6PIlitmj5FRR62msT5d3KtT8l8X3BbhtOj0vGYiKUpnm7//hnJiU/smVTKdaRSsg1Ytwxfjm9WFHsCV8tQC6wVcJbZJRRs7zw2zykLjo0Wq55AvCZ9MKR/9YGId2Ti4Z427nfPY4iyMH86FOnYc4XkanP/6YdjFlT/jLPRjdaAf+cL+aTVkk/v6DePTHk8qEIaGlJWmRu+509bjUHPb/0ucriXO2f2ojMHL/XAXvZpOSaFVGYDAiIu0P27SI3w2ZkVKy/+yD1KbuPkhu6vuf5pNflNvX0kajjN7RZcBYk9RM1k2Rdk0GWEklac3Gz++98nZVWU+txS41qbqkTtJpQznLn5kROGTT1ZxZnJsiQKucILZJK5nCYs5/18tvKW+fu69W2xi+5+FT9738UMyckUTIrwLtNO8dWKRX8AHv4sV//3+wUBxPUGePyyAGi+SlKoakTEl5yj1ff97dg7/tOd/TK6wkMGItPTlVFvvR99RcuGegJ+KwuHVyV1FewUMGRZfkMpQGbISPErK7NEjvpV+NbF7SEBspl+0xSImWSOM4+dD1cYhUO592qpWwSxd/gGi30UwCODqbThMqIHg0W4jJ4FEYB9zqABKCPxP7rqqd+Dc6TYTSHLl/AZf7k2wFQpNdzKD41INI13avzi7/5l2+/ev7d18+vl+zx51FgZjXYKi+aaJYy4IeBQEFa4uFg6HrxVwSpRQNR1IwhgPdey5ZcVEUyFj5nG2UkGScfNDO0k6ciqLUQowkYbIy8XvPfEqJzHnTGdX4YMq88Fhx0Oz6GbbBAyP9U8BPtKj0LJFt1j4Ul6h54E+jgdqJeiZ0eoYWkjLgyOkrjfugT5JZnpo2Vd4FzHJMEt9VHiiqRn8+86OxHOhbZgbX/B7lPm/R1xwQ39lL6YPwd91jD8GzIRGpnHpnH7+e/f1S+yDQrnwFz/5L1B85H/x5xIbmFwXLJ/DL+wvv/Or9xdnV+eefm8wD9Ok57At+RPRLpqFNF8i/k9jLKRbvwV9M52wtEnerxSQOgnnkgqMez/xcdmVBzd/z+D+qGjAUVrdFhZ+dQCaTUK6aL/NE/OUK/3AyrHkgDPMKXw2+Twopogn2Ms7QYKQFTVDZjKusr2Sxzr85fYme9C2umBedq79km6kqa5wxPkuOE5Ea0flxQoqfFD8p/kNQ/Cg5iZ1vFpvnB7ZYy0t+tyF4AH7h41KkHSS/5WAs7IMHj/4LtogMIKULTqdw/a2PDfvX2muEVU1exHNy+fU659PK9U3dUkuMRIRli+QY4Eo0Qmzl0tQ4GSxPh80d+eKUsTryrdZe2y6gI3995CsZkHTu07lP5z6d+3Tu07m/kXM/eb+MTv6dcPYlOzo/9gkSJguBLIQjsxBk+qzWSli3amsh1LYOerVNgxKzoNQk2KQ5YHUYdnpW9N44L/7y7tRhCzwAe/8DWtgv9oXqGQA=");
}
importPys();
