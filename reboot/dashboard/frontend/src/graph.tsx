// The call graph page: who calls whom, from the analysis of the
// developer's application joined with their API. A card per state
// type with a row per method, and an arrow for each call a method's
// implementation makes, leaving its row on the right and landing on
// the called method's row on the left.
//
// React Flow draws; ELK places. React Flow deliberately has no layout
// of its own.
import {
  Method_Kind,
  Servicer_Method_Call_How as How,
} from "../../../../rbt/dashboard/v1/dashboard_pb";
import {
  Background,
  BaseEdge,
  Controls,
  EdgeLabelRenderer,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  getBezierPath,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import ELK from "elkjs/lib/elk.bundled.js";
import { useEffect, useRef, useState } from "react";
import type { FC } from "react";
import type { GraphCall, GraphMethod, GraphStateType } from "./callgraph";
import { methodId } from "./callgraph";
import { labelOfKind } from "./link_fields_to_data_types";

// A method the API does not declare has no kind, so its edges and
// its dot are no kind's colour.
const NEUTRAL_COLOR = "hsl(211 25% 60%)";
const NEUTRAL_TEXT = "hsl(211 25% 40%)";

// One colour per kind of method, the hues the kind pills wear on the
// state types page, so a purple edge here and a purple pill there say
// the same thing. Keyed by every `Method.Kind`, so a kind added to
// the proto does not compile until it is coloured here.
const KIND_COLOR: Record<Method_Kind, string> = {
  [Method_Kind.KIND_UNSPECIFIED]: NEUTRAL_COLOR,
  [Method_Kind.READER]: "hsl(166 55% 35%)",
  [Method_Kind.WRITER]: "hsl(211 72% 45%)",
  [Method_Kind.TRANSACTION]: "hsl(275 50% 50%)",
  [Method_Kind.WORKFLOW]: "hsl(36 85% 42%)",
};

// What a label is written in: the same hues, but dark enough to read
// at a label's size. These are the text colours of the kind pills.
const KIND_TEXT: Record<Method_Kind, string> = {
  [Method_Kind.KIND_UNSPECIFIED]: NEUTRAL_TEXT,
  [Method_Kind.READER]: "hsl(166 55% 27%)",
  [Method_Kind.WRITER]: "hsl(211 72% 32%)",
  [Method_Kind.TRANSACTION]: "hsl(275 50% 38%)",
  [Method_Kind.WORKFLOW]: "hsl(28 80% 33%)",
};

const colorOfKind = (kind: Method_Kind | undefined): string =>
  kind === undefined ? NEUTRAL_COLOR : KIND_COLOR[kind];

const textColorOfKind = (kind: Method_Kind | undefined): string =>
  kind === undefined ? NEUTRAL_TEXT : KIND_TEXT[kind];

// The kind's CSS class, which colours the row's dot.
const classNameOfKind = (kind: Method_Kind | undefined): string =>
  `graph-kind-${kind === undefined ? "undeclared" : labelOfKind(kind)}`;

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

// An `until` is a wait on another state's reader, not a call the
// developer made to it, so it is not drawn.
const isDrawn = (call: GraphCall): boolean => call.how !== How.UNTIL;

// The measurements layout works from: a card's height is arithmetic
// on its method count, so ELK can place the cards before they are
// rendered. `ROW_HEIGHT` and `HEAD_HEIGHT` are what `.graph-method`
// and `.graph-state-type-head` come out at; `CARD_SLACK` is the
// card's borders.
const ROW_HEIGHT = 26;
const HEAD_HEIGHT = 34;
const CARD_SLACK = 8;
const CARD_WIDTH = 210;

const heightOfStateType = (stateType: GraphStateType): number =>
  HEAD_HEIGHT + stateType.methods.length * ROW_HEIGHT + CARD_SLACK;

// ---------------------------------------------------------------
// Layout.

const elk = new ELK();

interface StateTypeData extends Record<string, unknown> {
  stateType: GraphStateType;
}

// Where each card goes: callers to the left of what they call, the
// way an edge leaves a row on its right and enters one on its left.
// ELK places by which cards call which; a card calling itself has no
// say in where it goes.
const layoutStateTypes = async (
  stateTypes: GraphStateType[]
): Promise<Node<StateTypeData>[]> => {
  const pairs = new Set<string>();
  for (const stateType of stateTypes) {
    for (const method of stateType.methods) {
      for (const call of method.calls) {
        if (isDrawn(call) && call.stateTypeName !== stateType.id) {
          pairs.add(`${stateType.id}>${call.stateTypeName}`);
        }
      }
    }
  }

  const laid = await elk.layout({
    id: "root",
    layoutOptions: {
      "elk.algorithm": "layered",
      "elk.direction": "RIGHT",
      "elk.spacing.nodeNode": "36",
      "elk.layered.spacing.nodeNodeBetweenLayers": "90",
      // Ties broken by the order the state types are declared in, so
      // the same graph always comes out the same way.
      "elk.layered.considerModelOrder.strategy": "NODES_AND_EDGES",
    },
    children: stateTypes.map((stateType) => ({
      id: stateType.id,
      width: CARD_WIDTH,
      height: heightOfStateType(stateType),
    })),
    edges: [...pairs].map((pair) => {
      const [source, target] = pair.split(">");
      return { id: pair, sources: [source], targets: [target] };
    }),
  });

  const at = new Map(
    (laid.children ?? []).map((child) => [
      child.id,
      { x: child.x ?? 0, y: child.y ?? 0 },
    ])
  );

  return stateTypes.map((stateType) => ({
    id: stateType.id,
    type: "stateType",
    position: at.get(stateType.id) ?? { x: 0, y: 0 },
    width: CARD_WIDTH,
    data: { stateType },
  }));
};

// ---------------------------------------------------------------
// Edges.

interface CallEdgeData extends Record<string, unknown> {
  how: How;
  // The calling method's kind, which is the edge's colour.
  kind?: Method_Kind;
  count: number;
}

const edgesOfStateTypes = (
  stateTypes: GraphStateType[]
): Edge<CallEdgeData>[] => {
  const edges: Edge<CallEdgeData>[] = [];
  for (const stateType of stateTypes) {
    for (const method of stateType.methods) {
      for (const call of method.calls) {
        if (!isDrawn(call)) {
          continue;
        }
        const caller = methodId(stateType.id, method.name);
        const called = methodId(call.stateTypeName, call.methodName);
        edges.push({
          id: `${caller}>${called}:${call.how}`,
          source: stateType.id,
          sourceHandle: `s:${method.name}`,
          target: call.stateTypeName,
          targetHandle: `t:${call.methodName}`,
          type: "call",
          data: { how: call.how, kind: method.kind, count: call.count },
          markerEnd: {
            type: MarkerType.ArrowClosed,
            color: colorOfKind(method.kind),
            width: 16,
            height: 16,
          },
        });
      }
    }
  }
  return edges;
};

// ---------------------------------------------------------------
// The pieces React Flow draws.

// One method, one row: its kind's colour on the dot, its name, and
// an edge landing on its left or leaving on its right. The handles
// are invisible: the edge just needs somewhere to land.
const MethodRow: FC<{ method: GraphMethod }> = ({ method }) => (
  <div
    className={`graph-method ${classNameOfKind(method.kind)}`}
    title={
      method.kind === undefined
        ? "not declared in the API"
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
    {method.factory && <span className="graph-method-factory">new</span>}
    <Handle
      type="source"
      position={Position.Right}
      id={`s:${method.name}`}
      className="graph-port"
    />
  </div>
);

const StateTypeNode: FC<NodeProps<Node<StateTypeData>>> = ({ data }) => (
  <div className="graph-state-type">
    <div className="graph-state-type-head">{data.stateType.name}</div>
    {data.stateType.methods.map((method) => (
      <MethodRow method={method} key={method.name} />
    ))}
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
    // between. The swing grows with the distance between the rows,
    // so two loops on one card travel at different depths and their
    // labels land apart.
    const below = targetY >= sourceY - 1;
    const depth = 46 + Math.abs(targetY - sourceY) * 0.35;
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
  const count = data?.count ?? 1;
  const word = how === undefined ? undefined : HOW_LABEL[how];
  const label = count > 1 ? `${word ?? "calls"} ×${count}` : word;
  // A workflow's calls are dashed too: it runs past the call that
  // started it.
  const dash =
    (how === undefined ? undefined : HOW_DASH[how]) ??
    (kind === Method_Kind.WORKFLOW ? "4 4" : undefined);

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        style={{
          stroke: colorOfKind(kind),
          strokeWidth: 1.6,
          strokeDasharray: dash,
        }}
      />
      {label !== undefined && (
        <EdgeLabelRenderer>
          <div
            className="graph-edge-label"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              color: textColorOfKind(kind),
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
};

const nodeTypes = { stateType: StateTypeNode };

const edgeTypes = { call: CallEdge };

// ---------------------------------------------------------------
// The page.

export const GraphPage: FC<{
  stateTypes: GraphStateType[];
  onCount: (calls: number) => void;
}> = ({ stateTypes, onCount }) => {
  const [graph, setGraph] = useState<{
    nodes: Node<StateTypeData>[];
    edges: Edge<CallEdgeData>[];
  }>({ nodes: [], edges: [] });

  // The layout run whose answer still matters. A snapshot arriving
  // while the last is being laid out starts another layout, and only
  // the newest one's answer lands. Nodes and edges land together, so
  // no edge is ever drawn to a card the canvas does not yet have.
  const run = useRef(0);

  useEffect(() => {
    const current = ++run.current;
    layoutStateTypes(stateTypes).then((nodes) => {
      if (run.current === current) {
        setGraph({ nodes, edges: edgesOfStateTypes(stateTypes) });
      }
    });
  }, [stateTypes]);

  useEffect(() => onCount(graph.edges.length), [graph.edges.length, onCount]);

  return (
    <div className="graph-canvas">
      <ReactFlow
        nodes={graph.nodes}
        edges={graph.edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        // ELK places the nodes, so they don't move one by one. Left
        // draggable, a node would swallow the mouse and a drag on it
        // would do nothing; this way it falls through and pans the
        // graph.
        nodesDraggable={false}
        elementsSelectable={false}
        nodesConnectable={false}
        deleteKeyCode={null}
        fitView
        minZoom={0.2}
      >
        <Background gap={22} size={1.2} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
};
