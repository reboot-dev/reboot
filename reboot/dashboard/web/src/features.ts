// The features page's data: what each feature, in the sense of a
// capability of the application, is made of, joined from what the
// dashboard already knows. Its feature file says what a person can do
// and what must always hold; its scenarios' steps say which methods
// of which state types it exercises; the call graph says what those
// reach; and the API says which methods no feature describes at all.
import type * as feature_pb from "../../../../rbt/v1alpha1/bdd/feature_pb";
import { stepsOfFeature, type FeatureEntry } from "./behaviors";
import type { GraphStateType } from "./callgraph";
import { shortNameOfTypeName } from "./link_properties_to_data_types";

// One method a feature's steps call or read: the state type as the
// step names it, a short or a fully qualified name, and the method.
export interface ExercisedMethod {
  stateType: string;
  method: string;
}

const exercisedByStep = (
  step: feature_pb.Step
): ExercisedMethod | undefined => {
  const syntax = step.builtIn?.step;
  if (syntax === undefined) {
    return undefined;
  }
  switch (syntax.case) {
    case "createsVia":
    case "does":
    case "attempts":
    case "has":
    case "eventuallyHas":
    case "hasSavedAs":
    case "abortsWith":
      return syntax.value.state === undefined
        ? undefined
        : { stateType: syntax.value.state.type, method: syntax.value.method };
    case "awaitsTask":
      return {
        stateType: syntax.value.stateType,
        method: syntax.value.method,
      };
    default:
      return undefined;
  }
};

// The methods a feature's steps exercise, each once, in the order
// first exercised.
export const exercisedMethods = (
  feature: feature_pb.Feature
): ExercisedMethod[] => {
  const methods: ExercisedMethod[] = [];
  for (const step of stepsOfFeature(feature)) {
    const exercised = exercisedByStep(step);
    if (
      exercised !== undefined &&
      !methods.some(
        (other) =>
          other.stateType === exercised.stateType &&
          other.method === exercised.method
      )
    ) {
      methods.push(exercised);
    }
  }
  return methods;
};

// The graph's state type a step's name means: the one whose id or
// short name it is, when exactly one is.
export const graphStateTypeNamed = (
  name: string,
  graph: GraphStateType[]
): GraphStateType | undefined => {
  const byId = graph.find((stateType) => stateType.id === name);
  if (byId !== undefined) {
    return byId;
  }
  const byName = graph.filter((stateType) => stateType.name === name);
  return byName.length === 1 ? byName[0] : undefined;
};

// A method reached from what a feature exercises, by fully qualified
// state type id, and how many steps away it is: one for a call the
// exercised method makes itself.
export interface ReachedMethod {
  stateTypeId: string;
  method: string;
  depth: number;
}

// Every method the exercised methods reach through the call graph,
// nearest first, leaving out the exercised methods themselves.
export const reachedMethods = (
  exercised: ExercisedMethod[],
  graph: GraphStateType[]
): ReachedMethod[] => {
  const start = exercised.flatMap(({ stateType, method }) => {
    const found = graphStateTypeNamed(stateType, graph);
    return found === undefined ? [] : [`${found.id}.${method}`];
  });
  const seen = new Set(start);
  const reached: ReachedMethod[] = [];
  let frontier = start;
  for (let depth = 1; frontier.length > 0; depth += 1) {
    const next: string[] = [];
    for (const key of frontier) {
      const separator = key.lastIndexOf(".");
      const stateTypeId = key.slice(0, separator);
      const methodName = key.slice(separator + 1);
      const method = graph
        .find((stateType) => stateType.id === stateTypeId)
        ?.methods.find((other) => other.name === methodName);
      for (const call of method?.calls ?? []) {
        const callKey = `${call.stateTypeName}.${call.methodName}`;
        if (!seen.has(callKey)) {
          seen.add(callKey);
          next.push(callKey);
          reached.push({
            stateTypeId: call.stateTypeName,
            method: call.methodName,
            depth,
          });
        }
      }
    }
    frontier = next;
  }
  return reached;
};

// A method as the page prints it: `Account.deposit`.
export const methodLabel = (stateTypeId: string, method: string): string =>
  `${shortNameOfTypeName(stateTypeId)}.${method}`;

// The methods the API declares that no feature exercises or reaches,
// by state type, for the state types with any: the behavior nobody
// has described yet.
export const undescribedMethods = (
  features: FeatureEntry[],
  graph: GraphStateType[]
): { stateType: GraphStateType; methods: string[] }[] => {
  const described = new Set<string>();
  for (const { feature } of features) {
    const exercised = exercisedMethods(feature);
    for (const { stateType, method } of exercised) {
      const found = graphStateTypeNamed(stateType, graph);
      if (found !== undefined) {
        described.add(`${found.id}.${method}`);
      }
    }
    for (const { stateTypeId, method } of reachedMethods(exercised, graph)) {
      described.add(`${stateTypeId}.${method}`);
    }
  }
  return graph.flatMap((stateType) => {
    const methods = stateType.methods
      // Only a method the API declares counts; one known from a call
      // alone belongs to another package.
      .filter((method) => method.kind !== undefined)
      .filter((method) => !described.has(`${stateType.id}.${method.name}`))
      .map((method) => method.name);
    return methods.length === 0 ? [] : [{ stateType, methods }];
  });
};
