# A comment may discuss only three things

A code comment may discuss only:

1. Implementation choices for the code right next to it.
2. Contracts for how other code should expect this code to behave.
3. Contracts for how this code should expect other code to behave.

Nothing else belongs in a comment — in particular, not how _other_
code is implemented, even when that implementation is what makes a
contract in (3) hold today.

**Why:** Other code's implementation isn't here and can change
without anyone revisiting this comment, so a description of it goes
stale silently and then misleads. A contract is what this code
actually relies on: if it changes, this code has to change too, and
the comment is right where that reader will look.

**How to apply:** State the contract, not the mechanism behind it.
"A single response may carry the idempotency keys of several expected
mutations" and "mutations commit in order, so a key later in
`expecteds` only shows up once each earlier one has" are (3) and
stay; "because the server reports every key since its previous
response, and because `reactiveReader()` merges the keys of the
responses that arrived while we were busy" describes other code's
implementation and goes. When you catch yourself writing "because
<other code> does X", delete the clause and check that what remains
is one of the three.
