// Links each field of the developer's models to the data type it
// contains, and each data type back to the fields and methods that
// contain it.
//
// The generated `rbt.dashboard.v1` messages describe the API; each
// model's own shape is Pydantic's JSON Schema, carried as text and
// walked with `SchemaTree`.
import {
  isRegularNode,
  SchemaNodeKind,
  SchemaTree,
} from "@stoplight/json-schema-tree";
import type { SchemaNode } from "@stoplight/json-schema-tree";
import type {
  Method as MethodMessage,
  Method_Kind,
  StateType as StateTypeMessage,
} from "@dashboard/dashboard_pb";

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
  file: string;
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

type Schema = Record<string, unknown>;

const isSchema = (value: unknown): value is Schema =>
  value !== null && typeof value === "object" && !Array.isArray(value);

const parseSchema = (text: string): Schema => {
  const parsed: unknown = text === "" ? {} : JSON.parse(text);
  return isSchema(parsed) ? parsed : {};
};

// The prefix of a reference to a sibling model; the rest is the
// sibling's name.
const DEFS = "#/$defs/";

const nameOfRef = (ref: string): string => ref.slice(DEFS.length);

// Every model's schema by the name a `$ref` uses: the data types by
// `name`, and the state model by its `title`, which Pydantic sets to
// the class name.
const defsOfStateType = (stateType: StateType): Record<string, Schema> => {
  const defs = Object.fromEntries(
    stateType.dataTypes.map((dataType) => [
      dataType.name,
      parseSchema(dataType.schema),
    ])
  );
  const state = parseSchema(stateType.stateSchema);
  if (typeof state.title === "string") {
    defs[state.title] = state;
  }
  return defs;
};

// `SchemaTree` resolves a `$ref` against the `$defs` of the schema it
// is given, so each model is walked with the whole pool beside it.
const treeOfSchema = (
  stateType: StateType,
  schema: Schema
): SchemaNode | undefined => {
  const tree = new SchemaTree(
    { ...schema, $defs: defsOfStateType(stateType) },
    { mergeAllOf: true }
  );
  tree.populate();
  return tree.root.children[0];
};

const nameOfNode = (schemaNode: SchemaNode): string => {
  const path = schemaNode.subpath;
  return path.length > 0 ? path[path.length - 1] : "";
};

const typesOfNode = (schemaNode: SchemaNode): SchemaNodeKind[] =>
  isRegularNode(schemaNode) ? schemaNode.types ?? [] : [];

const childrenOfNode = (schemaNode: SchemaNode): SchemaNode[] =>
  "children" in schemaNode ? schemaNode.children ?? [] : [];

// The model a field refers to, read from the schema as Pydantic wrote
// it: resolving an `Optional[X]` merges the referred schema into the
// branch, and the `$ref` is gone from the resolved node.
const refInFragment = (fragment: unknown): string | undefined => {
  if (!isSchema(fragment)) {
    return undefined;
  }
  if (typeof fragment.$ref === "string") {
    return nameOfRef(fragment.$ref);
  }
  const branches =
    [fragment.anyOf, fragment.allOf, fragment.oneOf].find(Array.isArray) ?? [];
  for (const branch of branches) {
    const found = refInFragment(branch);
    if (found !== undefined) {
      return found;
    }
  }
  return (
    refInFragment(fragment.items) ??
    refInFragment(fragment.additionalProperties)
  );
};

// Pydantic writes `Optional[X]` as `anyOf: [X, {type: null}]`.
const unwrapOptional = (
  schemaNode: SchemaNode
): { node: SchemaNode; optional: boolean } => {
  const children = childrenOfNode(schemaNode);
  const branches = children.filter(
    (child) => !typesOfNode(child).includes(SchemaNodeKind.Null)
  );
  const nullable = children.length !== branches.length;

  if (
    nullable &&
    branches.length === 1 &&
    typesOfNode(schemaNode).length === 0
  ) {
    return { node: branches[0], optional: true };
  }
  return { node: schemaNode, optional: false };
};

