import { PartialMessage } from "@bufbuild/protobuf";
import {
  ReaderContext,
  TransactionContext,
  WorkflowContext,
  WriterContext,
  until,
} from "@reboot-dev/reboot";
import { PermissionDenied } from "@reboot-dev/reboot-api/errors_pb.js";
import { Subscriber } from "@reboot-dev/reboot-std-api/presence/subscriber/v1/subscriber_rbt.js";
import { z } from "zod/v4";
import {
  AddRequest,
  AddResponse,
  CreateRequest,
  CreateResponse,
  Fig,
  FigBoard,
  GetPositionRequest,
  GetPositionResponse,
  ListRequest,
  ListResponse,
  LockRequest,
  LockResponse,
  UnlockRequest,
  UpdatePositionRequest,
  UpdatePositionResponse,
  WatchPresenceRequest,
  WatchPresenceResponse,
} from "../../api/fig/v1/fig_rbt.js";

export class FigBoardServicer extends FigBoard.Servicer {
  constructor() {
    super();
  }

  async list(
    context: ReaderContext,
    request: ListRequest
  ): Promise<PartialMessage<ListResponse>> {
    return { figIds: this.state.figIds };
  }

  async create(
    context: WriterContext,
    request: CreateRequest
  ): Promise<PartialMessage<CreateResponse>> {
    return {};
  }

  async add(
    context: TransactionContext,
    request: AddRequest
  ): Promise<PartialMessage<AddResponse>> {
    this.state.figIds.push(request.figId);

    await Fig.ref(request.figId).updatePosition(context, {
      newFigState: { top: 100, left: 10, width: 200, height: 200, rotation: 0 },
      userId: request.userId,
    });

    return {};
  }
}

export class FigServicer extends Fig.Servicer {
  constructor() {
    super();
  }

  async lock(
    context: WriterContext,
    request: LockRequest
  ): Promise<PartialMessage<LockResponse>> {
    if (this.state.userIdActive != "") {
      throw new Fig.LockAborted(new PermissionDenied());
    }

    const status = await Subscriber.ref(request.userId).status(context);

    if (!status.present) {
      throw new Fig.LockAborted(new PermissionDenied());
    }

    this.state.userIdActive = request.userId;
    this.state.epoch += BigInt(1);

    await this.ref().schedule().watchPresence(context, {
      userId: request.userId,
      epoch: this.state.epoch,
    });

    return {};
  }

  async unlock(
    context: WriterContext,
    request: UnlockRequest
  ): Promise<PartialMessage<UnlockRequest>> {
    if (request.userId != this.state.userIdActive) {
      throw new Fig.UpdatePositionAborted(new PermissionDenied());
    }

    this.state.userIdActive = "";

    return {};
  }

  static async watchPresence(
    context: WorkflowContext,
    request: WatchPresenceRequest
  ): Promise<PartialMessage<WatchPresenceResponse>> {
    const { needToUnlock } = await until(
      "user unlocked or no longer present",
      context,
      async () => {
        // Check if the user has unlocked and we no longer need to
        // watch for presence.
        const { epoch, userIdActive } = await Fig.ref().read(context);

        if (userIdActive != request.userId || epoch != request.epoch) {
          return { needToUnlock: false };
        }

        // Check if the user is no longer present.
        const { present } = await Subscriber.ref(request.userId).status(
          context
        );

        return !present && { needToUnlock: true };
      },
      { schema: z.object({ needToUnlock: z.boolean() }) }
    );

    if (needToUnlock) {
      await Fig.ref()
        .perWorkflow("Unlock")
        .write(context, async (state) => {
          state.userIdActive = "";
        });
    }

    return {};
  }

  async getPosition(
    context: ReaderContext,
    request: GetPositionRequest
  ): Promise<PartialMessage<GetPositionResponse>> {
    return { position: this.state };
  }

  async updatePosition(
    context: WriterContext,
    request: UpdatePositionRequest
  ): Promise<PartialMessage<UpdatePositionResponse>> {
    // Trade off the guarantee of the updated position being persisted
    // to disk with better performance.
    context.sync = false;

    if (request.userId != this.state.userIdActive) {
      throw new Fig.UpdatePositionAborted(new PermissionDenied());
    }

    this.state.left = request.newFigState.left;
    this.state.top = request.newFigState.top;
    this.state.width = request.newFigState.width;
    this.state.height = request.newFigState.height;
    this.state.rotation = request.newFigState.rotation;

    return {};
  }
}
