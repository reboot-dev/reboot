// The developer's web frontend in a small window over the models
// page, so that what it does can be watched arriving in the
// instances.
// The window is dragged by its bar, resized by its corner, folded to
// its bar, and closed; where it is and what it shows are remembered
// in the browser, which is the only place the page can remember
// anything without a change to the dashboard's state.
import {
  type FC,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { FRONTEND_PATH, sameSiteUrl } from "./application";

export interface FrontendWindowSettings {
  open: boolean;
  collapsed: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  // The frontend's URL as the developer typed it; empty for the one
  // the application serves, when it serves one.
  url: string;
}

const STORAGE_KEY = "frontend-window";

const DEFAULT_SETTINGS: FrontendWindowSettings = {
  open: false,
  collapsed: false,
  x: 480,
  y: 400,
  width: 460,
  height: 340,
  url: "",
};

// The window never shrinks below what a page can be read in, and
// never leaves the viewport by more than its margin.
const MIN_WIDTH = 320;
const MIN_HEIGHT = 200;
const MARGIN = 8;
const BAR_HEIGHT = 40;

const readSettings = (): FrontendWindowSettings => {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === null
      ? DEFAULT_SETTINGS
      : { ...DEFAULT_SETTINGS, ...(JSON.parse(stored) as object) };
  } catch {
    return DEFAULT_SETTINGS;
  }
};

// The window's settings, read from the browser once and written
// back on every change.
export const useFrontendWindowSettings = (): [
  FrontendWindowSettings,
  (change: Partial<FrontendWindowSettings>) => void
] => {
  const [settings, setSettings] = useState(readSettings);
  const change = (change: Partial<FrontendWindowSettings>): void => {
    setSettings((previous) => {
      const next = { ...previous, ...change };
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Nothing to remember it in; the window still works.
      }
      return next;
    });
  };
  return [settings, change];
};

// Follows the pointer from a press on `event` until it is released,
// telling `onMove` how far it has gone from the press and `onEnd`
// when it is let go. The pressed element captures the pointer, so
// the events keep coming to it while the pointer is over the frame,
// whose own document would otherwise get them and keep the release.
const follow = (
  event: ReactPointerEvent,
  onMove: (dx: number, dy: number) => void,
  onEnd: () => void
): void => {
  event.preventDefault();
  const element = event.currentTarget;
  const pointerId = event.pointerId;
  const startX = event.clientX;
  const startY = event.clientY;
  const move = (moved: PointerEvent): void =>
    onMove(moved.clientX - startX, moved.clientY - startY);
  const up = (): void => {
    element.removeEventListener("pointermove", move);
    element.removeEventListener("pointerup", up);
    element.removeEventListener("pointercancel", up);
    if (element.hasPointerCapture(pointerId)) {
      element.releasePointerCapture(pointerId);
    }
    onEnd();
  };
  element.setPointerCapture(pointerId);
  element.addEventListener("pointermove", move);
  element.addEventListener("pointerup", up);
  element.addEventListener("pointercancel", up);
};

const clamp = (value: number, low: number, high: number): number =>
  Math.max(low, Math.min(high, value));

// The button in the page's heading that shows and hides the window.
export const FrontendToggle: FC<{
  settings: FrontendWindowSettings;
  onChange: (change: Partial<FrontendWindowSettings>) => void;
  frontendUrl: string;
}> = ({ settings, onChange, frontendUrl }) => (
  <button
    type="button"
    className={settings.open ? "frontend-toggle is-open" : "frontend-toggle"}
    onClick={() => onChange({ open: !settings.open, collapsed: false })}
  >
    <span className="connection-dot" aria-hidden="true" />
    {settings.open
      ? "Hide frontend"
      : frontendUrl === ""
      ? "Show frontend"
      : `Show frontend · ${new URL(frontendUrl).host}`}
  </button>
);

