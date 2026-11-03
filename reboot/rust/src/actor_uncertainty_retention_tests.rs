// Registered gates normally expire at idle, but uncertainty must survive the
// last handle disappearing. These exercise the same registry as Database stores.
#[cfg(test)]
mod actor_uncertainty_retention_tests {
    use super::*;

    #[test]
    fn unknown_ack_survives_last_lease_and_gate_drop() {
        let endpoint = format!("uncertain-test://{}", Uuid::new_v4());
        let gate = same_actor_gate(&endpoint, "tests.Actor", "one");
        let weak = Arc::downgrade(&gate.inner);
        drop(gate.commit_attempt());
        assert!(gate.committed_revisions().borrow().1);
        drop(gate);
        let recovered = same_actor_gate(&endpoint, "tests.Actor", "one");
        assert!(Arc::ptr_eq(&weak.upgrade().unwrap(), &recovered.inner));
        assert!(recovered.committed_revisions().borrow().1);
        // Even an acknowledged unrelated control write cannot clear the latch.
        recovered.commit_attempt().checkpoint_acknowledged();
        recovered.commit_attempt().acknowledged();
        assert!(recovered.committed_revisions().borrow().1);
        assert!(
            !same_actor_gate(&endpoint, "tests.Actor", "two")
                .committed_revisions()
                .borrow()
                .1
        );
    }

    #[test]
    fn known_ack_and_no_durable_attempt_do_not_pin_idle_gates() {
        let endpoint = format!("certain-test://{}", Uuid::new_v4());
        for acknowledge in [false, true] {
            let gate = same_actor_gate(&endpoint, "tests.Actor", "one");
            let weak = Arc::downgrade(&gate.inner);
            if acknowledge {
                gate.commit_attempt().acknowledged();
            }
            drop(gate);
            assert!(weak.upgrade().is_none());
            assert!(
                !same_actor_gate(&endpoint, "tests.Actor", "one")
                    .committed_revisions()
                    .borrow()
                    .1
            );
        }
    }
}
