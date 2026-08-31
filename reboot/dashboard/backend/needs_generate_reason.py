"""Why `rbt generate` has to run, derived from what the two watches
recorded: what each API file declares against what its generated
module records."""
from rbt.dashboard.v1.dashboard_pb2 import Dashboard, DashboardGetResponse
from typing import Optional


def needs_generate_reason(
    state: Dashboard,
) -> Optional['DashboardGetResponse.NeedsGenerateReason.ValueType']:
    """Why `rbt generate` has to run, and `None` when nothing says to
    run it: an API file's generated module is `MISSING`, or the file
    `CHANGED` since the module was generated from it, by the digest
    both record. A module recording no digest was generated before
    digests were, so whether it came from the file as it is is
    unknowable, which also reads as `CHANGED`; regenerating resolves
    it. `MISSING` outranks `CHANGED`."""
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
