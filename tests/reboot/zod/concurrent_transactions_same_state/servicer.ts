import {
  allow,
  ReaderContext,
  TransactionContext,
  WriterContext,
} from "@reboot-dev/reboot";
import { Counter } from "./servicer_api_rbt.js";

export const COUNTER_ID = "the-one-counter";

export class CounterServicer extends Counter.Servicer {
  authorizer() {
    return allow();
  }

  async transactionallyIncrement(
    context: TransactionContext,
    request: Counter.TransactionallyIncrementRequest
  ): Promise<Counter.TransactionallyIncrementResponse> {
    return await Counter.ref(COUNTER_ID).increment(context, {});
  }

  async increment(
    context: WriterContext,
    request: Counter.IncrementRequest
  ): Promise<Counter.IncrementResponse> {
    this.state.count = this.state.count + 1;
    return { count: this.state.count };
  }

  async get(
    context: ReaderContext,
    request: Counter.GetRequest
  ): Promise<Counter.GetResponse> {
    return { count: this.state.count };
  }
}
