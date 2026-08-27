// Links each field of the developer's models to the data type it
// contains, and each data type back to the fields and methods that
// contain it.
//
// The generated `rbt.dashboard.v1` messages describe the API; each
// model's own shape is its `rbt.v1alpha1.Schema`, the grammar
// `rbt generate` prints proto from.
import type {
  Method as MethodMessage,
  Method_Kind,
  StateType as StateTypeMessage,
} from "@dashboard/dashboard_pb";
import type { Schema, Type } from "../../../../rbt/v1alpha1/schema_pb";
import { Scalar } from "../../../../rbt/v1alpha1/schema_pb";

// Type aliases rather than re-exports: the generated `Method` and
// `StateType` are classes, whose names bind a value even under
// `import type`, and the page has components with those names.
export type Method = MethodMessage;
export type StateType = StateTypeMessage;

// A kind as the page prints it, which is also its CSS class and its
// key in the definitions. Keyed by every `Method.Kind`, so a kind
// added to the proto does not compile until it is named here.
const KIND_LABELS: Record<Method_Kind, string> = {
  0: "unspecified",
  1: "reader",
  2: "writer",
  3: "transaction",
  4: "workflow",
};

export const labelOfKind = (kind: Method_Kind): string => KIND_LABELS[kind];

// A type's namespace is its proto package: `bank.v1.Account` has the
// namespace `bank.v1`, which is the developer's `api/bank/v1/`.
export const namespaceOfTypeName = (name: string): string =>
  name.slice(0, name.lastIndexOf("."));

export const shortNameOfTypeName = (name: string): string =>
  name.slice(name.lastIndexOf(".") + 1);

// One field of a type, as the page displays it. When the field's type
// is one of the developer's data types, `link` is that type's id
// and the page links to its page instead of showing its fields.
export interface Field {
  name: string;
  type: string;
  optional: boolean;
  description?: string;
  link?: string;
}

// One of the developer's types that is not a state type: a request,
// a response, an error, or any model they contain, however deeply
// nested. Each one gets a page of its own here.
export interface LinkedDataType {
  id: string;
  name: string;
  namespace: string;
  filename: string;
  description?: string;
  fields: Field[];
  referrers: Referrer[];
}

// Something that contains a data type, so a data type's page can
// link to both what it contains and what contains it.
export interface Referrer {
  id: string;
  label: string;
}

// A scalar as the page spells it. Keyed by every `Scalar`, so a
// scalar added to the grammar does not compile until it is spelled
// here.
const SCALAR_NAMES: Record<Scalar, string> = {
  [Scalar.SCALAR_UNSPECIFIED]: "any",
  [Scalar.STRING]: "string",
  [Scalar.INTEGER]: "integer",
  [Scalar.FLOAT]: "number",
  [Scalar.BOOLEAN]: "boolean",
  [Scalar.ANY]: "any",
};

// A type written the way its author would write it: a reference by
// the model's class name, a list as `Item[]`, a dict as
// `Record<string, T>`, literals as `"a" | "b"`, an optional as
// `T | null`. The changelog and the fields table share this, so a
// change reads the way the table does.
export const formatType = (type: Type | undefined): string => {
  const form = type?.type;
  switch (form?.case) {
    case "scalar":
      return SCALAR_NAMES[form.value];
    case "array":
      return `${formatType(form.value.item)}[]`;
    case "map":
      return `Record<string, ${formatType(form.value.value)}>`;
    case "literals":
      return form.value.values
        .map((value) => JSON.stringify(value))
        .join(" | ");
    case "reference":
      return shortNameOfTypeName(form.value.name);
    case "optional":
      return `${formatType(form.value.inner)} | null`;
    case "discriminatedUnion":
      return form.value.variants
        .map((variant) => shortNameOfTypeName(variant.reference?.name ?? ""))
        .join(" | ");
    case undefined:
      return "any";
  }
};

// The one model a type refers to, under any list or dict layers:
// what a field's row links to. A union refers to several, and links
// to none.
const referenceIn = (type: Type | undefined): string | undefined => {
  const form = type?.type;
  switch (form?.case) {
    case "reference":
      return form.value.name;
    case "array":
      return referenceIn(form.value.item);
    case "map":
      return referenceIn(form.value.value);
    case "optional":
      return referenceIn(form.value.inner);
    default:
      return undefined;
  }
};

// The id of a data type is the state type's package plus the model's
// class name, the same format `rbt generate` uses for these types'
// message names.
const idOfDataType = (stateType: StateType, className: string): string =>
  `${namespaceOfTypeName(stateType.name)}.${className}`;

