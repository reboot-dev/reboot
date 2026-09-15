// The call graph's data: the API's state types and methods, joined
// with the Reboot calls the analysis of the developer's application
// found in each method's implementation, and the agents it found the
// application runs, joined with the tools registered on each.
import type {
  Agent,
  Agent_Run,
  Agent_Tool,
  Servicer,
  Servicer_Method,
  Servicer_Method_Call,
} from "../../../../rbt/dashboard/v1/dashboard_pb";
import { Servicer_Method_Call_How } from "../../../../rbt/dashboard/v1/dashboard_pb";
import type { APIs, Kind } from "./link_properties_to_data_types";
import {
  kindOfMethod,
  packageOfStateTypeName,
  qualifiedName,
  shortNameOfTypeName,
  sortedAPIs,
} from "./link_properties_to_data_types";

// One call a method's implementation makes, and how many times. The
// analysis lists a call once per site, and a helper several methods
// share contributes its calls to each of them, so the same call can
// arrive many times over.
export interface GraphCall {
  // Fully qualified: `bank.v1.account.Account`.
  stateTypeName: string;
  methodName: string;
  how: Servicer_Method_Call_How;
  count: number;
}

// One agent a method's or a tool's implementation runs, counted the
// same way.
export interface GraphRun {
  // The agent's name, which is what a run names and what the records
  // of one agent are joined on.
  agentName: string;
  count: number;
}

export interface GraphMethod {
  name: string;
  // Only the API's declaration says the kind, so a method known only
  // from a call has none.
  kind?: Kind;
  factory: boolean;
  calls: GraphCall[];
  runs: GraphRun[];
}

export interface GraphStateType {
  // The fully qualified name, `bank.v1.account.Account`, which is
  // what a call names.
  id: string;
  // The last segment, `Account`.
  name: string;
  methods: GraphMethod[];
}

export interface GraphPackage {
  // `bank.v1`.
  name: string;
  stateTypes: GraphStateType[];
}

// One tool an agent may call: a row of its card, and what the model
// reaches the application through.
export interface GraphTool {
  name: string;
  // What the model is told it does: the description it was
  // registered with, or the function's docstring.
  description?: string;
  calls: GraphCall[];
  runs: GraphRun[];
}

export interface GraphAgent {
  // `agent:librarian`: kept apart from the state types' ids, which
  // are qualified names, so that one id names one thing.
  id: string;
  name: string;
  model?: string;
  // Every literal string its system prompt is made of, and every one
  // its instructions are, each in the order the agent is constructed
  // with them.
  systemPrompt: string[];
  instructions: string[];
  description?: string;
  tools: GraphTool[];
}

// Packages in the order their first state type comes.
export const groupStateTypesByPackage = (
  stateTypes: GraphStateType[]
): GraphPackage[] => {
  const packages = new Map<string, GraphStateType[]>();
  for (const stateType of stateTypes) {
    const name = packageOfStateTypeName(stateType.id);
    const stateTypesInPackage = packages.get(name);
    if (stateTypesInPackage === undefined) {
      packages.set(name, [stateType]);
    } else {
      stateTypesInPackage.push(stateType);
    }
  }
  return [...packages].map(([name, stateTypes]) => ({ name, stateTypes }));
};

// A key unique to one method: `bank.v1.account.Account.deposit`.
export const methodId = (stateTypeName: string, methodName: string): string =>
  `${stateTypeName}.${methodName}`;

// An `until` is a wait on another state's reader, not a call the
// developer made to it, so it is not drawn.
export const isDrawn = (call: GraphCall): boolean =>
  call.how !== Servicer_Method_Call_How.UNTIL;

// A method as the graph knows it: by the state type it belongs to
// and its name.
export interface MethodInGraph {
  stateType: GraphStateType;
  name: string;
}

// Whether a method's or a tool's drawn calls include one to the given
// method.
const callsMethod = (caller: { calls: GraphCall[] }, id: string): boolean =>
  caller.calls.some(
    (call) =>
      isDrawn(call) && methodId(call.stateTypeName, call.methodName) === id
  );

// The methods that call the given one directly, in the graph's
// order. A method that calls itself is one of them.
export const directCallers = (
  id: string,
  stateTypes: GraphStateType[]
): MethodInGraph[] =>
  stateTypes.flatMap((stateType) =>
    stateType.methods
      .filter((method) => callsMethod(method, id))
      .map((method) => ({ stateType, name: method.name }))
  );

// One of an agent's tools, with the agent it is registered on.
export interface ToolInGraph {
  agent: GraphAgent;
  tool: GraphTool;
}

