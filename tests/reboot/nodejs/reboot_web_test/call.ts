import { WebContext } from "@reboot-dev/reboot-web";
import { Greeter } from "../../greeter_rbt_web.js";

console.log("Reboot Web Test: Call Greeter");

const args = process.argv.slice(2);
const url = args[0];
const greeterStateId = args[1];

console.log("URL:", url);
console.log("Greeter State ID:", greeterStateId);

const context = new WebContext(url);

const greeter = Greeter.ref(greeterStateId);

await greeter.setAdjective(context, {
  adjective: "Friendly",
});

process.exit(0);
