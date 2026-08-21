// The call graph page: who calls whom, drawn from the static
// analysis (`ImplementationMethods`) joined with the API
// (`APIMethods`). Two levels: packages, and inside an expanded
// package, its state types with a row per method. Each package
// expands independently, in place; clicking a method keeps only the
// calls it makes at full strength, which is how a crowded graph is
// narrowed to one question.
//
// React Flow draws; ELK places. React Flow deliberately has no
// layout of its own, and ELK understands hierarchy: state types
// inside packages.
import ELK from "elkjs/lib/elk.bundled.js";
import {
  Background,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  Handle,
  MarkerType,
  Panel,
  Position,
  ReactFlow,
  ViewportPortal,
  ReactFlowProvider,
  getBezierPath,
  useReactFlow,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FC, ReactNode } from "react";
import { createPortal } from "react-dom";
import type {
  GraphMethod,
  GraphPackage,
  GraphStateType,
  How,
  MethodKind,
} from "./callgraph";
import { packageOf } from "./callgraph";

// One colour per kind of method, the same hues the kind pills wear
// elsewhere on the dashboard, so a purple edge here and a purple
// pill there say the same thing.
const KIND_COLOR: Record<MethodKind, string> = {
  reader: "hsl(166 55% 35%)",
  writer: "hsl(211 72% 45%)",
  transaction: "hsl(275 50% 50%)",
  workflow: "hsl(36 85% 42%)",
};

// An edge whose source package is collapsed carries every kind at
// once, so it is no kind's colour.
const NEUTRAL_COLOR = "hsl(211 25% 60%)";

// What a label is written in: the same hues, but dark enough to
// read at a label's size. These are the text colours the kind
// pills use on the state types page.
const KIND_TEXT: Record<MethodKind, string> = {
  reader: "hsl(166 55% 27%)",
  writer: "hsl(211 72% 32%)",
  transaction: "hsl(275 50% 38%)",
  workflow: "hsl(28 80% 33%)",
};

const NEUTRAL_TEXT = "hsl(211 25% 40%)";

// How a call is reached, said in one word on the edge. A plain call
// says nothing: it is the ordinary case, and labelling every edge
// "calls" would be noise, and a reactive call is a call like any
// other here: what matters is who it reaches.
const HOW_LABEL: Partial<Record<How, string>> = {
  construct: "constructs",
  schedule: "schedules",
  spawn: "spawns",
};

// A call reached later (scheduled, spawned) is dashed: it is not
// the arrow of control passing right now.
const HOW_DASH: Partial<Record<How, string>> = {
  schedule: "7 5",
  spawn: "7 5",
};

// The measurements layout works from. The state type node's height
// is arithmetic on its method count, so ELK can place boxes without
// rendering them first.
const ROW_HEIGHT = 26;
const STATE_TYPE_HEADER = 34;
const STATE_TYPE_PAD = 8;
const STATE_TYPE_WIDTH = 210;
const PACKAGE_WIDTH = 200;
const PACKAGE_HEIGHT = 78;
const GROUP_HEADER = 38;
const GROUP_PAD = 20;

const stateTypeHeight = (stateType: GraphStateType): number =>
  STATE_TYPE_HEADER + stateType.methods.length * ROW_HEIGHT + STATE_TYPE_PAD;

const pkgNodeId = (pkg: string): string => `pkg:${pkg}`;

// ---------------------------------------------------------------
// Layout.

const elk = new ELK();

interface Placed {
  nodes: Node[];
}

