# The Reboot Dev Container

This directory defines a container that has all the dependencies and tools
needed to develop a Reboot application. The container is available in two
flavors:

- As a standalone Docker container.
- As a [Dev Container](https://containers.dev/).

Developers who use Reboot can use these containers during development, so that
they have a known-good development environment that supports Reboot.

> [!IMPORTANT]
> Currently, the Reboot containers only works on x86 CPU architectures.

The most important files in this directory are:

1. `Dockerfile` for the process that builds the base Reboot container.
1. `.devcontainer/devcontainer.json` for the config that turns the base
   container into a Dev Container.
1. `.github/workflows/*` for the GitHub Actions workflow that builds and deploys
   both the base container and the Dev Container.

## Usage as a stand-alone Docker Container

To run the stand-alone Docker container in your current directory, run:

```shell
export HOST_WORKING_DIRECTORY="$(pwd)"
export CONTAINER_WORKSPACE_DIRECTORY="/workspaces/$(basename $HOST_WORKING_DIRECTORY)"
docker run \
  --mount type=bind,source="$HOST_WORKING_DIRECTORY",target="$CONTAINER_WORKSPACE_DIRECTORY" \
  --workdir "$CONTAINER_WORKSPACE_DIRECTORY" \
  --env "HOST_UID=$(id -u)" \
  --env "HOST_GID=$(id -g)" \
  -p 127.0.0.1:3000:3000/tcp \
  -p 127.0.0.1:9991:9991/tcp \
  --privileged \
  --interactive \
  --tty \
  ghcr.io/reboot-dev/reboot-standalone:latest \
  /bin/bash
```

Explanation of flags:

- We `--mount` our `--workdir` (working directory), so we can work with it from
  the container.
- We tell the container about our user's UID and GID so that the container's
  user can match them, providing the same permissions inside and outside the
  container.
- We bind port `3000` so that we can access a React web front end (e.g., from a
  browser), and port `9991` so the web front end can access the Reboot
  backend.
- `--privileged` so that we can run Docker inside of the container.
- `--interactive` and `--tty` (often abbreviated `-it`) lets us interact with
  the created container.
- `ghcr.io/reboot-dev/reboot-standalone:latest` is the name of the container
  we'll be running.
- `/bin/bash` is the shell we'd like to run.

## Usage as a Dev Container

Copy the following into a repository's `.devcontainer/devcontainer.json` to use
the Dev Container built by this tooling:

```json
{
  "name": "My Dev Container",
  "image": "ghcr.io/reboot-dev/reboot-devcontainer",
  "remoteUser": "dev",
  "forwardPorts": [3000, 9991]
}
```

Then either use VSCode to open the repository in a dev container, or use the
`devcontainer` CLI:

```shell
devcontainer up --workspace-folder /path/to/your/repo
devcontainer exec --workspace-folder /path/to/your/repo bash
```