// A node as the row prints it, written the way its author would
// write the type. `refName` names the model under every list layer:
// a reference to `Item` inside `list[list[...]]` prints `Item[][]`.
const formatType = (schemaNode: SchemaNode, refName?: string): string => {
  const types = typesOfNode(schemaNode);

  if (types.includes(SchemaNodeKind.Array)) {
    const item: SchemaNode | undefined = childrenOfNode(schemaNode)[0];
    return item === undefined
      ? "array"
      : `${formatType(unwrapOptional(item).node, refName)}[]`;
  }

  if (refName !== undefined) {
    return refName;
  }

  if (isRegularNode(schemaNode) && schemaNode.enum !== null) {
    return schemaNode.enum.map((value) => JSON.stringify(value)).join(" | ");
  }

  if (isRegularNode(schemaNode) && types.includes(SchemaNodeKind.Object)) {
    // A free-form `dict`: the developer's models arrive as `$ref`s
    // and return as `refName` above. Its `title` is Pydantic's
    // title-casing of the field's name, not the name of a type.
    const additional = schemaNode.fragment.additionalProperties;

    if (additional === undefined) {
      return "object";
    }

    const valueNode: SchemaNode | undefined = childrenOfNode(schemaNode)[0];

    return `Record<string, ${
      additional === true || valueNode === undefined
        ? "any"
        : formatType(unwrapOptional(valueNode).node)
    }>`;
  }
  return types.length > 0 ? types.join(" | ") : "any";
};

// Maps each data type's name to its id, the only lookup the rows
// need. The id is the state type's package plus the type's name, the
// same format `rbt generate` uses for these types' message names.
const dataTypeIdsByName = (stateType: StateType): Map<string, string> =>
  new Map(
    stateType.dataTypes.map((dataType) => [
      dataType.name,
      `${namespaceOfTypeName(stateType.name)}.${dataType.name}`,
    ])
  );

// The rows of one model, in the order Pydantic wrote its
// `properties`, which is the order the developer declared the fields.
const rowsOfSchema = (stateType: StateType, schema: Schema): Field[] => {
  const root = treeOfSchema(stateType, schema);
  if (root === undefined) {
    return [];
  }
  const ids = dataTypeIdsByName(stateType);
  return childrenOfNode(root).map((child) => {
    const { node: valueNode, optional } = unwrapOptional(child);
    const refName = refInFragment(
      "originalFragment" in child ? child.originalFragment : undefined
    );
    const description = isRegularNode(valueNode)
      ? valueNode.annotations.description
      : undefined;
    return {
      name: nameOfNode(child),
      type: formatType(valueNode, refName),
      optional,
      description: typeof description === "string" ? description : undefined,
      // A reference to the state model has no page, so no link.
      link: refName === undefined ? undefined : ids.get(refName),
    };
  });
};

export const fieldsOfState = (stateType: StateType): Field[] =>
  rowsOfSchema(stateType, parseSchema(stateType.stateSchema));

// The fields of the data type named `name`, one level deep.
export const fieldsOfDataType = (
  stateType: StateType,
  name: string
): Field[] => {
  const dataType = stateType.dataTypes.find(
    (candidate) => candidate.name === name
  );
  return dataType === undefined
    ? []
    : rowsOfSchema(stateType, parseSchema(dataType.schema));
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
    const containers: [string, string, Schema][] = [
      [
        shortNameOfTypeName(stateType.name),
        stateType.name,
        parseSchema(stateType.stateSchema),
      ],
      ...stateType.dataTypes.map((dataType): [string, string, Schema] => [
        dataType.name,
        ids.get(dataType.name)!,
        parseSchema(dataType.schema),
      ]),
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
      const schema = parseSchema(dataType.schema);
      linkedDataTypesById.set(id, {
        id,
        name: dataType.name,
        namespace: namespaceOfTypeName(stateType.name),
        file: stateType.file,
        description:
          typeof schema.description === "string"
            ? schema.description
            : undefined,
        fields: rowsOfSchema(stateType, schema),
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
