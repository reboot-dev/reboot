import { v4 as uuidv4 } from "uuid";
import { State } from "./api/benchmarks/v1/state_rbt.js";

// Benchmark for construction performance, specifically creating a new
// durable state by calling an explicit constructor which:
//
//   * Assigns `context.sync` to benchmark the performance of assigning
//     that field.
//
//   * Reads `context.stateId` to benchmark the performance of reading
//     that field.

export default {
  op: async (context) => {
    await State.ref(uuidv4()).idempotently().assignSyncReadStateId(context, {
      message: "hello world!",
    });
  },
};
