# Deploy on Reboot Cloud

To deploy your Reboot app to production, you can use the
[Reboot Cloud](https://cloud.reboot.dev/). The Reboot Cloud leverages
Reboot's safety guarantees to automatically partition and deploy your
application across a cluster of machines, providing automatic scaling
and high availability!

[Sign up](https://cloud.reboot.dev/) today, and
[give us your feedback](https://reboot.dev/discord) on the shape of the
Reboot Cloud!

## Prerequisites

### Create an API key

Every `rbt cloud` command authenticates with an API key. To create one:

1. Sign in at [`cloud.reboot.dev`](https://cloud.reboot.dev/) and
   create (or join) an organization.
2. Go to the **Settings** page and find the **API Keys** section.
3. Click **Create New API Key** and give the key a name.
4. Copy the key immediately; for security reasons you won't be able to
   see it again after you close the dialog.

Make the key available to `rbt cloud` commands by exporting it as the
`REBOOT_CLOUD_API_KEY` environment variable:

```bash
export REBOOT_CLOUD_API_KEY=...  # The key you just copied.
```

The examples on this page assume you've done so. Alternatively you can
pass the key on the command line with `--api-key=...`, but the
environment variable is preferred: a value passed on the command line —
even as `--api-key=$REBOOT_CLOUD_API_KEY` — is visible in the host's
process listing (e.g. `ps`), whereas the environment variable is not.

:::note
Your role in your organization determines what your API key can do:
only organization _owners_ and _editors_ can deploy and terminate
applications; _viewers_ cannot.
:::

### Have a `Dockerfile`

Reboot Cloud runs your application as a container. Your project needs a
`Dockerfile` (by default at the root of your project) that:

- Uses `ghcr.io/reboot-dev/reboot-base:<version>` as its base image,
  where `<version>` matches the version of the `reboot` package your
  application depends on.
- Runs `CMD ["rbt", "serve", "run"]` (not `rbt dev run`), with the
  production flags for `serve run` (for example `--application-name`
  and `--tls=external`) placed in your `.rbtrc`.

See [the `reboot-hello` example's `Dockerfile`](https://github.com/reboot-dev/reboot-hello/blob/main/Dockerfile)
for a canonical layout.

You must have Docker installed locally to build the container.
`rbt cloud up` automatically builds the image for the right platform
(`linux/amd64`) and pushes it to a registry managed by Reboot Cloud, so
you don't need your own container registry.

## Deploy with `rbt cloud up`

`rbt cloud up` builds your container, pushes it, and deploys it as a
new _revision_ of your application:

```console
$ rbt cloud up \
    --application-name=my-app \
    --organization=my-org
...

  'my-app' revision 1 is available:

  Your API is available at:      https://${application-id}.prod1.rbt.cloud
  MCP clients can connect at:    https://${application-id}.prod1.rbt.cloud/mcp
  You can inspect your state at: https://${application-id}.prod1.rbt.cloud/__/inspect
```

To deploy a new version of your application, simply run `rbt cloud up`
again: every run creates a new revision and rolls it out. If a
deployment fails, `rbt cloud up` prints the logs of the failed revision
so you can correct the issue and try again.

`rbt cloud up` takes the following flags:

| Flag                 | Required | Description                                                                                                                                                                |
| :------------------- | :------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--api-key`          | Only if `REBOOT_CLOUD_API_KEY` is not set | The API key to use to connect to the Reboot Cloud. Prefer setting the `REBOOT_CLOUD_API_KEY` environment variable instead of passing this flag.            |
| `--application-name` | Yes      | The name of the application. Also used to refer to the application in later `rbt cloud` commands.                                                                          |
| `--organization`     | Yes      | The organization that owns the application. Must be passed on every `rbt cloud` command for the application.                                                                |
| `--size`             | No       | The size of the application: one of `xsmall` (default), `small`, `medium`, `large`, or `xlarge`.                                                                            |
| `--dockerfile`       | No       | The `Dockerfile` to build the application from. Defaults to `./Dockerfile`.                                                                                                 |
| `--docker-build-arg` | No       | Additional build arguments to pass to the Docker build. Can be repeated, e.g. `--docker-build-arg=key1=value1 --docker-build-arg=key2=value2`.                              |

:::tip
Flags like `--application-name` and `--organization` don't change
between invocations, so they are good candidates to put in your
[`.rbtrc` file](/develop_locally#rbtrc-and-flags) instead of typing
them every time:

```shell
cloud up --application-name=my-app
cloud up --organization=my-org
cloud down --application-name=my-app
cloud down --organization=my-org
```

:::

:::note
Deploying an application requires that your organization has a valid
payment method configured. You can add one on the **Settings** page at
[`cloud.reboot.dev`](https://cloud.reboot.dev/).
:::

## Terminate with `rbt cloud down`

`rbt cloud down` terminates a running application:

```console
$ rbt cloud down \
    --application-name=my-app \
    --organization=my-org \
    --expunge=true
Application 'my-app' is being terminated...
```

`rbt cloud down` takes the same `--api-key`, `--application-name`,
and `--organization` flags as `rbt cloud up` (and reads the same
`REBOOT_CLOUD_API_KEY` environment variable), plus:

| Flag        | Required | Description                                                                  |
| :---------- | :------- | :--------------------------------------------------------------------------- |
| `--expunge` | Yes      | If `true`, expunge all application state when bringing the application down. |

:::caution
Currently all applications brought down are expunged, meaning all of
their state is deleted; `--expunge=true` is therefore required. Support
for bringing an application down without expunging its state is
tracked in [this issue](https://github.com/reboot-dev/reboot/issues/71).
:::

## Other `rbt cloud` commands

- `rbt cloud secret set`, `rbt cloud secret list`, and
  `rbt cloud secret delete` manage the secrets that your deployed
  application can read as environment variables. See
  [Secrets](/learn_more/secrets) for details.
- `rbt cloud logs` streams the logs of your deployed application. Use
  `--follow` to keep following new log lines as they are produced, and
  `--revisions` to select which revisions to show logs for.

All `rbt cloud` commands take the same `--api-key`,
`--application-name`, and `--organization` flags as `rbt cloud up`,
and all of them read the API key from the `REBOOT_CLOUD_API_KEY`
environment variable.

## Reboot Enterprise

For users with more stringent compliance requirements, the Reboot Cloud can also
be deployed on your enterprise's Kubernetes cluster, providing all the benefits
of Reboot Cloud on your own hardware.

[Contact Reboot](mailto:team@reboot.dev) for more information!

## Comparison

For a side-by-side of Reboot Cloud against `rbt serve` on EBS and EFS, see [the deployment comparison on "Deploy on your own"](/deploy_on_your_own#comparison).
