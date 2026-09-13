// The call graph's data: the API's state types and methods, joined
// with the Reboot calls the analysis of the developer's application
// found in each method's implementation, and the agents it found the
// application runs, joined with the tools each agent has.
import type {
  Agent,
  Agent_Run,
  Servicer,
  Servicer_Method,
  Servicer_Method_Call,
  Servicer_Method_Call_How,
} from "../../../../rbt/dashboard/v1/dashboard_pb";
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
  // Every literal string its prompt is made of, in the order the
  // agent is constructed with them.
  systemPrompt: string[];
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

// Joins the records of each agent the analysis found: one per file
// that met the agent, every one saying the same thing about the
// agent itself, and each carrying the tools its own file
// contributed. The tools gather, one per name; the agents come in
// the order the records do, which is by name.
export const joinAgents = (agents: Agent[]): GraphAgent[] => {
  const joined = new Map<string, GraphAgent>();
  for (const agent of agents) {
    let joinedAgent = joined.get(agent.name);
    if (joinedAgent === undefined) {
      joinedAgent = {
        id: agentId(agent.name),
        name: agent.name,
        model: agent.model,
        systemPrompt: agent.systemPrompt,
        description: agent.description,
        tools: [],
      };
      joined.set(agent.name, joinedAgent);
    }
    for (const tool of agent.tools) {
      // By name alone, since the name is what the model calls and
      // what the agent's row is: a tool the agent is given in two
      // places is one tool.
      if (joinedAgent.tools.some((known) => known.name === tool.name)) {
        continue;
      }
      joinedAgent.tools.push({
        name: tool.name,
        description: tool.description,
        calls: countCalls(tool.calls),
        runs: countRuns(tool.runs),
      });
    }
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
      !calledStateType.methods.some((known) => known.name === call.methodName)
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
  agents: GraphAgent[]
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
