import { Blob_Status } from "@reboot-dev/reboot-std-api/blobs/v1/blobs_pb.js";
import {
  useBlob,
  useBlobDownloadUrl,
  useBlobUpload,
} from "@reboot-dev/reboot-std-react/blobs";
import { FC, useRef, useState } from "react";
import css from "./App.module.css";
import {
  AttachmentTooLarge,
  useChatRoom,
} from "../../api/chat_room/v1/chat_room_rbt_react";
// We can choose any id we want because the state will be constructed when we
// make the first .writer call.
const STATE_MACHINE_ID = "reboot-chat-room";

// A circular upload-progress indicator that fills clockwise. `fraction`
// is 0..1; when the total size isn't known yet it stays near empty.
const ProgressRing: FC<{ fraction: number }> = ({ fraction }) => {
  const radius = 13;
  const circumference = 2 * Math.PI * radius;
  return (
    <svg className={css.ring} viewBox="0 0 32 32">
      <circle className={css.ringTrack} cx="16" cy="16" r={radius} />
      <circle
        className={css.ringFill}
        cx="16"
        cy="16"
        r={radius}
        strokeDasharray={circumference}
        strokeDashoffset={
          circumference * (1 - Math.min(Math.max(fraction, 0), 1))
        }
      />
    </svg>
  );
};

// A fixed-size square for one attachment. While the blob is uploading
// it shows a filling ring (progress lives on the blob's state, so this
// is visible to every participant); once committed it shows a
// thumbnail (or a file glyph) that can be clicked to view the content.
const Attachment: FC<{ blobId: string }> = ({ blobId }) => {
  const { response: info } = useBlob({ id: blobId }).useInfo();
  const url = useBlobDownloadUrl(blobId);
  const [viewing, setViewing] = useState(false);

  const isImage = info?.contentType.startsWith("image/") ?? false;
  const committed = info?.status === Blob_Status.COMMITTED && url !== undefined;
  const gone =
    info?.status === Blob_Status.DELETING ||
    info?.status === Blob_Status.DELETED;

  const total = Number(info?.size ?? 0);
  const uploaded = Number(info?.bytesUploaded ?? 0);
  const fraction = total > 0 ? uploaded / total : 0;

  const view = () => {
    if (!committed) return;
    if (isImage) {
      setViewing(true);
    } else {
      window.open(url, "_blank", "noopener");
    }
  };

  return (
    <>
      <button
        className={css.attachment}
        onClick={view}
        disabled={!committed}
        title={committed ? "Click to view" : undefined}
        type="button"
      >
        {gone ? (
          <span className={css.attachmentGlyph}>⤫</span>
        ) : committed ? (
          isImage ? (
            <img className={css.attachmentThumb} src={url} alt="attachment" />
          ) : (
            <span className={css.attachmentGlyph}>📄</span>
          )
        ) : (
          <ProgressRing fraction={fraction} />
        )}
      </button>
      {viewing && committed && isImage && (
        <div className={css.lightbox} onClick={() => setViewing(false)}>
          <img className={css.lightboxImage} src={url} alt="attachment" />
        </div>
      )}
    </>
  );
};

const Attachments: FC<{ blobIds: string[] }> = ({ blobIds }) =>
  blobIds.length > 0 ? (
    <div className={css.attachments}>
      {blobIds.map((blobId) => (
        <Attachment blobId={blobId} key={blobId} />
      ))}
    </div>
  ) : null;

const Message: FC<{ text: string; attachmentBlobIds: string[] }> = ({
  text,
  attachmentBlobIds,
}) => {
  return (
    <div className={css.message}>
      {text !== "" && <div className={css.messageText}>{text}</div>}
      <Attachments blobIds={attachmentBlobIds} />
    </div>
  );
};

