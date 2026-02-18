import { Bank } from "@monorepo/api/bank/v1/bank_rbt.js";
import { Application } from "@reboot-dev/reboot";
import sortedMap from "@reboot-dev/reboot-std/collections/v1/sorted_map.js";
import { AccountServicer } from "./account.js";
import { BankServicer } from "./bank.js";
const SINGLETON_BANK_ID = "reboot-bank";

const initialize = async (context) => {
  await Bank.create(context, SINGLETON_BANK_ID);
};

new Application({
  servicers: [BankServicer, AccountServicer, ...sortedMap.servicers()],
  initialize,
}).run();
