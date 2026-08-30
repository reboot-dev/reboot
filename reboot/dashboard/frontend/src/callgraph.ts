// The call graph's data: the API's state types and methods, joined
// with the Reboot calls the analysis of the developer's application
// found in each method's implementation.
import type { Timestamp } from "@bufbuild/protobuf";
import type {
  File,
  Generated,
  Servicer,
  Servicer_Method,
  Servicer_Method_Call_How,
} from "../../../../rbt/dashboard/v1/dashboard_pb";
import type { APIs, Kind } from "./link_fields_to_data_types";
import {
  kindOfMethod,
  packageOfStateTypeName,
  qualifiedName,
  shortNameOfTypeName,
  sortedAPIs,
} from "./link_fields_to_data_types";

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
            (known) => known.name === call.methodName
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

// Why `rbt generate` has to run, or with `same` may have to: an
// API file's generated module is `missing`, `older` than the file,
// or the `same` age, by modification time.
export type ReasonToGenerate = "missing" | "older" | "same";

// `reasonToGenerate` returns the highest rank over all API files:
// one `missing` or `older` module outranks any number of `same`.
const RANK: Record<ReasonToGenerate, number> = {
  same: 1,
  older: 2,
  missing: 3,
};

// The module `rbt generate` writes for an API file, relative to the
// generated directory, which is how `generated` is keyed:
// `shop/v1/shop_rbt.py` for `shop/v1/shop.py`.
const generatedModuleOfApiFile = (apiFile: string): string =>
  apiFile.replace(/\.py$/, "_rbt.py");

const compareTimestamps = (a: Timestamp, b: Timestamp): number =>
  a.seconds === b.seconds ? a.nanos - b.nanos : a.seconds < b.seconds ? -1 : 1;

export const reasonToGenerate = (
  apis: APIs,
  files: { [key: string]: Pick<File, "modified"> },
  generated: { [key: string]: Pick<Generated, "modified"> }
): ReasonToGenerate | undefined => {
  let reason: ReasonToGenerate | undefined;
  for (const api of Object.values(apis)) {
    const module = generated[generatedModuleOfApiFile(api.filename)];
    if (module === undefined) {
      return "missing";
    }
    const modified = files[api.filename]?.modified;
    if (modified === undefined || module.modified === undefined) {
      continue;
    }
    const compared = compareTimestamps(module.modified, modified);
    const one: ReasonToGenerate | undefined =
      compared < 0 ? "older" : compared === 0 ? "same" : undefined;
    if (
      one !== undefined &&
      (reason === undefined || RANK[one] > RANK[reason])
    ) {
      reason = one;
    }
  }
  return reason;
};
