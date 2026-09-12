// The call graph page: who calls whom, from the analysis of the
// developer's application joined with their API. A card per state
// type with a row per method, and an arrow for each call a method's
// implementation makes, leaving its row on the right and landing on
// the called method's row on the left. The cards sit in one box per
// package; a collapsed box hides its cards, and the calls leaving it
// fold into one counted arrow per box they reach.
//
// A card per agent too, with a row per tool, which runs land on and
// the calls the tools make leave from: an agent stands beside the
// packages rather than in one, since it belongs to no package of the
// API, and is never collapsed.
//
// React Flow draws; ELK places. React Flow deliberately has no layout
// of its own.
import {
  Agent_Run_How as RunHow,
  Agent_Tool_How as ToolHow,
  Servicer_Method_Call_How as How,
} from "../../../../rbt/dashboard/v1/dashboard_pb";
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
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
  useReactFlow,
} from "@xyflow/react";
import type { Viewport } from "@xyflow/react";
import { useLocation, useNavigationType } from "react-router";
import ELK from "elkjs/lib/elk.bundled.js";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FC, MouseEvent, ReactNode } from "react";
import type {
  GraphAgent,
  GraphCall,
  GraphPackage,
  GraphRun,
  GraphStateType,
} from "./callgraph";
import {
  agentId,
  groupStateTypesByPackage,
  isAgentRowId,
  methodId,
  toolId,
} from "./callgraph";
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

// An agent is a kind of nothing the API declares, so its card, its
// rows, and the arrows leaving its tools wear a hue of their own.
const AGENT_COLOR = "hsl(291 45% 48%)";
const AGENT_TEXT = "hsl(291 45% 36%)";

// What a row's dot and an arrow are drawn in: the kind of the method
// it belongs to, or an agent's own hue.
type Hue = Kind | "agent";

const colorOfHue = (hue: Hue | undefined): string =>
  hue === undefined
    ? NEUTRAL_COLOR
    : hue === "agent"
    ? AGENT_COLOR
    : KIND_COLOR[hue];

const textColorOfHue = (hue: Hue | undefined): string =>
  hue === undefined
    ? NEUTRAL_TEXT
    : hue === "agent"
    ? AGENT_TEXT
    : KIND_TEXT[hue];

// The hue's CSS class, which colours the row's dot.
const classNameOfHue = (hue: Hue | undefined): string =>
  `graph-kind-${
    hue === undefined ? "unknown" : hue === "agent" ? "agent" : labelOfKind(hue)
  }`;

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

// How an agent is run, said in one word on the edge. Every run says
// something: handing the work to a model is never the ordinary case
// an unlabelled arrow means.
const HOW_RUN_LABEL: Record<RunHow, string> = {
  [RunHow.UNKNOWN]: "runs",
  [RunHow.RUN]: "runs",
  [RunHow.ITER]: "iterates",
  [RunHow.RUN_STREAM]: "streams",
  [RunHow.RUN_STREAM_EVENTS]: "streams",
};

