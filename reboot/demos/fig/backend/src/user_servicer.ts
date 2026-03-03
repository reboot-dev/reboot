import { Empty, PartialMessage } from "@bufbuild/protobuf";
import {
  ReaderContext,
  TransactionContext,
  WriterContext,
} from "@reboot-dev/reboot";
import { Subscriber } from "@reboot-dev/reboot-std-api/presence/subscriber/v1/subscriber_rbt.js";
import {
  AddRequest,
  AddResponse,
  CreateRequest,
  CreateResponse,
  ListRequest,
  ListResponse,
  User,
  Users,
} from "../../api/user/v1/user_rbt.js";

export class UsersServicer extends Users.Servicer {
  constructor() {
    super();
  }

  async list(
    context: ReaderContext,
    request: ListRequest
  ): Promise<PartialMessage<ListResponse>> {
    // Only return user ids that are present!
    const statuses = await Promise.all(
      this.state.userIds.map((userId) => Subscriber.ref(userId).status(context))
    );

    return {
      userIds: this.state.userIds.filter((userId, i) => statuses[i].present),
    };
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
    if (this.state.userIds.includes(request.userId)) {
      return {};
    }

    this.state.userIds.push(request.userId);

    await User.create(context, request.userId);

    return {};
  }
}

export class UserServicer extends User.Servicer {
  async create(
    context: WriterContext,
    request: Empty
  ): Promise<PartialMessage<Empty>> {
    return {};
  }
}
