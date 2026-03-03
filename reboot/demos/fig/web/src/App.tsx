import { useEffect, useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { USERS_ID } from "../../constants";
import { FigBoard } from "./FigBoard";
import { useUsers } from "./api/user/v1/user_rbt_react";

const generatedUserId = uuidv4();

export const App = () => {
  const [userId, setUserId] = useState(undefined);

  const users = useUsers({ id: USERS_ID });

  useEffect(() => {
    (async () => {
      if (userId === undefined) {
        // To simplify, we allow adding ourselves to `Users` _everytime_.
        const { response, aborted } = await users.add({
          userId: generatedUserId,
        });

        if (response) {
          setUserId(generatedUserId);
        } else {
          console.error(`Failed to add user: ${aborted}`);
        }
      }
    })();
  }, []);

  if (!userId) return <></>;

  return <FigBoard userId={userId} />;
};

export default App;