// Where everything goes. Inside each expanded package its state
// types are layered left to right, and so are the packages
// themselves: callers to the left of what they call, the way an
// edge leaves a row on its right and enters one on its left. A
// layered layout places boxes by their size, so an open package,
// however big its interior, never lands on a neighbour.
const layoutGraph = async (
  packages: GraphPackage[],
  expanded: ReadonlySet<string>
): Promise<Placed> => {
  // Each expanded package's interior, laid out alone: what one
  // package looks like inside does not depend on where the others
  // sit.
  const interiors = new Map<
    string,
    { at: Map<string, { x: number; y: number }>; width: number; height: number }
  >();

  for (const pkg of packages) {
    if (!expanded.has(pkg.name)) {
      continue;
    }
    const inside = new Set(pkg.stateTypes.map((stateType) => stateType.id));
    const pairs = new Set<string>();
    for (const stateType of pkg.stateTypes) {
      for (const method of stateType.methods) {
        for (const call of method.calls) {
          if (inside.has(call.stateType) && call.stateType !== stateType.id) {
            pairs.add(`${stateType.id}>${call.stateType}`);
          }
        }
      }
    }
    const laid = await elk.layout({
      id: pkg.name,
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.direction": "RIGHT",
        "elk.spacing.nodeNode": "36",
        "elk.layered.spacing.nodeNodeBetweenLayers": "70",
      },
      children: pkg.stateTypes.map((stateType) => ({
        id: stateType.id,
        width: STATE_TYPE_WIDTH,
        height: stateTypeHeight(stateType),
      })),
      edges: [...pairs].map((pair) => {
        const [from, to] = pair.split(">");
        return { id: pair, sources: [from], targets: [to] };
      }),
    });

    const at = new Map<string, { x: number; y: number }>();
    let width = 0;
    let height = 0;
    for (const child of laid.children ?? []) {
      at.set(child.id, { x: child.x ?? 0, y: child.y ?? 0 });
      width = Math.max(width, (child.x ?? 0) + (child.width ?? 0));
      height = Math.max(height, (child.y ?? 0) + (child.height ?? 0));
    }
    interiors.set(pkg.name, {
      at,
      width: width + 2 * GROUP_PAD,
      height: height + GROUP_HEADER + GROUP_PAD,
    });
  }

  // The top level: one box per package, expanded ones at the size
  // their interior came out.
  const pairs = new Set<string>();
  for (const pkg of packages) {
    for (const stateType of pkg.stateTypes) {
      for (const method of stateType.methods) {
        for (const call of method.calls) {
          const target = packageOf(call.stateType);
          if (target !== pkg.name) {
            pairs.add(`${pkg.name}>${target}`);
          }
        }
      }
    }
  }

  const top = await elk.layout({
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.spacing.nodeNode": "60",
      "elk.layered.spacing.nodeNodeBetweenLayers": "140",
      // Ties broken by the order the packages are declared in, so
      // the same graph always comes out the same way and opening a
      // box does not reshuffle its neighbours.
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
    },
    children: packages.map((pkg) => {
      const interior = interiors.get(pkg.name);
      return {
        id: pkgNodeId(pkg.name),
        width: interior?.width ?? PACKAGE_WIDTH,
        height: interior?.height ?? PACKAGE_HEIGHT,
      };
    }),
    edges: [...pairs].map((pair) => {
      const [from, to] = pair.split(">");
      return { id: pair, sources: [pkgNodeId(from)], targets: [pkgNodeId(to)] };
    }),
  });

  const topAt = new Map<string, { x: number; y: number }>();
  for (const child of top.children ?? []) {
    topAt.set(child.id, { x: child.x ?? 0, y: child.y ?? 0 });
  }

  // A parent must precede its children in the node array: React
  // Flow resolves relative positions in order.
  const nodes: Node[] = [];
  for (const pkg of packages) {
    const position = topAt.get(pkgNodeId(pkg.name)) ?? { x: 0, y: 0 };
    const interior = interiors.get(pkg.name);
    if (interior === undefined) {
      nodes.push({
        id: pkgNodeId(pkg.name),
        type: "package",
        position,
        width: PACKAGE_WIDTH,
        height: PACKAGE_HEIGHT,
        data: {
          name: pkg.name,
          stateTypes: pkg.stateTypes.length,
          methods: pkg.stateTypes.reduce(
            (n, stateType) => n + stateType.methods.length,
            0
          ),
        },
      });
      continue;
    }
    nodes.push({
      id: pkgNodeId(pkg.name),
      type: "packageGroup",
      position,
      width: interior.width,
      height: interior.height,
      data: { name: pkg.name },
    });
    for (const stateType of pkg.stateTypes) {
      const at = interior.at.get(stateType.id) ?? { x: 0, y: 0 };
      nodes.push({
        id: stateType.id,
        type: "stateType",
        parentId: pkgNodeId(pkg.name),
        position: { x: at.x + GROUP_PAD, y: at.y + GROUP_HEADER },
        width: STATE_TYPE_WIDTH,
        data: { stateType },
      });
    }
  }

  return { nodes };
};

