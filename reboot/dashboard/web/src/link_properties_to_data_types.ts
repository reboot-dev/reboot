// Links each property of the developer's models to the data type it
// contains, and each data type back to the properties and methods that
// contain it.
//
// What the API files declare is one `rbt.v1alpha1.pydantic.API` per
// file, the grammar `rbt generate` prints proto from: its state
// types, its data types, and each model's own shape as an
// `rbt.v1alpha1.pydantic.Schema`.
// The generated messages are addressed qualified, `api_pb.Method`,
// so their names never collide with the page's components.
import type * as api_pb from "../../../../rbt/v1alpha1/pydantic/api_pb";
import * as schema_pb from "../../../../rbt/v1alpha1/pydantic/schema_pb";

// What every API file declares, by the file relative to the API
// directory: what `Dashboard.apis` is.
export type APIs = { [filename: string]: api_pb.API };

// The schema of every model the API files declare, by the name a
// `Reference` carries.
export type Schemas = { [name: string]: schema_pb.Schema };

// A method's kind, spelled by the arm of `Method.kind` that is set,
// which is also the CSS class of its pill and its key in the
// definitions.
export type Kind = "reader" | "writer" | "transaction" | "workflow";

// A method the API does not declare has no kind.
export const kindOfMethod = (method: api_pb.Method): Kind | undefined =>
  method.kind.case;

export const labelOfKind = (kind: Kind): string => kind;

// The proto package a data type's name belongs to: `bank.v1` for
// `bank.v1.account.Account`, dropping the class and the module's own
// segment, since a data type is named by its reference name. The
// page groups types by package.
export const packageOfDataTypeName = (name: string): string =>
  name.split(".").slice(0, -2).join(".");

// The proto package a state type name belongs to: `bank.v1` for
// `bank.v1.Account`, dropping only the class, since a state type is
// named by its package, not its module.
export const packageOfStateTypeName = (name: string): string =>
  name.slice(0, name.lastIndexOf("."));

export const shortNameOfTypeName = (name: string): string =>
  name.slice(name.lastIndexOf(".") + 1);

// The state type's fully qualified name, its package then its name:
// `shop.v1.Shop`, which is how the runtime names it and how the
// page's anchors and the changelog name it.
export const qualifiedName = ({
  api,
  stateType,
}: {
  api: api_pb.API;
  stateType: api_pb.StateType;
}): string => `${api.package}.${stateType.name}`;

// The APIs, files in name order, which is the order the page lists
// types in.
export const sortedAPIs = (apis: APIs): api_pb.API[] =>
  Object.keys(apis)
    .sort()
    .map((filename) => apis[filename]);

// One property of a type, as the page displays it. When the property's type
// is one of the developer's data types, `link` is that type's id
// and the page links to its page instead of showing its properties.
export interface Property {
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
  package: string;
  filename: string;
  description?: string;
  properties: Property[];
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
const SCALAR_NAMES: Record<schema_pb.Scalar, string> = {
  [schema_pb.Scalar.SCALAR_UNSPECIFIED]: "any",
  [schema_pb.Scalar.STRING]: "string",
  [schema_pb.Scalar.INTEGER]: "integer",
  [schema_pb.Scalar.FLOAT]: "number",
  [schema_pb.Scalar.BOOLEAN]: "boolean",
  [schema_pb.Scalar.ANY]: "any",
};

// A type written the way its author would write it: a reference by
// the model's class name, a list as `Item[]`, a dict as
// `Record<string, T>`, literals as `"a" | "b"`, an optional as
// `T | null`. The changelog and the properties table share this, so a
// change reads the way the table does.
export const formatType = (type: schema_pb.Type | undefined): string => {
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
  constraints: schema_pb.Constraints | undefined
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
// what a property's row links to. A union refers to several, and links
// to none.
const referenceIn = (type: schema_pb.Type | undefined): string | undefined => {
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

// The id of the data type a `Method` or a `Reference` names, which is
// the name itself, and none for a name that is not a data type's,
// such as a state model's, which has no page of its own.
export const dataTypeIdOfName = ({
  api,
  name,
}: {
  api: api_pb.API;
  name: string;
}): string | undefined =>
  api.dataTypes.some((reference) => reference.name === name) ? name : undefined;

// The rows of one model, in the order the developer declared the
// properties.
const rowsOfSchema = ({
  api,
  schema,
}: {
  api: api_pb.API;
  schema: schema_pb.Schema | undefined;
}): Property[] =>
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
          : dataTypeIdOfName({ api, name: reference }),
    };
  });

export const propertiesOfState = ({
  api,
  stateType,
}: {
  api: api_pb.API;
  stateType: api_pb.StateType;
}): Property[] =>
  rowsOfSchema({
    api,
    schema: api.schemas[stateType.reference?.name ?? ""],
  });

// The properties of the model named `name`, one level deep.
export const propertiesOfDataType = ({
  api,
  name,
}: {
  api: api_pb.API;
  name: string;
}): Property[] => rowsOfSchema({ api, schema: api.schemas[name] });

// Every data type, by id, with what contains it.
export const linkDataTypes = ({ apis }: { apis: APIs }): LinkedDataType[] => {
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
  for (const api of Object.values(apis)) {
    for (const stateType of api.stateTypes) {
      const name = qualifiedName({ api, stateType });
      for (const method of stateType.methods) {
        const namesWithVerbs: [string | undefined, string][] = [
          [method.request?.name, "takes"],
          [method.response?.name, "returns"],
          ...method.errors.map(
            (error) => [error.name, "raises"] as [string, string]
          ),
        ];
        for (const [referenced, verb] of namesWithVerbs) {
          const dataTypeId =
            referenced === undefined
              ? undefined
              : dataTypeIdOfName({ api, name: referenced });
          if (dataTypeId !== undefined) {
            addReferrer(dataTypeId, {
              id: name,
              label: `${stateType.name}.${method.name} (${verb})`,
            });
          }
        }
      }
    }
  }

  // Each container's rows register it as a referrer of the data
  // types it contains: a state model under its state type's short
  // name, and each data type under its own.
  const containers: [
    string,
    string,
    schema_pb.Schema | undefined,
    api_pb.API
  ][] = [
    ...Object.values(apis).flatMap((api) =>
      api.stateTypes.map(
        (
          stateType
        ): [string, string, schema_pb.Schema | undefined, api_pb.API] => [
          stateType.name,
          qualifiedName({ api, stateType }),
          api.schemas[stateType.reference?.name ?? ""],
          api,
        ]
      )
    ),
    ...Object.values(apis).flatMap((api) =>
      api.dataTypes.map(
        (
          reference
        ): [string, string, schema_pb.Schema | undefined, api_pb.API] => [
          api.schemas[reference.name]?.name ?? "",
          reference.name,
          api.schemas[reference.name],
          api,
        ]
      )
    ),
  ];
  for (const [label, id, schema, api] of containers) {
    for (const property of rowsOfSchema({ api, schema })) {
      if (property.link !== undefined) {
        addReferrer(property.link, { id, label: `${label}.${property.name}` });
      }
    }
  }

  for (const api of sortedAPIs(apis)) {
    for (const reference of api.dataTypes) {
      const schema = api.schemas[reference.name];
      linkedDataTypesById.set(reference.name, {
        id: reference.name,
        name: schema?.name ?? "",
        package: packageOfDataTypeName(reference.name),
        filename: api.filename,
        description: schema?.description,
        properties: rowsOfSchema({ api, schema }),
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
