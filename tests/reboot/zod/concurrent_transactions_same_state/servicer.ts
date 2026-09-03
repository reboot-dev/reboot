import {
  allow,
  ReaderContext,
  TransactionContext,
  WriterContext,
} from "@reboot-dev/reboot";
import { Counter } from "./servicer_api_rbt.js";

export const COUNTER_ID = "the-one-counter";

// A one-shot signal that a test and a servicer method use to agree on
// when something has happened.
class Gate {
  #open!: () => void;
  opened!: Promise<void>;

  constructor() {
    this.reset();
  }

  reset(): void {
    this.opened = new Promise<void>((resolve) => {
      this.#open = resolve;
    });
  }

  open(): void {
    this.#open();
  }
}

// A meeting point that only opens once callers with `expected`
// distinct names have arrived, so a caller can only get through if all
// of them are inside at the same time. Serialized callers deadlock
// instead.
class Rendezvous {
  expected = 0;
  arrived = new Set<string>();
  #everyoneArrived = new Gate();

  reset(expected: number): void {
    this.expected = expected;
    this.arrived = new Set();
    this.#everyoneArrived.reset();
  }

  async arrive(name: string): Promise<void> {
    // Names rather than a count, because a transaction that aborts is
    // retried from the top and so runs a method it already ran again:
    // Reboot promises that a transaction happens once, not that the
    // code in it is invoked once. A count of invocations would climb
    // past `expected`, and worse, could open the meeting point on one
    // caller counted twice standing in for another that has not
    // arrived at all.
    this.arrived.add(name);
    if (this.arrived.size >= this.expected) {
      this.#everyoneArrived.open();
    }
    await this.#everyoneArrived.opened;
  }
}

// Shared by the servicers and the tests, which run in this process.
export const rendezvous = new Rendezvous();

// Opened by `parkedIncrement` once it is a participant on the state
// and holding its lock; awaited by a test that needs that to have
// happened before it does anything else.
export const parkedIncrementIsParticipant = new Gate();

// Awaited by `parkedIncrement` before it writes; opened by a test that
// wants to choose when that write happens.
export const parkedIncrementMayWrite = new Gate();

export class CounterServicer extends Counter.Servicer {
  authorizer() {
    return allow();
  }

  async create(
    context: WriterContext,
    request: Counter.CreateRequest
  ): Promise<void> {
    this.state.count = 0;
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

  async callInner(
    context: TransactionContext,
    request: Counter.CallInnerRequest
  ): Promise<void> {
    // Every driver calls `inner` on the same peer, so the name of the
    // state `inner` runs on says nothing about which driver is inside
    // it; hand `inner` this driver's name instead.
    await Counter.ref(request.peerId).inner(context, {
      driverId: context.stateId,
    });
  }

  async inner(
    context: TransactionContext,
    request: Counter.InnerRequest
  ): Promise<Counter.InnerResponse> {
    await rendezvous.arrive(request.driverId);
    return { count: this.state.count };
  }

  async callParkedIncrement(
    context: TransactionContext,
    request: Counter.CallParkedIncrementRequest
  ): Promise<void> {
    await Counter.ref(request.peerId).parkedIncrement(context, {});
  }

  async parkedIncrement(
    context: TransactionContext,
    request: Counter.ParkedIncrementRequest
  ): Promise<Counter.ParkedIncrementResponse> {
    parkedIncrementIsParticipant.open();
    await parkedIncrementMayWrite.opened;
    return await this.ref().increment(context, {});
  }

  async callTouch(
    context: TransactionContext,
    request: Counter.CallTouchRequest
  ): Promise<void> {
    await Counter.ref(request.peerId).touch(context, {});
  }

  async touch(
    context: TransactionContext,
    request: Counter.TouchRequest
  ): Promise<void> {}
}
