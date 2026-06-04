import { useEffect, useState } from "react";
import { TunnelProviderName } from "./tunnel_provider_picker";
import { useStoredState } from "./use_stored_state";

// Status of the connectivity probe to the effective tunnel URL.
// `null` while no tunnel is known (no probe in flight); `true` when
// a recent fetch of `<tunnel>/__/rootpage/reboot-logo.svg` succeeded;
// `false` after a probe failed.
export type TunnelReachability = null | true | false;

// Source of the currently-effective tunnel URL — either a URL polled
// out of a provider's local API on the backend (ngrok or
// cloudflared), or one the user typed in themselves and we cached
// in `localStorage`.
export type TunnelUrlSource = "detected" | "user" | null;

export interface Tunnel {
  // The provider-detected URL for the currently-selected radio.
  // Empty when the backend's `WatchTunnel` workflow hasn't found
  // anything for that provider (or when `"other"` is selected,
  // which has no detection).
  detectedUrl: string;
  // What the user typed into the override input, persisted to
  // `localStorage`. Empty when unset.
  userSpecifiedUrl: string;
  // The URL we should use everywhere downstream — user override
  // wins, then detected, else empty.
  effectiveUrl: string;
  // Which of the two `effectiveUrl` came from.
  urlSource: TunnelUrlSource;
  // Latest connectivity probe result against `effectiveUrl`.
  reachability: TunnelReachability;
  // Update the user override. Persists to / clears `localStorage`.
  setUserSpecifiedUrl: (value: string) => void;
}

// Per-app `localStorage` key. We key on `window.location.origin`
// (host + port) rather than the application's title because the
// title arrives asynchronously via the Reboot React subscription
// but we need a stable identity at module-load time. Two Reboot
// apps on the same machine use different ports, so origin is a
// fine identity for "this app".
const TUNNEL_URL_STORAGE_KEY = `reboot.wizard.${window.location.origin}.tunnel`;

const trimTrailingSlash = (url: string): string => url.replace(/\/+$/, "");

// Probe the tunnel by `fetch`ing a dedicated tiny endpoint
// (`/__/probe`) the framework mounts. Envoy adds CORS headers
// automatically on the real response, so:
//   - Through a working tunnel → CORS check passes, fetch resolves.
//   - Through ngrok's free-tier interstitial (HTML, no CORS) → CORS
//     check fails, fetch rejects.
//   - Through nothing (DNS/connect failure) → fetch rejects.
// The `ngrok-skip-browser-warning` request header additionally
// asks ngrok to skip the interstitial on tunnels that respect it.
const probeReachability = async (
  url: string,
  signal: AbortSignal
): Promise<boolean> => {
  // Stable URL (no cache-buster): `cache: "no-store"` already
  // prevents a stale probe response, and a fixed URL lets the
  // browser reuse the cached CORS preflight (Envoy sets a long
  // `max-age`), so after the first poll we skip the extra OPTIONS
  // round-trip and just send the GET.
  const probeUrl = `${trimTrailingSlash(url)}/__/probe`;
  try {
    const response = await fetch(probeUrl, {
      method: "GET",
      mode: "cors",
      cache: "no-store",
      // Bypasses ngrok's free-tier interstitial. The query-string
      // form is unreliable for browsers (ngrok still serves the
      // interstitial when the User-Agent looks like Chrome), so we
      // send it as a request header. Envoy's CORS allow-headers
      // list includes this name so the preflight succeeds.
      headers: { "ngrok-skip-browser-warning": "1" },
      signal,
    });
    return response.ok;
  } catch {
    return false;
  }
};

interface UseTunnelOptions {
  // Public URL the backend's `WatchTunnel` workflow last discovered
  // for ngrok, or absent when ngrok's local API didn't respond / had
  // no matching tunnel for our port.
  ngrokDetectedUrl?: string;
  // Public URL the backend's `WatchTunnel` workflow last discovered
  // for cloudflared, or absent when cloudflared's `/quicktunnel`
  // metrics endpoint didn't respond.
  cloudflaredDetectedUrl?: string;
  // Which radio the user has selected. Drives which provider's
  // detected URL (if any) is used as the effective tunnel.
  selectedProviderName: TunnelProviderName;
}

// Single source of truth for "which tunnel are we using, where did
// it come from, is it reachable, and how do we update the user's
// override". Used by both the tunnel step (to decide which substeps
// to collapse) and the install step (to fill in the MCP URL).
//
// We track each provider's detected URL independently — both can be
// non-empty at once (ngrok and cloudflared can run side-by-side on
// different metrics ports) — and pick whichever matches the radio
// the user has selected. The `"other"` radio has no detection
// signal; the user must paste their tunnel URL into the editor.
export const useTunnel = ({
  ngrokDetectedUrl,
  cloudflaredDetectedUrl,
  selectedProviderName,
}: UseTunnelOptions): Tunnel => {
  // Persist the raw user-typed value verbatim. We trim the URL at
  // the point of *use* (the `userTrimmedUrl` derivation below) so
  // round-tripping through the input doesn't fight a re-trim on
  // every keystroke commit.
  const [userSpecifiedUrl, setUserSpecifiedUrl] = useStoredState(
    TUNNEL_URL_STORAGE_KEY,
    (raw) => raw,
    ""
  );

  // Pick the detected URL belonging to the currently-selected
  // radio. The other provider's URL is intentionally ignored —
  // flipping radios is how the user tells us which tunnel to use,
  // even if both are up. `"other"` has no detection signal at all.
  let detectedUrl = "";
  if (selectedProviderName === "ngrok") {
    detectedUrl = ngrokDetectedUrl?.trim() ?? "";
  } else if (selectedProviderName === "cloudflared") {
    detectedUrl = cloudflaredDetectedUrl?.trim() ?? "";
  }
  // User override only applies in `"other"` mode — that's the
  // only radio that exposes an editable input. The `ngrok` and
  // `cloudflared` radios are auto-detect-only; their previously-
  // saved override (if any) stays in `localStorage` but doesn't
  // drive the active tunnel until the user picks `"other"` again.
  const userTrimmedUrl =
    selectedProviderName === "other" ? userSpecifiedUrl.trim() : "";
  const effectiveUrl = userTrimmedUrl || detectedUrl;
  const urlSource: TunnelUrlSource = userTrimmedUrl
    ? "user"
    : detectedUrl
    ? "detected"
    : null;

  const [reachability, setReachability] = useState<TunnelReachability>(null);

  useEffect(() => {
    if (effectiveUrl.length === 0) {
      setReachability(null);
      return;
    }
    // Effective URL just changed (provider switch, override edit,
    // detected URL replaced). Clear the previous probe's verdict so
    // the badge doesn't claim the new URL is reachable using the old
    // one's result. We only reset on `effectiveUrl` change — the
    // `setInterval` below re-runs `check()` without re-running this
    // effect, so the every-5s poll still preserves the last outcome
    // (which is what keeps the badge from flickering between polls).
    setReachability(null);
    const controller = new AbortController();
    let cancelled = false;
    const check = async () => {
      const reachable = await probeReachability(
        effectiveUrl,
        controller.signal
      );
      if (!cancelled) setReachability(reachable);
    };
    check();
    const intervalId = window.setInterval(check, 5000);
    return () => {
      cancelled = true;
      controller.abort();
      window.clearInterval(intervalId);
    };
  }, [effectiveUrl]);

  return {
    detectedUrl,
    userSpecifiedUrl,
    effectiveUrl,
    urlSource,
    reachability,
    setUserSpecifiedUrl,
  };
};
