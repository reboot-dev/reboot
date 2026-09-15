// The call graph's data: the API's state types and methods, joined
// with the Reboot calls the analysis of the developer's application
// found in each method's implementation.
import type {
  Servicer,
  Servicer_Method,
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

export interface GraphMethod {
  name: string;
  // Only the API's declaration says the kind, so a method known only
  // from a call has none.
  kind?: Kind;
  factory: boolean;
  calls: GraphCall[];
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

// Whether a method's drawn calls include one to the given method.
const callsMethod = (method: GraphMethod, id: string): boolean =>
  method.calls.some(
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

// Folds the calls the analysis lists into one per distinct call,
// counted.
const countCalls = (
  analyzedMethod: Servicer_Method | undefined
): GraphCall[] => {
  const calls = new Map<string, GraphCall>();
  for (const call of analyzedMethod?.calls ?? []) {
    const key = `${call.stateType}|${call.method}|${call.how}`;
    const counted = calls.get(key);
    if (counted === undefined) {
      calls.set(key, {
        stateTypeName: call.stateType,
        methodName: call.method,
        how: call.how,
        count: 1,
      });
    } else {
      counted.count += 1;
    }
  }
  return [...calls.values()];
};

// Joins the state types the API files declare with the calls the
// analysis found in each declared method. Servicer methods the API
// does not declare, such as helpers, are dropped. Anything a call
// names that the API does not declare is added as a target, with no
// kind and no calls.
export const joinStateTypes = (
  apis: APIs,
  servicers: Servicer[]
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
            methods: stateType.methods.map((method) => ({
              name: method.name,
              kind: kindOfMethod(method),
              factory: method.factory,
              calls: countCalls(
                analyzedMethodsById.get(methodId(name, method.name))
              ),
            })),
          },
        ];
      })
    )
  );

  for (const stateType of graphStateTypes.values()) {
    for (const method of stateType.methods) {
      for (const call of method.calls) {
        let calledStateType = graphStateTypes.get(call.stateTypeName);
        if (calledStateType === undefined) {
          calledStateType = {
            id: call.stateTypeName,
            name: shortNameOfTypeName(call.stateTypeName),
            methods: [],
          };
          graphStateTypes.set(call.stateTypeName, calledStateType);
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
          });
        }
      }
    }
  }

  return [...graphStateTypes.values()];
};
