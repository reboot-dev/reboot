import type { ReactNode } from "react";
import { ConnectionState } from "./wizard";

interface HeroProps {
  title: string;
  // Absent when the developer didn't pass `description=`; the hero
  // then shows a placeholder nudge instead of the description.
  description?: string;
  // `false` until the `Get` reader has produced at least one
  // response. While this is `false` we don't know the app's real
  // title or description yet, so the hero falls back to generic
  // copy + an animated ellipsis in place of the unknown fields.
  titleReady: boolean;
  // Whether the app exposes MCP tools/resources. Switches the
  // headline between the chat-client wizard framing and the
  // generic "API is ready" framing.
  hasMcpTools: boolean;
  connectionState: ConnectionState;
}

// Map the Reboot subscription's state to the badge text + CSS
// modifier on the hero pill. "Live" while we're receiving updates;
// "Disconnected" if the subscription aborted (e.g. the app was
// stopped); "Connecting…" before the first response arrives.
const CONNECTION_LABEL: Record<ConnectionState, ReactNode> = {
  connected: "✓ Connected",
  connecting: (
    <>
      {"✗ Connecting"}
      <span className="waiting-dots" aria-hidden="true" />
    </>
  ),
};

const CONNECTION_MODIFIER: Record<ConnectionState, string> = {
  connected: "pill--connected",
  connecting: "pill--connecting",
};

export const Hero = ({
  title,
  description,
  titleReady,
  hasMcpTools,
  connectionState,
}: HeroProps) => {
  return (
    <section className="hero">
      <h1 className="hero__title">
        {hasMcpTools ? (
          <>
            Try this app in a <em>chat client</em>.
          </>
        ) : (
          <>
            Your <em>API</em> is ready.
          </>
        )}
      </h1>
      <p className="hero__subtitle">
        {hasMcpTools ? (
          <>
            Only a few more steps to get{" "}
            <strong>{titleReady ? title : "this Reboot app"}</strong> working in
            the chat client of your choice.
          </>
        ) : (
          <>
            <strong>{titleReady ? title : "This Reboot app"}</strong> is serving
            traffic. It doesn't expose any MCP tools yet — here's how to call it
            directly.
          </>
        )}
      </p>
      <div className="app-info">
        <div className="app-info__main">
          <div className="app-info__name">
            {titleReady ? (
              title
            ) : (
              <span className="waiting-dots" aria-hidden="true" />
            )}
          </div>
          {!titleReady ? (
            <p className="app-info__description">
              <span className="waiting-dots" aria-hidden="true" />
            </p>
          ) : description ? (
            <p className="app-info__description">{description}</p>
          ) : (
            <p className="app-info__description app-info__placeholder">
              Add a <code>description=</code> to your Application(...) for a
              friendlier intro here.
            </p>
          )}
        </div>
        <span className={`pill ${CONNECTION_MODIFIER[connectionState]}`}>
          {CONNECTION_LABEL[connectionState]}
        </span>
      </div>
    </section>
  );
};
