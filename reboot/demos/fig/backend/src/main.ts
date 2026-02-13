import { Application, ServicerFactory } from "@reboot-dev/reboot";
import presence from "@reboot-dev/reboot-std/presence/v1";
import { FigBoard } from "../../api/fig/v1/fig_rbt.js";
import { Users } from "../../api/user/v1/user_rbt.js";
import { FIG_BOARD_ID, USERS_ID } from "../../constants.js";
import { FigBoardServicer, FigServicer } from "./fig_servicer.js";
import { UserServicer, UsersServicer } from "./user_servicer.js";

const initialize = async (context) => {
  await FigBoard.create(context, FIG_BOARD_ID);

  await Users.create(context, USERS_ID);
};

new Application({
  servicers: [
    FigServicer,
    FigBoardServicer,
    UsersServicer,
    UserServicer,
    // We use `Presence` from the std library.
    ...presence.servicers(),
  ],
  initialize,
}).run();
