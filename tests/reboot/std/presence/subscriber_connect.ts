import { ExternalContext } from "@reboot-dev/reboot";
import { Subscriber } from "@reboot-dev/reboot-std/presence/subscriber/v1";

const args = process.argv.slice(2);
const url = args[0];
const subscriberId = args[1];
const nonce = args[2];

const context = new ExternalContext({ name: "subscriber-connect", url });
const subscriber = Subscriber.ref(subscriberId);

subscriber.connect(context, { nonce });

await new Promise<void>((resolve) => {
  process.once("message", () => {
    resolve();
  });
});

// Need to explicitly exit because the call to `testLongRunningWriter`
// should still be outstanding.
process.exit(0);
