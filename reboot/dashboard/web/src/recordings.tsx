import {
  useRebootClient,
  useRefreshBearerToken,
} from "@reboot-dev/reboot-react";
import {
  type FC,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { MCP_CARD } from "./constants";

const RECORDING_RETRY_MS = 2_000;

// An authenticated request obtains a short-lived URL on the backend.
// Media elements load it directly: MCP hosts may block blob: sources.
// Opening the lightbox mounts this hook and obtains a fresh URL; a
// change of `attempt` obtains another.
const useRecording = (path: string, attempt = 0): string | undefined => {
  const client = useRebootClient();
  const refreshBearerToken = useRefreshBearerToken();
  const bearerToken = useRef(client.bearerToken);
  bearerToken.current = client.bearerToken;
  const [url, setUrl] = useState<string | undefined>(undefined);
  useEffect(() => {
    setUrl(undefined);
    if (MCP_CARD !== undefined) {
      return;
    }
    let cancelled = false;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const later = (attempt: () => Promise<void>): void => {
      retry = setTimeout(() => void attempt(), RECORDING_RETRY_MS);
    };
    const fetchRecording = async (refreshed: boolean): Promise<void> => {
      let response: Response;
      try {
        response = await fetch(
          new URL(
            `/recordings/sign?${new URLSearchParams({ path })}`,
            client.url
          ).toString(),
          {
            headers:
              bearerToken.current === undefined
                ? {}
                : { Authorization: `Bearer ${bearerToken.current}` },
          }
        );
      } catch {
        if (!cancelled) {
          later(() => fetchRecording(refreshed));
        }
        return;
      }
      if (cancelled) {
        return;
      }
      if (response.status === 401 && !refreshed) {
        let fresh: string | undefined;
        try {
          fresh =
            refreshBearerToken === null
              ? undefined
              : await refreshBearerToken();
        } catch {
          // In an MCP host the refresh asks the host, which can fail.
          fresh = undefined;
        }
        if (cancelled) {
          return;
        }
        if (fresh === undefined) {
          later(() => fetchRecording(false));
          return;
        }
        bearerToken.current = fresh;
        void fetchRecording(true);
        return;
      }
      if (response.status >= 500) {
        later(() => fetchRecording(refreshed));
        return;
      }
      if (!response.ok) {
        console.warn(`Recording ${path}: ${response.status}`);
        return;
      }
      try {
        const signed: { url: string; expires: number } = await response.json();
        if (!cancelled) {
          setUrl(new URL(signed.url, client.url).toString());
        }
      } catch {
        if (!cancelled) {
          later(() => fetchRecording(refreshed));
        }
      }
    };
    void fetchRecording(false);
    return () => {
      cancelled = true;
      if (retry !== undefined) {
        clearTimeout(retry);
      }
    };
  }, [client.url, path, refreshBearerToken, attempt]);
  return url;
};

export const Recording: FC<{
  path: string;
  children: (url: string, onError: () => void) => ReactNode;
}> = ({ path, children }) => {
  const [attempt, setAttempt] = useState(0);
  const url = useRecording(path, attempt);
  // Renew an expired thumbnail once too; a permanently missing file must
  // not cause an endless signing loop.
  const onError = (): void => {
    if (url !== undefined && attempt === 0) {
      setAttempt(1);
    }
  };
  return url === undefined ? null : <>{children(url, onError)}</>;
};

// A recording over the whole page; the backdrop alone while `url` is
// still arriving.
const RecordingLightbox: FC<{
  url: string | undefined;
  video: boolean;
  title: string;
  onClose: () => void;
  onError?: () => void;
}> = ({ url, video, title, onClose, onError }) => {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);
  return (
    <div
      className="recording-lightbox"
      role="dialog"
      aria-label={title}
      // A click here closes the recording, not what the button that
      // opened it sits in: a scenario's head toggles the scenario.
      onClick={(event) => {
        event.stopPropagation();
        onClose();
      }}
    >
      {url === undefined ? null : video ? (
        <video
          src={url}
          controls
          autoPlay
          onError={onError}
          onClick={(event) => event.stopPropagation()}
        />
      ) : (
        <img src={url} alt={title} onError={onError} />
      )}
    </div>
  );
};

// A lightbox that fetches its recording only while shown: a video is
// not requested until opened, giving each viewing a fresh signed URL.
// A URL that fails to load, as one does once it has expired, is
// requested once more; a recording that fails twice stays blank.
const FetchedRecordingLightbox: FC<{
  path: string;
  video: boolean;
  title: string;
  onClose: () => void;
}> = ({ path, ...rest }) => {
  const [attempt, setAttempt] = useState(0);
  const url = useRecording(path, attempt);
  return (
    <RecordingLightbox
      url={url}
      onError={() => {
        if (url !== undefined && attempt === 0) {
          setAttempt(1);
        }
      }}
      {...rest}
    />
  );
};

// A thumbnail or link that opens the recording over the page rather
// than in a new tab, which an MCP host's frame cannot open. Always
// request a fresh signed URL when opened, even for an existing thumbnail.
// Videos are requested only when opened.
export const RecordingButton: FC<{
  className: string;
  recording: { path: string };
  video?: boolean;
  title: string;
  children: ReactNode;
}> = ({ className, recording, video = false, title, children }) => {
  const [shown, setShown] = useState(false);
  const close = useCallback(() => setShown(false), []);
  return (
    <>
      <button
        type="button"
        className={`recording-button ${className}`}
        title={title}
        // A click here opens the recording, not what it is in.
        onClick={(event) => {
          event.stopPropagation();
          setShown(true);
        }}
      >
        {children}
      </button>
      {shown && (
        <FetchedRecordingLightbox
          path={recording.path}
          video={video}
          title={title}
          onClose={close}
        />
      )}
    </>
  );
};
