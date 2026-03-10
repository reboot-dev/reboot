import { Application, ExternalContext } from "@reboot-dev/reboot";
import { StateServicer } from "./state_servicer.js";

new Application({
  servicers: [StateServicer],
}).run();
