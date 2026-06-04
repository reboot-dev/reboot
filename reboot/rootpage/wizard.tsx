import {
  ExamplePrompt,
  HostConnection,
} from "../../rbt/v1alpha1/application/application_pb";
import { ClientName, ClientPicker, CLIENT_NAMES } from "./client_picker";
import { Decorations } from "./decorations";
import { Hero } from "./hero";
import { InstallStep } from "./install_step";
import { PromptsStep } from "./prompts_step";
import { ReadyStep } from "./ready_step";
import { StepCard } from "./step_card";
import { TopNav } from "./top_nav";
import { TunnelProviderName } from "./tunnel_provider_picker";
import { MCPJamLaunchStep, TunnelStep } from "./tunnel_step";
import { useStoredState } from "./use_stored_state";
import { useTunnel } from "./use_tunnel";

export type ConnectionState = "connected" | "connecting";

interface WizardProps {
  title: string;
  // Absent when the developer didn't pass `description=`; the hero
  // shows a placeholder nudge in that case.
  description?: string;
  // `false` until the `Get` reader has produced at least one
  // response. Drives placeholder copy in the hero — we don't have
  // the real title or description yet so the wizard substitutes a
  // generic "this Reboot app" + animated ellipsis.
  titleReady: boolean;
  // Public URL the backend's `WatchTunnel` workflow last discovered
  // for ngrok, or absent when ngrok wasn't running / had no matching
  // tunnel for our port.
  ngrokDetectedUrl?: string;
  // Public URL the backend's `WatchTunnel` workflow last discovered
  // for cloudflared, or absent when cloudflared wasn't running with
  // `--metrics`.
  cloudflaredDetectedUrl?: string;
  // Per-host log of distinct user-agents the app has observed on
  // inbound MCP requests. The install step uses this to confirm,
  // for the currently-selected (tunnel, chat-client) pair, that
  // that pair has previously produced a real connection.
  connections: readonly HostConnection[];
  // Examples the developer passed via
  // `Application(example_prompts=...)`. Rendered as cards in the
  // "Try an example prompt" step.
  examplePrompts: readonly ExamplePrompt[];
  // Whether the app exposes any MCP tools/resources. When false we
  // render the generic "API is ready" guidance instead of the
  // chat-client wizard steps (and the hero headline switches too).
  hasMcpTools: boolean;
  // Whether the app is running under `rbt dev`. In prod the app
  // already has a public URL, so we drop the tunnel step and the
  // MCPJam (local-inspector) client, and go straight to install.
  devMode: boolean;
  appPort: number;
  connectionState: ConnectionState;
}

const CLIENT_STORAGE_KEY = "reboot.wizard.client";
// Per-app `localStorage` key for the tunnel-provider choice. We
// key on `window.location.origin` (scheme + host + port) rather
// than the application's title because the title arrives
// asynchronously via the Reboot React subscription, but the picker
// needs its initial value known synchronously on first render —
// otherwise the wizard briefly flashes the default selection
// before the title-keyed lookup can find the saved one. Two
// Reboot apps on the same machine use different ports, so origin
// is a fine identity for "this app".
const TUNNEL_PROVIDER_STORAGE_KEY = `reboot.wizard.${window.location.origin}.tunnel-provider`;

const parseStoredClientName = (raw: string | null): ClientName | null => {
  if (raw && (CLIENT_NAMES as readonly string[]).includes(raw)) {
    return raw as ClientName;
  }
  return null;
};

const parseStoredTunnelProviderName = (
  raw: string | null
): TunnelProviderName | null => {
  if (raw === "cloudflared" || raw === "ngrok" || raw === "other") return raw;
  return null;
};

export const Wizard = ({
  title,
  description,
  titleReady,
  ngrokDetectedUrl,
  cloudflaredDetectedUrl,
  connections,
  examplePrompts,
  hasMcpTools,
  devMode,
  appPort,
  connectionState,
}: WizardProps) => {
  const [clientName, setClientName] = useStoredState(
    CLIENT_STORAGE_KEY,
    parseStoredClientName,
    "Claude"
  );

  const [tunnelProviderName, setTunnelProviderName] = useStoredState(
    TUNNEL_PROVIDER_STORAGE_KEY,
    parseStoredTunnelProviderName,
    "ngrok"
  );

  const tunnel = useTunnel({
    ngrokDetectedUrl,
    cloudflaredDetectedUrl,
    selectedProviderName: tunnelProviderName,
  });

  // MCPJam is a local inspector, so only offer it in dev. If it was
  // the saved choice, fall back to the first available client in
  // prod.
  const clientNames = devMode
    ? CLIENT_NAMES
    : CLIENT_NAMES.filter((candidate) => candidate !== "MCPJam");
  const effectiveClientName = clientNames.includes(clientName)
    ? clientName
    : clientNames[0];

  return (
    <>
      <Decorations />
      <TopNav appName={title} appNameReady={titleReady} />
      <main className="wizard">
        <Hero
          title={title}
          description={description}
          titleReady={titleReady}
          hasMcpTools={hasMcpTools}
          connectionState={connectionState}
        />

        {hasMcpTools ? (
          <>
            <StepCard
              stepNumber="00"
              stepLabel="Preferences"
              title={
                <>
                  Which <em>chat client</em> are you using?
                </>
              }
              intro={
                <>
                  We'll tailor every step below to the client you pick. You can
                  switch at any time.
                </>
              }
            >
              <ClientPicker
                clientNames={clientNames}
                selectedClientName={effectiveClientName}
                onSelect={setClientName}
              />
            </StepCard>

            {!devMode ? (
              // Prod: the app's own URL is already public, so there's
              // no tunnel to set up and no MCPJam (local inspector) —
              // go straight to the install steps against that URL.
              <InstallStep
                clientName={effectiveClientName}
                appTitle={title}
                tunnelUrl=""
                mcpReady
                connections={connections}
                tunnelReachable={false}
                devMode={false}
              />
            ) : effectiveClientName === "MCPJam" ? (
              // MCPJam runs locally alongside the app, so it needs
              // neither a tunnel nor a separate install step —
              // opening the local inspector *is* the install.
              <MCPJamLaunchStep appPort={appPort} connections={connections} />
            ) : (
              <>
                <TunnelStep
                  clientName={effectiveClientName}
                  appPort={appPort}
                  tunnel={tunnel}
                  providerName={tunnelProviderName}
                  onProviderChange={setTunnelProviderName}
                />
                <InstallStep
                  clientName={effectiveClientName}
                  appTitle={title}
                  tunnelUrl={tunnel.effectiveUrl}
                  // ChatGPT / Claude depend on the tunnel actually
                  // working — without that, the install would
                  // silently fail in the chat client.
                  mcpReady={
                    !!tunnel.effectiveUrl && tunnel.reachability === true
                  }
                  connections={connections}
                  tunnelReachable={tunnel.reachability === true}
                  devMode
                />
              </>
            )}

            <PromptsStep
              clientName={effectiveClientName}
              examplePrompts={examplePrompts}
            />
          </>
        ) : (
          <ReadyStep />
        )}

        <footer className="footer">
          Stuck?{" "}
          <a
            href="https://discord.gg/cRbdcS94Nr"
            target="_blank"
            rel="noreferrer"
          >
            Ask in Discord!
          </a>
        </footer>
      </main>
    </>
  );
};
