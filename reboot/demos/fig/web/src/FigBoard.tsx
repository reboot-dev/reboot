import { CursorArrowIcon, PlusIcon } from "@radix-ui/react-icons";
import { MouseTracker, Presence } from "@reboot-dev/reboot-std-react/presence";
import { FC } from "react";
import { v4 as uuidv4 } from "uuid";
import { useFigBoard } from "./api/fig/v1/fig_rbt_react";
import Fig from "./Fig";

import { FIG_BOARD_ID } from "../../constants";

export const FigBoard: FC<{ userId: string }> = ({ userId }) => {
  const figBoard = useFigBoard({ id: FIG_BOARD_ID });

  const { response } = figBoard.useList();

  const figIds = response?.figIds || [];

  return (
    <div className="relative bg-red-200 h-screen w-screen">
      <Presence id={FIG_BOARD_ID} subscriberId={userId}>
        <MouseTracker
          className="h-screen w-screen"
          arrow={<CursorArrowIcon color="green" />}
        >
          <button
            className="bg-sky-300 p-4 m-2 rounded-lg"
            onClick={() => {
              figBoard.add({ figId: uuidv4() });
            }}
          >
            <div className="flex align-center justify-center ">
              <PlusIcon /> <span>Fig More</span>
            </div>
          </button>
          {figIds.map((id: string) => (
            <Fig id={id} userId={userId} key={id} />
          ))}
        </MouseTracker>
      </Presence>
    </div>
  );
};