// ---------------------------------------------------------------
// Edges.

interface CallEdgeData extends Record<string, unknown> {
  how?: How;
  kind?: MethodKind;
  count: number;
  // Which method the call leaves from, when its package is open.
  // This is what clicking a method filters by.
  sourceMethodId?: string;
  // Set while some other method is chosen. The label fades off
  // this rather than off the edge's class: `EdgeLabelRenderer`
  // draws labels in a layer of their own, out of the class's
  // reach.
  faded?: boolean;
  // Set while this edge's own method is chosen: the edge is one of
  // the few being read, and its label is lifted over the nodes.
  highlighted?: boolean;
}

// The edges as the current expansion shows them. A call whose
// source package is open leaves from its own method row; otherwise
// it leaves from the package box, and every call the box hides
// folds into one counted edge.
const edgesOf = (
  packages: GraphPackage[],
  expanded: ReadonlySet<string>
): Edge<CallEdgeData>[] => {
  const grouped = new Map<string, Edge<CallEdgeData>>();

  for (const pkg of packages) {
    const sourceExpanded = expanded.has(pkg.name);
    for (const stateType of pkg.stateTypes) {
      for (const method of stateType.methods) {
        for (const call of method.calls) {
          // A workflow's inline `read`/`write` of its own state names
          // no method and reaches no other node, so it isn't drawn:
          // an arrow from a method back to its own card's header
          // would read as a call to some method it cannot name.
          if (
            (call.how === "read" || call.how === "write") &&
            call.stateType === stateType.id
          ) {
            continue;
          }

          // An `until` is a wait on another state's reader, not a
          // call the developer made to it, so it is not drawn.
          if (call.how === "until") {
            continue;
          }

          const targetPkg = packageOf(call.stateType);
          const targetExpanded = expanded.has(targetPkg);

          // A call inside a closed box is that box's business.
          if (!sourceExpanded && !targetExpanded && targetPkg === pkg.name) {
            continue;
          }

          const source = sourceExpanded ? stateType.id : pkgNodeId(pkg.name);
          const sourceHandle = sourceExpanded ? `s:${method.name}` : undefined;
          const target = targetExpanded ? call.stateType : pkgNodeId(targetPkg);
          // A call that names no method lands on the card's header.
          const targetHandle = targetExpanded
            ? call.method === ""
              ? "t:head"
              : `t:${call.method}`
            : undefined;

          const key = sourceExpanded
            ? `${source}|${sourceHandle}|${target}|${targetHandle ?? ""}|${
                call.how
              }`
            : `${source}|${target}|${targetHandle ?? ""}`;

          const held = grouped.get(key);
          if (held !== undefined) {
            held.data!.count += 1;
            continue;
          }
          grouped.set(key, {
            id: key,
            source,
            sourceHandle,
            target,
            targetHandle,
            type: "call",
            data: {
              how: sourceExpanded ? call.how : undefined,
              kind: sourceExpanded ? method.kind : undefined,
              count: 1,
              sourceMethodId: sourceExpanded ? method.id : undefined,
            },
          });
        }
      }
    }
  }

  return [...grouped.values()].map((edge) => {
    const color = edge.data!.kind ? KIND_COLOR[edge.data!.kind] : NEUTRAL_COLOR;
    return {
      ...edge,
      markerEnd: { type: MarkerType.ArrowClosed, color, width: 16, height: 16 },
    };
  });
};

