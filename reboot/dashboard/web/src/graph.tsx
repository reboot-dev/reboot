// The call graph page: who calls whom, from the analysis of the
// developer's application joined with their API. A card per state
// type with a row per method, and an arrow for each call a method's
// implementation makes, leaving its row on the right and landing on
// the called method's row on the left. The cards sit in one box per
// package; a collapsed box hides its cards, and the calls leaving it
// fold into one counted arrow per box they reach.
//
// React Flow draws; ELK places. React Flow deliberately has no layout
// of its own.
import { Servicer_Method_Call_How as How } from "../../../../rbt/dashboard/v1/dashboard_pb";
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
  ReactFlowProvider,
  getBezierPath,
  useReactFlow,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import ELK from "elkjs/lib/elk.bundled.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FC } from "react";
import type {
  GraphCall,
  GraphMethod,
  GraphPackage,
  GraphStateType,
} from "./callgraph";
import { groupStateTypesByPackage, methodId } from "./callgraph";
import type { Kind } from "./link_properties_to_data_types";
import {
  labelOfKind,
  packageOfStateTypeName,
} from "./link_properties_to_data_types";

// A method the API does not declare has no kind, so its edges and
// its dot are no kind's colour. A folded edge carries every kind at
// once, so it is no kind's colour either.
const NEUTRAL_COLOR = "hsl(211 25% 60%)";
const NEUTRAL_TEXT = "hsl(211 25% 40%)";

// One colour per kind of method, the hues the kind pills wear on the
// state types page, so a purple edge here and a purple pill there say
// the same thing. Keyed by every `Kind`, so a kind added to
// the proto does not compile until it is coloured here.
const KIND_COLOR: Record<Kind, string> = {
  reader: "hsl(166 55% 35%)",
  writer: "hsl(211 72% 45%)",
  transaction: "hsl(275 50% 50%)",
  workflow: "hsl(36 85% 42%)",
};

// What a label is written in: the same hues, but dark enough to read
// at a label's size. These are the text colours of the kind pills.
const KIND_TEXT: Record<Kind, string> = {
  reader: "hsl(166 55% 27%)",
  writer: "hsl(211 72% 32%)",
  transaction: "hsl(275 50% 38%)",
  workflow: "hsl(28 80% 33%)",
};

const colorOfKind = (kind: Kind | undefined): string =>
  kind === undefined ? NEUTRAL_COLOR : KIND_COLOR[kind];

const textColorOfKind = (kind: Kind | undefined): string =>
  kind === undefined ? NEUTRAL_TEXT : KIND_TEXT[kind];

// The kind's CSS class, which colours the row's dot.
const classNameOfKind = (kind: Kind | undefined): string =>
  `graph-kind-${kind === undefined ? "unknown" : labelOfKind(kind)}`;

// How a call is reached, said in one word on the edge. A plain call
// says nothing: it is the ordinary case, and labelling every edge
// "calls" would be noise.
const HOW_LABEL: Partial<Record<How, string>> = {
  [How.CONSTRUCT]: "constructs",
  [How.SCHEDULE]: "schedules",
  [How.SPAWN]: "spawns",
  [How.FORALL]: "for all",
};

// A call reached later (scheduled, spawned) is dashed: it is not the
// arrow of control passing right now.
const HOW_DASH: Partial<Record<How, string>> = {
  [How.SCHEDULE]: "7 5",
  [How.SPAWN]: "7 5",
};

// A workflow's calls are dashed too: it runs past the call that
// started it.
const WORKFLOW_DASH = "4 4";

// An `until` is a wait on another state's reader, not a call the
// developer made to it, so it is not drawn.
const isDrawn = (call: GraphCall): boolean => call.how !== How.UNTIL;

// The measurements layout works from: a card's height is arithmetic
// on its method count, so ELK can place the cards before they are
// rendered. `ROW_HEIGHT` and `HEAD_HEIGHT` are what `.graph-method`
// and `.graph-state-type-head` come out at; `CARD_SLACK` is the
// card's borders. `EXPANDED_PACKAGE_HEAD_HEIGHT` is what
// `.graph-expanded-package-head` comes out at, and
// `EXPANDED_PACKAGE_PAD` the room a box leaves around its cards.
const ROW_HEIGHT = 26;
const HEAD_HEIGHT = 34;
const CARD_SLACK = 8;
const CARD_WIDTH = 210;
const COLLAPSED_PACKAGE_WIDTH = 200;
const COLLAPSED_PACKAGE_HEIGHT = 78;
const EXPANDED_PACKAGE_HEAD_HEIGHT = 38;
const EXPANDED_PACKAGE_PAD = 20;

