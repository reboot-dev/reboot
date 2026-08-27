"""Reads a pydantic model into its schema, the grammar of
`rbt/v1alpha1/schema.proto`.

Read off the models' annotations, into the closed set of forms Reboot
knows: a scalar, an array, a map, a literal, a reference to another
model, an optional of any of those, or a discriminated union of
models. Whatever `rbt generate` can express is here, and nothing
else: a type outside the set fails here, with the message the
developer sees. The proto writer prints this; the dashboard describes
it.
"""
