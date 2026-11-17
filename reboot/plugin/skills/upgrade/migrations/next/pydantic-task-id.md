## Pydantic APIs: `schedule()` returns, and `retrieve()` takes, a `reboot.api.TaskId`

Applies only to applications whose API is defined in pydantic
(`reboot.api`). In those, `ref.schedule(...).<method>(context)` now
returns a `reboot.api.TaskId` (fields `state_id: str` and
`task_uuid: str`) instead of a protobuf `rbt.v1alpha1.tasks_pb2.TaskId`,
`<State>.<Method>Task.retrieve(context, task_id=...)` takes one, and
the `task_id` property of a task handle is one.

If any file under `backend/` stores or passes the result of
`schedule()`, or calls `.retrieve(` on a `<State>.<Method>Task`:

- Replace fields that held the protobuf id (e.g. `str`, `bytes` or a
  hand-written model of its parts) with
  `Optional[TaskId] = Field(tag=<same tag>, default=None)`, importing
  `TaskId` from `reboot.api`, and drop any conversion to or from
  `tasks_pb2.TaskId`.
- Delete imports of `rbt.v1alpha1.tasks_pb2` that are no longer used.
