import { RebootClientProvider } from "@reboot-dev/reboot-react";
import { useEffect } from "react";
import ReactDOM from "react-dom/client";
import { useApplication } from "../../rbt/v1alpha1/application/application_rbt_react";
import "./index.css";
import { Loading } from "./loading";
import { ConnectionState, Wizard } from "./wizard";

// Default port if we can't recover the explicit one from
// `window.location` (e.g. served behind a tunnel that hides the
// origin port).
const DEFAULT_REBOOT_PORT = 9991;

// Fallback title used both for the in-page hero and the browser
// tab when the developer didn't pass `Application(title=...)`.
const FALLBACK_TITLE = "Reboot Application";

const detectPort = (): number => {
  const explicit = window.location.port;
  if (explicit) {
    const parsed = parseInt(explicit, 10);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return DEFAULT_REBOOT_PORT;
};

const WizardConnected = ({ applicationId }: { applicationId: string }) => {
  const { useGet } = useApplication({ id: applicationId });
  const { response, isLoading } = useGet();

  const title = response?.title || FALLBACK_TITLE;

  // Reflect the developer's chosen app title in the browser tab.
  // `title` is set by `Application(title=...)` and is meant to be
  // public (it's already rendered prominently on the page), so
  // there's no information-leak concern with mirroring it here.
  // We only update once we've received a real response so the tab
  // doesn't briefly flash the static fallback.
  useEffect(() => {
    if (response) {
      document.title = response.title || FALLBACK_TITLE;
    }
  }, [response]);

  // Hold the page on the logo + spinner splash until the first
  // `Get` response arrives. Only then do we know the app's title
  // and — crucially — whether it's an MCP app, so we can render the
  // right hero/body without flashing the wrong one first.
  if (!response) {
    return <Loading />;
  }

  // The reader's `isLoading` flips back to `true` only if the
  // subscription later drops and retries; we surface that as the
  // hero's "Connecting…" pill. `aborted` is intentionally not
  // consulted — an aborted `Get` would be an Application-side bug,
  // not a connectivity problem.
  const connectionState: ConnectionState = isLoading
    ? "connecting"
    : "connected";

  return (
    <Wizard
      title={title}
      description={response.description}
      titleReady
      ngrokDetectedUrl={response.ngrokPublicUrl}
      cloudflaredDetectedUrl={response.cloudflaredPublicUrl}
      connections={response.connections ?? []}
      examplePrompts={response.examplePrompts ?? []}
      hasMcpTools={response.mcp ?? false}
      devMode={response.dev ?? false}
      appPort={detectPort()}
      connectionState={connectionState}
    />
  );
};

// `applicationId` is the singleton `Application` state ID, templated
// into `index.html` by `RootPageServicer` (keyed on `RBT_NAME`); the
// wizard subscribes to that state via `useApplication({ id })`.
export const render = (url: string, applicationId: string) => {
  const root = ReactDOM.createRoot(document.getElementById("root")!);
  root.render(
    <RebootClientProvider url={url}>
      <WizardConnected applicationId={applicationId} />
    </RebootClientProvider>
  );
};
