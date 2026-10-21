# Receipt-bound remote child: current contracts and bounded selection

Base: `be870386b539449327bfd33002e142bfa594a82b` (PR216).

## Authorities, not interchangeable stores

* Python `aio/state_managers.py:5602-5666,5668-5790` owns durable coordinator membership, definitive Prepare responses, retry and background Commit convergence. RPC failure is not definitive Abort. `6411-6526` defers actor state, tasks and receipts into native ParticipantPrepare, subject to nested ownership; `6528-6663` applies terminal participant decisions. Rust's legacy protocol, not Native2pc, is the relevant seam.
* Native `server/database.cc:3351-3453` applies actor/task/receipt mutations to the real RocksDB transaction and prepares it; `3457-3497` commits it. Abort rolls back native participant state. Neither an ordinary Store nor CompleteTask substitutes for this authority.
* A generated external root owns the automatic response receipt for its original actor, RPC and request. `runtime.rs::validate_bound_root_effects` requires that exact root-only receipt, without workflow scope or task IDs. Current-state authorization precedes cached replay in `codegen.rs::emit_transaction_flow`.
* The source task's journal and terminal CompleteTask CAS remain separate ACK boundaries. Declared clean-root errors require acknowledged child Abort, original native Abort and separate receipt Store under uninterrupted actor admission; `declared_transaction_store.rs` and `explicit_abort.rs` own these steps.
* The application gateway routes an outbound child by current legacy placement. Its original root ID/coordinator must survive routing; the root receipt key must **not** become a child replay key. A remote adapter owns only its own actor admission and pending participant, returns actual successful trailers, and reserves live Watch ownership. It does not own the root receipt or source journal.

## Selected narrow seam

Permit network dispatch from an actually admitted, registered, exclusive receipt-bound root-star through its counted method/target-bound generated scope. Strip only the root receipt key from the child request; retain original root transaction/coordinator identities and established network credential semantics. Keep local-ticket dispatch unchanged. Do not grant metadata-only/manual terminal authority, shared/factory/reusable/running-Cancel support, or descendant continuation on uncertainty.

Integrated proof must use independent application processes, independent real native Database/RocksDB processes, canonical placement routing and generated public Python transaction spawn/Wait. No fabricated participant receipt or ordinary Store composition path is acceptable.

## Foundation limit to retain explicitly

Rust's live root registration is not a crash-durable pre-membership registration. Immutable DecisionPut and placement do not authorize absence-to-Abort. A root crash before durable coordinator handoff with unknown remote membership remains a failed/unknown attempt, not an acknowledged declared terminal or permission to retry with a new identity. This slice must not claim arbitrary pre-Prepare recovery, Python coordinator retry equivalence, moving ownership or submitted-effect revocation. Post-commit receipt replay and post-handoff recovery are separate, testable contracts.