// ---------------------------------------------------------------
// The pieces React Flow draws.

// Both handles are invisible: a package box is called as a whole,
// and the edge just needs somewhere to land.
const PackageNode: FC<
  NodeProps<Node<{ name: string; stateTypes: number; methods: number }>>
> = memo(({ data }) => (
  <div className="graph-package">
    <Handle type="target" position={Position.Left} className="graph-port" />
    <div className="graph-package-name">{data.name}</div>
    <div className="graph-package-counts">
      {data.stateTypes} state type{data.stateTypes === 1 ? "" : "s"} ·{" "}
      {data.methods} method{data.methods === 1 ? "" : "s"}
    </div>
    <div className="graph-package-hint">click to expand</div>
    <Handle type="source" position={Position.Right} className="graph-port" />
  </div>
));

const PackageGroupNode: FC<
  NodeProps<Node<{ name: string; onCollapse?: (name: string) => void }>>
> = memo(({ data }) => (
  <div className="graph-group">
    <div className="graph-group-head">
      <span className="graph-group-name">{data.name}</span>
      <button
        className="graph-group-collapse"
        onClick={(event) => {
          event.stopPropagation();
          data.onCollapse?.(data.name);
        }}
      >
        collapse
      </button>
    </div>
  </div>
));

interface StateTypeData extends Record<string, unknown> {
  stateType: GraphStateType;
  selectedMethod?: string | null;
  onSelectMethod?: (id: string) => void;
}

// The legend's definition tooltip, for a mark inside the canvas. The
// canvas scales and stacks its nodes, so a tooltip kept inside one
// would shrink with the zoom and could be painted under a neighbour:
// this one is rendered outside the canvas, at the mark's screen
// position, for as long as the pointer is on the mark.
const CanvasTip: FC<{
  className: string;
  tip: string;
  children: ReactNode;
}> = ({ className, tip, children }) => {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);
  return (
    <span
      className={className}
      onPointerEnter={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        setAt({ x: rect.left + rect.width / 2, y: rect.top });
      }}
      onPointerLeave={() => setAt(null)}
    >
      {children}
      {at !== null &&
        createPortal(
          <span
            className="definition graph-tip"
            role="tooltip"
            style={{ left: at.x, top: at.y }}
          >
            {tip}
          </span>,
          document.body
        )}
    </span>
  );
};

const MethodRow: FC<{
  method: GraphMethod;
  selected: boolean;
  onSelect?: (id: string) => void;
}> = ({ method, selected, onSelect }) => (
  <div
    className={
      selected
        ? `graph-method graph-kind-${method.kind} selected`
        : `graph-method graph-kind-${method.kind}`
    }
    onClick={(event) => {
      event.stopPropagation();
      onSelect?.(method.id);
    }}
    title={`${method.kind}${method.factory ? ", factory" : ""}`}
  >
    <Handle
      type="target"
      position={Position.Left}
      id={`t:${method.name}`}
      className="graph-port"
    />
    <span className="graph-method-dot" aria-hidden="true" />
    <span className="graph-method-name">{method.name}</span>
    {method.factory && <span className="graph-method-factory">new</span>}
    {method.ambiguous.length > 0 && (
      <CanvasTip
        className="graph-method-ambiguous"
        tip={
          "Ambiguous: this method hands its context to " +
          `${method.ambiguous.join(", ")}, which the analysis cannot ` +
          "see into, so it may make calls the graph does not show."
        }
      >
        ?
      </CanvasTip>
    )}
    <Handle
      type="source"
      position={Position.Right}
      id={`s:${method.name}`}
      className="graph-port"
    />
  </div>
);

