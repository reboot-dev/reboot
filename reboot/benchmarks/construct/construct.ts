import { v4 as uuidv4 } from "uuid";
import { State } from "./api/benchmarks/v1/state_rbt.js";

// Benchmark for construction performance, specifically creating a new
// durable state by calling an explicit constructor.

export default {
  op: async (context) => {
    await State.ref(uuidv4()).idempotently().writer(context, {
      message: "hello world!",
    });
  },
};
