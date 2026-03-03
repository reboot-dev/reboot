import { Application } from "@reboot-dev/reboot";
import { Counter } from "../../api/counter/v1/counter_rbt.js";
import { COUNTER_IDS } from "../../constants.js";
import { CounterServicer } from "./counter_servicer.js";

const initialize = async (context) => {
  COUNTER_IDS.map(async (counterId: string) => {
    // Perform an increment to ensure that the counter has been
    // implicitly constructed.
    await Counter.ref(counterId).increment(context);
  });
};

new Application({
  servicers: [CounterServicer],
  initialize,
}).run();