const StateTypeNode: FC<NodeProps<Node<StateTypeData>>> = memo(({ data }) => (
  <div className="graph-state-type">
    <div className="graph-state-type-head">
      <Handle
        type="target"
        position={Position.Left}
        id="t:head"
        className="graph-port"
      />
      {data.stateType.name}
    </div>
    {data.stateType.methods.map((method) => (
      <MethodRow
        method={method}
        selected={data.selectedMethod === method.id}
        onSelect={data.onSelectMethod}
        key={method.id}
      />
    ))}
  </div>
));

const CallEdge: FC<EdgeProps<Edge<CallEdgeData>>> = ({
  id,
  source,
  target,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  markerEnd,
}) => {
  let path: string;
  let labelX: number;
  let labelY: number;

  if (source === target) {
    // A state calling itself: out the right side, around, and back
    // in the left. Below when the target row is level or lower,
    // above when it is higher, so the loop swings away from the
    // rows between. The swing grows with the distance between the
    // rows, so two loops on one state travel at different depths
    // and their labels land apart instead of on each other. Loops
    // between the same two rows, such as a workflow's `read` and
    // `write` of its own state, still coincide, so each edge adds
    // a small depth of its own, dealt from its id.
    const below = targetY >= sourceY - 1;
    const dealt =
      ([...id].reduce((sum, c) => sum + c.charCodeAt(0), 0) % 3) * 14;
    const depth = 46 + Math.abs(targetY - sourceY) * 0.35 + dealt;
    const swing = below ? depth : -depth;
    path =
      `M ${sourceX},${sourceY} C ${sourceX + 70},${sourceY + swing} ` +
      `${targetX - 70},${targetY + swing} ${targetX},${targetY}`;
    labelX = (sourceX + targetX) / 2;
    labelY = (sourceY + targetY) / 2 + swing * 0.75;
  } else {
    [path, labelX, labelY] = getBezierPath({
      sourceX,
      sourceY,
      targetX,
      targetY,
      sourcePosition,
      targetPosition,
    });
  }

  const kind = data?.kind;
  const how = data?.how;
  const color = kind ? KIND_COLOR[kind] : NEUTRAL_COLOR;
  const dash =
    (how && HOW_DASH[how]) ?? (kind === "workflow" ? "4 4" : undefined);
  const count = data?.count ?? 1;
  const label =
    data?.sourceMethodId === undefined
      ? `${count} call${count === 1 ? "" : "s"}`
      : how
      ? HOW_LABEL[how]
      : undefined;

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        style={{ stroke: color, strokeWidth: 1.6, strokeDasharray: dash }}
      />
      {label !== undefined &&
        // Labels sit under the nodes, where one crossing a card tucks
        // behind it rather than covering what the card says. The
        // labels of a chosen method's edges are the ones being read,
        // so those alone are lifted over the nodes, through the
        // viewport portal, whose layer is above them.
        (data?.highlighted ? (
          <ViewportPortal>
            <div
              className="graph-edge-label"
              style={{
                transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
                color: kind ? KIND_TEXT[kind] : NEUTRAL_TEXT,
              }}
            >
              {label}
            </div>
          </ViewportPortal>
        ) : (
          <EdgeLabelRenderer>
            <div
              className="graph-edge-label"
              style={{
                transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
                color: kind ? KIND_TEXT[kind] : NEUTRAL_TEXT,
                opacity: data?.faded ? 0.1 : 1,
              }}
            >
              {label}
            </div>
          </EdgeLabelRenderer>
        ))}
    </>
  );
};

// A short line drawn the way a family of edges is drawn, for the
// legend. The samples are neutral: an edge's colour comes from its
// method, which the legend's dots already explain.
const LegendLine: FC<{ dash?: string }> = ({ dash }) => (
  <svg className="graph-legend-line" viewBox="0 0 30 8" aria-hidden="true">
    <path
      d="M 1 4 H 29"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeDasharray={dash}
      fill="none"
    />
  </svg>
);

