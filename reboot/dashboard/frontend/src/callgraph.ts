// The call graph's data: the API's state types and methods, joined
// with the Reboot calls the analysis of the developer's application
// found in each method's implementation.
import type { Timestamp } from "@bufbuild/protobuf";
import type {
  File,
  Generated,
  Method_Kind,
  Servicer,
  Servicer_Method,
  Servicer_Method_Call_How,
} from "../../../../rbt/dashboard/v1/dashboard_pb";
import type { StateType } from "./link_fields_to_data_types";
import { shortNameOfTypeName } from "./link_fields_to_data_types";

// One call a method's implementation makes, and how many times. The
// analysis lists a call once per site, and a helper several methods
// share contributes its calls to each of them, so the same call can
// arrive many times over.
export interface GraphCall {
  // Fully qualified: `bank.v1.Account`.
  stateTypeName: string;
  methodName: string;
  how: Servicer_Method_Call_How;
  count: number;
}

export interface GraphMethod {
  name: string;
  // Only the API's declaration says the kind, so a method known only
  // from a call has none.
  kind?: Method_Kind;
  factory: boolean;
  calls: GraphCall[];
}

export interface GraphStateType {
  // The fully qualified name, `bank.v1.Account`, which is what a call
  // names.
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

// `bank.v1` for `bank.v1.Account`.
export const packageName = (stateTypeName: string): string =>
  stateTypeName.split(".").slice(0, -1).join(".");

// Packages in the order their first state type comes.
export const groupStateTypesByPackage = (
  stateTypes: GraphStateType[]
): GraphPackage[] => {
  const packages = new Map<string, GraphStateType[]>();
  for (const stateType of stateTypes) {
    const name = packageName(stateType.id);
    const stateTypesInPackage = packages.get(name);
    if (stateTypesInPackage === undefined) {
      packages.set(name, [stateType]);
    } else {
      stateTypesInPackage.push(stateType);
    }
  }
  return [...packages].map(([name, stateTypes]) => ({ name, stateTypes }));
};

// A key unique to one method: `bank.v1.Account.deposit`.
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

// Joins `api` with the calls the analysis found in each declared
// method. Servicer methods the API does not declare, such as helpers,
// are dropped. Anything a call names that the API does not declare is
// added as a target, with no kind and no calls.
export const joinStateTypes = (
  api: StateType[],
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

  const stateTypes = new Map<string, GraphStateType>(
    api.map((stateType): [string, GraphStateType] => [
      stateType.name,
      {
        id: stateType.name,
        name: shortNameOfTypeName(stateType.name),
        methods: stateType.methods.map((method) => ({
          name: method.name,
          kind: method.kind,
          factory: method.factory,
          calls: countCalls(
            analyzedMethodsById.get(methodId(stateType.name, method.name))
          ),
        })),
      },
    ])
  );

  for (const stateType of stateTypes.values()) {
    for (const method of stateType.methods) {
      for (const call of method.calls) {
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

  return [...stateTypes.values()];
};

// Why `rbt generate` has to run, or with `same` may have to: a
// state type's generated module is `missing`, `older` than its API
// file, or the `same` age, by modification time.
export type ReasonToGenerate = "missing" | "older" | "same";

// `reasonToGenerate` returns the highest rank over all state types:
// one `missing` or `older` module outranks any number of `same`.
const RANK: Record<ReasonToGenerate, number> = {
  same: 1,
  older: 2,
  missing: 3,
};

// The API file declaring a state type, relative to the API
// directory, which is how `API.files` is keyed: `shop/v1/shop.py`
// for `shop.v1.Shop` declared in `api/shop/v1/shop.py`.
// `stateType.filename` includes the API directory; the package in
// `stateType.name` is the file's directory relative to it, as
// `state_types_in_file` qualifies names.
const apiFileOfStateType = (stateType: StateType): string => {
  const basename = stateType.filename.split("/").pop() ?? stateType.filename;
  const directory = packageName(stateType.name).replace(/\./g, "/");
  return directory === "" ? basename : `${directory}/${basename}`;
};

// The module `rbt generate` writes for an API file, relative to the
// generated directory, which is how `generated` is keyed:
// `shop/v1/shop_rbt.py` for `shop/v1/shop.py`.
const generatedModuleOfApiFile = (apiFile: string): string =>
  apiFile.replace(/\.py$/, "_rbt.py");

const compareTimestamps = (a: Timestamp, b: Timestamp): number =>
  a.seconds === b.seconds ? a.nanos - b.nanos : a.seconds < b.seconds ? -1 : 1;

export const reasonToGenerate = (
  stateTypes: StateType[],
  files: { [key: string]: Pick<File, "modified"> },
  generated: { [key: string]: Pick<Generated, "modified"> }
): ReasonToGenerate | undefined => {
  let reason: ReasonToGenerate | undefined;
  for (const stateType of stateTypes) {
    const apiFile = apiFileOfStateType(stateType);
    const module = generated[generatedModuleOfApiFile(apiFile)];
    if (module === undefined) {
      return "missing";
    }
    const modified = files[apiFile]?.modified;
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
