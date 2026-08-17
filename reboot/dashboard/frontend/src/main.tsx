import { useAPI, usePreferences } from "@dashboard/dashboard_rbt_react";
import { RebootClientProvider } from "@reboot-dev/reboot-react";
import { Presence } from "@reboot-dev/reboot-std-react/presence";
import {
  FC,
  StrictMode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createRoot } from "react-dom/client";
import { v4 as uuidv4 } from "uuid";
import { API_ID, PREFERENCES_ID, PRESENCE_ID } from "./constants";
import type { Field, Method, Ref, StateType } from "./description";
import { fieldsOf, parseDescription } from "./description";

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

// A state type's namespace is its proto package: `bank.v1.Account`
// lives in `bank.v1`, which is the developer's `api/bank/v1/`.
const namespaceOf = (name: string): string =>
  name.slice(0, name.lastIndexOf("."));

const typeNameOf = (name: string): string =>
  name.slice(name.lastIndexOf(".") + 1);

// Standard-library types an application uses are real and worth being
// able to inspect, but they aren't what the developer wrote, so they
// start collapsed.
const isStandardLibrary = (namespace: string): boolean =>
  namespace.startsWith("rbt.");

const Namespace: FC<{ namespace: string; types: StateType[] }> = ({
  namespace,
  types,
}) => {
  const [open, setOpen] = useState(!isStandardLibrary(namespace));

  return (
    <div className="namespace">
      <button
        className="namespace-head"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
      >
        <span className="caret">{open ? "▾" : "▸"}</span>
        <span className="namespace-name">{namespace}</span>
        <span className="nav-count">{countOf(types.length, "state type")}</span>
      </button>
      {open && (
        <div className="namespace-types">
          {types.map((stateType) => (
            <a href={`#${stateType.name}`} key={stateType.name}>
              <span className="nav-name">{typeNameOf(stateType.name)}</span>
              <span className="nav-count">
                {countOf(stateType.methods.length, "method")}
              </span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
};

// A type's fields, and the fields of any type they hold. Nesting is
// what this page is for: a field whose type is another type is not a
// dead end, it opens.
const Fields: FC<{ fields: Field[]; depth?: number }> = ({
  fields,
  depth = 0,
}) => (
  <div className={depth === 0 ? "fields" : "fields nested"}>
    {fields.map((field) => (
      <div className="field-group" key={field.name}>
        <div className="field">
          <span className="field-name">{field.name}</span>
          <span className="field-type">
            {field.type}
            {field.optional && <span className="optional">?</span>}
          </span>
          {field.description !== undefined && (
            <span className="field-description">{field.description}</span>
          )}
        </div>
        {field.children.length > 0 && (
          <Fields fields={field.children} depth={depth + 1} />
        )}
      </div>
    ))}
  </div>
);

// A request, response or error, named and opened.
const TypeOf: FC<{ stateType: StateType; label: string; type: Ref }> = ({
  stateType,
  label,
  type,
}) => (
  <div className="type">
    <div className="type-name">
      {label} <code>{type.$ref.replace("#/$defs/", "")}</code>
    </div>
    <Fields fields={fieldsOf(stateType, type)} />
  </div>
);

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
          <div className="method-types">
            {method.request !== undefined ? (
              <TypeOf
                stateType={stateType}
                label="takes"
                type={method.request}
              />
            ) : (
              <div className="type empty">takes nothing</div>
            )}
            {method.response !== undefined ? (
              <TypeOf
                stateType={stateType}
                label="returns"
                type={method.response}
              />
            ) : (
              <div className="type empty">returns nothing</div>
            )}
            {method.errors.map((error) => (
              <TypeOf
                stateType={stateType}
                label="raises"
                type={error}
                key={error.$ref}
              />
            ))}
          </div>
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
      id={stateType.name}
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
          <span className="summary-line">
            {countOf(fields.length, "field")} ·{" "}
            {countOf(stateType.methods.length, "method")}
          </span>
        </div>
        <button
          className="expand-button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-controls={stateType.name}
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

const Overview: FC<{
  isExpanded: (name: string) => boolean;
  onToggle: (name: string) => void;
}> = ({ isExpanded, onToggle }) => {
  // The dashboard's own state: what it read of the developer's API
  // files. Nothing here reaches the application, so the application
  // does not have to exist.
  const { useGet } = useAPI({ id: API_ID });
  const { response, isLoading } = useGet();

  // What the developer's API files declare. Those exist before the
  // application is generated, built or started, which is why they are
  // what this page shows.
  // The description travels as a `google.protobuf.Value`: the types
  // in it are Pydantic's own JSON Schema, which proto has no business
  // restating.
  const read = useMemo(
    () => parseDescription(response?.stateTypes?.toJson()),
    [response?.stateTypes]
  );

  // Restarting `rbt dashboard` closes this page's connection for a
  // few seconds. Keep the last shape that was read so the page stays
  // readable across that.
  const seen = useRef<StateType[]>([]);

  if (read.length > 0) {
    seen.current = read;
  }

  const stateTypes: StateType[] = read.length ? read : seen.current;

  // Why the API files could not be read, shown beside the last shape
  // that was: a half-written file is the normal case while someone is
  // typing, and saying so beats showing nothing.
  const error = response?.error ?? "";

  const namespaces = useMemo(() => {
    const byNamespace = new Map<string, StateType[]>();
    for (const stateType of stateTypes) {
      const namespace = namespaceOf(stateType.name);
      const types = byNamespace.get(namespace);
      if (types === undefined) {
        byNamespace.set(namespace, [stateType]);
      } else {
        types.push(stateType);
      }
    }
    // The developer's own namespaces first; the standard library is
    // theirs to use but not theirs to read.
    return [...byNamespace.entries()]
      .map(([namespace, types]) => ({ namespace, types }))
      .sort((a, b) => {
        const standard =
          Number(isStandardLibrary(a.namespace)) -
          Number(isStandardLibrary(b.namespace));
        return standard !== 0
          ? standard
          : a.namespace.localeCompare(b.namespace);
      });
  }, [stateTypes]);

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

  return (
    <div className="shell">
      <nav>
        <div className="eyebrow">namespaces</div>
        {namespaces.map(({ namespace, types }) => (
          <Namespace namespace={namespace} types={types} key={namespace} />
        ))}
      </nav>
      <div className="pane">
        <header>
          <div className="eyebrow">application domain</div>
          <h1>
            {stateTypes.length} state types in {namespaces.length}{" "}
            {namespaces.length === 1 ? "namespace" : "namespaces"}
          </h1>
        </header>
        {error && <div className="error">{error}</div>}
        {stateTypes.map((stateType) => (
          <StateType
            stateType={stateType}
            expanded={isExpanded(stateType.name)}
            onToggle={() => onToggle(stateType.name)}
            key={stateType.name}
          />
        ))}
      </div>
    </div>
  );
};

// Everything the developer has told this dashboard, in one place.
// Both choices are the dashboard application's state rather than
// this page's, so they survive the tab, the hot reload and the
// `rbt dev run` they were made in.
const App: FC = () => {
  const { useGet, setSuppressOpenOnRestart, setExpanded } = usePreferences({
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
      <Overview isExpanded={isExpanded} onToggle={onToggle} />
    </div>
  );
};

const root = document.getElementById("root");

if (root !== null) {
  createRoot(root).render(
    <StrictMode>
      {/* No `url`: the page and its presence are served by the same
          application, so the client uses this page's origin. */}
      <RebootClientProvider>
        <Presence id={PRESENCE_ID} subscriberId={SUBSCRIBER_ID}>
          <App />
        </Presence>
      </RebootClientProvider>
    </StrictMode>
  );
}
