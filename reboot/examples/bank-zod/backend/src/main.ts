import { Application } from "@reboot-dev/reboot";
import sortedMap from "@reboot-dev/reboot-std/collections/v1/sorted_map.js";
import { Bank } from "../../api/bank/v1/bank_rbt.js";
import { AccountServicer } from "./account.js";
import { BankServicer } from "./bank.js";
import { CustomerServicer } from "./customer.js";
const SINGLETON_BANK_ID = "reboot-bank";

const initialize = async (context) => {
  await Bank.create(context, SINGLETON_BANK_ID);
};

new Application({
  servicers: [
    BankServicer,
    AccountServicer,
    CustomerServicer,
    ...sortedMap.servicers(),
  ],
  initialize,
}).run();