const heightOfStateType = (stateType: GraphStateType): number =>
  HEAD_HEIGHT + stateType.methods.length * ROW_HEIGHT + CARD_SLACK;

// A package's node id, kept apart from state type ids, which are
// fully qualified names and could equal a package's.
const packageNodeId = (name: string): string => `pkg:${name}`;

// `bank.v1.Account` for `bank.v1.Account.deposit`.
const stateTypeNameOfMethodId = (id: string): string =>
  id.slice(0, id.lastIndexOf("."));

// ---------------------------------------------------------------
// Layout.

const elk = new ELK();

interface PackageData extends Record<string, unknown> {
  name: string;
  stateTypes: number;
  methods: number;
}

interface ExpandedPackageData extends Record<string, unknown> {
  name: string;
  onCollapse?: (name: string) => void;
}

interface StateTypeData extends Record<string, unknown> {
  stateType: GraphStateType;
  // The chosen method's id, when one is chosen.
  selectedMethod?: string | null;
  onSelectMethod?: (id: string) => void;
}

type GraphNode =
  | Node<PackageData, "package">
  | Node<ExpandedPackageData, "expanded">
  | Node<StateTypeData, "stateType">;

interface Point {
  x: number;
  y: number;
}

const ELK_LAYERED_OPTIONS = {
  "elk.algorithm": "layered",
  "elk.direction": "RIGHT",
  // Ties broken by the order the state types are declared in, so
  // the same graph always comes out the same way and opening a box
  // does not reshuffle its neighbours.
  "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
};

