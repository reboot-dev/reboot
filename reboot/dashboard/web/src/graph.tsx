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
  NodeResizer,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  applyNodeChanges,
  getBezierPath,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeChange,
  type NodeProps,
  useReactFlow,
} from "@xyflow/react";
import type { Viewport } from "@xyflow/react";
import { useLocation, useNavigationType } from "react-router";
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
// "calls" would be noise. Neither does a construct: the factory pill
// on the row it lands on already says so.
const HOW_LABEL: Partial<Record<How, string>> = {
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
const PACKAGE_NODE_ID_PREFIX = "pkg:";
const packageNodeId = (name: string): string =>
  `${PACKAGE_NODE_ID_PREFIX}${name}`;

// The package a box's node id names; a card's names none.
const packageNameOfNodeId = (id: string): string | undefined =>
  id.startsWith(PACKAGE_NODE_ID_PREFIX)
    ? id.slice(PACKAGE_NODE_ID_PREFIX.length)
    : undefined;

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
  // The smallest the resizer lets the box get: its size in the
  // default layout or what its cards need, whichever is bigger, so
  // its cards always fit.
  minWidth?: number;
  minHeight?: number;
  onResize?: (name: string, box: NodePosition & BoxSize) => void;
}

type CardNode = Node<StateTypeData, "stateType">;

const isCard = (node: GraphNode): node is CardNode => node.type === "stateType";

// The smallest box that holds its cards where they are now, with
// the box's padding past them. A card's height is what React Flow
// measured, or, before the card is first drawn, the estimate the
// default layout used.
const sizeNeededByCards = (cards: CardNode[]): BoxSize => {
  let right = 0;
  let bottom = 0;
  for (const card of cards) {
    right = Math.max(right, card.position.x + CARD_WIDTH);
    bottom = Math.max(
      bottom,
      card.position.y +
        (card.measured?.height ?? heightOfStateType(card.data.stateType))
    );
  }
  return {
    width: right + EXPANDED_PACKAGE_PAD,
    height: bottom + EXPANDED_PACKAGE_PAD,
  };
};

// Keeps every card below its box's head and right of its left
// padding, and grows the box right and down to hold its cards where
// they now are. Only the resizer shrinks a box.
const fitBoxesAroundCards = (nodes: GraphNode[]): GraphNode[] => {
  const cardsByBox = new Map<string, CardNode[]>();
  const fitted = nodes.map((node): GraphNode => {
    if (!isCard(node) || node.parentId === undefined) {
      return node;
    }
    const x = Math.max(node.position.x, EXPANDED_PACKAGE_PAD);
    const y = Math.max(node.position.y, EXPANDED_PACKAGE_HEAD_HEIGHT);
    const card: CardNode =
      x === node.position.x && y === node.position.y
        ? node
        : { ...node, position: { x, y } };
    const cards = cardsByBox.get(node.parentId) ?? [];
    cards.push(card);
    cardsByBox.set(node.parentId, cards);
    return card;
  });
  return fitted.map((node) => {
    if (node.type !== "expanded") {
      return node;
    }
    const needed = sizeNeededByCards(cardsByBox.get(node.id) ?? []);
    const width = Math.max(node.width ?? 0, needed.width);
    const height = Math.max(node.height ?? 0, needed.height);
    return width === node.width && height === node.height
      ? node
      : { ...node, width, height };
  });
};

// Which cones of the chosen method the graph lights: what it calls
// (downstream), who calls it (upstream), or both.
interface ConesOfInfluence {
  downstream: boolean;
  upstream: boolean;
}

// Choosing a method lights both; the buttons beside its row put
// either out.
const DEFAULT_CONES_OF_INFLUENCE: ConesOfInfluence = {
  downstream: true,
  upstream: true,
};

