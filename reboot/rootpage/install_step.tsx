import { type FC, type ReactNode, useState } from "react";
import { HostConnection } from "../../rbt/v1alpha1/application/application_pb";
import { ClientName } from "./client_picker";
import { InlineCode } from "./code_block";
import { ChevronIcon } from "./icons";
import { StepCard, Substep } from "./step_card";

interface InstallStepProps {
  // Always `"ChatGPT"` or `"Claude"` at runtime — the MCPJam flow
  // renders `MCPJamLaunchStep` instead and never reaches this
  // component. Still typed as the full `ClientName` so we can
  // compare against `detectChatClient(...)` results below.
  clientName: ClientName;
  appTitle: string;
  // Effective tunnel URL (e.g. `https://<your-id>.ngrok-free.dev`).
  // Empty when neither ngrok was detected nor a user override was
  // set — in that case we render an `<your-tunnel>` placeholder.
  tunnelUrl: string;
  // Whether the MCP URL the chat client would actually call is
  // expected to work right now — i.e. the tunnel exists and the
  // reachability probe is currently green. Used to gate the ✓ on
  // the config substep so we don't claim the install is "done"
  // while the tunnel is dark.
  mcpReady: boolean;
  // Whether the wizard's local reachability probe of the current
  // tunnel is currently green. Used (alongside `connections`) to
  // decide whether we've seen a real successful connection.
  tunnelReachable: boolean;
  // Every distinct `(forwarded_host, user_agent)` pair the framework
  // has observed on an inbound MCP request, grouped by host. We
  // cross-reference against the currently-selected tunnel and chat
  // client to decide whether *this specific* combination has
  // already produced a real connection — that way the wizard
  // doesn't visually "reset" when the user flips between previously-
  // working tunnel / client combinations.
  connections: readonly HostConnection[];
  // Whether running under `rbt dev`. In prod (`false`) the app's URL
  // is already public, so we fill the MCP URL from `window.location`
  // instead of a tunnel, mark the steps done (they can't be
  // auto-confirmed without a tunnel/connection to observe) without
  // collapsing them, and drop the "waiting for a request" step.
  devMode: boolean;
}

// Slugify the app title into a stable, MCP-friendly server name.
const slugify = (appTitle: string): string =>
  appTitle
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "reboot-app";

// Chat clients that route through `InstallStep`. MCPJam runs
// locally and is handled by `MCPJamLaunchStep` instead, so it never
// reaches this component — the parent wizard guarantees it.
type InstallableChatClient = Exclude<ClientName, "MCPJam">;

interface ChatClientInstallConfig {
  // Deeplink that opens the chat client's "add connector / app"
  // settings UI. ChatGPT's URL still says "Connectors" because the
  // route didn't change when the UI was renamed to "apps".
  settingsUrl: string;
  // Label for the deeplink button. Includes the trailing arrow.
  settingsButtonLabel: string;
  // ChatGPT renamed "connectors" to "apps"; Claude still calls them
  // connectors. Used for the intro copy ("Add … as a connector").
  // `article` is "a" or "an" depending on what follows.
  connectorArticle: "a" | "an";
  connectorNoun: string;
  // Substep hint shown above the Name / MCP URL config block,
  // worded for the destination form the user is filling in.
  configHint: string;
  // Title of the "Add your app's name and URL to …" substep.
  addStepTitle: string;
  // Breadcrumb the user follows inside the chat client to find the
  // "add connector" panel — rendered behind a "How did we get here?"
  // disclosure under the deeplink button.
  settingsBreadcrumb: string;
  // Path to the walkthrough screencast served by the rootpage
  // servicer and its accessible alt text.
  screencastSrc: string;
  screencastAlt: string;
}

const CHAT_CLIENT_INSTALL_CONFIG: Record<
  InstallableChatClient,
  ChatClientInstallConfig
