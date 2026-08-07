import { RebootClientProvider } from "@reboot-dev/reboot-react";
import {
  Presence,
  usePresenceContext,
} from "@reboot-dev/reboot-std-react/presence";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { v4 as uuidv4 } from "uuid";

// The `Presence` state recording who is looking at a dashboard right
// now. `rbt dev run` reads it to decide whether to open one.
const PRESENCE_ID = "dashboard";

// One subscriber per tab, for as long as the tab is open. A reload is
// a new viewer, which is what we want -- the old tab's connection is
// gone by then and presence drops it.
const SUBSCRIBER_ID = uuidv4();

const Viewers = () => {
  const { subscriberIds } = usePresenceContext();

  return (
    <main>
      <h1>Reboot dashboard</h1>
      <p>
        This page is a placeholder. It exists so that the companion application
        has something to serve and so that `rbt dev run` can tell whether a
        dashboard is open. The dashboard itself is still being built; until it
        lands, use <code>/__/inspect</code> on your own application.
      </p>
      <p>
        Viewers right now: <strong id="viewers">{subscriberIds.length}</strong>
      </p>
    </main>
  );
};

const root = document.getElementById("root");

if (root !== null) {
  createRoot(root).render(
    <StrictMode>
      {/* No `url`: the page and the presence data are served by the
          same application, so the client uses this page's origin. */}
      <RebootClientProvider>
        <Presence id={PRESENCE_ID} subscriberId={SUBSCRIBER_ID}>
          <Viewers />
        </Presence>
      </RebootClientProvider>
    </StrictMode>
  );
}