export const FrontendWindow: FC<{
  settings: FrontendWindowSettings;
  onChange: (change: Partial<FrontendWindowSettings>) => void;
  // Where the frontend is, from what the developer typed or what the
  // application serves; empty when neither says.
  frontendUrl: string;
  // Whether the application is serving it, so that the frame is
  // loaded again when the application comes back.
  served: boolean | undefined;
}> = ({ settings, onChange, frontendUrl, served }) => {
  const [typed, setTyped] = useState(settings.url);
  // Bumped to load the frame again, by the reload button and by the
  // application coming back after a restart, which is `served`
  // turning true after being false.
  const [generation, setGeneration] = useState(0);
  const wasServed = useRef(served);
  useEffect(() => {
    if (served === true && wasServed.current === false) {
      setGeneration((n) => n + 1);
    }
    wasServed.current = served;
  }, [served]);

  // Where the window is while it is being dragged or resized, kept
  // here rather than written to the browser on every movement; the
  // settings get the result once the pointer is let go.
  const [moving, setMoving] = useState<Partial<FrontendWindowSettings>>();
  const shown = { ...settings, ...moving };
  const height = shown.collapsed ? BAR_HEIGHT : shown.height;

  const finish = (): void => {
    setMoving((result) => {
      if (result !== undefined) {
        onChange(result);
      }
      return undefined;
    });
  };

  const startMove = (event: ReactPointerEvent): void => {
    const { x, y, width } = settings;
    follow(
      event,
      (dx, dy) =>
        setMoving({
          x: clamp(x + dx, MARGIN, window.innerWidth - width - MARGIN),
          y: clamp(y + dy, MARGIN, window.innerHeight - height - MARGIN),
        }),
      finish
    );
  };

  const startResize = (event: ReactPointerEvent): void => {
    const { x, y, width, height } = settings;
    follow(
      event,
      (dx, dy) =>
        setMoving({
          width: clamp(width + dx, MIN_WIDTH, window.innerWidth - x - MARGIN),
          height: clamp(
            height + dy,
            MIN_HEIGHT,
            window.innerHeight - y - MARGIN
          ),
        }),
      finish
    );
  };

  const apply = (): void => {
    const trimmed = typed.trim();
    let url = "";
    if (trimmed !== "") {
      try {
        url = sameSiteUrl(
          new URL(
            trimmed.includes("://") ? trimmed : `http://${trimmed}`
          ).toString(),
          window.location.hostname
        );
      } catch {
        url = trimmed;
      }
    }
    setTyped(url);
    onChange({ url });
  };

  // A frontend on another site than the page loses its cookies in
  // some browsers, which nothing here can fix; the bar says so.
  const crossSite =
    frontendUrl !== "" &&
    (() => {
      try {
        return new URL(frontendUrl).hostname !== window.location.hostname;
      } catch {
        return false;
      }
    })();

  return (
    <div
      className={
        moving === undefined ? "frontend-window" : "frontend-window is-moving"
      }
      style={{
        left: shown.x,
        top: shown.y,
        width: shown.width,
        height,
      }}
      role="dialog"
      aria-label="Application frontend"
    >
      <div className="frontend-bar" onPointerDown={startMove}>
        <span className="connection-dot" aria-hidden="true" />
        <span className="frontend-bar-title">frontend</span>
        <input
          type="url"
          className="frontend-url"
          placeholder="Your frontend's URL, e.g., http://localhost:5173"
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          onBlur={apply}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              apply();
              event.currentTarget.blur();
            }
          }}
          // Typing in the bar must not drag the window.
          onPointerDown={(event) => event.stopPropagation()}
          title={
            crossSite
              ? "On another site than this page, so its sign-in cookies " +
                "may be dropped by the browser"
              : frontendUrl
          }
          aria-label="Frontend URL"
        />
        {crossSite && (
          <span className="frontend-note" title="Cookies may be dropped">
            cross-site
          </span>
        )}
        <span className="frontend-size">
          {shown.width}×{shown.height}
        </span>
        <div
          className="frontend-actions"
          onPointerDown={(event) => event.stopPropagation()}
        >
          {frontendUrl !== "" && (
            <a
              className="frontend-action"
              href={frontendUrl}
              target="_blank"
              rel="noreferrer"
              title="Open in a tab"
            >
              ↗
            </a>
          )}
          <button
            type="button"
            className="frontend-action"
            onClick={() => setGeneration((n) => n + 1)}
            title="Reload"
          >
            ↻
          </button>
          <button
            type="button"
            className="frontend-action"
            onClick={() => onChange({ collapsed: !settings.collapsed })}
            title={settings.collapsed ? "Expand" : "Collapse"}
          >
            {settings.collapsed ? "▴" : "▾"}
          </button>
          <button
            type="button"
            className="frontend-action"
            onClick={() => onChange({ open: false })}
            title="Close"
          >
            ×
          </button>
        </div>
      </div>
      {!settings.collapsed &&
        (frontendUrl === "" ? (
          <div className="frontend-empty">
            The application is not serving a frontend. If yours runs on its own,
            such as Vite on its own port, type its URL above.
          </div>
        ) : (
          <iframe
            className="frontend-frame"
            src={frontendUrl}
            title="Application frontend"
            key={generation}
          />
        ))}
      {!settings.collapsed && (
        <div
          className="frontend-resize"
          onPointerDown={startResize}
          title="Resize"
        />
      )}
    </div>
  );
};

// Where the frontend is: what the developer typed, else what the
// application serves when it serves one, else nowhere.
export const frontendUrlOf = (
  settings: FrontendWindowSettings,
  applicationUrl: string | undefined,
  served: boolean | undefined
): string =>
  settings.url !== ""
    ? settings.url
    : served === true && applicationUrl !== undefined
    ? `${applicationUrl}${FRONTEND_PATH}`
    : "";
