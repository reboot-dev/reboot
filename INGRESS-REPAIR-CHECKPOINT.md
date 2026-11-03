# Ingress repair checkpoint — HOLD for independent delta review

Supersedes waiting instructions only. No timing clearance has been issued.

## Cause and retired failed attempt

Actual `results/app-only-tunnel.log` in the immutable old root says
`root@2.31.73.10: Permission denied (publickey).` The ingress public-key
fingerprint matched the installed key. Its authorized_keys options included
`permitlisten="none"`, which is not a valid authorized_keys `[host:]port` value.
Scoped repair removed that invalid key option and placed `PermitListen none`
in sshd_config for root connections from 2.29.27.53. Effective `sshd -T` verified
that directive. The same real ingress key now authenticates and forwards the
application; attempted engine forwarding and reverse forwarding are rejected.
The source-IP restriction, restrict, permitopen=127.0.0.1:50052 and forced false
command remain. Engine has no published port and remains on its internal network.

The original error WAS recorded: old owner.json has the assertion traceback,
end timestamp and all_original_unix_children_joined=true. Only gate remained
stale (`preflight`); no separate exit receipt existed. Original source and failed
results have not been rewritten. `failed-preflight-reconciliation.json` reads
all original recorded child PIDs absent, each already joined by the ORIGINAL
owner, no stacks, and exact client ID stopped/Pid0/exit143. No replacement waits
were invented. Original service MainPID0/failed/ExecMainStatus1 is preserved.

## Code delta and exercised evidence

Only controller terminal reporting, tunnel failure diagnostic and per-attempt
external client name changed; no SDK edits. Fatal exceptions atomically save
failed gate/failure_gate before cleanup; terminal owner state plus a separate
atomic exit-receipt records exit status and real join qualification.

Detached actual-container regression service completed exit0:
- `regression-fatal`: real SSH authentication failure => failed/preflight,
  atomic exit receipt=1, exact external client retirement and original waits joined.
- `regression-live`: actual full preflight, live application-only SSH tunnel,
  external client Rust AND Python engine-backed readiness, full restart readiness,
  exact original waits joined and terminal states verified. No benchmark case,
  soak, load batch or performance timings invoked. No fake readiness override.
- Negative real SSH tests reject engine destination and reverse listeners.

## Frozen replacement — DO NOT edit live source

Existing CCX43 root@2.29.27.53:
- Root `/root/tiny-repeat-ingress-fixed-20261020`
- Unit `tiny-repeat-owner-ingress-fixed-20261020.service`
- PID **866962**, PPID **1**, invocation `9d422a51264145f7bbc514393c275f6a`
- Gate `awaiting-parent-timing-clearance`; commands/children/stacks empty;
  no root TIMING-CLEARANCE.json. Regression-only clearance is confined to
  `regression-fatal/`, whose execute must fail before any stack.
- owner.py SHA256 `3317a66cbb86fd90785565595bf22b1d404051e4a3f0133fd669a3e11fd076d8`.
  All other prior tiny_repeat source hashes unchanged from a76b73a.
- `results/owner.json`, `owner.log`, regression logs and raw ledgers under root.

Unchanged workload deadline 2026-10-20 13:54:08.950012 UTC; cleanup reserve240s;
outer deadline 13:58:08.950012 UTC. Tiny VM171353819/IP156610171 at 2.31.73.10;
expiry21Oct09:47:45.204208UTC. CCX43 expiry20Oct18:46:13UTC. No new capacity,
image rebuild, registry access, swap or expiry changes. No new SDK/heavy batches.

Parent must independently review NEW controller/config delta, read back exact
waiting PID/hash/gate and quiet host, then issue fresh clearance in NEW root.
Prior approval is evidence for unchanged controller boundaries, not this delta.
No automatic clearance. Do not write clearance in old failed root.

Durable handoff is the existing Omarchy tiny-repeat-20261020 directory, in
`ingress-repair/`; external manifest contains candidate and evidence/bundle SHA256.
