# CPX02 current-image checkpoint — blocked before runtime

This is **not a 1 GiB runtime result**, performance result, or minimum-memory claim. Runtime execution stopped at a tool approval boundary before the no-swap cgroup setup command executed. No application/engine containers have started on CPX02.

## Verified work

- PR216 OPEN and published branch both read back at `d3b0642d0cb9962c839cfb57ebfd33f2a3cca389`.
- Fresh Hetzner exact-name query: `cpx02`, 1 shared x86 vCPU, 1 GB, 20 GB local disk; `fsn1` available. Gross 24-hour server+IPv4 price calculated from API decimals: EUR **0.302016**, below approved EUR0.31 cap; VAT21%.
- Exactly one new VM created: **171335411**, IPv4 **2.31.73.10**, Primary IP **156588567**. Labels owner=jean, purpose=reboot-tiny-comparison, ephemeral=true, run=tiny-20261020, expires=2026-10-21.
- Guarded exact-ID deletion job **c29ab44e1fa6** read back enabled/scheduled at **2026-10-21T07:50:23.825401Z** (09:50:23 CEST); reminder **5f043f0b3f7c** at07:20:23Z. The deletion prompt verifies exact ownership/type/location/IP and confirms both resources404. No CCX43 extension.
- Fresh Ubuntu24.04 installed Docker29.1.3 on CPX02. `/proc/swaps` empty; kernel-reported RAM977784832bytes. No compiler installed there. Docker loaded immutable images whose IDs match CCX43.
- Isolated current source frozen under CCX43 `/home/benchbuild/.cache/tiny-current-src`; full source hash inventory retained. Six application tests passed, release build passed, fresh Rust Docker build passed, fresh Python packaging/build passed. Build owner synchronously waited all four command children. Existing cache lock checked/exclusively acquired; no prior frozen evidence modified.
- Python original example pin `5c332a2910122d6035799bfaf2a314bf1de830b8`; existing SDK/native artifact source `8574ccb0df9893274e69d1a19eca469dad56d779`. Original vendored example freshly copied; compatible generated API and pinned Bazel runfiles reused from qualified context. This is a fresh image package, **not a fresh Python SDK or C++ compilation**. Existing engine image explicitly reused.

## Immutable artifacts

| Role | Image ID |
|---|---|
| Fresh current Rust | `sha256:3dcf9d9976f76a63b3a290ef6cf15329f1f6148692c72604e5dc797a237f7db4` |
| Fresh Python package | `sha256:28241a509e8dbedda24bd2033ce556cc5648ddd02ef80bd349e417586fb84925` |
| Existing native engine | `sha256:1a73705b0771f9c861d9ba96509806849423a3d8bbff140b1261da76280460cd` |

Independent durable existing SSH host `omarchy-jean` (`maxbucek-orignal-omarchy`) had389GiB free. No new paid storage created. Private directory:

`/home/ladin/.cache/hermes-reboot-parity/tiny-20261020/`

- `images.docker-save.tar.gz`: **276983276bytes**, SHA256 `f444904864b2c2bc0ca658ff4ffa4df40ad4de7838f2aee1827fb9f16b2b0349`.
- `build-proof.tar.gz`: **18447395bytes**, SHA256 `28f9449617acecb2f304f664372ff53a21de759ac5d10e95db73e38b53691e66`. Contains frozen source tree, full file hashes, fresh build logs, source/binary/image receipts and executed build script.
- Both hashes read back independently after streaming transfer, without staging image data on the controller. The image archive was separately transferred to CPX02, SHA verified and `docker load` executed; all destination image IDs read back exactly.
- `tiny-identity.json`, `tiny-type-fresh.json`, plus final checkpoint readback retained in same durable directory.

CCX43 originals: `/home/benchbuild/.cache/tiny-current-evidence/`. Controller full receipts: `/home/openclaw/.hermes/profiles/jean/cache/scratch/tiny-{identity,type-fresh,checkpoint-readback,build-receipt}.json`.

## Actual blocker and handoff

The tool returned `pending_approval`, description **overwrite system config**, for the compound command creating the run-scoped CCX43 SSH client key and writing `/etc/systemd/system/tiny.slice.d/noswap.conf` with `MemorySwapMax=0`, then reloading/starting that slice on CPX02. Readback established the key was **not created**; do not assume either portion executed. Do not bypass the approval by rewriting the same change through another interface.

Parent must resolve the pending tool approval before continuing. Then establish private app-only SSH forwarding from CCX43 and run stacks sequentially with no initial additional memory cap, host+container swap disabled, correctness21exact+1multiset, retained restart/replay and readiness/OOM checks before bounded soak/3-repetition timing. If both succeed, exercise lower aggregate budgets; otherwise report genuine failure without larger rental or swap. None of those runtime gates has run yet.

New VM/IP are **still running**, not deleted. Exact guarded cleanup remains scheduled; do not claim billing stopped. After bounded results and retained-artifact verification, delete only these exact new IDs and read back both404. Existing CCX43 **171072439** deletion job `d19a2ef740bf` remains **2026-10-20T20:46:13+02:00**, reminder `289a1f675b65`18:46:13+02:00; both freshly read back unchanged. No registry, deployment, extra VM, volume, backup or snapshot was created.
