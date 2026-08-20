// What the dashboard reads of the developer's API, and how to walk
// the types in it.
//
// The shape is written down once, here, as a Zod schema: `z.infer`
// gives the page its types, and a test parses the reader's real
// output through it, which is what keeps `api_reader.py` and this
// file in step: the description travels as a `google.protobuf.Value`,
// so nothing generated describes what is inside it.
import {
  isRegularNode,
  SchemaNodeKind,
  SchemaTree,
} from "@stoplight/json-schema-tree";
import type { SchemaNode } from "@stoplight/json-schema-tree";
import { z } from "zod";

// JSON Schema is recursive and open-ended, so it is carried through
// rather than described: what the page needs from it is resolved by
// `SchemaTree` below.
const JsonSchema = z.record(z.string(), z.unknown());

const Ref = z.object({ $ref: z.string() });

const MethodSchema = z.object({
  name: z.string(),
  kind: z.string(),
  factory: z.boolean(),
  mcp: z.boolean(),
  errors: z.array(Ref),
  request: Ref.optional(),
  response: Ref.optional(),
  description: z.string().optional(),
});

const DataTypeSchema = z.object({ id: z.string(), name: z.string() });

const StateTypeSchema = z.object({
  name: z.string(),
  file: z.string(),
  state: Ref,
  data_types: z.array(DataTypeSchema),
  methods: z.array(MethodSchema),
  $defs: z.record(z.string(), JsonSchema),
  description: z.string().optional(),
});

export const DescriptionSchema = z.array(StateTypeSchema);

export type Ref = z.infer<typeof Ref>;
export type Method = z.infer<typeof MethodSchema>;
export type StateType = z.infer<typeof StateTypeSchema>;
export type Description = z.infer<typeof DescriptionSchema>;

// Takes what `Value.toJson()` gives, which is `undefined` when the
// field is unset.
export const parseDescription = (json: unknown): Description => {
  const description = DescriptionSchema.safeParse(json);
  // Failure means `api_reader.py` and `DescriptionSchema` have
  // drifted apart, which the contract test exists to catch.
  return description.success ? description.data : [];
};

// A type's namespace is its proto package: `bank.v1.Account` lives
// in `bank.v1`, which is the developer's `api/bank/v1/`.
export const namespaceOf = (name: string): string =>
  name.slice(0, name.lastIndexOf("."));

export const typeNameOf = (name: string): string =>
  name.slice(name.lastIndexOf(".") + 1);

// One field of a type, as the page displays it. Fields are rendered
// one level deep: when a field's type is one of the developer's data
// objects, `link` carries that object's id instead of the object's
// own fields, and the page links to that object's page.
export interface Field {
  name: string;
  type: string;
  optional: boolean;
  description?: string;
  link?: string;
}

// One of the developer's types that is not a state type: a request, a
// response, an error, or anything those hold.
export interface DataObject {
  id: string;
  name: string;
  namespace: string;
  file: string;
  description?: string;
  fields: Field[];
  referrers: Referrer[];
}

// Something that holds a data object, so that the page reads in both
// directions.
export interface Referrer {
  id: string;
  label: string;
}

const DEFS = "#/$defs/";

// `SchemaTree` cannot start from a `$ref` at its root, so the
// referred schema is inlined with the pool beside it.
const schemaAt = (
  stateType: StateType,
  ref: Ref
): Record<string, unknown> | undefined => {
  const schema = stateType.$defs[nameOfRef(ref.$ref)];
  return schema === undefined
    ? undefined
    : { ...schema, $defs: stateType.$defs };
};

const nameOfRef = (ref: string): string => ref.replace(DEFS, "");

const nameOf = (schemaNode: SchemaNode): string => {
  const path = schemaNode.subpath;
  return path.length > 0 ? path[path.length - 1] : "";
};

const typesOf = (schemaNode: SchemaNode): SchemaNodeKind[] =>
  isRegularNode(schemaNode) ? schemaNode.types ?? [] : [];

const childrenOf = (schemaNode: SchemaNode): SchemaNode[] =>
  "children" in schemaNode ? schemaNode.children ?? [] : [];

// The type a row holds, if it holds one of the developer's types.
// Read from the fragment as it was written rather than from the
// resolved node, because resolving an `Optional[X]` merges the
// referred schema into the branch and the `$ref` is gone by then.
const refIn = (fragment: unknown): string | undefined => {
  if (fragment === null || typeof fragment !== "object") {
    return undefined;
  }
  const written = fragment as Record<string, unknown>;
  if (typeof written.$ref === "string") {
    return nameOfRef(written.$ref);
  }
  const branches =
    [written.anyOf, written.allOf, written.oneOf].find(Array.isArray) ?? [];
  for (const branch of branches) {
    const found = refIn(branch);
    if (found !== undefined) {
      return found;
    }
  }
  return refIn(written.items);
};

// `Optional[X]` reaches us as `anyOf: [X, null]`, which is a union to
// JSON Schema and an optional field to the person reading the page.
const unwrapOptional = (
  schemaNode: SchemaNode
): { node: SchemaNode; optional: boolean } => {
  const children = childrenOf(schemaNode);
  const branches = children.filter(
    (child) => !typesOf(child).includes(SchemaNodeKind.Null)
  );
  const nullable = children.length !== branches.length;

  if (nullable && branches.length === 1 && typesOf(schemaNode).length === 0) {
    return { node: branches[0], optional: true };
  }
  return { node: schemaNode, optional: false };
};

