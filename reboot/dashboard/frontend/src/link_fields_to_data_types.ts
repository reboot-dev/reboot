// Links each field of the developer's models to the data type it
// contains, and each data type back to the fields and methods that
// contain it.
//
// The generated `rbt.dashboard.v1` messages describe the API; each
// model's own shape is its `rbt.v1alpha1.Schema`, the grammar
// `rbt generate` prints proto from.
import type {
  DataType,
  Method as MethodMessage,
  Method_Kind,
  StateType as StateTypeMessage,
} from "@dashboard/dashboard_pb";
import type {
  Constraints,
  Schema,
  Type,
} from "../../../../rbt/v1alpha1/schema_pb";
import { Scalar } from "../../../../rbt/v1alpha1/schema_pb";

// Type aliases rather than re-exports: the generated `Method` and
// `StateType` are classes, whose names bind a value even under
// `import type`, and the page has components with those names.
export type Method = MethodMessage;
export type StateType = StateTypeMessage;

// The schema of every model the API files declare, by the name a
// `Reference` carries: what `API.schemas` is.
export type Schemas = { [name: string]: Schema };

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
// namespace `bank.v1`, which is the developer's `api/bank/v1/`. A
// model's module, `bank.v1.account`, has the same namespace, since
// the package is the file's directory.
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
  // What the value must satisfy beyond its type, spelled by
  // `formatConstraints`; none when nothing was declared.
  constraints?: string;
  deprecated: boolean;
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

// What a value must satisfy beyond its type, written the way a
// developer would read it: `> 0`, `<= 100`, `multiple of 5`,
// `length 1..10`, `matches /^x/`.
export const formatConstraints = (
  constraints: Constraints | undefined
): string | undefined => {
  if (constraints === undefined) {
    return undefined;
  }
  const parts: string[] = [];
  if (constraints.greaterThan !== undefined) {
    parts.push(`> ${constraints.greaterThan}`);
  }
  if (constraints.greaterThanOrEqual !== undefined) {
    parts.push(`>= ${constraints.greaterThanOrEqual}`);
  }
  if (constraints.lessThan !== undefined) {
    parts.push(`< ${constraints.lessThan}`);
  }
  if (constraints.lessThanOrEqual !== undefined) {
    parts.push(`<= ${constraints.lessThanOrEqual}`);
  }
  if (constraints.multipleOf !== undefined) {
    parts.push(`multiple of ${constraints.multipleOf}`);
  }
  if (
    constraints.minLength !== undefined ||
    constraints.maxLength !== undefined
  ) {
    parts.push(
      `length ${constraints.minLength ?? 0}..${constraints.maxLength ?? ""}`
    );
  }
  if (constraints.pattern !== undefined) {
    parts.push(`matches /${constraints.pattern}/`);
  }
  return parts.length === 0 ? undefined : parts.join(", ");
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

// The id of a data type is the model's package plus its class name,
// the same format `rbt generate` uses for these types' message names.
const idOfSchema = (schema: Schema | undefined): string =>
  `${namespaceOfTypeName(schema?.module ?? "")}.${schema?.name ?? ""}`;

// The id of the data type a `Method` or a `Reference` names, and none
// for a name that is not a data type's, such as a state model's,
// which has no page of its own.
export const dataTypeIdOfName = ({
  dataTypes,
  schemas,
  name,
}: {
  dataTypes: DataType[];
  schemas: Schemas;
  name: string;
}): string | undefined =>
  dataTypes.some((dataType) => dataType.reference?.name === name)
    ? idOfSchema(schemas[name])
    : undefined;

// The rows of one model, in the order the developer declared the
// properties.
const rowsOfSchema = ({
  dataTypes,
  schemas,
  schema,
}: {
  dataTypes: DataType[];
  schemas: Schemas;
  schema: Schema | undefined;
}): Field[] =>
  (schema?.properties ?? []).map((property) => {
    const form = property.type?.type;
    const optional = form?.case === "optional";
    const type = optional ? form.value.inner : property.type;
    const reference = referenceIn(type);
    return {
      name: property.name,
      type: formatType(type),
      optional,
      description: property.description,
      constraints: formatConstraints(property.constraints),
      deprecated: property.deprecated,
      link:
        reference === undefined
          ? undefined
          : dataTypeIdOfName({ dataTypes, schemas, name: reference }),
    };
  });

export const fieldsOfState = ({
  dataTypes,
  schemas,
  stateType,
}: {
  dataTypes: DataType[];
  schemas: Schemas;
  stateType: StateType;
}): Field[] =>
  rowsOfSchema({
    dataTypes,
    schemas,
    schema: schemas[stateType.reference?.name ?? ""],
  });

// The fields of the model named `name`, one level deep.
export const fieldsOfDataType = ({
  dataTypes,
  schemas,
  name,
}: {
  dataTypes: DataType[];
  schemas: Schemas;
  name: string;
}): Field[] => rowsOfSchema({ dataTypes, schemas, schema: schemas[name] });

// Every data type, by id, with what contains it.
export const linkDataTypes = ({
  stateTypes,
  dataTypes,
  schemas,
}: {
  stateTypes: StateType[];
  dataTypes: DataType[];
  schemas: Schemas;
}): LinkedDataType[] => {
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

  // What each method takes, returns and raises, labeled the way the
  // state page labels the method.
  for (const stateType of stateTypes) {
    for (const method of stateType.methods) {
      const namesWithVerbs: [string | undefined, string][] = [
        [method.request?.name, "takes"],
        [method.response?.name, "returns"],
        ...method.errors.map(
          (error) => [error.name, "raises"] as [string, string]
        ),
      ];
      for (const [name, verb] of namesWithVerbs) {
        const id =
          name === undefined
            ? undefined
            : dataTypeIdOfName({ dataTypes, schemas, name });
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
  }

  // Each container's rows register it as a referrer of the data
  // types it contains: a state model under its state type's short
  // name, and each data type under its own.
  const containers: [string, string, Schema | undefined][] = [
    ...stateTypes.map((stateType): [string, string, Schema | undefined] => [
      shortNameOfTypeName(stateType.name),
      stateType.name,
      schemas[stateType.reference?.name ?? ""],
    ]),
    ...dataTypes.map((dataType): [string, string, Schema | undefined] => {
      const schema = schemas[dataType.reference?.name ?? ""];
      return [schema?.name ?? "", idOfSchema(schema), schema];
    }),
  ];
  for (const [label, id, schema] of containers) {
    for (const field of rowsOfSchema({ dataTypes, schemas, schema })) {
      if (field.link !== undefined) {
        addReferrer(field.link, { id, label: `${label}.${field.name}` });
      }
    }
  }

  for (const dataType of dataTypes) {
    const schema = schemas[dataType.reference?.name ?? ""];
    const id = idOfSchema(schema);
    linkedDataTypesById.set(id, {
      id,
      name: schema?.name ?? "",
      namespace: namespaceOfTypeName(schema?.module ?? ""),
      filename: dataType.filename,
      description: schema?.description,
      fields: rowsOfSchema({ dataTypes, schemas, schema }),
      referrers: [],
    });
  }

  return [...linkedDataTypesById.values()]
    .map((linkedDataType) => ({
      ...linkedDataType,
      // A recursive type is among its own referrers.
      referrers: referrersById.get(linkedDataType.id) ?? [],
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
};
