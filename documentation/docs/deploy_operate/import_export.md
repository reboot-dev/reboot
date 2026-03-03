# Import & export

Reboot supports importing and exporting your application's data via the `rbt import` and `rbt export` commands.

## Use cases

Once your application is [deployed to production](/deploy_operate/where), importing and exporting data is critical for creating backups, as well as for exporting data into analytics (OLAP) systems for executing offline queries.

Because Reboot's support for import/export operates on "logical" snapshots (i.e. with no assumptions about the "physical" storage/filesystem layout that is in use), imports are also a great way to adopt Reboot for a new application, upsize or downsize your hosting, or to create test instances.

## Format

Data is exported as one [JSON lines file](https://jsonlines.org/) per database, with a fairly self-explanatory format.

The types of exported data are:
* The state for each of your data type instances themselves - _Useful for interoperating with OLAP systems._
* All [tasks](/develop/tasks) executed on behalf of states - _Useful for backups: if you have other use cases for exported tasks, [please let us know!](https://discord.com/invite/cRbdcS94Nr)_
* Idempotent mutations - _Useful for backups._

When importing data, any number of files are accepted and automatically partitioned
appropriately across the nodes of your Reboot cluster.

## Behavior
When importing:
* Any state included in the import that does not yet exist in the application
  is created. No methods are run, even if the state in question could normally
  only be created by calling a constructor method.
* Any state that's part of the import but also already exists in the application
  is overwritten with the imported state value.
* Any state that already exists in the application and isn't part of the import
  is left unchanged.

When exporting:
* All states, tasks, and idempotency keys in the application are exported. _If you need partial exports,
  [please let us know!](https://discord.com/invite/cRbdcS94Nr)_
* The export is _not_ a [consistent
  snapshot](https://en.wikipedia.org/wiki/Snapshot_isolation). If the export
  needs to be fully consistent, it is necessary to ensure that no writer
  methods are being run by the system at the time of the export. _If you need
  consistent, online exports, [please let us
  know!](https://discord.com/invite/cRbdcS94Nr)_.