// What the colours and line styles mean, in the graph's own corner.
// One entry per thing the graph says without words. A `<details>`,
// so it folds down to its title once the reader knows it.
const Legend: FC = () => (
  <Panel position="top-right">
    <details className="graph-legend" open>
      <summary className="eyebrow">legend</summary>
      <div className="graph-legend-rows">
        {(["reader", "writer", "transaction", "workflow"] as const).map(
          (kind) => (
            <div className={`graph-legend-row graph-kind-${kind}`} key={kind}>
              <span className="graph-method-dot" aria-hidden="true" />
              <span>{kind}</span>
            </div>
          )
        )}
      </div>
      <div className="graph-legend-rows">
        <div className="graph-legend-row">
          <LegendLine />
          <span>calls</span>
        </div>
        <div className="graph-legend-row">
          <LegendLine dash="7 5" />
          <span>schedules · spawns</span>
        </div>
      </div>
      <div className="graph-legend-rows">
        <div className="graph-legend-row">
          <span className="graph-method-factory">new</span>
          <span>constructs state</span>
        </div>
        <div className="graph-legend-row defined">
          <span className="graph-method-ambiguous">?</span>
          <span>ambiguous</span>
          <span className="definition" role="tooltip">
            The analysis lost track of this method partway: it handed its
            context to a helper the analysis cannot see into, so the method may
            make calls the graph does not show. The mark on a method names the
            helpers.
          </span>
        </div>
      </div>
    </details>
  </Panel>
);

const nodeTypes = {
  package: PackageNode,
  packageGroup: PackageGroupNode,
  stateType: StateTypeNode,
};

const edgeTypes = { call: CallEdge };

// ---------------------------------------------------------------
// The page.

