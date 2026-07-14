# Deploy on your own

## `rbt serve`
`rbt serve` allows you to run your Reboot applications on your own
infrastructure. `rbt serve` is a self-service Reboot deployment, in contrast to
Reboot Cloud which is a fully managed service.

With `rbt serve` you deploy your application on a single machine, with support
for vertical scaling by using multiple cores. If your application needs to scale
beyond a single machine, [talk to Reboot](mailto:team@reboot.dev) about using
Reboot Cloud.

### Running your application

The subcommand that runs your application is `rbt serve run`. You can run it
on any machine that meets the [requirements](#requirements) below, for
example:

```shell
rbt serve run \
  --application=backend/src/main.py \
  --python \
  --application-name=my-app \
  --state-directory=/mnt/reboot-state \
  --port=9991 \
  --tls=external
```

| Flag | Description |
| --- | --- |
| `--application=<path>` | Required. Path to the file that runs your `Application` (e.g. `backend/src/main.py` or `backend/src/main.ts`). |
| `--python` / `--nodejs` | Required (exactly one). Whether to launch the application with Python or Node.js. |
| `--application-name=<name>` | Required. Name of your application, used to differentiate state within `--state-directory`. |
| `--state-directory=<dir>` | Required. Directory in which Reboot durably stores application state; it must be on a persistent file system (see [requirements](#requirements)). |
| `--port=<port>` | Required. Port to listen on. Can also be set through the `PORT` (or `RBT_PORT`) environment variable, which many hosting platforms set automatically. |
| `--tls=<mode>` | Required. Set `external` if `rbt serve` runs behind an external load balancer that already does TLS termination, or `own-certificate` to provide your own TLS certificate. |
| `--tls-certificate=<path>`, `--tls-key=<path>` | Paths to your TLS certificate and key; required with (and only valid with) `--tls=own-certificate`. |
| `--servers=<n>` | Number of servers (serving processes) to spawn; must be a power of 2. Defaults to the number of available cores, rounded down to a power of 2. |

As with all `rbt` commands, you can put these flags in an
[`.rbtrc`](/develop_locally#rbtrc-and-flags) file — each on a line prefixed
with `serve run` — so that running plain `rbt serve run` (for example, as the
`CMD` of a container) picks them up:

```shell
serve run --application=backend/src/main.py
serve run --python
serve run --application-name=my-app
serve run --tls=external
```

### Kubernetes
The recommended deployment model for `rbt serve` on Kubernetes is to store Reboot's state in
either:

- A replicated block device (Amazon EBS or equivalent).
- An NFSv4 file system (Amazon EFS or equivalent) - this must support file locking.

As shown in [the comparison](#comparison), these types of persistent storage have
different failover times and replication properties, due to how they are mounted. EFS may
be mounted by multiple machines at a time, and so failover is limited only by Kubernetes'
failover time -- whereas EBS may only be mounted by one machine at a time, and so failover
additionally requires waiting for EBS to release the volume for a new machine to acquire.

#### Helm chart

Reboot can be deployed using `rbt serve` atop Kubernetes using a [Helm](https://helm.sh/) chart.

Start by adding the [`reboot-dev` Helm charts repository](https://reboot-dev.github.io/helm-charts/):

```bash
helm repo add reboot-dev https://reboot-dev.github.io/helm-charts
helm repo update
```

And then deploy Reboot using [your configured values](https://github.com/reboot-dev/helm-charts/blob/main/reboot/values.yaml):

```bash
helm install my-release reboot-dev/reboot -f my-values.yaml
```

### Requirements

The primary deployment requirement of a `rbt serve` deployment is a
persistent file system for Reboot to store its state (using RocksDB under
the covers). This is the developer's responsibility, and is
accomplished at or below the file system. RocksDB uses file locking to ensure that only one
process is attached to any given database.

See the [comparison](#comparison) below to get a sense of your options.


## Comparison

|                                   | `rbt serve` (EBS or equivalent)| `rbt serve` (EFS or equivalent)| Reboot Cloud                                    | Reboot Cloud Enterprise                   |
| :-------------------------------- | :----------------------------- | :----------------------------- | :---------------------------------------------- | :---------------------------------------- |
| Physical backups                  | yes                            | yes                            | yes                                             | yes                                       |
| Replication                       | within an availability zone    | within a region                | within a region                                 | within a region                           |
| High availability (failover time) | \~minutes                      | \~seconds                      | \~seconds                                       | \~seconds                                 |
| Vertical scaling                  | yes                            | yes                            | yes                                             | yes                                       |
| Horizontal scaling                | no                             | no                             | yes                                             | yes                                       |
| Availability                      | available now                  | available now                  | [available now](https://cloud.reboot.dev/)     | [Contact Reboot](mailto:team@reboot.dev)! |
