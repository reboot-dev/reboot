import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useState,
} from "react";
import { ClientName } from "./client_picker";
import { InlineCode } from "./code_block";
import { Substep } from "./step_card";
import { TunnelProviderName } from "./tunnel_provider_picker";
import { Tunnel, TunnelReachability } from "./use_tunnel";

interface TunnelStatusProps {
  clientName: ClientName;
  tunnel: Tunnel;
  providerName: TunnelProviderName;
}

// Bottom substep in the tunnel section: one row that shows the
// current tunnel URL and its reachability. With `ngrok` and
// `cloudflared` the URL is read-only (auto-detected by the
// backend); only `other` exposes an editable input — users who
// want to use a different tunnel solution should pick `other`.
export const TunnelStatus = ({
  clientName,
  tunnel,
  providerName,
}: TunnelStatusProps) => {
  const {
    effectiveUrl,
    urlSource,
    reachability,
    userSpecifiedUrl,
    setUserSpecifiedUrl,
  } = tunnel;
  const editable = providerName === "other";

  const inputId = useId();

  // Local draft so the user can edit without writing every
  // keystroke into `localStorage`; we apply (and persist) what's
  // in the box when they blur out of it or hit Enter.
  const [draftUrl, setDraftUrl] = useState(userSpecifiedUrl);
  useEffect(() => {
    setDraftUrl(userSpecifiedUrl);
  }, [userSpecifiedUrl]);

  const commitDraftUrl = () => {
    if (draftUrl.trim() !== userSpecifiedUrl.trim()) {
      setUserSpecifiedUrl(draftUrl);
    }
  };
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commitDraftUrl();
      event.currentTarget.blur();
    }
  };

  // The "Other" radio is the user's bring-your-own-tunnel path —
  // always show the input there so the user can (re)paste a URL,
  // even if we've also got a backend-detected URL from `ngrok` or
  // `cloudflared`. The other two radios are auto-detect-only.
  const showEditor = editable;

  const detectedLabel =
    providerName === "cloudflared"
      ? "Detected a cloudflared tunnel"
      : providerName === "ngrok"
      ? "Detected an ngrok tunnel"
      : "Detected your tunnel";

  // Wrapped in `aria-live="polite"` so the transition from
  // "Waiting…" to "Detected …" / "Using your tunnel" is announced
  // to screen-reader users.
  const substepTitle: ReactNode = (
    <span aria-live="polite">
      {urlSource === "detected" ? (
        detectedLabel
      ) : urlSource === "user" ? (
        "Using your tunnel"
      ) : (
        <>
          Waiting for your tunnel
          <span className="waiting-dots" aria-hidden="true" />
        </>
      )}
    </span>
  );

  // ✓ as soon as we have *any* tunnel known. The reachability
  // badge inside the body still tells the user whether it's
  // actually responding right now.
  const tunnelKnown = urlSource !== null;

  return (
    <Substep done={tunnelKnown} title={substepTitle}>
      {showEditor ? (
        <div className="tunnel-status__editor">
          <label htmlFor={inputId} className="visually-hidden">
            Tunnel URL
          </label>
          <input
            id={inputId}
            type="url"
            placeholder="https://your-tunnel.example.com (e.g., Tailscale Funnel, named tunnels, SSH)"
            value={draftUrl}
            onChange={(event) => setDraftUrl(event.target.value)}
            onBlur={commitDraftUrl}
            onKeyDown={onKeyDown}
            className="tunnel-status__input"
            spellCheck={false}
          />
          {userSpecifiedUrl && (
            <button
              type="button"
              className="button button--outline button--small"
              onClick={() => {
                setDraftUrl("");
                setUserSpecifiedUrl("");
              }}
            >
              Clear
            </button>
          )}
          {effectiveUrl && <ReachabilityBadge reachability={reachability} />}
        </div>
      ) : effectiveUrl ? (
        <>
          {/* Free cloudflared tunnels need a few seconds for
              their `*.trycloudflare.com` DNS record to propagate
              before the probe can reach them; tell the user not
              to panic when the first few probes land on red. Drop
              the hint once we've confirmed reachability. */}
          {providerName === "cloudflared" && reachability !== true && (
            <p className="substep__body-text">
              It may take a minute for the tunnel to be properly provisioned.
            </p>
          )}
          <div className="tunnel-status__url-row">
            <InlineCode text={effectiveUrl} copyable={false} />
            <ReachabilityBadge reachability={reachability} />
          </div>
          {/* For ChatGPT we use a nested iframe but since Claude
              doesn't honor `frameDomains` in the CSP you pass to it
              we have to instead return HTML which has <script>
              tags. (Note that technically this is only a problem in
              Claude in the browser, but there is no way to
              differentiate between Claude in the browser and Claude
              Desktop or mobile, so all Claude's get the HTML with
              <script> tags.)

              Free ngrok tunnels (`*.ngrok-free.dev`) serve an HTML
              interstitial on first request from a browser- looking
              User-Agent which causes those <script> tags to not work.
              Warn so the user isn't surprised. */}
          {clientName === "Claude" &&
            providerName === "ngrok" &&
            effectiveUrl.includes("ngrok-free.dev") && (
              <p className="tunnel-status__warning" role="note">
                Claude doesn't work for Reboot apps when using a free ngrok
                tunnel!
                <br />
                <br />
                Consider using a different tunnel like cloudflared if you don't
                want to pay for ngrok.
              </p>
            )}
        </>
      ) : (
        // No tunnel yet for the auto-detect providers — point the
        // user at the `Other` radio if they want to bring their own
        // (e.g. a paid named cloudflared tunnel rather than the
        // free one we tried to spin up).
        providerName === "cloudflared" && (
          <p className="substep__body-text">
            If you want to use your own <code>cloudflared</code> tunnel instead
            of the free one we've tried to start for you, go over to{" "}
            <strong>Other</strong> and paste in your tunnel address there.
          </p>
        )
      )}
    </Substep>
  );
};

interface ReachabilityBadgeProps {
  reachability: TunnelReachability;
}

const ReachabilityBadge = ({ reachability }: ReachabilityBadgeProps) => {
  if (reachability === true) {
    return <span className="reachability reachability--ok">✓ Reachable</span>;
  }
  // For both "no probe yet" (`null`) and "last probe failed"
  // (`false`) we keep showing "Checking…" with the animated dots
  // — the page is still actively retrying, and silencing that as
  // "Not reachable" felt too final for transient failures (e.g. a
  // brand-new cloudflared tunnel whose DNS hasn't propagated).
  // The colour shifts red once we've actually observed a failure
  // and stays red until a probe succeeds again.
  const modifier =
    reachability === false ? "reachability--bad" : "reachability--pending";
  return (
    <span className={`reachability ${modifier}`}>
      {reachability === false && "✗ "}Checking
      <span className="waiting-dots" aria-hidden="true" />
    </span>
  );
};