// Maps each data type's reference name, the way a `Method` or a
// `Reference` names it, to its id, the only lookup the rows need.
const dataTypeIdsByName = (stateType: StateType): Map<string, string> =>
  new Map(
    stateType.dataTypes.map((dataType) => [
      dataType.name,
      idOfDataType(stateType, dataType.schema?.name ?? ""),
    ])
  );

// The id of the data type a `Method` names, and none for the state
// model, which has no page of its own.
export const dataTypeIdOfName = (
  stateType: StateType,
  name: string
): string | undefined => dataTypeIdsByName(stateType).get(name);

// The rows of one model, in the order the developer declared the
// properties.
const rowsOfSchema = (
  stateType: StateType,
  schema: Schema | undefined
): Field[] => {
  const ids = dataTypeIdsByName(stateType);
  return (schema?.properties ?? []).map((property) => {
    const form = property.type?.type;
    const optional = form?.case === "optional";
    const type = optional ? form.value.inner : property.type;
    const reference = referenceIn(type);
    return {
      name: property.name,
      type: formatType(type),
      optional,
      description: property.description,
      // A reference to the state model has no page, so no link.
      link: reference === undefined ? undefined : ids.get(reference),
    };
  });
};

export const fieldsOfState = (stateType: StateType): Field[] =>
  rowsOfSchema(stateType, stateType.schema);

// The fields of the data type named `name`, one level deep.
export const fieldsOfDataType = (
  stateType: StateType,
  name: string
): Field[] => {
  const dataType = stateType.dataTypes.find(
    (candidate) => candidate.name === name
  );
  return dataType === undefined ? [] : rowsOfSchema(stateType, dataType.schema);
};

// Every type the developer wrote that is not a state type, by id.
//
// The state types' own state models are left out: the state page
// shows those.
//
// Deduplicated here rather than in the reader: `data_types` is scoped
// per state type, so a model two state types contain arrives twice,
// and merging the copies by id takes the whole description, which is
// exactly what this function walks.
export const linkDataTypes = (stateTypes: StateType[]): LinkedDataType[] => {
  const linkedDataTypesById = new Map<string, LinkedDataType>();
  const referrersById = new Map<string, Referrer[]>();

  const addReferrer = (to: string, referrer: Referrer): void => {
    const existingReferrers = referrersById.get(to);
    if (existingReferrers === undefined) {
      referrersById.set(to, [referrer]);
    } else if (
      !existingReferrers.some((seen) => seen.label === referrer.label)
    ) {
      existingReferrers.push(referrer);
    }
  };

  for (const stateType of stateTypes) {
    const ids = dataTypeIdsByName(stateType);

    // What each method takes, returns and raises, labeled the way the
    // state page labels the method.
    for (const method of stateType.methods) {
      const namesWithVerbs: [string | undefined, string][] = [
        [method.request, "takes"],
        [method.response, "returns"],
        ...method.errors.map((error) => [error, "raises"] as [string, string]),
      ];
      for (const [name, verb] of namesWithVerbs) {
        const id = name === undefined ? undefined : ids.get(name);
        if (id !== undefined) {
          addReferrer(id, {
            id: stateType.name,
            label: `${shortNameOfTypeName(stateType.name)}.${
              method.name
            } (${verb})`,
          });
        }
      }
    }

    // Each container's rows register it as a referrer of the data
    // types it contains: the state under the state type's short name,
    // and each data type under its own.
    const containers: [string, string, Schema | undefined][] = [
      [shortNameOfTypeName(stateType.name), stateType.name, stateType.schema],
      ...stateType.dataTypes.map(
        (dataType): [string, string, Schema | undefined] => [
          dataType.schema?.name ?? "",
          ids.get(dataType.name)!,
          dataType.schema,
        ]
      ),
    ];

    for (const [name, id, schema] of containers) {
      for (const field of rowsOfSchema(stateType, schema)) {
        if (field.link !== undefined) {
          addReferrer(field.link, { id, label: `${name}.${field.name}` });
        }
      }
    }

    for (const dataType of stateType.dataTypes) {
      const id = ids.get(dataType.name)!;
      if (linkedDataTypesById.has(id)) {
        continue;
      }
      linkedDataTypesById.set(id, {
        id,
        name: dataType.schema?.name ?? "",
        namespace: namespaceOfTypeName(stateType.name),
        filename: stateType.filename,
        description: dataType.schema?.description,
        fields: rowsOfSchema(stateType, dataType.schema),
        referrers: [],
      });
    }
  }

  return [...linkedDataTypesById.values()]
    .map((linkedDataType) => ({
      ...linkedDataType,
      // A recursive type is among its own referrers.
      referrers: referrersById.get(linkedDataType.id) ?? [],
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
};
