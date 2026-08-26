import {
  useAPI,
  useImplementation,
  usePreferences,
} from "../../../../rbt/dashboard/v1/dashboard_rbt_react";
import { useOrderedMap } from "@reboot-dev/reboot-std-api/collections/ordered_map/v1/ordered_map_rbt_react";
import { RebootClientProvider } from "@reboot-dev/reboot-react";
import { Presence } from "@reboot-dev/reboot-std-react/presence";
import {
  type FC,
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
import {
  API_ID,
  CHANGELOG_ID,
  IMPLEMENTATION_ID,
  PREFERENCES_ID,
  PRESENCE_ID,
} from "./constants";
import type {
  LinkedDataType,
  Field,
  Method,
  Referrer,
  StateType,
} from "./link_fields_to_data_types";
import {
  linkDataTypes,
  fieldsOfDataType,
  labelOfKind,
  namespaceOfTypeName,
  fieldsOfState,
  shortNameOfTypeName,
} from "./link_fields_to_data_types";
import type { Change } from "./changelog";
import { timeAgo, changesInEntries } from "./changelog";
import { joinStateTypes, reasonToGenerate } from "./callgraph";
import { GraphPage } from "./graph";

// One subscriber per tab, for as long as the tab is open.
const SUBSCRIBER_ID = uuidv4();

// What each pill means, written for a reader new to Reboot. A pill
// whose label is not here gets no mark and no tooltip.
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
    "method takes, returns or raises, and anything those contain. It " +
    "exists while a call is in flight.",
};

// The gap between a pill and its definition. It must equal the `8px`
// that `.definition` in dashboard.css offsets the definition by.
const DEFINITION_GAP = 8;

