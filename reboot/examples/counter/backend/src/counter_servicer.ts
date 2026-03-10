import { Empty, PartialMessage } from "@bufbuild/protobuf";
import {
  ReaderContext,
  TransactionContext,
  WriterContext,
  allow,
} from "@reboot-dev/reboot";
import { Counter as CounterMessage } from "../../api/counter/v1/counter_pb.js";
import {
  Counter,
  TakeRequest,
  TakeResponse,
} from "../../api/counter/v1/counter_rbt.js";

export class CounterServicer extends Counter.Servicer {
  authorizer() {
    return allow();
  }

  async increment(
    context: WriterContext,
    request: Empty
  ): Promise<PartialMessage<Empty>> {
    this.state.count++;
    return {};
  }

  async count(
    context: ReaderContext,
    request: Empty
  ): Promise<PartialMessage<CounterMessage>> {
    return { count: this.state.count };
  }

  async take(
    context: TransactionContext,
    request: TakeRequest
  ): Promise<PartialMessage<TakeResponse>> {
    if (request.takerId === context.stateId) {
      this.state.count = (
        await Promise.all(
          request.takenIds.map((takenId) => Counter.ref(takenId).take(context))
        )
      ).reduce(
        (count, { takeAmount }: TakeResponse) => (count += takeAmount),
        this.state.count
      );
      return { takeAmount: this.state.count };
    } else {
      const takeAmount = this.state.count;
      this.state.count = 0;
      return { takeAmount };
    }
  }
}
