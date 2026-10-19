import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  Recording,
  RecordingButton,
} from "../../../reboot/dashboard/web/src/recordings";

const mocks = vi.hoisted(() => ({
  client: { url: "https://dashboard.example", bearerToken: "access" },
  refresh: vi.fn(),
}));
vi.mock("@reboot-dev/reboot-react", () => ({
  useRebootClient: () => mocks.client,
  useRefreshBearerToken: () => mocks.refresh,
}));
vi.mock("../../../reboot/dashboard/web/src/constants", () => ({
  MCP_CARD: undefined,
}));

let signing: ReturnType<typeof vi.fn>;
beforeEach(() => {
  let serial = 0;
  signing = vi.fn(async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      url: `/recordings/media?signature=${++serial}`,
      expires: 9999999999,
    }),
  }));
  vi.stubGlobal("fetch", signing);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const button = (video = false) => (
  <RecordingButton
    className="recording"
    recording={{ path: "shot.png" }}
    title="Recording"
    video={video}
  >
    Open recording
  </RecordingButton>
);

const thumbnail = (path: string) => (
  <Recording path={path}>
    {(url, onError) => <img alt="Thumbnail" src={url} onError={onError} />}
  </Recording>
);

describe("recording signatures", () => {
  it("retries after the MCP host rejects a token refresh", async () => {
    vi.useFakeTimers();
    signing.mockResolvedValueOnce({ ok: false, status: 401 });
    mocks.refresh.mockRejectedValueOnce(new Error("host disconnected"));
    const { container } = render(button(true));
    await act(async () => {
      fireEvent.click(screen.getByRole("button"));
    });
    expect(mocks.refresh).toHaveBeenCalledTimes(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(container.querySelector("video")).not.toBeNull();
    expect(signing).toHaveBeenCalledTimes(2);
  });

  it("retries when the signing response body is interrupted", async () => {
    vi.useFakeTimers();
    signing.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error("network interrupted");
      },
    });
    const { container } = render(button(true));
    await act(async () => {
      fireEvent.click(screen.getByRole("button"));
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });
    expect(container.querySelector("video")).not.toBeNull();
    expect(signing).toHaveBeenCalledTimes(2);
  });

  it("does not sign or load a video until opened", async () => {
    const { container } = render(button(true));
    expect(signing).not.toHaveBeenCalled();
    expect(container.querySelector("video")).toBeNull();
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() =>
      expect(container.querySelector("video")?.getAttribute("src")).toContain(
        "signature=1"
      )
    );
    expect(signing.mock.calls[0][1].headers.Authorization).toBe(
      "Bearer access"
    );
  });

  it("renews once on a media error and stops even if each URL is different", async () => {
    const { container } = render(button(true));
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() =>
      expect(container.querySelector("video")).not.toBeNull()
    );
    fireEvent.error(container.querySelector("video")!);
    await waitFor(() =>
      expect(container.querySelector("video")?.getAttribute("src")).toContain(
        "signature=2"
      )
    );
    fireEvent.error(container.querySelector("video")!);
    expect(signing).toHaveBeenCalledTimes(2);
  });

  it("signs a new URL on every image opening instead of reusing a thumbnail URL", async () => {
    render(
      <>
        {thumbnail("shot.png")}
        {button()}
      </>
    );
    await screen.findByAltText("Thumbnail");
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() =>
      expect(
        screen.getByRole("dialog").querySelector("img")?.getAttribute("src")
      ).toContain("signature=2")
    );
    fireEvent.keyDown(window, { key: "Escape" });
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() =>
      expect(
        screen.getByRole("dialog").querySelector("img")?.getAttribute("src")
      ).toContain("signature=3")
    );
  });

  it("renews a failed thumbnail only once", async () => {
    render(thumbnail("shot.png"));
    fireEvent.error(await screen.findByAltText("Thumbnail"));
    await waitFor(() =>
      expect(screen.getByAltText("Thumbnail").getAttribute("src")).toContain(
        "signature=2"
      )
    );
    fireEvent.error(screen.getByAltText("Thumbnail"));
    expect(signing).toHaveBeenCalledTimes(2);
  });

  it("clears the old image when the path changes and the new request fails", async () => {
    const { rerender } = render(thumbnail("first.png"));
    await screen.findByAltText("Thumbnail");
    signing.mockResolvedValueOnce({ ok: false, status: 404 });
    rerender(thumbnail("missing.png"));
    await waitFor(() => expect(screen.queryByAltText("Thumbnail")).toBeNull());
  });
});