// Where everything goes: callers to the left of what they call, the
// way an edge leaves a row on its right and enters one on its left.
// Each expanded box's cards are laid out alone, then the boxes are
// laid out at the size their cards came to, so an open box never
// lands on a neighbour. A card or box calling itself has no say in
// where it goes.
const layoutPackages = async (
  packages: GraphPackage[],
  collapsed: ReadonlySet<string>
): Promise<GraphNode[]> => {
  const cardLayoutsByPackage = new Map<
    string,
    { cardPositions: Map<string, Point>; width: number; height: number }
  >();

  for (const pkg of packages) {
    if (collapsed.has(pkg.name)) {
      continue;
    }
    const stateTypeIdsInPackage = new Set(
      pkg.stateTypes.map((stateType) => stateType.id)
    );
    const callPairsBetweenCards = new Set<string>();
    for (const stateType of pkg.stateTypes) {
      for (const method of stateType.methods) {
        for (const call of method.calls) {
          if (
            isDrawn(call) &&
            stateTypeIdsInPackage.has(call.stateTypeName) &&
            call.stateTypeName !== stateType.id
          ) {
            callPairsBetweenCards.add(`${stateType.id}>${call.stateTypeName}`);
          }
        }
      }
    }
    const elkCardLayout = await elk.layout({
      id: pkg.name,
      layoutOptions: {
        ...ELK_LAYERED_OPTIONS,
        "elk.spacing.nodeNode": "36",
        "elk.layered.spacing.nodeNodeBetweenLayers": "90",
      },
      children: pkg.stateTypes.map((stateType) => ({
        id: stateType.id,
        width: CARD_WIDTH,
        height: heightOfStateType(stateType),
      })),
      edges: [...callPairsBetweenCards].map((pair) => {
        const [source, target] = pair.split(">");
        return { id: pair, sources: [source], targets: [target] };
      }),
    });

    const cardPositions = new Map<string, Point>();
    let cardsWidth = 0;
    let cardsHeight = 0;
    for (const elkCard of elkCardLayout.children ?? []) {
      cardPositions.set(elkCard.id, { x: elkCard.x ?? 0, y: elkCard.y ?? 0 });
      cardsWidth = Math.max(
        cardsWidth,
        (elkCard.x ?? 0) + (elkCard.width ?? 0)
      );
      cardsHeight = Math.max(
        cardsHeight,
        (elkCard.y ?? 0) + (elkCard.height ?? 0)
      );
    }
    cardLayoutsByPackage.set(pkg.name, {
      cardPositions,
      width: cardsWidth + 2 * EXPANDED_PACKAGE_PAD,
      height: cardsHeight + EXPANDED_PACKAGE_HEAD_HEIGHT + EXPANDED_PACKAGE_PAD,
    });
  }

  const callPairsBetweenPackages = new Set<string>();
  for (const pkg of packages) {
    for (const stateType of pkg.stateTypes) {
      for (const method of stateType.methods) {
        for (const call of method.calls) {
          const target = packageOfStateTypeName(call.stateTypeName);
          if (isDrawn(call) && target !== pkg.name) {
            callPairsBetweenPackages.add(`${pkg.name}>${target}`);
          }
        }
      }
    }
  }

  const elkPackageLayout = await elk.layout({
    id: "root",
    layoutOptions: {
      ...ELK_LAYERED_OPTIONS,
      "elk.spacing.nodeNode": "60",
      "elk.layered.spacing.nodeNodeBetweenLayers": "140",
    },
    children: packages.map((pkg) => {
      const cardLayout = cardLayoutsByPackage.get(pkg.name);
      return {
        id: packageNodeId(pkg.name),
        width: cardLayout?.width ?? COLLAPSED_PACKAGE_WIDTH,
        height: cardLayout?.height ?? COLLAPSED_PACKAGE_HEIGHT,
      };
    }),
    edges: [...callPairsBetweenPackages].map((pair) => {
      const [source, target] = pair.split(">");
      return {
        id: pair,
        sources: [packageNodeId(source)],
        targets: [packageNodeId(target)],
      };
    }),
  });

  const packagePositions = new Map<string, Point>(
    (elkPackageLayout.children ?? []).map((elkPackage) => [
      elkPackage.id,
      { x: elkPackage.x ?? 0, y: elkPackage.y ?? 0 },
    ])
  );

  // A parent precedes its children: React Flow resolves a elkCard's
  // position, relative to its parent, in array order.
  const nodes: GraphNode[] = [];
  for (const pkg of packages) {
    const boxId = packageNodeId(pkg.name);
    const position = packagePositions.get(boxId) ?? { x: 0, y: 0 };
    const cardLayout = cardLayoutsByPackage.get(pkg.name);
    if (cardLayout === undefined) {
      nodes.push({
        id: boxId,
        type: "package",
        position,
        width: COLLAPSED_PACKAGE_WIDTH,
        height: COLLAPSED_PACKAGE_HEIGHT,
        data: {
          name: pkg.name,
          stateTypes: pkg.stateTypes.length,
          methods: pkg.stateTypes.reduce(
            (count, stateType) => count + stateType.methods.length,
            0
          ),
        },
      });
      continue;
    }
    nodes.push({
      id: boxId,
      type: "expanded",
      position,
      width: cardLayout.width,
      height: cardLayout.height,
      data: { name: pkg.name },
    });
    for (const stateType of pkg.stateTypes) {
      const cardPosition = cardLayout.cardPositions.get(stateType.id) ?? {
        x: 0,
        y: 0,
      };
      nodes.push({
        id: stateType.id,
        type: "stateType",
        parentId: boxId,
        position: {
          x: cardPosition.x + EXPANDED_PACKAGE_PAD,
          y: cardPosition.y + EXPANDED_PACKAGE_HEAD_HEIGHT,
        },
        width: CARD_WIDTH,
        data: { stateType },
      });
    }
  }
  return nodes;
};

// ---------------------------------------------------------------
// Edges.

interface CallEdgeData extends Record<string, unknown> {
  // Absent on a folded edge, which carries calls reached every way.
  how?: How;
  // The calling method's kind, which is the edge's colour. Absent
  // for a method the API does not declare, and on a folded edge.
  kind?: Kind;
  count: number;
  // The calling method's id, absent on a folded edge. What choosing
  // a method keeps.
  sourceMethodId?: string;
  // Set while another method is chosen. The label fades off this
  // rather than off the edge's class: `EdgeLabelRenderer` draws
  // labels in a layer of their own, out of the class's reach.
  faded?: boolean;
}

