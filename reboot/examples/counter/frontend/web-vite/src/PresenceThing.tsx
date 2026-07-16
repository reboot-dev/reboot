import {
  MouseTracker,
  Presence,
  usePresenceContext,
} from "@reboot-dev/reboot-std-react/presence";
import { FC } from "react";

const PresenceThing: FC<{ id: string }> = ({ id }) => {
  const userId = "a" + Math.floor(Math.random() * 100);
  console.log("my userid", userId);

  return (
    <Presence id="board" subscriberId={userId}>
      {/* <PresenceInner id={id} /> */}
      <MouseTracker
        style={{
          width: "400px",
          height: "250px",
          border: "1px solid blue",
        }}
        arrow={<span>↖</span>}
      />
    </Presence>
  );
};

const PresenceInner: FC<{}> = () => {
  const { subscriberIds } = usePresenceContext();
  console.log("Subscriber IDs", subscriberIds);
  return (
    <div>
      <p>Subscribers!</p>
      {subscriberIds.map((subId) => (
        <span key={subId}>{subId}</span>
      ))}
    </div>
  );
};

export default PresenceThing;
