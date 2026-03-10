# Deploy on Reboot Cloud

## Reboot Cloud

To deploy your Reboot app to production, you can use the [Reboot Cloud](https://cloud.reboot.dev/). The Reboot Cloud leverages Reboot's safety guarantees to automatically partition and deploy your application across a cluster of machines, providing automatic scaling and high availability!

```console
$ rbt cloud up --image-name=...
...
Application starting; your application will be available at:

  ${unique-id}.prod1.rbt.cloud:9991
```

[Join the waitlist](https://cloud.reboot.dev/) today, and [give us your feedback](https://reboot.dev/discord)
on the shape of the Reboot Cloud!

### Reboot Enterprise

For users with more stringent compliance requirements, the Reboot Cloud can also
be deployed on your enterprise's Kubernetes cluster, providing all the benefits
of Reboot Cloud on your own hardware.

[Contact Reboot](mailto:team@reboot.dev) for more information!

## Comparison

|                                   | `rbt serve` (EBS or equivalent)| `rbt serve` (EFS or equivalent)| Reboot Cloud                                    | Reboot Cloud Enterprise                   |
| :-------------------------------- | :----------------------------- | :----------------------------- | :---------------------------------------------- | :---------------------------------------- |
| Physical backups                  | yes                            | yes                            | yes                                             | yes                                       |
| Replication                       | within an availability zone    | within a region                | within a region                                 | within a region                           |
| High availability (failover time) | \~minutes                      | \~seconds                      | \~seconds                                       | \~seconds                                 |
| Vertical scaling                  | yes                            | yes                            | yes                                             | yes                                       |
| Horizontal scaling                | no                             | no                             | yes                                             | yes                                       |
| Availability                      | available now                  | available now                  | [Join the waitlist](https://cloud.reboot.dev/)! | [Contact Reboot](mailto:team@reboot.dev)! |
