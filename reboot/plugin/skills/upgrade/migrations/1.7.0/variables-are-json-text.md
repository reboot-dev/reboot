## A saved value is said bare, `<name>`, never `"<name>"`

In a `.feature` file, a variable, `<name>`, is now replaced by its
value's JSON text before the step runs, the way pytest-bdd substitutes
a column of a `Scenario Outline`: a saved string arrives with its
double quotes, `"uuid-1"`, a number bare, an object as JSON. So a
saved string is said bare wherever a step takes a value: a state id,
a user, a bearer token, a task id, a property value, and what the web
app shows or is told. The former spelling, `"<name>"`, now reads
`""uuid-1""` once substituted and fails as not JSON, with an error
that says so.

In every `.feature` file under `tests/`, drop the quotes around each
`<name>`:

- `on `Account` of "<account id>"` -> `on `Account` of <account id>`
- `for "<account id>"` -> `for <account id>`
- `awaits the `deposit` task "<task id>"` -> `awaits the `deposit` task <task id>`
- `selects "<account id>" in "From Account"` -> `selects <account id> in "From Account"`
- `sees "<account id>" in the web app` -> `sees <account id> in the web app`
- `"<user id>" is an authenticated user` -> `<user id> is an authenticated user`

A save names the variable the same way, so drop the quotes there too:

- `the resulting state id is saved as "account id"` -> `the resulting state id is saved as <account id>`
- `has `balance` saved as "balance"` -> `has `balance` saved as <balance>`
- `saves the text of the "account-id" element in the web app as "account id"` -> `... as <account id>`
- `with their user id saved as "user id"` -> `with their user id saved as <user id>`

```sh
grep -rn 'saved as "\|web app as "' tests/
```

A property value said bare, `amount=<balance>` or `id=<account id>`,
is unchanged. A variable inside longer quoted text, `"Signed in as <user id>"`, has no spelling: there is no string interpolation or concatenation. Assert the variable alone, `sees <user id> in the web app` or `has `url`containing`<account id>``, both of which match text that contains the value.

```sh
grep -rn '"<[^>]*>"' tests/
```

A custom step whose pattern matched the quoted spelling, e.g.
`parsers.parse('... of "<{name}>"')`, matches the bare one instead:
`parsers.parse('... of <{name}>')`.

A `Scenario Outline` whose string column is said in quotes,
`of "<account>"` with a cell `uuid-1`, keeps working, since pytest-bdd
substitutes the cell's text as written; to say the column bare, write
the cell with its quotes, `| "uuid-1" |`.
