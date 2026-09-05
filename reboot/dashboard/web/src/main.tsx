import {
  useDashboard,
  usePreferences,
} from "../../../../rbt/dashboard/v1/dashboard_rbt_react";
import { useOrderedMap } from "@reboot-dev/reboot-std-api/collections/ordered_map/v1/ordered_map_rbt_react";
import { RebootClientProvider } from "@reboot-dev/reboot-react";
import { Presence } from "@reboot-dev/reboot-std-react/presence";
import {
  type CSSProperties,
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
  useLocation,
  useNavigate,
  useNavigationType,
  useParams,
} from "react-router";
import { v4 as uuidv4 } from "uuid";
import {
  DASHBOARD_ID,
  CHANGELOG_ID,
  PREFERENCES_ID,
  PRESENCE_ID,
} from "./constants";
import type * as api_pb from "../../../../rbt/v1alpha1/api/api_pb";
import type * as dashboard_pb from "../../../../rbt/dashboard/v1/dashboard_pb";
import type {
  FeatureEntry,
  Features,
  Printed,
  Span,
  StepLinks,
} from "./behaviors";
import {
  columnsOfExamples,
  hueKeyOfSpan,
  hueKeyOfVariable,
  huesOfScenario,
  linkOfCodeSpan,
  linkOfMethod,
  printBuiltInSyntax,
  recordingUrl,
  scenariosOfFeature,
  sortedFeatures,
  spansOfText,
  stepLinks,
} from "./behaviors";
import type {
  APIs,
  LinkedDataType,
  Property,
  Kind,
  Referrer,
} from "./link_properties_to_data_types";
import {
  dataTypeIdOfName,
  kindOfMethod,
  linkDataTypes,
  propertiesOfDataType,
  labelOfKind,
  propertiesOfState,
  qualifiedName,
  shortNameOfTypeName,
  sortedAPIs,
} from "./link_properties_to_data_types";
import type { Entry } from "./changelog";
import {
  entriesOfRange,
  labelOfChangeKind,
  rowOfChange,
  timeAgo,
} from "./changelog";
import { DashboardGetResponse_NeedsGenerateReason as NeedsGenerateReason } from "../../../../rbt/dashboard/v1/dashboard_pb";
import type * as feature_pb from "../../../../rbt/v1alpha1/bdd/feature_pb";
import type * as grammar_pb from "../../../../rbt/v1alpha1/bdd/grammar_pb";
import { joinStateTypes } from "./callgraph";
import { drawnCallCount, GraphPage } from "./graph";

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
    "A durable data type. Each instance, named by an id, has properties " +
    "that Reboot persists for you. Methods are the way to read and " +
    "change them. You can have as many of these as you want.",
  "data type":
    "A type the developer wrote that Reboot does not persist: what a " +
    "method takes, returns or raises, and anything those contain. It " +
    "exists while a call is in flight.",
  feature:
    "One .feature file: scenarios written in Gherkin that describe " +
    "how the application behaves, and run as tests.",
  rule:
    "One business rule of the feature, illustrated by the " +
    "scenarios grouped under it.",
  scenario:
    "One example of how the application behaves. Its steps run in " +
    "order as one test.",
  background:
    "The steps every scenario in this group begins with, run before " +
    "the scenario's own.",
};

// The gap between a pill and its definition. It must equal the `8px`
// that `.definition` in dashboard.css offsets the definition by.
const DEFINITION_GAP = 8;

// A pill that shows its definition on hover, when it has one. The
// mark on the pill tells the reader a definition exists; a label
// set as an eyebrow leaves the mark off, since a row of eyebrows
// each trailing a mark reads as clutter.
//
// The definition opens above the pill so it does not cover the row
// the reader is on. The pane clips content outside it, so when the
// pane is scrolled and there is no room above, the definition opens
// below the pill instead.
const Pill: FC<{
  className: string;
  label: string;
  meaning?: string;
  mark?: boolean;
}> = ({ className, label, meaning, mark = true }) => {
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
      {mark && (
        <span className="define-mark" aria-hidden="true">
          ?
        </span>
      )}
      <span
        className={below ? "definition below" : "definition"}
        role="tooltip"
      >
        {meaning}
      </span>
    </span>
  );
};

