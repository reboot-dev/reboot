# Reboot

## Local `rbt` development

The `rbt` command line tool is usually installed when the `reboot` package is
installed. If you are developing `rbt` and testing it against a Bazel-ified example like
`reboot/examples/boutique`, then you can run `rbt` locally without installing
`reboot` by running `rbt.sh`.

## Local `pip` package development

When you are working on the `reboot` package and you want to test it
locally before deploying it to PyPI, you can build and install the development
version by running the following inside a Rye project directory (you don't need
to increment the version number):

```bash
bazel run //reboot:force_reinstall_dev_reboot
source .venv/bin/activate
```

The unit tests for reboot use the unreleased, current version of the code.
So, running `bazel test tests/reboot/examples/...` builds, installs, and
tests the `pip` package automatically.

## Local `npm` package development

To build and install npm packages in a project that uses a Node.js
backend and React frontend, e.g., from the a directory within this
repository such as `reboot/examples/foo` run:

```bash
bazel run //reboot:npm_install_local_reboot
```

Then, depending on your `package.json`, it's likely as easy as the
running the following two commands in different terminals to start the
backend and frontend:

```bash
npm run dev:backend
```

```bash
npm run dev:web
```

## Local `yarn` package development

To build and install npm packages in a project that uses a Node.js
backend and React frontend, e.g., from the a directory within this
repository such as `reboot/examples/prosemirror` run:

```bash
bazel run //reboot:yarn_install_local_reboot
```

Then, depending on your `package.json`, it's likely as easy as the
running the following two commands in different terminals to start the
backend and frontend:

```bash
yarn run dev:backend
```

```bash
yarn run dev:web
```

### In Bazel

If you use the tools provided by `aspect_rules_js`, e.g. `npm_translate_lock`
and the top-level `pnpm-lock.yaml`, local `npm` development happens
automatically. Meaning, the version of `@reboot-dev/reboot-react` built with
bazel is the one that is installed and imported.

In practice, this likely means creating a `ts_project` with deps including:

```
"//:node_modules/@reboot-dev/reboot-react"
```

See `//tests/reboot/react:index_ts` for an example of this tooling in use.

#### Add 3rd-party npm packages

To add a 3rd-party npm package to one of your folders,
add this package _manually_ both to the main `package.json` of "mono"
and in the specific folder, f.ex. `tests/reboot/react/test_cache/package.json`.

[Update the `pnpm-lock.yaml`](#updating-pnpm-lock.yaml) and your folder's `BUILD.bazel` accordingly.

Do _not_ use `pnpm add` or `npm i`.

#### Updating `pnpm-lock.yaml`

If you change the `package.json` or `pnpm-workspace.yaml`, you must regenerate
the `pnpm-lock.yaml` that is used by Bazel to fetch dependencies.

To do so, `cd` to the directory of the `pnpm-lock.yaml`, and run:

```bash
# NOTE: 'pnpm version' should be <= 8.15.8 for the `lockfileVersion` to be compatible with our
# version of 'aspect_rules_js'.
pnpm install --lockfile-only
```

### Outside Bazel (e.g. in examples)

Run the following to run an `npm start` development server that uses the latest
`//reboot/react:react` (AKA `@reboot-dev/reboot-react`) package from your
filesystem:

```
bazel run //reboot:npm_start_with_local_reboot_react
```

For a dev loop with live updates (where the development server is automatically
reloaded with the latest `//reboot/react:react` when it changes), use `ibazel`:

```
ibazel run //reboot:npm_start_with_local_reboot_react
```

## Performing a Release

### 1. Commit new package version numbers

Before you can release a pip or npm package, the package must be given a new version number.

Inspect the Git log since the last version change to get a feeling for whether
the version number should have a major, minor, or patch number increase.

Find the `versions.bzl` file. Update its version number and run:

```sh
make versions
```

After running the command make sure there are no files left with an old
version number except the lockfiles, if you see any, make sure they are
listed in the `bazel/release_scripts/update_versions.py` file.

In an emergency, you can release a new version before it is committed to main.

Normally, first submit a PR with the version number increases you've opted for.

### 2. Deploy the latest Reboot Cloud

As part of this release, you will release a new version of the `rbt` CLI. This
newer CLI likely requires the use of the latest Cloud APIs. Therefore, we must
update the Cloud to its latest version before we release the CLI.

Follow the steps [here](../infrastructure/clusters/README.md#performing-a-release) to release
the Cloud, all the way to `prod1`, before you continue.

### 3. Releasing PyPI packages, npm packages, and examples

To release the latest versions of our Reboot wheel, npm packages, and Reboot
examples, activate the `Release Reboot (part 1)` workflow:

1. Go to https://github.com/reboot-dev/mono/actions/workflows/release_part_1.yml
2. In the top right of the UI, click `Run Workflow`

The workflow will:

- Build a `reboot` wheel packages and push it to PyPI
- Create PRs in our `reboot-dev/reboot-examples`,
  `reboot-dev/reboot-boutique`, and `reboot-dev/reboot-hello` repositories.
  - Note: Do _not_ merge these PRs until the end of the release process.

### 4. Update Lockfiles

After all packages are released, there are a variety of lockfiles that need
updating, corresponding to places where released packages are dependencies
that were updated in Step 1.

To do this, run:

```sh
make lockfiles
```

### 5. Update public repos

After the lockfile updates have landed, run the second release workflow:

1. Go to https://github.com/reboot-dev/mono/actions/workflows/release_part_2.yml
2. In the top right of the UI, click `Run Workflow`

After the workflow completes, look for and approve PRs opened by the workflow: one per repository.

- See [this list of open PRs from the dev bot](https://github.com/pulls?q=is%3Aopen+is%3Apr+author%3Areboot-dev-bot+).
- **You will need to manually review and approve these PRs.**
- Aviator (MergeQueue) will automatically merge the PRs once you've approved them. It's still good to check that indeed happens (e.g. checks, if any, must pass).

## Integrating changes from public repos

When the public repositories changes (have new commits on `main`), we must
bring those changes back into the `main` branch of this monorepo.

TODO(rjh): automate this process.

There is currently no tooling to assist with this. You must identify the
changes made in the commit to the public repo, make equivalent changes
here in the monorepo, and commit.
