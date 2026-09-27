// Links each property of the developer's models to the data type it
// contains, and each data type back to the properties and methods that
// contain it.
//
// What the API files declare is one `rbt.v1alpha1.api.API` per
// file, the grammar `rbt generate` prints proto from: its state
// types, its data types, and each model's own shape as an
// `rbt.v1alpha1.api.Schema`.
// The generated messages are addressed qualified, `api_pb.Method`,
// so their names never collide with the page's components.
import { Field_Kind } from "@bufbuild/protobuf";
import type * as api_pb from "../../../../rbt/v1alpha1/api/api_pb";
import * as schema_pb from "../../../../rbt/v1alpha1/api/schema_pb";

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

// The APIs of the application's own files, in the same order: what
// its state types are drawn from. An `external` API, imported and not
// the developer's, is described so that what they refer to in it can
// be seen, and is drawn as nothing of their own.
export const ownAPIs = (apis: APIs): api_pb.API[] =>
  sortedAPIs(apis).filter((api) => !api.external);

// The schema of the model a `Reference` names, from whichever API
// declares it, this file's or another's; none for a name no file
// declares, such as one imported from a file nothing refers to.
export const schemaOf = (
  apis: APIs,
  name: string
): schema_pb.Schema | undefined => {
  for (const api of Object.values(apis)) {
    const schema = api.schemas[name];
    if (schema !== undefined) {
      return schema;
    }
  }
  return undefined;
};

// One property of a type, as the page displays it. When the property's type
// is one of the developer's data types, `link` is that type's id
// and the page links to its page instead of showing its properties.
export interface Property {
  name: string;
  type: string;
  optional: boolean;
  description?: string;
  link?: string;
  // What the type is where it was declared, when that is more than
  // the JSON type shows: `int64` beside `string`, `repeated int64`
  // beside `string[]`, `Timestamp` beside `string`. None for a type
  // JSON shows all of.
  origin?: string;
  // What the value must satisfy beyond its type, spelled by
  // `formatConstraints`; none when nothing was declared.
  constraints?: string;
  deprecated: boolean;
  // The members of a `oneof`, at most one of which is set, each
  // displayed the way a property is; none for any other property.
  members?: Property[];
}