// The tools that call the given method directly, in the agents' order.
export const directToolCallers = (
  id: string,
  agents: GraphAgent[]
): ToolInGraph[] =>
  agents.flatMap((agent) =>
    agent.tools
      .filter((tool) => callsMethod(tool, id))
      .map((tool) => ({ agent, tool }))
  );

// Whether the given method calls itself. The distances cannot say:
// they put a method at zero from itself, so a call back to it is
// never a step.
export const callsItself = (
  id: string,
  stateTypes: GraphStateType[]
): boolean =>
  stateTypes.some((stateType) =>
    stateType.methods.some(
      (method) =>
        methodId(stateType.id, method.name) === id && callsMethod(method, id)
    )
  );

// Every method the given one calls, transitively, with how many
// calls away it is: the downstream closure over the drawn calls,
// the given method itself at zero.
export const calleeDistancesFrom = (
  from: string,
  stateTypes: GraphStateType[]
): Map<string, number> => {
  const callsByMethodId = new Map(
    stateTypes.flatMap((stateType) =>
      stateType.methods.map(
        (method) => [methodId(stateType.id, method.name), method.calls] as const
      )
    )
  );
  const distanceByCalleeId = new Map([[from, 0]]);
  const calleeIdsToExpand = [from];
  while (calleeIdsToExpand.length > 0) {
    const callerId = calleeIdsToExpand.shift()!;
    for (const call of callsByMethodId.get(callerId) ?? []) {
      if (!isDrawn(call)) {
        continue;
      }
      const calleeId = methodId(call.stateTypeName, call.methodName);
      if (!distanceByCalleeId.has(calleeId)) {
        distanceByCalleeId.set(calleeId, distanceByCalleeId.get(callerId)! + 1);
        calleeIdsToExpand.push(calleeId);
      }
    }
  }
  return distanceByCalleeId;
};

// Every method a tool calls, transitively, with how many calls away
// it is: the methods the tool calls itself at one, and on from there
// the way a method's are.
export const toolCalleeDistances = (
  tool: GraphTool,
  stateTypes: GraphStateType[]
): Map<string, number> => {
  const distanceByCalleeId = new Map<string, number>();
  for (const call of tool.calls.filter(isDrawn)) {
    const from = methodId(call.stateTypeName, call.methodName);
    for (const [calleeId, distance] of calleeDistancesFrom(from, stateTypes)) {
      const distanceFromTool = distance + 1;
      if ((distanceByCalleeId.get(calleeId) ?? Infinity) > distanceFromTool) {
        distanceByCalleeId.set(calleeId, distanceFromTool);
      }
    }
  }
  return distanceByCalleeId;
};

// Every method that calls the given one, transitively, with how many
// calls away it is: the upstream closure over the same drawn calls,
// the given method itself at zero.
export const callerDistancesTo = (
  to: string,
  stateTypes: GraphStateType[]
): Map<string, number> => {
  const callerIdsByCalleeId = new Map<string, string[]>();
  for (const stateType of stateTypes) {
    for (const method of stateType.methods) {
      const callerId = methodId(stateType.id, method.name);
      for (const call of method.calls) {
        if (!isDrawn(call)) {
          continue;
        }
        const calleeId = methodId(call.stateTypeName, call.methodName);
        const callerIds = callerIdsByCalleeId.get(calleeId);
        if (callerIds === undefined) {
          callerIdsByCalleeId.set(calleeId, [callerId]);
        } else {
          callerIds.push(callerId);
        }
      }
    }
  }
  const distanceByCallerId = new Map([[to, 0]]);
  const callerIdsToExpand = [to];
  while (callerIdsToExpand.length > 0) {
    const calleeId = callerIdsToExpand.shift()!;
    for (const callerId of callerIdsByCalleeId.get(calleeId) ?? []) {
      if (!distanceByCallerId.has(callerId)) {
        distanceByCallerId.set(callerId, distanceByCallerId.get(calleeId)! + 1);
        callerIdsToExpand.push(callerId);
      }
    }
  }
  return distanceByCallerId;
};

// A key unique to one agent, in the same space as the state types',
// which cannot hold a colon.
export const agentId = (agentName: string): string => `agent:${agentName}`;

// A key unique to one of an agent's tools, the way a method's is
// unique to one method: `agent:librarian.get_page`.
export const toolId = (agentId: string, toolName: string): string =>
  `${agentId}.${toolName}`;

// Whether an id names an agent or one of its tools, which only an
// agent's id begins the way it does.
export const isAgentRowId = (id: string): boolean => id.startsWith("agent:");

