import { ExternalContext } from "@reboot-dev/reboot";
import { Greeter } from "../../greeter_rbt.js";

const args = process.argv.slice(2);
const url = args[0];
const greeterStateId = args[1];

const context = new ExternalContext({ name: "test", url });

const greeter = Greeter.ref(greeterStateId);

greeter.testLongRunningWriter(context);

await new Promise<void>((resolve) => {
  process.once("message", () => {
    resolve();
  });
});

// Need to explicitly exit because the call to `testLongRunningWriter`
// should still be outstanding.
process.exit(0);
