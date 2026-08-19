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

const StateTypeSchema = z.object({
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

const NULL_TYPE = "null";

const DEFS = "#/$defs/";

// `SchemaTree` cannot start from a `$ref` at its root, so the
// referred schema is inlined with the pool beside it.
const schemaAt = (stateType: StateType, ref: Ref): object | undefined => {
  const schema = stateType.$defs[nameOfRef(ref.$ref)];
  return schema === undefined
    ? undefined
    : { ...(schema as object), $defs: stateType.$defs };
};

const nameOfRef = (ref: string): string => ref.replace(DEFS, "");

// A `$defs` name is only unique within the file that declared it, so
// it is qualified by the namespace of the state type that mentions
// it. That is what `rbt generate` does too: it writes one `.proto`
// per file and imports nothing, so every type a file mentions becomes
// a message in that file's own package.
const idOf = (stateType: StateType, name: string): string =>
  `${namespaceOf(stateType.name)}.${name}`;

const nameOf = (node: any): string => {
  const path = node.subpath ?? [];
  return path.length > 0 ? String(path[path.length - 1]) : "";
};

const typesOf = (node: any): string[] => node.types ?? [];

// The type a row holds, if it holds one of the developer's types.
// Read from the fragment as it was written rather than from the
// resolved node, because resolving an `Optional[X]` merges the
// referred schema into the branch and the `$ref` is gone by then.
const refIn = (fragment: any): string | undefined => {
  if (fragment == null || typeof fragment !== "object") {
    return undefined;
  }
  if (typeof fragment.$ref === "string") {
    return nameOfRef(fragment.$ref);
  }
  for (const branch of fragment.anyOf ??
    fragment.allOf ??
    fragment.oneOf ??
    []) {
    const found = refIn(branch);
    if (found !== undefined) {
      return found;
    }
  }
  return refIn(fragment.items);
};

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

const rowsOf = (stateType: StateType, node: any): Field[] =>
  (node.children ?? []).map((child: any) => {
    const { node: value, optional } = collapse(child);
    const held = refIn(child.originalFragment);
    return {
      name: nameOf(child),
      // A held type is named by the `$defs` entry it refers to rather
      // than by the `title` of the schema that was resolved into
      // place: the reference is what the row links to, so it is what
      // the row should read.
      type:
        held === undefined
          ? spell(value)
          : typesOf(value).includes("array")
          ? `${held}[]`
          : held,
      optional,
      description: value.annotations?.description,
      // Only what this page can open: a `$ref` to something the pool
      // does not hold is spelled but not linked.
      link:
        held !== undefined && stateType.$defs[held] !== undefined
          ? idOf(stateType, held)
          : undefined,
    };
  });

// The fields of whatever `ref` points at, one level deep.
export const fieldsOf = (stateType: StateType, ref: Ref): Field[] => {
  const schema = schemaAt(stateType, ref);
  if (schema === undefined) {
    return [];
  }

  const tree = new SchemaTree(schema as any, { mergeAllOf: true });
  tree.populate();

  const root = (tree.root.children ?? [])[0];
  return root === undefined ? [] : rowsOf(stateType, root);
};

// Every type the developer wrote that is not a state type, by id.
//
// The state types' own state models are left out: those are what the
// state page is, and a state type is not data to be held.
export const dataObjects = (description: Description): DataObject[] => {
  const objects = new Map<string, DataObject>();
  const referrers = new Map<string, Referrer[]>();

  const refer = (to: string, referrer: Referrer): void => {
    const held = referrers.get(to);
    if (held === undefined) {
      referrers.set(to, [referrer]);
    } else if (!held.some((seen) => seen.label === referrer.label)) {
      held.push(referrer);
    }
  };

  for (const stateType of description) {
    const states = new Set([nameOfRef(stateType.state.$ref)]);

    // What each method holds, named the way the state page names it,
    // so that following a referrer back lands somewhere recognizable.
    for (const method of stateType.methods) {
      const held: [Ref | undefined, string][] = [
        [method.request, "takes"],
        [method.response, "returns"],
        ...method.errors.map((error) => [error, "raises"] as [Ref, string]),
      ];
      for (const [ref, verb] of held) {
        if (ref !== undefined) {
          refer(idOf(stateType, nameOfRef(ref.$ref)), {
            id: stateType.name,
            label: `${typeNameOf(stateType.name)}.${method.name} (${verb})`,
          });
        }
      }
    }

    for (const name of Object.keys(stateType.$defs)) {
      const id = idOf(stateType, name);
      const fields = fieldsOf(stateType, { $ref: `${DEFS}${name}` });

      // A state model is not a data object, but it still holds them.
      for (const field of fields) {
        if (field.link !== undefined) {
          refer(field.link, {
            id: states.has(name) ? stateType.name : id,
            label: `${name}.${field.name}`,
          });
        }
      }

      if (states.has(name) || objects.has(id)) {
        continue;
      }

      objects.set(id, {
        id,
        name,
        namespace: namespaceOf(stateType.name),
        file: stateType.file,
        description: (stateType.$defs[name] as any)?.description,
        fields,
        referrers: [],
      });
    }
  }

  return [...objects.values()]
    .map((object) => ({
      ...object,
      // A type that holds itself says so, rather than being filtered
      // into looking unused.
      referrers: referrers.get(object.id) ?? [],
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
};
