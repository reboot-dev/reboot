import type {
  MethodCalls,
  MethodInfo,
  StateTypeInfo,
} from "@dashboard/dashboard_pb";
import { Call_How, Unanalyzed_Why } from "@dashboard/dashboard_pb";
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

// A pill, with its definition a hover away when it has one. The
// small mark is what says there is something to hover.
const Pill: FC<{ className: string; label: string; meaning?: string }> = ({
  className,
  label,
  meaning,
}) =>
  meaning === undefined ? (
    <span className={className}>{label}</span>
  ) : (
    <span className={`${className} defined`}>
      {label}
      <span className="define-mark" aria-hidden="true">
        ?
      </span>
      <span className="definition" role="tooltip">
        {meaning}
      </span>
    </span>
  );

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

const Namespace: FC<{ namespace: string; types: StateTypeInfo[] }> = ({
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

// How a call is written, as the verb to put in front of it. What the
// developer wrote is a chain; what they meant is one of these.
const HOW: Record<Call_How, string> = {
  [Call_How.UNKNOWN]: "calls",
  [Call_How.CALL]: "calls",
  [Call_How.CONSTRUCT]: "constructs",
  [Call_How.SCHEDULE]: "schedules",
  [Call_How.SPAWN]: "spawns",
  [Call_How.REACTIVELY]: "watches",
  [Call_How.UNTIL]: "waits on",
  [Call_How.READ]: "reads",
  [Call_How.WRITE]: "writes",
};

// What could not be followed, said as what it means for the list it
// sits under: not that nothing is called, but that this is not all of
// it.
const WHY: Record<Unanalyzed_Why, string> = {
  [Unanalyzed_Why.UNKNOWN]: "could not be read",
  [Unanalyzed_Why.CONTEXT_PASSED_TO_UNKNOWN_FUNCTION]:
    "calls something this could not read",
  [Unanalyzed_Why.REFERENCE_ESCAPED]: "keeps a reference this cannot follow",
  [Unanalyzed_Why.UNKNOWN_METHOD]: "names its method only when it runs",
};

// What a method's implementation calls, read from the developer's
// source rather than declared in their API.
const Calls: FC<{ calls: MethodCalls }> = ({ calls }) => (
  <div className="method-calls">
    {calls.calls.map((call) => (
      <div
        className="call"
        key={`${call.how}.${call.stateType}.${call.method}`}
      >
        <span className="call-how">{HOW[call.how]}</span>{" "}
        {/* The section a state type is rendered in carries its full
            name as an id, so a call is a link to what it calls. */}
        <a className="call-target" href={`#${call.stateType}`}>
          <span title={call.stateType}>{typeNameOf(call.stateType)}</span>
          {call.method !== "" && (
            <span className="call-method">.{call.method}</span>
          )}
        </a>
      </div>
    ))}
    {calls.unanalyzed.map((entry) => (
      <div className="call call-unanalyzed" key={entry.expression}>
        <code className="call-expression">{entry.expression}</code>{" "}
        <span className="call-why">{WHY[entry.why]}</span>
      </div>
    ))}
  </div>
);

const Method: FC<{ method: MethodInfo; calls?: MethodCalls }> = ({
  method,
  calls,
}) => {
  const args = method.arguments
    .map((argument) => `${argument.name}: ${argument.type}`)
    .join(", ");

  // The response's keys and value types, spelled the way a Python
  // reader would write them.
  const returns = method.returns
    .map((field) => `${field.name}: ${field.type}`)
    .join(", ");

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
          <div className="method-signature">
            <span>
              ({args}) <span className="arrow">→</span>{" "}
              <span className="returns">
                {method.returns.length > 0 ? `{${returns}}` : "None"}
              </span>
            </span>
            {method.errors.length > 0 && (
              <span className="errors">raises {method.errors.join(", ")}</span>
            )}
          </div>
          {/* After the signature, which is what comes in and out;
              this is what goes back out to the rest of the
              application. */}
          {calls !== undefined && <Calls calls={calls} />}
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
  stateType: StateTypeInfo;
  expanded: boolean;
  onToggle: () => void;
  callsOf: (method: string) => MethodCalls | undefined;
}> = ({ stateType, expanded, onToggle, callsOf }) => {
  const section = useSlidingPills(expanded);

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
            {countOf(stateType.fields.length, "field")} ·{" "}
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
      {stateType.fields.length === 0 ? (
        <div className="empty">
          No state fields. The key is the whole state.
        </div>
      ) : (
        <div className="fields">
          {stateType.fields.map((field) => (
            <div className="field" key={field.name}>
              <span className="field-name">{field.name}</span>
              <span className="field-type">{field.type}</span>
            </div>
          ))}
        </div>
      )}

      <div className="eyebrow section">methods</div>
      <div className="methods">
        {stateType.methods.map((method) => (
          <Method
            method={method}
            calls={callsOf(method.name)}
            key={method.name}
          />
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
  const read = response?.stateTypes;

  // Restarting `rbt dashboard` closes this page's connection for a
  // few seconds. Keep the last shape that was read so the page stays
  // readable across that.
  const seen = useRef<StateTypeInfo[]>([]);

  if (read !== undefined && read.length > 0) {
    seen.current = read;
  }

  const stateTypes: StateTypeInfo[] = read?.length ? read : seen.current;

  // Why the API files could not be read, shown beside the last shape
  // that was: a half-written file is the normal case while someone is
  // typing, and saying so beats showing nothing.
  const error = response?.error ?? "";

  // What the developer's servicers call, read from their source files.
  // Kept across a reconnect the same way the shape is, so a restart
  // does not empty the calls out from under a page that still shows
  // the methods making them.
  const analyzed = response?.methodCalls;
  const seenCalls = useRef<MethodCalls[]>([]);

  if (analyzed !== undefined && analyzed.length > 0) {
    seenCalls.current = analyzed;
  }

  const calls = useMemo(() => {
    const byMethod = new Map<string, MethodCalls>();
    for (const one of analyzed?.length ? analyzed : seenCalls.current) {
      byMethod.set(`${one.stateType}.${one.method}`, one);
    }
    return byMethod;
  }, [analyzed]);

  const namespaces = useMemo(() => {
    const byNamespace = new Map<string, StateTypeInfo[]>();
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
            callsOf={(method) => calls.get(`${stateType.name}.${method}`)}
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
