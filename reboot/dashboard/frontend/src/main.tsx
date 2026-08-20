import { useAPI, usePreferences } from "@dashboard/dashboard_rbt_react";
import { useOrderedMap } from "@reboot-dev/reboot-std-api/collections/ordered_map/v1/ordered_map_rbt_react";
import { RebootClientProvider } from "@reboot-dev/reboot-react";
import { Presence } from "@reboot-dev/reboot-std-react/presence";
import {
  FC,
  Fragment,
  StrictMode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createRoot } from "react-dom/client";
import { Group, Panel, Separator, usePanelRef } from "react-resizable-panels";
import {
  HashRouter,
  Link,
  NavLink,
  Navigate,
  Route,
  Routes,
  useParams,
} from "react-router";
import { v4 as uuidv4 } from "uuid";
import { API_ID, CHANGELOG_ID, PREFERENCES_ID, PRESENCE_ID } from "./constants";
import type {
  DataObject,
  Field,
  Method,
  Ref,
  Referrer,
  StateType,
} from "./description";
import {
  dataObjects,
  fieldsOf,
  namespaceOf,
  parseDescription,
  typeNameOf,
} from "./description";
import type { Change } from "./changelog";
import { agoOf, changesOf } from "./changelog";

// One subscriber per tab, for as long as the tab is open.
const SUBSCRIBER_ID = uuidv4();

// What each pill means, for somebody meeting Reboot for the first
// time. A pill whose word is not here, such as a kind this page
// does not know, simply gets no mark and no tooltip.
const DEFINITIONS: Record<string, string> = {
  reader:
    "Reads state without changing it, so any number can safely " +
    "execute concurrently. A reactive caller keeps receiving fresh " +
    "results as the state changes.",
  writer:
    "Changes this state. Writers on one state run one at a time, " +
    "each seeing the result of the one before it.",
  transaction:
    "Changes state, and can call methods on other states with " +
    "every change landing together or none of them landing at all.",
  workflow:
    "A durable background task. It can loop and wait for as long " +
    "as it needs, and after a restart it resumes where it was.",
  factory:
    "Brings a state into existence: it is called with a new id " +
    "rather than on a state that already exists.",
  mcp: "Callable by AI agents as a tool, over the Model Context " + "Protocol.",
  "state type":
    "A durable data type. Each instance, named by an id, has fields " +
    "that Reboot persists for you. Methods are the way to read and " +
    "change them. You can have as many of these as you want.",
  "data type":
    "A type the developer wrote that Reboot does not persist: what a " +
    "method takes, returns or raises, and anything those hold. It " +
    "exists while a call is in flight.",
};

// The gap between a pill and its definition, matching the offset
// `.definition` is placed at.
const DEFINITION_GAP = 8;

// A pill, with its definition a hover away when it has one. The
// small mark is what says there is something to hover.
//
// The definition opens above the pill, where it does not cover the
// row being read, unless the pane has been scrolled to leave no room
// above: the pane clips whatever leaves it, so a pill against its top
// edge would show nothing at all. Then it opens downward instead.
const Pill: FC<{ className: string; label: string; meaning?: string }> = ({
  className,
  label,
  meaning,
}) => {
  const pill = useRef<HTMLSpanElement>(null);
  const [below, setBelow] = useState(false);

  // Measured on the way in rather than on every scroll, since where
  // it opens only matters at the moment it opens. The definition is
  // hidden by `visibility`, so it has a height to read while closed;
  // and the room is measured from the pill rather than from the
  // definition, whose own position is what this decides.
  const place = useCallback(() => {
    const pane = pill.current?.closest(".pane");
    const definition = pill.current?.querySelector(".definition");
    if (pane == null || definition == null) {
      return;
    }
    const room =
      pill.current!.getBoundingClientRect().top -
      pane.getBoundingClientRect().top;
    setBelow(room < definition.getBoundingClientRect().height + DEFINITION_GAP);
  }, []);

  if (meaning === undefined) {
    return <span className={className}>{label}</span>;
  }

  return (
    <span
      ref={pill}
      className={`${className} defined`}
      onPointerEnter={place}
      onFocus={place}
    >
      {label}
      <span className="define-mark" aria-hidden="true">
        ?
      </span>
      <span
        className={below ? "definition below" : "definition"}
        role="tooltip"
      >
        {meaning}
      </span>
    </span>
  );
};