interface StateTypeData extends Record<string, unknown> {
  stateType: GraphStateType;
  // The chosen method's id, when one is chosen.
  selectedMethod?: string | null;
  onSelectMethod?: (id: string) => void;
  onOpenStateType?: (id: string) => void;
  conesOfInfluence?: ConesOfInfluence;
  onToggleConeOfInfluence?: (coneOfInfluence: keyof ConesOfInfluence) => void;
  // The methods some drawn call lands on, and the methods that make
  // one; a button with nothing to light is never shown.
  calledMethodIds?: Set<string>;
  callingMethodIds?: Set<string>;
  // The methods in the chosen method's lit cones, itself included.
  litMethods?: Set<string>;
}

type GraphNode =
  | Node<PackageData, "package">
  | Node<ExpandedPackageData, "expanded">
  | Node<StateTypeData, "stateType">;

// A node's position on the canvas, in canvas pixels; a card's is
// relative to its box.
interface NodePosition {
  x: number;
  y: number;
}

// How far a dragged node sits from its position in the default
// layout.
interface NodeOffset {
  x: number;
  y: number;
}

interface BoxSize {
  width: number;
  height: number;
}

// How the call graph's boxes and cards differ from the default
// layout: which boxes are collapsed, how far each dragged node sits
// from its place in the default layout, and the size each resized
// box was given. The preferences keep it.
export interface CallGraphLayout {
  collapsedPackages: ReadonlySet<string>;
  movedPackageBoxes: ReadonlyMap<string, NodeOffset>;
  movedStateTypeCards: ReadonlyMap<string, NodeOffset>;
  resizedPackageBoxes: ReadonlyMap<string, BoxSize>;
}

// The canvas keys boxes and cards by node id in one map, since React
// Flow draws one list of nodes; `CallGraphLayout` keys boxes by
// package name and cards by state type id. These convert between the
// two.
const nodeMapsOfCallGraphLayout = (
  layout: CallGraphLayout
): { moved: Map<string, NodeOffset>; resized: Map<string, BoxSize> } => ({
  moved: new Map([
    ...[...layout.movedPackageBoxes].map(
      ([name, offset]): [string, NodeOffset] => [packageNodeId(name), offset]
    ),
    ...layout.movedStateTypeCards,
  ]),
  resized: new Map(
    [...layout.resizedPackageBoxes].map(([name, size]): [string, BoxSize] => [
      packageNodeId(name),
      size,
    ])
  ),
});

const callGraphLayoutOfNodeMaps = (
  collapsedPackages: ReadonlySet<string>,
  moved: ReadonlyMap<string, NodeOffset>,
  resized: ReadonlyMap<string, BoxSize>
): CallGraphLayout => {
  const movedPackageBoxes = new Map<string, NodeOffset>();
  const movedStateTypeCards = new Map<string, NodeOffset>();
  for (const [id, offset] of moved) {
    const name = packageNameOfNodeId(id);
    if (name === undefined) {
      movedStateTypeCards.set(id, offset);
    } else {
      movedPackageBoxes.set(name, offset);
    }
  }
  return {
    collapsedPackages,
    movedPackageBoxes,
    movedStateTypeCards,
    resizedPackageBoxes: new Map(
      [...resized].map(([id, size]): [string, BoxSize] => [
        packageNameOfNodeId(id) ?? id,
        size,
      ])
    ),
  };
};

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
    { cardPositions: Map<string, NodePosition>; width: number; height: number }
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

    const cardPositions = new Map<string, NodePosition>();
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

  const packagePositions = new Map<string, NodePosition>(
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
  // Every calling method whose calls this edge carries: one for an
  // edge from a method row, each contributor for a folded edge.
  // What choosing a method keeps, transitively.
  sourceMethodIds: string[];
  // Every called method the same way, which is what says whether
  // the edge lands inside the upstream cone.
  targetMethodIds: string[];
  // Set while another method is chosen. The label fades off this
  // rather than off the edge's class: `EdgeLabelRenderer` draws
  // labels in a layer of their own, out of the class's reach.
  faded?: boolean;
}

