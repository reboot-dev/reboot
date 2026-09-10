// A box that holds the chosen items as chips and, at the cursor after
// them, lists the rest as you type: a click on a listed item adds it
// and shows the list again, Enter takes the first listed, Escape
// closes the list, and a click on a chosen chip, or Backspace in the
// empty box, removes one. `what` names an item for the reader, "state
// type" or "instance id".
import { type FC, useRef, useState } from "react";

// At most this many items are listed: a list of thousands of ids
// would be scrolled, not read, and typing narrows it faster.
const MAX_LISTED = 50;

// One item as a chip; lit while it is chosen.
export const Chip: FC<{
  item: string;
  what: string;
  active: boolean;
  onToggle: (item: string) => void;
}> = ({ item, what, active, onToggle }) => (
  <button
    type="button"
    className={active ? "chip is-active" : "chip"}
    onClick={() => onToggle(item)}
    title={active ? `Stop filtering by ${item}` : `Filter by ${item}`}
  >
    {item}
  </button>
);

export const Picker: FC<{
  items: string[];
  selected: string[];
  what: string;
  onToggle: (item: string) => void;
  // What is typed, as it is typed, for a caller that filters by it
  // while nothing is chosen.
  onText?: (text: string) => void;
  // Whether the empty box lists every item when the cursor enters
  // it, which suits a few state types and not thousands of ids.
  listsAllWhenEmpty: boolean;
}> = ({ items, selected, what, onToggle, onText, listsAllWhenEmpty }) => {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const matching =
    text.trim() === "" && !listsAllWhenEmpty
      ? []
      : items.filter(
          (item) =>
            !selected.includes(item) &&
            item.toLowerCase().includes(text.trim().toLowerCase())
        );
  const listed = matching.slice(0, MAX_LISTED);
  const listing = listsAllWhenEmpty || text.trim() !== "";
  const type = (value: string) => {
    setText(value);
    onText?.(value);
  };
  const choose = (item: string) => {
    onToggle(item);
    type("");
    input.current?.focus();
  };
  return (
    <div
      className={open ? "picker is-open" : "picker"}
      onMouseDown={(event) => {
        // A click on the box's empty part puts the cursor there; a
        // click on a chip or the list is theirs to handle.
        if (event.target === event.currentTarget) {
          event.preventDefault();
          input.current?.focus();
        }
      }}
    >
      {selected.map((item) => (
        <Chip item={item} what={what} active onToggle={onToggle} key={item} />
      ))}
      <input
        ref={input}
        type="text"
        className="picker-input"
        placeholder={
          selected.length === 0 && items.length > 0
            ? `${what[0].toUpperCase()}${what.slice(1)}, e.g., ${items[0]} ...`
            : ""
        }
        value={text}
        size={Math.max(text.length, selected.length === 0 ? 26 : 2)}
        onChange={(event) => type(event.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && listed.length > 0) {
            event.preventDefault();
            choose(listed[0]);
          } else if (event.key === "Escape") {
            type("");
            input.current?.blur();
          } else if (
            event.key === "Backspace" &&
            text === "" &&
            selected.length > 0
          ) {
            onToggle(selected[selected.length - 1]);
          }
        }}
        aria-label={`Filter by ${what}`}
      />
      {open && listing && (
        <ul className="picker-menu" role="listbox">
          {listed.length === 0 ? (
            <li className="picker-none">
              {items.length === selected.length
                ? `Every ${what} is chosen`
                : `No ${what} matches`}
            </li>
          ) : (
            listed.map((item) => (
              <li
                className="picker-item"
                role="option"
                aria-selected={false}
                // Chosen on mouse down, before the input's blur closes
                // the list.
                onMouseDown={(event) => {
                  event.preventDefault();
                  choose(item);
                }}
                key={item}
              >
                <code className="chip">{item}</code>
              </li>
            ))
          )}
          {matching.length > listed.length && (
            <li className="picker-none">
              and {matching.length - listed.length} more; keep typing
            </li>
          )}
        </ul>
      )}
    </div>
  );
};
