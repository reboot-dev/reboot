This directory configures devcontainers for this repository. Devcontainers are
used by GitHub Codespaces; they can also be launched locally (e.g., via VS
Code).

Devcontainers are built for the local machine architecture (i.e., they are
Linux/amd64 containers when built on amd64 hosts, and linux/arm64 when built on
arm64 hosts).

Any changes to files within this directory will be tested via the regular
`.github/workflows/*.yml` workflows; they'll be run in a devcontainer that'll
have been (re-)built based on the changes in the `Dockerfile`.
