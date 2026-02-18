import { RebootClientProvider } from "@reboot-dev/reboot-react";
import { useSubscriber } from "@reboot-dev/reboot-std-api/presence/subscriber/v1/subscriber_rbt_react.js";
import {
  Presence,
  usePresenceContext,
} from "@reboot-dev/reboot-std-react/presence";
import { FC, StrictMode } from "react";
import ReactDOM from "react-dom/client";

const Subscriber: FC<{
  subscriberId: string;
}> = ({ subscriberId }) => {
  const { subscriberIds } = usePresenceContext();
  const { useStatus } = useSubscriber({ id: subscriberId });
  const { response: statusResponse } = useStatus();

  return (
    <div>
      <ul>
        {subscriberIds.length > 0 ? (
          subscriberIds.map((id, index) => (
            <li key={index} id="subscriber_ids">
              {id}
            </li>
          ))
        ) : (
          <li>No subscribers</li>
        )}
      </ul>
      <h1 id="status">{statusResponse?.present.toString()}</h1>
    </div>
  );
};

const App = () => {
  const subscriberId = "subscriber";
  const presenceId = "presence";

  return (
    <div className="App">
      <Presence id={presenceId} subscriberId={subscriberId}>
        <Subscriber subscriberId={subscriberId} />
      </Presence>
    </div>
  );
};

export const render = (url: string) => {
  const root = ReactDOM.createRoot(document.getElementById("root"));

  root.render(
    <StrictMode>
      <RebootClientProvider url={url}>
        <App />
      </RebootClientProvider>
    </StrictMode>
  );
};