const Kind: FC<{ kind: Kind | undefined }> = ({ kind }) => {
  const label = kind === undefined ? "unspecified" : labelOfKind(kind);
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
const isStandardLibrary = (packageName: string): boolean =>
  packageName.startsWith("rbt.");

// Each page indexes the same application: `changelog` is its history,
// `state` is the state types its API declares, `data` is the types
// those declare in turn, `behaviors` is the scenarios its `.feature`
// files describe, and `graph` is the calls the state types'
// implementations make to each other.
const PAGES = ["changelog", "data", "state", "behaviors", "graph"] as const;

type Page = typeof PAGES[number];

const PAGE_NAMES: Record<Page, string> = {
  changelog: "Changelog",
  data: "Data Types",
  state: "State Types",
  behaviors: "Behaviors",
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
// narrowest width at which a package row stays readable; the maximum
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
  package: string;
  count: string;
}

const Package: FC<{
  package: string;
  entries: NavEntry[];
  page: Page;
  noun: string;
}> = ({ package: name, entries, page, noun }) => {
  const [open, setOpen] = useState(!isStandardLibrary(name));

  return (
    <div className="package">
      <button
        className="package-head"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <span className="nav-name package-name">
          <span className="caret">{open ? "▾" : "▸"}</span>
          {name}
        </span>
        <span className="nav-count">{countWithNoun(entries.length, noun)}</span>
      </button>
      {open && (
        <div className="package-types">
          {entries.map((entry) => (
            <Link
              to={pathOfTypeOnPage(page, entry.id)}
              title={entry.name}
              key={entry.id}
            >
              <span className="nav-name">{entry.name}</span>
              <span className="nav-count">{entry.count}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
};

// The developer's packages sort before the standard library's: the
// developer wrote their own types and only references the standard
// ones.
const groupByPackage = (
  entries: NavEntry[]
): { package: string; entries: NavEntry[] }[] => {
  const grouped = new Map<string, NavEntry[]>();
  for (const entry of entries) {
    const group = grouped.get(entry.package);
    if (group === undefined) {
      grouped.set(entry.package, [entry]);
    } else {
      group.push(entry);
    }
  }
  return [...grouped.entries()]
    .map(([name, entries]) => ({ package: name, entries }))
    .sort((a, b) => {
      const standard =
        Number(isStandardLibrary(a.package)) -
        Number(isStandardLibrary(b.package));
      return standard !== 0 ? standard : a.package.localeCompare(b.package);
    });
};

// A type's properties, one level deep, as a TypeScript type literal. A
// property whose type is another of the developer's types names it and
// links to it: each type is written out once, on the data page, and
// every property that contains it points there.
const Properties: FC<{ properties: Property[] }> = ({ properties }) => (
  <pre className="type-block">
    <code>
      {"{\n"}
      {properties.map((property) => (
        <Fragment key={property.name}>
          {"  "}
          <span className="key">{property.name}</span>
          {property.optional && <span className="optional">?</span>}
          {": "}
          <TypeName type={property.type} link={property.link} />
          {";"}
          {(property.description !== undefined ||
            property.constraints !== undefined ||
            property.deprecated) && (
            <span className="comment">
              {` // ${[
                property.deprecated ? "deprecated" : undefined,
                property.description,
                property.constraints,
              ]
                .filter((part) => part !== undefined)
                .join("; ")}`}
            </span>
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
const Keys: FC<{ properties: Property[] }> = ({ properties }) => (
  <>
    {"{ "}
    {properties.map((property, index) => (
      <Fragment key={property.name}>
        {index > 0 && ", "}
        <span className="key">{property.name}</span>
        {": "}
        <TypeName type={property.type} link={property.link} />
        {property.optional && <span className="optional">?</span>}
      </Fragment>
    ))}
    {" }"}
  </>
);

const Signature: FC<{
  api: api_pb.API;
  method: api_pb.Method;
}> = ({ api, method }) => {
  const takes =
    method.request === undefined
      ? []
      : propertiesOfDataType({ api, name: method.request.name });
  const returns =
    method.response === undefined
      ? []
      : propertiesOfDataType({ api, name: method.response.name });

  return (
    <div className="method-signature">
      <div>
        {"("}
        {takes.length > 0 && <Keys properties={takes} />}
        {") "}
        <span className="arrow">→</span>{" "}
        {returns.length > 0 ? (
          <Keys properties={returns} />
        ) : (
          <span className="nothing">nothing</span>
        )}
      </div>
      {method.errors.length > 0 && (
        <div className="errors">
          {"raises "}
          {method.errors.map(({ name }, index) => (
            <Fragment key={name}>
              {index > 0 && ", "}
              <TypeName
                type={shortNameOfTypeName(name)}
                link={dataTypeIdOfName({ api, name })}
              />
            </Fragment>
          ))}
        </div>
      )}
    </div>
  );
};

const Method: FC<{
  api: api_pb.API;
  method: api_pb.Method;
  // The method's id on the page, `/state/bank.v1.Account.deposit`,
  // which is what a link from the graph names.
  id: string;
  expanded: boolean;
  onToggle: () => void;
}> = ({ api, method, id, expanded, onToggle }) => {
  return (
    <div className={expanded ? "method is-expanded" : "method"} id={id}>
      <div
        className="method-head"
        onClick={onToggle}
        role="button"
        aria-expanded={expanded}
      >
        <div className="method-title">
          <span className="method-caret caret">{expanded ? "▾" : "▸"}</span>
          <span className="method-name">{method.name}</span>
          {/* The kind comes before the tags because every method has
              one, so it sits in the same column in every row. The tags
              are optional. */}
          <Kind kind={kindOfMethod(method)} />
          <span className="tags">
            {method.factory && (
              <Pill
                className="tag tag-factory"
                label="factory"
                meaning={DEFINITIONS.factory}
              />
            )}
            {method.mcp !== undefined && (
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
          <Signature api={api} method={method} />
          {method.description !== undefined && (
            <Description
              className="method-description"
              text={method.description}
            />
          )}
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

const useSlidingPills = (expanded: string) => {
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
  api: api_pb.API;
  stateType: api_pb.StateType;
  isMethodExpanded: (method: string) => boolean;
  onToggleMethods: (methods: string[], expanded: boolean) => void;
}> = ({ api, stateType, isMethodExpanded, onToggleMethods }) => {
  const section = useSlidingPills(
    stateType.methods.map((method) => isMethodExpanded(method.name)).join(":")
  );
  const name = qualifiedName({ api, stateType });
  const properties = propertiesOfState({ api, stateType });

  // The section's own caret is open only when every method is:
  // closing any single one closes it, so that clicking it opens
  // everything again.
  const allExpanded =
    stateType.methods.length > 0 &&
    stateType.methods.every((method) => isMethodExpanded(method.name));

  return (
    // The stylesheet opens and closes every method's detail from this
    // class, so the whole section is one transition.
    <section
      ref={section}
      className="state-type"
      id={pathOfTypeOnPage("state", name)}
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
          <h2>{stateType.name}</h2>
          <Anchor page="state" id={name} />
          <span className="summary-line">
            {countWithNoun(properties.length, "property")} ·{" "}
            {countWithNoun(stateType.methods.length, "method")}
          </span>
        </div>
      </div>
      <div className="file">{api.filename}</div>
      {stateType.description !== undefined && (
        <Description
          className="state-type-description"
          text={stateType.description}
        />
      )}

      <div className="eyebrow section">state</div>
      {properties.length === 0 ? (
        <div className="empty">
          No state properties. The key is the whole state.
        </div>
      ) : (
        <Properties properties={properties} />
      )}

      <button
        className="eyebrow section section-toggle"
        onClick={() =>
          onToggleMethods(
            stateType.methods.map((method) => method.name),
            !allExpanded
          )
        }
        aria-expanded={allExpanded}
      >
        <span className="caret">{allExpanded ? "▾" : "▸"}</span>
        methods
      </button>
      <div className="methods">
        {stateType.methods.map((method) => (
          <Method
            api={api}
            method={method}
            id={pathOfTypeOnPage("state", `${name}.${method.name}`)}
            expanded={isMethodExpanded(method.name)}
            onToggle={() =>
              onToggleMethods([method.name], !isMethodExpanded(method.name))
            }
            key={method.name}
          />
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
          {countWithNoun(linkedDataType.properties.length, "property")}
        </span>
      </div>
    </div>
    <div className="file">{linkedDataType.filename}</div>
    {linkedDataType.description !== undefined && (
      <Description
        className="state-type-description"
        text={linkedDataType.description}
      />
    )}

    <div className="eyebrow section">properties</div>
    {linkedDataType.properties.length === 0 ? (
      <div className="empty">No properties.</div>
    ) : (
      <Properties properties={linkedDataType.properties} />
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

// A custom step, one the application defines itself, which the
// grammar cannot parse: its text with the spans its author wrote in
// `backticks` as code, a span naming a state type or a method linking
// to it on the state page, and each `<variable>` set in its hue.
const CustomStep: FC<{
  text: string;
  links: StepLinks;
  related: Related;
}> = ({ text, links, related }) => {
  const parts = text.split("`");
  return (
    <>
      {parts.map((part, index) => {
        // `split` alternates text and code, so odd indexes are code,
        // except a last part at an odd index, whose backtick was
        // never closed.
        const unclosed = index === parts.length - 1 && parts.length % 2 === 0;
        if (index % 2 === 1 && !unclosed) {
          const link = linkOfCodeSpan(part, text, links);
          return link === undefined ? (
            <code key={index}>{part}</code>
          ) : (
            <Link
              className="type-link"
              to={pathOfTypeOnPage("state", link)}
              key={index}
            >
              <code>{part}</code>
            </Link>
          );
        }
        return (
          <Fragment key={index}>
            {spansOfText(unclosed ? "`" + part : part, "text").map(
              (span, spanIndex) => (
                <SpanText
                  span={span}
                  stateType={undefined}
                  links={links}
                  related={related}
                  key={spanIndex}
                />
              )
            )}
          </Fragment>
        );
      })}
    </>
  );
};

// A step's data table, or an examples table with its header row
// first. An examples table's columns are variables: each header cell
// is set in the column's hue and lights up with every `<name>` saying
// it, and the cells under it light up too.
const GherkinTable: FC<{
  table: feature_pb.Table;
  examples?: Related;
}> = ({ table, examples }) => {
  const columns = table.rows[0]?.cells ?? [];
  return (
    <table className="gherkin-table">
      <tbody>
        {table.rows.map((row, index) => (
          <tr key={index}>
            {row.cells.map((cell, cellIndex) => {
              if (examples === undefined) {
                return <td key={cellIndex}>{cell}</td>;
              }
              const key = hueKeyOfVariable(columns[cellIndex] ?? "");
              const isRelated = examples.key === key;
              if (index === 0) {
                return (
                  <td key={cellIndex}>
                    <code
                      className={
                        isRelated
                          ? "span span-variable is-related"
                          : "span span-variable"
                      }
                      style={
                        { "--hue": examples.hues.get(key) } as CSSProperties
                      }
                      onPointerEnter={() => examples.onRelate(key)}
                      onPointerLeave={() => examples.onRelate(null)}
                    >
                      {cell}
                    </code>
                  </td>
                );
              }
              return (
                <td
                  className={isRelated ? "is-related" : undefined}
                  style={{ "--hue": examples.hues.get(key) } as CSSProperties}
                  key={cellIndex}
                >
                  {cell}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
};

// How a scenario shows its saved values and state ids: the hue
// each is set in, keyed the way `hueKeyOfSpan` keys them, and which
// key the spans are lit up for, which a hover changes.
interface Related {
  hues: Map<string, number>;
  key: string | null;
  onRelate: (key: string | null) => void;
}

// One span of a built-in step printed from its syntax tree, styled
// by its role:
// a state type or method links to the state page, and a save, a
// recall, or a state id is set in its own hue and lights up every
// other span about the same saved value or state.
const SpanText: FC<{
  span: Span;
  stateType: string | undefined;
  links: StepLinks;
  related: Related;
}> = ({ span, stateType, links, related }) => {
  if (span.role === "text") {
    return <>{span.text}</>;
  }
  const className = `span span-${span.role}`;
  const link =
    span.role === "state-type"
      ? links.stateTypes.get(span.text)
      : span.role === "method"
      ? linkOfMethod(span.text, stateType, links)
      : undefined;
  if (link !== undefined) {
    return (
      <Link className="type-link" to={pathOfTypeOnPage("state", link)}>
        <code className={className}>{span.text}</code>
      </Link>
    );
  }
  const key = hueKeyOfSpan(span);
  if (key !== undefined) {
    return (
      <code
        className={related.key === key ? `${className} is-related` : className}
        style={{ "--hue": related.hues.get(key) } as CSSProperties}
        onPointerEnter={() => related.onRelate(key)}
        onPointerLeave={() => related.onRelate(null)}
      >
        {span.text}
      </code>
    );
  }
  return <code className={className}>{span.text}</code>;
};

// A clause list up to this long stays on the step's line; a longer
// one puts each clause on a line of its own.
const CLAUSES_INLINE = 2;

const Spans: FC<{
  spans: Span[];
  stateType: string | undefined;
  links: StepLinks;
  related: Related;
}> = ({ spans, stateType, links, related }) => (
  <>
    {spans.map((span, index) => (
      <SpanText
        span={span}
        stateType={stateType}
        links={links}
        related={related}
        key={index}
      />
    ))}
  </>
);

// A built-in step, printed from its syntax tree. The state type the
// step names is what says which state type's method a method name
// means.
const BuiltInStep: FC<{
  syntax: grammar_pb.BuiltInSyntax;
  links: StepLinks;
  related: Related;
}> = ({ syntax, links, related }) => {
  const printed: Printed = printBuiltInSyntax(syntax);
  const stateType = printed.head.find(
    (span) => span.role === "state-type"
  )?.text;
  const spans = (spans: Span[]) => (
    <Spans
      spans={spans}
      stateType={stateType}
      links={links}
      related={related}
    />
  );
  if (printed.clauses.length <= CLAUSES_INLINE) {
    return (
      <>
        {spans(printed.head)}
        {printed.clauses.map((clause, index) => (
          <Fragment key={index}>
            {index > 0 && " and "}
            {spans(clause)}
          </Fragment>
        ))}
        {spans(printed.tail)}
      </>
    );
  }
  return (
    <>
      {spans(printed.head)}
      {printed.clauses.map((clause, index) => (
        <div className="clause" key={index}>
          {spans(clause)}
          {index === printed.clauses.length - 1 && spans(printed.tail)}
        </div>
      ))}
    </>
  );
};

// `And` and `But` continue the step before them, so their keyword
// is set lighter, and a background's steps are set lighter still
// when shown as part of the scenario they run before.
const StepRow: FC<{
  step: feature_pb.Step;
  links: StepLinks;
  related: Related;
  background?: boolean;
}> = ({ step, links, related, background }) => {
  const continuation = step.keyword === "And" || step.keyword === "But";
  return (
    <div className={background ? "step step-background" : "step"}>
      <span
        className={
          continuation ? "step-keyword step-continuation" : "step-keyword"
        }
      >
        {step.keyword}
      </span>
      <div className="step-text">
        {step.screenshot !== undefined && (
          <a
            className="step-screenshot"
            href={recordingUrl(step.screenshot)}
            target="_blank"
            rel="noreferrer"
            title="The browser after this step, in the scenario's last run"
          >
            <img src={recordingUrl(step.screenshot)} alt="" />
          </a>
        )}
        {step.builtIn !== undefined ? (
          <BuiltInStep syntax={step.builtIn} links={links} related={related} />
        ) : (
          <CustomStep text={step.text} links={links} related={related} />
        )}
        {step.docString !== undefined && (
          <pre className="type-block">
            <code>{step.docString}</code>
          </pre>
        )}
        {step.table !== undefined && <GherkinTable table={step.table} />}
      </div>
    </div>
  );
};

// One row of a feature's or a rule's scenario list: a scenario, or
// the background the list's scenarios share. Closed, it is one line;
// open, its steps.
const ScenarioRow: FC<{
  keyword: string;
  // Absent for a bare heading naming nothing.
  name?: string;
  description: string;
  tags: string[];
  // The backgrounds whose steps run before this scenario's own:
  // the feature's, then its rule's. Shown dimmed above the steps,
  // so an open scenario reads whole.
  backgrounds: feature_pb.Background[];
  steps: feature_pb.Step[];
  examples: feature_pb.Examples[];
  meaning: string;
  links: StepLinks;
  // The video of the scenario's last run in a browser, absent when
  // none was recorded.
  video?: string;
}> = ({
  keyword,
  name,
  description,
  tags,
  backgrounds,
  steps,
  examples,
  meaning,
  links,
  video,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [relatedKey, setRelatedKey] = useState<string | null>(null);
  const hues = useMemo(
    () =>
      huesOfScenario(columnsOfExamples(examples), [
        ...backgrounds.flatMap((background) => background.steps),
        ...steps,
      ]),
    [backgrounds, steps, examples]
  );
  const related: Related = {
    hues,
    key: relatedKey,
    onRelate: setRelatedKey,
  };
  return (
    <div className={expanded ? "scenario is-expanded" : "scenario"}>
      <div
        className="scenario-head"
        onClick={() => setExpanded(!expanded)}
        role="button"
        aria-expanded={expanded}
      >
        <span className="caret scenario-caret">{expanded ? "▾" : "▸"}</span>
        <Pill
          className="eyebrow scenario-keyword"
          label={keyword}
          meaning={meaning}
          mark={false}
        />
        <span className="scenario-name">{name}</span>
        {video !== undefined && (
          <a
            className="scenario-video"
            href={recordingUrl(video)}
            target="_blank"
            rel="noreferrer"
            title="The scenario's last run in a browser"
            // A click here opens the video, not the scenario.
            onClick={(event) => event.stopPropagation()}
          >
            <svg viewBox="0 0 10 10" width="8" height="8" aria-hidden="true">
              <path d="M1.5 1 L9 5 L1.5 9 Z" fill="currentColor" />
            </svg>
            video
          </a>
        )}
        {tags.length > 0 && (
          <span className="tags">
            {tags.map((tag) => (
              <span className="tag" key={tag}>
                {tag}
              </span>
            ))}
          </span>
        )}
      </div>
      {/* Rendered while the row is closed too: opening is a CSS
          transition on this element, not a mount. */}
      <div className="scenario-detail">
        <div className="scenario-detail-inner">
          {description !== undefined && (
            <Description className="method-description" text={description} />
          )}
          <div className="steps">
            {backgrounds.flatMap((background, backgroundIndex) =>
              background.steps.map((step, index) => (
                <StepRow
                  step={step}
                  links={links}
                  related={related}
                  background={true}
                  key={`background-${backgroundIndex}-${index}`}
                />
              ))
            )}
            {steps.map((step, index) => (
              <StepRow
                step={step}
                links={links}
                related={related}
                key={index}
              />
            ))}
          </div>
          {examples.map((example, index) => (
            <div className="examples" key={index}>
              <div className="eyebrow">
                {example.keyword.toLowerCase()}
                {example.name !== undefined && ` · ${example.name}`}
              </div>
              {example.table !== undefined && (
                <GherkinTable table={example.table} examples={related} />
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const BackgroundRow: FC<{
  background: feature_pb.Background;
  links: StepLinks;
}> = ({ background, links }) => (
  <ScenarioRow
    keyword={background.keyword}
    name={background.name}
    description={background.description}
    tags={[]}
    backgrounds={[]}
    steps={background.steps}
    examples={[]}
    meaning={DEFINITIONS.background}
    links={links}
  />
);

// A list's own background is listed as a row of its own and folded,
// dimmed, into each of its scenarios along with any background
// inherited from the feature.
const ScenarioRows: FC<{
  inherited: feature_pb.Background[];
  background?: feature_pb.Background;
  scenarios: feature_pb.Scenario[];
  links: StepLinks;
}> = ({ inherited, background, scenarios, links }) => (
  <div className="scenarios">
    {background !== undefined && (
      <BackgroundRow background={background} links={links} />
    )}
    {scenarios.map((scenario) => (
      <ScenarioRow
        // Always "Scenario", whether the file says "Scenario", its
        // synonym "Example", or "Scenario Outline": an outline shows
        // itself by the examples table under it.
        keyword="Scenario"
        name={scenario.name}
        description={scenario.description}
        tags={scenario.tags}
        backgrounds={
          background === undefined ? inherited : [...inherited, background]
        }
        steps={scenario.steps}
        examples={scenario.examples}
        meaning={DEFINITIONS.scenario}
        links={links}
        video={scenario.video}
        key={scenario.line}
      />
    ))}
  </div>
);

// Both the route a link to a rule goes to and the `id` of its
// section: the feature's file, then which of its rules, counting
// from one, since a rule may have no name.
const ruleId = (filename: string, index: number): string =>
  `${filename}/rules/${index + 1}`;

const RuleSection: FC<{
  rule: feature_pb.Rule;
  // The rule's id on the page, a `ruleId`.
  id: string;
  inherited: feature_pb.Background[];
  links: StepLinks;
}> = ({ rule, id, inherited, links }) => (
  <div className="rule" id={pathOfTypeOnPage("behaviors", id)}>
    <div className="rule-heading">
      <Pill
        className="eyebrow"
        label={rule.keyword.toLowerCase()}
        meaning={DEFINITIONS.rule}
        mark={false}
      />
      <h3>{rule.name}</h3>
      <Anchor page="behaviors" id={id} />
      <span className="summary-line">
        {countWithNoun(rule.scenarios.length, "scenario")}
      </span>
    </div>
    {rule.description !== undefined && (
      <Description className="rule-description" text={rule.description} />
    )}
    <ScenarioRows
      inherited={inherited}
      background={rule.background}
      scenarios={rule.scenarios}
      links={links}
    />
  </div>
);

// A feature on its own page. The pane's header names it and carries
// its file, counts, and description, so the card holds the
// scenarios and rules.
const FeatureCard: FC<{
  filename: string;
  feature: feature_pb.Feature;
  links: StepLinks;
}> = ({ filename, feature, links }) => (
  <section className="state-type" id={pathOfTypeOnPage("behaviors", filename)}>
    {feature.error !== undefined ? (
      <div className="error">{feature.error}</div>
    ) : (
      <>
        {(feature.background !== undefined || feature.scenarios.length > 0) && (
          <ScenarioRows
            inherited={[]}
            background={feature.background}
            scenarios={feature.scenarios}
            links={links}
          />
        )}
        {feature.rules.map((rule, index) => (
          <RuleSection
            rule={rule}
            id={ruleId(filename, index)}
            inherited={
              feature.background === undefined ? [] : [feature.background]
            }
            links={links}
            key={index}
          />
        ))}
      </>
    )}
  </section>
);

// One name that links to a page, on the behaviors index and in its
// sidebar.
interface NamedLink {
  id: string;
  name: string;
}

// Every feature, and every rule, each linking to its page.
const namedLinksOf = (
  features: FeatureEntry[]
): { features: NamedLink[]; rules: NamedLink[] } => ({
  features: features.map(({ filename, feature }) => ({
    id: filename,
    name: feature.name ?? filename,
  })),
  rules: features.flatMap(({ filename, feature }) =>
    feature.rules.map((rule, index) => ({
      id: ruleId(filename, index),
      name: rule.name ?? `Rule ${index + 1}`,
    }))
  ),
});

// The sidebar's list of names linking to their pages, under a
// heading: rows of the sidebar's grid, so an eyebrow and a name cell
// each, with no count.
const NavLinks: FC<{ heading: string; links: NamedLink[] }> = ({
  heading,
  links,
}) => (
  <>
    <div className="eyebrow">{heading}</div>
    {links.map((link) => (
      <Link
        to={pathOfTypeOnPage("behaviors", link.id)}
        title={link.name}
        key={link.id}
      >
        <span className="nav-name">{link.name}</span>
      </Link>
    ))}
  </>
);

// The index's list of names linking to their pages, under a heading.
const LinkList: FC<{ heading: string; links: NamedLink[] }> = ({
  heading,
  links,
}) => (
  <div className="link-list">
    <div className="eyebrow">{heading}</div>
    {links.length === 0 ? (
      <div className="empty">None yet.</div>
    ) : (
      links.map((link) => (
        <Link to={pathOfTypeOnPage("behaviors", link.id)} key={link.id}>
          {link.name}
        </Link>
      ))
    )}
  </div>
);

// The behaviors page with no feature chosen: the features and the
// rules, side by side, each name linking to its page.
const FeaturesIndex: FC<{ features: FeatureEntry[] }> = ({ features }) => {
  const links = namedLinksOf(features);
  return (
    <div className="behaviors-index">
      <LinkList heading="features" links={links.features} />
      <LinkList heading="rules" links={links.rules} />
    </div>
  );
};

const ChangeRow: FC<{ entry: Entry; now: Date }> = ({ entry, now }) => {
  const row = rowOfChange(entry.change);
  return (
    <div className="change">
      <time className="change-when" dateTime={entry.at.toISOString()}>
        read {timeAgo(entry.at, now)}
      </time>
      <span className="change-where">{row.where}</span>
      {/* The wrapper, not the pill, is the grid cell: the row's padding
        and hover fill apply to it, and the pill's background covers
        only the pill. */}
      <span className="change-pill-cell">
        <span className={`change-pill change-kind-${row.kind}`}>
          {labelOfChangeKind[row.kind]}
        </span>
      </span>
      <span className="change-pill-cell">
        <span className={`change-pill change-${row.difference}`}>
          {row.difference}
        </span>
      </span>
      {/* Names are identifiers, so they are set as code, the way the
        descriptions set them. */}
      {row.link === undefined ? (
        <span className="change-name">
          <code>{row.name}</code>
        </span>
      ) : (
        <Link
          className="change-name"
          to={pathOfTypeOnPage(row.link.page, row.link.id)}
        >
          <code>{row.name}</code>
        </Link>
      )}
      <span className="change-changed-parts">
        {row.parts.map((part, index) => (
          <Fragment key={`${part.noun} ${part.name} ${part.verb}`}>
            {index > 0 && ", "}
            {part.noun && `${part.noun} `}
            <code className={`changed-part changed-part-${part.difference}`}>
              {part.name}
            </code>
            {` ${part.verb}`}
            {part.detail && ` ${part.detail}`}
          </Fragment>
        ))}
      </span>
    </div>
  );
};

const ChangelogPage: FC<{
  shown: Entry[];
  more: boolean;
  onMore: () => void;
  isLoading: boolean;
  live: boolean;
}> = ({ shown, more, onMore, isLoading, live }) => {
  // Every row on the page measures "ago" from this same moment.
  const now = new Date();

  if (isLoading && shown.length === 0) {
    return <div className="empty">Reading what has changed…</div>;
  }

  if (shown.length === 0) {
    return (
      <div className="empty">
        No API files read yet. Write one and it will show up here.
      </div>
    );
  }

  return (
    <>
      {live && (
        <div className="watching">
          Watching for changes<span className="watching-dots">...</span>
        </div>
      )}
      <div className="changes">
        {shown.map((entry) => (
          <ChangeRow entry={entry} now={now} key={entry.key} />
        ))}
      </div>
      {more && (
        <button className="expand-button" onClick={onMore}>
          Show older
        </button>
      )}
    </>
  );
};

// Whether this page load has scrolled to the element the URL names,
// so a later back or forward keeps the scroll the developer left
// instead. At module level because `Overview` remounts on every
// route change.
let scrolledToTarget = false;

// The `.pane`'s scroll for each history entry, remembered when the
// entry is left and restored when a back or forward returns to it.
// The pane, not the window, is what scrolls, so the browser's own
// scroll restoration never applies to it.
const paneScrollTops = new Map<string, number>();

const Overview: FC<{
  page: Page;
  navWidth: number;
  onNavResizing: (width: number) => void;
  onNavResized: () => void;
  isMethodExpanded: (stateType: string, method: string) => boolean;
  onToggleMethods: (
    stateType: string,
    methods: string[],
    expanded: boolean
  ) => void;
  preferencesLoaded: boolean;
}> = ({
  page,
  navWidth,
  onNavResizing,
  onNavResized,
  isMethodExpanded,
  onToggleMethods,
  preferencesLoaded,
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

  // The behaviors page names its sections by file path, whose
  // slashes a `:id` segment cannot hold, so its route matches the
  // rest of the URL as a splat instead.
  const params = useParams();
  const target =
    params.id ??
    (params["*"] === "" || params["*"] === undefined ? undefined : params["*"]);

  // The dashboard's own state: what it read of the developer's API
  // files. Nothing here calls the developer's application, so the
  // application does not have to exist.
  const { useGet } = useDashboard({ id: DASHBOARD_ID });
  const { response, isLoading } = useGet();

  // The client exposes no connection state. `isLoading` is the
  // nearest: once it has loaded, loading again means the client is
  // retrying.
  const live = !isLoading;

  // What the developer's API files declare, which exists before the
  // application is generated, built or started, so this page can
  // show it without an application.
  const apis: APIs = useMemo(() => response?.apis ?? {}, [response?.apis]);

  // How many state types the API files declare.
  const stateTypeCount = useMemo(
    () =>
      Object.values(apis).reduce(
        (total, api) => total + api.stateTypes.length,
        0
      ),
    [apis]
  );

  // Why any API file could not be read, which is routine while the
  // developer is typing. The page shows it beside the types, which
  // stay at whatever each file last declared.
  const error = response?.error ?? "";

  // The Reboot calls each servicer's methods make arrive on the
  // same response: nothing until the analysis has run, and for a
  // Node.js application, which it does not read.
  const servicers = useMemo(
    () => response?.servicers ?? [],
    [response?.servicers]
  );

  const graphStateTypes = useMemo(
    () => joinStateTypes(apis, servicers),
    [apis, servicers]
  );

  // Why `rbt generate` has to run, derived by the backend from
  // what the two watches recorded.
  const needsGenerateReason = response?.needsGenerateReason;

  const linkedDataTypes = useMemo(() => linkDataTypes({ apis }), [apis]);

  // What the developer's `.feature` files describe.
  const features: Features = useMemo(
    () => response?.features ?? {},
    [response?.features]
  );

  const featureEntries = useMemo(() => sortedFeatures(features), [features]);

  // The feature the URL names, by its file or by one of its rules
  // (`ruleId`); `undefined` for the page with no feature chosen,
  // which lists them all.
  const chosenFeature = useMemo(
    () =>
      target === undefined
        ? undefined
        : featureEntries.find(
            ({ filename }) =>
              target === filename || target.startsWith(`${filename}/rules/`)
          ),
    [featureEntries, target]
  );

  const scenarioCount = useMemo(
    () =>
      featureEntries.reduce(
        (total, entry) => total + scenariosOfFeature(entry.feature).length,
        0
      ),
    [featureEntries]
  );

  // Rules are what the page counts by once a project writes them;
  // until then, scenarios.
  const ruleCount = useMemo(
    () =>
      featureEntries.reduce(
        (total, entry) => total + entry.feature.rules.length,
        0
      ),
    [featureEntries]
  );
  const behaviorsCount =
    ruleCount > 0
      ? countWithNoun(ruleCount, "rule")
      : countWithNoun(scenarioCount, "scenario");

  // Where the backticked spans of steps link, derived from the same
  // APIs the state page shows, so a link can never point at a state
  // type the page does not have.
  const links = useMemo(() => stepLinks(apis), [apis]);

  // A referrer is either a state type or a data type, and its link
  // must open the page that lists it.
  const pageOfTypeId = useMemo(() => {
    const states = new Set(
      Object.values(apis).flatMap((api) =>
        api.stateTypes.map((stateType) => qualifiedName({ api, stateType }))
      )
    );
    return (id: string): Page => (states.has(id) ? "state" : "data");
  }, [apis]);

  // The changelog is one list rather than a set of packages, and
  // the graph is one canvas, so the sidebar has nothing to index;
  // the behaviors page indexes its features and rules as two flat
  // lists of its own, below.
  const entries: NavEntry[] = useMemo(
    () =>
      page === "changelog" || page === "graph"
        ? []
        : page === "state"
        ? sortedAPIs(apis).flatMap((api) =>
            api.stateTypes.map((stateType) => ({
              id: qualifiedName({ api, stateType }),
              name: stateType.name,
              package: api.package,
              count: countWithNoun(stateType.methods.length, "method"),
            }))
          )
        : page === "behaviors"
        ? []
        : linkedDataTypes.map((linkedDataType) => ({
            id: linkedDataType.id,
            name: linkedDataType.name,
            package: linkedDataType.package,
            count: countWithNoun(linkedDataType.properties.length, "property"),
          })),
    [page, apis, featureEntries, linkedDataTypes]
  );

  const packages = useMemo(() => groupByPackage(entries), [entries]);

  // The behaviors sidebar's two lists.
  const behaviorLinks = useMemo(
    () => namedLinksOf(featureEntries),
    [featureEntries]
  );

  // The changelog, read here rather than in its page so that the
  // nav's count is right before the page is ever opened.
  const { useReverseRange } = useOrderedMap({ id: CHANGELOG_ID });
  const [changelogPages, setChangelogPages] = useState(1);
  const {
    response: changelogResponse,
    isLoading: changelogIsLoading,
    aborted: changelogAborted,
  } = useReverseRange({
    // One more than is shown, to learn whether more exist.
    limit: CHANGES_PER_PAGE * changelogPages + 1,
  });
  // The read aborts when the map does not exist, and it does not
  // exist until the first change is recorded.
  const changelog = entriesOfRange(
    changelogAborted !== undefined ? [] : changelogResponse?.entries ?? []
  );
  const moreChangelog = changelog.length > CHANGES_PER_PAGE * changelogPages;
  const shownChangelog = moreChangelog
    ? changelog.slice(0, CHANGES_PER_PAGE * changelogPages)
    : changelog;

  const calls = useMemo(
    () => drawnCallCount(graphStateTypes),
    [graphStateTypes]
  );

  const eyebrow =
    page === "changelog"
      ? "history"
      : page === "behaviors"
      ? chosenFeature === undefined
        ? "application behavior"
        : "feature"
      : "application domain";

  const heading =
    page === "changelog"
      ? "Changelog"
      : page === "graph"
      ? `${countWithNoun(calls, "call")} between ${countWithNoun(
          graphStateTypes.length,
          "state type"
        )}`
      : page === "state"
      ? `${countWithNoun(stateTypeCount, "state type")} in ${countWithNoun(
          packages.length,
          "package"
        )}`
      : page === "behaviors"
      ? chosenFeature === undefined
        ? `${behaviorsCount} in ${countWithNoun(
            featureEntries.length,
            "feature"
          )}`
        : chosenFeature.feature.name ?? chosenFeature.filename
      : `${countWithNoun(
          linkedDataTypes.length,
          "data type"
        )} in ${countWithNoun(packages.length, "package")}`;

  // The page scrolls to the element the URL names only if it exists
  // when the URL changes, and it does not exist on a page that was
  // not showing then. Once that page has rendered, scroll to it.
  //
  // Only when the developer navigated here: on back and forward,
  // which the router reports as `POP`, the scroll they left is
  // restored below instead, and snapping to the target would land
  // somewhere else. A fresh page load also reports `POP`, and there
  // the target is the intent, which `scrolledToTarget` says.
  const navigationType = useNavigationType();
  useEffect(() => {
    if (target === undefined) {
      return;
    }
    if (navigationType === "POP" && scrolledToTarget) {
      return;
    }
    const element = document.getElementById(pathOfTypeOnPage(page, target));
    if (element !== null) {
      element.scrollIntoView();
      scrolledToTarget = true;
    }
  }, [navigationType, page, target, apis, linkedDataTypes, featureEntries]);

  const navigate = useNavigate();

  // Opens one method on the state page: expanded, named by the URL
  // so the page scrolls to it. `id` is a `methodId`,
  // `bank.v1.Account.deposit`.
  const onOpenMethod = useCallback(
    (id: string): void => {
      const stateType = id.slice(0, id.lastIndexOf("."));
      const method = id.slice(id.lastIndexOf(".") + 1);
      onToggleMethods(stateType, [method], true);
      navigate(`/state/${id}`);
    },
    [onToggleMethods, navigate]
  );

  const pane = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const loaded = !(isLoading && stateTypeCount === 0) && preferencesLoaded;

  // Remembered when this entry is left: the cleanup runs while the
  // pane is still on screen.
  useEffect(() => {
    const key = location.key;
    return () => {
      paneScrollTops.set(key, pane.current?.scrollTop ?? 0);
    };
  }, [location.key]);

  // Restored only once the entry's content is on screen, so the
  // offset is applied against the heights the developer was looking
  // at, not a page that is still loading.
  useLayoutEffect(() => {
    if (navigationType !== "POP" || !loaded) {
      return;
    }
    const scrollTop = paneScrollTops.get(location.key);
    if (scrollTop !== undefined) {
      pane.current?.scrollTo(0, scrollTop);
    }
  }, [navigationType, location.key, loaded]);

  // Only until the first read; while reloading, `response` keeps the
  // types last read, so the page shows those instead. The
  // preferences read is waited for too, so the first paint has each
  // method's detail already open or closed: the browser measures its
  // restored scroll offset against the final layout, not one that
  // grows when the preferences arrive.
  if ((isLoading && stateTypeCount === 0) || !preferencesLoaded) {
    return (
      <main>
        <h1>Reboot application</h1>
        <p className="muted">Reading your API…</p>
      </main>
    );
  }

  if (stateTypeCount === 0) {
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
    state: stateTypeCount,
    data: linkedDataTypes.length,
    behaviors: ruleCount > 0 ? ruleCount : scenarioCount,
    changelog: shownChangelog.length,
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
          {page === "behaviors" && (
            <>
              <NavLinks heading="features" links={behaviorLinks.features} />
              <NavLinks heading="rules" links={behaviorLinks.rules} />
            </>
          )}
          {/* The changelog has none. */}
          {packages.length > 0 && <div className="eyebrow">packages</div>}
          {packages.map((group) => (
            <Package
              package={group.package}
              page={page}
              noun={page === "state" ? "state type" : "data type"}
              entries={group.entries}
              key={group.package}
            />
          ))}
        </nav>
      </Panel>
      <Separator className="nav-resizer" />
      <Panel className="pane-panel">
        <div
          className={page === "graph" ? "pane graph-pane" : "pane"}
          ref={pane}
        >
          <header>
            <div className="eyebrow">{eyebrow}</div>
            <h1>{heading}</h1>
            {/* A feature's page names the feature up here, so its
                file, counts, and description belong here too. */}
            {page === "behaviors" && chosenFeature !== undefined && (
              <>
                <div className="feature-file-line">
                  <div className="file">{chosenFeature.filename}</div>
                  <span className="summary-line">
                    {countWithNoun(
                      scenariosOfFeature(chosenFeature.feature).length,
                      "scenario"
                    )}
                    {chosenFeature.feature.rules.length > 0 &&
                      ` · ${countWithNoun(
                        chosenFeature.feature.rules.length,
                        "rule"
                      )}`}
                  </span>
                </div>
                {chosenFeature.feature.description !== undefined && (
                  <Description
                    className="state-type-description"
                    text={chosenFeature.feature.description}
                  />
                )}
              </>
            )}
          </header>
          {error && <div className="error">{error}</div>}
          {page === "changelog" ? (
            <ChangelogPage
              shown={shownChangelog}
              more={moreChangelog}
              onMore={() => setChangelogPages(changelogPages + 1)}
              isLoading={changelogIsLoading}
              live={live}
            />
          ) : page === "graph" ? (
            <>
              {needsGenerateReason === NeedsGenerateReason.MISSING ? (
                <p className="graph-note muted">
                  Your application imports generated code that does not exist
                  yet, so the static call graph anaysis cannot be done. Run{" "}
                  <code>rbt generate</code>.
                </p>
              ) : needsGenerateReason === NeedsGenerateReason.CHANGED ? (
                <p className="graph-note muted">
                  Your API files changed since the generated code was written,
                  so the static call graph analysis may be out of date. Run{" "}
                  <code>rbt generate</code>.
                </p>
              ) : null}
              {/* With a module `missing`, no servicer resolves. */}
              {needsGenerateReason !== NeedsGenerateReason.MISSING &&
              response !== undefined &&
              servicers.length === 0 ? (
                <p className="graph-note muted">
                  No servicers found, so no static call graph analysis run. The
                  dashboard reads the Python application your{" "}
                  <code>.rbtrc</code> names with{" "}
                  <code>dev run --application=</code>.
                </p>
              ) : null}
              <GraphPage
                stateTypes={graphStateTypes}
                selectedMethodId={target ?? null}
                onSelectMethod={(id, replace) =>
                  navigate(id === null ? "/graph" : `/graph/${id}`, {
                    replace,
                  })
                }
                onOpenMethod={onOpenMethod}
              />
            </>
          ) : page === "state" ? (
            sortedAPIs(apis).flatMap((api) =>
              api.stateTypes.map((stateType) => {
                const name = qualifiedName({ api, stateType });
                return (
                  <StateType
                    api={api}
                    stateType={stateType}
                    isMethodExpanded={(method) =>
                      isMethodExpanded(name, method)
                    }
                    onToggleMethods={(methods, expanded) =>
                      onToggleMethods(name, methods, expanded)
                    }
                    key={name}
                  />
                );
              })
            )
          ) : page === "behaviors" ? (
            featureEntries.length === 0 ? (
              <div className="empty">
                No <code>.feature</code> files found. Write one and its
                scenarios will show up here.
              </div>
            ) : chosenFeature === undefined ? (
              <FeaturesIndex features={featureEntries} />
            ) : (
              <FeatureCard
                filename={chosenFeature.filename}
                feature={chosenFeature.feature}
                links={links}
                key={chosenFeature.filename}
              />
            )
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
  const { useGet, setSuppressOpenOnRestart, setMethodsExpanded, setNavWidth } =
    usePreferences({
      id: PREFERENCES_ID,
    });
  const { response } = useGet();

  // Before the read returns, the page treats the preference as the
  // CLI treats an unwritten one: as false.
  const suppressed = response?.suppressOpenOnRestart ?? false;

  const stored = useMemo(
    () => new Set(response?.expandedMethods ?? []),
    [response?.expandedMethods]
  );

  const navWidth = response?.navWidth ?? NAV_WIDTH.default;
  const resizing = useRef(navWidth);

  const onNavResizing = useCallback((width: number): void => {
    resizing.current = width;
  }, []);

  const onNavResized = useCallback((): void => {
    setNavWidth({ navWidth: resizing.current });
  }, [setNavWidth]);

  // The open state of each click that the read does not yet
  // reflect; it overrides the stored value so a method responds to
  // the click before the round trip completes. Dropped once the
  // read agrees, since a stale stand-in would hide a later change
  // from another tab.
  const [clicked, setClicked] = useState(new Map<string, boolean>());

  useEffect(() => {
    setClicked((clicked) => {
      const waiting = new Map(
        [...clicked].filter(([key, expanded]) => stored.has(key) !== expanded)
      );
      return waiting.size === clicked.size ? clicked : waiting;
    });
  }, [stored]);

  const isMethodExpanded = useCallback(
    (stateType: string, method: string): boolean => {
      const key = `${stateType}.${method}`;
      return clicked.get(key) ?? stored.has(key);
    },
    [clicked, stored]
  );

  const onToggleMethods = useCallback(
    (stateType: string, methods: string[], expanded: boolean): void => {
      setClicked((clicked) => {
        const standing = new Map(clicked);
        for (const method of methods) {
          standing.set(`${stateType}.${method}`, expanded);
        }
        return standing;
      });
      setMethodsExpanded({ stateType, methods, expanded });
    },
    [setMethodsExpanded]
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
              // A feature file's path has slashes, which a `:id`
              // segment cannot hold, so the behaviors page matches
              // the rest of the URL as a splat.
              path={page === "behaviors" ? `/${page}/*` : `/${page}/:id?`}
              element={
                <Overview
                  page={page}
                  navWidth={navWidth}
                  onNavResizing={onNavResizing}
                  onNavResized={onNavResized}
                  isMethodExpanded={isMethodExpanded}
                  onToggleMethods={onToggleMethods}
                  preferencesLoaded={response !== undefined}
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
