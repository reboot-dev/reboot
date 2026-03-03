import { Schema } from "prosemirror-model";
import { schema as base } from "prosemirror-schema-basic";
import { addListNodes } from "prosemirror-schema-list";

export const SCHEMA = new Schema({
  nodes: addListNodes(base.spec.nodes, "paragraph block*", "block"),
  marks: base.spec.marks,
});

export const INITIAL_DOC = SCHEMA.node("doc", null, [
  SCHEMA.node("paragraph", null, [SCHEMA.text("Replace me!")]),
]);

// Singleton state ID for development and testing purposes.
export const DOC_ID = "test";
