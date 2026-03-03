# Reboot Docubot

For the impatient:
1. Prepare an environment by either:
    * [Using VSCode connected to a GitHub Codespace](#using-vscode-connected-to-a-github-codespace)
    * [Installing prerequisites directly](#installing-prerequisites-directly)
2. [Run the application](#run-the-application)

### Overview

This repository contains code for Docubot, an OpenAI RAG app that ingests
help center documents and creates a chatbot that can answer natural language
questions about the docs.

The [Reboot '.proto' definitions](https://docs.reboot.dev/develop/define/overview/#code-generation)
can be found in the `api/` directory, grouped into
subdirectories by proto package, while backend specific code can be
found in `backend/` and front end specific code in `web/`.

_For more information on all of the Reboot examples, please [see the docs](https://docs.reboot.dev/get_started/examples)._

## Prepare an environment by...

<a id="using-vscode-connected-to-a-github-codespace"></a>
### Using VSCode connected to a GitHub Codespace

This method requires running [VSCode](https://code.visualstudio.com/) on your machine: if that isn't your bag, see [the other environment option](#install-prerequisites-directly) below.

This repository includes a [Dev Container config](./.devcontainer/devcontainer.json) (more about [Dev Containers](https://containers.dev/)) that declares all of the dependencies that you need to build and run the example. Dev Containers can be started locally with VSCode, but we recommend using GitHub's [Codespaces](https://github.com/features/codespaces) to quickly launch the Dev Container:

1. Right-click to create a Codespace in a new tab or window:
    * [![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/reboot-dev/reboot-docubot)
    * *Important*: In order to view the example's front end, you must connect your local VSCode to the codespace: you cannot use VSCode in a browser window.
2. Go to [https://github.com/codespaces](https://github.com/codespaces) and click the three dots next to the codespace you just created and then click `Open in Visual Studio Code`.
    * You can [set your default editor to VSCode for codespaces](https://docs.github.com/en/codespaces/customizing-your-codespace/setting-your-default-editor-for-github-codespaces) to avoid this step in the future. See [these instructions](https://docs.github.com/en/codespaces/developing-in-codespaces/opening-an-existing-codespace?tool=vscode) for more information.

Now you're ready to [run the application](#run-the-application)!

<a id="installing-prerequisites-directly"></a>
### Installing prerequisites directly

Running directly on a host requires:

- A platform of either:
   - Linux: `x86_64` or `arm64`, with `glibc>=2.35` (Ubuntu Jammy and other equivalent-generation distributions)
   - Mac: `arm64` (Apple M1 and newer) with `MacOS>=14.0` and `Xcode>=15.2`
   - ... or [talk to us](https://discord.gg/cRbdcS94Nr) if your desired platform isn't currently supported!
- Node.js
    - Including `npm`.
- Docker
    - Note: the example does not run "inside of" Docker, but Docker is used to host a native support service for local development.

If you are unable to meet any of these requirements, we suggest using the [VSCode and Dev Container environment](#using-vscode-connected-to-a-github-codespace) discussed above.

Now you're ready to [run the application](#run-the-application)!

<a id="run-the-application"></a>
## Run the application

### Backend

Our backend is implemented in TypeScript and we must install its dependencies before
running it.

```sh
npm install
```

#### Set the OpenAI API Key

Replace `MY_OPENAI_API_KEY` with your own OpenAI API key, which you can get
from your [OpenAI Dashboard](https://platform.openai.com/api-keys).
```shell
export OPENAI_API_KEY=sk-proj-your_api-key
```

#### Run the backend

Then, to run the application, you can use the Reboot CLI `rbt`:
```shell
npx rbt dev run
```

Running `rbt dev run` will watch for file modifications and restart the
application if necessary. See the `.rbtrc` file for flags and
arguments that get expanded when running `rbt dev run`.

### Front end

To run the front end, open a separate terminal/shell and do:
```shell
npm run dev:web
```

If using VSCode, the page will load automatically.
If not using VSCode, visit [http://127.0.0.1:3000](http://127.0.0.1:3000).

### Tests

The application comes with backend tests.

Before you run the tests, you'll
need to ensure you've run `rbt generate`.  If you've already run `rbt dev run`
without modifying `.rbtrc`, `rbt generate` will have been run for you as
part of that command.
Otherwise, you can do it manually.

```sh
rbt generate
```

`rbt generate` will automatically make required Reboot '.proto'
dependencies like `rbt/v1alpha1/options.proto` available on the
import path without you having to check them into your own repository.

Now you can run the tests using `pytest`:

```sh
pytest backend/
```