> = {
  ChatGPT: {
    settingsUrl: "https://chatgpt.com/#settings/Connectors/Advanced",
    settingsButtonLabel: "Open ChatGPT settings ↗",
    connectorArticle: "an",
    connectorNoun: "app",
    configHint: "Use these values in ChatGPT's New App form.",
    addStepTitle: "Add your app's name and URL to ChatGPT",
    settingsBreadcrumb: "User Profile → Settings → Apps → Advanced Settings",
    screencastSrc: "/__/rootpage/add-app-chatgpt.mp4",
    screencastAlt:
      "Walkthrough: filling out ChatGPT's New App form with a name, MCP Server URL, and confirming.",
  },
  Claude: {
    settingsUrl:
      "https://claude.ai/customize/connectors?modal=add-custom-connector",
    settingsButtonLabel: "Open Claude settings ↗",
    connectorArticle: "a",
    connectorNoun: "connector",
    configHint: "Use these values in Claude's Add custom connector form.",
    addStepTitle: "Add your app's name and URL to Claude",
    settingsBreadcrumb: "Customize → Connectors → + → Add custom connector",
    screencastSrc: "/__/rootpage/add-app-claude.mp4",
    screencastAlt:
      "Walkthrough: filling out Claude's custom connector form with a name and the MCP URL.",
  },
};

// Strip any trailing slash + path so we can append our own `/mcp`
// cleanly regardless of what the tunnel URL ends with.
const tunnelBase = (url: string): string =>
  url.replace(/\/+$/, "").replace(/\/mcp$/, "");

// Try to extract the host part of a URL even if the input doesn't
// have a scheme. Returns "" on any failure.
const urlHost = (url: string): string => {
  if (!url) return "";
  try {
    return new URL(url).host.toLowerCase();
  } catch {
    // `url` may already be just a host like `abc.ngrok-free.dev`.
    return url.trim().toLowerCase();
  }
};

// Whether an observed `x-forwarded-host` matches the tunnel the
// wizard is currently advertising. Used to scope the install-
// confirmation check to the *current* tunnel so an old request
// through a stale tunnel doesn't falsely mark the install done.
const hostMatchesTunnel = (
  forwardedHost: string,
  tunnelUrl: string
): boolean => {
  const expected = urlHost(tunnelUrl);
  const observed = forwardedHost.trim().toLowerCase();
  return expected !== "" && observed !== "" && expected === observed;
};

// Best-effort chat-client detection from the `user-agent` header.
// We pattern-match a few well-known substrings rather than relying
// on a strict whitelist — chat clients change their UA strings
// often, and false positives are harmless here (we still also
// require the forwarded host to match the active tunnel for the
// tunnelled clients; MCPJam runs locally and doesn't need that).
export const detectChatClient = (userAgent: string): ClientName | null => {
  const ua = userAgent.toLowerCase();
  if (!ua) return null;
  if (ua.includes("chatgpt") || ua.includes("openai")) return "ChatGPT";
  if (ua.includes("claude") || ua.includes("anthropic")) return "Claude";
  if (ua.includes("mcpjam")) return "MCPJam";
  return null;
};

// "How did we get here?" toggle + drawer that reveals the
// breadcrumb trail through a chat client's settings UI. Owns its
// own open/closed state so each instance is independent — callers
// pass `key={clientName}` to force a fresh instance (and a closed
// drawer) when the user switches chat clients in the picker.
// Annotated as `FC` so React 19's `JSX.LibraryManagedAttributes`
// machinery allows `key` on the call site — an inline-destructured
// arrow function isn't recognised as a proper component type.
const BreadcrumbDisclosure: FC<{ children: ReactNode }> = ({ children }) => {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        className="breadcrumb-disclosure__toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        How did we get here?
        <span
          className={`breadcrumb-disclosure__chevron${
            open ? " breadcrumb-disclosure__chevron--open" : ""
          }`}
          aria-hidden="true"
        >
          <ChevronIcon />
        </span>
      </button>
      {open && <div className="breadcrumb-disclosure__body">{children}</div>}
    </>
  );
};

// Bordered, full-width container for an autoplaying walkthrough
// video served from the rootpage servicer. `preload="none"` keeps
// the browser from fetching the file until autoplay actually
// starts, and modern browsers defer autoplay on off-screen
// `<video>` elements — so the asset isn't downloaded until the
// install step is scrolled into view.
const Screencast = ({ src, alt }: { src: string; alt: string }) => (
  <figure className="screenshot">
    <video
      src={src}
      autoPlay
      muted
      loop
      playsInline
      preload="none"
      aria-label={alt}
    />
  </figure>
);

