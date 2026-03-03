import { NotFound } from "@reboot-dev/reboot-api/errors_pb.js";
import { useMousePosition } from "@reboot-dev/reboot-std-api/presence/mouse_tracker/v1/mouse_position_rbt_react.js";
import { useSubscriber } from "@reboot-dev/reboot-std-api/presence/subscriber/v1/subscriber_rbt_react.js";
import { usePresence } from "@reboot-dev/reboot-std-api/presence/v1/presence_rbt_react.js";
import React, {
  FC,
  ReactNode,
  createContext,
  useContext,
  useEffect,
} from "react";
import { v4 as uuidv4 } from "uuid";

export interface PresenceContextValue {
  subscriberId: string;
  subscriberIds: string[];
}

const PresenceContext = createContext<PresenceContextValue | undefined>(
  undefined
);

export const Presence: FC<{
  id: string;
  subscriberId: string;
  children: ReactNode;
}> = ({ id, subscriberId, children }) => {
  const presence = usePresence({ id });

  const { response } = presence.useList();

  const subscriberIds = response?.subscriberIds || [];

  const subscriber = useSubscriber({ id: subscriberId });

  useEffect(() => {
    let unmounted = false;
    // Use an `AbortController` so that we can close the long-lived
    // call to `connect(...)` when this component gets unmounted.
    let abortController = new AbortController();
    (async () => {
      // Ensure the subscriber has been created.
      await subscriber.create();
      while (!unmounted) {
        const nonce = uuidv4();
        let connectFailed = false;
        // We don't want to retry `connect` due to its side effects. If unmounted
        // is still false, we simply want to call `connect` again with a new nonce.
        const promise = subscriber
          .connect({ nonce }, { signal: abortController.signal, retry: false })
          .then(({ aborted }) => {
            if (aborted !== undefined) {
              connectFailed = true;
            }
          })
          .catch((_) => {
            connectFailed = true;
          });

        // It is possible that toggle will happen before connect. In that case,
        // retry toggle so we ensure it happens _after_ connect.
        while (!connectFailed) {
          const { aborted } = await subscriber.toggle({ nonce });

          // If `aborted` is undefined, then `toggle(...)` was successful.
          if (aborted === undefined) {
            const { aborted } = await presence.subscribe({ subscriberId });
            if (aborted !== undefined) {
              console.error(`Failed to subscribe: ${aborted.error}`);
              // Abort and retry starting with `connect(...)` again.
              abortController.abort();
            }
            break;
          } else if (abortController.signal.aborted) {
            break;
          } else if (aborted.error instanceof NotFound) {
            continue;
          } else {
            console.error(`Failed to toggle: ${aborted.error}`);
            // Abort and retry starting with `connect(...)` again.
            abortController.abort();
            break;
          }
        }

        await promise;

        // TODO: sleep for some backoff so we don't retry right away!

        abortController = new AbortController();
      }
    })();
    return () => {
      unmounted = true;
      abortController.abort();
    };
  }, []);

  return (
    <PresenceContext.Provider value={{ subscriberId, subscriberIds }}>
      {children}
    </PresenceContext.Provider>
  );
};

export const usePresenceContext = (): PresenceContextValue => {
  const context = useContext(PresenceContext);
  if (context === undefined) {
    throw new Error("`usePresenceContext` must be used within `Presence`");
  }
  return context;
};

const MouseArrow: FC<{ id: string; arrow: ReactNode }> = ({ id, arrow }) => {
  const { response } = useMousePosition({ id }).usePosition();

  if (response === undefined) return <></>;

  return (
    <div
      className="absolute text-black"
      style={{
        top: response.top,
        left: response.left,
      }}
    >
      {arrow}
      <span>{id.substring(0, 4)}</span>
    </div>
  );
};

export const MouseTracker: FC<{
  arrow: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  children: ReactNode;
}> = ({ arrow, className, style, children }) => {
  const { subscriberId, subscriberIds } = usePresenceContext();

  const mousePosition = useMousePosition({ id: subscriberId });

  const onMouseMove = (e: React.MouseEvent<HTMLElement>) => {
    mousePosition.update({ left: e.pageX, top: e.pageY });
  };

  return (
    <div className={className} style={style} onMouseMove={onMouseMove}>
      {children}
      {subscriberIds
        .filter((id: string) => id !== subscriberId)
        .map((id: string) => (
          <MouseArrow key={id} id={id} arrow={arrow} />
        ))}
    </div>
  );
};