const Kind: FC<{ kind: string }> = ({ kind }) => (
  <Pill
    className={`kind kind-${kind}`}
    label={kind}
    meaning={DEFINITIONS[kind]}
  />
);

// A description, with the spans its author wrote in `backticks`
// rendered as code rather than shown with their backticks. An
// unpaired backtick is kept as text, since it opens nothing.
const Description: FC<{ className: string; text: string }> = ({
  className,
  text,
}) => {
  const parts = text.split("`");
  return (
    <p className={className}>
      {parts.map((part, index) => {
        // `split` alternates text and code, so odd indexes are code,
        // except a last part at an odd index, whose backtick was
        // never closed.
        const unclosed = index === parts.length - 1 && parts.length % 2 === 0;
        if (index % 2 === 1 && !unclosed) {
          return <code key={index}>{part}</code>;
        }
        return <span key={index}>{unclosed ? "`" + part : part}</span>;
      })}
    </p>
  );
};

// Standard-library types an application uses are real and worth being
// able to inspect, but they aren't what the developer wrote, so they
// start collapsed.
const isStandardLibrary = (namespace: string): boolean =>
  namespace.startsWith("rbt.");

// The two indexes of the same API: the state types it declares, and
// the types those declare in turn.
const PAGES = ["changelog", "data", "state"] as const;

type Page = typeof PAGES[number];

const PAGE_NAMES: Record<Page, string> = {
  changelog: "Changelog",
  data: "Data Types",
  state: "State Types",
};

const CHANGES_PER_PAGE = 100;

// Where a type is addressed, on whichever page describes it. It is
// both the route a link goes to and the `id` of the section it lands
// on, so the two can never disagree.
const pathOf = (page: Page, id: string): string => `/${page}/${id}`;

// `NavLink` marks the page being read for us, including while an id
// within it is addressed, and writes the `aria-current` that says so.
const PageSelector: FC<{ counts: Record<Page, number> }> = ({ counts }) => (
  <div className="page-selector">
    {PAGES.map((name) => (
      <NavLink
        className={({ isActive }) =>
          isActive ? "page-link current" : "page-link"
        }
        to={`/${name}`}
        key={name}
      >
        <span className="nav-name">{PAGE_NAMES[name]}</span>
        <span className="nav-count">{counts[name]}</span>
      </NavLink>
    ))}
  </div>
);

// How wide the sidebar is until somebody drags it, and how far it
// can be dragged. The minimum is what a namespace row needs to stay
// readable; the maximum leaves the document its own half of a small
// laptop screen. Plain numbers, which `Panel` reads as pixels.
const NAV_WIDTH = { default: 250, min: 170, max: 520 };

// The sidebar is the first panel of the shell, so that the border
// between it and the document is a `Separator`: dragging it, keeping
// it within bounds, moving it by keyboard and telling assistive
// technology what it does are all that library's, not ours.

const RebootBrand: FC<{ live: boolean }> = ({ live }) => (
  <div className="brand">
    <img className="brand-logo" src="./reboot-logo.svg" alt="Reboot logo" />
    <Connection live={live} />
  </div>
);

const Connection: FC<{ live: boolean }> = ({ live }) => (
  <div className={live ? "connection live" : "connection offline"}>
    {live ? "live" : "offline"}
    <span className="connection-dot" aria-hidden="true" />
  </div>
);

// One row of the sidebar, whichever page it is indexing. Both pages
// reduce to this before anything is drawn, so the sidebar is written
// once rather than once per page.
interface NavEntry {
  id: string;
  name: string;
  namespace: string;
  count: string;
}