export const InstallStep = ({
  clientName,
  appTitle,
  tunnelUrl,
  mcpReady,
  tunnelReachable,
  connections,
  devMode,
}: InstallStepProps) => {
  // In dev the chat client reaches us through the tunnel; in prod
  // the app's own origin is already the public URL.
  const mcpUrl = devMode
    ? tunnelUrl
      ? `${tunnelBase(tunnelUrl)}/mcp`
      : "https://<your-tunnel>/mcp"
    : `${window.location.origin}/mcp`;

  const serverName = slugify(appTitle);

  // Cast is safe: the parent wizard routes MCPJam to
  // `MCPJamLaunchStep`, so any `clientName` reaching this component
  // is one of the keys in `CHAT_CLIENT_INSTALL_CONFIG`.
  const clientConfig =
    CHAT_CLIENT_INSTALL_CONFIG[clientName as InstallableChatClient];

  // "Install confirmed" — we've previously observed a request
  // from the expected chat client through *the currently-selected*
  // tunnel. Recomputed each render against the full per-host
  // user-agent log on the singleton state, so:
  //   • Switching to a tunnel we've never seen a request through
  //     re-opens the substeps.
  //   • Switching back to a tunnel that previously received a
  //     correct-client request (and is still reachable) keeps
  //     them collapsed without needing to re-observe a request.
  //   • Switching chat clients (e.g. ChatGPT → Claude) re-opens
  //     unless that *new* client has also already connected.
  const installCompleted =
    tunnelReachable &&
    connections.some(
      (connection) =>
        hostMatchesTunnel(connection.forwardedHost, tunnelUrl) &&
        connection.userAgents.some(
          (userAgent) => detectChatClient(userAgent) === clientName
        )
    );

  // In prod there's no tunnel to reach or connection to observe, so
  // the "add" step can't be auto-confirmed — show it as done (✓)
  // rather than perpetually unchecked, but never collapse it, and
  // skip the "waiting for a request" step (rendered only in dev).
  const addStepDone = devMode ? installCompleted : true;

  // Bottom substep title — animated dots while we're waiting,
  // simple "<client> connected!" once we've seen a real request.
  // Wrapped in `aria-live="polite"` so screen readers announce the
  // flip from "Waiting…" to "connected!". Initial renders of a
  // live region aren't announced, so there's no spurious greeting
  // on first page load.
  const waitingSubstepTitle: ReactNode = (
    <span aria-live="polite">
      {installCompleted ? (
        `${clientName} connected!`
      ) : (
        <>
          Waiting for a request from {clientName}
          <span className="waiting-dots" aria-hidden="true" />
        </>
      )}
    </span>
  );

  const waitingBody = (
    <p className="substep__body-text">
      We'll collapse these steps once we see a request. If you'd previously
      completed this step don't worry, your app might have just been expunged
      and we haven't seen a request since it restarted. Once you use the app
      again in {clientName} we'll collapse this!
    </p>
  );

  return (
    <StepCard
      stepNumber="02"
      stepLabel="Install"
      title={
        <>
          Install in <em>{clientName}</em>.
        </>
      }
      intro={
        <>
          Add <strong>{appTitle}</strong> as {clientConfig.connectorArticle}{" "}
          {clientConfig.connectorNoun} in {clientName}.
        </>
      }
    >
      <Substep
        done={mcpReady}
        collapsible={installCompleted}
        title="Your MCP app config"
        hint={clientConfig.configHint}
      >
        <div className="mcp-config-field">
          <span className="mcp-config-field__label">Name</span>
          <InlineCode text={serverName} />
        </div>
        {/* Withhold the MCP URL until the tunnel actually works.
            Showing a copy-able-but-broken URL invites pasting it
            into the chat client and getting a silent failure
            later. */}
        {mcpReady && (
          <div className="mcp-config-field">
            <span className="mcp-config-field__label">MCP URL</span>
            <InlineCode text={mcpUrl} />
          </div>
        )}
      </Substep>

      <Substep
        done={addStepDone}
        collapsible={installCompleted}
        title={clientConfig.addStepTitle}
      >
        <div className="actions">
          <a
            className="button button--primary button--small"
            href={clientConfig.settingsUrl}
            target="_blank"
            rel="noreferrer"
          >
            {clientConfig.settingsButtonLabel}
          </a>
          {/* `key={clientName}` forces a fresh instance (closed
              drawer) when the user flips between chat clients so
              the previous client's expanded state doesn't bleed
              into the new client's breadcrumb. */}
          <BreadcrumbDisclosure key={clientName}>
            {clientConfig.settingsBreadcrumb}
          </BreadcrumbDisclosure>
        </div>
        <Screencast
          src={clientConfig.screencastSrc}
          alt={clientConfig.screencastAlt}
        />
      </Substep>

      {devMode && (
        <Substep done={installCompleted} title={waitingSubstepTitle}>
          {!installCompleted && waitingBody}
        </Substep>
      )}
    </StepCard>
  );
};