// Folds the calls the analysis lists into one per distinct call,
// counted.
const countCalls = (calls: Servicer_Method_Call[] | undefined): GraphCall[] => {
  const counted = new Map<string, GraphCall>();
  for (const call of calls ?? []) {
    const key = `${call.stateType}|${call.method}|${call.how}`;
    const already = counted.get(key);
    if (already === undefined) {
      counted.set(key, {
        stateTypeName: call.stateType,
        methodName: call.method,
        how: call.how,
        count: 1,
      });
    } else {
      already.count += 1;
    }
  }
  return [...counted.values()];
};

// The same, for the agents an implementation runs.
const countRuns = (runs: Agent_Run[] | undefined): GraphRun[] => {
  const counted = new Map<string, GraphRun>();
  for (const run of runs ?? []) {
    const already = counted.get(run.agent);
    if (already === undefined) {
      counted.set(run.agent, { agentName: run.agent, count: 1 });
    } else {
      already.count += 1;
    }
  }
  return [...counted.values()];
};

// Joins each agent the analysis found the application runs, one per
// name, with the tools registered on it, which the analysis records
// apart, by the file registering each, naming the agent. The agents
// come in the order their records do, which is by name. A tool
// registered on an agent nothing runs has no card to join onto.
export const joinAgents = (
  agents: Agent[],
  tools: Agent_Tool[]
): GraphAgent[] => {
  const joined = new Map<string, GraphAgent>();
  for (const agent of agents) {
    joined.set(agent.name, {
      id: agentId(agent.name),
      name: agent.name,
      model: agent.model,
      systemPrompt: agent.systemPrompt,
      instructions: agent.instructions,
      description: agent.description,
      tools: [],
    });
  }
  for (const tool of tools) {
    const joinedAgent = joined.get(tool.agent);
    // By name alone, since the name is what the model calls and what
    // the agent's row is: a tool registered in two places is one tool.
    if (
      joinedAgent === undefined ||
      joinedAgent.tools.some((known) => known.name === tool.name)
    ) {
      continue;
    }
    joinedAgent.tools.push({
      name: tool.name,
      description: tool.description,
      calls: countCalls(tool.calls),
      runs: countRuns(tool.runs),
    });
  }
  return [...joined.values()];
};

// Adds, as a target with no kind and no calls of its own, every
// state type and method some call names that the API does not
// declare.
const addCalled = (
  stateTypes: Map<string, GraphStateType>,
  calls: GraphCall[]
): void => {
  for (const call of calls) {
    let calledStateType = stateTypes.get(call.stateTypeName);
    if (calledStateType === undefined) {
      calledStateType = {
        id: call.stateTypeName,
        name: shortNameOfTypeName(call.stateTypeName),
        methods: [],
      };
      stateTypes.set(call.stateTypeName, calledStateType);
    }
    if (
      !calledStateType.methods.some(
        (knownMethod) => knownMethod.name === call.methodName
      )
    ) {
      calledStateType.methods.push({
        name: call.methodName,
        factory: false,
        calls: [],
        runs: [],
      });
    }
  }
};

// Joins the state types the API files declare with the calls the
// analysis found in each declared method. Servicer methods the API
// does not declare, such as helpers, are dropped. Anything a call
// names that the API does not declare is added as a target, with no
// kind and no calls, whether a method calls it or one of the
// `agents`' tools does.
export const joinStateTypes = (
  apis: APIs,
  servicers: Servicer[],
  agents: GraphAgent[] = []
): GraphStateType[] => {
  // A state type can have more than one servicer in `servicers`, sorted
  // by file; where they define the same method, the first wins.
  const analyzedMethodsById = new Map<string, Servicer_Method>();
  for (const servicer of servicers) {
    for (const method of servicer.methods) {
      const id = methodId(servicer.stateType, method.name);
      if (!analyzedMethodsById.has(id)) {
        analyzedMethodsById.set(id, method);
      }
    }
  }

  const graphStateTypes = new Map<string, GraphStateType>(
    sortedAPIs(apis).flatMap((api) =>
      api.stateTypes.map((stateType): [string, GraphStateType] => {
        const name = qualifiedName({ api, stateType });
        return [
          name,
          {
            id: name,
            name: stateType.name,
            methods: stateType.methods.map((method) => {
              const analyzed = analyzedMethodsById.get(
                methodId(name, method.name)
              );
              return {
                name: method.name,
                kind: kindOfMethod(method),
                factory: method.factory,
                calls: countCalls(analyzed?.calls),
                runs: countRuns(analyzed?.runs),
              };
            }),
          },
        ];
      })
    )
  );

  for (const stateType of [...graphStateTypes.values()]) {
    for (const method of stateType.methods) {
      addCalled(graphStateTypes, method.calls);
    }
  }
  for (const agent of agents) {
    for (const tool of agent.tools) {
      addCalled(graphStateTypes, tool.calls);
    }
  }

  return [...graphStateTypes.values()];
};
