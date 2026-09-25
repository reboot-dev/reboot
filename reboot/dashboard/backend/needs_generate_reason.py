"""Why `rbt generate` has to run, derived from what the two watches
recorded: what each API file declares against what its generated
module records."""
from rbt.dashboard.v1.dashboard_pb2 import Dashboard, DashboardGetResponse
from typing import Optional


def needs_generate_reason(
    state: Dashboard,
    *,
    generated_directory_named: bool,
) -> Optional['DashboardGetResponse.NeedsGenerateReason.ValueType']:
    """Why `rbt generate` has to run, and `None` when nothing says to
    run it: an API file's generated module is `MISSING`, or the file
    `CHANGED` since the module was generated from it, by the digest
    both record. A module recording no digest was generated before
    digests were, so whether it came from the file as it is is
    unknowable, which also reads as `CHANGED`; regenerating resolves
    it. `MISSING` outranks `CHANGED`.

    `generated_directory_named` says whether the developer's `.rbtrc`
    tells `rbt generate` where to write Python. One that does not is
    of an application whose code is generated some other way, such as
    by Bazel: there is nowhere to look for what was generated and
    nothing `rbt generate` could be run to fix, so nothing says to
    run it."""
    if not generated_directory_named:
        return None

    Reason = DashboardGetResponse.NeedsGenerateReason

    reason: Optional['DashboardGetResponse.NeedsGenerateReason.ValueType'
                    ] = None
    for module_name, digest in state.api_digests.items():
        if module_name not in state.generated:
            return Reason.MISSING
        module = state.generated[module_name]

        if not module.HasField('api_digest') or module.api_digest != digest:
            reason = Reason.CHANGED

    return reason