// An optimistically-rendered message that hasn't been confirmed by the
// backend yet. Its attachments have no blob id, so we show empty
// placeholder squares to keep the layout stable until the real message
// arrives (with squares that then track upload progress).
const PendingMessage: FC<{
  text: string;
  attachmentCount: number;
  isLoading: boolean;
}> = ({ text, attachmentCount, isLoading }) => {
  return (
    <div
      className={
        isLoading
          ? `${css.message} ${css.pendingMessageIsLoading}`
          : `${css.message} ${css.pendingMessage}`
      }
    >
      {text !== "" && <div className={css.messageText}>{text}</div>}
      {attachmentCount > 0 && (
        <div className={css.attachments}>
          {Array.from({ length: attachmentCount }, (_, index) => (
            <div className={css.attachmentPending} key={index}>
              <ProgressRing fraction={0} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const App = () => {
  // State of the input components.
  const [message, setMessage] = useState("Hello, Reboot!");
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { useMessages, send } = useChatRoom({ id: STATE_MACHINE_ID });
  const { response } = useMessages();
  const { upload } = useBlobUpload();

  const clearFile = () => {
    setFile(null);
    if (fileInputRef.current !== null) {
      fileInputRef.current.value = "";
    }
  };

  const canSend = message !== "" || file !== null;

  const handleSend = async () => {
    if (!canSend) {
      return;
    }
    setError(null);
    // Publishes the message immediately; the backend creates a `Blob`
    // per requested attachment and returns its id. Every participant
    // sees the message right away, with attachments visibly uploading.
    const { response, aborted } = await send({
      message: message,
      attachments:
        file !== null
          ? [{ contentType: file.type, sizeBytes: BigInt(file.size) }]
          : [],
    });
    if (aborted !== undefined) {
      // Surface the failure to the user. The backend's
      // `AttachmentTooLarge` error carries the limit, so we can say
      // exactly what it is.
      if (aborted.error instanceof AttachmentTooLarge) {
        const maxMebibytes = Number(aborted.error.maxSizeBytes) / (1024 * 1024);
        setError(
          `That attachment is too large. The maximum is ${maxMebibytes} MiB.`
        );
      } else {
        setError(`Couldn't send your message: ${aborted.message}`);
      }
      return;
    }

    const uploadFile = file;
    setMessage("");
    clearFile();

    if (uploadFile !== null && response !== undefined) {
      // Uploads directly to the data plane (the app's filesystem
      // store locally, S3 on the Cloud -- this code neither knows
      // nor cares), reporting progress onto the blob's state as it
      // goes.
      const { error } = await upload(response.attachmentBlobIds[0], uploadFile);
      if (error !== undefined) {
        console.warn(`Attachment upload failed: ${error}`);
      }
    }
  };

  return (
    <div className={css.messages}>
      <div className={css.composer}>
        <div className={css.inputWrap}>
          <button
            className={css.plusButton}
            onClick={() => fileInputRef.current?.click()}
            title="Attach a file"
            type="button"
          >
            +
          </button>
          <input
            type="text"
            className={css.textInput}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && canSend) {
                handleSend();
              }
            }}
            value={message}
            placeholder="Your message here..."
          />
        </div>
        <button
          className={canSend ? css.buttonEnabled : css.buttonDisabled}
          onClick={handleSend}
          disabled={!canSend}
        >
          Send
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        className={css.hiddenFileInput}
        onChange={(e) => {
          setError(null);
          setFile(e.target.files?.[0] ?? null);
        }}
      />

      {error !== null && (
        <div
          className={css.errorBanner}
          onClick={() => setError(null)}
          title="Dismiss"
        >
          <span>{error}</span>
          <span className={css.errorDismiss}>×</span>
        </div>
      )}

      {file !== null && (
        <div className={css.pendingAttachment}>
          <span className={css.pendingAttachmentName}>📎 {file.name}</span>
          <button
            className={css.pendingAttachmentRemove}
            onClick={clearFile}
            title="Remove attachment"
            type="button"
          >
            ×
          </button>
        </div>
      )}

      {(response !== undefined &&
        response.messages.length > 0 &&
        response.messages.map((message, index) => (
          <Message
            text={message.text}
            attachmentBlobIds={message.attachmentBlobIds}
            key={index}
          />
        ))) ||
        (response !== undefined && response.messages.length === 0 && (
          <p className={css.informationText}>No messages yet!</p>
        ))}
      {/*
        Optimistically render each send. Each pending mutation on
        `send.pending` will be removed when `response` has
        been received that includes the mutation's updates so you
        don't have to worry about mutators racing with readers!
        */}
      {send.pending.map(({ request, isLoading }, index) => (
        <PendingMessage
          text={request.message ?? ""}
          attachmentCount={request.attachments?.length ?? 0}
          isLoading={isLoading}
          key={index}
        />
      ))}
      {/*
        If we're loading our first response, show the user a loading message,
        so that they don't just see an empty screen.
      */}
      {response === undefined && (
        <p className={css.informationText}>Loading...</p>
      )}
    </div>
  );
};

export default App;