// A pill that shows its definition on hover, when it has one. The
// mark on the pill tells the reader a definition exists.
//
// The definition opens above the pill so it does not cover the row
// the reader is on. The pane clips content outside it, so when the
// pane is scrolled and there is no room above, the definition opens
// below the pill instead.
const Pill: FC<{ className: string; label: string; meaning?: string }> = ({
  className,
  label,
  meaning,
}) => {
  const pill = useRef<HTMLSpanElement>(null);
  const [below, setBelow] = useState(false);

  // The CSS hides the closed definition with `visibility`, so its
  // height is readable before it opens. The pill's position does not
  // depend on `below`, so measure the room from the pill.
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

const Kind: FC<{ kind: Method["kind"] }> = ({ kind }) => {
  const label = labelOfKind(kind);
  return (
    <Pill
      className={`kind kind-${label}`}
      label={label}
      meaning={DEFINITIONS[label]}
    />
  );
};

// Renders a description, with the spans its author wrote in
// `backticks` as code.
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

// Standard-library types are not what the developer wrote, so the
// page starts them collapsed.
const isStandardLibrary = (namespace: string): boolean =>
  namespace.startsWith("rbt.");

// Each page indexes the same API: `changelog` is its history, `state`
// is the state types it declares, `data` is the types those declare
// in turn, and `graph` is the calls the state types' implementations
// make to each other.
const PAGES = ["changelog", "data", "state", "graph"] as const;

type Page = typeof PAGES[number];

const PAGE_NAMES: Record<Page, string> = {
  changelog: "Changelog",
  data: "Data Types",
  state: "State Types",
  graph: "Call Graph",
};

const CHANGES_PER_PAGE = 100;

// Both the route a link to a type goes to and the `id` of the section
// it lands on, so the two can never disagree.
const pathOfTypeOnPage = (page: Page, id: string): string => `/${page}/${id}`;

// `NavLink` is active when the route is this page or an id within it
// (a `pathOfTypeOnPage` route), and sets `aria-current` itself.
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

// Pixels, which is how `Panel` reads plain numbers. The minimum is the
// narrowest width at which a namespace row stays readable; the maximum
// leaves the document half of a small laptop screen.
const NAV_WIDTH = { default: 250, min: 170, max: 520 };

// The sidebar is the first panel of the shell so that the border
// between it and the document is a `Separator`, which the library
// drags, keeps within bounds, moves by keyboard and describes to
// assistive technology.

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

// One row of the sidebar. The state and data pages each map their
// types to this, so one sidebar renders either page's list.
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
        <span className="nav-count">{countWithNoun(entries.length, noun)}</span>
      </button>
      {open && (
        <div className="namespace-types">
          {entries.map((entry) => (
            <Link to={pathOfTypeOnPage(page, entry.id)} key={entry.id}>
              <span className="nav-name">{entry.name}</span>
              <span className="nav-count">{entry.count}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

// The developer's namespaces sort before the standard library's: the
// developer wrote their own types and only references the standard
// ones.
const groupByNamespace = (
  entries: NavEntry[]
): { namespace: string; entries: NavEntry[] }[] => {
  const grouped = new Map<string, NavEntry[]>();
  for (const entry of entries) {
    const group = grouped.get(entry.namespace);
    if (group === undefined) {
      grouped.set(entry.namespace, [entry]);
    } else {
      group.push(entry);
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

// A type's fields, one level deep, as a TypeScript type literal. A
// field whose type is another of the developer's types names it and
// links to it: each type is written out once, on the data page, and
// every field that contains it points there.
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

// A type as it appears in a row: a link to its page when it has one,
// plain text (for `string` and the other built-ins) when it does not.
const TypeName: FC<{ type: string; link?: string }> = ({ type, link }) =>
  link === undefined ? (
    <>{type}</>
  ) : (
    <Link className="type-link" to={pathOfTypeOnPage("data", link)}>
      {type}
    </Link>
  );

// The keys of a request or response, one level deep: a key whose type
// is one of the developer's types names and links to that type, so a
// signature stays one line no matter how deeply the types nest.
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

const Signature: FC<{ stateType: StateType; method: Method }> = ({
  stateType,
  method,
}) => {
  const namespace = namespaceOfTypeName(stateType.name);
  const takes =
    method.request === undefined
      ? []
      : fieldsOfDataType(stateType, method.request);
  const returns =
    method.response === undefined
      ? []
      : fieldsOfDataType(stateType, method.response);

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
          {method.errors.map((name, index) => (
            <Fragment key={name}>
              {index > 0 && ", "}
              <TypeName type={name} link={`${namespace}.${name}`} />
            </Fragment>
          ))}
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
          {/* The kind comes before the tags because every method has
              one, so it sits in the same column in every row. The tags
              are optional. */}
          <Kind kind={method.kind} />
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
      {/* The detail that opening the section reveals. The page renders
          it while the section is closed too: opening is a CSS
          transition on this element, not a mount. */}
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

const countWithNoun = (n: number, noun: string): string =>
  `${n} ${n === 1 ? noun : `${noun}s`}`;

// Horizontal only. Closed, every method's pills share one column;
// open, each sits in its own row. CSS cannot transition that layout
// change, so this hook animates it: it records each pill's
// `offsetLeft` on every render and, on a toggle, translates the pill
// from its old position to its new one. Vertical movement comes from
// the `.method-detail` transition in dashboard.css, whose duration
// and easing SLIDE_MS and SLIDE_EASING match.
//
// `offsetLeft` ignores transforms, so a render that lands while a
// pill is mid-slide measures where the pill will end up, and the next
// toggle starts from there.
const SLIDE_MS = 240;
const SLIDE_EASING = "cubic-bezier(0.32, 0.72, 0, 1)";

const useSlidingPills = (expanded: boolean) => {
  const section = useRef<HTMLElement>(null);
  const before = useRef(new WeakMap<HTMLElement, number>());
  const wasExpanded = useRef(expanded);

  // Runs after every render so the positions the slide starts from are
  // the ones on screen, not the ones measured at the last toggle, which
  // a window resize would have moved since.
  useLayoutEffect(() => {
    const pills = section.current?.querySelectorAll<HTMLElement>(".kind, .tag");
    if (pills === undefined) {
      return;
    }

    const toggled = wasExpanded.current !== expanded;
    wasExpanded.current = expanded;

    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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
  const fields = fieldsOfState(stateType);

  return (
    // The stylesheet opens and closes every method's detail from this
    // class, so the whole section is one transition.
    <section
      ref={section}
      className={expanded ? "state-type is-expanded" : "state-type"}
      id={pathOfTypeOnPage("state", stateType.name)}
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
          <h2>{shortNameOfTypeName(stateType.name)}</h2>
          <Anchor page="state" id={stateType.name} />
          <span className="summary-line">
            {countWithNoun(fields.length, "field")} ·{" "}
            {countWithNoun(stateType.methods.length, "method")}
          </span>
        </div>
        <button
          className="expand-button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls={pathOfTypeOnPage("state", stateType.name)}
        >
          {/* The caret points in the direction the details move on click:
              down when they expand, up when they collapse. */}
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

// The toggle for whether `rbt dev run` opens the dashboard by itself.
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

// A link to the heading beside it, so the reader can share a URL to a
// type. Clicking it puts the address in the URL bar, where the reader
// copies it from.
//
// The CSS hides it until the heading is hovered or the link is tabbed
// to: a column of headings each trailing a `#` reads as punctuation.
const Anchor: FC<{ page: Page; id: string }> = ({ page, id }) => (
  <Link
    className="anchor"
    to={pathOfTypeOnPage(page, id)}
    aria-label={`Link to ${id}`}
  >
    #
  </Link>
);

// Unlike a StateTypeCard, never collapsed: a type shown one level
// deep is short enough that a collapse control would save little
// space.
const LinkedDataTypeCard: FC<{
  linkedDataType: LinkedDataType;
  pageOfTypeId: (id: string) => Page;
}> = ({ linkedDataType, pageOfTypeId }) => (
  <section
    className="state-type"
    id={pathOfTypeOnPage("data", linkedDataType.id)}
  >
    <div>
      <Pill
        className="eyebrow"
        label="data type"
        meaning={DEFINITIONS["data type"]}
      />
    </div>
    <div className="state-type-head">
      <div className="state-type-heading">
        <h2>{linkedDataType.name}</h2>
        <Anchor page="data" id={linkedDataType.id} />
        <span className="summary-line">
          {countWithNoun(linkedDataType.fields.length, "field")}
        </span>
      </div>
    </div>
    <div className="file">{linkedDataType.file}</div>
    {linkedDataType.description !== undefined && (
      <Description
        className="state-type-description"
        text={linkedDataType.description}
      />
    )}

    <div className="eyebrow section">fields</div>
    {linkedDataType.fields.length === 0 ? (
      <div className="empty">No fields.</div>
    ) : (
      <Fields fields={linkedDataType.fields} />
    )}

    <div className="eyebrow section">used by</div>
    {linkedDataType.referrers.length === 0 ? (
      <div className="empty">
        Nothing contains this type. It is declared but unused.
      </div>
    ) : (
      <div className="referrers">
        {linkedDataType.referrers.map((referrer: Referrer) => (
          <Link
            className="referrer"
            to={pathOfTypeOnPage(pageOfTypeId(referrer.id), referrer.id)}
            key={referrer.label}
          >
            {referrer.label}
          </Link>
        ))}
      </div>
    )}
  </section>
);

// The page a change links to: none once the type is removed, and
// none for a `kind` this page does not know.
const pageOfChange = (change: Change): Page | undefined =>
  change.change === "removed"
    ? undefined
    : change.kind === "state" || change.kind === "data"
    ? change.kind
    : undefined;

const ChangeRow: FC<{ change: Change; now: Date }> = ({ change, now }) => {
  const page = pageOfChange(change);
  return (
    <div className="change">
      <time className="change-when" dateTime={change.at.toISOString()}>
        {timeAgo(change.at, now)}
      </time>
      <span className="change-where">{change.namespace}</span>
      {/* The wrapper, not the pill, is the grid cell: the row's padding
        and hover fill apply to it, and the pill's background covers
        only the pill. */}
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
      {page === undefined ? (
        <span className="change-name">{change.name}</span>
      ) : (
        <Link className="change-name" to={pathOfTypeOnPage(page, change.id)}>
          {change.name}
        </Link>
      )}
      <span className="change-changed-parts">
        {change.changedParts?.map((changedPart, index) => (
          <Fragment key={changedPart.name}>
            {index > 0 && ", "}
            {`${changedPart.part} `}
            <span className={`changed-part changed-part-${changedPart.change}`}>
              {changedPart.name}
            </span>
            {` ${changedPart.change}`}
          </Fragment>
        ))}
      </span>
    </div>
  );
};

// Changes to the developer's API files since this dashboard started,
// newest first. Paged, because a day of editing produces many rows
// and the reader starts at the top.
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

  // The read aborts when the map does not exist, and it does not exist
  // until the first change is recorded.
  const entries = aborted !== undefined ? [] : response?.entries ?? [];
  const changes = changesInEntries(entries);
  const more = changes.length > CHANGES_PER_PAGE * pages;
  const shown = more ? changes.slice(0, CHANGES_PER_PAGE * pages) : changes;

  useEffect(() => onCount(shown.length), [shown.length, onCount]);

  // Every row on the page measures "ago" from this same moment.
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
  // `Panel` reads `defaultSize` once, when it mounts, and the stored
  // width arrives from the application later. The effect below resizes
  // the panel through its ref when that width arrives.
  const navPanel = usePanelRef();

  useEffect(() => {
    navPanel.current?.resize(navWidth);
    // Runs only when the stored width changes, not while the developer
    // drags: the drag already moves the panel.
  }, [navWidth, navPanel]);

  const { id: target } = useParams();

  // The dashboard's own state: what it read of the developer's API
  // files. Nothing here calls the developer's application, so the
  // application does not have to exist.
  const { useGet } = useAPI({ id: API_ID });
  const { response, isLoading } = useGet();

  // The client exposes no connection state. `isLoading` is the
  // nearest: once it has loaded, loading again means the client is
  // retrying.
  const live = !isLoading;

  // The state types the developer's API files declare, which exist
  // before the application is generated, built or started, so this
  // page can show them without an application.
  const stateTypes: StateType[] = useMemo(
    () => response?.stateTypes ?? [],
    [response?.stateTypes]
  );

  // Why any API file could not be read, which is routine while the
  // developer is typing. The page shows it beside the types, which
  // stay at whatever each file last declared.
  const error = response?.error ?? "";

  // What the dashboard read of the developer's application: the
  // Reboot calls each servicer's methods make. Nothing until the
  // analysis has run, and for a Node.js application, which it does
  // not read.
  const { useGet: useGetImplementation } = useImplementation({
    id: IMPLEMENTATION_ID,
  });
  const { response: implementation } = useGetImplementation();

  const servicers = useMemo(
    () => implementation?.servicers ?? [],
    [implementation?.servicers]
  );

  const graphStateTypes = useMemo(
    () => joinStateTypes(stateTypes, servicers),
    [stateTypes, servicers]
  );

  const generateReason = useMemo(
    () =>
      response === undefined || implementation === undefined
        ? undefined
        : reasonToGenerate(
            stateTypes,
            response.files,
            implementation.generated
          ),
    [response, implementation, stateTypes]
  );

  const linkedDataTypes = useMemo(
    () => linkDataTypes(stateTypes),
    [stateTypes]
  );

  // A referrer is either a state type or a data type, and its link
  // must open the page that lists it.
  const pageOfTypeId = useMemo(() => {
    const states = new Set(stateTypes.map((stateType) => stateType.name));
    return (id: string): Page => (states.has(id) ? "state" : "data");
  }, [stateTypes]);

  // The changelog is one list rather than a set of namespaces, and
  // the graph is one canvas, so the sidebar has nothing to index.
  const entries: NavEntry[] = useMemo(
    () =>
      page === "changelog" || page === "graph"
        ? []
        : page === "state"
        ? stateTypes.map((stateType) => ({
            id: stateType.name,
            name: shortNameOfTypeName(stateType.name),
            namespace: namespaceOfTypeName(stateType.name),
            count: countWithNoun(stateType.methods.length, "method"),
          }))
        : linkedDataTypes.map((linkedDataType) => ({
            id: linkedDataType.id,
            name: linkedDataType.name,
            namespace: linkedDataType.namespace,
            count: countWithNoun(linkedDataType.fields.length, "field"),
          })),
    [page, stateTypes, linkedDataTypes]
  );

  const namespaces = useMemo(() => groupByNamespace(entries), [entries]);

  // How many changes the changelog page is showing. The page reports
  // it through `onCount`, since the page is what reads the entries.
  const [changes, setChanges] = useState(0);

  // How many calls the graph page is drawing, reported the same way.
  const [calls, setCalls] = useState(0);

  const eyebrow = page === "changelog" ? "history" : "application domain";

  const heading =
    page === "changelog"
      ? "Changelog"
      : page === "graph"
      ? `${countWithNoun(calls, "call")} between ${countWithNoun(
          graphStateTypes.length,
          "state type"
        )}`
      : page === "state"
      ? `${countWithNoun(stateTypes.length, "state type")} in ${countWithNoun(
          namespaces.length,
          "namespace"
        )}`
      : `${countWithNoun(
          linkedDataTypes.length,
          "data type"
        )} in ${countWithNoun(namespaces.length, "namespace")}`;

  // The browser scrolls to the element the URL hash names only if it
  // exists when the hash changes, and it does not exist on a page that
  // was not showing then. Once that page has rendered, scroll to it.
  useEffect(() => {
    if (target === undefined) {
      return;
    }
    document.getElementById(pathOfTypeOnPage(page, target))?.scrollIntoView();
  }, [page, target, stateTypes, linkedDataTypes]);

  // Only until the first read; while reloading, `response` keeps the
  // types last read, so the page shows those instead.
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
    data: linkedDataTypes.length,
    changelog: changes,
    graph: calls,
  };

  return (
    <Group
      className="shell"
      orientation="horizontal"
      // The layout also changes when the panel mounts with the stored
      // width; only a drag or a resize key writes the width back.
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
        <div className={page === "graph" ? "pane graph-pane" : "pane"}>
          <header>
            <div className="eyebrow">{eyebrow}</div>
            <h1>{heading}</h1>
          </header>
          {error && <div className="error">{error}</div>}
          {page === "changelog" ? (
            <ChangelogPage onCount={setChanges} live={live} />
          ) : page === "graph" ? (
            <>
              {generateReason === "missing" ? (
                <p className="graph-note muted">
                  Your application imports generated code that does not exist
                  yet, so its calls cannot be read. Run{" "}
                  <code>rbt generate</code>.
                </p>
              ) : generateReason === "older" ? (
                <p className="graph-note muted">
                  Your API files are newer than your generated code, so the
                  calls drawn may be out of date. Run <code>rbt generate</code>.
                </p>
              ) : generateReason === "same" ? (
                <p className="graph-note muted">
                  Your API files and generated code were last modified at the
                  same time, so the calls drawn may be out of date. If you
                  changed an API, run <code>rbt generate</code>.
                </p>
              ) : null}
              {/* With a module `missing`, no servicer resolves. */}
              {generateReason !== "missing" &&
              implementation !== undefined &&
              servicers.length === 0 ? (
                <p className="graph-note muted">
                  No servicers found, so no calls are drawn. The dashboard reads
                  the Python application your <code>.rbtrc</code> names with{" "}
                  <code>dev run --application=</code>.
                </p>
              ) : null}
              <GraphPage stateTypes={graphStateTypes} onCount={setCalls} />
            </>
          ) : page === "state" ? (
            stateTypes.map((stateType) => (
              <StateType
                stateType={stateType}
                expanded={isExpanded(stateType.name)}
                onToggle={() => onToggle(stateType.name)}
                key={stateType.name}
              />
            ))
          ) : linkedDataTypes.length === 0 ? (
            <div className="empty">
              No data types. The state types declare no requests, responses or
              errors yet.
            </div>
          ) : (
            linkedDataTypes.map((linkedDataType) => (
              <LinkedDataTypeCard
                linkedDataType={linkedDataType}
                pageOfTypeId={pageOfTypeId}
                key={linkedDataType.id}
              />
            ))
          )}
        </div>
      </Panel>
    </Group>
  );
};

// The preferences are the dashboard application's state: every tab
// reads the same ones, and they persist after the tab that set them
// closes.
const App: FC = () => {
  const { useGet, setSuppressOpenOnRestart, setExpanded, setNavWidth } =
    usePreferences({
      id: PREFERENCES_ID,
    });
  const { response } = useGet();

  // Before the read returns, the page treats the preference as the
  // CLI treats an unwritten one: as false.
  const suppressed = response?.suppressOpenOnRestart ?? false;

  const stored = useMemo(
    () => new Set(response?.expandedStateTypes ?? []),
    [response?.expandedStateTypes]
  );

  const navWidth = response?.navWidth ?? NAV_WIDTH.default;
  const resizing = useRef(navWidth);

  const onNavResizing = useCallback((width: number): void => {
    resizing.current = width;
  }, []);

  const onNavResized = useCallback((): void => {
    setNavWidth({ navWidth: resizing.current });
  }, [setNavWidth]);

  // The expanded state of each click that the read does not yet
  // reflect; it overrides the stored value so the section responds
  // to the click before the round trip completes.
  const [clicked, setClicked] = useState(new Map<string, boolean>());

  // Drop each stand-in once the read agrees with it. isExpanded prefers
  // the stand-in, so a stale one would hide a later change from another
  // tab.
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
          {/* A developer returning to the dashboard wants to know what
              just changed. */}
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
      {/* No `url`: the application that serves this page also serves
          Presence, so the client defaults to this page's origin. */}
      <RebootClientProvider offlineCacheEnabled={true}>
        <Presence id={PRESENCE_ID} subscriberId={SUBSCRIBER_ID}>
          <App />
        </Presence>
      </RebootClientProvider>
    </StrictMode>
  );
}
