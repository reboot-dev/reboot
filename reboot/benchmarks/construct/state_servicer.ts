import { WriterContext } from "@reboot-dev/reboot";
import {
  AssignSyncReadStateIdRequest,
  State,
  WriterRequest,
} from "./api/benchmarks/v1/state_rbt.js";

export class StateServicer extends State.singleton.Servicer {
  async writer(
    context: WriterContext,
    state: State.State,
    request: WriterRequest
  ) {
    state.messages.push(request.message);

    return {};
  }

  async assignSyncReadStateId(
    context: WriterContext,
    state: State.State,
    request: AssignSyncReadStateIdRequest
  ) {
    // NOTE: assigning `context.sync` to benchmark its performance.
    context.sync = true;

    // NOTE: reading `context.stateId` to benchmark its performance.
    const stateId = context.stateId;

    state.messages.push(`${request.message} ${stateId}`);

    return {};
  }
}
