import Tabs from "@theme/Tabs";
import TabItem from "@theme/TabItem";

# Develop locally

This page provides an overview of getting your development environment
ready for building Reboot applications. Once your development
environment is ready you can then start to
[define](/develop/define/overview) and
[implement](/develop/implement/servicers) your API.

## Set up your environment

You can use one of Reboot's GitHub Codespaces or set up your environment
manually by installing the prerequisites listed below.
<!-- TODO: explain how to use a GitHub Codespace. -->

### Prerequisites

| OS | |
| -------- | ------- |
| Linux | `x86_64` or `arm64`, glibc>=2.35 (Ubuntu Jammy and other equivalent-generation distributions) |
| macOS | `arm64`, macOS >= 14.0 and Xcode >= 15.2 |

* Python >= 3.10 and < 3.13 is required for Python backends, and fetched automatically for Node.js backends
* Node.js >= 20.10 is required for Node.js backends only
* Docker

:::note
Python 3.13 support is coming soon.
:::

:::note
Your applications don't need to run "inside of" Docker, but Docker is used to
host a service required for local development.
:::

<!-- ## Install `rbt`

For Python you'll need the [`reboot`](https://pypi.org/project/reboot)
package, and for TypeScript you'll need
[`@reboot-dev/reboot`](https://www.npmjs.com/package/@reboot-dev/reboot).

### `rbt init`

The `rbt init` command initializes your Reboot project with a `hello_world`
template. You can customize the project by selecting specific languages and
platforms, and the tool will automatically update your `.rbtrc` configuration
based on your selections.

#### Python backend

To set up a Python backend, use the following command:

```shell
rbt init --name=reboot_hello_world --backend=python
```

This will generate the necessary source files and include a Python script to
test the connection to the backend.

#### TypeScript backend

For a TypeScript backend, use the following command:

```shell
rbt init --name=reboot_hello_world --backend=nodejs
```

This will create the source files and configure package.json if it doesn't
already exist.

#### Frontend

To initialize a frontend with React, use the following command:

```shell
rbt init --name=reboot_hello_world --frontend=react
```

This command generates the source files and sets up package.json in the web
directory for the frontend.

:::note
You can initialize both backend and frontend simultaneously. Here are examples
for Python and TypeScript:

For Python:
```shell
rbt init --name=reboot_hello_world --backend=python --frontend=react
```

For TypeScript:
```shell
npx rbt init --name=reboot_hello_world --backend=nodejs --frontend=react
```
::: -->

## Directory layout

You can lay out your directories however you like, as long as you pass
them correctly to `rbt`.

Here is a suggested file layout:

| Files    | Directory |
| -------- | ------- |
| `*.proto`  | `api/`    |
| Backend source `*.py`, `*.ts/js` | `backend/src` |
| Backend tests `*.py`, `*.ts/js` | `backend/tests` |
| Frontend | `web` |

## `.rbtrc` and flags

`rbt` loads its flags from an `.rbtrc` file, if present. This is a convenient
way of keeping the options you have to type and remember to a
minimum.

An `.rbtrc` file might look like:
<Tabs groupId="language">
  <TabItem value="python" label="Python">
<!-- MARKDOWN-AUTO-DOCS:START
(CODE:src=../../reboot/examples/bank/.rbtrc&lines=8-21&syntax=shell) -->
<!-- The below code snippet is automatically added from ../../reboot/examples/bank/.rbtrc -->

```shell
# Watch if any generated or source files are modified.
dev run --watch=backend/**/*.py

# Tell `rbt` that this is a Python application.
dev run --python

# Save state between chaos restarts.
dev run --name=bank

# Run the application!
dev run --application=backend/src/main.py

# When expunging, expunge that state we've saved.
dev expunge --name=bank
```

<!-- MARKDOWN-AUTO-DOCS:END -->
  </TabItem>

  <TabItem value="typescript" label="TypeScript">
<!-- MARKDOWN-AUTO-DOCS:START
(CODE:src=../../reboot/examples/counter/.rbtrc&lines=5-12&syntax=shell) -->
<!-- The below code snippet is automatically added from ../../reboot/examples/counter/.rbtrc -->

```shell
# Set the name of our application.
dev run --name=counter

# Declare that this is a nodejs application.
dev run --nodejs

# And specify where our application entrypoint is.
dev run --application=backend/src/main.ts
```

<!-- MARKDOWN-AUTO-DOCS:END -->

:::note
Note that for Node.js, transpilation of TypeScript will automatically be
executed if the `--application` has a `.ts` extension, but can also be executed
via `--transpile=...` _or_ can be left to you and your favorite tools.

If your `--application` has a `.js` extension, you'll likely want to watch the
files in `dist/` rather than `backend/src` so that `rbt` will only restart
your app when they have been correctly transpiled.
:::
  </TabItem>
</Tabs>

### Syntax

#### Global options

Global options like the `--state-directory` flag can be specified in `.rbtrc`
by prefixing with `...`:
```shell
... --state-directory=non/default
```

#### Passthrough options

Commands like `generate` use the `--` separator to accept arguments to pass
directly to an underlying tool:

In a terminal:

```shell
rbt generate --python=backend/api/ api/ -- --mypy_out=backend/api/
```

In `.rbtrc`:

```shell
# Find '.proto' files in 'api/'.
generate api/

# Generate 'python' code from our '.proto' files in 'backend/api/'.
generate --python=backend/api/

# Generate 'mypy' code from our '.proto' files in 'backend/api/mypy/'.
generate -- --mypy_out=backend/api/mypy/
```

In these examples, the order of the flags is crucial. All flags that appear
after `--` are passed directly to `generate`.

<!-- ## Boilerplate code

The `rbt generate` command can generate boilerplate code based on your `.proto`
files, giving you copy-paste-able Python/TypeScript method definitions for which
you only need to fill in the implementation. To generate the boilerplate code,
use the `--boilerplate` flag followed by the path to the directory where you
want the boilerplate code to be placed:

In Terminal:

```shell
rbt generate --boilerplate=backend/boilerplate/
```

In `.rbtrc`:

```shell
generate --boilerplate=backend/boilerplate/
```

:::note
It's important not to modify the generated files directly, as they will be
overwritten the next time you run `rbt generate`. Instead, you should copy (parts
of) the generated files to your source directory and make your modifications
there.
::: -->

## Running your app for development

Once you've set up your environment as outlined above, all you'll need to run
to start live developing your app is:
```console
$ rbt dev run
...
```
Or if you're building a Node.js backend with `npm` (after installing
`@reboot-dev/reboot`):
```console
$ npx rbt dev run
...
```

### Inspecting state

While doing local development you can inspect your application state
by pointing your browser at
`http://localhost:9991/__/inspect` (assuming you aren't using TLS and haven't
changed the default port from `9991`).

### Persisting state during development

By default your application state will not be persisted across
restarts. To persist state, you can pass a `--name=...` flag to `rbt dev
run`.

When state is persisted, backwards incompatible changes in your `.proto` files
are detected, and will trigger errors to encourage resolving them before they
reach production. The `--on-backwards-incompatibility` flag allows you to control
what happens when backwards incompatibility is encountered:

* `ask`: (default) Asks whether you would like to expunge the stored state to
  ignore the backwards incompatibility.
* `expunge`: Automatically expunges stored state after rendering a backwards
  compatibility error.
* `fail`: Waits for a code change that resolves the backwards incompatibility.

During early development of your application, either `ask` or `expunge` are
reasonable choices. Once you have deployed to production, the `fail` option
can encourage more caution while adjusting schemas.

You can also use `rbt dev expunge --name=...` to manually expunge data (where `--name=...`
is the same value you're using for `rbt dev run`).