// One of the developer's types that is not a state type: a request,
// a response, an error, or any model they contain, however deeply
// nested, or an enum any of those is a value of. Each one gets a
// page of its own here.
export interface LinkedDataType {
  id: string;
  // Which of the two it is, which is what its page calls it.
  kind: "data type" | "enum";
  // Whether it is from a file outside the application's API, imported
  // and not the developer's, which its page says.
  external: boolean;
  name: string;
  package: string;
  filename: string;
  description?: string;
  // What a data type holds, and, for an enum, its values: each
  // displayed the way a property is, by name, with its number where a
  // property's type would be.
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

// What a field of a `.proto` was declared as, as the developer wrote
// it. Keyed by every `Field.Kind`, protobuf's own enum, for the same
// reason; a message, a group or an enum is written by its name
// instead, and is here only so that every kind is.
const PROTO_KIND_NAMES: Record<Field_Kind, string> = {
  [Field_Kind.TYPE_UNKNOWN]: "any",
  [Field_Kind.TYPE_DOUBLE]: "double",
  [Field_Kind.TYPE_FLOAT]: "float",
  [Field_Kind.TYPE_INT64]: "int64",
  [Field_Kind.TYPE_UINT64]: "uint64",
  [Field_Kind.TYPE_INT32]: "int32",
  [Field_Kind.TYPE_FIXED64]: "fixed64",
  [Field_Kind.TYPE_FIXED32]: "fixed32",
  [Field_Kind.TYPE_BOOL]: "bool",
  [Field_Kind.TYPE_STRING]: "string",
  [Field_Kind.TYPE_GROUP]: "group",
  [Field_Kind.TYPE_MESSAGE]: "message",
  [Field_Kind.TYPE_BYTES]: "bytes",
  [Field_Kind.TYPE_UINT32]: "uint32",
  [Field_Kind.TYPE_ENUM]: "enum",
  [Field_Kind.TYPE_SFIXED32]: "sfixed32",
  [Field_Kind.TYPE_SFIXED64]: "sfixed64",
  [Field_Kind.TYPE_SINT32]: "sint32",
  [Field_Kind.TYPE_SINT64]: "sint64",
};

// One member of a `Literal[...]` as the JSON value it is: `"a"`, `1`,
// `true` or `null`. Keyed by every arm, so a new one does not compile
// until it is spelled here.
const formatLiteral = (literal: schema_pb.Literal): string => {
  const value = literal.value;
  switch (value.case) {
    case "string":
      return JSON.stringify(value.value);
    case "number":
      return String(value.value);
    case "boolean":
      return String(value.value);
    case "null":
      return "null";
    case undefined:
      return "null";
  }
};

// A type as what a value of it is in JSON: a reference by the
// model's class name, a list as `Item[]`, a dict as
// `Record<string, T>`, literals as `"a" | "b"`, an optional as
// `T | null`, an enum by its name.
export const formatJsonType = (type: schema_pb.Type | undefined): string => {
  const form = type?.type;
  switch (form?.case) {
    case "scalar":
      return SCALAR_NAMES[form.value];
    case "array":
      return `${formatJsonType(form.value.item)}[]`;
    case "map":
      // In JSON a key is a string, whatever it was declared as.
      return `Record<string, ${formatJsonType(form.value.value)}>`;
    case "literals":
      return form.value.values.map(formatLiteral).join(" | ");
    case "reference":
      return shortNameOfTypeName(form.value.name);
    case "optional":
      return `${formatJsonType(form.value.inner)} | null`;
    case "discriminatedUnion":
      return form.value.variants
        .map((variant) => shortNameOfTypeName(variant.reference?.name ?? ""))
        .join(" | ");
    case "enum":
      return shortNameOfTypeName(form.value.name);
    case undefined:
      return "any";
  }
};

// The kinds of a `.proto` that JSON shows all of, which say nothing
// more beside a `string` or a `boolean`.
const SHOWN_BY_JSON: ReadonlySet<Field_Kind> = new Set([
  Field_Kind.TYPE_STRING,
  Field_Kind.TYPE_BOOL,
]);

// What a type was declared as in a `.proto`, and none for a type
// that was not, or whose origin is not said.
const protoOriginOf = (
  type: schema_pb.Type | undefined
): schema_pb.Origin_Proto | undefined =>
  type?.origin?.origin.case === "proto" ? type.origin.origin.value : undefined;

// Whether a type, under any list, dict or optional layers, was
// declared as more than JSON shows.
const declaresMoreThanJson = (type: schema_pb.Type | undefined): boolean => {
  const origin = protoOriginOf(type);
  if (
    origin !== undefined &&
    (origin.typeName !== undefined || !SHOWN_BY_JSON.has(origin.kind))
  ) {
    return true;
  }
  const form = type?.type;
  switch (form?.case) {
    case "array":
      return declaresMoreThanJson(form.value.item);
    case "map":
      return (
        declaresMoreThanJson(form.value.key) ||
        declaresMoreThanJson(form.value.value)
      );
    case "optional":
      return declaresMoreThanJson(form.value.inner);
    default:
      return false;
  }
};

// A type of a `.proto` the way the file writes it: `repeated int64`,
// `map<uint32, Part>`, `optional string`, `Timestamp`.
const formatProtoType = (type: schema_pb.Type | undefined): string => {
  const origin = protoOriginOf(type);
  if (origin?.typeName !== undefined) {
    return shortNameOfTypeName(origin.typeName);
  }
  if (origin !== undefined) {
    return PROTO_KIND_NAMES[origin.kind];
  }
  const form = type?.type;
  switch (form?.case) {
    case "array":
      return `repeated ${formatProtoType(form.value.item)}`;
    case "map":
      // A key not said is a string and nothing more.
      return `map<${
        form.value.key === undefined
          ? SCALAR_NAMES[schema_pb.Scalar.STRING]
          : formatProtoType(form.value.key)
      }, ${formatProtoType(form.value.value)}>`;
    case "optional":
      return `optional ${formatProtoType(form.value.inner)}`;
    default:
      return formatJsonType(type);
  }
};

// What a type is where it was declared, when that is more than its
// JSON type shows, and none when JSON shows all of it, which is so of
// everything a pydantic API declares.
export const formatOrigin = (
  type: schema_pb.Type | undefined
): string | undefined =>
  declaresMoreThanJson(type) ? formatProtoType(type) : undefined;

// A type as one line: what it is in JSON, then, in parentheses, what
// it was declared as when that is more, `string (int64)`. What the
// changelog says a type changed from and to, so that an `int32`
// becoming a `uint32`, an `integer` either way, still reads as a
// change.
export const formatType = (type: schema_pb.Type | undefined): string => {
  const origin = formatOrigin(type);
  return origin === undefined
    ? formatJsonType(type)
    : `${formatJsonType(type)} (${origin})`;
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

// The one model or enum a type refers to, under any list or dict
// layers: what a property's row links to. A union refers to several,
// and links to none.
const referenceIn = (type: schema_pb.Type | undefined): string | undefined => {
  const form = type?.type;
  switch (form?.case) {
    case "reference":
    case "enum":
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

// The id of the data type or enum a `Method` or a `Reference` names,
// which is the name itself, in whichever API declares it, and none
// for a name that is neither's, such as a state model's, which has no
// page of its own, or one no file declares.
export const dataTypeIdOfName = ({
  apis,
  name,
}: {
  apis: APIs;
  name: string;
}): string | undefined =>
  Object.values(apis).some(
    (api) =>
      api.dataTypes.some((reference) => reference.name === name) ||
      name in api.enums
  )
    ? name
    : undefined;

// One row: a property of a model.
const rowOf = ({
  apis,
  property,
}: {
  apis: APIs;
  property: schema_pb.Property;
}): Property => {
  const form = property.type?.type;
  const optional = form?.case === "optional";
  const type = optional ? form.value.inner : property.type;
  const reference = referenceIn(type);
  return {
    name: property.name,
    type: formatJsonType(type),
    origin: formatOrigin(type),
    optional,
    description: property.description,
    constraints: formatConstraints(property.constraints),
    deprecated: property.deprecated,
    link:
      reference === undefined
        ? undefined
        : dataTypeIdOfName({ apis, name: reference }),
  };
};

// The rows of one model, in the order the developer declared the
// properties. The members of a `oneof` are properties like any
// other, and are listed together beneath a row for the `oneof`, where
// the first of them was declared, since at most one of them is given.
const rowsOfSchema = ({
  apis,
  schema,
}: {
  apis: APIs;
  schema: schema_pb.Schema | undefined;
}): Property[] => {
  const rows: Property[] = [];
  const listed = new Set<schema_pb.OneOf>();
  for (const property of schema?.properties ?? []) {
    const oneOf = schema?.oneOfs.find((oneOf) =>
      oneOf.tags.includes(property.tag)
    );
    if (oneOf === undefined) {
      rows.push(rowOf({ apis, property }));
    } else if (!listed.has(oneOf)) {
      listed.add(oneOf);
      rows.push({
        name: oneOf.name,
        type: "one of",
        optional: false,
        description: oneOf.description,
        deprecated: false,
        members: (schema?.properties ?? [])
          .filter((member) => oneOf.tags.includes(member.tag))
          .map((member) => rowOf({ apis, property: member })),
      });
    }
  }
  return rows;
};

// The rows of one enum, in the order the developer declared the
// values: each by name, with the number it is shipped as where a
// property's type would be.
const rowsOfEnum = (declared: schema_pb.Enum | undefined): Property[] =>
  (declared?.values ?? []).map((value) => ({
    name: value.name,
    type: String(value.number),
    optional: false,
    description: value.description,
    deprecated: value.deprecated,
  }));

export const propertiesOfState = ({
  apis,
  stateType,
}: {
  apis: APIs;
  stateType: api_pb.StateType;
}): Property[] =>
  rowsOfSchema({
    apis,
    schema: schemaOf(apis, stateType.reference?.name ?? ""),
  });

// The properties of the model named `name`, one level deep.
export const propertiesOfDataType = ({
  apis,
  name,
}: {
  apis: APIs;
  name: string;
}): Property[] => rowsOfSchema({ apis, schema: schemaOf(apis, name) });

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
  // types pane labels the method.
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
              : dataTypeIdOfName({ apis, name: referenced });
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
  const containers: [string, string, schema_pb.Schema | undefined][] = [
    ...Object.values(apis).flatMap((api) =>
      api.stateTypes.map(
        (stateType): [string, string, schema_pb.Schema | undefined] => [
          stateType.name,
          qualifiedName({ api, stateType }),
          api.schemas[stateType.reference?.name ?? ""],
        ]
      )
    ),
    ...Object.values(apis).flatMap((api) =>
      api.dataTypes.map(
        (reference): [string, string, schema_pb.Schema | undefined] => [
          api.schemas[reference.name]?.name ?? "",
          reference.name,
          api.schemas[reference.name],
        ]
      )
    ),
  ];
  for (const [label, id, schema] of containers) {
    for (const property of rowsOfSchema({ apis, schema })) {
      // A `oneof` contains what its members do, each of which is
      // named the way a property is.
      for (const row of [property, ...(property.members ?? [])]) {
        if (row.link !== undefined) {
          addReferrer(row.link, { id, label: `${label}.${row.name}` });
        }
      }
    }
  }

  for (const api of sortedAPIs(apis)) {
    for (const reference of api.dataTypes) {
      const schema = api.schemas[reference.name];
      linkedDataTypesById.set(reference.name, {
        id: reference.name,
        kind: "data type",
        external: api.external,
        name: schema?.name ?? "",
        package: schema?.package ?? "",
        filename: api.filename,
        description: schema?.description,
        properties: rowsOfSchema({ apis, schema }),
        referrers: [],
      });
    }
    for (const [name, declared] of Object.entries(api.enums)) {
      linkedDataTypesById.set(name, {
        id: name,
        kind: "enum",
        external: api.external,
        name: declared.name,
        package: declared.package,
        filename: api.filename,
        description: declared.description,
        properties: rowsOfEnum(declared),
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