// The edges as the boxes show them. A call whose box is expanded
// leaves from its own method row; otherwise it leaves from the box,
// and every call the box hides folds into one counted edge per node
// they reach.
const edgesOfPackages = (
  packages: GraphPackage[],
  collapsed: ReadonlySet<string>
): Edge<CallEdgeData>[] => {
  const edgesById = new Map<string, Edge<CallEdgeData>>();
  for (const pkg of packages) {
    const sourceExpanded = !collapsed.has(pkg.name);
    for (const stateType of pkg.stateTypes) {
      for (const method of stateType.methods) {
        for (const call of method.calls) {
          if (!isDrawn(call)) {
            continue;
          }
          const targetPackage = packageOfStateTypeName(call.stateTypeName);
          const targetExpanded = !collapsed.has(targetPackage);

          // A call inside a collapsed box is that box's business.
          if (!sourceExpanded && targetPackage === pkg.name) {
            continue;
          }

          const source = sourceExpanded
            ? stateType.id
            : packageNodeId(pkg.name);
          const sourceHandle = sourceExpanded ? `s:${method.name}` : undefined;
          const target = targetExpanded
            ? call.stateTypeName
            : packageNodeId(targetPackage);
          const targetHandle = targetExpanded
            ? `t:${call.methodName}`
            : undefined;
          const id = sourceExpanded
            ? `${source}|${sourceHandle}>${target}|${targetHandle}:${call.how}`
            : `${source}>${target}|${targetHandle}`;

          const edgeFoldedInto = edgesById.get(id);
          if (edgeFoldedInto !== undefined) {
            edgeFoldedInto.data!.count += call.count;
            continue;
          }
          const kind = sourceExpanded ? method.kind : undefined;
          edgesById.set(id, {
            id,
            source,
            sourceHandle,
            target,
            targetHandle,
            type: "call",
            data: {
              how: sourceExpanded ? call.how : undefined,
              kind,
              count: call.count,
              sourceMethodId: sourceExpanded
                ? methodId(stateType.id, method.name)
                : undefined,
            },
            markerEnd: {
              type: MarkerType.ArrowClosed,
              color: colorOfKind(kind),
              width: 16,
              height: 16,
            },
          });
        }
      }
    }
  }
  return [...edgesById.values()];
};

// ---------------------------------------------------------------
// The pieces React Flow draws.

// A collapsed package. The handles are invisible: the box is called
// as a whole, and an edge just needs somewhere to land.
const PackageNode: FC<NodeProps<Node<PackageData, "package">>> = ({ data }) => (
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
);

// An expanded package: a box around its cards.
const ExpandedPackageNode: FC<
  NodeProps<Node<ExpandedPackageData, "expanded">>
> = ({ data }) => (
  <div className="graph-expanded-package">
    <div className="graph-expanded-package-head">
      <span className="graph-expanded-package-name">{data.name}</span>
      <button
        className="graph-expanded-package-collapse"
        onClick={(event) => {
          event.stopPropagation();
          data.onCollapse?.(data.name);
        }}
      >
        collapse
      </button>
    </div>
  </div>
);

// One method, one row: its kind's colour on the dot, its name, and
// an edge landing on its left or leaving on its right. The handles
// are invisible: the edge just needs somewhere to land. A click
// chooses the method, and a second click lets it go.
const MethodRow: FC<{
  id: string;
  method: GraphMethod;
  selected: boolean;
  onSelect?: (id: string) => void;
}> = ({ id, method, selected, onSelect }) => (
  <div
    className={`graph-method ${classNameOfKind(method.kind)}${
      selected ? " selected" : ""
    }`}
    onClick={(event) => {
      event.stopPropagation();
      onSelect?.(id);
    }}
    title={
      method.kind === undefined
        ? "unknown"
        : `${labelOfKind(method.kind)}${method.factory ? ", factory" : ""}`
    }
  >
    <Handle
      type="target"
      position={Position.Left}
      id={`t:${method.name}`}
      className="graph-port"
    />
    <span className="graph-method-dot" aria-hidden="true" />
    <span className="graph-method-name">{method.name}</span>
    {method.factory && <span className="graph-method-factory">factory</span>}
    <Handle
      type="source"
      position={Position.Right}
      id={`s:${method.name}`}
      className="graph-port"
    />
  </div>
);

