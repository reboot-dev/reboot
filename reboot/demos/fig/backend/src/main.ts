import { allow, Application, ServicerFactory } from "@reboot-dev/reboot";
import { presenceLibrary } from "@reboot-dev/reboot-std/presence/v1";
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
  servicers: [FigServicer, FigBoardServicer, UsersServicer, UserServicer],
  // `Presence` from the std library; nobody signs in to this demo, so
  // it admits everyone, as it did before.
  libraries: [presenceLibrary({ authorizer: allow() })],
  initialize,
}).run();
