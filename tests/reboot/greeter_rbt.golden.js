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
    reboot_native.importPy("tests.reboot.greeter_pb2", "H4sIAAAAAAAC/81ba3fbxhH9rl+BMG0lOTGFJx/qcY8ZEpJVS6QCQmbSMAfFYykxBgEWWDpUf333ARCLJQABMunTDxYl7sydO7OzszPA8ffC2zdvBTf0lsHjpbCBi7c9/M3J98I1CEBkQ+AJzrMAn4CwjkIYuqEvOJvFAkRIabVe+iBqC8JoIownpqCPbszvkGocbiIXXAoQxDC+iIAThvDiMQIAImkCg4Tu8SeCEu6f4VMYCJ9AFC/D4FLQ2nKnLZ20Wq2Mwr5tD7SRxMkiClfCYxg++oAiY8Tlah1GUPBA7EbLNQwjwY4FK/uzppa1DpHFvCr5rlI/fl45oW95NrQdOwZEn/uuUL+9DFB4AttPgZzN0vcA5Z78jsL2/j2NhbUMYhBBFDFECameUa34/OQEm7M8R3i3Z7g9Agt748MzJEVJRA5sf5Fsf/1kS6nhcI1hY2vtyNg4ErG8EFqpGPkjlcFC5UjQjj9X41CJDKUkqGC1hs8pEJUh6qkc+YMK7WHZ62UKYwdBCO2cdwwYEqSfjBRBOzkZ6dOhcXNvTgwcVS4dsqi2B543BdHS9pf/Bd4VOh1nzuk8mG8lu/wsoFV5vhVdItGmElgD/0Mxu0jjdZHEfKeFJXo5CRLN3LpD/btIA3VBgpQTcRMR5P4F43oi05pvbRXRk7AbYveaMqecJZV8qcEl9AEmg+UE/ONsDg12RSb/sLAa2KtUVmZl0wUs6iJRaHt/ABcuv6TSSiadW5M/kghLEXA3qIR8AdYKxLH9mOqpid5WdOZbBcODNhvrtpEq3lE9xEYSI+7LS4w03/aQvqMlyOK8NUO2o2EE0P4a4D8bBPv/E5oW9oMgIzlVSUjGa7S5ZNHWdvvqkn3Ne7BPSiohpVJneyuArKNSw/qg7AJ/lo86a7F9l2jqAYyeDQ7L/jsOck4koUi9Uz6D5yKGyffMbnyx/U1hhOkK3mMkrRCkeescm01oJlGjaD16FvJpljO9W0NhXoA0zJIyBXCQ7k8+2oX7KpWl/HxOc36+7UiRs4SRHT1zaS/n0/4iH/0CIu0x+gE89hCw8Hc7dBwi6o8WgS/oErLsBaoJlmTFwA0Dj0tKtJkYTKayAywqTVNBm4QbxTlnnBghhVNc5FxkNzAXcMCKfSJSLZ1wVPOuZhv5lu4irpnW0uNAs2KhttmbrW0i8RsPm+xA8uu8ReuPYyIPbsPg0dgEAeqmrgB0n5g9/pFIybEPwNqCyxVIohVzliMSeSJmIqlpIoQPc4c6dA3g7Cn0wRQyVad1RhbFWRh9Xvjhn1zKFhwAaf8AzFt/29ULLYrCaLaET58SnSYw/6Zk+Mra/PzQbEtLEdjC4uyuVdQTgNYvhJw7Rfc32BNjD6VSSbSRabYgSAtCwCshkBVoyaOZZQDbKyOaelMsw+bAUbx5Pw/OhsgGjDYuHATey0FNcwgdWHSfdrQ1fNqjohm8ROuHeXBew1AWPIekCQlOh1xRqEAEjyAKN/HVEvhenGdlF15hHCV2mUnkaIeUT02iw6wydqJsa/K1ktqJ8qc3yf8Y+Iu9poYopEsMKeSvEqKRYndkNI5XTkD+jvYB6EsZx5yUU1TTYfgZBAlAJw/gcLJmIiqnlUrs7JpZrN7Nq2eLjIebza4S9zgPkyU2HHDjEGHIB4MuoI3Acs7SQ01vCEHg0jYhYCsNt4rh+3SLYlxes5vBydUnsoiLPz4wlA6u1nn3V0s3CuO9VFIMZpFWXElE+bz+085fGayr4XoPp2fsllrvaD/AoGQJdJa2oujUsiAKe+rl/KnHzhiZVusfFP8OYw9DP4wYmue7A63glT2eIDGh5E1QmJxm655ekqyZzI9Lejet8CK6YC33FdaiVJv8/eavKXU1pS6To0HaSkMf0SYINfp4AVLha0PXx8mClGjQM4dqjCrfPujJIr25tn2NHCzCPRmfUC/7FJKbX76jqbJr0JN9dzj23IRB5rZikawCIlb5eUVN2MrJJ3HrQ+IVZpbWqPJOPR0rCyUY0x3ONM1jYvB3WmnYtowUoBcbVGK7VSVWSYDx+Q+SZl0zsoPYdvG4e2Q2RTthJ6zslNWE9tRm9GyGu6tumJVoXFja/FMjHc/zya6Urb6wITPajuTt6lv6NOob2Mf3B+1si1poUmG44lTZaX8Fk3QH8vizaJk98jhkBJiMNMisyTb2ZJXLr8LOn1rWCk4kIv2Cwx/TMVLt4F1Y+rjh17cuII+ajrnpv6bTHWt54IQRmgK/1q7E2U1uUfGydLT5F73y0+GpFgGuT94bvIqJtKqJzHZh2W9Y8fpf8kZHdklL+1XJuKXHoLDFxutvuKpX3fPbP9QSr1u7N7RUFM07BaWianRC1N7Uka53raGLPnnQ892Lc0oykHX4FqX2HIUfm3Qbaze7kHDv4to7J0mT5IfuZ0z+nnbW+KtNFIEAss1v5akp6DPJSdEoIU+ZbwEi01coGZFONdGFS+2QJyfJU0cl7XlR57MaHoYHcXzX2WE34a6nTnDBXjrzjTvGX5RKMbsgnqWWfqHnnvryDSymPiq72xfPfrQLJt03vfB+RitB1o0nfDhLRUOBLZTLsHToDCl2yB4pp/jt1aMfOrYfC++E5Lez85P0BVj7J/yZJDRKdD3YrEa7tzHxWfae5kchBeK1zXDNqCCQBC6vfZqjn7ywwW+DTlnk5UIIQsi+EWpbD1PdGloZ1vTyRBCyP9uWH9oe8NJXaMjPcRgAJJPC/nZq4RnD1I3T35tKx7u3T4yGczqX0WGS0aguoo0XRfG0AMDQf37Qp6Z1p5uD0cAc6GPT+LUJg1KAElI9xEQ6LXQFQXyYjKZIeUVHJct5tvALh99O6ZzTLDK14OqFTp2Lsow+5eRTbOwAac0Oxn+HVo8+ruWvIc1ONgfjzoPWdeG1kS+Z9w7mTwV+7eRSkuRSXutiwfB4QAdL0I+bfJWT6ZGcK7ByZCcLhtrD+VYC/k1donP0sXzK0I9dRnJT+OEKOY963L25srlh/2COFCJ/G2eS5wcHd4XBreWInDhyOReljp4b8hv7lj5XOJhTLGBdb1qH8oZ7YHEwpwpwj10GCofsw/VGZejHdqvoGcjBvCoDP255ePHRyOGmiTqWDtMLDm8nw4+FHLInITX9qgtVRVyRlbmiqnMZfRLSUpekYP7JDe/D5HbCj60xtCP4TkaYL8uCwEOSSr/OOExxJa1XRxgDKzLPwNAHSJROuYXoiqzWV8E2VEkqVpjeT8ZTvdCIKikNdIgVuV8+rhfbUOTaGtiC1u++8oEAtacpvVfqV1mvCKLW79dXwTY6qphXmGJS/9SH5s2nypzoqEpTRWyvx/tUoGaN0Q99dKdPp4PrYj97qvR1MDW4VIS5x4e5hia22O9w+WAiireT8bXxMB7fjK+vdHP4oSrq/a74WgBsXxJVjcsP3Zx9mNwi8RdqAFLtNlalNjtcsGYT4+PV7WRWGWJJ7EqN1IgtiS88umFMjNmN+eHT4PahxJLEV55KJWpH4+wY+vDBmKLdr8papKY0UiO2ZJVPNnNi6Lxm5d7JPN0GEISDotTjULWhiiq9HoOy6Mp8+AajRoFQuuprEQgDVVTq6FeFQRW1V0NQDn3+okSSpvEwNAfjUfPcUPvaQeAIN03rNwarCpbWkQ6DR9h1RG73R4Mx0pg8TK9u9NvRtDJOHbH7CmVity9xUTFv7koc7svSi6IUs+BI388GL9wfSE1ppEZt9cttVe1ev6800yONr6hxu3SHNUifXOUa0us00yPWJKlXrlXhnCzJYkNF2taL4gvTV9HUoMoNlEiX3+VblHQaKmjve3tDSYEs7euVovGFeF4ymSAVtbYK7eoVqeo/BK5Cb+MDK3bDNTg/+R9b5yTY6TkAAA==");
    reboot_native.importPy("tests.reboot.greeter_pb2_grpc", "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");
    reboot_native.importPy("tests.reboot.greeter_rbt", "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");
}
importPys();