const GraphCanvas: FC<{ packages: GraphPackage[] }> = ({ packages }) => {
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const [nodes, setNodes] = useState<Node[]>([]);
  const { fitView } = useReactFlow();

  // The layout run that still matters. Expanding twice quickly
  // starts two async layouts; only the last one's answer lands.
  const run = useRef(0);

  // Where each package's box was after the last layout, and which
  // one the last click opened or closed. A new layout is shifted so
  // that box stays where it was: it grows or shrinks in place, and
  // the reader's eye, which is on it, never has to chase it.
  const placed = useRef(new Map<string, { x: number; y: number }>());
  const anchor = useRef<string | null>(null);
  // Set when the next layout should be framed whole: the first, and
  // one that opened or closed every box at once, which changes the
  // graph too much for any one spot to be the one to hold still.
  const refit = useRef(true);

  useEffect(() => {
    const current = ++run.current;
    layoutGraph(packages, expanded).then(({ nodes }) => {
      if (run.current !== current) {
        return;
      }

      const was =
        anchor.current === null
          ? undefined
          : placed.current.get(anchor.current);
      const now = nodes.find((node) => node.id === anchor.current)?.position;
      const shift =
        was !== undefined && now !== undefined
          ? { x: was.x - now.x, y: was.y - now.y }
          : { x: 0, y: 0 };
      // Only the top level moves: a state type's position is
      // relative to its package and goes along with it.
      for (const node of nodes) {
        if (node.parentId === undefined) {
          node.position = {
            x: node.position.x + shift.x,
            y: node.position.y + shift.y,
          };
        }
      }
      placed.current = new Map(
        nodes
          .filter((node) => node.parentId === undefined)
          .map((node) => [node.id, node.position])
      );

      setNodes(nodes);

      // Framed once React has drawn it and React Flow has measured
      // it: one frame renders; the next has the measurements. Other
      // than that the camera is the reader's: a box opening in place
      // can be followed, a jump to a new framing cannot.
      if (refit.current) {
        refit.current = false;
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            fitView({ padding: 0.15, duration: 400 });
          });
        });
      }
    });
  }, [packages, expanded, fitView]);

  const edges = useMemo(
    () => edgesOf(packages, expanded),
    [packages, expanded]
  );

  // Opening and closing boxes leaves the chosen method chosen, so
  // its calls can be followed into whichever box they land in. Only
  // closing the method's own box lets go of it: its row is gone.
  const toggle = useCallback(
    (name: string) => {
      anchor.current = pkgNodeId(name);
      const closing = expanded.has(name);
      setExpanded((expanded) => {
        const next = new Set(expanded);
        if (closing) {
          next.delete(name);
        } else {
          next.add(name);
        }
        return next;
      });
      if (closing) {
        setSelected((selected) =>
          selected !== null &&
          packageOf(selected.split(".").slice(0, -1).join(".")) === name
            ? null
            : selected
        );
      }
    },
    [expanded]
  );

  // Every box at once. Closing them all closes the chosen method's
  // box with the rest, so the choice goes too.
  const setAll = useCallback(
    (open: boolean) => {
      anchor.current = null;
      refit.current = true;
      setExpanded(new Set(open ? packages.map((pkg) => pkg.name) : []));
      if (!open) {
        setSelected(null);
      }
    },
    [packages]
  );

  const selectMethod = useCallback((id: string) => {
    setSelected((selected) => (selected === id ? null : id));
  }, []);

  // With a method chosen, everything that is not it, one of its
  // calls, or a box holding one of those steps back.
  const involved = useMemo(() => {
    if (selected === null) {
      return null;
    }
    const kept = new Set<string>();
    for (const edge of edges) {
      if (edge.data?.sourceMethodId === selected) {
        kept.add(edge.source);
        kept.add(edge.target);
      }
    }
    // The method's own node, even if it calls nothing: the click
    // should never fade what was clicked.
    kept.add(selected.split(".").slice(0, -1).join("."));
    return kept;
  }, [selected, edges]);

  const shownNodes = useMemo(
    () =>
      nodes.map((node) => {
        const faded =
          involved !== null &&
          node.type !== "packageGroup" &&
          !involved.has(node.id);
        const data =
          node.type === "stateType"
            ? {
                ...node.data,
                selectedMethod: selected,
                onSelectMethod: selectMethod,
              }
            : node.type === "packageGroup"
            ? { ...node.data, onCollapse: toggle }
            : node.data;
        return { ...node, data, className: faded ? "graph-faded" : undefined };
      }),
    [nodes, involved, selected, selectMethod, toggle]
  );

  const shownEdges = useMemo(
    () =>
      edges.map((edge) => {
        const faded =
          involved !== null && edge.data?.sourceMethodId !== selected;
        const highlighted = involved !== null && !faded;
        return {
          ...edge,
          data: { ...edge.data!, faded, highlighted },
          className: faded ? "graph-faded" : undefined,
        };
      }),
    [edges, involved, selected]
  );

  return (
    <ReactFlow
      nodes={shownNodes}
      edges={shownEdges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodeClick={(_event, node) => {
        if (node.type === "package") {
          toggle((node.data as { name: string }).name);
        }
      }}
      onPaneClick={() => setSelected(null)}
      // ELK places the nodes, so they don't move one by one. Left
      // draggable, a node would swallow the mouse and a drag on it
      // would do nothing; this way it falls through and pans the graph.
      nodesDraggable={false}
      elementsSelectable={false}
      nodesConnectable={false}
      deleteKeyCode={null}
      fitView
      minZoom={0.2}
      proOptions={{ hideAttribution: false }}
    >
      <Background gap={22} size={1.2} />
      <Controls showInteractive={false} />
      <Panel position="top-left" className="graph-actions">
        <button
          onClick={() => setAll(true)}
          disabled={expanded.size === packages.length}
        >
          expand all
        </button>
        <button onClick={() => setAll(false)} disabled={expanded.size === 0}>
          collapse all
        </button>
      </Panel>
      <Legend />
    </ReactFlow>
  );
};

export const GraphPage: FC<{ packages: GraphPackage[] }> = ({ packages }) => (
  <div className="graph-canvas">
    <ReactFlowProvider>
      <GraphCanvas packages={packages} />
    </ReactFlowProvider>
  </div>
);