const Namespace: FC<{
  namespace: string;
  entries: NavEntry[];
  page: Page;
  noun: string;
}> = ({ namespace, entries, page, noun }) => {
  const [open, setOpen] = useState(!isStandardLibrary(namespace));

  return (
    <div className="namespace">
      <button
        className="namespace-head"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <span className="nav-name namespace-name">
          <span className="caret">{open ? "▾" : "▸"}</span>
          {namespace}
        </span>
        <span className="nav-count">{countOf(entries.length, noun)}</span>
      </button>
      {open && (
        <div className="namespace-types">
          {entries.map((entry) => (
            <Link to={pathOf(page, entry.id)} key={entry.id}>
              <span className="nav-name">{entry.name}</span>
              <span className="nav-count">{entry.count}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

// Grouped by the namespace each belongs to, the developer's own
// first: the standard library is theirs to use but not theirs to
// read.
const byNamespace = (
  entries: NavEntry[]
): { namespace: string; entries: NavEntry[] }[] => {
  const grouped = new Map<string, NavEntry[]>();
  for (const entry of entries) {
    const held = grouped.get(entry.namespace);
    if (held === undefined) {
      grouped.set(entry.namespace, [entry]);
    } else {
      held.push(entry);
    }
  }
  return [...grouped.entries()]
    .map(([namespace, entries]) => ({ namespace, entries }))
    .sort((a, b) => {
      const standard =
        Number(isStandardLibrary(a.namespace)) -
        Number(isStandardLibrary(b.namespace));
      return standard !== 0 ? standard : a.namespace.localeCompare(b.namespace);
    });
};

// A type's fields, one level deep, written the way its author would
// write the type. A field whose type is another of the developer's
// types names it and links to it rather than opening it here: the
// same type is written out once, on the data page, and everything
// that holds it points there.
//
// The `?` goes on the name rather than the type, which is where
// TypeScript puts it and where anyone reading this shape expects it.
const Fields: FC<{ fields: Field[] }> = ({ fields }) => (
  <pre className="type-block">
    <code>
      {"{\n"}
      {fields.map((field) => (
        <Fragment key={field.name}>
          {"  "}
          <span className="key">{field.name}</span>
          {field.optional && <span className="optional">?</span>}
          {": "}
          <TypeName type={field.type} link={field.link} />
          {";"}
          {field.description !== undefined && (
            <span className="comment">{` // ${field.description}`}</span>
          )}
          {"\n"}
        </Fragment>
      ))}
      {"}"}
    </code>
  </pre>
);

// A type as it is written in a row: a link when this dashboard has
// something to show for it, and plain text when it does not, so that
// `string` never looks clickable.
const TypeName: FC<{ type: string; link?: string }> = ({ type, link }) =>
  link === undefined ? (
    <>{type}</>
  ) : (
    <Link className="type-link" to={pathOf("data", link)}>
      {type}
    </Link>
  );

// The keys a request or response carries, one level deep. A key
// whose type is another of the developer's types names that type and
// links to it rather than opening it here, so a signature stays one
// line however deep what it carries goes.
const Keys: FC<{ fields: Field[] }> = ({ fields }) => (
  <>
    {"{ "}
    {fields.map((field, index) => (
      <Fragment key={field.name}>
        {index > 0 && ", "}
        <span className="key">{field.name}</span>
        {": "}
        <TypeName type={field.type} link={field.link} />
        {field.optional && <span className="optional">?</span>}
      </Fragment>
    ))}
    {" }"}
  </>
);

// What a method takes and what it gives back, as one line. The
// errors go under it rather than in it: they are what a call can do
// instead of returning, not part of what it returns.
const Signature: FC<{ stateType: StateType; method: Method }> = ({
  stateType,
  method,
}) => {
  const namespace = namespaceOf(stateType.name);
  const takes =
    method.request === undefined ? [] : fieldsOf(stateType, method.request);
  const returns =
    method.response === undefined ? [] : fieldsOf(stateType, method.response);

  return (
    <div className="method-signature">
      <div>
        {"("}
        {takes.length > 0 && <Keys fields={takes} />}
        {") "}
        <span className="arrow">→</span>{" "}
        {returns.length > 0 ? (
          <Keys fields={returns} />
        ) : (
          <span className="nothing">nothing</span>
        )}
      </div>
      {method.errors.length > 0 && (
        <div className="errors">
          {"raises "}
          {method.errors.map((error, index) => {
            const name = error.$ref.replace("#/$defs/", "");
            return (
              <Fragment key={error.$ref}>
                {index > 0 && ", "}
                <TypeName type={name} link={`${namespace}.${name}`} />
              </Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
};

const Method: FC<{ stateType: StateType; method: Method }> = ({
  stateType,
  method,
}) => {
  return (
    <div className="method" id={`m-${method.name}`}>
      <div className="method-head">
        <div className="method-title">
          <span className="method-name">{method.name}</span>
          {/* The kind first, and always: every method has one, so it
              lands in the same place in every row and the eye can run
              down the column. The tags after it are the exceptions. */}
          <Kind kind={method.kind} />
          {/* One cell for whichever tags a method has, rather than a
              column each: both are optional, so a column each would
              make every method with neither hold that width open
              as dead space. A method that is both a factory and
              an MCP tool draws both, side by side. */}
          <span className="tags">
            {method.factory && (
              <Pill
                className="tag tag-factory"
                label="factory"
                meaning={DEFINITIONS.factory}
              />
            )}
            {method.mcp && (
              <Pill
                className="tag tag-mcp"
                label="MCP"
                meaning={DEFINITIONS.mcp}
              />
            )}
          </span>
        </div>
      </div>
      {/* What the method's own row grows to show. Kept mounted while
          the section is closed, because the animation that opens it
          is a CSS transition on this element rather than a mount. */}
      <div className="method-detail">
        <div className="method-detail-inner">
          {method.description !== undefined && (
            <Description
              className="method-description"
              text={method.description}
            />
          )}
          <Signature stateType={stateType} method={method} />
        </div>
      </div>
    </div>
  );
};

const countOf = (n: number, noun: string): string =>
  `${n} ${n === 1 ? noun : `${noun}s`}`;

// Horizontal only, and deliberately. A pill's sideways move, between
// the column it shares while closed and its own row while open, is a
// layout change that CSS cannot transition, so it is animated here:
// measure where each pill was, let the layout happen, animate it from
// there. Its vertical move is not ours to animate. The detail growing
// is what pushes the methods below it down, and that already animates
// over the same 240ms, so translating them as well would move them
// twice and they would appear to fly in from above or below.
//
// `offsetLeft` rather than `getBoundingClientRect()` because it is a
// layout position and ignores transforms: a render that lands while a
// pill is mid-slide reads where it is going rather than where it
// momentarily is, so the next toggle starts from the truth.
const SLIDE_MS = 240;
const SLIDE_EASING = "cubic-bezier(0.32, 0.72, 0, 1)";

const useSlidingPills = (expanded: boolean) => {
  const section = useRef<HTMLElement>(null);
  const before = useRef(new WeakMap<HTMLElement, number>());
  const wasExpanded = useRef(expanded);

  // No dependency list: every render re-measures, so the positions
  // this animates from are the ones on screen rather than the ones
  // from the last toggle, which a window resize would have moved.
  useLayoutEffect(() => {
    const pills = section.current?.querySelectorAll<HTMLElement>(".kind, .tag");
    if (pills === undefined) {
      return;
    }

    // Only opening or closing moves them; other renders just leave
    // fresh measurements behind for the next one that does.
    const toggled = wasExpanded.current !== expanded;
    wasExpanded.current = expanded;

    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // `forEach` rather than `for...of`: a `NodeList`'s iterator is
    // typed as `Node`, which has no box to measure, while its
    // `forEach` keeps the element type the selector asked for.
    pills.forEach((pill) => {
      const was = before.current.get(pill);
      const now = pill.offsetLeft;
      before.current.set(pill, now);

      if (!toggled || still || was === undefined || was === now) {
        return;
      }

      pill.animate(
        [{ transform: `translateX(${was - now}px)` }, { transform: "none" }],
        { duration: SLIDE_MS, easing: SLIDE_EASING }
      );
    });
  });

  return section;
};

const StateType: FC<{
  stateType: StateType;
  expanded: boolean;
  onToggle: () => void;
}> = ({ stateType, expanded, onToggle }) => {
  const section = useSlidingPills(expanded);
  const fields = fieldsOf(stateType, stateType.state);

  return (
    // Every method's detail opens and closes off this one class, so a
    // section is one transition rather than one per method.
    <section
      ref={section}
      className={expanded ? "state-type is-expanded" : "state-type"}
      id={pathOf("state", stateType.name)}
    >
      <div>
        <Pill
          className="eyebrow"
          label="state type"
          meaning={DEFINITIONS["state type"]}
        />
      </div>
      <div className="state-type-head">
        <div className="state-type-heading">
          <h2>{typeNameOf(stateType.name)}</h2>
          <Anchor page="state" id={stateType.name} />
          <span className="summary-line">
            {countOf(fields.length, "field")} ·{" "}
            {countOf(stateType.methods.length, "method")}
          </span>
        </div>
        <button
          className="expand-button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls={pathOf("state", stateType.name)}
        >
          {/* Down to open, up to close: the caret points the way the
              detail is about to move. */}
          <span className="caret">{expanded ? "▴" : "▾"}</span>
          {expanded ? "Hide details" : "Expand details"}
        </button>
      </div>
      <div className="file">{stateType.file}</div>
      {stateType.description !== undefined && (
        <Description
          className="state-type-description"
          text={stateType.description}
        />
      )}

      <div className="eyebrow section">state</div>
      {fields.length === 0 ? (
        <div className="empty">
          No state fields. The key is the whole state.
        </div>
      ) : (
        <Fields fields={fields} />
      )}

      <div className="eyebrow section">methods</div>
      <div className="methods">
        {stateType.methods.map((method) => (
          <Method stateType={stateType} method={method} key={method.name} />
        ))}
      </div>
    </section>
  );
};

// Whether `rbt dev run` may open a dashboard by itself, and the one
// click that changes the answer.
const Banner: FC<{ suppressed: boolean; onToggle: () => void }> = ({
  suppressed,
  onToggle,
}) => (
  <div className="banner">
    <button className="banner-link" onClick={onToggle}>
      {suppressed
        ? "Open this dashboard on every restart"
        : "Don't reopen this dashboard on restart"}
    </button>
  </div>
);

// A link to the heading it sits beside, so that a type can be sent
// to somebody rather than described over their shoulder. Clicking it
// puts the address in the URL bar, which is where the reader will
// copy it from.
//
// Hidden until the heading is hovered or it is tabbed to: it is an
// affordance rather than something to read, and a column of headings
// each trailing a `#` reads as punctuation.
const Anchor: FC<{ page: Page; id: string }> = ({ page, id }) => (
  <Link className="anchor" to={pathOf(page, id)} aria-label={`Link to ${id}`}>
    #
  </Link>
);

// One of the developer's types, on the data page. Always open: a
// type shown one level deep is short enough that hiding it would
// cost more than it saves.
const DataObjectCard: FC<{
  object: DataObject;
  pageOf: (id: string) => Page;
}> = ({ object, pageOf }) => (
  <section className="state-type" id={pathOf("data", object.id)}>
    <div>
      <Pill
        className="eyebrow"
        label="data type"
        meaning={DEFINITIONS["data type"]}
      />
    </div>
    <div className="state-type-head">
      <div className="state-type-heading">
        <h2>{object.name}</h2>
        <Anchor page="data" id={object.id} />
        <span className="summary-line">
          {countOf(object.fields.length, "field")}
        </span>
      </div>
    </div>
    <div className="file">{object.file}</div>
    {object.description !== undefined && (
      <Description
        className="state-type-description"
        text={object.description}
      />
    )}

    <div className="eyebrow section">fields</div>
    {object.fields.length === 0 ? (
      <div className="empty">No fields.</div>
    ) : (
      <Fields fields={object.fields} />
    )}

    <div className="eyebrow section">used by</div>
    {object.referrers.length === 0 ? (
      <div className="empty">
        Nothing holds this type. It is declared but unused.
      </div>
    ) : (
      <div className="referrers">
        {object.referrers.map((referrer: Referrer) => (
          <Link
            className="referrer"
            to={pathOf(pageOf(referrer.id), referrer.id)}
            key={referrer.label}
          >
            {referrer.label}
          </Link>
        ))}
      </div>
    )}
  </section>
);

const ChangeRow: FC<{ change: Change; now: Date }> = ({ change, now }) => (
  <div className="change">
    <time className="change-when" dateTime={change.at.toISOString()}>
      {agoOf(change.at, now)}
    </time>
    <span className="change-where">{change.namespace}</span>
    {/* Each pill sits in a cell rather than being one, so the cell
        carries the row's spacing and hover fill and the pill carries
        only its colour. */}
    <span className="change-pill-cell">
      <span className={`change-pill change-kind-${change.kind}`}>
        {change.kind}
      </span>
    </span>
    <span className="change-pill-cell">
      <span className={`change-pill change-${change.change}`}>
        {change.change}
      </span>
    </span>
    {/* A removed type no longer has a page to link to. */}
    {change.change === "removed" ? (
      <span className="change-name">{change.name}</span>
    ) : (
      <Link className="change-name" to={pathOf(change.kind, change.id)}>
        {change.name}
      </Link>
    )}
    <span className="change-moved">
      {change.moved?.map((moved, index) => (
        <Fragment key={moved.name}>
          {index > 0 && ", "}
          {`${moved.part} `}
          <span className={`moved moved-${moved.change}`}>{moved.name}</span>
          {` ${moved.change}`}
        </Fragment>
      ))}
    </span>
  </div>
);

// What has happened to the developer's API files while this dashboard
// has been up, newest first.
//
// A page at a time, because a day of editing is a lot of rows and
// this is read from the top.
const ChangelogPage: FC<{ onCount: (n: number) => void; live: boolean }> = ({
  onCount,
  live,
}) => {
  const { useReverseRange } = useOrderedMap({ id: CHANGELOG_ID });
  const [pages, setPages] = useState(1);

  const { response, isLoading, aborted } = useReverseRange({
    // One more than is shown, to learn whether more exist.
    limit: CHANGES_PER_PAGE * pages + 1,
  });

  // An abort means the map does not exist yet: nothing has been
  // recorded, so the changelog is empty.
  const entries = aborted !== undefined ? [] : response?.entries ?? [];
  const changes = changesOf(entries);
  const more = changes.length > CHANGES_PER_PAGE * pages;
  const shown = more ? changes.slice(0, CHANGES_PER_PAGE * pages) : changes;

  useEffect(() => onCount(shown.length), [shown.length, onCount]);

  // Read once per render rather than per row, so every row on the
  // page says "ago" from the same moment.
  const now = new Date();

  if (isLoading && shown.length === 0) {
    return <div className="empty">Reading what has changed…</div>;
  }

  if (shown.length === 0) {
    return (
      <div className="empty">
        Nothing has changed since this dashboard started. Edit an API file and
        it will show up here.
      </div>
    );
  }

  return (
    <>
      {live && (
        <div className="listening">
          Listening<span className="listening-dots">...</span>
        </div>
      )}
      <div className="changes">
        {shown.map((change) => (
          <ChangeRow change={change} now={now} key={change.key} />
        ))}
      </div>
      {more && (
        <button className="expand-button" onClick={() => setPages(pages + 1)}>
          Show older
        </button>
      )}
    </>
  );
};

const Overview: FC<{
  page: Page;
  navWidth: number;
  onNavResizing: (width: number) => void;
  onNavResized: () => void;
  isExpanded: (name: string) => boolean;
  onToggle: (name: string) => void;
}> = ({
  page,
  navWidth,
  onNavResizing,
  onNavResized,
  isExpanded,
  onToggle,
}) => {
  // `defaultSize` is read once, when the panel mounts, and the width
  // the developer left is read from the application after that. So
  // the panel is told again when it arrives, rather than mounted a
  // second time, which would take the page's scroll with it.
  const navPanel = usePanelRef();

  useEffect(() => {
    navPanel.current?.resize(navWidth);
    // Only when the stored width changes, not while it is being
    // dragged: the drag is already moving the panel.
  }, [navWidth, navPanel]);

  const { id: target } = useParams();

  // The dashboard's own state: what it read of the developer's API
  // files. Nothing here reaches the application, so the application
  // does not have to exist.
  const { useGet } = useAPI({ id: API_ID });
  const { response, isLoading } = useGet();

  // `isLoading` is the closest the client offers to a connection
  // state: loading again, having loaded once, means it is retrying.
  const live = !isLoading;

  // What the developer's API files declare. Those exist before the
  // application is generated, built or started, which is why they are
  // what this page shows.
  // The description travels as a `google.protobuf.Value`: the types
  // in it are Pydantic's own JSON Schema, which proto has no business
  // restating.
  const stateTypes: StateType[] = useMemo(
    () => parseDescription(response?.stateTypes?.toJson()),
    [response?.stateTypes]
  );

  // Why any API file could not be read, which is routine while
  // somebody is typing. Shown beside the types, which stay at
  // whatever each file last declared.
  const error = response?.error ?? "";

  const objects = useMemo(() => dataObjects(stateTypes), [stateTypes]);

  // Which page holds a given id, so that a referrer points at the
  // page that has something to show for it.
  const pageOf = useMemo(() => {
    const states = new Set(stateTypes.map((stateType) => stateType.name));
    return (id: string): Page => (states.has(id) ? "state" : "data");
  }, [stateTypes]);

  // The changelog is one list rather than a set of namespaces, so the
  // sidebar has nothing to index.
  const entries: NavEntry[] = useMemo(
    () =>
      page === "changelog"
        ? []
        : page === "state"
        ? stateTypes.map((stateType) => ({
            id: stateType.name,
            name: typeNameOf(stateType.name),
            namespace: namespaceOf(stateType.name),
            count: countOf(stateType.methods.length, "method"),
          }))
        : objects.map((object) => ({
            id: object.id,
            name: object.name,
            namespace: object.namespace,
            count: countOf(object.fields.length, "field"),
          })),
    [page, stateTypes, objects]
  );

  const namespaces = useMemo(() => byNamespace(entries), [entries]);

  // How many changes the changelog page is showing, reported up
  // through `onCount` by the page, which is what reads the entries.
  const [changes, setChanges] = useState(0);

  // The small label over the heading, the first of the two lines
  // above the list.
  const eyebrow = page === "changelog" ? "history" : "application domain";

  // A type page's heading says what its list holds, "3 state types
  // in 2 namespaces"; the changelog's is just the page name.
  const heading =
    page === "changelog"
      ? "Changelog"
      : page === "state"
      ? `${countOf(stateTypes.length, "state type")} in ${countOf(
          namespaces.length,
          "namespace"
        )}`
      : `${countOf(objects.length, "data type")} in ${countOf(
          namespaces.length,
          "namespace"
        )}`;

  // The browser scrolls to a hash it can find, and cannot find one on
  // a page that was not showing when the hash changed. Once the page
  // asked for has rendered, go there.
  useEffect(() => {
    if (target === undefined) {
      return;
    }
    document.getElementById(pathOf(page, target))?.scrollIntoView();
  }, [page, target, stateTypes, objects]);

  // Only before anything has ever been read; afterwards the last
  // shape is shown instead.
  if (isLoading && stateTypes.length === 0) {
    return (
      <main>
        <h1>Reboot application</h1>
        <p className="muted">Reading your API…</p>
      </main>
    );
  }

  if (stateTypes.length === 0) {
    return (
      <main>
        <h1>Reboot application</h1>
        <p className="muted">
          Waiting for your API. Nothing in your API directory declares state
          types yet.
        </p>
        {error && <div className="error">{error}</div>}
      </main>
    );
  }

  const counts: Record<Page, number> = {
    state: stateTypes.length,
    data: objects.length,
    changelog: changes,
  };

  return (
    <Group
      className="shell"
      orientation="horizontal"
      // Only a drag or a resize key, so that mounting with the stored
      // width does not write it straight back.
      onLayoutChanged={(_layout, { isUserInteraction }) => {
        if (isUserInteraction) {
          onNavResized();
        }
      }}
    >
      <Panel
        className="nav-panel"
        panelRef={navPanel}
        defaultSize={navWidth}
        minSize={NAV_WIDTH.min}
        maxSize={NAV_WIDTH.max}
        onResize={({ inPixels }) => onNavResizing(Math.round(inPixels))}
      >
        <nav>
          <RebootBrand live={live} />
          <PageSelector counts={counts} />
          {/* The changelog has none. */}
          {namespaces.length > 0 && <div className="eyebrow">namespaces</div>}
          {namespaces.map(({ namespace, entries }) => (
            <Namespace
              namespace={namespace}
              page={page}
              noun={page === "state" ? "state type" : "data type"}
              entries={entries}
              key={namespace}
            />
          ))}
        </nav>
      </Panel>
      <Separator className="nav-resizer" />
      <Panel className="pane-panel">
        <div className="pane">
          <header>
            <div className="eyebrow">{eyebrow}</div>
            <h1>{heading}</h1>
          </header>
          {error && <div className="error">{error}</div>}
          {page === "changelog" ? (
            <ChangelogPage onCount={setChanges} live={live} />
          ) : page === "state" ? (
            stateTypes.map((stateType) => (
              <StateType
                stateType={stateType}
                expanded={isExpanded(stateType.name)}
                onToggle={() => onToggle(stateType.name)}
                key={stateType.name}
              />
            ))
          ) : objects.length === 0 ? (
            <div className="empty">
              No data types. The state types declare no requests, responses or
              errors yet.
            </div>
          ) : (
            objects.map((object) => (
              <DataObjectCard object={object} pageOf={pageOf} key={object.id} />
            ))
          )}
        </div>
      </Panel>
    </Group>
  );
};

// The preferences are the dashboard application's state: every tab
// shares them, and they outlive the tab they were set in.
const App: FC = () => {
  const { useGet, setSuppressOpenOnRestart, setExpanded, setNavWidth } =
    usePreferences({
      id: PREFERENCES_ID,
    });
  const { response } = useGet();

  // Until the read lands, say what the CLI does when nothing has been
  // written, which is the same thing it does on a false field.
  const suppressed = response?.suppressOpenOnRestart ?? false;

  const stored = useMemo(
    () => new Set(response?.expandedStateTypes ?? []),
    [response?.expandedStateTypes]
  );

  // What the sidebar is showing, which the panel reports as it is
  // dragged and which is recorded when the drag ends. The stored
  // width is what it starts from.
  const navWidth = response?.navWidth ?? NAV_WIDTH.default;
  const resizing = useRef(navWidth);

  const onNavResizing = useCallback((width: number): void => {
    resizing.current = width;
  }, []);

  const onNavResized = useCallback((): void => {
    setNavWidth({ navWidth: resizing.current });
  }, [setNavWidth]);

  // A click that has not yet come back from the application, standing
  // in for the read until it does. Without it a section would sit
  // still for a whole round trip after being clicked, which reads as
  // a dead button rather than as a slow one.
  const [clicked, setClicked] = useState(new Map<string, boolean>());

  // Drop each stand-in once the read agrees with it, so that a later
  // change from another tab is followed rather than held off forever.
  useEffect(() => {
    setClicked((clicked) => {
      const waiting = new Map(
        [...clicked].filter(([name, expanded]) => stored.has(name) !== expanded)
      );
      return waiting.size === clicked.size ? clicked : waiting;
    });
  }, [stored]);

  const isExpanded = useCallback(
    (name: string): boolean => clicked.get(name) ?? stored.has(name),
    [clicked, stored]
  );

  const onToggle = useCallback(
    (name: string): void => {
      const expanded = !isExpanded(name);
      setClicked((clicked) => new Map(clicked).set(name, expanded));
      setExpanded({ stateType: name, expanded });
    },
    [isExpanded, setExpanded]
  );

  return (
    <div className="app">
      <Banner
        suppressed={suppressed}
        onToggle={() =>
          setSuppressOpenOnRestart({ suppressOpenOnRestart: !suppressed })
        }
      />
      <HashRouter>
        <Routes>
          {PAGES.map((page) => (
            <Route
              path={`/${page}/:id?`}
              element={
                <Overview
                  page={page}
                  navWidth={navWidth}
                  onNavResizing={onNavResizing}
                  onNavResized={onNavResized}
                  isExpanded={isExpanded}
                  onToggle={onToggle}
                />
              }
              key={page}
            />
          ))}
          {/* The changelog is the landing page: what just changed is
              what somebody coming back wants to know. */}
          <Route path="*" element={<Navigate to="/changelog" replace />} />
        </Routes>
      </HashRouter>
    </div>
  );
};

const root = document.getElementById("root");

if (root !== null) {
  createRoot(root).render(
    <StrictMode>
      {/* No `url`: the page and its presence are served by the same
          application, so the client uses this page's origin. */}
      <RebootClientProvider offlineCacheEnabled={true}>
        <Presence id={PRESENCE_ID} subscriberId={SUBSCRIBER_ID}>
          <App />
        </Presence>
      </RebootClientProvider>
    </StrictMode>
  );
}
