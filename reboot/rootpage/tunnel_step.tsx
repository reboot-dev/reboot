import type { ReactNode } from "react";
import { HostConnection } from "../../rbt/v1alpha1/application/application_pb";
import { ClientName } from "./client_picker";
import { InlineCode } from "./code_block";
import { StepCard, Substep } from "./step_card";
import {
  TunnelProviderName,
  TunnelProviderPicker,
} from "./tunnel_provider_picker";
import { TunnelStatus } from "./tunnel_status";
import { Tunnel } from "./use_tunnel";

interface TunnelStepProps {
  clientName: ClientName;
  appPort: number;
  tunnel: Tunnel;
  providerName: TunnelProviderName;
  onProviderChange: (providerName: TunnelProviderName) => void;
}

// Step 01 for ChatGPT / Claude — set up a secure tunnel. MCPJam
// renders a different step 01 (no tunnel needed) via
// `MCPJamLaunchStep` below.
export const TunnelStep = ({
  clientName,
  appPort,
  tunnel,
  providerName,
  onProviderChange,
}: TunnelStepProps) => {
  // Collapse the two ngrok-specific substeps as soon as we have
  // positive evidence a tunnel exists. A backend-detected ngrok URL
  // is strong proof (the workflow read it from ngrok's local API);
  // a user-supplied URL we only trust once the reachability probe
  // confirms it works. The substeps stay visible as titled ✓ rows
  // so the user can scan what happened.
  const haveWorkingTunnel =
    tunnel.urlSource === "detected" ||
    (tunnel.urlSource === "user" && tunnel.reachability === true);

  return (
    <StepCard
      stepNumber="01"
      stepLabel="Prerequisite"
      title={
        <>
          Setting up a <em>secure tunnel</em>.
        </>
      }
      intro={
        <>
          {clientName} needs to reach your machine over the public internet.
          We've already tried to start a free <code>cloudflared</code> tunnel on
          your behalf.
        </>
      }
    >
      <TunnelProviderPicker
        selectedProviderName={providerName}
        onSelect={onProviderChange}
      />

      {providerName === "ngrok" && (
        <>
          <Substep
            done={haveWorkingTunnel}
            collapsible={haveWorkingTunnel}
            title={<>Authenticate ngrok</>}
          >
            <p className="substep__body-text">
              After installing <code>ngrok</code> sign in at{" "}
              <a
                href="https://dashboard.ngrok.com/get-started/your-authtoken"
                target="_blank"
                rel="noreferrer"
              >
                dashboard.ngrok.com
              </a>{" "}
              to grab your authtoken, then run:
            </p>
            <InlineCode text="ngrok config add-authtoken <YOUR_TOKEN>" />
          </Substep>

          <Substep
            done={haveWorkingTunnel}
            collapsible={haveWorkingTunnel}
            title="Start a tunnel"
          >
            <p className="substep__body-text">In a new terminal, run:</p>
            <InlineCode text={`ngrok http ${appPort}`} />
          </Substep>
        </>
      )}

      <TunnelStatus
        clientName={clientName}
        tunnel={tunnel}
        providerName={providerName}
      />
    </StepCard>
  );
};

interface MCPJamLaunchStepProps {
  appPort: number;
  connections: readonly HostConnection[];
}

// Default port the MCPJam inspector binds once the developer
// launches it (see the command below). MCPJam's own browser tab
// normally opens on launch; this is the URL we link to as a
// fallback if it doesn't.
const MCPJAM_LOCAL_URL = "http://localhost:6274";

// MCPJam inspector version the launch command pins to. Kept in
// sync with the plugin's `bin/mcpjam-inspector` shim so a
// hand-launched inspector matches the one an agent would start.
const MCPJAM_VERSION = "2.5.0";

// Step 01 variant for MCPJam — no tunnel needed, and MCPJam runs
// locally so there's no separate "install" step either. The
// developer launches the inspector themselves with the command
// below — pointed straight at this app's `/mcp` endpoint, with
// OAuth — and then we wait for the first request to come in.
export const MCPJamLaunchStep = ({
  appPort,
  connections,
}: MCPJamLaunchStepProps) => {
  // "Connected" — we've ever observed an inbound request that
  // looks like it came from MCPJam: arriving on `localhost:<our
  // port>` (no tunnel — MCPJam runs alongside the app) with a
  // user-agent of `node` (the MCP SDK's default when called from
  // MCPJam's local backend). MCPJam doesn't put "mcpjam" in its
  // UA, so the host + UA pair is our most reliable signal.
  const expectedHost = `localhost:${appPort}`;
  const connected = connections.some(
    (connection) =>
      connection.forwardedHost === expectedHost &&
      connection.userAgents.includes("node")
  );

  // Self-contained launch command — no config file or server name
  // to look up. `--url` points MCPJam straight at this app's MCP
  // endpoint and `--oauth` runs the handshake on connect.
  const launchCommand =
    `npx @mcpjam/inspector@${MCPJAM_VERSION} ` +
    `--url http://localhost:${appPort}/mcp --oauth`;

  // Wrap in an `aria-live` region so the flip to "connected!" gets
  // announced to screen-reader users — same pattern as the chat-
  // client install step.
  const waitingSubstepTitle: ReactNode = (
    <span aria-live="polite">
      {connected ? (
        "MCPJam connected!"
      ) : (
        <>
          Waiting for a request from MCPJam
          <span className="waiting-dots" aria-hidden="true" />
        </>
      )}
    </span>
  );

  return (
    <StepCard
      stepNumber="01"
      stepLabel="Local inspector"
      title={
        <>
          Launch the <em>MCPJam</em> inspector.
        </>
      }
      intro={
        <>
          MCPJam runs alongside your app on this machine — no tunnel needed. Run
          this in your project from a new terminal; it opens MCPJam in your
          browser.
        </>
      }
    >
      <InlineCode text={launchCommand} />

      <Substep done={connected} title={waitingSubstepTitle}>
        {!connected && (
          <p className="substep__body-text">
            Once MCPJam opens, send a request; we'll collapse this once we've
            seen one. If no browser tab opens, visit{" "}
            <a href={MCPJAM_LOCAL_URL} target="_blank" rel="noreferrer">
              {MCPJAM_LOCAL_URL}
            </a>
            .
          </p>
        )}
      </Substep>
    </StepCard>
  );
};