// Every method the chosen one calls, transitively, itself included:
// the downstream closure over the drawn calls. Collapse-blind, so
// the path continues through a collapsed box.
const reachableMethodIds = (
  from: string,
  packages: GraphPackage[]
): Set<string> => {
  const callsByMethodId = new Map(
    packages.flatMap((pkg) =>
      pkg.stateTypes.flatMap((stateType) =>
        stateType.methods.map(
          (method) =>
            [methodId(stateType.id, method.name), method.calls] as const
        )
      )
    )
  );
  const reached = new Set([from]);
  const frontier = [from];
  while (frontier.length > 0) {
    for (const call of callsByMethodId.get(frontier.pop()!) ?? []) {
      if (!isDrawn(call)) {
        continue;
      }
      const callee = methodId(call.stateTypeName, call.methodName);
      if (!reached.has(callee)) {
        reached.add(callee);
        frontier.push(callee);
      }
    }
  }
  return reached;
};

// Every method that calls the chosen one, transitively, itself
// included: the upstream closure over the same drawn calls,
// collapse-blind the same way.
const reachingMethodIds = (
  to: string,
  packages: GraphPackage[]
): Set<string> => {
  const callersByMethodId = new Map<string, string[]>();
  for (const pkg of packages) {
    for (const stateType of pkg.stateTypes) {
      for (const method of stateType.methods) {
        const caller = methodId(stateType.id, method.name);
        for (const call of method.calls) {
          if (!isDrawn(call)) {
            continue;
          }
          const callee = methodId(call.stateTypeName, call.methodName);
          const callers = callersByMethodId.get(callee);
          if (callers === undefined) {
            callersByMethodId.set(callee, [caller]);
          } else {
            callers.push(caller);
          }
        }
      }
    }
  }
  const reached = new Set([to]);
  const frontier = [to];
  while (frontier.length > 0) {
    for (const caller of callersByMethodId.get(frontier.pop()!) ?? []) {
      if (!reached.has(caller)) {
        reached.add(caller);
        frontier.push(caller);
      }
    }
  }
  return reached;
};

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

          const caller = methodId(stateType.id, method.name);
          const callee = methodId(call.stateTypeName, call.methodName);
          const edgeFoldedInto = edgesById.get(id);
          if (edgeFoldedInto !== undefined) {
            edgeFoldedInto.data!.count += call.count;
            if (!edgeFoldedInto.data!.sourceMethodIds.includes(caller)) {
              edgeFoldedInto.data!.sourceMethodIds.push(caller);
            }
            if (!edgeFoldedInto.data!.targetMethodIds.includes(callee)) {
              edgeFoldedInto.data!.targetMethodIds.push(callee);
            }
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
              sourceMethodIds: [caller],
              targetMethodIds: [callee],
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

// An expanded package: a box around its cards, resized by its
// corners and sides to give the cards room.
const ExpandedPackageNode: FC<
  NodeProps<Node<ExpandedPackageData, "expanded">>
> = ({ data }) => (
  <div className="graph-expanded-package">
    <NodeResizer
      minWidth={data.minWidth}
      minHeight={data.minHeight}
      onResizeEnd={(_event, box) => data.onResize?.(data.name, box)}
    />
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

// an edge landing on its left or leaving on its right. The handles
// are invisible: the edge just needs somewhere to land. A click
// chooses the method, which lights who calls it and what it calls
// and opens it in the types pane; a click on the chosen one lets it
// go.
const MethodRow: FC<{
  id: string;
  method: GraphMethod;
  selected: boolean;
  // In the chosen method's lit cones: called by it or calling it.
  lit: boolean;
  onSelect: (id: string) => void;
}> = ({ id, method, selected, lit, onSelect }) => (
  <div
    className={`graph-method ${classNameOfKind(method.kind)}${
      selected ? " selected" : lit ? " lit" : ""
    }`}
    onClick={(event) => {
      event.stopPropagation();
      onSelect(id);
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

// A button beside the card, level with a row, for one of the row's
// cones: lit in the method's kind colour while that cone is shown,
// and unlit again under the pointer, since a click then puts it out.
const ConeOfInfluenceButton: FC<{
  coneOfInfluence: keyof ConesOfInfluence;
  top: number;
  lit: boolean;
  color: string;
  title: string;
  onClick: () => void;
}> = ({ coneOfInfluence, top, lit, color, title, onClick }) => {
  const [hovered, setHovered] = useState(false);
  const shownLit = lit && !hovered;
  return (
    <button
      type="button"
      className={`graph-cone graph-cone-${coneOfInfluence}${
        shownLit ? " is-active" : ""
      }`}
      style={
        shownLit ? { top, background: color, borderColor: color } : { top }
      }
      title={title}
      aria-pressed={lit}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true">
        <path
          d="M1.5 6 H10 M6.5 2.5 L10 6 L6.5 9.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </button>
  );
};

const StateTypeNode: FC<NodeProps<Node<StateTypeData, "stateType">>> = ({
  data,
}) => {
  // The chosen row's place in the card, for the cone nonEmptyConesOfInfluence that
  // flank it. The card clips its contents, so the nonEmptyConesOfInfluence are
  // siblings of it, placed by the layout's own row arithmetic.
  const selectedIndex =
    data.selectedMethod == null
      ? -1
      : data.stateType.methods.findIndex(
          (method) =>
            methodId(data.stateType.id, method.name) === data.selectedMethod
        );
  const topOfRow = (index: number): number =>
    1 + HEAD_HEIGHT + index * ROW_HEIGHT + ROW_HEIGHT / 2;

  // The chosen row's nonEmptyConesOfInfluence, one for each cone it has anything to
  // light in. Each puts its cone out, or lights it again.
  const nonEmptyConesOfInfluence: ConesOfInfluence | undefined =
    data.selectedMethod == null || selectedIndex === -1
      ? undefined
      : {
          upstream: data.calledMethodIds?.has(data.selectedMethod) ?? false,
          downstream: data.callingMethodIds?.has(data.selectedMethod) ?? false,
        };

  return (
    <>
      <div className="graph-state-type">
        {/* The name is the way to the state type in the types pane. */}
        <div
          className="graph-state-type-head graph-method-open"
          title="open in the types pane"
          onClick={(event) => {
            event.stopPropagation();
            data.onOpenStateType?.(data.stateType.id);
          }}
        >
          {data.stateType.name}
        </div>
        {data.stateType.methods.map((method, index) => {
          const id = methodId(data.stateType.id, method.name);
          return (
            <MethodRow
              id={id}
              method={method}
              selected={data.selectedMethod === id}
              lit={data.litMethods?.has(id) ?? false}
              onSelect={(id) => data.onSelectMethod?.(id)}
              key={method.name}
            />
          );
        })}
      </div>
      {nonEmptyConesOfInfluence !== undefined &&
        (["upstream", "downstream"] as const).map(
          (coneOfInfluence) =>
            nonEmptyConesOfInfluence[coneOfInfluence] && (
              <ConeOfInfluenceButton
                coneOfInfluence={coneOfInfluence}
                top={topOfRow(selectedIndex)}
                lit={data.conesOfInfluence?.[coneOfInfluence] ?? false}
                color={colorOfKind(data.stateType.methods[selectedIndex].kind)}
                title={
                  data.conesOfInfluence?.[coneOfInfluence]
                    ? coneOfInfluence === "upstream"
                      ? "Hide who calls this method"
                      : "Hide what this method calls"
                    : coneOfInfluence === "upstream"
                    ? "Show who calls this method"
                    : "Show what this method calls"
                }
                onClick={() => data.onToggleConeOfInfluence?.(coneOfInfluence)}
                key={coneOfInfluence}
              />
            )
        )}
    </>
  );
};

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

// The canvas's viewport for each history entry, restored when a
// back or forward returns to the graph. At module level because the
// page unmounts whenever another page shows.
const graphViewports = new Map<string, Viewport>();

const GraphCanvas: FC<{
  packages: GraphPackage[];
  // The chosen method's id, which is what the URL names: choosing
  // one is a navigation, so back steps to the one chosen before.
  selectedMethodId: string | null;
  onSelectMethod: (id: string | null, replace?: boolean) => void;
  onOpenStateType: (id: string) => void;
  // The layout as the preferences keep it, read once when the page
  // mounts; from then on the page's own copy is the newer one, and
  // every change to it is reported.
  savedLayout: CallGraphLayout;
  onLayoutChange: (layout: CallGraphLayout) => void;
}> = ({
  packages,
  selectedMethodId,
  onSelectMethod,
  onOpenStateType,
  savedLayout,
  onLayoutChange,
}) => {
  const location = useLocation();
  const saved =
    useNavigationType() === "POP"
      ? graphViewports.get(location.key)
      : undefined;

  // Which boxes are collapsed, rather than which are expanded, so a
  // package that appears later starts expanded like the rest.
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(
    savedLayout.collapsedPackages
  );
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const { fitView, getNode, getViewport, setViewport } = useReactFlow();

  // How far each dragged node sits from its place in the default
  // layout, by node id, and the size each resized box was given.
  // Applied again on top of every default layout computed after
  // them. Refs, since a change to them must not compute the default
  // layout again; the count is state, for the button that undoes
  // them.
  const [savedNodeMaps] = useState(() =>
    nodeMapsOfCallGraphLayout(savedLayout)
  );
  const moved = useRef(savedNodeMaps.moved);
  const resized = useRef(savedNodeMaps.resized);
  const [adjustedCount, setAdjustedCount] = useState(
    moved.current.size + resized.current.size
  );

  // Reports the layout after a change to it. Takes the
  // collapsed set because the change to that one is not yet in
  // state when it is reported.
  const publishLayout = useCallback(
    (collapsed: ReadonlySet<string>) => {
      onLayoutChange(
        callGraphLayoutOfNodeMaps(collapsed, moved.current, resized.current)
      );
    },
    [onLayoutChange]
  );

  useEffect(() => {
    if (saved !== undefined) {
      setViewport(saved);
    }
    const key = location.key;
    return () => {
      graphViewports.set(key, getViewport());
    };
    // Runs once per mount: `saved` and `location.key` are fixed for
    // the page's life.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The layout run whose answer still matters. A snapshot arriving
  // while the last is being laid out starts another layout, and only
  // the newest one's answer lands.
  const layoutRun = useRef(0);

  // The nextCollapsed layout is shifted so the clicked box stays put: it grows
  // or shrinks in place, under the reader's eye.
  const boxPositionsAfterLastLayout = useRef(new Map<string, NodePosition>());
  const clickedBoxId = useRef<string | null>(null);

  // Every node's place and every box's size in the last default
  // layout, before the drags and resizes were applied: what those
  // are measured from, and what undoing them returns to.
  const layoutPositions = useRef(new Map<string, NodePosition>());
  const layoutSizes = useRef(new Map<string, BoxSize>());

  // Set when the nextCollapsed layout should be framed whole: the first, and
  // one that opened or closed every box at once, which changes the
  // graph too much for any one spot to hold still. A restored view
  // is already framed the way it was left.
  const fitViewAfterLayout = useRef(saved === undefined);

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
      layoutPositions.current = new Map(
        nodes.map((node) => [node.id, node.position])
      );
      layoutSizes.current = new Map(
        nodes
          .filter((node) => node.type === "expanded")
          .map((node) => [
            node.id,
            { width: node.width ?? 0, height: node.height ?? 0 },
          ])
      );

      // The drags and resizes, on top of the default layout. A node
      // the default layout no longer has, a card of a box now closed,
      // keeps its drag for when it is back.
      for (const node of nodes) {
        const offset = moved.current.get(node.id);
        if (offset !== undefined) {
          node.position = {
            x: node.position.x + offset.x,
            y: node.position.y + offset.y,
          };
        }
        const size = resized.current.get(node.id);
        if (size !== undefined && node.type === "expanded") {
          node.width = Math.max(node.width ?? 0, size.width);
          node.height = Math.max(node.height ?? 0, size.height);
        }
      }

      setNodes(fitBoxesAroundCards(nodes));

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

  const togglePackage = useCallback(
    (name: string) => {
      clickedBoxId.current = packageNodeId(name);
      const nextCollapsed = new Set(collapsed);
      if (nextCollapsed.has(name)) {
        nextCollapsed.delete(name);
      } else {
        nextCollapsed.add(name);
      }
      setCollapsed(nextCollapsed);
      publishLayout(nextCollapsed);
      // Closing the chosen method's own box lets it go, since its
      // row is gone; replaced rather than pushed, since the reader
      // clicked the box, not the choice.
      if (
        selectedMethodId !== null &&
        packageOfStateTypeName(stateTypeNameOfMethodId(selectedMethodId)) ===
          name &&
        !collapsed.has(name)
      ) {
        onSelectMethod(null, true);
      }
    },
    [collapsed, selectedMethodId, onSelectMethod, publishLayout]
  );

  // Records where a node was dropped, measured from its place in the
  // default layout.
  const recordMove = useCallback((id: string, position: NodePosition) => {
    const base = layoutPositions.current.get(id);
    if (base === undefined) {
      return;
    }
    moved.current.set(id, {
      x: position.x - base.x,
      y: position.y - base.y,
    });
  }, []);

  // Records a box's size when it is bigger than its size in the
  // default layout, and forgets it otherwise.
  const recordSize = useCallback((id: string, size: BoxSize) => {
    const base = layoutSizes.current.get(id);
    if (base === undefined) {
      return;
    }
    if (size.width > base.width || size.height > base.height) {
      resized.current.set(id, size);
    } else {
      resized.current.delete(id);
    }
  }, []);

  const recordChanges = useCallback(() => {
    setAdjustedCount(moved.current.size + resized.current.size);
    publishLayout(collapsed);
  }, [collapsed, publishLayout]);

  // A node dropped, and the box it is in, which its drag may have
  // grown.
  const onNodeDragStop = useCallback(
    (node: GraphNode) => {
      recordMove(node.id, node.position);
      const box =
        node.parentId === undefined ? undefined : getNode(node.parentId);
      if (box !== undefined) {
        recordSize(box.id, {
          width: box.width ?? box.measured?.width ?? 0,
          height: box.height ?? box.measured?.height ?? 0,
        });
      }
      recordChanges();
    },
    [recordMove, recordSize, recordChanges, getNode]
  );

  // The size a box was resized to, and where, since a resize from
  // the top or left moves it too.
  const onBoxResize = useCallback(
    (name: string, box: NodePosition & BoxSize) => {
      const id = packageNodeId(name);
      recordSize(id, { width: box.width, height: box.height });
      recordMove(id, box);
      recordChanges();
    },
    [recordMove, recordSize, recordChanges]
  );

  // Puts every dragged node and resized box back as the default
  // layout has them.
  const resetLayout = useCallback(() => {
    moved.current = new Map();
    resized.current = new Map();
    setAdjustedCount(0);
    setNodes((nodes) =>
      nodes.map((node) => ({
        ...node,
        position: layoutPositions.current.get(node.id) ?? node.position,
        ...layoutSizes.current.get(node.id),
      }))
    );
    publishLayout(collapsed);
  }, [collapsed, publishLayout]);

  const setAllCollapsed = useCallback(
    (allCollapsed: boolean) => {
      clickedBoxId.current = null;
      fitViewAfterLayout.current = true;
      const nextCollapsed = new Set(
        allCollapsed ? packages.map((pkg) => pkg.name) : []
      );
      setCollapsed(nextCollapsed);
      publishLayout(nextCollapsed);
      if (allCollapsed && selectedMethodId !== null) {
        onSelectMethod(null, true);
      }
    },
    [packages, selectedMethodId, onSelectMethod, publishLayout]
  );

  // Which cones of the chosen method the graph lights: both, until
  // the buttons flanking the chosen row say otherwise.
  const [conesOfInfluence, setConesOfInfluence] = useState<ConesOfInfluence>(
    DEFAULT_CONES_OF_INFLUENCE
  );

  useEffect(() => {
    setConesOfInfluence(DEFAULT_CONES_OF_INFLUENCE);
  }, [selectedMethodId]);

  const toggleMethodSelection = useCallback(
    (id: string) => {
      onSelectMethod(selectedMethodId === id ? null : id);
    },
    [selectedMethodId, onSelectMethod]
  );

  const toggleConeOfInfluence = useCallback(
    (coneOfInfluence: keyof ConesOfInfluence): void => {
      setConesOfInfluence((current) => ({
        ...current,
        [coneOfInfluence]: !current[coneOfInfluence],
      }));
    },
    []
  );

  // The methods some drawn call lands on, self-calls included, and
  // the methods that make one: what a cone button needs to have
  // anything to light.
  const calledMethodIds = useMemo(() => {
    const methodIds = new Set<string>();
    for (const pkg of packages) {
      for (const stateType of pkg.stateTypes) {
        for (const method of stateType.methods) {
          for (const call of method.calls) {
            if (isDrawn(call)) {
              methodIds.add(methodId(call.stateTypeName, call.methodName));
            }
          }
        }
      }
    }
    return methodIds;
  }, [packages]);

  const callingMethodIds = useMemo(() => {
    const methodIds = new Set<string>();
    for (const pkg of packages) {
      for (const stateType of pkg.stateTypes) {
        for (const method of stateType.methods) {
          if (method.calls.some(isDrawn)) {
            methodIds.add(methodId(stateType.id, method.name));
          }
        }
      }
    }
    return methodIds;
  }, [packages]);

  // With a method chosen, its lit cones: downstream, the methods it
  // calls transitively and the arrows carrying those calls;
  // upstream, the methods that call it transitively, whose arrows
  // must both leave from and land on callers. The cards and boxes a
  // lit arrow touches stay lit, and nothing else does, while the
  // rows of the methods in a cone are marked within their cards. An
  // arrow is in a cone when any method folded into it is. An
  // expanded box never fades: it is the room its cards are in.
  const unfaded = useMemo(() => {
    if (selectedMethodId === null) {
      return null;
    }
    const nodeIds = new Set<string>([
      stateTypeNameOfMethodId(selectedMethodId),
    ]);
    const edgeIds = new Set<string>();
    const methodIds = new Set<string>([selectedMethodId]);
    const light = (edge: Edge<CallEdgeData>): void => {
      edgeIds.add(edge.id);
      nodeIds.add(edge.source);
      nodeIds.add(edge.target);
    };
    if (conesOfInfluence.downstream) {
      const reached = reachableMethodIds(selectedMethodId, packages);
      for (const id of reached) {
        methodIds.add(id);
      }
      for (const edge of edges) {
        if (edge.data!.sourceMethodIds.some((id) => reached.has(id))) {
          light(edge);
        }
      }
    }
    if (conesOfInfluence.upstream) {
      const reaching = reachingMethodIds(selectedMethodId, packages);
      for (const id of reaching) {
        methodIds.add(id);
      }
      for (const edge of edges) {
        if (
          edge.data!.sourceMethodIds.some((id) => reaching.has(id)) &&
          edge.data!.targetMethodIds.some((id) => reaching.has(id))
        ) {
          light(edge);
        }
      }
    }
    return { nodeIds, edgeIds, methodIds };
  }, [selectedMethodId, conesOfInfluence, packages, edges]);

  const shownNodes = useMemo(
    () =>
      nodes.map((node) => {
        const faded =
          unfaded !== null &&
          node.type !== "expanded" &&
          !unfaded.nodeIds.has(node.id);
        const className = faded ? "graph-faded" : undefined;
        switch (node.type) {
          case "expanded": {
            const layoutSize = layoutSizes.current.get(node.id);
            const needed = sizeNeededByCards(
              nodes.filter(
                (card): card is CardNode =>
                  isCard(card) && card.parentId === node.id
              )
            );
            return {
              ...node,
              className,
              data: {
                ...node.data,
                onCollapse: togglePackage,
                onResize: onBoxResize,
                minWidth: Math.max(layoutSize?.width ?? 0, needed.width),
                minHeight: Math.max(layoutSize?.height ?? 0, needed.height),
              },
            };
          }
          case "stateType":
            return {
              ...node,
              className,
              data: {
                ...node.data,
                selectedMethod: selectedMethodId,
                onSelectMethod: toggleMethodSelection,
                onOpenStateType,
                conesOfInfluence,
                onToggleConeOfInfluence: toggleConeOfInfluence,
                calledMethodIds,
                callingMethodIds,
                litMethods: unfaded?.methodIds,
              },
            };
          default:
            return { ...node, className };
        }
      }),
    [
      nodes,
      unfaded,
      selectedMethodId,
      toggleMethodSelection,
      togglePackage,
      onOpenStateType,
      conesOfInfluence,
      toggleConeOfInfluence,
      calledMethodIds,
      callingMethodIds,
    ]
  );

  const shownEdges = useMemo(
    () =>
      edges.map((edge) => {
        const faded = unfaded !== null && !unfaded.edgeIds.has(edge.id);
        return {
          ...edge,
          className: faded ? "graph-faded" : undefined,
          data: { ...edge.data!, faded },
        };
      }),
    [edges, unfaded]
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
      onPaneClick={() => {
        if (selectedMethodId !== null) {
          onSelectMethod(null);
        }
      }}
      // Fitted on every change so a box grows while a card is dragged
      // past its edge, each frame of the drag.
      onNodesChange={(changes) =>
        setNodes((nodes) =>
          fitBoxesAroundCards(
            applyNodeChanges(changes as NodeChange<GraphNode>[], nodes)
          )
        )
      }
      onNodeDragStop={(_event, node) => onNodeDragStop(node as GraphNode)}
      elementsSelectable={false}
      nodesConnectable={false}
      deleteKeyCode={null}
      // Otherwise React Flow raises a card inside a box, and every
      // edge touching one, above the edge labels' layer, and an arrow
      // crosses over its own label.
      zIndexMode="manual"
      fitView
      minZoom={0.2}
      proOptions={{ hideAttribution: true }}
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
        <button
          className="expand-button"
          onClick={resetLayout}
          disabled={adjustedCount === 0}
          title="Put every dragged or resized box and card back as the default layout has it"
        >
          reset layout
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
  selectedMethodId: string | null;
  onSelectMethod: (id: string | null, replace?: boolean) => void;
  onOpenStateType: (id: string) => void;
  savedLayout: CallGraphLayout;
  onLayoutChange: (layout: CallGraphLayout) => void;
}> = ({
  stateTypes,
  selectedMethodId,
  onSelectMethod,
  onOpenStateType,
  savedLayout,
  onLayoutChange,
}) => {
  const packages = useMemo(
    () => groupStateTypesByPackage(stateTypes),
    [stateTypes]
  );

  return (
    <div className="graph-canvas">
      <ReactFlowProvider>
        <GraphCanvas
          packages={packages}
          selectedMethodId={selectedMethodId}
          onSelectMethod={onSelectMethod}
          onOpenStateType={onOpenStateType}
          savedLayout={savedLayout}
          onLayoutChange={onLayoutChange}
        />
      </ReactFlowProvider>
    </div>
  );
};