// A node's type as the row prints it. `refName`, the name the
// field's `$ref` uses, names the element under every list layer:
// a `$ref` to `Item` inside `list[list[...]]` prints `Item[][]`.
const formatType = (schemaNode: SchemaNode, refName?: string): string => {
  const types = typesOf(schemaNode);

  if (types.includes(SchemaNodeKind.Array)) {
    const item: SchemaNode | undefined = childrenOf(schemaNode)[0];
    return item === undefined
      ? "array"
      : `${formatType(unwrapOptional(item).node, refName)}[]`;
  }

  if (refName !== undefined) {
    return refName;
  }

  if (isRegularNode(schemaNode) && types.includes(SchemaNodeKind.Object)) {
    // An object reaching this branch is a free-form `dict`: the
    // developer's own types arrive as `$ref`s and returned as
    // `refName` above. Its `title` is Pydantic's title-casing of
    // the field's name, not the name of any type.
    const additional = schemaNode.fragment.additionalProperties;

    if (additional === undefined) {
      return "object";
    }

    const valueNode: SchemaNode | undefined = childrenOf(schemaNode)[0];

    return `Record<string, ${
      additional === true || valueNode === undefined
        ? "any"
        : formatType(unwrapOptional(valueNode).node)
    }>`;
  }
  return types.length > 0 ? types.join(" | ") : "any";
};

// A data type's id by the name a `$ref` uses, which is the only
// lookup the rows need.
const idsOf = (stateType: StateType): Map<string, string> =>
  new Map(stateType.data_types.map(({ id, name }) => [name, id]));

const rowsOf = (stateType: StateType, schemaNode: SchemaNode): Field[] =>
  childrenOf(schemaNode).map((child) => {
    const { node: valueNode, optional } = unwrapOptional(child);
    const refName = refIn(
      "originalFragment" in child ? child.originalFragment : undefined
    );
    const description = isRegularNode(valueNode)
      ? valueNode.annotations.description
      : undefined;
    return {
      name: nameOf(child),
      // The type's name and the `link` below come from the same
      // `$ref`, so what the row reads and where it links agree.
      type: formatType(valueNode, refName),
      optional,
      description: typeof description === "string" ? description : undefined,
      // A lookup miss is deliberate: a `$ref` to a type the reader
      // did not name in `data_types` has no page to open, so no
      // link.
      link: refName === undefined ? undefined : idsOf(stateType).get(refName),
    };
  });

// The fields of whatever `ref` points at, one level deep.
export const fieldsOf = (stateType: StateType, ref: Ref): Field[] => {
  const schema = schemaAt(stateType, ref);
  if (schema === undefined) {
    return [];
  }

  const tree = new SchemaTree(schema, { mergeAllOf: true });
  tree.populate();

  const root: SchemaNode | undefined = tree.root.children[0];
  return root === undefined ? [] : rowsOf(stateType, root);
};

// Every type the developer wrote that is not a state type, by id.
//
// The state types' own state models are left out: those are what the
// state page is, and a state type is not data to be held.
export const dataObjects = (description: Description): DataObject[] => {
  const dataObjectsById = new Map<string, DataObject>();
  const referrersById = new Map<string, Referrer[]>();

  const refer = (to: string, referrer: Referrer): void => {
    const existingReferrers = referrersById.get(to);
    if (existingReferrers === undefined) {
      referrersById.set(to, [referrer]);
    } else if (
      !existingReferrers.some((seen) => seen.label === referrer.label)
    ) {
      existingReferrers.push(referrer);
    }
  };

  for (const stateType of description) {
    const ids = idsOf(stateType);

    // What each method holds, named the way the state page names it,
    // so that following a referrer back lands somewhere recognizable.
    for (const method of stateType.methods) {
      const refsWithVerbs: [Ref | undefined, string][] = [
        [method.request, "takes"],
        [method.response, "returns"],
        ...method.errors.map((error) => [error, "raises"] as [Ref, string]),
      ];
      for (const [ref, verb] of refsWithVerbs) {
        const id = ref && ids.get(nameOfRef(ref.$ref));
        if (id !== undefined && id !== "") {
          refer(id, {
            id: stateType.name,
            label: `${typeNameOf(stateType.name)}.${method.name} (${verb})`,
          });
        }
      }
    }

    // The state model is walked too, so its fields register as
    // referrers of the data types they hold; the `continue` below
    // keeps the state itself out of `dataObjectsById`.
    const state = nameOfRef(stateType.state.$ref);
    const models: [string, string][] = [
      [state, stateType.name],
      ...stateType.data_types.map(
        ({ name, id }) => [name, id] as [string, string]
      ),
    ];

    for (const [name, id] of models) {
      const fields = fieldsOf(stateType, { $ref: `${DEFS}${name}` });

      for (const field of fields) {
        if (field.link !== undefined) {
          refer(field.link, { id, label: `${name}.${field.name}` });
        }
      }

      if (name === state || dataObjectsById.has(id)) {
        continue;
      }

      const description = stateType.$defs[name]?.description;

      dataObjectsById.set(id, {
        id,
        name,
        namespace: namespaceOf(stateType.name),
        file: stateType.file,
        description: typeof description === "string" ? description : undefined,
        fields,
        referrers: [],
      });
    }
  }

  return [...dataObjectsById.values()]
    .map((object) => ({
      ...object,
      // A recursive type is among its own referrers.
      referrers: referrersById.get(object.id) ?? [],
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
};
