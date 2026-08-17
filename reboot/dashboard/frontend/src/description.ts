// What the dashboard reads of the developer's API, and how to walk
// the types in it.
//
// The shape is written down once, here, as a Zod schema: `z.infer`
// gives the page its types, and a test parses the reader's real
// output through it, which is what keeps `api_reader.py` and this
// file in step: the description travels as a `google.protobuf.Value`,
// so nothing generated describes what is inside it.
import { SchemaTree } from "@stoplight/json-schema-tree";
import { z } from "zod";

// JSON Schema is recursive and open-ended, so it is carried through
// rather than described: what the page needs from it is resolved by
// `SchemaTree` below.
const JsonSchema = z.record(z.string(), z.unknown());

const Ref = z.object({ $ref: z.string() });

export const MethodSchema = z.object({
  name: z.string(),
  kind: z.string(),
  factory: z.boolean(),
  mcp: z.boolean(),
  errors: z.array(Ref),
  request: Ref.optional(),
  response: Ref.optional(),
  description: z.string().optional(),
});

export const StateTypeSchema = z.object({
  name: z.string(),
  file: z.string(),
  state: Ref,
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
  // A description this page cannot read is the same to it as no
  // description: the last one read stays on the page.
  return description.success ? description.data : [];
};

// One row of a type, as the page draws it.
export interface Field {
  name: string;
  type: string;
  optional: boolean;
  description?: string;
  children: Field[];
}

const NULL_TYPE = "null";

// `SchemaTree` cannot start from a `$ref` at its root, so the
// referred schema is inlined with the pool beside it.
const schemaAt = (stateType: StateType, ref: Ref): object | undefined => {
  const name = ref.$ref.replace("#/$defs/", "");
  const schema = stateType.$defs[name];
  return schema === undefined
    ? undefined
    : { ...(schema as object), $defs: stateType.$defs };
};

const nameOf = (node: any): string => {
  const path = node.subpath ?? [];
  return path.length > 0 ? String(path[path.length - 1]) : "";
};

const typesOf = (node: any): string[] => node.types ?? [];

// `Optional[X]` reaches us as `anyOf: [X, null]`, which is a union to
// JSON Schema and an optional field to the person reading the page.
const collapse = (node: any): { node: any; optional: boolean } => {
  const children = node.children ?? [];
  const branches = children.filter(
    (child: any) => !typesOf(child).includes(NULL_TYPE)
  );
  const nullable = children.length !== branches.length;

  if (nullable && branches.length === 1 && typesOf(node).length === 0) {
    return { node: branches[0], optional: true };
  }
  return { node, optional: false };
};

const spell = (node: any): string => {
  const types = typesOf(node);
  if (types.includes("array")) {
    const item = (node.children ?? [])[0];
    return item === undefined ? "array" : `${spell(collapse(item).node)}[]`;
  }
  if (types.includes("object")) {
    return node.title ?? "object";
  }
  return types.length > 0 ? types.join(" | ") : "any";
};

const rowsOf = (node: any, depth: number): Field[] => {
  if (depth > 8 || !typesOf(node).includes("object")) {
    return [];
  }
  return (node.children ?? []).map((child: any) => {
    const { node: value, optional } = collapse(child);
    return {
      name: nameOf(child),
      type: spell(value),
      optional,
      description: value.annotations?.description,
      children: rowsOf(
        typesOf(value).includes("array")
          ? collapse((value.children ?? [])[0] ?? value).node
          : value,
        depth + 1
      ),
    };
  });
};

// The fields of whatever `ref` points at, nested types followed.
export const fieldsOf = (stateType: StateType, ref: Ref): Field[] => {
  const schema = schemaAt(stateType, ref);
  if (schema === undefined) {
    return [];
  }

  const tree = new SchemaTree(schema as any, { mergeAllOf: true });
  tree.populate();

  const root = (tree.root.children ?? [])[0];
  return root === undefined ? [] : rowsOf(root, 0);
};
