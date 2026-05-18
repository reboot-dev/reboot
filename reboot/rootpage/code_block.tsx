import { useState } from "react";

type CopyState = "idle" | "copied" | "failed";

interface CopyButtonProps {
  text: string;
  label?: string;
  copiedLabel?: string;
  failedLabel?: string;
}

export const CopyButton = ({
  text,
  label = "Copy",
  copiedLabel = "Copied",
  // Shown when `navigator.clipboard.writeText` rejects — typically
  // an insecure (non-HTTPS, non-localhost) context or a locked-down
  // browser permission. The `.inline-code__text` / `.code-block`
  // text itself is selectable, so we point the user at the manual
  // path rather than leaving the click look like a no-op.
  failedLabel = "Select manually",
}: CopyButtonProps) => {
  const [copyState, setCopyState] = useState<CopyState>("idle");

  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyState("copied");
      setTimeout(() => setCopyState("idle"), 1500);
    } catch {
      setCopyState("failed");
      // Longer than the success flash — the failure label is a
      // call to action ("Select manually") that takes a beat to
      // read and act on.
      setTimeout(() => setCopyState("idle"), 3000);
    }
  };

  const modifier =
    copyState === "copied"
      ? " copy-button--copied"
      : copyState === "failed"
      ? " copy-button--failed"
      : "";
  const labelText =
    copyState === "copied"
      ? copiedLabel
      : copyState === "failed"
      ? failedLabel
      : label;

  return (
    <button type="button" onClick={onCopy} className={`copy-button${modifier}`}>
      {/* `aria-live="polite"` so screen readers announce the flip
          to "Copied" / "Select manually" — same pattern the tunnel
          and install steps use for their status flips. */}
      <span aria-live="polite">{labelText}</span>
    </button>
  );
};

interface InlineCodeProps {
  text: string;
  // Whether to render the trailing `Copy` button. Defaults to
  // `true`; pass `false` for display-only snippets (e.g. the
  // detected tunnel address shown in step 01 — the user is
  // expected to copy the `/mcp`-suffixed version from the install
  // step, not the bare address here).
  copyable?: boolean;
}

// One-line code cell. Used for short snippets like a shell command
// or a URL where the whole line should fit horizontally (with
// `overflow-x: auto` if necessary). Includes a `Copy` button by
// default; set `copyable={false}` for read-only display.
export const InlineCode = ({ text, copyable = true }: InlineCodeProps) => (
  <div className="inline-code">
    <span className="inline-code__text">{text}</span>
    {copyable && <CopyButton text={text} />}
  </div>
);

interface CodeBlockProps {
  code: string;
}

// Multi-line code block (a styled `<pre>`) for snippets that span
// several lines. Pair with a `CopyButton` at the call site when the
// snippet is meant to be copied.
export const CodeBlock = ({ code }: CodeBlockProps) => (
  <pre className="code-block">{code}</pre>
);
