// A model's instances: every state of one type the running
// application holds, by id, listed under the type in the types pane.
import type { JsonValue } from "@bufbuild/protobuf";
import { type FC, type ReactNode, useEffect, useRef, useState } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { useStateData } from "./application";
import { JsonTree } from "./json_tree";
import { Picker } from "./picker";

// A button that copies one string, quiet until hovered, and a word
// while it says it copied.
export const CopyButton: FC<{
  text: string;
  what: string;
  className?: string;
}> = ({ text, what, className }) => {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) {
      return;
    }
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <button
      type="button"
      className={`copy-button${copied ? " is-copied" : ""}${
        className === undefined ? "" : ` ${className}`
      }`}
      title={`Copy the ${what}`}
      aria-label={`Copy the ${what}`}
      // A click here copies, and does not open the row it sits in.
      onClick={(event) => {
        event.stopPropagation();
        navigator.clipboard.writeText(text).then(
          () => setCopied(true),
          () => setCopied(false)
        );
      }}
    >
      {copied ? "copied" : "copy"}
    </button>
  );
};

// One state's data, read live for as long as its row is open.
const StateData: FC<{
  url: string | undefined;
  stateType: string;
  stateId: string;
}> = ({ url, stateType, stateId }) => {
  const { value, unreachable, status } = useStateData(url, stateType, stateId);
  const json: JsonValue | undefined = value;
  const empty =
    json !== undefined &&
    json !== null &&
    typeof json === "object" &&
    !Array.isArray(json) &&
    Object.keys(json).length === 0;
  return (
    <div className="state-data">
      <div className="state-data-head">
        <span>{stateType}</span>
        {json !== undefined && (
          <CopyButton text={JSON.stringify(json, null, 2)} what="JSON" />
        )}
      </div>
      {status !== undefined ? (
        <div className="state-data-note">
          Could not read the state: {status.message ?? `status ${status.code}`}
        </div>
      ) : unreachable ? (
        <div className="state-data-note">The application isn't running.</div>
      ) : json === undefined ? (
        <div className="state-data-note">Reading…</div>
      ) : empty ? (
        <div className="state-data-note">
          no fields — the key is the whole state
        </div>
      ) : (
        <JsonTree value={json} />
      )}
    </div>
  );
};

// What the pane knows of a type's instances: the application is not
// running, is still being read, does not serve the type, or holds
// these ids, each of which a row opens to the data of.
export type Instances =
  | { kind: "not-running" }
  | { kind: "reading" }
  | { kind: "not-served" }
  | { kind: "ids"; url: string | undefined; stateType: string; ids: string[] };

// How many rows may be open at once. Each open row holds a stream to
// the application, and a browser holds at most six connections to
// it; the pane's other streams take the rest. Opening one more
// closes the one open longest.
const MAX_OPEN_ROWS = 3;

// One instance's row: its id, which opens and closes its data.
const InstanceRow: FC<{
  url: string | undefined;
  stateType: string;
  stateId: string;
  open: boolean;
  onToggle: () => void;
}> = ({ url, stateType, stateId, open, onToggle }) => (
  <li className={open ? "instance-row is-open" : "instance-row"}>
    <div className="instance-row-head">
      <button
        type="button"
        className="instance-row-toggle"
        onClick={onToggle}
        aria-expanded={open}
      >
        <span className="caret" aria-hidden="true">
          {open ? "▾" : "▸"}
        </span>
        <span className="state-id">{stateId}</span>
      </button>
      <CopyButton text={stateId} what="instance id" />
    </div>
    {open && <StateData url={url} stateType={stateType} stateId={stateId} />}
  </li>
);

