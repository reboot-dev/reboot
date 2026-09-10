import {
  useDashboard,
  usePreferences,
} from "../../../../rbt/dashboard/v1/dashboard_rbt_react";
import { useOrderedMap } from "@reboot-dev/reboot-std-api/collections/ordered_map/v1/ordered_map_rbt_react";
import { RebootClientProvider } from "@reboot-dev/reboot-react";
import { Presence } from "@reboot-dev/reboot-std-react/presence";
import {
  type CSSProperties,
  createContext,
  type FC,
  Fragment,
  type ReactNode,
  type RefObject,
  StrictMode,
  useCallback,
  useContext,
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
  useSearchParams,
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
} from "./feature_files";
import {
  columnsOfExamples,
  hueKeyOfSpan,
  hueKeyOfVariable,
  huesOfScenario,
  linkOfCodeSpan,
  linkOfMethod,
  printBuiltInSyntax,
  recordingUrl,
  type FeatureFilter,
  BLOCKED_TAG,
  WIP_TAG,
  blockedScenariosOfFeature,
  drivesWebApp,
  featurePasses,
  isWip,
  featuresByRecency,
  rulePasses,
  scenariosOfFeature,
  sortedFeatures,
  stateTypesOfFeature,
  stateTypesOfFeatures,
  webAppScenarioCount,
  spansOfText,
  stepLinks,
} from "./feature_files";
import type {
  APIs,
  LinkedDataType,
  Property,
  Kind,
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
import { joinStateTypes, type GraphStateType } from "./callgraph";
import {
  exercisedMethods,
  graphStateTypeNamed,
  undescribedMethods,
} from "./features";
import { drawnCallCount, GraphPage } from "./graph";

// One subscriber per tab, for as long as the tab is open.
const SUBSCRIBER_ID = uuidv4();

// What each pill means, written for a reader new to Reboot. A pill
// whose label is not here gets no tooltip.
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
// the reader is on. The scroll pane holding the pill clips content
// outside it, so when it is scrolled and there is no room above,
// the definition opens below the pill instead.
const Pill: FC<{
  className: string;
  label: string;
  meaning?: string;
}> = ({ className, label, meaning }) => {
  const pill = useRef<HTMLSpanElement>(null);
  const [below, setBelow] = useState(false);

  // The CSS hides the closed definition with `visibility`, so its
  // height is readable before it opens. The pill's position does not
  // depend on `below`, so measure the room from the pill.
  const place = useCallback(() => {
    const pane = pill.current?.closest(".pane, .types-pane-body");
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

// Each page indexes the same application: `changelog` is its history,
// `features` is what the application lets a person do, each joined
// with the scenarios, state types and code that make it up, and
// `models` is the calls the state types' implementations make to
// each other. The state types the API declares and the data types
// those declare in turn are not pages but the types pane, which
// every page carries on its right.
const PAGES = ["changelog", "features", "models"] as const;

type Page = typeof PAGES[number];

const PAGE_NAMES: Record<Page, string> = {
  changelog: "Changelog",
  features: "Features",
  models: "Models",
};

const CHANGES_PER_PAGE = 100;

// Both the route a link to a type goes to and the `id` of the section
// it lands on, so the two can never disagree.
const pathOfTypeOnPage = (page: Page, id: string): string => `/${page}/${id}`;

// Both the `id` of a type's section in the types pane and the
// target a link to the type names in the `type` search parameter,
// so the two can never disagree.
const idOfTypeInPane = (id: string): string => `/type/${id}`;

// The `id` of a property's row in the types pane, under the type that
// declares it: a state type's property, `bank.v1.Account.balance`,
// is not its method of the same name, so it is not a `/type/` id.
const idOfPropertyInPane = (typeId: string, name: string): string =>
  `/property/${typeId}.${name}`;

// The search string a link to a property produces: the type the
// pane shows, state or data, and the property, which the pane
// scrolls to and flashes.
const searchOfProperty = (typeId: string, name: string): string =>
  `?type=${typeId}&property=${name}`;

// What the pane's rows need to link to themselves and to know which
// of them a followed link named: the type the pane shows, and the
// property to flash, with the history entry that named it.
interface PaneRows {
  typeId: string;
  flash?: { id: string; key: string };
}

const PaneRowsContext = createContext<PaneRows | undefined>(undefined);

// What the `type` search parameter names: one state type or one of
// its methods, `bank.v1.Account` or `bank.v1.Account.deposit`, or one
// data type, `bank.v1.bank.CustomerAccount`. The pane exists only
// while the parameter names something.
type PaneTarget =
  | { stateTypeId: string; method?: string; dataTypeId?: undefined }
  | { dataTypeId: string; stateTypeId?: undefined; method?: undefined };

// The id of the type a target shows, whichever kind it is.
const typeIdOfTarget = (target: PaneTarget): string =>
  target.dataTypeId ?? target.stateTypeId;

const paneTargetOf = (
  raw: string | null,
  isStateTypeId: (id: string) => boolean,
  isDataTypeId: (id: string) => boolean
): PaneTarget | undefined => {
  if (raw === null) {
    return undefined;
  }
  if (isDataTypeId(raw)) {
    return { dataTypeId: raw };
  }
  const separator = raw.lastIndexOf(".");
  if (
    !isStateTypeId(raw) &&
    separator !== -1 &&
    isStateTypeId(raw.slice(0, separator))
  ) {
    return {
      stateTypeId: raw.slice(0, separator),
      method: raw.slice(separator + 1),
    };
  }
  return { stateTypeId: raw };
};

// The search string a link to a type produces. The path is left
// alone, so following the link never leaves the page being read.
const searchOfType = (id: string): string => `?type=${id}`;

// A link that slides the types pane open on the type the id names,
// state or data, from wherever the type is named; a method id
// flashes the method.
const TypeLink: FC<{
  id: string;
  className?: string;
  children: ReactNode;
}> = ({ id, className, children }) => (
  <Link className={className} to={{ search: searchOfType(id) }}>
    {children}
  </Link>
);

// The types pane's own `Anchor`: a link to the type it shows.
const PaneAnchor: FC<{ id: string }> = ({ id }) => (
  <Link
    className="anchor"
    to={{ search: searchOfType(id) }}
    aria-label={`Link to ${id}`}
  >
    #
  </Link>
);

// `NavLink` is active when the route is this page or an id within it
// (a `pathOfTypeOnPage` route), and sets `aria-current` itself. The
// links carry the types pane's search parameter, so switching pages
// keeps the pane as it is.
const PageSelector: FC<{ counts: Record<Page, number>; search: string }> = ({
  counts,
  search,
}) => (
  <div className="page-selector">
    {PAGES.map((name) => (
      <NavLink
        className={({ isActive }) =>
          isActive ? "page-link current" : "page-link"
        }
        to={{ pathname: `/${name}`, search }}
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

// The types pane's widths, pixels the same way. Dragged below its
// minimum, the pane collapses to the handle, which is what brings
// it back.
const PANE_WIDTH = { default: 380, min: 260, max: 720, handle: 14 };

// The sidebar is the first panel of the shell so that the border
// between it and the document is a `Separator`, which the library
// drags, keeps within bounds, moves by keyboard and describes to
// assistive technology.

// A check that took longer than this reads in red at the foot of the
// sidebar: the watcher is keeping the page waiting.
const SLOW_CHECK_SECONDS = 10;

// How long a check took, in seconds.
const secondsOfCheck = (check: dashboard_pb.Check): number =>
  check.took === undefined
    ? 0
    : Number(check.took.seconds) + check.took.nanos / 1_000_000_000;

// One line at the foot of the sidebar: when a watcher last checked
// the developer's files, in red when the check took too long.
const CheckLine: FC<{
  what: string;
  check: dashboard_pb.Check | undefined;
}> = ({ what, check }) => {
  if (check?.at === undefined) {
    return <div className="check">{what} not checked yet</div>;
  }
  const seconds = secondsOfCheck(check);
  return (
    <div
      className={seconds > SLOW_CHECK_SECONDS ? "check is-slow" : "check"}
      title={`The check took ${seconds.toFixed(1)} seconds`}
    >
      {what} checked at{" "}
      <time dateTime={check.at.toDate().toISOString()}>
        {check.at.toDate().toLocaleTimeString()}
      </time>
    </div>
  );
};

// When each watcher last checked the developer's files, at the foot
// of the sidebar.
const Checks: FC<{
  response: dashboard_pb.DashboardGetResponse | undefined;
}> = ({ response }) => (
  <div className="checks">
    <CheckLine what="features" check={response?.featuresCheck} />
    <CheckLine what="api" check={response?.apiCheck} />
    <CheckLine what="code" check={response?.codeCheck} />
  </div>
);

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

// A type's properties, one level deep, as a TypeScript type literal.
// A property whose type is another of the developer's types names it,
// and clicking the name opens that type beside this one.
// One row per property: its name and type, then what the developer
// wrote about it as prose, then what a value must satisfy. Each row
// has an id a link can name, and a `#` beside the name to copy one.
const Properties: FC<{
  properties: Property[];
  // The type declaring the properties.
  typeId: string;
}> = ({ properties, typeId }) => {
  const rows = useContext(PaneRowsContext);
  return (
    <div className="properties">
      {properties.map((property) => {
        const id = idOfPropertyInPane(typeId, property.name);
        const flashKey = rows?.flash?.id === id ? rows.flash.key : undefined;
        return (
          <div
            className={
              flashKey === undefined ? "property" : "property is-flash"
            }
            id={id}
            key={`${property.name}:${flashKey ?? ""}`}
          >
            <div className="property-head">
              <span className="property-name">{property.name}</span>
              {property.optional && <span className="optional">?</span>}
              <span className="property-type">
                <TypeName type={property.type} link={property.link} />
              </span>
              {property.deprecated && (
                <span className="property-deprecated">deprecated</span>
              )}
              {rows !== undefined && (
                <Link
                  className="anchor"
                  to={{
                    search: searchOfProperty(rows.typeId, property.name),
                  }}
                  aria-label={`Link to ${typeId}.${property.name}`}
                >
                  #
                </Link>
              )}
            </div>
            {property.description !== undefined ? (
              <Description
                className="property-description"
                text={property.description}
              />
            ) : (
              <p className="property-description is-missing">
                No description provided, please ask your friendly coding agent
                to add one for you.
              </p>
            )}
            {property.constraints !== undefined && (
              <div className="property-constraints">{property.constraints}</div>
            )}
          </div>
        );
      })}
    </div>
  );
};

// A type as it appears in a row: plain text for `string` and the
// other built-ins, otherwise a link that opens the data type in the
// pane, from which the browser's back returns here.
const TypeName: FC<{ type: string; link?: string }> = ({ type, link }) =>
  link === undefined ? (
    <>{type}</>
  ) : (
    <TypeLink className="type-link type-name" id={link}>
      {type}
    </TypeLink>
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
    <span className="method-signature">
      <span>
        {"("}
        {takes.length > 0 && <Keys properties={takes} />}
        {") "}
        <span className="arrow">→</span>{" "}
        {returns.length > 0 ? (
          <Keys properties={returns} />
        ) : (
          <span className="nothing">nothing</span>
        )}
      </span>
      {method.errors.length > 0 && (
        <span className="errors">
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
        </span>
      )}
    </span>
  );
};

const Method: FC<{
  api: api_pb.API;
  method: api_pb.Method;
  // The method's id in the pane, `/type/bank.v1.Account.deposit`,
  // which is what a link from the graph names.
  id: string;
  // Set for the method a followed link named, with the history entry
  // that named it, so a second click flashes it again.
  flashKey?: string;
}> = ({ api, method, id, flashKey }) => {
  return (
    <div
      className={flashKey === undefined ? "method" : "method is-flash"}
      id={id}
      key={flashKey}
    >
      <>
        <div className="method-head">
          <div className="method-title">
            <span className="method-name">{method.name}</span>
            <Signature api={api} method={method} />
          </div>
          <div className="method-tags">
            {/* The kind comes before the tags because every method
                has one, so it sits in the same column in every row.
                The tags are optional. */}
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
        <div className="method-detail">
          <div className="method-detail-inner">
            {method.description !== undefined && (
              <Description
                className="method-description"
                text={method.description}
              />
            )}
          </div>
        </div>
      </>
    </div>
  );
};

// A count with its noun, plural when it is not one: "1 property",
// "2 properties", "3 methods".
const countWithNoun = (n: number, noun: string): string =>
  `${n} ${
    n === 1
      ? noun
      : /[^aeiou]y$/.test(noun)
      ? `${noun.slice(0, -1)}ies`
      : `${noun}s`
  }`;

const StateType: FC<{
  api: api_pb.API;
  stateType: api_pb.StateType;
  // The method a followed link flashes, with the history entry that
  // named it.
  flash?: { method: string; key: string };
  // The property a followed link named, with the history entry that
  // named it.
  flashProperty?: { id: string; key: string };
}> = ({ api, stateType, flash, flashProperty }) => {
  const name = qualifiedName({ api, stateType });
  const rows: PaneRows = useMemo(
    () => ({ typeId: name, flash: flashProperty }),
    [name, flashProperty]
  );
  const properties = propertiesOfState({ api, stateType });

  return (
    <PaneRowsContext.Provider value={rows}>
      <section className="state-type" id={idOfTypeInPane(name)}>
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
            <PaneAnchor id={name} />
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

        <div className="eyebrow section">properties</div>
        {properties.length === 0 ? (
          <div className="empty">
            No state properties. The key is the whole state.
          </div>
        ) : (
          <Properties properties={properties} typeId={name} />
        )}

        <div className="eyebrow section">methods</div>
        <div className="methods">
          {stateType.methods.map((method) => (
            <Method
              api={api}
              method={method}
              id={idOfTypeInPane(`${name}.${method.name}`)}
              flashKey={flash?.method === method.name ? flash.key : undefined}
              key={method.name}
            />
          ))}
        </div>
      </section>
    </PaneRowsContext.Provider>
  );
};

// Whether the CLI just opened this page by itself, said by the
// query parameter it opens the page with. Read once and stripped,
// so a reload or a copied URL says nothing.
const openedAutomatically = ((): boolean => {
  const params = new URLSearchParams(window.location.search);
  if (params.get("opened") !== "automatically") {
    return false;
  }
  params.delete("opened");
  const search = params.toString();
  window.history.replaceState(
    null,
    "",
    `${window.location.pathname}${search === "" ? "" : `?${search}`}${
      window.location.hash
    }`
  );
  return true;
})();

// Says the CLI opened this page by itself, and offers not to be
// reopened; either button dismisses it.
const OpenedNotice: FC<{ onSuppress: () => void; onClose: () => void }> = ({
  onSuppress,
  onClose,
}) => (
  <div className="opened-notice" role="status">
    <span>This dashboard was opened automatically.</span>
    <button type="button" className="opened-notice-button" onClick={onSuppress}>
      Don't reopen automatically
    </button>
    <button type="button" className="opened-notice-button" onClick={onClose}>
      Close
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

// One data type, on the pane the way a state type is: what it holds,
// then what contains it, each a link, so the reader walks the types
// in both directions and the browser's back retraces the walk.
const DataType: FC<{
  linkedDataType: LinkedDataType;
  // The property a followed link named, with the history entry that
  // named it.
  flashProperty?: { id: string; key: string };
}> = ({ linkedDataType, flashProperty }) => {
  const rows: PaneRows = useMemo(
    () => ({ typeId: linkedDataType.id, flash: flashProperty }),
    [linkedDataType.id, flashProperty]
  );
  return (
    <PaneRowsContext.Provider value={rows}>
      <section className="state-type" id={idOfTypeInPane(linkedDataType.id)}>
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
            <PaneAnchor id={linkedDataType.id} />
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
          <Properties
            properties={linkedDataType.properties}
            typeId={linkedDataType.id}
          />
        )}

        <div className="eyebrow section">used by</div>
        {linkedDataType.referrers.length === 0 ? (
          <div className="empty">Nothing names this type.</div>
        ) : (
          <div className="referrers">
            {linkedDataType.referrers.map((referrer) => (
              <TypeLink
                className="type-link referrer"
                id={referrer.id}
                key={`${referrer.id} ${referrer.label}`}
              >
                {referrer.label}
              </TypeLink>
            ))}
          </div>
        )}
      </section>
    </PaneRowsContext.Provider>
  );
};

// The types pane: one type, state or data, slid open by a link to it
// from the graph or a page, every method expanded; the X closes it.
// A link naming a method flashes the method.
const TypesPane: FC<{
  apis: APIs;
  linkedDataTypes: LinkedDataType[];
  target: PaneTarget;
  // The property a followed link named, if any.
  propertyName?: string;
  // The history entry that named the target, so a repeated link
  // flashes its method again; absent on a back or forward, which
  // returns to what the reader had already seen flash.
  flashKey?: string;
  // The pane's scrolling body, for whoever restores its scroll.
  bodyRef: RefObject<HTMLDivElement>;
  onScroll: (scrollTop: number) => void;
  onClose: () => void;
}> = ({
  apis,
  linkedDataTypes,
  target,
  propertyName,
  flashKey,
  bodyRef,
  onScroll,
  onClose,
}) => {
  const typeId = typeIdOfTarget(target);
  const found =
    target.stateTypeId === undefined
      ? undefined
      : sortedAPIs(apis)
          .flatMap((api) =>
            api.stateTypes.map((stateType) => ({ api, stateType }))
          )
          .find(
            ({ api, stateType }) =>
              qualifiedName({ api, stateType }) === target.stateTypeId
          );
  const foundDataType =
    target.dataTypeId === undefined
      ? undefined
      : linkedDataTypes.find(
          (linkedDataType) => linkedDataType.id === target.dataTypeId
        );
  const flashProperty =
    propertyName === undefined || flashKey === undefined
      ? undefined
      : { id: idOfPropertyInPane(typeId, propertyName), key: flashKey };
  return (
    <div className="types-pane">
      <div className="types-pane-header">
        <span className="types-pane-title">{typeId}</span>
        <button
          type="button"
          className="types-hide"
          onClick={onClose}
          title="Close the types pane"
          aria-label="Close the types pane"
        >
          ×
        </button>
      </div>
      <div
        className="types-pane-body"
        ref={bodyRef}
        onScroll={(event) => onScroll(event.currentTarget.scrollTop)}
      >
        {foundDataType !== undefined ? (
          <DataType
            linkedDataType={foundDataType}
            flashProperty={flashProperty}
          />
        ) : found === undefined ? (
          <div className="empty">
            <code>{shortNameOfTypeName(typeId)}</code> is not declared in your
            API, just used by your code.
          </div>
        ) : (
          <StateType
            api={found.api}
            stateType={found.stateType}
            flash={
              target.method === undefined || flashKey === undefined
                ? undefined
                : { method: target.method, key: flashKey }
            }
            flashProperty={flashProperty}
          />
        )}
      </div>
    </div>
  );
};

// A custom step, one the application defines itself, which the
// grammar cannot parse: its text with the spans its author wrote in
// `backticks` as code, a span naming a state type or a method linking
// to it in the types pane, and each `<variable>` set in its hue.
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
            <TypeLink className="type-link" id={link} key={index}>
              <code>{part}</code>
            </TypeLink>
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

// How a scenario shows its saved values, state ids and users: the
// hue each is set in, keyed the way `hueKeyOfSpan` keys them, and
// which key the spans are lit up for, which a hover changes.
interface Related {
  hues: Map<string, number>;
  key: string | null;
  onRelate: (key: string | null) => void;
}

// One span of a built-in step printed from its syntax tree, styled
// by its role:
// a state type or method links to the types pane, and a save, a
// recall, a state id or a user is set in its own hue and lights up
// every other span about the same saved value, state or user.
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
      <TypeLink className="type-link" id={link}>
        <code className={className}>{span.text}</code>
      </TypeLink>
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
// A button that copies the scenario's name, to hand to whoever, or
// whatever, runs the tests: it says so for a moment once it has.
const CopyScenarioName: FC<{ name: string }> = ({ name }) => {
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
      className={copied ? "copy-scenario-name is-copied" : "copy-scenario-name"}
      title="Copy the scenario's name"
      aria-label={`Copy "${name}"`}
      // A click here copies, and does not open the scenario.
      onClick={(event) => {
        event.stopPropagation();
        navigator.clipboard.writeText(name).then(
          () => setCopied(true),
          () => setCopied(false)
        );
      }}
    >
      {copied ? (
        "copied"
      ) : (
        <svg viewBox="0 0 12 12" width="11" height="11" aria-hidden="true">
          <rect
            x="4"
            y="4"
            width="7"
            height="7"
            rx="1"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
          />
          <path
            d="M8 4 V2 a1 1 0 0 0 -1 -1 H2 a1 1 0 0 0 -1 1 v5 a1 1 0 0 0 1 1 h2"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.2"
          />
        </svg>
      )}
    </button>
  );
};

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
  // The videos of the scenario's last run in a browser, one per
  // user whose browser it drove; empty when none was recorded.
  videos: feature_pb.Video[];
  // Whether the only recordings are of an earlier version of the
  // scenario.
  recordingsStale?: boolean;
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
  videos,
  recordingsStale,
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
  const blocked = tags.includes(BLOCKED_TAG);
  return (
    <div
      className={[
        "scenario",
        expanded ? "is-expanded" : "",
        blocked ? "is-blocked" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
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
        />
        <span className="scenario-name">{name}</span>
        {name !== undefined && <CopyScenarioName name={name} />}
        {videos.map((video) => (
          <a
            className="scenario-video"
            href={recordingUrl(video.path)}
            target="_blank"
            rel="noreferrer"
            title={`"${video.user}"'s browser in the scenario's last run`}
            // A click here opens the video, not the scenario.
            onClick={(event) => event.stopPropagation()}
            key={video.user}
          >
            <svg viewBox="0 0 10 10" width="8" height="8" aria-hidden="true">
              <path d="M1.5 1 L9 5 L1.5 9 Z" fill="currentColor" />
            </svg>
            {videos.length > 1 ? `video · ${video.user}` : "video"}
          </a>
        ))}
        {recordingsStale && (
          <span
            className="scenario-video is-stale"
            title="Recorded from an earlier version of this scenario, or of a background it runs under; run it again to record it as it is now"
          >
            recording stale
          </span>
        )}
        {drivesWebApp(steps) && videos.length === 0 && !recordingsStale && (
          <Pill
            className="scenario-video is-unrecorded"
            label="not recorded yet"
            meaning="This scenario uses a web browser, run the test in order to see its video and screenshot recordings."
            mark={false}
          />
        )}
        {tags.includes(WIP_TAG) && (
          <TagPill tag="wip" title="Being worked on" />
        )}
        {tags.includes(BLOCKED_TAG) && (
          <TagPill
            tag="blocked"
            title={
              description ??
              "Describes behavior the application does not have yet"
            }
          />
        )}
        {tags.filter((tag) => tag !== BLOCKED_TAG && tag !== WIP_TAG).length >
          0 && (
          <span className="tags">
            {tags
              .filter((tag) => tag !== BLOCKED_TAG && tag !== WIP_TAG)
              .map((tag) => (
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
    videos={[]}
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
        videos={scenario.videos}
        recordingsStale={scenario.recordingsStale}
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
  <div className="rule" id={pathOfTypeOnPage("features", id)}>
    <div className="rule-heading">
      <Pill
        className="eyebrow"
        label={rule.keyword.toLowerCase()}
        meaning={DEFINITIONS.rule}
      />
      <h3>{rule.name}</h3>
      {rule.tags.includes(WIP_TAG) && (
        <TagPill tag="wip" title="Being worked on" />
      )}
      <Anchor page="features" id={id} />
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
  <section className="state-type" id={pathOfTypeOnPage("features", filename)}>
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

// One name that links to a page, in the features sidebar.
interface NamedLink {
  id: string;
  name: string;
}

// Every feature, linking to its page.
const featureLinksOf = (features: FeatureEntry[]): NamedLink[] =>
  features.map(({ filename, feature }) => ({
    id: filename,
    name: feature.name ?? filename,
  }));

// The sidebar's list of names linking to their pages, under a
// heading: rows of the sidebar's grid, so an eyebrow and a name cell
// each, with no count.
const NavLinks: FC<{
  heading: string;
  links: NamedLink[];
  page: Page;
}> = ({ heading, links, page }) => (
  <>
    <div className="eyebrow">{heading}</div>
    {links.map((link) => (
      <Link
        to={pathOfTypeOnPage(page, link.id)}
        title={link.name}
        key={link.id}
      >
        <span className="nav-name">{link.name}</span>
      </Link>
    ))}
  </>
);

// That a feature drives the web app in a browser, as the globe;
// clicking it filters the index to the features that do, and it is
// lit while that filter is on.
const WebAppToggle: FC<{
  active: boolean;
  onToggle: () => void;
  title: string;
}> = ({ active, onToggle, title }) => (
  <button
    type="button"
    className={active ? "web-app-toggle is-active" : "web-app-toggle"}
    onClick={onToggle}
    title={title}
    aria-pressed={active}
  >
    <span aria-hidden="true">🌐</span>
    <span className="visually-hidden">web app</span>
  </button>
);

// A pill for one of the tags the index filters by, '@wip' or
// '@blocked'; clicking it filters the index to the features carrying
// the tag, and it is lit while that filter is on.
const TagToggle: FC<{
  tag: "wip" | "blocked";
  active: boolean;
  onToggle: () => void;
  title: string;
}> = ({ tag, active, onToggle, title }) => (
  <button
    type="button"
    className={`tag-toggle tag-toggle-${tag}${active ? " is-active" : ""}`}
    onClick={onToggle}
    title={title}
    aria-pressed={active}
  >
    {tag}
  </button>
);

// A pill marking a rule or scenario as '@wip' or '@blocked'.
const TagPill: FC<{ tag: "wip" | "blocked"; title?: string }> = ({
  tag,
  title,
}) => (
  <span className={`tag-pill tag-pill-${tag}`} title={title}>
    {tag}
  </span>
);

// A state type as a chip that filters the index by it; lit while it
// is filtering.
const StateTypeChip: FC<{
  type: string;
  active: boolean;
  onToggle: (type: string) => void;
}> = ({ type, active, onToggle }) => (
  <button
    type="button"
    className={active ? "state-type-chip is-active" : "state-type-chip"}
    onClick={() => onToggle(type)}
    title={active ? `Stop filtering by ${type}` : `Filter by ${type}`}
  >
    {type}
  </button>
);

// The state types the index is filtered by, chosen in a box that
// holds the chosen ones as chips and, at the cursor after them, lists
// the rest as you type: a click on a listed type adds it and shows
// the list again, Enter takes the first listed, Escape closes the
// list, and a click on a chosen chip removes it.
const StateTypePicker: FC<{
  stateTypes: string[];
  selected: string[];
  onToggle: (type: string) => void;
}> = ({ stateTypes, selected, onToggle }) => {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const listed = stateTypes.filter(
    (type) =>
      !selected.includes(type) &&
      type.toLowerCase().includes(text.trim().toLowerCase())
  );
  const choose = (type: string) => {
    onToggle(type);
    setText("");
    input.current?.focus();
  };
  return (
    <div
      className={open ? "type-picker is-open" : "type-picker"}
      onMouseDown={(event) => {
        // A click on the box's empty part puts the cursor there; a
        // click on a chip or the list is theirs to handle.
        if (event.target === event.currentTarget) {
          event.preventDefault();
          input.current?.focus();
        }
      }}
    >
      {selected.map((type) => (
        <StateTypeChip type={type} active onToggle={onToggle} key={type} />
      ))}
      <input
        ref={input}
        type="text"
        className="type-picker-input"
        placeholder={
          selected.length === 0 && stateTypes.length > 0
            ? `State type, e.g., ${stateTypes[0]} ...`
            : ""
        }
        value={text}
        size={Math.max(text.length, selected.length === 0 ? 26 : 2)}
        onChange={(event) => setText(event.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && listed.length > 0) {
            event.preventDefault();
            choose(listed[0]);
          } else if (event.key === "Escape") {
            setText("");
            input.current?.blur();
          } else if (
            event.key === "Backspace" &&
            text === "" &&
            selected.length > 0
          ) {
            onToggle(selected[selected.length - 1]);
          }
        }}
        aria-label="Filter by state type"
      />
      {open && (
        <ul className="type-picker-menu" role="listbox">
          {listed.length === 0 ? (
            <li className="type-picker-none">
              {stateTypes.length === selected.length
                ? "Every state type is chosen"
                : "No state type matches"}
            </li>
          ) : (
            listed.map((type) => (
              <li
                className="type-picker-item"
                role="option"
                aria-selected={false}
                // Chosen on mouse down, before the input's blur closes
                // the list.
                onMouseDown={(event) => {
                  event.preventDefault();
                  choose(type);
                }}
                key={type}
              >
                <code className="state-type-chip">{type}</code>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
};

// What the index shows: words to find anywhere in a feature, and
// the state types a feature must name, chosen from every type the
// features name.
const FeaturesSearch: FC<{
  filter: FeatureFilter;
  stateTypes: string[];
  onChange: (filter: FeatureFilter) => void;
  onToggleStateType: (type: string) => void;
  onToggleWebApp: () => void;
  onToggleWip: () => void;
  onToggleBlocked: () => void;
}> = ({
  filter,
  stateTypes,
  onChange,
  onToggleStateType,
  onToggleWebApp,
  onToggleWip,
  onToggleBlocked,
}) => (
  <div className="features-search">
    <input
      type="search"
      className="features-search-input"
      placeholder="Search features, rules, scenarios and steps"
      value={filter.query}
      onChange={(event) => onChange({ ...filter, query: event.target.value })}
      aria-label="Search features"
    />
    <div className="features-search-types">
      <span className="features-search-label">filter by</span>
      <StateTypePicker
        stateTypes={stateTypes}
        selected={filter.stateTypes}
        onToggle={onToggleStateType}
      />
      <WebAppToggle
        active={filter.webApp}
        onToggle={onToggleWebApp}
        title={
          filter.webApp
            ? "Showing features with web app scenarios; click to show all"
            : "Show only features with web app scenarios"
        }
      />
      <TagToggle
        tag="wip"
        active={filter.wip}
        onToggle={onToggleWip}
        title={
          filter.wip
            ? "Showing features being worked on; click to show all"
            : "Show only features being worked on"
        }
      />
      <TagToggle
        tag="blocked"
        active={filter.blocked}
        onToggle={onToggleBlocked}
        title={
          filter.blocked
            ? "Showing features with blocked scenarios; click to show all"
            : "Show only features with blocked scenarios"
        }
      />
    </div>
  </div>
);

// The filter an index has none of, before anyone asks for anything.
const NO_FILTER: FeatureFilter = {
  query: "",
  stateTypes: [],
  webApp: false,
  wip: false,
  blocked: false,
};

// The key the features page keeps its filter under in the tab's
// session storage.
const FEATURE_FILTER_KEY = "features-filter";

// The filter the features page keeps for as long as the browser tab
// is open: the words, the state types and the tags asked for, and
// how a chip turns each on and off. Kept in the tab's session
// storage, so that opening a feature and coming back, or visiting
// another page and returning, finds the filter as it was, and
// closing the tab forgets it.
const useFeatureFilter = () => {
  const [filter, setFilter] = useState<FeatureFilter>(() => {
    try {
      const stored = sessionStorage.getItem(FEATURE_FILTER_KEY);
      return stored === null
        ? NO_FILTER
        : { ...NO_FILTER, ...(JSON.parse(stored) as Partial<FeatureFilter>) };
    } catch {
      return NO_FILTER;
    }
  });
  useEffect(() => {
    try {
      sessionStorage.setItem(FEATURE_FILTER_KEY, JSON.stringify(filter));
    } catch {
      // A browser refusing storage keeps the filter for the page's
      // life only.
    }
  }, [filter]);
  const toggleWebApp = () =>
    setFilter((current) => ({ ...current, webApp: !current.webApp }));
  const toggleWip = () =>
    setFilter((current) => ({ ...current, wip: !current.wip }));
  const toggleBlocked = () =>
    setFilter((current) => ({ ...current, blocked: !current.blocked }));
  const toggleStateType = (type: string) =>
    setFilter((current) => ({
      ...current,
      stateTypes: current.stateTypes.includes(type)
        ? current.stateTypes.filter((other) => other !== type)
        : [...current.stateTypes, type],
    }));
  const filtering =
    filter.query.trim() !== "" ||
    filter.stateTypes.length > 0 ||
    filter.webApp ||
    filter.wip ||
    filter.blocked;
  return {
    filter,
    setFilter,
    toggleWebApp,
    toggleWip,
    toggleBlocked,
    toggleStateType,
    filtering,
  };
};

// A method a feature exercises, as a chip linking to its state
// type's page; lit while the index is filtered by its state type.
const MethodChip: FC<{
  stateTypeId: string | undefined;
  stateTypeName: string;
  method: string;
  links: StepLinks;
  lit?: boolean;
}> = ({ stateTypeId, stateTypeName, method, links, lit = false }) => {
  const label = `${stateTypeName}.${method}`;
  const className = lit ? "method-chip is-lit" : "method-chip";
  const id =
    stateTypeId !== undefined
      ? `${stateTypeId}.${method}`
      : linkOfMethod(method, stateTypeName, links);
  return id === undefined ? (
    <code className={className}>{label}</code>
  ) : (
    <TypeLink className="type-link" id={id}>
      <code className={className}>{label}</code>
    </TypeLink>
  );
};

// What a feature exercises, as chips in alphabetical order, so that
// one state type's methods sit together; the chips of a state type
// the index is filtered by are lit.
const ExercisedMethods: FC<{
  feature: feature_pb.Feature;
  graph: GraphStateType[];
  links: StepLinks;
  litStateTypes?: string[];
}> = ({ feature, graph, links, litStateTypes = [] }) => {
  const exercised = [...exercisedMethods(feature)]
    .map((method) => ({
      ...method,
      label: `${shortNameOfTypeName(method.stateType)}.${method.method}`,
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
  if (exercised.length === 0) {
    return null;
  }
  return (
    <div className="feature-methods">
      <span className="feature-methods-label">uses</span>
      {exercised.map(({ stateType, method }) => (
        <MethodChip
          stateTypeId={graphStateTypeNamed(stateType, graph)?.id}
          stateTypeName={shortNameOfTypeName(stateType)}
          method={method}
          links={links}
          lit={litStateTypes.includes(stateType)}
          key={`${stateType}.${method}`}
        />
      ))}
    </div>
  );
};

// One feature as a card: what a person can do, what must always
// hold, how it is shown, and what it uses.
const FeatureSummaryCard: FC<{
  entry: FeatureEntry;
  filter: FeatureFilter;
  graph: GraphStateType[];
  links: StepLinks;
  onToggleWebApp: () => void;
  onToggleWip: () => void;
  onToggleBlocked: () => void;
}> = ({
  entry,
  filter,
  graph,
  links,
  onToggleWebApp,
  onToggleWip,
  onToggleBlocked,
}) => {
  const { filename, feature } = entry;
  const scenarios = scenariosOfFeature(feature).length;
  const webApp = webAppScenarioCount(feature);
  const blocked = blockedScenariosOfFeature(feature).length;
  const wip = isWip(feature);
  return (
    <section className="feature-summary">
      <div className="feature-methods-label">feature</div>
      <div className="feature-row-head">
        <Link
          className="feature-summary-name"
          to={pathOfTypeOnPage("features", filename)}
        >
          {feature.name ?? filename}
        </Link>
      </div>
      {feature.description !== undefined && (
        <p className="feature-summary-description">{feature.description}</p>
      )}
      {feature.rules.length > 0 && (
        <div className="feature-methods-label">rules</div>
      )}
      {feature.rules.length > 0 && (
        <ul className="feature-summary-rules">
          {feature.rules.map((rule, index) => (
            <li key={index}>
              <Link to={pathOfTypeOnPage("features", ruleId(filename, index))}>
                {rule.name ?? `Rule ${index + 1}`}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <ExercisedMethods
        feature={feature}
        graph={graph}
        links={links}
        litStateTypes={filter.stateTypes}
      />
      <div className="feature-row-meta">
        <Link to={pathOfTypeOnPage("features", filename)}>
          {countWithNoun(scenarios, "scenario")}
        </Link>
        {webApp > 0 && (
          <WebAppToggle
            active={filter.webApp}
            onToggle={onToggleWebApp}
            title={`${webApp} of ${scenarios} scenarios drive the web app`}
          />
        )}
        {wip && (
          <TagToggle
            tag="wip"
            active={filter.wip}
            onToggle={onToggleWip}
            title={
              feature.tags.includes(WIP_TAG)
                ? "This feature is being worked on"
                : "A rule or scenario of this feature is being worked on"
            }
          />
        )}
        {blocked > 0 && (
          <TagToggle
            tag="blocked"
            active={filter.blocked}
            onToggle={onToggleBlocked}
            title={`${blocked} of ${scenarios} scenarios are blocked`}
          />
        )}
      </div>
    </section>
  );
};

// What the features leave unexercised: the methods the API declares
// that no feature exercises, or reaches through what it exercises.
const FeaturesHealth: FC<{
  features: FeatureEntry[];
  graph: GraphStateType[];
  links: StepLinks;
}> = ({ features, graph, links }) => {
  const undescribed = undescribedMethods(features, graph);
  return (
    <div className="features-health">
      <div className="link-list">
        <div className="eyebrow">not used by any feature</div>
        {undescribed.length === 0 ? (
          <div className="empty">Every method is used.</div>
        ) : (
          <div className="feature-methods is-stacked">
            {undescribed.flatMap(({ stateType, methods }) =>
              methods.map((method) => (
                <MethodChip
                  stateTypeId={stateType.id}
                  stateTypeName={stateType.name}
                  method={method}
                  links={links}
                  key={`${stateType.id}.${method}`}
                />
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// The features page with no feature chosen: a search, then each
// feature as a card, most recently worked on first, beside what the
// features leave undescribed.
const FeaturesOverview: FC<{
  features: FeatureEntry[];
  graph: GraphStateType[];
  links: StepLinks;
}> = ({ features, graph, links }) => {
  const {
    filter,
    setFilter,
    toggleWebApp,
    toggleWip,
    toggleBlocked,
    toggleStateType,
    filtering,
  } = useFeatureFilter();
  const shown = featuresByRecency(features).filter(({ feature }) =>
    featurePasses(feature, filter)
  );
  return (
    <>
      <FeaturesSearch
        filter={filter}
        stateTypes={stateTypesOfFeatures(features)}
        onChange={setFilter}
        onToggleStateType={toggleStateType}
        onToggleWebApp={toggleWebApp}
        onToggleWip={toggleWip}
        onToggleBlocked={toggleBlocked}
      />
      <div className="features-overview">
        <div className="feature-summaries">
          {filtering && (
            <div className="eyebrow">
              {shown.length} of {features.length}
            </div>
          )}
          {shown.length === 0 ? (
            <div className="empty">No feature matches.</div>
          ) : (
            shown.map((entry) => (
              <FeatureSummaryCard
                entry={entry}
                filter={filter}
                graph={graph}
                links={links}
                onToggleWebApp={toggleWebApp}
                onToggleWip={toggleWip}
                onToggleBlocked={toggleBlocked}
                key={entry.filename}
              />
            ))
          )}
        </div>
        <FeaturesHealth features={features} graph={graph} links={links} />
      </div>
    </>
  );
};

// The first screenshot of each scenario that has one, as a gallery
// of how the feature looks in the browser.
const FeatureGallery: FC<{ filename: string; feature: feature_pb.Feature }> = ({
  filename,
  feature,
}) => {
  const shots = scenariosOfFeature(feature).flatMap((scenario) => {
    const step = scenario.steps.find((step) => step.screenshot !== undefined);
    return step?.screenshot === undefined
      ? []
      : [{ scenario, screenshot: step.screenshot }];
  });
  if (shots.length === 0) {
    return null;
  }
  return (
    <div className="feature-gallery">
      {shots.map(({ scenario, screenshot }) => (
        <Link
          className="feature-gallery-item"
          to={pathOfTypeOnPage("features", filename)}
          key={scenario.line}
        >
          <img src={recordingUrl(screenshot)} alt="" />
          <span>{scenario.name}</span>
        </Link>
      ))}
    </div>
  );
};

// One feature's page: what it looks like in the browser, what it
// exercises, and its scenarios.
const FeaturePage: FC<{
  entry: FeatureEntry;
  graph: GraphStateType[];
  links: StepLinks;
}> = ({ entry, graph, links }) => (
  <>
    <FeatureGallery filename={entry.filename} feature={entry.feature} />
    <section className="feature-implements">
      <ExercisedMethods feature={entry.feature} graph={graph} links={links} />
    </section>
    <FeatureCard
      filename={entry.filename}
      feature={entry.feature}
      links={links}
    />
  </>
);

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
      {/* A type, state or data, opens in the pane. */}
      {row.link === undefined ? (
        <span className="change-name">
          <code>{row.name}</code>
        </span>
      ) : (
        <TypeLink className="change-name" id={row.link.id}>
          <code>{row.name}</code>
        </TypeLink>
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

// The types pane's scroll for each history entry, kept as it
// scrolls, since the pane is remade for each type it shows and so
// cannot be read once the entry is left; restored the same way.
const typesScrollTops = new Map<string, number>();

const Overview: FC<{
  page: Page;
  navWidth: number;
  onNavResizing: (width: number) => void;
  onNavResized: () => void;
  paneWidth: number;
  onPaneResizing: (width: number) => void;
  onPaneResized: () => void;
  preferencesLoaded: boolean;
}> = ({
  page,
  navWidth,
  onNavResizing,
  onNavResized,
  paneWidth,
  onPaneResizing,
  onPaneResized,
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

  const typesPanel = usePanelRef();

  useEffect(() => {
    // Never resizes a drawer dragged shut: another tab's stored
    // width must not pop it open.
    if (typesPanel.current?.isCollapsed() !== true) {
      typesPanel.current?.resize(paneWidth);
    }
  }, [paneWidth, typesPanel]);

  // Whether the drawer is dragged shut, from its width, so the
  // handle renders in its place.
  const [paneCollapsed, setPaneCollapsed] = useState(false);

  // The features page names its sections by file path, whose
  // slashes a `:id` segment cannot hold, so its route matches the
  // rest of the URL as a splat instead.
  const params = useParams();
  const target =
    params.id ??
    (params["*"] === "" || params["*"] === undefined ? undefined : params["*"]);

  // What the types pane shows, from the URL, so a link to a type is
  // shareable and back and forward retrace it.
  const [searchParams, setSearchParams] = useSearchParams();

  const onClosePane = useCallback((): void => {
    setSearchParams({});
  }, [setSearchParams]);

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

  // Where the backticked spans of steps link, derived from the same
  // APIs the types pane shows, so a link can never point at a state
  // type the page does not have.
  const links = useMemo(() => stepLinks(apis), [apis]);

  // Whether an id names a state type; anything else the API knows
  // by id is a data type.
  const isStateTypeId = useMemo(() => {
    const states = new Set(
      Object.values(apis).flatMap((api) =>
        api.stateTypes.map((stateType) => qualifiedName({ api, stateType }))
      )
    );
    return (id: string): boolean => states.has(id);
  }, [apis]);

  // Whether an id names a data type the API declares.
  const isDataTypeId = useMemo(() => {
    const ids = new Set(
      linkedDataTypes.map((linkedDataType) => linkedDataType.id)
    );
    return (id: string): boolean => ids.has(id);
  }, [linkedDataTypes]);

  const paneTarget = useMemo(
    () => paneTargetOf(searchParams.get("type"), isStateTypeId, isDataTypeId),
    [searchParams, isStateTypeId, isDataTypeId]
  );

  // What the page links carry of the pane: the type it shows, but
  // not the method it last flashed.
  const carriedSearch =
    paneTarget === undefined ? "" : searchOfType(typeIdOfTarget(paneTarget));

  // A property a link asked to see, flashed in the pane once it has
  // rendered, the way a method is.
  const paneProperty = searchParams.get("property") ?? undefined;

  // The features sidebar's list.
  const featureLinks = useMemo(
    () => featureLinksOf(featureEntries),
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
      : page === "features"
      ? chosenFeature === undefined
        ? "application features"
        : "feature"
      : "application model";

  const heading =
    page === "changelog"
      ? "Changelog"
      : page === "models"
      ? `${countWithNoun(calls, "call")} between ${countWithNoun(
          graphStateTypes.length,
          "state type"
        )}`
      : chosenFeature === undefined
      ? countWithNoun(featureEntries.length, "feature")
      : chosenFeature.feature.name ?? chosenFeature.filename;

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

  // Opens one state type in the types pane, named by the URL.
  const onOpenStateType = useCallback(
    (id: string): void => {
      setSearchParams({ type: id });
    },
    [setSearchParams]
  );

  // Choosing a method in the graph also opens it in the types pane:
  // one navigation naming it as both the chosen method and the
  // pane's target, which flashes it, as any link to a method does.
  // `id` is a `methodId`, `bank.v1.Account.deposit`. Letting the
  // method go keeps the pane as it is, without its flash target.
  const onSelectMethod = useCallback(
    (id: string | null, replace?: boolean): void => {
      if (id === null) {
        navigate({ pathname: "/models", search: carriedSearch }, { replace });
        return;
      }
      navigate(
        { pathname: `/models/${id}`, search: searchOfType(id) },
        { replace }
      );
    },
    [navigate, carriedSearch]
  );

  const pane = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const loaded = !(isLoading && stateTypeCount === 0) && preferencesLoaded;

  const typesBody = useRef<HTMLDivElement>(null);

  // Whether this entry is one the reader is returning to by back or
  // forward, told by the scroll it left there: the pane then
  // restores that scroll and flashes nothing, since the method or
  // property the entry named has already had its flash. A fresh
  // load also reports `POP`, and left no scroll, so a link opened
  // in a new tab still scrolls and flashes. Decided once per entry:
  // the scroll to a method records a scroll for the entry, which
  // must not turn the entry into one being returned to.
  const returning = useMemo(
    () => navigationType === "POP" && typesScrollTops.has(location.key),
    [navigationType, location.key]
  );

  // The types pane scrolls to the method or property a followed link
  // names, once the pane has rendered it. Keyed by the history
  // entry, so following the same link again scrolls to it again. On
  // a back or forward the scroll the developer left is restored
  // below instead.
  useEffect(() => {
    if (paneTarget === undefined) {
      return;
    }
    if (returning) {
      return;
    }
    const id =
      paneProperty !== undefined
        ? idOfPropertyInPane(typeIdOfTarget(paneTarget), paneProperty)
        : paneTarget.method !== undefined
        ? idOfTypeInPane(`${paneTarget.stateTypeId}.${paneTarget.method}`)
        : undefined;
    if (id === undefined) {
      return;
    }
    document.getElementById(id)?.scrollIntoView();
  }, [returning, location.key, paneTarget, paneProperty, apis]);

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
  // at, not a page that is still loading. The types pane's body is
  // remade with the type it shows, so it is restored after it too.
  useLayoutEffect(() => {
    if (navigationType !== "POP" || !loaded) {
      return;
    }
    const scrollTop = paneScrollTops.get(location.key);
    if (scrollTop !== undefined) {
      pane.current?.scrollTo(0, scrollTop);
    }
    const typesScrollTop = typesScrollTops.get(location.key);
    if (typesScrollTop !== undefined) {
      typesBody.current?.scrollTo(0, typesScrollTop);
    }
  }, [navigationType, location.key, loaded, paneTarget]);

  // Only until the first read; while reloading, `response` keeps the
  // types last read, so the page shows those instead. The
  // preferences read is waited for too, so the first paint has the
  // panel widths the developer left.
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
    features: featureEntries.length,
    changelog: shownChangelog.length,
    models: calls,
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
          onPaneResized();
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
          <PageSelector counts={counts} search={carriedSearch} />
          {page === "features" && (
            <NavLinks heading="features" links={featureLinks} page="features" />
          )}
        </nav>
        <Checks response={response} />
      </Panel>
      <Separator className="nav-resizer" />
      <Panel className="pane-panel">
        <div
          className={page === "models" ? "pane graph-pane" : "pane"}
          ref={pane}
        >
          <header>
            <div className="eyebrow">{eyebrow}</div>
            <h1>{heading}</h1>
            {/* A feature's page names the feature up here, so its
                file, counts, and description belong here too. */}
            {page === "features" && chosenFeature !== undefined && (
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
          ) : page === "models" ? (
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
                onSelectMethod={onSelectMethod}
                onOpenStateType={onOpenStateType}
              />
            </>
          ) : featureEntries.length === 0 ? (
            <div className="empty">
              No <code>.feature</code> files found. Write one and the feature it
              describes will show up here.
            </div>
          ) : chosenFeature === undefined ? (
            <FeaturesOverview
              features={featureEntries}
              graph={graphStateTypes}
              links={links}
            />
          ) : (
            <FeaturePage
              entry={chosenFeature}
              graph={graphStateTypes}
              links={links}
              key={chosenFeature.filename}
            />
          )}
        </div>
      </Panel>
      {paneTarget !== undefined && (
        <>
          <Separator className="nav-resizer" />
          <Panel
            className="types-panel"
            panelRef={typesPanel}
            defaultSize={paneWidth}
            minSize={PANE_WIDTH.min}
            maxSize={PANE_WIDTH.max}
            collapsible
            collapsedSize={PANE_WIDTH.handle}
            onResize={({ inPixels }) => {
              const width = Math.round(inPixels);
              setPaneCollapsed(width < PANE_WIDTH.min);
              // A collapsed width is never remembered: the drawer
              // reopens at the width it was dragged shut from.
              if (width >= PANE_WIDTH.min) {
                onPaneResizing(width);
              }
            }}
          >
            {paneCollapsed ? (
              <button
                type="button"
                className="types-handle"
                onClick={() => typesPanel.current?.expand()}
                title="Show the types pane"
                aria-label="Show the types pane"
              >
                ‹
              </button>
            ) : (
              <TypesPane
                apis={apis}
                linkedDataTypes={linkedDataTypes}
                target={paneTarget}
                propertyName={paneProperty}
                flashKey={returning ? undefined : location.key}
                bodyRef={typesBody}
                onScroll={(scrollTop) =>
                  typesScrollTops.set(location.key, scrollTop)
                }
                onClose={onClosePane}
                key={typeIdOfTarget(paneTarget)}
              />
            )}
          </Panel>
        </>
      )}
    </Group>
  );
};

// Where the old state page's URLs land: the models page with the
// types pane open on what the URL named.
const StateTypeRedirect: FC = () => {
  const params = useParams();
  return (
    <Navigate
      to={{
        pathname: "/models",
        search: params.id === undefined ? "" : searchOfType(params.id),
      }}
      replace
    />
  );
};

// The preferences are the dashboard application's state: every tab
// reads the same ones, and they persist after the tab that set them
// closes.
const App: FC = () => {
  const { useGet, setSuppressOpenOnRestart, setNavWidth, setPaneWidth } =
    usePreferences({
      id: PREFERENCES_ID,
    });
  const { response } = useGet();

  const [openedNotice, setOpenedNotice] = useState(openedAutomatically);

  const navWidth = response?.navWidth ?? NAV_WIDTH.default;
  const resizing = useRef(navWidth);

  const onNavResizing = useCallback((width: number): void => {
    resizing.current = width;
  }, []);

  const onNavResized = useCallback((): void => {
    setNavWidth({ navWidth: resizing.current });
  }, [setNavWidth]);

  const paneWidth = response?.paneWidth ?? PANE_WIDTH.default;
  const paneResizing = useRef(paneWidth);

  const onPaneResizing = useCallback((width: number): void => {
    paneResizing.current = width;
  }, []);

  const onPaneResized = useCallback((): void => {
    setPaneWidth({ paneWidth: paneResizing.current });
  }, [setPaneWidth]);

  return (
    <div className="app">
      {openedNotice && (
        <OpenedNotice
          onSuppress={() => {
            setSuppressOpenOnRestart({ suppressOpenOnRestart: true });
            setOpenedNotice(false);
          }}
          onClose={() => setOpenedNotice(false)}
        />
      )}
      <HashRouter>
        <Routes>
          {PAGES.map((page) => (
            <Route
              // A feature file's path has slashes, which a `:id`
              // segment cannot hold, so the features page matches
              // the rest of the URL as a splat.
              path={page === "features" ? `/${page}/*` : `/${page}/:id?`}
              element={
                <Overview
                  page={page}
                  navWidth={navWidth}
                  onNavResizing={onNavResizing}
                  onNavResized={onNavResized}
                  paneWidth={paneWidth}
                  onPaneResizing={onPaneResizing}
                  onPaneResized={onPaneResized}
                  preferencesLoaded={response !== undefined}
                />
              }
              key={page}
            />
          ))}
          {/* The state page is the types pane now; its old URLs land
              on the models page with the pane open on what they
              named. A data type has no URL of its own anymore. */}
          <Route path="/state/:id?" element={<StateTypeRedirect />} />
          <Route
            path="/data/:id?"
            element={<Navigate to="/models" replace />}
          />
          {/* A developer returning to the dashboard starts at the
              application's model. */}
          <Route path="*" element={<Navigate to="/models" replace />} />
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
