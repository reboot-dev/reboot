# Deploy on your own

## `rbt serve`
`rbt serve` allows you to run your Reboot applications on your own
infrastructure. `rbt serve` is a self-service Reboot deployment, in contrast to
Reboot Cloud which is a fully managed service.

With `rbt serve` you deploy your application on a single machine, with support
for vertical scaling by using multiple cores. If your application needs to scale
beyond a single machine, [talk to Reboot](mailto:team@reboot.dev) about using
Reboot Cloud.

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
| Availability                      | available now                  | available now                  | [Join the waitlist](https://cloud.reboot.dev/)! | [Contact Reboot](mailto:team@reboot.dev)! |
