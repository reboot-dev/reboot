## `description` moved out of the `mcp` options block

A method's description now belongs on the method options themselves
rather than inside the nested `mcp` options, so that a `reader`,
`writer`, `transaction` or `workflow` which is **not** exposed to MCP
can have one too. `McpMethodOptions.description` is marked
`deprecated`; it is still read when it is the only description
present, so nothing breaks today, but it will stop being read, and a
description left there is invisible to everything that is not an MCP
tool or resource, the dev dashboard included.

**This applies only to hand-written `.proto` API files.** An
application whose API is defined in Pydantic (`reboot.api`) or in Zod
already writes `description=` on the method itself, and `rbt generate`
puts it in the new place. Those applications have nothing to change
here.

In every `.proto` under the application's API directories (the
directories `rbt generate` is pointed at in `.rbtrc`), find each
`description:` that sits inside an `mcp: {` / `mcp = {` block, and
move it out into the enclosing method options. Everything else
(`tool:`, `resource:`, `name:`, `title:`) stays where it is, and the
description text itself is unchanged.

Two option spellings are in use, and each moves differently.

**Full form.** The `description:` line moves up one level, out of
`mcp: { ... }` and into `option (rbt.v1alpha1.method) = { ... }`:

```proto
// Before.
option (rbt.v1alpha1.method) = {
  writer: {},
  mcp: {
    tool: true,
    description: "Reply to a message",
  },
};

// After.
option (rbt.v1alpha1.method) = {
  writer: {},
  description: "Reply to a message",
  mcp: {
    tool: true,
  },
};
```

**Shorthand form.** `option (rbt.v1alpha1.method).mcp = { ... }`
cannot carry the description, because the description is no longer a
field of `mcp`. Drop the line from the `mcp` block and add a sibling
`option (rbt.v1alpha1.method).description = "...";` statement:

```proto
// Before.
option (rbt.v1alpha1.method).writer = {};
option (rbt.v1alpha1.method).mcp = {
  tool: true,
  description: "Reply to a message",
};

// After.
option (rbt.v1alpha1.method).writer = {};
option (rbt.v1alpha1.method).description = "Reply to a message";
option (rbt.v1alpha1.method).mcp = {
  tool: true,
};
```

Do not delete an `mcp` block that is left holding only `tool: true`
(or `resource: true`); that field is what exposes the method to MCP.
Delete the block only if removing `description:` empties it entirely,
which means the method was never exposed to MCP in the first place.

The generated MCP tool and resource descriptions are unchanged by this
move: they now read the method's description, falling back to the same
default text as before when there is none.
