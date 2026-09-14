// A state's data, drawn as the tree its JSON is: every object and
// array opens and closes, a closed one says how many items it holds,
// and every leaf is labelled with what it is. The top level starts
// open and everything under it closed, so a state reads as its
// fields first. The application sends the whole state again whenever
// it changes, and a value that differs from the one drawn before
// flashes, so a change is seen rather than found.
import type { JsonValue } from "@bufbuild/protobuf";
import { type FC, useEffect, useRef, useState } from "react";

// How many times `printed` has changed since it was first drawn.
// Used as a key on what shows it, so that each change remounts the
// element and restarts its animation.
const useChanges = (printed: string): number => {
  const previous = useRef(printed);
  const [changes, setChanges] = useState(0);
  useEffect(() => {
    if (previous.current !== printed) {
      previous.current = printed;
      setChanges((n) => n + 1);
    }
  }, [printed]);
  return changes;
};

// What a value is, as the label beside it; an array's and an object's
// stand in for the tree under them while it is closed.
const kindOf = (value: JsonValue): string =>
  value === null
    ? "null"
    : Array.isArray(value)
    ? "array"
    : typeof value === "object"
    ? "object"
    : typeof value;

// A value's items: an array's by index, an object's by key, and
// nothing for a leaf.
const entriesOf = (value: JsonValue): [string, JsonValue][] =>
  value === null || typeof value !== "object"
    ? []
    : Array.isArray(value)
    ? value.map((item, index) => [String(index), item])
    : Object.entries(value);

const countWithNoun = (n: number, noun: string): string =>
  `${n} ${n === 1 ? noun : `${noun}s`}`;

// One leaf, as JSON prints it, so a string is quoted and a number is
// not; flashing when it is not what it was.
const Leaf: FC<{ value: JsonValue }> = ({ value }) => {
  const printed = JSON.stringify(value);
  const changes = useChanges(printed);
  return (
    <span
      className={`json-leaf json-${kindOf(value)}${
        changes > 0 ? " is-changed" : ""
      }`}
      key={changes}
    >
      {printed}
    </span>
  );
};

// One value and, when it is an array or an object and open, the
// items under it, each named and stepped in.
const Node: FC<{
  name: string | undefined;
  value: JsonValue;
  open: boolean;
}> = ({ name, value, open: initiallyOpen }) => {
  const [open, setOpen] = useState(initiallyOpen);
  const kind = kindOf(value);
  const entries = entriesOf(value);
  const [opening, closing] = kind === "array" ? ["[", "]"] : ["{", "}"];
  const count = countWithNoun(entries.length, "item");
  // Open, the items under it flash for themselves, and the count
  // only when their number changed; closed, the count stands for
  // everything under it, and flashes for any change there.
  const changes = useChanges(open ? count : JSON.stringify(value));

  if (kind !== "array" && kind !== "object") {
    return (
      <div className="json-row">
        {name !== undefined && (
          <>
            <span className="json-name">{name}</span>
            <span className="json-colon">:</span>
          </>
        )}
        <span className="json-kind">{kind}</span>
        <Leaf value={value} />
      </div>
    );
  }

  return (
    <div className="json-node">
      <button
        type="button"
        className="json-row json-toggle"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <span className="caret" aria-hidden="true">
          {open ? "▾" : "▸"}
        </span>
        {name !== undefined && (
          <>
            <span className="json-name">{name}</span>
            <span className="json-colon">:</span>
          </>
        )}
        <span className="json-bracket">{opening}</span>
        {!open && <span className="json-bracket">{closing}</span>}
        <span
          className={changes > 0 ? "json-count is-changed" : "json-count"}
          key={changes}
        >
          {count}
        </span>
      </button>
      {open && (
        <>
          <div className="json-items">
            {entries.map(([key, item]) => (
              <Node name={key} value={item} open={false} key={key} />
            ))}
          </div>
          <div className="json-row">
            <span className="json-bracket">{closing}</span>
          </div>
        </>
      )}
    </div>
  );
};

export const JsonTree: FC<{ value: JsonValue }> = ({ value }) => (
  <div className="json-tree">
    <Node name={undefined} value={value} open={true} />
  </div>
);