const StateTypeNode: FC<NodeProps<Node<StateTypeData, "stateType">>> = ({
  data,
}) => (
  <div className="graph-state-type">
    <div className="graph-state-type-head">{data.stateType.name}</div>
    {data.stateType.methods.map((method) => {
      const id = methodId(data.stateType.id, method.name);
      return (
        <MethodRow
          id={id}
          method={method}
          selected={data.selectedMethod === id}
          onSelect={data.onSelectMethod}
          key={method.name}
        />
      );
    })}
  </div>
);

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
    // A state type calling itself: out the right side, around, and
    // back in the left. Below when the called row is level or lower,
    // above when it is higher, so the loop swings away from the rows
    // between. The loopSwing grows with the distance between the rows,
    // so two loops on one card travel at different depths and their
    // labels land apart.
    const calledRowIsBelow = targetY >= sourceY - 1;
    const loopDepth = 46 + Math.abs(targetY - sourceY) * 0.35;
    const loopSwing = calledRowIsBelow ? loopDepth : -loopDepth;
    path =
      `M ${sourceX},${sourceY} C ${sourceX + 70},${sourceY + loopSwing} ` +
      `${targetX - 70},${targetY + loopSwing} ${targetX},${targetY}`;
    labelX = (sourceX + targetX) / 2;
    labelY = (sourceY + targetY) / 2 + loopSwing * 0.75;
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
  const count = data?.count ?? 1;
  const howWord = how === undefined ? undefined : HOW_LABEL[how];
  const label = count > 1 ? `${howWord ?? "calls"} ×${count}` : howWord;
  const dashPattern =
    (how === undefined ? undefined : HOW_DASH[how]) ??
    (kind === "workflow" ? WORKFLOW_DASH : undefined);

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        style={{
          stroke: colorOfKind(kind),
          strokeWidth: 1.6,
          strokeDasharray: dashPattern,
        }}
      />
      {label !== undefined && (
        // Over the edges and under the cards, which is the order React
        // Flow draws the three layers in, so a label crossing a card
        // tucks behind it rather than covering what the card says.
        <EdgeLabelRenderer>
          <div
            className="graph-edge-label"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              color: textColorOfKind(kind),
              opacity: data?.faded ? 0.1 : 1,
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
};

// A short line drawn the way a family of edges is drawn.
const LegendLine: FC<{ dashPattern?: string }> = ({ dashPattern }) => (
  <svg className="graph-legend-line" viewBox="0 0 30 8" aria-hidden="true">
    <path
      d="M 1 4 H 29"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeDasharray={dashPattern}
      fill="none"
    />
  </svg>
);

// What the colours and line styles mean, one entry per thing the
// graph says without words. A `<details>`, so it folds down to its
// title once the reader knows it.
const Legend: FC = () => (
  <Panel position="top-right">
    <details className="graph-legend" open>
      <summary className="eyebrow">legend</summary>
      <div className="graph-legend-rows">
        {(["reader", "writer", "transaction", "workflow"] as Kind[]).map(
          (kind) => (
            <div
              className={`graph-legend-row ${classNameOfKind(kind)}`}
              key={kind}
            >
              <span className="graph-method-dot" aria-hidden="true" />
              <span>{labelOfKind(kind)}</span>
            </div>
          )
        )}
        <div className={`graph-legend-row ${classNameOfKind(undefined)}`}>
          <span className="graph-method-dot" aria-hidden="true" />
          <span>
            <em>unknown</em>
          </span>
        </div>
      </div>
      <div className="graph-legend-rows">
        <div className="graph-legend-row">
          <LegendLine />
          <span>calls</span>
        </div>
        <div className="graph-legend-row">
          <LegendLine dashPattern={HOW_DASH[How.SCHEDULE]} />
          <span>schedules · spawns</span>
        </div>
        <div className="graph-legend-row">
          <LegendLine dashPattern={WORKFLOW_DASH} />
          <span>a workflow's calls</span>
        </div>
      </div>
      <div className="graph-legend-rows">
        <div className="graph-legend-row">
          <span className="graph-method-factory">factory</span>
          <span>constructs the state</span>
        </div>
      </div>
    </details>
  </Panel>
);

// Not `group`: React Flow styles a node of its own `group` type.
const nodeTypes = {
  package: PackageNode,
  expanded: ExpandedPackageNode,
  stateType: StateTypeNode,
};

const edgeTypes = { call: CallEdge };

// ---------------------------------------------------------------
// The page.

const GraphCanvas: FC<{ packages: GraphPackage[] }> = ({ packages }) => {
  // Which boxes are collapsed, rather than which are expanded, so a
  // package that appears later starts expanded like the rest.
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  // The chosen method's id. Opening and closing boxes leaves it
  // chosen, so its calls can be followed into whichever box they land
  // in; only closing its own box lets it go, since its row is gone.
  const [selectedMethodId, setSelectedMethodId] = useState<string | null>(null);
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const { fitView } = useReactFlow();

  // The layout run whose answer still matters. A snapshot arriving
  // while the last is being laid out starts another layout, and only
  // the newest one's answer lands.
  const layoutRun = useRef(0);

  // The nextCollapsed layout is shifted so the clicked box stays put: it grows
  // or shrinks in place, under the reader's eye.
  const boxPositionsAfterLastLayout = useRef(new Map<string, Point>());
  const clickedBoxId = useRef<string | null>(null);

  // Set when the nextCollapsed layout should be framed whole: the first, and
  // one that opened or closed every box at once, which changes the
  // graph too much for any one spot to hold still.
  const fitViewAfterLayout = useRef(true);

  useEffect(() => {
    const thisLayoutRun = ++layoutRun.current;
    layoutPackages(packages, collapsed).then((nodes) => {
      if (layoutRun.current !== thisLayoutRun) {
        return;
      }

      const clickedBoxBeforeLayout =
        clickedBoxId.current === null
          ? undefined
          : boxPositionsAfterLastLayout.current.get(clickedBoxId.current);
      const clickedBoxAfterLayout = nodes.find(
        (node) => node.id === clickedBoxId.current
      )?.position;
      const shift =
        clickedBoxBeforeLayout !== undefined &&
        clickedBoxAfterLayout !== undefined
          ? {
              x: clickedBoxBeforeLayout.x - clickedBoxAfterLayout.x,
              y: clickedBoxBeforeLayout.y - clickedBoxAfterLayout.y,
            }
          : { x: 0, y: 0 };
      // Only the boxes move: a card's position is relative to its
      // box and goes along with it.
      for (const node of nodes) {
        if (node.parentId === undefined) {
          node.position = {
            x: node.position.x + shift.x,
            y: node.position.y + shift.y,
          };
        }
      }
      boxPositionsAfterLastLayout.current = new Map(
        nodes
          .filter((node) => node.parentId === undefined)
          .map((node) => [node.id, node.position])
      );

      setNodes(nodes);

      // Framed once React has drawn it and React Flow has measured
      // it: one frame renders, the nextCollapsed has the measurements. Other
      // than that the camera is the reader's: a box opening in place
      // can be followed, a jump to a new framing cannot.
      if (fitViewAfterLayout.current) {
        fitViewAfterLayout.current = false;
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            fitView({ padding: 0.15, duration: 400 });
          });
        });
      }
    });
  }, [packages, collapsed, fitView]);

  const edges = useMemo(
    () => edgesOfPackages(packages, collapsed),
    [packages, collapsed]
  );

  const togglePackage = useCallback((name: string) => {
    clickedBoxId.current = packageNodeId(name);
    setCollapsed((collapsed) => {
      const nextCollapsed = new Set(collapsed);
      if (nextCollapsed.has(name)) {
        nextCollapsed.delete(name);
      } else {
        nextCollapsed.add(name);
      }
      return nextCollapsed;
    });
    setSelectedMethodId((selectedMethodId) =>
      selectedMethodId !== null &&
      packageOfStateTypeName(stateTypeNameOfMethodId(selectedMethodId)) === name
        ? null
        : selectedMethodId
    );
  }, []);

  const setAllCollapsed = useCallback(
    (allCollapsed: boolean) => {
      clickedBoxId.current = null;
      fitViewAfterLayout.current = true;
      setCollapsed(
        new Set(allCollapsed ? packages.map((pkg) => pkg.name) : [])
      );
      if (allCollapsed) {
        setSelectedMethodId(null);
      }
    },
    [packages]
  );

  const toggleMethodSelection = useCallback((id: string) => {
    setSelectedMethodId((selectedMethodId) =>
      selectedMethodId === id ? null : id
    );
  }, []);

  // With a method chosen, its own card and whatever its calls land
  // on; nothing else. A box never fades: it is the room its cards
  // are in.
  const unfadedNodeIds = useMemo(() => {
    if (selectedMethodId === null) {
      return null;
    }
    const nodeIds = new Set<string>([
      stateTypeNameOfMethodId(selectedMethodId),
    ]);
    for (const edge of edges) {
      if (edge.data?.sourceMethodId === selectedMethodId) {
        nodeIds.add(edge.source);
        nodeIds.add(edge.target);
      }
    }
    return nodeIds;
  }, [selectedMethodId, edges]);

  const shownNodes = useMemo(
    () =>
      nodes.map((node) => {
        const faded =
          unfadedNodeIds !== null &&
          node.type !== "expanded" &&
          !unfadedNodeIds.has(node.id);
        const className = faded ? "graph-faded" : undefined;
        switch (node.type) {
          case "expanded":
            return {
              ...node,
              className,
              data: { ...node.data, onCollapse: togglePackage },
            };
          case "stateType":
            return {
              ...node,
              className,
              data: {
                ...node.data,
                selectedMethod: selectedMethodId,
                onSelectMethod: toggleMethodSelection,
              },
            };
          default:
            return { ...node, className };
        }
      }),
    [
      nodes,
      unfadedNodeIds,
      selectedMethodId,
      toggleMethodSelection,
      togglePackage,
    ]
  );

  const shownEdges = useMemo(
    () =>
      edges.map((edge) => {
        const faded =
          unfadedNodeIds !== null &&
          edge.data?.sourceMethodId !== selectedMethodId;
        return {
          ...edge,
          className: faded ? "graph-faded" : undefined,
          data: { ...edge.data!, faded },
        };
      }),
    [edges, unfadedNodeIds, selectedMethodId]
  );

  return (
    <ReactFlow
      nodes={shownNodes}
      edges={shownEdges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodeClick={(_event, node) => {
        if (node.type === "package") {
          togglePackage((node.data as PackageData).name);
        }
      }}
      onPaneClick={() => setSelectedMethodId(null)}
      // ELK places the nodes, so they don't move one by one. Left
      // draggable, a node would swallow the mouse and a drag on it
      // would do nothing; this way it falls through and pans the
      // graph.
      nodesDraggable={false}
      elementsSelectable={false}
      nodesConnectable={false}
      deleteKeyCode={null}
      // Otherwise React Flow raises a card inside a box, and every
      // edge touching one, above the edge labels' layer, and an arrow
      // crosses over its own label.
      zIndexMode="manual"
      fitView
      minZoom={0.2}
    >
      <Background gap={22} size={1.2} />
      <Controls showInteractive={false} />
      <Panel position="top-left" className="graph-actions">
        <button
          className="expand-button"
          onClick={() => setAllCollapsed(false)}
          disabled={collapsed.size === 0}
        >
          expand all
        </button>
        <button
          className="expand-button"
          onClick={() => setAllCollapsed(true)}
          disabled={collapsed.size === packages.length}
        >
          collapse all
        </button>
      </Panel>
      <Legend />
    </ReactFlow>
  );
};

// How many calls the graph draws: counted from the data rather than
// the edges, which collapse when their box is collapsed.
export const drawnCallCount = (stateTypes: GraphStateType[]): number =>
  stateTypes.reduce(
    (count, stateType) =>
      count +
      stateType.methods.reduce(
        (count, method) => count + method.calls.filter(isDrawn).length,
        0
      ),
    0
  );

export const GraphPage: FC<{
  stateTypes: GraphStateType[];
}> = ({ stateTypes }) => {
  const packages = useMemo(
    () => groupStateTypesByPackage(stateTypes),
    [stateTypes]
  );

  return (
    <div className="graph-canvas">
      <ReactFlowProvider>
        <GraphCanvas packages={packages} />
      </ReactFlowProvider>
    </div>
  );
};
