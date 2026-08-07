import { RebootClientProvider } from "@reboot-dev/reboot-react";
import { Presence } from "@reboot-dev/reboot-std-react/presence";
import { FC, StrictMode, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { v4 as uuidv4 } from "uuid";
import { useSchema } from "@dashboard/dashboard_rbt_react";
import type { MethodInfo, StateTypeInfo } from "@dashboard/dashboard_pb";
import { PRESENCE_ID, SCHEMA_ID } from "./constants";

// One subscriber per tab, for as long as the tab is open.
const SUBSCRIBER_ID = uuidv4();

const Kind: FC<{ kind: string }> = ({ kind }) => (
  <span className="kind">{kind}</span>
);

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
        <span className="nav-count">{types.length}</span>
      </button>
      {open && (
        <div className="namespace-types">
          {types.map((stateType) => (
            <a href={`#${stateType.name}`} key={stateType.name}>
              <span className="nav-name">{typeNameOf(stateType.name)}</span>
              <span className="nav-count">{stateType.methods.length}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
};

const Method: FC<{ method: MethodInfo }> = ({ method }) => {
  const args = method.arguments
    .map((argument) => `${argument.name}: ${argument.type}`)
    .join(", ");

  return (
    <div className="method" id={`m-${method.name}`}>
      <div className="method-head">
        <div className="method-title">
          <span className="method-name">{method.name}</span>
          {method.constructor && <span className="tag">constructor</span>}
          <Kind kind={method.kind} />
          {method.mcp && <span className="tag">mcp</span>}
        </div>
        {method.description !== undefined && (
          <p className="method-description">{method.description}</p>
        )}
      </div>
      <div className="method-signature">
        <span>
          ({args}) <span className="arrow">→</span>{" "}
          <span className="returns">{method.returns || "nothing"}</span>
        </span>
        {method.errors.length > 0 && (
          <span className="errors">raises {method.errors.join(", ")}</span>
        )}
      </div>
    </div>
  );
};

const StateType: FC<{ stateType: StateTypeInfo }> = ({ stateType }) => (
  <section className="state-type" id={stateType.name}>
    <div className="eyebrow">state type</div>
    <h2>{stateType.name.split(".").pop()}</h2>
    <div className="file">{stateType.file}</div>

    <div className="eyebrow section">state</div>
    {stateType.fields.length === 0 ? (
      <div className="empty">No state fields — the key is the whole state.</div>
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
        <Method method={method} key={method.name} />
      ))}
    </div>
  </section>
);

const Overview = () => {
  // A reactive read of the companion's own state: the companion
  // watches the application across restarts and records what it sees,
  // and this is pushed whatever it records. Nothing here polls, and
  // nothing here reaches the application directly.
  const { useGet } = useSchema({ id: SCHEMA_ID });
  const { response, isLoading } = useGet();

  // `rbt dev run` restarts the companion along with the application,
  // which closes this page's connection for a few seconds. Keep the
  // last shape that was read so the page stays readable across that,
  // marked as no longer current rather than emptied.
  const seen = useRef<StateTypeInfo[]>([]);

  if (response !== undefined && response.stateTypes.length > 0) {
    seen.current = response.stateTypes;
  }

  const stateTypes: StateTypeInfo[] = response?.stateTypes.length
    ? response.stateTypes
    : seen.current;
  const connected = response?.connected ?? false;

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
        <p className="muted">Reading your application…</p>
      </main>
    );
  }

  if (stateTypes.length === 0) {
    return (
      <main>
        <h1>Reboot application</h1>
        <p className="muted">
          Waiting for your application. Is <code>rbt dev run</code> serving?
        </p>
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
          <div className="eyebrow">reboot application</div>
          <h1>
            {stateTypes.length} state types in {namespaces.length}{" "}
            {namespaces.length === 1 ? "namespace" : "namespaces"}
          </h1>
          {!connected && (
            <p className="stale">
              Your application isn't answering. This is the last shape seen, not
              what is running now.
            </p>
          )}
        </header>
        {stateTypes.map((stateType) => (
          <StateType stateType={stateType} key={stateType.name} />
        ))}
      </div>
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
          <Overview />
        </Presence>
      </RebootClientProvider>
    </StrictMode>
  );
}
