# Recovery closure

- Outcome: **truthful partial; not fully qualified**. The original owner ledger is empty. Original Unix wait custody is not recoverable. No three-repetition aggregate, minimum-memory qualification, or full parity claim is made.
- Verified 14 retained performance files / 72,000 raw RPC samples, plus 90,000 soak RPCs. Both shared correctness transcripts match 21 deterministic records exactly and one unordered concurrent record by membership/multiplicity. Both retained qualification restart transcripts report complete.
- Recovery stopped only verified owned containers, app before engine. Newly armed Docker waits matched exact terminal State exit codes and PID zero. Those recovery waits do not certify the prior owner's original waits.
- Controller per-container telemetry ends at **2026-10-20T08:52:20.010627Z**; last saved external-client event is **2026-10-20T08:53:49.684189Z**. The prior worker's final failure notice is 08:56:27Z, not a precise telemetry termination timestamp.
- Preserved original raw files unchanged, including zero-byte owner.json, all stdout/logs, per-RPC samples, resource/event records, retained source hashes, and previous worker transcript. The compact raw archive is 3,936,696 bytes; all 107 inventoried file hashes were verified inside the local and durable copies.
- Verified the independent Omarchy docker-save archive SHA256 and every OCI blob; runtime index digests match all three measured image IDs. Config-object digests differ legitimately from OCI index IDs. Original build-proof SHA256 matches the retained checkpoint.
- Preserved all six stopped owned volumes on Omarchy. Compared all 83 regular file hashes in the volume archive against the source VM before deletion.
- Only server **171335411** and owned Primary IPv4 **156588567** were targeted. The first cleanup execution reached an HTTP 422 while trying to delete the IP; that failed attempt's response body was not retained and no cause is inferred. A subsequent exact-ID readback confirmed **both resources HTTP 404**, as recorded in `cleanup.json`.
- CCX43 was not deleted or extended. Its existing **2026-10-20 20:46 CEST** deletion deadline remains unchanged. The tiny VM expiry/reminder jobs were not extended or modified; their exact-ID guards should observe already-deleted resources.
- No new capacity, registry, installs, rebuilds or repeat long qualification were used. The main publication worktree and PR were not modified or pushed. This evidence is delivered in local commits and a prerequisite-based Git bundle (requires source commit `d3b0642d0cb9962c839cfb57ebfd33f2a3cca389`).

## Durable files

Directory: `omarchy-jean:/home/ladin/.cache/hermes-reboot-parity/tiny-20261020/`

| File | SHA256 |
|---|---|
| images.docker-save.tar.gz | f444904864b2c2bc0ca658ff4ffa4df40ad4de7838f2aee1827fb9f16b2b0349 |
| build-proof.tar.gz | 28f9449617acecb2f304f664372ff53a21de759ac5d10e95db73e38b53691e66 |
| interrupted-volumes.tar.gz | 69461c5d51238a3b630617546efd707d76b7b9a3f3561bf712b25bae59afedd2 |
| partial-results/raw-evidence.tar.gz | da9aef3082f568c5420f24d00ac10d2c6988df5cd15cbe78c344c20099f732d4 |

`REPORT.md` contains the per-attempt whole-stack cgroup/RSS memory, throughput and independently verified p50/p95/p99. `summary.json` includes exact resource windows and coverage gaps. Final bundle commit/SHA are provided in the accompanying completion receipt to avoid a self-referential hash.