// The rows, and which of them are open, which is the pane's own
// business, not the URL's. The ids to inspect are chosen in the
// picker as chips, and the rows are then those, each opened; with
// none chosen they are every id, narrowed by what is typed.
const InstanceRows: FC<{
  url: string | undefined;
  stateType: string;
  ids: string[];
}> = ({ url, stateType, ids }) => {
  const [query, setQuery] = useState("");
  const [chosen, setChosen] = useState<string[]>([]);
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set());
  const toggle = (stateId: string): void => {
    setOpen((previous) => {
      const next = new Set(previous);
      if (next.has(stateId)) {
        next.delete(stateId);
      } else {
        next.add(stateId);
        // A set iterates in insertion order, so the first is the
        // one open longest.
        while (next.size > MAX_OPEN_ROWS) {
          next.delete(next.values().next().value!);
        }
      }
      return next;
    });
  };

  // Choosing an id opens it, which is what it is chosen for; letting
  // it go closes it.
  const toggleChosen = (stateId: string): void => {
    if (chosen.includes(stateId)) {
      setChosen(chosen.filter((id) => id !== stateId));
      setOpen((previous) => {
        const next = new Set(previous);
        next.delete(stateId);
        return next;
      });
    } else {
      setChosen([...chosen, stateId]);
      if (!open.has(stateId)) {
        toggle(stateId);
      }
    }
  };

  const shown =
    chosen.length > 0
      ? chosen.filter((id) => ids.includes(id))
      : query === ""
      ? ids
      : ids.filter((id) => id.toLowerCase().includes(query.toLowerCase()));

  return (
    <>
      <div className="instances-search">
        <Picker
          items={ids}
          selected={chosen}
          what="instance id"
          onToggle={toggleChosen}
          onText={setQuery}
          listsAllWhenEmpty={false}
        />
        {chosen.length === 0 && query !== "" && (
          <span className="summary-line">
            {shown.length} of {ids.length} match
          </span>
        )}
      </div>
      {shown.length === 0 ? (
        <p className="instances-note">
          {chosen.length > 0
            ? "None of the chosen ids exists any more."
            : "No instance ids match."}
        </p>
      ) : (
        <ul className="instance-rows">
          {shown.map((stateId) => (
            <InstanceRow
              url={url}
              stateType={stateType}
              stateId={stateId}
              open={open.has(stateId)}
              onToggle={() => toggle(stateId)}
              key={stateId}
            />
          ))}
        </ul>
      )}
    </>
  );
};

// The instances section's heights, pixels the way `Panel` reads plain
// numbers. The height is the browser's to remember, like the frontend
// window's place: it is not worth a change to the dashboard's state.
const INSTANCES_HEIGHT = { default: 240, min: 96, max: 720 };
const HEIGHT_KEY = "instances-height";

const readHeight = (): number => {
  try {
    const stored = Number(window.localStorage.getItem(HEIGHT_KEY));
    return Number.isFinite(stored) && stored >= INSTANCES_HEIGHT.min
      ? Math.min(stored, INSTANCES_HEIGHT.max)
      : INSTANCES_HEIGHT.default;
  } catch {
    return INSTANCES_HEIGHT.default;
  }
};

const writeHeight = (height: number): void => {
  try {
    window.localStorage.setItem(HEIGHT_KEY, String(height));
  } catch {
    // Nothing to remember it in; the divider still drags.
  }
};

// The type's definition above, its instances below, and between them
// a divider that is dragged. The height is written back once the
// divider is let go, not on every movement. With no ids to list, only
// a line saying why, the section takes just that line's height and
// the divider is not drawn.
export const InstancesSplit: FC<{
  definition: ReactNode;
  instances: Instances;
}> = ({ definition, instances }) => {
  const [height] = useState(readHeight);
  const resizing = useRef(height);
  if (instances.kind !== "ids") {
    return (
      <>
        {definition}
        <InstancesList instances={instances} brief />
      </>
    );
  }
  return (
    <Group
      className="types-pane-split"
      orientation="vertical"
      style={{ height: "auto", flex: 1, minHeight: 0 }}
      onLayoutChanged={(_layout, { isUserInteraction }) => {
        if (isUserInteraction) {
          writeHeight(resizing.current);
        }
      }}
    >
      <Panel>{definition}</Panel>
      <Separator className="instances-resizer" />
      <Panel
        defaultSize={height}
        minSize={INSTANCES_HEIGHT.min}
        maxSize={INSTANCES_HEIGHT.max}
        onResize={({ inPixels }) => {
          resizing.current = Math.round(inPixels);
        }}
      >
        <InstancesList instances={instances} />
      </Panel>
    </Group>
  );
};

// The section itself: its head, then the ids scrolling, or one line
// saying why there are none to show. `brief` is that line's case,
// where the section is as short as it can be.
const InstancesList: FC<{ instances: Instances; brief?: boolean }> = ({
  instances,
  brief,
}) => (
  <section className={brief ? "instances instances-brief" : "instances"}>
    <div className="instances-head">instances</div>
    {instances.kind === "not-running" ? (
      <p className="instances-note">
        To see your model instances, start your application with{" "}
        <code>rbt dev run</code>.
      </p>
    ) : instances.kind === "reading" ? (
      <p className="instances-note">Reading…</p>
    ) : instances.kind === "not-served" ? (
      <p className="instances-note">
        The running application does not serve this type.
      </p>
    ) : instances.ids.length === 0 ? (
      <p className="instances-note">No instances yet.</p>
    ) : (
      <InstanceRows
        url={instances.url}
        stateType={instances.stateType}
        ids={instances.ids}
      />
    )}
  </section>
);