// How the agent was given a tool, which is what its row says when
// the pointer rests on it.
const HOW_TOOL_TITLE: Record<ToolHow, string> = {
  [ToolHow.UNKNOWN]: "a tool",
  [ToolHow.DECORATED]: "decorated on the agent",
  [ToolHow.CONSTRUCTED]: "given where the agent is constructed",
  [ToolHow.RUN]: "given where the agent is run",
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

// An agent's card is wider, because what it is is a prompt, and its
// head is taller: the emoji and the name, then the model, then the
// first lines of the prompt, which `.graph-agent-prompt` clamps to
// the height below. An agent with no prompt to show has a head of
// `AGENT_HEAD_HEIGHT` alone.
const AGENT_CARD_WIDTH = 260;
const AGENT_HEAD_HEIGHT = 40;
const AGENT_PROMPT_HEIGHT = 48;

const heightOfStateType = (stateType: GraphStateType): number =>
  HEAD_HEIGHT + stateType.methods.length * ROW_HEIGHT + CARD_SLACK;

// What an agent's tool rows start below, which is its head with the
// prompt it shows, if it shows one.
const headHeightOfAgent = (agent: GraphAgent): number =>
  AGENT_HEAD_HEIGHT + (agent.systemPrompt.length > 0 ? AGENT_PROMPT_HEIGHT : 0);

const heightOfAgent = (agent: GraphAgent): number =>
  headHeightOfAgent(agent) + agent.tools.length * ROW_HEIGHT + CARD_SLACK;

// A package's node id, kept apart from state type ids, which are
// fully qualified names and could equal a package's.
const packageNodeId = (name: string): string => `pkg:${name}`;

// The card a row belongs to: `bank.v1.Account` for
// `bank.v1.Account.deposit`, and `agent:librarian` for
// `agent:librarian.get_page`.
const cardOfRowId = (id: string): string => id.slice(0, id.lastIndexOf("."));

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

interface AgentData extends Record<string, unknown> {
  agent: GraphAgent;
  // The chosen row's id, when one is chosen, which may be a tool of
  // this agent or anything else the graph draws.
  selectedRow?: string | null;
  onSelectRow?: (id: string, cones: Cones) => void;
  onOpenAgent?: (id: string) => void;
  cones?: Cones;
  onToggleCone?: (cone: keyof Cones) => void;
  withCallers?: Set<string>;
  withCalls?: Set<string>;
}

// Which cones of the chosen method the graph lights: what it calls
// (downstream), who calls it (upstream), or both.
interface Cones {
  downstream: boolean;
  upstream: boolean;
}

const DEFAULT_CONES: Cones = { downstream: true, upstream: false };

const sameCones = (a: Cones, b: Cones): boolean =>
  a.downstream === b.downstream && a.upstream === b.upstream;

// Which third of a method's row the pointer is over, which is what a
// click there asks for: the left third, who calls the method; the
// middle, both; the right third, what it calls.
type RowThird = "upstream" | "both" | "downstream";

const thirdOfPointer = (event: MouseEvent<HTMLElement>): RowThird => {
  const rect = event.currentTarget.getBoundingClientRect();
  const across = (event.clientX - rect.left) / rect.width;
  return across < 1 / 3 ? "upstream" : across < 2 / 3 ? "both" : "downstream";
};

const CONES_OF_THIRD: Record<RowThird, Cones> = {
  upstream: { upstream: true, downstream: false },
  both: { upstream: true, downstream: true },
  downstream: { upstream: false, downstream: true },
};

interface StateTypeData extends Record<string, unknown> {
  stateType: GraphStateType;
  // The chosen row's id, when one is chosen.
  selectedRow?: string | null;
  onSelectRow?: (id: string, cones: Cones) => void;
  onOpenStateType?: (id: string) => void;
  cones?: Cones;
  onToggleCone?: (cone: keyof Cones) => void;
  // The rows some drawn arrow lands on, and the rows that make one;
  // a button with nothing to light is never shown.
  withCallers?: Set<string>;
  withCalls?: Set<string>;
}

type GraphNode =
  | Node<PackageData, "package">
  | Node<ExpandedPackageData, "expanded">
  | Node<StateTypeData, "stateType">
  | Node<AgentData, "agent">;

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
// Each expanded box's cards are laid out alone, then the boxes and
// the agents' cards are laid out at the size their contents came to,
// so an open box never lands on a neighbour. A card or box calling
// itself has no say in where it goes.
const layoutPackages = async (
  packages: GraphPackage[],
  agents: GraphAgent[],
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

  // Between the boxes and the agents' cards, which are laid out
  // together: a package's calls reach the packages they name and the
  // agents its methods run, and an agent's tools reach the packages
  // they call and the agents they run.
  const pairsBetweenBoxes = new Set<string>();
  const agentIds = new Set(agents.map((agent) => agent.id));
  const reaches = (source: string, target: string): void => {
    if (source !== target) {
      pairsBetweenBoxes.add(`${source}\u0000${target}`);
    }
  };
  for (const pkg of packages) {
    const source = packageNodeId(pkg.name);
    for (const stateType of pkg.stateTypes) {
      for (const method of stateType.methods) {
        for (const call of method.calls) {
          if (isDrawn(call)) {
            reaches(
              source,
              packageNodeId(packageOfStateTypeName(call.stateTypeName))
            );
          }
        }
        for (const run of method.runs) {
          if (agentIds.has(agentId(run.agentName))) {
            reaches(source, agentId(run.agentName));
          }
        }
      }
    }
  }
  for (const agent of agents) {
    for (const tool of agent.tools) {
      for (const call of tool.calls) {
        if (isDrawn(call)) {
          reaches(
            agent.id,
            packageNodeId(packageOfStateTypeName(call.stateTypeName))
          );
        }
      }
      for (const run of tool.runs) {
        if (agentIds.has(agentId(run.agentName))) {
          reaches(agent.id, agentId(run.agentName));
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
    children: [
      ...packages.map((pkg) => {
        const cardLayout = cardLayoutsByPackage.get(pkg.name);
        return {
          id: packageNodeId(pkg.name),
          width: cardLayout?.width ?? COLLAPSED_PACKAGE_WIDTH,
          height: cardLayout?.height ?? COLLAPSED_PACKAGE_HEIGHT,
        };
      }),
      ...agents.map((agent) => ({
        id: agent.id,
        width: AGENT_CARD_WIDTH,
        height: heightOfAgent(agent),
      })),
    ],
    edges: [...pairsBetweenBoxes].map((pair) => {
      const [source, target] = pair.split("\u0000");
      return { id: pair, sources: [source], targets: [target] };
    }),
  });

  const boxPositions = new Map<string, Point>(
    (elkPackageLayout.children ?? []).map((elkBox) => [
      elkBox.id,
      { x: elkBox.x ?? 0, y: elkBox.y ?? 0 },
    ])
  );

  // A parent precedes its children: React Flow resolves a elkCard's
  // position, relative to its parent, in array order.
  const nodes: GraphNode[] = [];
  for (const agent of agents) {
    nodes.push({
      id: agent.id,
      type: "agent",
      position: boxPositions.get(agent.id) ?? { x: 0, y: 0 },
      width: AGENT_CARD_WIDTH,
      data: { agent },
    });
  }
  for (const pkg of packages) {
    const boxId = packageNodeId(pkg.name);
    const position = boxPositions.get(boxId) ?? { x: 0, y: 0 };
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
  // Absent on a folded edge, which carries calls reached every way,
  // and on an edge that is a run rather than a call.
  how?: How;
  // Which way an agent is run, on an edge that is a run, and
  // `UNKNOWN` on a folded one, which carries runs made every way.
  runHow?: RunHow;
  // The hue the edge is drawn in: the calling method's kind, or an
  // agent's own for an edge leaving one of its tools. Absent for a
  // method the API does not declare, and on a folded edge.
  hue?: Hue;
  count: number;
  // Every row whose arrows this edge carries: one for an edge from a
  // method's or a tool's row, each contributor for a folded edge.
  // What choosing a row keeps, transitively.
  sourceIds: string[];
  // Every row it lands on the same way, which is what says whether
  // the edge lands inside the upstream cone.
  targetIds: string[];
  // Set while another row is chosen. The label fades off this
  // rather than off the edge's class: `EdgeLabelRenderer` draws
  // labels in a layer of their own, out of the class's reach.
  faded?: boolean;
}

// Where a run lands: an agent's card is one thing to run, however
// many tools it has, so every run enters it at its head.
const AGENT_TARGET_HANDLE = "t:agent";

// One arrow, drawn or folded into the one already drawn between the
// same two places, which is what a collapsed box's arrows become.
const addEdge = (
  edgesById: Map<string, Edge<CallEdgeData>>,
  edge: {
    id: string;
    source: string;
    sourceHandle?: string;
    target: string;
    targetHandle?: string;
    hue?: Hue;
    how?: How;
    runHow?: RunHow;
    count: number;
    sourceId: string;
    targetId: string;
  }
): void => {
  const folded = edgesById.get(edge.id);
  if (folded !== undefined) {
    const data = folded.data!;
    data.count += edge.count;
    if (!data.sourceIds.includes(edge.sourceId)) {
      data.sourceIds.push(edge.sourceId);
    }
    if (!data.targetIds.includes(edge.targetId)) {
      data.targetIds.push(edge.targetId);
    }
    if (data.runHow !== undefined && data.runHow !== edge.runHow) {
      data.runHow = RunHow.UNKNOWN;
    }
    return;
  }
  edgesById.set(edge.id, {
    id: edge.id,
    source: edge.source,
    sourceHandle: edge.sourceHandle,
    target: edge.target,
    targetHandle: edge.targetHandle,
    type: "call",
    data: {
      how: edge.how,
      runHow: edge.runHow,
      hue: edge.hue,
      count: edge.count,
      sourceIds: [edge.sourceId],
      targetIds: [edge.targetId],
    },
    markerEnd: {
      type: MarkerType.ArrowClosed,
      color: colorOfHue(edge.hue),
      width: 16,
      height: 16,
    },
  });
};

// Who calls whom, over everything the graph draws, by row: a method
// leads to the methods its calls name and to the agents it runs; an
// agent leads to each of its tools, which is what running it
// reaches; and a tool leads on the way a method does. Collapse-blind,
// so a path continues through a collapsed box.
interface Reachability {
  callees: Map<string, string[]>;
  callers: Map<string, string[]>;
}

const reachability = (
  packages: GraphPackage[],
  agents: GraphAgent[]
): Reachability => {
  const callees = new Map<string, string[]>();
  const callers = new Map<string, string[]>();
  const leads = (from: string, to: string): void => {
    callees.set(from, [...(callees.get(from) ?? []), to]);
    callers.set(to, [...(callers.get(to) ?? []), from]);
  };
  const leadsFrom = (id: string, calls: GraphCall[], runs: GraphRun[]) => {
    for (const call of calls) {
      if (isDrawn(call)) {
        leads(id, methodId(call.stateTypeName, call.methodName));
      }
    }
    for (const run of runs) {
      leads(id, agentId(run.agentName));
    }
  };

  for (const pkg of packages) {
    for (const stateType of pkg.stateTypes) {
      for (const method of stateType.methods) {
        leadsFrom(
          methodId(stateType.id, method.name),
          method.calls,
          method.runs
        );
      }
    }
  }
  for (const agent of agents) {
    for (const tool of agent.tools) {
      const id = toolId(agent.id, tool.name);
      leads(agent.id, id);
      leadsFrom(id, tool.calls, tool.runs);
    }
  }

  return { callees, callers };
};

// Everything the chosen row leads to, transitively, itself included,
// and everything that leads to it, over the same graph.
const closure = (from: string, edges: Map<string, string[]>): Set<string> => {
  const reached = new Set([from]);
  const frontier = [from];
  while (frontier.length > 0) {
    for (const next of edges.get(frontier.pop()!) ?? []) {
      if (!reached.has(next)) {
        reached.add(next);
        frontier.push(next);
      }
    }
  }
  return reached;
};

// The edges as the boxes show them. A call whose box is expanded
// leaves from its own method row; otherwise it leaves from the box,
// and every call the box hides folds into one counted edge per node
// they reach. An agent's card is never in a box and never collapsed,
// so its tools' arrows always leave their own rows, and a run always
// lands on the agent's head.
const edgesOf = (
  packages: GraphPackage[],
  agents: GraphAgent[],
  collapsed: ReadonlySet<string>
): Edge<CallEdgeData>[] => {
  const edgesById = new Map<string, Edge<CallEdgeData>>();
  const agentsByName = new Map(agents.map((agent) => [agent.name, agent]));

  for (const pkg of packages) {
    const sourceExpanded = !collapsed.has(pkg.name);
    for (const stateType of pkg.stateTypes) {
      for (const method of stateType.methods) {
        const source = sourceExpanded ? stateType.id : packageNodeId(pkg.name);
        const sourceHandle = sourceExpanded ? `s:${method.name}` : undefined;
        const caller = methodId(stateType.id, method.name);

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

          const target = targetExpanded
            ? call.stateTypeName
            : packageNodeId(targetPackage);
          const targetHandle = targetExpanded
            ? `t:${call.methodName}`
            : undefined;

          addEdge(edgesById, {
            id: sourceExpanded
              ? `${source}|${sourceHandle}>${target}|${targetHandle}:${call.how}`
              : `${source}>${target}|${targetHandle}`,
            source,
            sourceHandle,
            target,
            targetHandle,
            hue: sourceExpanded ? method.kind : undefined,
            how: sourceExpanded ? call.how : undefined,
            count: call.count,
            sourceId: caller,
            targetId: methodId(call.stateTypeName, call.methodName),
          });
        }

        for (const run of method.runs) {
          const agent = agentsByName.get(run.agentName);
          // A run naming an agent the analysis never recorded has
          // nowhere to land.
          if (agent === undefined) {
            continue;
          }
          addEdge(edgesById, {
            id: sourceExpanded
              ? `${source}|${sourceHandle}>${agent.id}:${run.how}`
              : `${source}>${agent.id}`,
            source,
            sourceHandle,
            target: agent.id,
            targetHandle: AGENT_TARGET_HANDLE,
            hue: sourceExpanded ? method.kind : undefined,
            runHow: sourceExpanded ? run.how : RunHow.UNKNOWN,
            count: run.count,
            sourceId: caller,
            targetId: agent.id,
          });
        }
      }
    }
  }

  for (const agent of agents) {
    for (const tool of agent.tools) {
      const source = agent.id;
      const sourceHandle = `s:${tool.name}`;
      const caller = toolId(agent.id, tool.name);

      for (const call of tool.calls) {
        if (!isDrawn(call)) {
          continue;
        }
        const targetPackage = packageOfStateTypeName(call.stateTypeName);
        const targetExpanded = !collapsed.has(targetPackage);
        const target = targetExpanded
          ? call.stateTypeName
          : packageNodeId(targetPackage);
        const targetHandle = targetExpanded
          ? `t:${call.methodName}`
          : undefined;

        addEdge(edgesById, {
          id: `${source}|${sourceHandle}>${target}|${targetHandle}:${call.how}`,
          source,
          sourceHandle,
          target,
          targetHandle,
          hue: "agent",
          how: call.how,
          count: call.count,
          sourceId: caller,
          targetId: methodId(call.stateTypeName, call.methodName),
        });
      }

      for (const run of tool.runs) {
        const target = agentsByName.get(run.agentName);
        if (target === undefined) {
          continue;
        }
        addEdge(edgesById, {
          id: `${source}|${sourceHandle}>${target.id}:${run.how}`,
          source,
          sourceHandle,
          target: target.id,
          targetHandle: AGENT_TARGET_HANDLE,
          hue: "agent",
          runHow: run.how,
          count: run.count,
          sourceId: caller,
          targetId: target.id,
        });
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

// One row of a card: a method of a state type, or a tool of an
// agent, with an edge landing on its left or leaving on its right.
interface CardRow {
  // The row's id, in the one space every arrow's ends are named in.
  id: string;
  name: string;
  hue?: Hue;
  // What the row says of itself when the pointer rests on it.
  title: string;
  // A word the row wears at its right, e.g. `factory`.
  badge?: string;
}

// The handles are invisible: the edge just needs somewhere to land.
// Hovering the row shows, beside the card, the cones a click there
// lights: the left third of the row, the arrow in, who calls it; the
// right third, the arrow out, what it calls; the middle, both. A
// click chooses the row with those cones, which also opens it in the
// types pane, and a click asking for what is already lit lets it go.
const Row: FC<{
  row: CardRow;
  selected: boolean;
  onHover: (third: RowThird | null) => void;
  onSelect: (id: string, cones: Cones) => void;
}> = ({ row, selected, onHover, onSelect }) => (
  <div
    className={`graph-method ${classNameOfHue(row.hue)}${
      selected ? " selected" : ""
    }`}
    onMouseMove={(event) => onHover(thirdOfPointer(event))}
    onMouseLeave={() => onHover(null)}
    onClick={(event) => {
      event.stopPropagation();
      onSelect(row.id, CONES_OF_THIRD[thirdOfPointer(event)]);
    }}
    title={row.title}
  >
    <Handle
      type="target"
      position={Position.Left}
      id={`t:${row.name}`}
      className="graph-port"
    />
    <span className="graph-method-dot" aria-hidden="true" />
    <span className="graph-method-name">{row.name}</span>
    {row.badge !== undefined && (
      <span className="graph-method-factory">{row.badge}</span>
    )}
    <Handle
      type="source"
      position={Position.Right}
      id={`s:${row.name}`}
      className="graph-port"
    />
  </div>
);

// A button beside the card, level with a row, for one of the row's
// cones: lit in the row's hue while that cone is shown, and unlit
// again under the pointer, since a click then puts it out.
const ConeButton: FC<{
  cone: keyof Cones;
  top: number;
  lit: boolean;
  color: string;
  title: string;
  onClick: () => void;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
}> = ({
  cone,
  top,
  lit,
  color,
  title,
  onClick,
  onMouseEnter,
  onMouseLeave,
}) => {
  const [hovered, setHovered] = useState(false);
  const shownLit = lit && !hovered;
  return (
    <button
      type="button"
      className={`graph-cone graph-cone-${cone}${shownLit ? " is-active" : ""}`}
      style={
        shownLit ? { top, background: color, borderColor: color } : { top }
      }
      title={title}
      aria-pressed={lit}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
      onMouseEnter={() => {
        setHovered(true);
        onMouseEnter();
      }}
      onMouseLeave={() => {
        setHovered(false);
        onMouseLeave();
      }}
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

// How long the buttons a hovered row showed stay once the pointer
// leaves the row, which is what lets it reach them: they sit beside
// the card, past the row's edge.
const HOVER_LINGER_MS = 250;

// What a state type and an agent are both drawn as: a head, a row
// each, and the cone buttons flanking the chosen row. `headHeight`
// is what the head comes out at, which is what places the buttons,
// since the card clips its contents and they are siblings of it.
const RowsCard: FC<{
  className: string;
  head: ReactNode;
  headHeight: number;
  rows: CardRow[];
  selectedRow?: string | null;
  onSelectRow?: (id: string, cones: Cones) => void;
  cones?: Cones;
  onToggleCone?: (cone: keyof Cones) => void;
  // The rows some drawn arrow lands on, and the rows that make one;
  // a button with nothing to light is never shown.
  withCallers?: Set<string>;
  withCalls?: Set<string>;
}> = ({
  className,
  head,
  headHeight,
  rows,
  selectedRow,
  onSelectRow,
  cones,
  onToggleCone,
  withCallers,
  withCalls,
}) => {
  const selectedIndex =
    selectedRow == null ? -1 : rows.findIndex((row) => row.id === selectedRow);
  const topOfRow = (index: number): number =>
    1 + headHeight + index * ROW_HEIGHT + ROW_HEIGHT / 2;

  // The row the pointer is over and which third of it, with the
  // hide put off a moment when the pointer leaves, so it can reach
  // the buttons the hover showed.
  const [hovered, setHovered] = useState<{
    index: number;
    third: RowThird;
  } | null>(null);
  const hideTimer = useRef<number | null>(null);
  const keepShown = useCallback((): void => {
    if (hideTimer.current !== null) {
      window.clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  }, []);
  const hideSoon = useCallback((): void => {
    keepShown();
    hideTimer.current = window.setTimeout(
      () => setHovered(null),
      HOVER_LINGER_MS
    );
  }, [keepShown]);
  useEffect(() => keepShown, [keepShown]);

  // The cones a row has anything to light in.
  const availableCones = (id: string): Cones => ({
    upstream: withCallers?.has(id) ?? false,
    downstream: withCalls?.has(id) ?? false,
  });

  // Chooses a row with the cones asked for, of those it has; a
  // click asking only for a cone it lacks lights what it has.
  const select = (id: string, asked: Cones): void => {
    const available = availableCones(id);
    const wanted: Cones = {
      upstream: asked.upstream && available.upstream,
      downstream: asked.downstream && available.downstream,
    };
    onSelectRow?.(
      id,
      wanted.upstream || wanted.downstream ? wanted : available
    );
  };

  // Which buttons stand beside which row. The chosen row keeps a
  // button for each cone it has lit; hovering it in a third that
  // asks for a cone it has not lit shows that cone's button too,
  // which lights it. Any other hovered row shows the buttons for the
  // cones its third asks for, of those it has, and clicking one
  // chooses the row with that cone alone.
  const asked = hovered === null ? undefined : CONES_OF_THIRD[hovered.third];
  const buttonsOf = (
    index: number
  ): { row: CardRow; show: Cones } | undefined => {
    if (index === -1) {
      return undefined;
    }
    const row = rows[index];
    const available = availableCones(row.id);
    const lit =
      index === selectedIndex
        ? cones ?? DEFAULT_CONES
        : { upstream: false, downstream: false };
    const hoveredHere = hovered?.index === index && asked !== undefined;
    return {
      row,
      show: {
        upstream:
          available.upstream &&
          (lit.upstream || (hoveredHere && asked.upstream)),
        downstream:
          available.downstream &&
          (lit.downstream || (hoveredHere && asked.downstream)),
      },
    };
  };
  const selectedButtons = buttonsOf(selectedIndex);
  const hoveredButtons =
    hovered !== null && hovered.index !== selectedIndex
      ? buttonsOf(hovered.index)
      : undefined;

  return (
    <>
      <div className={className}>
        {head}
        {rows.map((row, index) => (
          <Row
            row={row}
            selected={selectedRow === row.id}
            onHover={(third) => {
              if (third === null) {
                hideSoon();
              } else {
                keepShown();
                setHovered({ index, third });
              }
            }}
            onSelect={select}
            key={row.id}
          />
        ))}
      </div>
      {selectedButtons !== undefined &&
        (["upstream", "downstream"] as const).map(
          (cone) =>
            selectedButtons.show[cone] && (
              <ConeButton
                cone={cone}
                top={topOfRow(selectedIndex)}
                lit={cones?.[cone] ?? false}
                color={colorOfHue(selectedButtons.row.hue)}
                title={
                  cones?.[cone]
                    ? cone === "upstream"
                      ? "Hide what calls this"
                      : "Hide what this calls"
                    : cone === "upstream"
                    ? "Show what calls this"
                    : "Show what this calls"
                }
                onClick={() => onToggleCone?.(cone)}
                onMouseEnter={keepShown}
                onMouseLeave={hideSoon}
                key={cone}
              />
            )
        )}
      {hoveredButtons !== undefined &&
        hovered !== null &&
        (["upstream", "downstream"] as const).map(
          (cone) =>
            hoveredButtons.show[cone] && (
              <ConeButton
                cone={cone}
                top={topOfRow(hovered.index)}
                lit={false}
                color={colorOfHue(hoveredButtons.row.hue)}
                title={
                  cone === "upstream"
                    ? "Show what calls this"
                    : "Show what this calls"
                }
                onClick={() =>
                  select(hoveredButtons.row.id, {
                    upstream: cone === "upstream",
                    downstream: cone === "downstream",
                  })
                }
                onMouseEnter={keepShown}
                onMouseLeave={hideSoon}
                key={cone}
              />
            )
        )}
    </>
  );
};

const StateTypeNode: FC<NodeProps<Node<StateTypeData, "stateType">>> = ({
  data,
}) => (
  <RowsCard
    className="graph-state-type"
    headHeight={HEAD_HEIGHT}
    head={
      // The name is the way to the state type in the types pane.
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
    }
    rows={data.stateType.methods.map((method) => ({
      id: methodId(data.stateType.id, method.name),
      name: method.name,
      hue: method.kind,
      badge: method.factory ? "factory" : undefined,
      title:
        method.kind === undefined
          ? "unknown"
          : `${labelOfKind(method.kind)}${method.factory ? ", factory" : ""}`,
    }))}
    selectedRow={data.selectedRow}
    onSelectRow={data.onSelectRow}
    cones={data.cones}
    onToggleCone={data.onToggleCone}
    withCallers={data.withCallers}
    withCalls={data.withCalls}
  />
);

// An agent: the robot, its name and its model, the first of its
// prompt, and a row per tool. Runs land on its head, since running
// it is running the whole of it, and each tool's own calls leave its
// row.
const AgentNode: FC<NodeProps<Node<AgentData, "agent">>> = ({ data }) => (
  <RowsCard
    className="graph-agent"
    headHeight={headHeightOfAgent(data.agent)}
    head={
      <>
        <div
          className="graph-agent-head graph-method-open"
          title="open the agent in the types pane"
          onClick={(event) => {
            event.stopPropagation();
            data.onOpenAgent?.(data.agent.id);
          }}
        >
          <Handle
            type="target"
            position={Position.Left}
            id={AGENT_TARGET_HANDLE}
            className="graph-port"
          />
          <div className="graph-agent-title">
            <span className="graph-agent-emoji" aria-hidden="true">
              🤖
            </span>
            <span className="graph-agent-name">{data.agent.name}</span>
          </div>
          {data.agent.model !== undefined && (
            <span className="graph-agent-model">{data.agent.model}</span>
          )}
        </div>
        {data.agent.systemPrompt.length > 0 && (
          <div className="graph-agent-prompt">
            {data.agent.systemPrompt.join("\n\n")}
          </div>
        )}
      </>
    }
    rows={data.agent.tools.map((tool) => ({
      id: toolId(data.agent.id, tool.name),
      name: tool.name,
      hue: "agent" as const,
      title:
        tool.description === undefined
          ? HOW_TOOL_TITLE[tool.how]
          : `${HOW_TOOL_TITLE[tool.how]}\n\n${tool.description}`,
    }))}
    selectedRow={data.selectedRow}
    onSelectRow={data.onSelectRow}
    cones={data.cones}
    onToggleCone={data.onToggleCone}
    withCallers={data.withCallers}
    withCalls={data.withCalls}
  />
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

  const hue = data?.hue;
  const how = data?.how;
  const runHow = data?.runHow;
  const count = data?.count ?? 1;
  // A run always says so; a plain call says nothing, since it is the
  // ordinary case, and labelling every edge "calls" would be noise.
  const howWord =
    runHow !== undefined
      ? HOW_RUN_LABEL[runHow]
      : how === undefined
      ? undefined
      : HOW_LABEL[how];
  const label = count > 1 ? `${howWord ?? "calls"} ×${count}` : howWord;
  const dashPattern =
    (how === undefined ? undefined : HOW_DASH[how]) ??
    (hue === "workflow" ? WORKFLOW_DASH : undefined);

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        style={{
          stroke: colorOfHue(hue),
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
              color: textColorOfHue(hue),
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
              className={`graph-legend-row ${classNameOfHue(kind)}`}
              key={kind}
            >
              <span className="graph-method-dot" aria-hidden="true" />
              <span>{labelOfKind(kind)}</span>
            </div>
          )
        )}
        <div className={`graph-legend-row ${classNameOfHue(undefined)}`}>
          <span className="graph-method-dot" aria-hidden="true" />
          <span>
            <em>unknown</em>
          </span>
        </div>
        <div className={`graph-legend-row ${classNameOfHue("agent")}`}>
          <span className="graph-method-dot" aria-hidden="true" />
          <span>an agent's tool</span>
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
          <span aria-hidden="true">🤖</span>
          <span>an agent and its tools</span>
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
  agent: AgentNode,
};

const edgeTypes = { call: CallEdge };

// ---------------------------------------------------------------
// The page.

// The canvas's view for each history entry: its viewport, chosen
// method and collapsed boxes, restored when a back or forward
// returns to the graph. At module level because the page unmounts
// whenever another page shows.
const graphViews = new Map<
  string,
  {
    viewport: Viewport;
    collapsed: ReadonlySet<string>;
  }
>();

const GraphCanvas: FC<{
  packages: GraphPackage[];
  agents: GraphAgent[];
  // The chosen row's id, a method's or a tool's, which is what the
  // URL names: choosing one is a navigation, so back steps to the
  // one chosen before.
  selectedRowId: string | null;
  onSelectRow: (id: string | null, replace?: boolean) => void;
  onOpenStateType: (id: string) => void;
  onOpenAgent: (id: string) => void;
}> = ({
  packages,
  agents,
  selectedRowId,
  onSelectRow,
  onOpenStateType,
  onOpenAgent,
}) => {
  const location = useLocation();
  const saved =
    useNavigationType() === "POP" ? graphViews.get(location.key) : undefined;

  // Which boxes are collapsed, rather than which are expanded, so a
  // package that appears later starts expanded like the rest.
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(
    saved?.collapsed ?? new Set()
  );
  const [nodes, setNodes] = useState<GraphNode[]>([]);
  const { fitView, getViewport, setViewport } = useReactFlow();

  // What the cleanup below remembers: the cleanup closes over the
  // first render's state, so it reads these instead.
  const view = useRef({ collapsed });
  view.current = { collapsed };

  useEffect(() => {
    if (saved !== undefined) {
      setViewport(saved.viewport);
    }
    const key = location.key;
    return () => {
      graphViews.set(key, { viewport: getViewport(), ...view.current });
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
  const boxPositionsAfterLastLayout = useRef(new Map<string, Point>());
  const clickedBoxId = useRef<string | null>(null);

  // Set when the nextCollapsed layout should be framed whole: the first, and
  // one that opened or closed every box at once, which changes the
  // graph too much for any one spot to hold still. A restored view
  // is already framed the way it was left.
  const fitViewAfterLayout = useRef(saved === undefined);

  useEffect(() => {
    const thisLayoutRun = ++layoutRun.current;
    layoutPackages(packages, agents, collapsed).then((nodes) => {
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
  }, [packages, agents, collapsed, fitView]);

  const edges = useMemo(
    () => edgesOf(packages, agents, collapsed),
    [packages, agents, collapsed]
  );

  // Who leads to whom over everything drawn, which the cones and the
  // cone buttons are both read off.
  const reach = useMemo(
    () => reachability(packages, agents),
    [packages, agents]
  );

  const togglePackage = useCallback(
    (name: string) => {
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
      // Closing the chosen method's own box lets it go, since its
      // row is gone; replaced rather than pushed, since the reader
      // clicked the box, not the choice. An agent's row is in no
      // box, so it stays.
      if (
        selectedRowId !== null &&
        !isAgentRowId(selectedRowId) &&
        packageOfStateTypeName(cardOfRowId(selectedRowId)) === name &&
        !collapsed.has(name)
      ) {
        onSelectRow(null, true);
      }
    },
    [collapsed, selectedRowId, onSelectRow]
  );

  const setAllCollapsed = useCallback(
    (allCollapsed: boolean) => {
      clickedBoxId.current = null;
      fitViewAfterLayout.current = true;
      setCollapsed(
        new Set(allCollapsed ? packages.map((pkg) => pkg.name) : [])
      );
      if (
        allCollapsed &&
        selectedRowId !== null &&
        !isAgentRowId(selectedRowId)
      ) {
        onSelectRow(null, true);
      }
    },
    [packages, selectedRowId, onSelectRow]
  );

  // Which cones of the chosen method the graph lights: what the
  // click that chose it asked for, by the third of the row it landed
  // in, until the buttons flanking the chosen row say otherwise. A
  // choice made elsewhere, by a link naming the method, lights what
  // it calls.
  const [cones, setCones] = useState<Cones>(DEFAULT_CONES);

  // The cones a click asked for, kept until the choice it made
  // arrives, since the choice is the URL's.
  const askedCones = useRef<Cones | null>(null);

  useEffect(() => {
    setCones(askedCones.current ?? DEFAULT_CONES);
    askedCones.current = null;
  }, [selectedRowId]);

  const toggleRowSelection = useCallback(
    (id: string, asked: Cones) => {
      if (selectedRowId !== id) {
        askedCones.current = asked;
        onSelectRow(id);
      } else if (sameCones(cones, asked)) {
        onSelectRow(null);
      } else {
        setCones(asked);
      }
    },
    [selectedRowId, cones, onSelectRow]
  );

  const toggleCone = useCallback((cone: keyof Cones): void => {
    setCones((current) => ({ ...current, [cone]: !current[cone] }));
  }, []);

  // The rows some drawn arrow lands on, self-calls included, and the
  // rows that make one: what a cone button needs to have anything to
  // light.
  const withCallers = useMemo(() => new Set(reach.callers.keys()), [reach]);

  const withCalls = useMemo(() => new Set(reach.callees.keys()), [reach]);

  // With a method chosen, its lit cones: downstream, the methods it
  // calls transitively and the arrows carrying those calls;
  // upstream, the methods that call it transitively, whose arrows
  // must both leave from and land on callers. The cards and boxes a
  // lit arrow touches stay lit, and nothing else does. An arrow is
  // in a cone when any method folded into it is. An expanded box
  // never fades: it is the room its cards are in.
  const unfaded = useMemo(() => {
    if (selectedRowId === null) {
      return null;
    }
    const nodeIds = new Set<string>([cardOfRowId(selectedRowId)]);
    const edgeIds = new Set<string>();
    const light = (edge: Edge<CallEdgeData>): void => {
      edgeIds.add(edge.id);
      nodeIds.add(edge.source);
      nodeIds.add(edge.target);
    };
    if (cones.downstream) {
      const reached = closure(selectedRowId, reach.callees);
      for (const edge of edges) {
        if (edge.data!.sourceIds.some((id) => reached.has(id))) {
          light(edge);
        }
      }
    }
    if (cones.upstream) {
      const reaching = closure(selectedRowId, reach.callers);
      for (const edge of edges) {
        if (
          edge.data!.sourceIds.some((id) => reaching.has(id)) &&
          edge.data!.targetIds.some((id) => reaching.has(id))
        ) {
          light(edge);
        }
      }
    }
    return { nodeIds, edgeIds };
  }, [selectedRowId, cones, reach, edges]);

  const shownNodes = useMemo(
    () =>
      nodes.map((node) => {
        const faded =
          unfaded !== null &&
          node.type !== "expanded" &&
          !unfaded.nodeIds.has(node.id);
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
                selectedRow: selectedRowId,
                onSelectRow: toggleRowSelection,
                onOpenStateType,
                cones,
                onToggleCone: toggleCone,
                withCallers,
                withCalls,
              },
            };
          case "agent":
            return {
              ...node,
              className,
              data: {
                ...node.data,
                selectedRow: selectedRowId,
                onSelectRow: toggleRowSelection,
                onOpenAgent,
                cones,
                onToggleCone: toggleCone,
                withCallers,
                withCalls,
              },
            };
          default:
            return { ...node, className };
        }
      }),
    [
      nodes,
      unfaded,
      selectedRowId,
      toggleRowSelection,
      togglePackage,
      onOpenStateType,
      onOpenAgent,
      cones,
      toggleCone,
      withCallers,
      withCalls,
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
        if (selectedRowId !== null) {
          onSelectRow(null);
        }
      }}
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

// How many arrows the graph draws: every call and every run,
// whoever makes it, counted from the data rather than the edges,
// which fold when their box is collapsed.
export const drawnCallCount = (
  stateTypes: GraphStateType[],
  agents: GraphAgent[]
): number => {
  const drawn = (calls: GraphCall[], runs: GraphRun[]): number =>
    calls.filter(isDrawn).length + runs.length;
  return (
    stateTypes.reduce(
      (count, stateType) =>
        count +
        stateType.methods.reduce(
          (count, method) => count + drawn(method.calls, method.runs),
          0
        ),
      0
    ) +
    agents.reduce(
      (count, agent) =>
        count +
        agent.tools.reduce(
          (count, tool) => count + drawn(tool.calls, tool.runs),
          0
        ),
      0
    )
  );
};

export const GraphPage: FC<{
  stateTypes: GraphStateType[];
  agents: GraphAgent[];
  selectedRowId: string | null;
  onSelectRow: (id: string | null, replace?: boolean) => void;
  onOpenStateType: (id: string) => void;
  onOpenAgent: (id: string) => void;
}> = ({
  stateTypes,
  agents,
  selectedRowId,
  onSelectRow,
  onOpenStateType,
  onOpenAgent,
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
          agents={agents}
          selectedRowId={selectedRowId}
          onSelectRow={onSelectRow}
          onOpenStateType={onOpenStateType}
          onOpenAgent={onOpenAgent}
        />
      </ReactFlowProvider>
    </div>
  );
};
