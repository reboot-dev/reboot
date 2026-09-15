// What the types pane shows and the graph lights, derived from the
// `type` search parameter, so that a link to a type is shareable and
// the two never disagree about what is chosen.
import { methodId, type GraphStateType } from "./callgraph";

// What the `type` search parameter names: one state type or one of
// its methods, `bank.v1.Account` or `bank.v1.Account.deposit`, or one
// data type, `bank.v1.bank.CustomerAccount`. The pane exists only
// while the parameter names something.
export type PaneTarget =
  | { stateTypeId: string; method?: string; dataTypeId?: undefined }
  | { dataTypeId: string; stateTypeId?: undefined; method?: undefined };

// The id of the type a target shows, whichever kind it is.
export const typeIdOfTarget = (target: PaneTarget): string =>
  target.dataTypeId ?? target.stateTypeId;

// Whether an id names a state type the graph has: one the API
// declares, or one the code only calls, such as a standard library
// type. Either can be chosen, so the parameter splits off a method
// of either.
export const isGraphStateTypeId = (
  graph: GraphStateType[]
): ((id: string) => boolean) => {
  const stateTypeIds = new Set(graph.map((stateType) => stateType.id));
  return (id: string): boolean => stateTypeIds.has(id);
};

export const paneTargetOf = (
  typeParameter: string | null,
  isStateTypeId: (id: string) => boolean,
  isDataTypeId: (id: string) => boolean
): PaneTarget | undefined => {
  if (typeParameter === null) {
    return undefined;
  }
  if (isDataTypeId(typeParameter)) {
    return { dataTypeId: typeParameter };
  }
  const separator = typeParameter.lastIndexOf(".");
  if (
    !isStateTypeId(typeParameter) &&
    separator !== -1 &&
    isStateTypeId(typeParameter.slice(0, separator))
  ) {
    return {
      stateTypeId: typeParameter.slice(0, separator),
      method: typeParameter.slice(separator + 1),
    };
  }
  return { stateTypeId: typeParameter };
};

// The method the graph lights: the one the pane is on, so the two
// never disagree about what is chosen. With the pane on a state
// type, or closed, nothing is.
export const chosenMethodIdOf = (
  target: PaneTarget | undefined
): string | null =>
  target?.method === undefined
    ? null
    : methodId(target.stateTypeId, target.method);

// The search string a link to a type produces. The path is left
// alone, so following the link never leaves the page being read.
export const searchOfType = (id: string): string => `?type=${id}`;
